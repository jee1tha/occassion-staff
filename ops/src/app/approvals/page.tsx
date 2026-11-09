import { Suspense } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ExternalLink } from "lucide-react";
import { getFacts, getPendingApprovals, getRecentDecisions, type Approval } from "@/lib/queries";
import { ago, KIND_LABEL } from "@/lib/format";
import { Empty, PageHeader, Skeleton } from "@/components/ui";
import { PassFail, Pill } from "@/components/status";
import { DecisionForm } from "./decision-form";

export default function ApprovalsPage({ searchParams }: PageProps<"/approvals">) {
  return (
    <>
      <PageHeader title="Approvals">
        Everything an agent wants to send or publish waits here until you say yes. Approve as written, edit and
        approve, or reject with a reason.
      </PageHeader>
      <Suspense fallback={<Skeleton className="h-[32rem]" />}>
        <Queue searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Queue({ searchParams }: { searchParams: PageProps<"/approvals">["searchParams"] }) {
  const [{ id }, pending] = await Promise.all([searchParams, getPendingApprovals()]);
  if (pending.length === 0) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Empty>
          The queue is empty. New drafts arrive after the Monday run; the Outreach agent drafts first emails for the
          highest-fit verified vendors.
        </Empty>
        <Recent />
      </div>
    );
  }
  const selected = pending.find((p) => String(p.id) === id) ?? pending[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(16rem,22rem)_1fr]">
      <div>
        <p className="mb-2 text-sm text-ink-3">{pending.length} waiting, oldest first</p>
        <ol className="overflow-hidden rounded-md border border-rule">
          {pending.map((p) => {
            const failing = p.checks.filter((c) => !c.passed).length;
            const active = p.id === selected.id;
            return (
              <li key={p.id} className="border-b border-rule last:border-0">
                <Link
                  href={`/approvals?id=${p.id}`}
                  aria-current={active ? "true" : undefined}
                  className={clsx(
                    "block border-l-4 px-3 py-2.5",
                    active ? "border-l-signal bg-panel" : "border-l-transparent bg-paper hover:bg-panel",
                  )}
                >
                  <p className="flex items-center justify-between gap-2 text-xs text-ink-3">
                    <span>
                      {KIND_LABEL[p.kind] ?? p.kind}, from {p.agent_name}
                    </span>
                    <span>{ago(p.created_at)}</span>
                  </p>
                  <p className="mt-0.5 truncate text-sm font-medium">{p.vendor_name ?? p.title}</p>
                  {failing > 0 && (
                    <p className="mt-1">
                      <PassFail passed={false}>
                        {failing} check{failing > 1 ? "s" : ""} failed
                      </PassFail>
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ol>
        <div className="mt-6 hidden lg:block">
          <Recent />
        </div>
      </div>
      <Detail approval={selected} />
    </div>
  );
}

async function Detail({ approval: a }: { approval: Approval }) {
  const facts = a.vendor_id ? await getFacts(a.vendor_id) : [];
  const allPass = a.checks.every((c) => c.passed);
  return (
    <article className="grid gap-6 xl:grid-cols-[1fr_18rem]">
      <div className="rounded-md border border-rule bg-panel p-4 md:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Pill tone="neutral">{KIND_LABEL[a.kind] ?? a.kind}</Pill>
          <h2 className="text-lg font-semibold">{a.title}</h2>
        </div>
        <DecisionForm key={a.id} id={a.id} body={a.body} canApprove={allPass} />
      </div>

      <aside className="space-y-6">
        <section>
          <h3 className="mb-2 text-sm font-semibold">Checks run by code</h3>
          <ul className="space-y-2">
            {a.checks.map((c) => (
              <li key={c.name} className="text-sm">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{c.name}</span>
                  <PassFail passed={c.passed} />
                </div>
                <p className="text-xs text-ink-3">{c.detail}</p>
              </li>
            ))}
          </ul>
        </section>

        {a.vendor_id && (
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-sm font-semibold">What the agent knows</h3>
              <Link href={`/vendors/${a.vendor_id}`} className="text-xs underline">
                Vendor record
              </Link>
            </div>
            {facts.length === 0 ? (
              <p className="text-sm text-ink-3">No verified facts yet.</p>
            ) : (
              <ul className="space-y-3">
                {facts.map((f) => (
                  <li key={f.id} className="text-sm">
                    <p className="flex items-center justify-between gap-2">
                      <span className="text-ink-3">{f.field.replace("_", " ")}</span>
                      {!f.grounded && <PassFail passed={false}>Not in source</PassFail>}
                    </p>
                    <p className="font-medium break-words">{f.value}</p>
                    <blockquote className="mt-1 border-l-2 border-rule pl-2 text-xs text-ink-2">
                      “{f.evidence_snippet}”
                    </blockquote>
                    <a
                      href={f.evidence_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1 text-xs text-ink-3 underline"
                    >
                      {f.evidence_url.replace("https://", "")}
                      <ExternalLink aria-hidden className="size-3" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </aside>
    </article>
  );
}

async function Recent() {
  const rows = await getRecentDecisions(6);
  const label: Record<string, string> = { approved: "Approved", edited: "Approved with edits", rejected: "Rejected" };
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">Recently decided</h3>
      <ul className="space-y-2 text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex items-baseline justify-between gap-3">
            <span className="truncate">
              {r.title}
              {r.decision_note && <span className="block text-xs text-ink-3">{r.decision_note}</span>}
            </span>
            <span className="shrink-0 text-xs text-ink-3">
              {label[r.status]}, {ago(r.decided_at)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
