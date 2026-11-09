"use client";

import { useActionState, useState } from "react";
import { saveProvider, type FormState } from "./actions";

export type ProviderDraft = {
  key: string;
  name: string;
  kind: "openai_compatible" | "command";
  billing: "local" | "paid";
  base_url: string;
  command: string;
  api_key_env: string;
  models: string;
  notes: string;
};

const EMPTY: ProviderDraft = {
  key: "",
  name: "",
  kind: "openai_compatible",
  billing: "local",
  base_url: "",
  command: "",
  api_key_env: "",
  models: "",
  notes: "",
};

const PRESETS: { label: string; draft: Partial<ProviderDraft> }[] = [
  { label: "Ollama", draft: { key: "ollama-2", name: "Ollama", base_url: "http://127.0.0.1:11434/v1", models: "qwen3:8b" } },
  { label: "LM Studio", draft: { key: "lmstudio-2", name: "LM Studio", base_url: "http://127.0.0.1:1234/v1" } },
  { label: "llama.cpp server", draft: { key: "llamacpp", name: "llama.cpp server", base_url: "http://127.0.0.1:8080/v1", models: "default" } },
  { label: "vLLM or MLX", draft: { key: "vllm", name: "vLLM", base_url: "http://127.0.0.1:8000/v1" } },
  {
    label: "Your own agent",
    draft: { key: "my-agent", name: "My local agent", kind: "command", command: "node path/to/agent.ts", models: "default" },
  },
];

const input = "w-full rounded-sm border border-rule bg-paper px-2 py-1.5 text-sm outline-none focus:border-signal";

export function ProviderForm({ initial, mode }: { initial?: ProviderDraft; mode: "create" | "edit" }) {
  const [d, setD] = useState<ProviderDraft>(initial ?? EMPTY);
  const [state, action, pending] = useActionState<FormState, FormData>(saveProvider, {});
  const set = (k: keyof ProviderDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setD({ ...d, [k]: e.target.value });

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="mode" value={mode} />
      {mode === "create" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink-3">Start from</span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setD({ ...EMPTY, ...p.draft })}
              className="rounded-sm border border-rule px-2 py-1 hover:bg-sunk"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Name
          <input name="name" value={d.name} onChange={set("name")} className={input} required />
        </label>
        <label className="text-sm">
          Short id
          <span className="block text-xs text-ink-3">Used in logs. Can&apos;t change later.</span>
          <input
            name="key"
            value={d.key}
            onChange={set("key")}
            readOnly={mode === "edit"}
            className={input + (mode === "edit" ? " text-ink-3" : "")}
            pattern="[a-z0-9_\-]{2,40}"
            required
          />
        </label>
        <label className="text-sm">
          Type
          <select name="kind" value={d.kind} onChange={set("kind")} className={input}>
            <option value="openai_compatible">Model server (OpenAI-compatible API)</option>
            <option value="command">Program or agent on this Mac</option>
          </select>
        </label>
        <label className="text-sm">
          Cost
          <select name="billing" value={d.billing} onChange={set("billing")} className={input}>
            <option value="local">Free, runs on this Mac or my network</option>
            <option value="paid">Paid, charges per use</option>
          </select>
        </label>
        {d.kind === "openai_compatible" ? (
          <label className="text-sm sm:col-span-2">
            Server address
            <input name="base_url" value={d.base_url} onChange={set("base_url")} placeholder="http://127.0.0.1:11434/v1" className={input} />
          </label>
        ) : (
          <label className="text-sm sm:col-span-2">
            Command
            <span className="block text-xs text-ink-3">
              Run from the repo folder. It gets a JSON request on stdin and prints a JSON reply. See runner/README.md.
            </span>
            <input name="command" value={d.command} onChange={set("command")} placeholder="node agents/my-agent.ts" className={input} />
          </label>
        )}
        <label className="text-sm sm:col-span-2">
          Model ids
          <span className="block text-xs text-ink-3">Separated by commas, exactly as the server names them.</span>
          <input name="models" value={d.models} onChange={set("models")} placeholder="qwen3:8b, gemma3:12b" className={input} />
        </label>
        {d.billing === "paid" && (
          <label className="text-sm sm:col-span-2">
            API key variable
            <span className="block text-xs text-ink-3">
              The name of an environment variable that holds the key. The key itself is never stored here.
            </span>
            <input name="api_key_env" value={d.api_key_env} onChange={set("api_key_env")} placeholder="OPENROUTER_API_KEY" className={input} />
          </label>
        )}
        <label className="text-sm sm:col-span-2">
          Notes
          <input name="notes" value={d.notes} onChange={set("notes")} className={input} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className="rounded-sm bg-signal px-4 py-2 text-sm font-semibold text-signal-ink disabled:opacity-50">
          {pending ? "Saving…" : mode === "create" ? "Add provider" : "Save provider"}
        </button>
        <p role="status" className="text-sm">
          {state.ok && <span className="text-good">{state.message}</span>}
          {state.error && <span className="text-bad">{state.error}</span>}
        </p>
      </div>
    </form>
  );
}
