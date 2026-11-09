"use client";

import { useActionState } from "react";
import { saveRoute, type FormState } from "./actions";

export type ModelOption = { provider_key: string; provider_name: string; enabled: boolean; models: string[] };

const select =
  "w-full min-w-0 rounded-sm border border-rule bg-paper px-2 py-1.5 text-sm outline-none focus:border-signal";

function Options({ options, current }: { options: ModelOption[]; current: string }) {
  const known = options.some((o) => o.models.some((m) => `${o.provider_key}::${m}` === current));
  return (
    <>
      {current && !known && <option value={current}>{current.replace("::", ": ")} (not listed)</option>}
      {options.map((o) => (
        <optgroup key={o.provider_key} label={o.enabled ? o.provider_name : `${o.provider_name} (switched off)`}>
          {o.models.map((m) => (
            <option key={m} value={`${o.provider_key}::${m}`}>
              {o.provider_name}, {m}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

export function RouteForm({
  agentKey,
  role,
  primary,
  fallback,
  options,
  label,
}: {
  agentKey: string;
  role: string;
  primary: string;
  fallback: string;
  options: ModelOption[];
  label: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveRoute, {});
  return (
    <form action={action} className="contents">
      <input type="hidden" name="agent_key" value={agentKey} />
      <input type="hidden" name="role" value={role} />
      <label className="min-w-0">
        <span className="text-xs text-ink-3 md:sr-only">Model<span className="sr-only"> for {label}</span></span>
        <select name="primary" defaultValue={primary} className={select}>
          <Options options={options} current={primary} />
        </select>
      </label>
      <label className="min-w-0">
        <span className="text-xs text-ink-3 md:sr-only">Fallback<span className="sr-only"> for {label}</span></span>
        <select name="fallback" defaultValue={fallback} className={select}>
          <option value="">No fallback, stop the run</option>
          <Options options={options} current={fallback} />
        </select>
      </label>
      <div className="flex items-center gap-2">
        <button
          disabled={pending}
          className="rounded-sm border border-rule px-3 py-1.5 text-sm hover:bg-sunk disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <span role="status" className="text-xs">
          {state.ok && <span className="text-good">Saved</span>}
          {state.error && <span className="text-bad">{state.error}</span>}
        </span>
      </div>
    </form>
  );
}
