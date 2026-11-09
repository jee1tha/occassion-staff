import { AlertTriangle, Check, CircleSlash, Loader, Pause, X } from "lucide-react";
import clsx from "clsx";

type Tone = "good" | "warn" | "bad" | "neutral";

const RUN: Record<string, { label: string; tone: Tone; Icon: typeof Check }> = {
  succeeded: { label: "Succeeded", tone: "good", Icon: Check },
  failed: { label: "Failed", tone: "bad", Icon: X },
  limit_reached: { label: "Usage limit", tone: "warn", Icon: Pause },
  running: { label: "Running", tone: "neutral", Icon: Loader },
  skipped: { label: "Skipped", tone: "neutral", Icon: CircleSlash },
};

const toneClass: Record<Tone, string> = {
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  neutral: "bg-sunk text-ink-2",
};

export function Pill({ tone, children, icon: Icon }: { tone: Tone; children: React.ReactNode; icon?: typeof Check }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
        toneClass[tone],
      )}
    >
      {Icon && <Icon aria-hidden className="size-3.5" strokeWidth={2.25} />}
      {children}
    </span>
  );
}

export function RunStatus({ status }: { status: string | null }) {
  if (!status) return <Pill tone="neutral">No runs yet</Pill>;
  const s = RUN[status] ?? { label: status, tone: "neutral" as Tone, Icon: CircleSlash };
  return (
    <Pill tone={s.tone} icon={s.Icon}>
      {s.label}
    </Pill>
  );
}

export function PassFail({ passed, children }: { passed: boolean; children?: React.ReactNode }) {
  return (
    <Pill tone={passed ? "good" : "bad"} icon={passed ? Check : AlertTriangle}>
      {children ?? (passed ? "Pass" : "Fail")}
    </Pill>
  );
}

/** Small light used in the rail: colour + shape so state never relies on colour alone. */
export function Light({ status, paused }: { status: string | null; paused: boolean }) {
  const label = paused ? "Paused" : status ? (RUN[status]?.label ?? status) : "No runs yet";
  const cls = paused
    ? "bg-warn rounded-[1px]"
    : status === "succeeded"
      ? "bg-good rounded-full"
      : status === "failed"
        ? "bg-bad rotate-45 rounded-[1px]"
        : status === "limit_reached"
          ? "bg-warn rounded-[1px]"
          : "border border-ink-3 rounded-full";
  return <span role="img" aria-label={label} title={label} className={clsx("inline-block size-2 shrink-0", cls)} />;
}
