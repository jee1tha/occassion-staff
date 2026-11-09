import {
  parseJson,
  RefusedError,
  UnavailableError,
  type ModelReply,
  type ModelRequest,
  type Provider,
  type ProviderConfig,
} from "./types.ts";

/**
 * Any server that speaks POST /v1/chat/completions: Ollama, LM Studio, llama.cpp server,
 * vLLM, MLX, LocalAI. Asks for schema-constrained JSON; servers that ignore
 * `response_format` still get the schema in the prompt, and the router validates the reply.
 */
export class OpenAICompatibleProvider implements Provider {
  readonly config: ProviderConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(config: ProviderConfig, fetchImpl: typeof fetch = fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  async complete(model: string, req: ModelRequest): Promise<ModelReply> {
    const base = this.config.base_url!.replace(/\/+$/, "");
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.config.api_key_env) {
      const key = process.env[this.config.api_key_env];
      if (!key) throw new RefusedError(`${this.config.api_key_env} is not set`);
      headers.authorization = `Bearer ${key}`;
    }
    const body = {
      model,
      temperature: 0.2,
      stream: false,
      messages: [
        { role: "system", content: `${req.system}\n\nReply with JSON only, matching this schema:\n${JSON.stringify(req.schema)}` },
        { role: "user", content: req.prompt },
      ],
      response_format: { type: "json_schema", json_schema: { name: req.schemaName, schema: req.schema, strict: true } },
    };

    const started = Date.now();
    let res: Response;
    try {
      res = await this.fetchImpl(`${base}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(req.timeoutMs ?? 300_000),
      });
    } catch (e) {
      const code = (e as { cause?: { code?: string } }).cause?.code;
      const why =
        code === "ECONNREFUSED"
          ? "nothing is listening there. Is the server running?"
          : (e as Error).name === "TimeoutError"
            ? "timed out"
            : (e as Error).message;
      throw new UnavailableError(`${this.config.name} not reachable at ${base}: ${why}`);
    }
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      throw new UnavailableError(`${this.config.name} returned ${res.status}: ${text}`);
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    return {
      output: parseJson(content),
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
      apiEquivUsd: 0,
      latencyMs: Date.now() - started,
    };
  }
}
