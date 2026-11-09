"use client";

import { useActionState } from "react";
import { saveSettings, type SaveState } from "./actions";

type Props = {
  brand: string;
  hourly: number;
  fx: number;
  assumptions: { agent_key: string; name: string; unit_label: string; manual_minutes: number }[];
};

const field = "w-28 rounded-sm border border-rule bg-paper px-2 py-1.5 text-right outline-none focus:border-signal num";

export function SettingsForm({ brand, hourly, fx, assumptions }: Props) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveSettings, {});
  return (
    <form action={action} className="max-w-2xl space-y-8">
      <fieldset className="space-y-3">
        <legend className="mb-2 font-semibold">Brand</legend>
        <label className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span>
            Working name used in drafts
            <span className="block text-xs text-ink-3">Placeholder until the name is final. Drafts pick it up on the next run.</span>
          </span>
          <input
            name="brand_name"
            defaultValue={brand}
            className="w-56 rounded-sm border border-rule bg-paper px-2 py-1.5 outline-none focus:border-signal"
          />
        </label>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-2 font-semibold">How your time is valued</legend>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Your hourly rate (S$)</span>
          <input name="hourly_rate_sgd" type="number" step="1" defaultValue={hourly} className={field} />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>
            USD to SGD
            <span className="block text-xs text-ink-3">Only used for the API-equivalent reference figure.</span>
          </span>
          <input name="usd_to_sgd" type="number" step="0.01" defaultValue={fx} className={field} />
        </label>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 font-semibold">Minutes it takes you by hand</legend>
        <p className="text-sm text-ink-2">
          Time yourself on the first 20 vendors and enter the averages. This is the baseline every agent is measured
          against.
        </p>
        {assumptions.map((a) => (
          <label key={a.agent_key} className="flex items-center justify-between gap-3 text-sm">
            <span>
              {a.name}
              <span className="block text-xs text-ink-3">per one of: {a.unit_label}</span>
            </span>
            <input name={`minutes:${a.agent_key}`} type="number" step="0.5" defaultValue={a.manual_minutes} className={field} />
          </label>
        ))}
      </fieldset>

      <div className="flex items-center gap-3">
        <button disabled={pending} className="rounded-sm bg-signal px-4 py-2 text-sm font-semibold text-signal-ink disabled:opacity-50">
          {pending ? "Saving…" : "Save settings"}
        </button>
        <p role="status" className="text-sm">
          {state.ok && <span className="text-good">Saved. ROI figures are updated.</span>}
          {state.error && <span className="text-bad">{state.error}</span>}
        </p>
      </div>
    </form>
  );
}
