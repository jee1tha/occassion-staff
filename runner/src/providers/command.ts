import { spawn } from "node:child_process";
import { resolve } from "node:path";
import {
  BadOutputError,
  LimitReachedError,
  parseJson,
  UnavailableError,
  type ModelReply,
  type ModelRequest,
  type Provider,
  type ProviderConfig,
} from "./types.ts";

/**
 * Plug in any local program or agent.
 *
 * The runner starts the command from the repo root and writes one JSON request to stdin:
 *   { "model": "...", "system": "...", "prompt": "...", "schema": {...}, "schema_name": "..." }
 * The program prints one JSON reply to stdout and exits 0:
 *   { "output": {...matches schema...}, "input_tokens": 0, "output_tokens": 0 }
 * Exit code 75 means "usage limit reached" (the runner stops or uses the fallback).
 * Any other non-zero exit means "unavailable". Anything on stderr is kept for the run log.
 */
export const LIMIT_EXIT_CODE = 75;

export class CommandProvider implements Provider {
  readonly config: ProviderConfig;
  private readonly cwd: string;

  constructor(config: ProviderConfig, cwd = resolve(import.meta.dirname, "../../..")) {
    this.config = config;
    this.cwd = cwd;
  }

  async complete(model: string, req: ModelRequest): Promise<ModelReply> {
    const [bin, ...args] = this.config.command!;
    const payload = JSON.stringify({
      model,
      system: req.system,
      prompt: req.prompt,
      schema: req.schema,
      schema_name: req.schemaName,
    });
    const started = Date.now();
    const { code, stdout, stderr } = await new Promise<{ code: number | null; stdout: string; stderr: string }>(
      (ok, fail) => {
        const child = spawn(bin, args, { cwd: this.cwd, stdio: ["pipe", "pipe", "pipe"] });
        let out = "";
        let err = "";
        const timer = setTimeout(() => {
          child.kill("SIGTERM");
          fail(new UnavailableError(`${this.config.name} timed out`));
        }, req.timeoutMs ?? 300_000);
        child.stdout.on("data", (d) => (out += d));
        child.stderr.on("data", (d) => (err += d));
        child.on("error", (e) => {
          clearTimeout(timer);
          fail(new UnavailableError(`Could not start ${bin}: ${e.message}`));
        });
        child.on("close", (c) => {
          clearTimeout(timer);
          ok({ code: c, stdout: out, stderr: err });
        });
        child.stdin.end(payload);
      },
    );
    const detail = stderr.trim().split("\n").pop()?.slice(0, 300) ?? "";
    if (code === LIMIT_EXIT_CODE) throw new LimitReachedError(detail || `${this.config.name} reported its limit`);
    if (code !== 0) throw new UnavailableError(`${this.config.name} exited ${code}${detail ? `: ${detail}` : ""}`);

    const reply = parseJson(stdout) as { output?: unknown; input_tokens?: number; output_tokens?: number };
    if (reply === null || typeof reply !== "object" || !("output" in reply)) {
      throw new BadOutputError('Reply must be an object with an "output" field', stdout);
    }
    return {
      output: reply.output,
      inputTokens: reply.input_tokens ?? 0,
      outputTokens: reply.output_tokens ?? 0,
      apiEquivUsd: 0,
      latencyMs: Date.now() - started,
    };
  }
}
