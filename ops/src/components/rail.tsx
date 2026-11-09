import { Suspense } from "react";
import Link from "next/link";
import { getAgents, getPendingCount, getSettings } from "@/lib/queries";
import { ago } from "@/lib/format";
import { Light } from "./status";
import { Nav } from "./nav";

async function PendingBadge() {
  const n = await getPendingCount();
  if (n === 0) return null;
  return (
    <span className="num rounded-sm bg-signal px-1.5 text-xs font-semibold text-signal-ink" aria-label={`${n} pending`}>
      {n}
    </span>
  );
}

async function Brand() {
  const { brand } = await getSettings();
  return (
    <span>
      {brand.name}
      {brand.placeholder && <span className="ml-1 text-xs font-normal text-ink-3">(working name)</span>}
    </span>
  );
}

async function AgentLights() {
  const agents = await getAgents();
  return (
    <ul className="space-y-1.5">
      {agents.map((a) => (
        <li key={a.key}>
          <Link href={`/agents#${a.key}`} className="flex items-center gap-2 text-sm text-ink-2 hover:text-ink">
            <Light status={a.last_status} paused={a.paused} />
            <span className="flex-1 truncate">{a.name}</span>
            <span className="text-xs text-ink-3">{a.last_started ? ago(a.last_started) : "not live"}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function Rail() {
  return (
    <aside className="border-rule bg-panel md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col md:border-r">
      <div className="flex items-center justify-between gap-4 px-4 pt-4 pb-3 md:block md:px-5 md:pt-6">
        <p className="display text-2xl">Growth desk</p>
        <p className="text-sm text-ink-3 md:mt-1">
          <Suspense fallback="…">
            <Brand />
          </Suspense>
        </p>
      </div>
      <div className="px-3 pb-3 md:px-3">
        <Nav
          pending={
            <Suspense fallback={null}>
              <PendingBadge />
            </Suspense>
          }
        />
      </div>
      <div className="hidden border-t border-rule px-5 py-4 md:mt-auto md:block">
        <p className="mb-2 text-xs font-medium text-ink-3">Agents, last run</p>
        <Suspense fallback={<p className="text-sm text-ink-3">Loading…</p>}>
          <AgentLights />
        </Suspense>
      </div>
    </aside>
  );
}
