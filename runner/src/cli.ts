import { execFileSync } from "node:child_process";
import { z } from "zod";
import { sql } from "./db.ts";
import { agents } from "./agents/index.ts";
import { assertAllowed, assertClaudeSubscription } from "./guard.ts";
import { loadRegistry } from "./router.ts";
import { runAgent } from "./run.ts";

const USAGE = `Usage:
  node src/cli.ts providers                    List model providers and their last check
  node src/cli.ts ping [provider] [--model m]  Send a tiny test request (all enabled providers if none given)
  node src/cli.ts run <agent>                  Run one agent and log it`;

const Pong = z.object({ ok: z.boolean(), echo: z.string() });

async function main(argv: string[]) {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "providers":
      return providers();
    case "ping": {
      const i = rest.indexOf("--model");
      const model = i >= 0 ? rest[i + 1] : undefined;
      const key = rest.find((a, j) => !a.startsWith("--") && rest[j - 1] !== "--model");
      return ping(key, model);
    }
    case "run":
      if (!rest[0]) break;
      return run(rest[0]);
  }
  console.log(USAGE);
  return 1;
}

async function providers() {
  const rows = await sql<
    { key: string; name: string; kind: string; billing: string; enabled: boolean; last_ok: boolean | null; last_detail: string | null }[]
  >`select key, name, kind, billing, enabled, last_ok, last_detail from growth.model_providers order by key`;
  console.table(
    rows.map((r) => ({
      key: r.key,
      name: r.name,
      kind: r.kind,
      billing: r.billing,
      enabled: r.enabled,
      last_check: r.last_ok === null ? "never" : r.last_ok ? "ok" : `failed: ${r.last_detail}`,
    })),
  );
  return 0;
}

async function ping(only?: string, modelArg?: string) {
  const reg = await loadRegistry(sql);
  const targets = [...reg.providers.values()].filter((p) => (only ? p.config.key === only : p.config.enabled));
  if (only && targets.length === 0) {
    console.error(`No provider called ${only}`);
    return 1;
  }
  let failures = 0;
  for (const p of targets) {
    const model = modelArg ?? p.config.models[0];
    const started = Date.now();
    let ok = false;
    let detail: string;
    try {
      if (!model) throw new Error("No model id listed for this provider");
      // A ping may test a provider before you switch it on; every billing rule still applies.
      assertAllowed({ ...p.config, enabled: true }, { allowPaid: reg.allowPaid });
      if (p.config.kind === "claude_code") await assertClaudeSubscription();
      const jsonSchema = z.toJSONSchema(Pong, { target: "draft-7" }) as Record<string, unknown>;
      delete jsonSchema.$schema;
      const reply = await p.complete(model, {
        system: "You are a health check. Reply with JSON only.",
        prompt: 'Reply with ok set to true and echo set to "pong".',
        schema: jsonSchema,
        schemaName: "pong",
        timeoutMs: 120_000,
      });
      const parsed = Pong.safeParse(reply.output);
      ok = parsed.success && parsed.data.ok;
      detail = ok
        ? `${model} answered in ${(reply.latencyMs / 1000).toFixed(1)} s`
        : `${model} answered but not in the expected shape`;
    } catch (e) {
      detail = (e as Error).message.slice(0, 300);
    }
    const latency = Date.now() - started;
    await sql`
      update growth.model_providers
      set last_checked_at = now(), last_ok = ${ok}, last_latency_ms = ${latency}, last_detail = ${detail}
      where key = ${p.config.key}`;
    console.log(`${ok ? "ok    " : "FAILED"} ${p.config.key}: ${detail}`);
    if (!ok) failures++;
  }
  return failures ? 1 : 0;
}

async function run(key: string) {
  const agent = agents[key];
  if (!agent) {
    console.error(`${key} isn't built yet. Built agents: ${Object.keys(agents).join(", ") || "none"}`);
    return 1;
  }
  const outcome = await runAgent(sql, key, gitVersion(), agent);
  console.log(`${outcome.status}: ${outcome.detail}`);
  // Exit 75 (EX_TEMPFAIL) tells the scheduler the usage limit stopped the run.
  return outcome.status === "succeeded" || outcome.status === "skipped" ? 0 : outcome.status === "limit_reached" ? 75 : 1;
}

function gitVersion() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "dev";
  }
}

const code = await main(process.argv.slice(2)).catch((e) => {
  console.error((e as Error).message);
  return 1;
});
await sql.end();
process.exit(code);
