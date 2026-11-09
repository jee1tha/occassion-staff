import clsx from "clsx";

/**
 * Small hand-built charts. One series per chart, so one colour (series-1); identity
 * comes from the row label, never colour alone. Every mark has a hover tooltip
 * (native title) and the numbers are printed, so a table view is built in.
 */

export function HBarList({
  rows,
  max,
  format = (n) => n.toLocaleString("en-SG"),
  note,
}: {
  rows: { label: string; value: number; note?: string }[];
  max?: number;
  format?: (n: number) => string;
  note?: (row: { label: string; value: number }, i: number) => React.ReactNode;
}) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="grid grid-cols-[minmax(6.5rem,auto)_1fr_auto] items-center gap-x-3 gap-y-1.5">
      {rows.map((r, i) => (
        <div key={r.label} className="contents" title={`${r.label}: ${format(r.value)}`}>
          <span className="text-sm text-ink-2">{r.label}</span>
          <span className="relative h-5 rounded-sm bg-sunk">
            <span
              className="absolute inset-y-0 left-0 rounded-r-[4px] bg-series"
              style={{ width: `${Math.max(r.value > 0 ? 1 : 0, (r.value / top) * 100)}%` }}
            />
          </span>
          <span className="num flex items-baseline justify-end gap-2 text-sm">
            <span className="font-semibold">{format(r.value)}</span>
            {note && <span className="w-12 text-right text-xs text-ink-3">{note(r, i)}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Columns({
  data,
  label,
}: {
  data: { key: string; label: string; value: number }[];
  label: string;
}) {
  const top = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure>
      <div className="flex h-28 items-end gap-[2px]" role="img" aria-label={label}>
        {data.map((d, i) => (
          <div key={d.key} className="group relative flex h-full flex-1 flex-col justify-end" title={`${d.label}: ${d.value}`}>
            <span
              className={clsx(
                "block rounded-t-[4px] bg-series transition-opacity group-hover:opacity-80",
                i === data.length - 1 && "bg-ink",
              )}
              style={{ height: `${(d.value / top) * 100}%`, minHeight: d.value > 0 ? 2 : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px] border-t border-rule pt-1">
        {data.map((d, i) => (
          <span key={d.key} className="num flex-1 text-center text-[11px] text-ink-3">
            {i === 0 || i === data.length - 1 || i % 2 === 0 ? d.label : ""}
          </span>
        ))}
      </div>
    </figure>
  );
}

/** Score history with the pass threshold as a dashed line. */
export function Spark({
  points,
  threshold,
  higherIsBetter,
  label,
}: {
  points: number[];
  threshold: number;
  higherIsBetter: boolean;
  label: string;
}) {
  const w = 96;
  const h = 28;
  const pad = 3;
  const lo = Math.min(threshold, ...points);
  const hi = Math.max(threshold, ...points);
  const span = hi - lo || 1;
  const x = (i: number) => pad + (i * (w - pad * 2)) / Math.max(1, points.length - 1);
  const y = (v: number) => h - pad - ((v - lo) / span) * (h - pad * 2);
  const last = points[points.length - 1];
  const ok = higherIsBetter ? last >= threshold : last <= threshold;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className="overflow-visible">
      <title>{label}</title>
      <line x1={0} x2={w} y1={y(threshold)} y2={y(threshold)} stroke="var(--ink-3)" strokeDasharray="2 3" strokeWidth={1} />
      <polyline
        fill="none"
        stroke="var(--series-1)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points.map((p, i) => `${x(i)},${y(p)}`).join(" ")}
      />
      <circle
        cx={x(points.length - 1)}
        cy={y(last)}
        r={3.5}
        fill={ok ? "var(--series-1)" : "var(--bad)"}
        stroke="var(--panel)"
        strokeWidth={2}
      />
    </svg>
  );
}

export function Meter({ value, goal, label }: { value: number; goal: number; label: string }) {
  const p = Math.min(1, value / goal);
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ink-2">{label}</span>
        <span className="num">
          <span className="font-semibold">{value}</span> <span className="text-ink-3">of {goal}</span>
        </span>
      </div>
      <div
        className="mt-1.5 h-2 rounded-sm bg-sunk"
        role="meter"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={goal}
        aria-label={label}
      >
        <div className="h-full rounded-r-[4px] bg-series" style={{ width: `${p * 100}%` }} />
      </div>
    </div>
  );
}
