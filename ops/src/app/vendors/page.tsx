import { Suspense } from "react";
import Link from "next/link";
import clsx from "clsx";
import { getVendorFacets, getVendors } from "@/lib/queries";
import { ago, STATUS_LABEL } from "@/lib/format";
import { Empty, PageHeader, Skeleton } from "@/components/ui";
import { PassFail } from "@/components/status";

type SP = PageProps<"/vendors">["searchParams"];

export default function VendorsPage({ searchParams }: PageProps<"/vendors">) {
  return (
    <>
      <PageHeader title="Vendor knowledge base">
        Every Singapore vendor the agents have found. Each fact links to the page it came from; facts without a
        source are dropped.
      </PageHeader>
      <Suspense fallback={<Skeleton className="h-[30rem]" />}>
        <VendorTable searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

async function VendorTable({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const status = one(sp.status);
  const category = one(sp.category);
  const q = one(sp.q)?.trim();
  const [vendors, facets] = await Promise.all([getVendors({ status, category, q }), getVendorFacets()]);

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const next = { status, category, q, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/vendors?${s}` : "/vendors";
  };

  return (
    <>
      <form className="mb-4 flex flex-wrap items-end gap-3" action="/vendors">
        <label className="text-sm">
          <span className="mb-1 block text-ink-2">Search</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="Name, domain or area"
            className="w-64 rounded-sm border border-rule bg-panel px-3 py-1.5 outline-none focus:border-signal"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-ink-2">Category</span>
          <select
            name="category"
            defaultValue={category ?? ""}
            className="rounded-sm border border-rule bg-panel px-2 py-1.5 outline-none focus:border-signal"
          >
            <option value="">All categories</option>
            {facets.categories.map((c) => (
              <option key={c.category} value={c.category}>
                {c.category} ({c.n})
              </option>
            ))}
          </select>
        </label>
        {status && <input type="hidden" name="status" value={status} />}
        <button className="rounded-sm bg-ink px-3 py-1.5 text-sm font-medium text-paper">Apply</button>
        {(q || category || status) && (
          <Link href="/vendors" className="py-1.5 text-sm underline">
            Clear filters
          </Link>
        )}
      </form>

      <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Filter by stage">
        <Link
          href={href({ status: undefined })}
          className={clsx("rounded-sm border px-2 py-1 text-sm", !status ? "border-ink bg-ink text-paper" : "border-rule hover:bg-sunk")}
        >
          All stages
        </Link>
        {facets.statuses.map((s) => (
          <Link
            key={s.status}
            href={href({ status: s.status })}
            className={clsx(
              "num rounded-sm border px-2 py-1 text-sm",
              status === s.status ? "border-ink bg-ink text-paper" : "border-rule hover:bg-sunk",
            )}
          >
            {STATUS_LABEL[s.status] ?? s.status} <span className="opacity-70">{s.n}</span>
          </Link>
        ))}
      </div>

      {vendors.length === 0 ? (
        <Empty>No vendors match these filters. Clear a filter or search for part of a name.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-md border border-rule bg-panel">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-xs text-ink-3">
              <tr className="border-b border-rule">
                <th className="px-3 py-2 font-medium">Vendor</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Area</th>
                <th className="px-3 py-2 font-medium">Stage</th>
                <th className="px-3 py-2 text-right font-medium">Fit</th>
                <th className="px-3 py-2 font-medium">Pitch angle</th>
                <th className="px-3 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.id} className="border-b border-rule last:border-0 hover:bg-sunk">
                  <td className="px-3 py-2">
                    <Link href={`/vendors/${v.id}`} className="font-medium hover:underline">
                      {v.name}
                    </Link>
                    <span className="block text-xs text-ink-3">{v.domain}</span>
                  </td>
                  <td className="px-3 py-2 text-ink-2">{v.category}</td>
                  <td className="px-3 py-2 text-ink-2">{v.area}</td>
                  <td className="px-3 py-2">
                    {STATUS_LABEL[v.status] ?? v.status}
                    {v.ungrounded > 0 && (
                      <span className="ml-2">
                        <PassFail passed={false}>{v.ungrounded} unsourced</PassFail>
                      </span>
                    )}
                  </td>
                  <td className="num px-3 py-2 text-right font-semibold">{v.fit_score ?? "—"}</td>
                  <td className="max-w-56 truncate px-3 py-2 text-ink-2" title={v.pitch_angle ?? undefined}>
                    {v.pitch_angle ?? "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-ink-3">{ago(v.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-ink-3">Showing {vendors.length}, highest fit first. All sample vendors use the .example domain.</p>
    </>
  );
}
