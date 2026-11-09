/**
 * The one contract every model or local agent must meet: text in, JSON out.
 *
 * Agents never call a vendor SDK. The runner's own code does the fetching, the database
 * writes and the grounding checks; a model is only asked to read, judge or draft, and to
 * reply as JSON matching a schema. That is what makes any model swappable: Claude via the
 * subscription, a local model, or your own agent program.
 */

export type ModelRequest = {
  system: string;
  prompt: string;
  /** JSON Schema the reply must match. */
  schema: Record<string, unknown>;
  /** Short name for the schema, used by OpenAI-style servers. */
  schemaName: string;
  timeoutMs?: number;
};

export type ModelReply = {
  output: unknown;
  inputTokens: number;
  outputTokens: number;
  /** List-price estimate for Claude runs. 0 for local models. Never a charge on a subscription. */
  apiEquivUsd: number;
  latencyMs: number;
};

export type ProviderConfig = {
  key: string;
  name: string;
  kind: "claude_code" | "openai_compatible" | "command";
  billing: "subscription" | "local" | "paid";
  base_url: string | null;
  command: string[] | null;
  api_key_env: string | null;
  models: string[];
  enabled: boolean;
};

export interface Provider {
  readonly config: ProviderConfig;
  complete(model: string, req: ModelRequest): Promise<ModelReply>;
}

/** The Claude plan's session or weekly limit was hit. Stop, or hand over to the fallback. */
export class LimitReachedError extends Error {
  override name = "LimitReachedError";
}

/** The provider couldn't be reached or crashed: server not running, model not pulled, timeout. */
export class UnavailableError extends Error {
  override name = "UnavailableError";
}

/** The provider answered, but not with JSON matching the schema. */
export class BadOutputError extends Error {
  override name = "BadOutputError";
  readonly raw: string;
  constructor(message: string, raw: string) {
    super(message);
    this.raw = raw;
  }
}

/** A guardrail refused the call before anything was sent. */
export class RefusedError extends Error {
  override name = "RefusedError";
}

export function parseJson(raw: string): unknown {
  const trimmed = raw.trim();
  // Small local models often wrap JSON in a code fence or add a sentence around it.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : trimmed.slice(Math.max(0, trimmed.search(/[[{]/)));
  try {
    return JSON.parse(candidate);
  } catch {
    throw new BadOutputError("Reply was not valid JSON", raw);
  }
}
