import { Suspense } from "react";
import Link from "next/link";
import { getAttention, getEvals, getFunnel, getRoi, getWeeklyKb } from "@/lib/queries";
import { summarise, totals } from "@/lib/roi";
import { ago, pct, sgd, shortDate } from "@/lib/format";
import { Columns, HBarList, Meter, Spark } from "@/components/charts";
import { PageHeader, Section, Skeleton } from "@/components/ui";
import { PassFail } from "@/components/status";

export default function Overview() {
  return (
    <>
      <PageHeader title="This week on the desk">
        What needs you, how the vendor pipeline is moving, and whether each agent is worth the time you spend on it.
      </PageHeader>
      <Suspense fallback={<Skeleton className="mb-6 h-36" />}>
        <Attention />
      </Suspense>
      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <Suspense fallback={<Skeleton className="h-80" />}>
          <Pipeline />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-80" />}>
          <KbGrowth />
        </Suspense>
      </div>
      <div className="mt-6">
        <Suspense fallback={<Skeleton className="h-72" />}>
          <Roi />
        </Suspense>
      </div>
      <div className="mt-6">
        <Suspense fallback={<Skeleton className="h-60" />}>
          <EvalWatch />
        </Suspense>
      </div>
    </>
  );
}

async function Attention() {
  const a = await getAttention();
  const tiles = [
    {
      href: "/approvals",
      n: a.pending,
      label: a.pending === 1 ? "draft waiting for you" : "drafts waiting for you",
      sub: a.failing_checks ? `${a.failing_checks} failing a compliance or grounding check` : "All drafts pass their checks",
      hot: a.pending > 0,
    },
    {
      href: "/agents#runs",
      n: a.failed_runs,
      label: a.failed_runs === 1 ? "failed run this week" : "failed runs this week",
      sub: a.failed_runs ? "Open the run log to see the error" : "Every run finished",
      hot: a.failed_runs > 0,
    },
    {
      href: "/agents#runs",
      n: a.limit_runs,
      label: "usage-limit stops in 30 days",
      sub: a.last_limit ? `Last one ${ago(a.last_limit)}. The run resumed after the reset.` : "Never hit the subscription limit",
      hot: false,
    },
  ];
  return (
    <div className="mb-6">
      <div className="grid gap-px overflow-hidden rounded-md border border-rule bg-rule sm:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="group bg-panel p-4 hover:bg-sunk md:p-5">
            <p className={`display num text-6xl ${t.hot ? "text-signal" : ""}`}>{t.n}</p>
            <p className="mt-2 font-medium group-hover:underline">{t.label}</p>
            <p className="mt-1 text-sm text-ink-3">{t.sub}</p>
          </Link>
        ))}
      </div>
      <p className="mt-3 text-sm text-ink-3">
        Agents run on your Claude subscription: S$0 per run. When the usage limit is reached, the run stops and is
        marked here. Nothing is billed beyond the plan.
      </p>
    </div>
  );
}

async function Pipeline() {
  const funnel = await getFunnel();
  const published = funnel.find((f) => f.event === "published")?.n ?? 0;
  return (
    <Section title="Vendor pipeline" aside="All time, unique vendors">
      <HBarList
        rows={funnel.map((f) => ({ label: f.label, value: f.n }))}
        note={(r, i) => (i === 0 || funnel[i - 1].n === 0 ? "" : pct(r.value / funnel[i - 1].n))}
      />
      <p className="mt-2 text-xs text-ink-3">Right column: conversion from the step above.</p>
      <div className="mt-5 border-t border-rule pt-4">
        <Meter value={published} goal={150} label="Published vendors before public launch" />
      </div>
    </Section>
  );
}

async function KbGrowth() {
  const weeks = await getWeeklyKb();
  const total = weeks.reduce((s, w) => s + w.enriched, 0);
  return (
    <Section title="Vendors verified per week" aside={`${total} in the last 8 weeks`}>
      <Columns
        label="Vendors verified per week, last 8 weeks"
        data={weeks.map((w) => ({ key: String(w.week), label: shortDate(w.week), value: w.enriched }))}
      />
      <p className="mt-2 text-xs text-ink-3">The last column is the current week, still in progress.</p>
      <table className="mt-4 w-full text-sm">
        <caption className="sr-only">Weekly counts</caption>
        <thead className="text-left text-xs text-ink-3">
          <tr>
            <th className="font-medium">Week of</th>
            <th className="text-right font-medium">Found</th>
            <th className="text-right font-medium">Verified</th>
            <th className="text-right font-medium">Published</th>
          </tr>
        </thead>
        <tbody className="num">
          {weeks.slice(-4).map((w) => (
            <tr key={String(w.week)} className="border-t border-rule">
              <td className="py-1">{shortDate(w.week)}</td>
              <td className="text-right">{w.discovered}</td>
              <td className="text-right">{w.enriched}</td>
              <td className="text-right">{w.published}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

async function Roi() {
  const rows = (await getRoi()).map(summarise);
  const t = totals(rows);
  const live = rows.filter((r) => r.runs > 0);
  const idle = rows.filter((r) => r.runs === 0);
  return (
    <Section title="Return on your time, last 30 days" aside={<Link href="/settings" className="underline">Edit assumptions</Link>}>
      <div className="mb-5 grid gap-4 sm:grid-cols-4">
        <Stat label="Work the agents did" value={sgd(t.value)} sub="valued at your hourly rate" />
        <Stat label="Your review time" value={sgd(t.human)} sub={`${Math.round(t.minutes)} minutes`} />
        <Stat
          label="Return"
          value={t.multiple ? `${t.multiple.toFixed(1)}×` : "—"}
          sub="value per S$1 of your time"
        />
        <Stat label="Cash spent" value="S$0" sub={`API equivalent would be ${sgd(t.api)}`} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-ink-3">
            <tr className="border-b border-rule">
              <th className="py-2 font-medium">Agent</th>
              <th className="py-2 font-medium">Output</th>
              <th className="py-2 text-right font-medium">Value</th>
              <th className="py-2 text-right font-medium">Your time</th>
              <th className="py-2 text-right font-medium">Net</th>
              <th className="py-2 text-right font-medium">Return</th>
              <th className="py-2 text-right font-medium">API equiv.</th>
            </tr>
          </thead>
          <tbody className="num">
            {live.map((r) => (
              <tr key={r.agent_key} className="border-b border-rule last:border-0">
                <td className="py-2 font-medium">{r.name}</td>
                <td className="py-2 text-ink-2">
                  {r.unit_label ? `${r.units} ${r.unit_label}` : "Time saved not tracked yet"}
                  {r.runs_limited > 0 && <span className="ml-2 text-xs text-warn">{r.runs_limited} limit stop</span>}
                </td>
                <td className="py-2 text-right">{sgd(r.value_sgd)}</td>
                <td className="py-2 text-right">{sgd(r.human_cost_sgd)}</td>
                <td className={`py-2 text-right font-semibold ${r.net_sgd < 0 ? "text-bad" : ""}`}>{sgd(r.net_sgd)}</td>
                <td className="py-2 text-right">{r.return_multiple ? `${r.return_multiple.toFixed(1)}×` : "—"}</td>
                <td className="py-2 text-right text-ink-3">{sgd(r.api_equiv_sgd, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {idle.length > 0 && (
        <p className="mt-3 text-sm text-ink-3">Not live yet: {idle.map((r) => r.name).join(", ")}.</p>
      )}
      <p className="mt-3 text-xs text-ink-3">
        Value = units × minutes it would take you by hand × hourly rate. Your time = approval review time + logged fixes.
        Before revenue this answers “is it cheaper than doing it myself”; after launch, swap in vendor lifetime value.
      </p>
    </Section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <p className="text-sm text-ink-2">{label}</p>
      <p className="display num mt-1 text-4xl">{value}</p>
      <p className="mt-1 text-xs text-ink-3">{sub}</p>
    </div>
  );
}

async function EvalWatch() {
  const evals = await getEvals();
  const failing = evals.filter((e) => !e.history[e.history.length - 1]?.passed);
  return (
    <Section
      title="Evals"
      aside={
        <Link href="/agents#evals" className="underline">
          Full scorecard
        </Link>
      }
    >
      <p className="mb-4 text-sm text-ink-2">
        {failing.length === 0
          ? "Every eval passed its latest run."
          : `${failing.length} of ${evals.length} evals are below the bar. Agents stay at their current autonomy level until they pass for 3 weeks.`}
      </p>
      <ul className="grid gap-x-8 gap-y-3 md:grid-cols-2">
        {(failing.length ? failing : evals.slice(0, 6)).map((e) => {
          const last = e.history[e.history.length - 1];
          const fmt = (v: number) => (e.threshold <= 1 ? pct(v, 1) : v.toFixed(2));
          return (
            <li key={e.agent_key + e.eval_name} className="flex items-center gap-3">
              <Spark
                points={e.history.map((h) => h.score)}
                threshold={e.threshold}
                higherIsBetter={e.higher_is_better}
                label={`${e.eval_name} trend, latest ${fmt(last.score)}, bar ${fmt(e.threshold)}`}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{e.eval_name}</p>
                <p className="num text-xs text-ink-3">
                  {e.agent_name}: {fmt(last.score)}, bar {e.higher_is_better ? "≥" : "≤"} {fmt(e.threshold)}
                </p>
              </div>
              <PassFail passed={last.passed} />
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
