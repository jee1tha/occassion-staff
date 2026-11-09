import type { z } from "zod";
import { callRoute, loadRegistry, type Call, type Registry } from "./router.ts";
import { LimitReachedError } from "./providers/types.ts";
import type { Sql } from "./db.ts";

/**
 * What an agent gets to work with. `ctx.ask("extract", {...})` sends a request to whatever
 * model the Growth desk routes that role to; the agent's code never knows which one.
 */
export class RunContext {
  readonly runId: number;
  readonly agentKey: string;
  private readonly reg: Registry;
  readonly used = new Map<string, Set<string>>();
  usedFallback = false;
  inputTokens = 0;
  outputTokens = 0;
  apiEquivUsd = 0;
  notes: string[] = [];

  constructor(reg: Registry, agentKey: string, runId: number) {
    this.reg = reg;
    this.agentKey = agentKey;
    this.runId = runId;
  }

  async ask<T extends z.ZodType>(role: string, call: Call<T>): Promise<z.infer<T>> {
    const route = this.reg.routes.get(`${this.agentKey}/${role}`);
    if (!route) throw new Error(`No model is set for ${this.agentKey}, role "${role}". Add one on the Models page.`);
    const r = await callRoute(this.reg, route, call);
    this.inputTokens += r.inputTokens;
    this.outputTokens += r.outputTokens;
    this.apiEquivUsd += r.apiEquivUsd;
    if (!this.used.has(r.providerKey)) this.used.set(r.providerKey, new Set());
    this.used.get(r.providerKey)!.add(r.model);
    if (r.usedFallback && !this.usedFallback) {
      this.usedFallback = true;
      this.notes.push(`Used the fallback, ${r.providerName} (${r.model}), because ${r.fallbackReason ?? "the primary failed"}`);
    }
    return r.output;
  }
}

export type AgentResult = { items: number; summary: string };
export type Agent = (ctx: RunContext) => Promise<AgentResult>;

export type RunOutcome = { runId: number; status: "succeeded" | "failed" | "limit_reached" | "skipped"; detail: string };

/** Runs one agent and records it in growth.agent_runs, whatever happens. */
export async function runAgent(sql: Sql, agentKey: string, version: string, agent: Agent): Promise<RunOutcome> {
  const [a] = await sql<{ paused: boolean; paused_reason: string | null }[]>`
    select paused, paused_reason from growth.agents where key = ${agentKey}`;
  if (!a) throw new Error(`Unknown agent ${agentKey}`);

  if (a.paused) {
    const [r] = await sql<{ id: number }[]>`
      insert into growth.agent_runs (agent_key, version, status, ended_at, summary)
      values (${agentKey}, ${version}, 'skipped', now(), ${`Paused: ${a.paused_reason ?? "by you"}`})
      returning id::int`;
    return { runId: r.id, status: "skipped", detail: "Agent is paused" };
  }

  const [r] = await sql<{ id: number }[]>`
    insert into growth.agent_runs (agent_key, version) values (${agentKey}, ${version}) returning id::int`;
  const ctx = new RunContext(await loadRegistry(sql), agentKey, r.id);

  let status: RunOutcome["status"];
  let summary: string | null = null;
  let error: string | null = null;
  let items = 0;
  try {
    const res = await agent(ctx);
    status = "succeeded";
    items = res.items;
    summary = [res.summary, ...ctx.notes].join(" ");
  } catch (e) {
    status = e instanceof LimitReachedError ? "limit_reached" : "failed";
    error = `${(e as Error).name}: ${(e as Error).message}`.slice(0, 1000);
    summary = ctx.notes.join(" ") || null;
  }

  await sql`
    update growth.agent_runs set
      ended_at = now(), status = ${status}, summary = ${summary}, error = ${error}, items_out = ${items},
      input_tokens = ${ctx.inputTokens}, output_tokens = ${ctx.outputTokens}, api_equiv_usd = ${ctx.apiEquivUsd},
      provider_key = ${[...ctx.used.keys()].join(", ") || null},
      model = ${[...ctx.used.values()].flatMap((s) => [...s]).join(", ") || null},
      used_fallback = ${ctx.usedFallback}
    where id = ${r.id}`;
  return { runId: r.id, status, detail: error ?? summary ?? "" };
}
