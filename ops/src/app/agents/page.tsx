import { Suspense } from "react";
import { Pause, Play } from "lucide-react";
import { getAgents, getEvals, getRuns } from "@/lib/queries";
import { ago, AUTONOMY, dateTime, duration, pct } from "@/lib/format";
import { PageHeader, Section, Skeleton } from "@/components/ui";
import { PassFail, Pill, RunStatus } from "@/components/status";
import { Spark } from "@/components/charts";
import { setPaused } from "./actions";

export default function AgentsPage() {
  return (
    <>
      <PageHeader title="Agents and evals">
        Who runs when, how far each agent is trusted, and the evals that decide when that trust goes up or down.
      </PageHeader>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Roster />
      </Suspense>
      <div className="mt-6" id="evals">
        <Suspense fallback={<Skeleton className="h-80" />}>
          <Scorecard />
        </Suspense>
      </div>
      <div className="mt-6" id="runs">
        <Suspense fallback={<Skeleton className="h-80" />}>
          <RunLog />
        </Suspense>
      </div>
    </>
  );
}

const TEAM: Record<string, string> = { supply: "Supply", demand: "Demand", ops: "Operations" };

async function Roster() {
  const agents = await getAgents();
  return (
    <div className="overflow-hidden rounded-md border border-rule bg-panel">
      {agents.map((a) => (
        <div
          key={a.key}
          id={a.key}
          className="grid scroll-mt-6 gap-3 border-b border-rule p-4 last:border-0 md:grid-cols-[1.4fr_1fr_1fr_auto] md:items-center"
        >
          <div>
            <p className="font-semibold">
              {a.name} <span className="ml-1 text-xs font-normal text-ink-3">{TEAM[a.team]}</span>
            </p>
            <p className="text-sm text-ink-2">{a.purpose}</p>
          </div>
          <div className="text-sm">
            <p>{a.cadence}</p>
            <ul className="text-ink-3">
              {a.routes.map((r) => (
                <li key={r.role} title={r.fallback_provider ? `Fallback: ${r.fallback_provider}, ${r.fallback_model}` : "No fallback"}>
                  {a.routes.length > 1 && <span>{r.role}: </span>}
                  {r.provider === "Claude subscription" ? `Claude ${r.model}` : `${r.provider}, ${r.model}`}
                  {r.fallback_model && <span className="text-xs"> then {r.fallback_model}</span>}
                </li>
              ))}
            </ul>
          </div>
          <div className="text-sm">
            <p title={AUTONOMY[a.autonomy_level].long}>{AUTONOMY[a.autonomy_level].short}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-ink-3">
              {a.paused ? <Pill tone="warn" icon={Pause}>Paused</Pill> : <RunStatus status={a.last_status} />}
              {a.last_started && <span>{ago(a.last_started)}</span>}
            </p>
            {a.last_error && !a.paused && <p className="mt-1 text-xs text-bad">{a.last_error}</p>}
          </div>
          <form action={setPaused}>
            <input type="hidden" name="key" value={a.key} />
            <input type="hidden" name="pause" value={String(!a.paused)} />
            <button className="inline-flex items-center gap-1.5 rounded-sm border border-rule px-3 py-1.5 text-sm hover:bg-sunk">
              {a.paused ? <Play aria-hidden className="size-4" /> : <Pause aria-hidden className="size-4" />}
              {a.paused ? "Resume" : "Pause"}
            </button>
          </form>
        </div>
      ))}
    </div>
  );
}

async function Scorecard() {
  const evals = await getEvals();
  return (
    <Section title="Eval scorecard" aside="Last 6 weeks. Dashed line is the pass bar.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="text-left text-xs text-ink-3">
            <tr className="border-b border-rule">
              <th className="py-2 font-medium">Agent</th>
              <th className="py-2 font-medium">Eval</th>
              <th className="py-2 font-medium">Type</th>
              <th className="py-2 font-medium">Trend</th>
              <th className="py-2 text-right font-medium">Latest</th>
              <th className="py-2 text-right font-medium">Bar</th>
              <th className="py-2 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="num">
            {evals.map((e, i) => {
              const last = e.history[e.history.length - 1];
              const fmt = (v: number) => pct(v, 1);
              const firstOfAgent = i === 0 || evals[i - 1].agent_key !== e.agent_key;
              return (
                <tr key={e.agent_key + e.eval_name} className={firstOfAgent ? "border-t border-rule" : ""}>
                  <td className="py-2 font-medium">{firstOfAgent ? e.agent_name : ""}</td>
                  <td className="py-2">
                    {e.eval_name}
                    {e.model && <span className="block text-xs text-ink-3">on {e.model}</span>}
                  </td>
                  <td className="py-2 text-ink-3">{e.kind === "offline" ? "Test set" : "Live sample"}</td>
                  <td className="py-2">
                    <Spark
                      points={e.history.map((h) => h.score)}
                      threshold={e.threshold}
                      higherIsBetter={e.higher_is_better}
                      label={`${e.eval_name}: ${e.history.map((h) => fmt(h.score)).join(", ")}`}
                    />
                  </td>
                  <td className="py-2 text-right font-semibold">{fmt(last.score)}</td>
                  <td className="py-2 text-right text-ink-3">
                    {e.higher_is_better ? "≥" : "≤"} {fmt(e.threshold)}
                  </td>
                  <td className="py-2 text-right">
                    <PassFail passed={last.passed} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-ink-3">
        Test-set evals run on every prompt change against hand-labelled data. Live-sample evals run weekly on real
        output. Two failing weeks in a row drops the agent one autonomy level.
      </p>
    </Section>
  );
}

async function RunLog() {
  const runs = await getRuns(undefined, 30);
  return (
    <Section title="Run log" aside="Most recent 30">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="text-left text-xs text-ink-3">
            <tr className="border-b border-rule">
              <th className="py-2 font-medium">Started</th>
              <th className="py-2 font-medium">Agent</th>
              <th className="py-2 font-medium">Model</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 font-medium">Took</th>
              <th className="py-2 text-right font-medium">Tokens</th>
              <th className="py-2 text-right font-medium">API equiv.</th>
              <th className="py-2 pl-6 font-medium">What happened</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-b border-rule align-top last:border-0">
                <td className="num py-2 whitespace-nowrap">{dateTime(r.started_at)}</td>
                <td className="py-2">{r.agent_name}</td>
                <td className="py-2 text-ink-2">
                  {r.model ?? "None"}
                  {r.used_fallback && <span className="block text-xs text-warn">fallback</span>}
                </td>
                <td className="py-2">
                  <RunStatus status={r.status} />
                </td>
                <td className="num py-2 whitespace-nowrap text-ink-2">{duration(r.started_at, r.ended_at)}</td>
                <td className="num py-2 text-right text-ink-2">
                  {Math.round((r.input_tokens + r.output_tokens) / 1000).toLocaleString("en-SG")}k
                </td>
                <td className="num py-2 text-right text-ink-3">US${r.api_equiv_usd.toFixed(2)}</td>
                <td className="py-2 pl-6 text-ink-2">
                  {r.summary}
                  {r.error && <span className="block text-xs text-bad">{r.error}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-ink-3">
        API equivalent is Claude Code&apos;s list-price estimate for the run. On your subscription nothing is charged,
        and local models show US$0.00.
      </p>
    </Section>
  );
}
