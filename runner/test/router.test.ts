import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { assertAllowed, isLocalUrl } from "../src/guard.ts";
import { callRoute, type Registry, type Route } from "../src/router.ts";
import { CommandProvider } from "../src/providers/command.ts";
import { OpenAICompatibleProvider } from "../src/providers/openai-compatible.ts";
import { subscriptionEnv } from "../src/providers/claude-code.ts";
import {
  BadOutputError,
  LimitReachedError,
  RefusedError,
  UnavailableError,
  type ModelReply,
  type Provider,
  type ProviderConfig,
} from "../src/providers/types.ts";

const cfg = (over: Partial<ProviderConfig> = {}): ProviderConfig => ({
  key: "p",
  name: "Test",
  kind: "command",
  billing: "local",
  base_url: null,
  command: ["true"],
  api_key_env: null,
  models: ["m"],
  enabled: true,
  ...over,
});

/** A provider that replays scripted replies or errors, and counts calls. */
function fake(key: string, script: (Error | unknown)[], over: Partial<ProviderConfig> = {}) {
  const p = {
    config: cfg({ key, name: key, ...over }),
    calls: [] as string[],
    async complete(_model: string, req: { prompt: string }): Promise<ModelReply> {
      p.calls.push(req.prompt);
      const next = script.shift();
      if (next instanceof Error) throw next;
      return { output: next, inputTokens: 10, outputTokens: 5, apiEquivUsd: 0, latencyMs: 1 };
    },
  };
  return p satisfies Provider;
}

const route = (over: Partial<Route> = {}): Route => ({
  agent_key: "scout",
  role: "main",
  provider_key: "a",
  model: "m1",
  fallback_provider_key: "b",
  fallback_model: "m2",
  ...over,
});

const reg = (...providers: Provider[]): Registry => ({
  providers: new Map(providers.map((p) => [p.config.key, p])),
  routes: new Map(),
  allowPaid: false,
});

const Out = z.object({ in_scope: z.boolean(), reason: z.string() });
const call = { system: "s", prompt: "classify", schema: Out };

test("uses the primary when it answers", async () => {
  const a = fake("a", [{ in_scope: true, reason: "florist" }]);
  const b = fake("b", []);
  const r = await callRoute(reg(a, b), route(), call);
  assert.deepEqual(r.output, { in_scope: true, reason: "florist" });
  assert.equal(r.providerKey, "a");
  assert.equal(r.usedFallback, false);
  assert.equal(b.calls.length, 0);
});

test("falls back when the primary hits its usage limit", async () => {
  const a = fake("a", [new LimitReachedError("You've hit your session limit")]);
  const b = fake("b", [{ in_scope: false, reason: "retail" }]);
  const r = await callRoute(reg(a, b), route(), call);
  assert.equal(r.providerKey, "b");
  assert.equal(r.model, "m2");
  assert.equal(r.usedFallback, true);
  assert.match(r.fallbackReason!, /session limit/);
});

test("falls back when the primary is unreachable", async () => {
  const a = fake("a", [new UnavailableError("connection refused")]);
  const b = fake("b", [{ in_scope: true, reason: "x" }]);
  assert.equal((await callRoute(reg(a, b), route(), call)).providerKey, "b");
});

test("a limit with no fallback stops the call", async () => {
  const a = fake("a", [new LimitReachedError("weekly limit")]);
  await assert.rejects(callRoute(reg(a), route({ fallback_provider_key: null, fallback_model: null }), call), LimitReachedError);
});

test("a guardrail refusal is never routed around", async () => {
  const a = fake("a", [], { billing: "paid" });
  const b = fake("b", [{ in_scope: true, reason: "x" }]);
  await assert.rejects(callRoute(reg(a, b), route(), call), RefusedError);
  assert.equal(b.calls.length, 0);
});

test("a reply that misses the schema gets one repair attempt", async () => {
  const a = fake("a", [{ in_scope: "yes" }, { in_scope: true, reason: "fixed" }]);
  const r = await callRoute(reg(a), route({ fallback_provider_key: null, fallback_model: null }), call);
  assert.equal(r.output.reason, "fixed");
  assert.equal(a.calls.length, 2);
  assert.match(a.calls[1], /did not match the schema/);
  assert.equal(r.inputTokens, 20);
});

test("a second bad reply is an error, not a fallback", async () => {
  const a = fake("a", [{ nope: 1 }, { nope: 2 }]);
  const b = fake("b", [{ in_scope: true, reason: "x" }]);
  await assert.rejects(callRoute(reg(a, b), route(), call), BadOutputError);
  assert.equal(b.calls.length, 0);
});

test("local means this machine or the private network", () => {
  for (const u of ["http://127.0.0.1:11434/v1", "http://localhost:1234/v1", "http://192.168.1.20:8080/v1", "http://[::1]:8000", "http://mac-studio.local:11434/v1", "http://10.0.0.5/v1"]) {
    assert.ok(isLocalUrl(u), u);
  }
  for (const u of ["https://openrouter.ai/api/v1", "https://api.openai.com/v1", "http://8.8.8.8/v1", "not a url"]) {
    assert.ok(!isLocalUrl(u), u);
  }
});

test("a 'local' provider pointing at the internet is refused", () => {
  assert.throws(
    () => assertAllowed(cfg({ kind: "openai_compatible", base_url: "https://openrouter.ai/api/v1", command: null }), { allowPaid: false }),
    /labelled local/,
  );
  assert.throws(() => assertAllowed(cfg({ billing: "paid" }), { allowPaid: false }), /paid/);
  assert.doesNotThrow(() => assertAllowed(cfg({ billing: "paid" }), { allowPaid: true }));
  assert.throws(() => assertAllowed(cfg({ enabled: false }), { allowPaid: false }), /switched off/);
});

test("Claude runs never see API billing variables", () => {
  const env = subscriptionEnv({ PATH: "/bin", ANTHROPIC_API_KEY: "sk-x", ANTHROPIC_AUTH_TOKEN: "t", CLAUDE_CODE_USE_BEDROCK: "1" });
  assert.deepEqual(env, { PATH: "/bin" });
});

test("OpenAI-compatible: sends the schema and parses a fenced reply", async () => {
  let sent: { model: string; response_format: { json_schema: { name: string } } } | undefined;
  const fetchStub = (async (_url: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body));
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: '```json\n{"in_scope": true, "reason": "caterer"}\n```' } }],
        usage: { prompt_tokens: 40, completion_tokens: 9 },
      }),
    );
  }) as typeof fetch;
  const p = new OpenAICompatibleProvider(cfg({ kind: "openai_compatible", base_url: "http://127.0.0.1:11434/v1/", command: null }), fetchStub);
  const r = await p.complete("qwen3:8b", { system: "s", prompt: "p", schema: { type: "object" }, schemaName: "classify" });
  assert.deepEqual(r.output, { in_scope: true, reason: "caterer" });
  assert.equal(r.inputTokens, 40);
  assert.equal(sent?.model, "qwen3:8b");
  assert.equal(sent?.response_format.json_schema.name, "classify");
});

test("OpenAI-compatible: a server that isn't running is 'unavailable'", async () => {
  const p = new OpenAICompatibleProvider(cfg({ kind: "openai_compatible", base_url: "http://127.0.0.1:9/v1", command: null }));
  await assert.rejects(p.complete("m", { system: "s", prompt: "p", schema: {}, schemaName: "x", timeoutMs: 2000 }), UnavailableError);
});

test("command provider: the example local agent fills the schema", async () => {
  const p = new CommandProvider(cfg({ command: [process.execPath, "runner/examples/echo-agent.ts"] }));
  const schema = z.toJSONSchema(Out) as Record<string, unknown>;
  const r = await p.complete("echo", { system: "s", prompt: "p", schema, schemaName: "x" });
  assert.deepEqual(r.output, { in_scope: true, reason: "pong" });
});

test("command provider: exit 75 means the agent hit its limit", async () => {
  const p = new CommandProvider(cfg({ command: [process.execPath, "-e", "process.exit(75)"] }));
  await assert.rejects(p.complete("m", { system: "s", prompt: "p", schema: {}, schemaName: "x" }), LimitReachedError);
});
