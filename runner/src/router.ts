import { z } from "zod";
import { assertAllowed, assertClaudeSubscription } from "./guard.ts";
import { createProvider } from "./providers/index.ts";
import {
  BadOutputError,
  LimitReachedError,
  UnavailableError,
  type Provider,
  type ProviderConfig,
} from "./providers/types.ts";
import type { Sql } from "./db.ts";

export type Route = {
  agent_key: string;
  role: string;
  provider_key: string;
  model: string;
  fallback_provider_key: string | null;
  fallback_model: string | null;
};

export type Call<T extends z.ZodType> = {
  system: string;
  prompt: string;
  schema: T;
  schemaName?: string;
  timeoutMs?: number;
};

export type CallResult<T> = {
  output: T;
  providerKey: string;
  providerName: string;
  model: string;
  usedFallback: boolean;
  inputTokens: number;
  outputTokens: number;
  apiEquivUsd: number;
  /** Why the primary was skipped, when the fallback answered. */
  fallbackReason?: string;
};

export type Registry = {
  providers: Map<string, Provider>;
  routes: Map<string, Route>;
  allowPaid: boolean;
};

export async function loadRegistry(sql: Sql): Promise<Registry> {
  const [providers, routes, [guard]] = await Promise.all([
    sql<ProviderConfig[]>`
      select key, name, kind, billing, base_url, command, api_key_env, models, enabled from growth.model_providers`,
    sql<Route[]>`
      select agent_key, role, provider_key, model, fallback_provider_key, fallback_model from growth.agent_models`,
    sql<{ allow_paid: boolean | null }[]>`
      select (value ->> 'allow_paid_models')::boolean as allow_paid from growth.settings where key = 'guardrails'`,
  ]);
  return {
    providers: new Map(providers.map((p) => [p.key, createProvider(p)])),
    routes: new Map(routes.map((r) => [`${r.agent_key}/${r.role}`, r])),
    allowPaid: guard?.allow_paid ?? false,
  };
}

/**
 * Calls the route's primary model, validates the reply against the schema, and falls back
 * when the primary is out of usage or unreachable. A reply that fails the schema gets one
 * repair attempt on the same model before the error surfaces.
 */
export async function callRoute<T extends z.ZodType>(
  reg: Registry,
  route: Route,
  call: Call<T>,
): Promise<CallResult<z.infer<T>>> {
  const attempts: { provider: string; model: string }[] = [{ provider: route.provider_key, model: route.model }];
  if (route.fallback_provider_key && route.fallback_model) {
    attempts.push({ provider: route.fallback_provider_key, model: route.fallback_model });
  }

  let reason: string | undefined;
  for (const [i, a] of attempts.entries()) {
    const provider = reg.providers.get(a.provider);
    if (!provider) throw new Error(`Route ${route.agent_key}/${route.role} names unknown provider ${a.provider}`);
    const isLast = i === attempts.length - 1;
    try {
      assertAllowed(provider.config, { allowPaid: reg.allowPaid });
      if (provider.config.kind === "claude_code") await assertClaudeSubscription();
      const r = await completeValidated(provider, a.model, call);
      return { ...r, providerKey: a.provider, providerName: provider.config.name, model: a.model, usedFallback: i > 0, fallbackReason: reason };
    } catch (e) {
      // Only capacity problems hand over to the fallback. Guardrail refusals and bad output
      // are real problems with this route and must show up in the run log.
      const recoverable = e instanceof LimitReachedError || e instanceof UnavailableError;
      if (!recoverable || isLast) throw e;
      reason = (e as Error).message;
    }
  }
  throw new Error("unreachable");
}

async function completeValidated<T extends z.ZodType>(provider: Provider, model: string, call: Call<T>) {
  const jsonSchema = z.toJSONSchema(call.schema, { target: "draft-7" }) as Record<string, unknown>;
  delete jsonSchema.$schema;
  const req = {
    system: call.system,
    prompt: call.prompt,
    schema: jsonSchema,
    schemaName: call.schemaName ?? "reply",
    timeoutMs: call.timeoutMs,
  };
  let inputTokens = 0;
  let outputTokens = 0;
  let apiEquivUsd = 0;
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt =
      attempt === 0
        ? req.prompt
        : `${req.prompt}\n\nYour previous reply did not match the schema (${lastError}). Reply again with JSON only.`;
    let reply;
    try {
      reply = await provider.complete(model, { ...req, prompt });
    } catch (e) {
      if (e instanceof BadOutputError && attempt === 0) {
        lastError = e.message;
        continue;
      }
      throw e;
    }
    inputTokens += reply.inputTokens;
    outputTokens += reply.outputTokens;
    apiEquivUsd += reply.apiEquivUsd;
    const parsed = call.schema.safeParse(reply.output);
    if (parsed.success) return { output: parsed.data as z.infer<T>, inputTokens, outputTokens, apiEquivUsd };
    lastError = parsed.error.issues.map((i) => `${i.path.join(".") || "reply"}: ${i.message}`).join("; ").slice(0, 300);
  }
  throw new BadOutputError(`Reply did not match the schema after a retry: ${lastError}`, "");
}
