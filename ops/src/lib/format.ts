const TZ = "Asia/Singapore";

export function sgd(n: number, digits = 0) {
  return `S$${n.toLocaleString("en-SG", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function pct(n: number, digits = 0) {
  return `${(n * 100).toFixed(digits)}%`;
}

export function dateTime(d: Date | string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-SG", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function shortDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-SG", { timeZone: TZ, day: "numeric", month: "short" });
}

export function ago(d: Date | string | null, now = Date.now()) {
  if (!d) return "never";
  const s = Math.round((now - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function duration(a: Date | string, b: Date | string | null) {
  if (!b) return "running";
  const m = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
  return m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

export const STATUS_LABEL: Record<string, string> = {
  candidate: "Candidate",
  enriched: "Verified",
  contacted: "Emailed",
  replied: "Replied",
  interested: "Interested",
  claimed: "Claimed",
  published: "Published",
  rejected: "Out of scope",
  do_not_contact: "Do not contact",
};

export const KIND_LABEL: Record<string, string> = {
  outreach_email: "Cold email",
  vendor_profile: "Draft profile",
  social_post: "Social post",
  seo_page: "SEO page",
  nurture_email: "Nurture email",
  pr_pitch: "PR pitch",
};

export const AUTONOMY: Record<number, { short: string; long: string }> = {
  0: { short: "L0, approve each", long: "Drafts only. You approve every item." },
  1: { short: "L1, approve batch", long: "You skim and approve a batch." },
  2: { short: "L2, spot check", long: "Sends by itself. You review a sample." },
  3: { short: "L3, autonomous", long: "Runs on its own. Weekly report only." },
};
