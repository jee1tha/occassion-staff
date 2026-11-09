import { Suspense } from "react";
import { AlertTriangle, Check, CircleSlash, Lock } from "lucide-react";
import {
  getAllowPaid,
  getModelComparison,
  getProviders,
  getRoutes,
  type Provider,
} from "@/lib/queries";
import { ago, pct } from "@/lib/format";
import { PageHeader, Section, Skeleton } from "@/components/ui";
import { PassFail, Pill } from "@/components/status";
import { RouteForm, type ModelOption } from "./route-form";
import { CheckButton } from "./check-button";
import { ProviderForm } from "./provider-form";
import { removeProvider, setAllowPaid, setProviderEnabled } from "./actions";

export default function ModelsPage() {
  return (
    <>
      <PageHeader title="Models">
        Agents ask for a job to be done, never for a particular model. Pick which model does each job, and a fallback
        for when it runs out of usage or is offline. Claude, a model running on this Mac, or your own agent all plug in
        the same way.
      </PageHeader>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Routing />
      </Suspense>
      <div className="mt-6">
        <Suspense fallback={<Skeleton className="h-64" />}>
          <Comparison />
        </Suspense>
      </div>
      <div className="mt-6">
        <Suspense fallback={<Skeleton className="h-96" />}>
          <Providers />
        </Suspense>
      </div>
    </>
  );
}

const KIND: Record<Provider["kind"], string> = {
  claude_code: "Claude Code, headless",
  openai_compatible: "Model server",
  command: "Program on this Mac",
};

function Billing({ billing }: { billing: Provider["billing"] }) {
  if (billing === "subscription") return <Pill tone="neutral">Your Claude plan</Pill>;
  if (billing === "local") return <Pill tone="good" icon={Check}>Free</Pill>;
  return <Pill tone="warn" icon={AlertTriangle}>Paid</Pill>;
}

function Health({ p }: { p: Provider }) {
  if (!p.enabled) return <Pill tone="neutral" icon={CircleSlash}>Switched off</Pill>;
  if (p.last_ok === null) return <Pill tone="neutral">Not checked yet</Pill>;
  return p.last_ok ? <PassFail passed>Answering</PassFail> : <PassFail passed={false}>Not answering</PassFail>;
}

async function Routing() {
  const [routes, providers] = await Promise.all([getRoutes(), getProviders()]);
  const byKey = new Map(providers.map((p) => [p.key, p]));
  const options: ModelOption[] = providers.map((p) => ({
    provider_key: p.key,
    provider_name: p.name,
    enabled: p.enabled,
    models: p.models,
  }));

  return (
    <Section title="Who does each job" aside="Changes apply from the next run">
      <div className="hidden grid-cols-[minmax(12rem,1.3fr)_1fr_1fr_8rem] gap-3 border-b border-rule pb-2 text-xs text-ink-3 md:grid">
        <span>Agent and job</span>
        <span>Model</span>
        <span>Fallback</span>
        <span />
      </div>
      <ul>
        {routes.map((r, i) => {
          const first = i === 0 || routes[i - 1].agent_key !== r.agent_key;
          const issues = [byKey.get(r.provider_key), r.fallback_provider_key ? byKey.get(r.fallback_provider_key) : null]
            .filter((p): p is Provider => !!p)
            .filter((p) => !p.enabled || p.last_ok === false);
          return (
            <li
              key={`${r.agent_key}/${r.role}`}
              className={`grid gap-2 py-3 md:grid-cols-[minmax(12rem,1.3fr)_1fr_1fr_8rem] md:items-center md:gap-3 ${first && i > 0 ? "border-t border-rule" : ""}`}
            >
              <div>
                <p className="text-sm">
                  {first ? <span className="font-semibold">{r.agent_name}</span> : <span className="text-ink-3">{r.agent_name}</span>}
                </p>
                <p className="text-sm text-ink-2">{r.purpose}</p>
                {issues.map((p) => (
                  <p key={p.key} className="mt-1 text-xs text-warn">
                    <AlertTriangle aria-hidden className="mr-1 inline size-3.5 align-[-2px]" />
                    {p.name} is {p.enabled ? "not answering" : "switched off"}
                  </p>
                ))}
              </div>
              <RouteForm
                agentKey={r.agent_key}
                role={r.role}
                label={`${r.agent_name}, ${r.purpose}`}
                primary={`${r.provider_key}::${r.model}`}
                fallback={r.fallback_provider_key ? `${r.fallback_provider_key}::${r.fallback_model}` : ""}
                options={options}
              />
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-ink-3">
        The fallback takes over only when the model is out of usage or can&apos;t be reached. If a reply is wrong or a
        spending rule blocks a model, the run stops and says why in the run log.
      </p>
    </Section>
  );
}

async function Comparison() {
  const rows = await getModelComparison();
  return (
    <Section title="How models compare on the same test sets" aside="Latest test-set score per model">
      {rows.length === 0 ? (
        <p className="text-sm text-ink-2">
          No model has been tried against another yet. Run an agent&apos;s test set on a second model to see them side
          by side here.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-ink-3">
              <tr className="border-b border-rule">
                <th className="py-2 font-medium">Agent</th>
                <th className="py-2 font-medium">Eval</th>
                <th className="py-2 font-medium">Model</th>
                <th className="py-2 text-right font-medium">Score</th>
                <th className="py-2 text-right font-medium">Bar</th>
                <th className="py-2 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="num">
              {rows.flatMap((row, i) =>
                row.results.map((m, j) => (
                  <tr
                    key={`${row.agent_key}/${row.eval_name}/${m.provider}/${m.model}`}
                    className={j === 0 && i > 0 ? "border-t border-rule" : ""}
                  >
                    <td className="py-2 font-medium">{j === 0 && (i === 0 || rows[i - 1].agent_key !== row.agent_key) ? row.agent_name : ""}</td>
                    <td className="py-2">{j === 0 ? row.eval_name : ""}</td>
                    <td className="py-2">
                      {m.provider}, {m.model}
                      {m.in_use && <span className="ml-2 text-xs text-ink-3">in use</span>}
                      <span className="block text-xs text-ink-3">{ago(new Date(m.run_at))}</span>
                    </td>
                    <td className="py-2 text-right font-semibold">{pct(m.score, 1)}</td>
                    <td className="py-2 text-right text-ink-3">
                      {j === 0 ? `${row.higher_is_better ? "≥" : "≤"} ${pct(row.threshold, 1)}` : ""}
                    </td>
                    <td className="py-2 text-right">
                      <PassFail passed={m.passed} />
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-ink-3">
        A model that passes every eval for a job is a safe switch. Keep Claude as its fallback while it proves itself
        on live work.
      </p>
    </Section>
  );
}

async function Providers() {
  const [providers, allowPaid] = await Promise.all([getProviders(), getAllowPaid()]);
  return (
    <Section title="Providers" aside={`${providers.filter((p) => p.enabled).length} switched on`}>
      <ul className="divide-y divide-rule">
        {providers.map((p) => (
          <li key={p.key} className="grid gap-3 py-4 first:pt-0 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_19rem] lg:items-start">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{p.name}</span>
                <Billing billing={p.billing} />
              </p>
              <p className="text-sm text-ink-3">
                {KIND[p.kind]}
                {p.base_url && <>, {p.base_url}</>}
                {p.command && (
                  <>
                    , <code className="text-xs">{p.command.join(" ")}</code>
                  </>
                )}
              </p>
              <p className="mt-1 text-sm text-ink-2 break-words">
                {p.models.length ? p.models.join(", ") : "No model ids listed yet"}
              </p>
              {p.notes && <p className="mt-1 text-xs text-ink-3">{p.notes}</p>}
            </div>
            <div className="text-sm">
              <Health p={p} />
              {p.last_checked_at && (
                <p className="mt-1 text-xs text-ink-3">
                  Checked {ago(p.last_checked_at)}
                  {p.last_detail && <span className="block break-words text-ink-2">{p.last_detail}</span>}
                </p>
              )}
              <p className="mt-1 text-xs text-ink-3">
                {p.used_by ? `Used by ${p.used_by} job${p.used_by > 1 ? "s" : ""}` : "Not used by any job"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <CheckButton providerKey={p.key} name={p.name} />
              {p.kind !== "claude_code" && (
                <form action={setProviderEnabled}>
                  <input type="hidden" name="key" value={p.key} />
                  <input type="hidden" name="enabled" value={String(!p.enabled)} />
                  <button className="rounded-sm border border-rule px-3 py-1.5 text-sm hover:bg-sunk">
                    {p.enabled ? "Switch off" : "Switch on"}
                  </button>
                </form>
              )}
              {p.kind !== "claude_code" && p.used_by === 0 && (
                <form action={removeProvider}>
                  <input type="hidden" name="key" value={p.key} />
                  <button className="rounded-sm border border-rule px-3 py-1.5 text-sm text-bad hover:bg-bad-soft">
                    Remove
                  </button>
                </form>
              )}
            </div>
            {p.kind !== "claude_code" && (
              <details className="lg:col-span-3">
                <summary className="cursor-pointer text-sm text-ink-2 underline">Edit {p.name}</summary>
                <div className="mt-3 max-w-2xl">
                  <ProviderForm
                    mode="edit"
                    initial={{
                      key: p.key,
                      name: p.name,
                      kind: p.kind as "openai_compatible" | "command",
                      billing: p.billing as "local" | "paid",
                      base_url: p.base_url ?? "",
                      command: p.command?.join(" ") ?? "",
                      api_key_env: p.api_key_env ?? "",
                      models: p.models.join(", "),
                      notes: p.notes ?? "",
                    }}
                  />
                </div>
              </details>
            )}
          </li>
        ))}
      </ul>

      <details className="mt-4 rounded-md border border-rule bg-paper p-4">
        <summary className="cursor-pointer font-semibold">Add a provider</summary>
        <p className="mt-2 max-w-2xl text-sm text-ink-2">
          Any server with an OpenAI-style chat API works: Ollama, LM Studio, llama.cpp, vLLM, MLX. To plug in your own
          agent, add it as a program; the runner sends it a JSON request and reads a JSON reply.
        </p>
        <div className="mt-4 max-w-2xl">
          <ProviderForm mode="create" />
        </div>
      </details>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-3 border-t border-rule pt-4">
        <div className="max-w-2xl text-sm">
          <p className="flex items-center gap-2 font-semibold">
            <Lock aria-hidden className="size-4" />
            {allowPaid ? "Paid providers are allowed" : "Paid providers are blocked"}
          </p>
          <p className="mt-1 text-ink-2">
            {allowPaid
              ? "Jobs routed to a paid provider will run and be charged by that provider."
              : "The runner refuses any provider marked paid, and any provider marked free whose address isn't on this Mac or your network. Claude always runs on your plan with API keys removed."}
          </p>
        </div>
        <form action={setAllowPaid}>
          <input type="hidden" name="allow" value={String(!allowPaid)} />
          <button className="rounded-sm border border-rule px-3 py-1.5 text-sm hover:bg-sunk">
            {allowPaid ? "Block paid providers" : "Allow paid providers"}
          </button>
        </form>
      </div>
    </Section>
  );
}
