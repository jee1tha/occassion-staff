import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { getFacts, getVendor, getVendorApprovals, getVendorTimeline } from "@/lib/queries";
import { dateTime, STATUS_LABEL } from "@/lib/format";
import { PageHeader, Section, Skeleton } from "@/components/ui";
import { PassFail } from "@/components/status";

const EVENT_LABEL: Record<string, string> = {
  discovered: "Found",
  enriched: "Verified and scored",
  outreach_sent: "First email sent",
  replied: "Replied",
  interested: "Said they're interested",
  claimed: "Claimed the draft profile",
  published: "Profile published",
  first_enquiry: "Received first enquiry",
  unsubscribed: "Unsubscribed",
  bounced: "Email bounced",
};

export default function VendorPage({ params }: PageProps<"/vendors/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[30rem]" />}>
      <VendorDetail params={params} />
    </Suspense>
  );
}

async function VendorDetail({ params }: { params: PageProps<"/vendors/[id]">["params"] }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const v = await getVendor(id);
  if (!v) notFound();
  const [facts, timeline, approvals] = await Promise.all([getFacts(id), getVendorTimeline(id), getVendorApprovals(id)]);

  return (
    <>
      <Link href="/vendors" className="text-sm text-ink-2 underline">
        All vendors
      </Link>
      <div className="mt-3">
        <PageHeader title={v.name}>
          {v.category} in {v.area ?? "Singapore"}. Stage: {STATUS_LABEL[v.status] ?? v.status}.
        </PageHeader>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Section title="Facts and their sources" aside={`${facts.length} facts`}>
          {facts.length === 0 ? (
            <p className="text-sm text-ink-2">Not verified yet. The Enricher picks up candidates after the Sunday scout run.</p>
          ) : (
            <ul className="divide-y divide-rule">
              {facts.map((f) => (
                <li key={f.id} className="grid gap-1 py-3 sm:grid-cols-[8rem_1fr]">
                  <span className="text-sm text-ink-3">{f.field.replace("_", " ")}</span>
                  <div>
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {f.value}
                      {f.grounded ? (
                        <PassFail passed>In source</PassFail>
                      ) : (
                        <PassFail passed={false}>Not in source, excluded from drafts</PassFail>
                      )}
                    </p>
                    <blockquote className="mt-1 border-l-2 border-rule pl-2 text-sm text-ink-2">“{f.evidence_snippet}”</blockquote>
                    <a
                      href={f.evidence_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-ink-3 underline"
                    >
                      {f.evidence_url.replace("https://", "")}, fetched {dateTime(f.fetched_at)}
                      <ExternalLink aria-hidden className="size-3" />
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <div className="space-y-6">
          <Section title="Record">
            <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
              <dt className="text-ink-3">Fit score</dt>
              <dd className="num font-semibold">{v.fit_score ?? "Not scored"}</dd>
              <dt className="text-ink-3">Pitch angle</dt>
              <dd>{v.pitch_angle ?? "—"}</dd>
              <dt className="text-ink-3">UEN</dt>
              <dd className="flex flex-wrap items-center gap-2">
                {v.uen ?? "Not matched"}
                {v.uen && <PassFail passed={v.acra_verified}>{v.acra_verified ? "ACRA live" : "Not checked"}</PassFail>}
              </dd>
              <dt className="text-ink-3">Website</dt>
              <dd className="break-all">{v.website ?? "—"}</dd>
              <dt className="text-ink-3">Found via</dt>
              <dd>{v.source}</dd>
            </dl>
          </Section>

          <Section title="History">
            <ol className="space-y-2 text-sm">
              {timeline.map((t, i) => (
                <li key={i} className="grid grid-cols-[6.5rem_1fr] gap-2">
                  <span className="text-ink-3">{dateTime(t.occurred_at)}</span>
                  <span>
                    {EVENT_LABEL[t.event] ?? t.event}
                    <span className="block text-xs text-ink-3">{t.agent_name}</span>
                  </span>
                </li>
              ))}
            </ol>
            {approvals.length > 0 && (
              <div className="mt-4 border-t border-rule pt-3">
                <p className="mb-1 text-xs font-medium text-ink-3">Drafts for this vendor</p>
                <ul className="space-y-1 text-sm">
                  {approvals.map((a) => (
                    <li key={a.id}>
                      {a.status === "pending" ? (
                        <Link href={`/approvals?id=${a.id}`} className="underline">
                          {a.title}, waiting for you
                        </Link>
                      ) : (
                        <span>
                          {a.title}, {a.status}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
