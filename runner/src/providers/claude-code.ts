import { spawn } from "node:child_process";
import {
  BadOutputError,
  LimitReachedError,
  UnavailableError,
  type ModelReply,
  type ModelRequest,
  type Provider,
  type ProviderConfig,
} from "./types.ts";

/**
 * Headless Claude Code (`claude -p`) on the Claude subscription.
 *
 * Variables that would switch billing to the API, Bedrock or Vertex are removed from the
 * child environment, so a stray key in your shell can never turn a run into a paid one.
 */
const BILLING_ENV = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_USE_FOUNDRY",
];

const LIMIT_PATTERN = /(session|weekly|usage|rate)[ -]limit|hit your .*limit|limit (reached|resets)/i;

export function subscriptionEnv(env: NodeJS.ProcessEnv = process.env) {
  const clean = { ...env };
  for (const k of BILLING_ENV) delete clean[k];
  return clean;
}

type ResultJson = {
  is_error?: boolean;
  subtype?: string;
  result?: string;
  structured_output?: unknown;
  total_cost_usd?: number;
  api_error_status?: number | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
};

export class ClaudeCodeProvider implements Provider {
  readonly config: ProviderConfig;
  private readonly bin: string;
  private readonly maxBudgetUsd: number;

  constructor(config: ProviderConfig, opts: { bin?: string; maxBudgetUsd?: number } = {}) {
    this.config = config;
    this.bin = opts.bin ?? process.env.CLAUDE_BIN ?? "claude";
    this.maxBudgetUsd = opts.maxBudgetUsd ?? 1;
  }

  async complete(model: string, req: ModelRequest): Promise<ModelReply> {
    const args = [
      "-p",
      "--output-format", "json",
      "--model", model,
      "--system-prompt", req.system,
      "--json-schema", JSON.stringify(req.schema),
      "--tools", "",                    // the runner owns all tools; the model only reads and writes text
      "--no-session-persistence",
      "--setting-sources", "",          // ignore your personal hooks and settings
      "--strict-mcp-config",            // and your MCP servers
      "--max-budget-usd", String(this.maxBudgetUsd), // runaway guard on the list-price estimate
    ];
    const started = Date.now();
    const { code, stdout, stderr } = await run(this.bin, args, req.prompt, req.timeoutMs ?? 300_000);
    const latencyMs = Date.now() - started;

    let json: ResultJson | undefined;
    try {
      json = JSON.parse(stdout) as ResultJson;
    } catch {
      /* fall through to error handling below */
    }
    const text = `${json?.result ?? ""}\n${stderr}\n${json ? "" : stdout}`;
    if (LIMIT_PATTERN.test(text)) throw new LimitReachedError(firstLine(text));
    if (!json) throw new UnavailableError(`claude exited ${code}: ${firstLine(stderr || stdout) || "no output"}`);
    if (json.is_error || code !== 0) {
      const msg = firstLine(json.result ?? stderr) || json.subtype || `exit ${code}`;
      if (json.api_error_status && json.api_error_status >= 500) throw new UnavailableError(msg);
      throw new UnavailableError(`claude: ${msg}`);
    }
    if (json.structured_output === undefined) throw new BadOutputError("No structured output", json.result ?? "");

    const u = json.usage ?? {};
    return {
      output: json.structured_output,
      inputTokens: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
      outputTokens: u.output_tokens ?? 0,
      apiEquivUsd: json.total_cost_usd ?? 0,
      latencyMs,
    };
  }
}

function firstLine(s: string) {
  return s.trim().split("\n").find((l) => l.trim())?.trim().slice(0, 300) ?? "";
}

function run(bin: string, args: string[], stdin: string, timeoutMs: number) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(bin, args, { env: subscriptionEnv(), stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new UnavailableError(`claude timed out after ${Math.round(timeoutMs / 1000)} s`));
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new UnavailableError(`Could not start ${bin}: ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(stdin);
  });
}
