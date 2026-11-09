import type { Agent } from "../run.ts";

/**
 * Agents by key. Each one is plain code that calls `ctx.ask(role, ...)` for any step that
 * needs a model; which model answers is set per role on the Growth desk Models page.
 * Scout and Enricher are the next to be built (plan phase P1).
 */
export const agents: Record<string, Agent> = {};
