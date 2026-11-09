import "server-only";
import { sql } from "./db";

// All ids/counts are cast to int and numerics to float8 so rows serialise cleanly.

export type AgentStatus = {
  key: string;
  name: string;
  team: "supply" | "demand" | "ops";
  purpose: string;
  routes: RouteSummary[];
  cadence: string;
  autonomy_level: number;
  paused: boolean;
  paused_reason: string | null;
  last_status: string | null;
  last_started: Date | null;
  last_summary: string | null;
  last_error: string | null;
};

export type RouteSummary = {
  role: string;
  purpose: string;
  provider: string;
  model: string;
  fallback_provider: string | null;
  fallback_model: string | null;
};

export async function getAgents() {
  return sql<AgentStatus[]>`
    select a.key, a.name, a.team, a.purpose, a.cadence, a.autonomy_level, a.paused, a.paused_reason,
           r.status as last_status, r.started_at as last_started, r.summary as last_summary, r.error as last_error,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'role', m.role, 'purpose', m.purpose, 'provider', p.name, 'model', m.model,
                      'fallback_provider', f.name, 'fallback_model', m.fallback_model) order by m.role)
             from growth.agent_models m
             join growth.model_providers p on p.key = m.provider_key
             left join growth.model_providers f on f.key = m.fallback_provider_key
             where m.agent_key = a.key
           ), '[]'::jsonb) as routes
    from growth.agents a
    left join lateral (
      select status, started_at, summary, error from growth.agent_runs
      where agent_key = a.key order by started_at desc limit 1
    ) r on true
    order by a.sort_order`;
}

export async function getPendingCount() {
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from growth.approvals where status = 'pending'`;
  return row.n;
}

export async function getAttention() {
  const [row] = await sql<
    { pending: number; failing_checks: number; failed_runs: number; limit_runs: number; last_limit: Date | null }[]
  >`
    select
      (select count(*)::int from growth.approvals where status = 'pending') as pending,
      (select count(*)::int from growth.approvals
         where status = 'pending' and exists (select 1 from jsonb_array_elements(checks) c where (c->>'passed')::boolean = false)) as failing_checks,
      (select count(*)::int from growth.agent_runs where status = 'failed' and started_at > now() - interval '7 days') as failed_runs,
      (select count(*)::int from growth.agent_runs where status = 'limit_reached' and started_at > now() - interval '30 days') as limit_runs,
      (select max(started_at) from growth.agent_runs where status = 'limit_reached') as last_limit`;
  return row;
}

export const FUNNEL = [
  { event: "discovered", label: "Found" },
  { event: "enriched", label: "Verified" },
  { event: "outreach_sent", label: "Emailed" },
  { event: "replied", label: "Replied" },
  { event: "interested", label: "Interested" },
  { event: "claimed", label: "Claimed profile" },
  { event: "published", label: "Published" },
  { event: "first_enquiry", label: "First enquiry" },
] as const;

export async function getFunnel() {
  const rows = await sql<{ event: string; n: number }[]>`
    select event, count(distinct vendor_id)::int as n from growth.outcome_events group by event`;
  const map = new Map(rows.map((r) => [r.event, r.n]));
  return FUNNEL.map((s) => ({ ...s, n: map.get(s.event) ?? 0 }));
}

export type RoiRow = {
  agent_key: string;
  name: string;
  team: string;
  runs: number;
  runs_ok: number;
  runs_limited: number;
  unit_label: string | null;
  units: number;
  human_minutes: number;
  value_sgd: number;
  human_cost_sgd: number;
  api_equiv_sgd: number;
};

export async function getRoi() {
  return sql<RoiRow[]>`
    select r.agent_key, r.name, r.team, r.runs::int, r.runs_ok::int, r.runs_limited::int, r.unit_label,
           r.units::int, r.human_minutes::float8, r.value_sgd::float8, r.human_cost_sgd::float8, r.api_equiv_sgd::float8
    from growth.agent_roi_30d r join growth.agents a on a.key = r.agent_key
    order by a.sort_order`;
}

export async function getWeeklyKb() {
  return sql<{ week: Date; discovered: number; enriched: number; published: number }[]>`
    with weeks as (
      select generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') as week
    )
    select w.week,
           count(e.id) filter (where e.event = 'discovered')::int as discovered,
           count(e.id) filter (where e.event = 'enriched')::int   as enriched,
           count(e.id) filter (where e.event = 'published')::int  as published
    from weeks w
    left join growth.outcome_events e on date_trunc('week', e.occurred_at) = w.week
    group by w.week order by w.week`;
}

export type EvalRow = {
  agent_key: string;
  agent_name: string;
  eval_name: string;
  kind: string;
  threshold: number;
  higher_is_better: boolean;
  provider_key: string | null;
  model: string | null;
  history: { score: number; passed: boolean; run_at: string }[];
};

/** Trend for each eval, on the model each agent currently uses. Trials of other models are in getModelComparison. */
export async function getEvals() {
  return sql<EvalRow[]>`
    select e.agent_key, a.name as agent_name, e.eval_name, max(e.kind) as kind,
           (array_agg(e.threshold order by e.run_at desc))[1]::float8 as threshold,
           bool_and(e.higher_is_better) as higher_is_better,
           e.provider_key, e.model,
           jsonb_agg(jsonb_build_object('score', e.score::float8, 'passed', e.passed, 'run_at', e.run_at) order by e.run_at) as history
    from growth.eval_results e join growth.agents a on a.key = e.agent_key
    where e.provider_key is null or exists (
      select 1 from growth.agent_models m
      where m.agent_key = e.agent_key and m.provider_key = e.provider_key and m.model = e.model)
    group by e.agent_key, a.name, a.sort_order, e.eval_name, e.provider_key, e.model
    order by a.sort_order, e.eval_name`;
}

export type ComparisonRow = {
  agent_key: string;
  agent_name: string;
  eval_name: string;
  threshold: number;
  higher_is_better: boolean;
  results: { provider: string; model: string; score: number; passed: boolean; run_at: string; in_use: boolean }[];
};

/** Latest test-set score per model, for evals that more than one model has been tried on. */
export async function getModelComparison() {
  return sql<ComparisonRow[]>`
    with latest as (
      select distinct on (e.agent_key, e.eval_name, e.provider_key, e.model)
             e.agent_key, e.eval_name, e.provider_key, e.model, e.score, e.threshold, e.higher_is_better, e.passed, e.run_at
      from growth.eval_results e
      where e.kind = 'offline' and e.provider_key is not null
      order by e.agent_key, e.eval_name, e.provider_key, e.model, e.run_at desc
    )
    select l.agent_key, a.name as agent_name, l.eval_name,
           max(l.threshold)::float8 as threshold, bool_and(l.higher_is_better) as higher_is_better,
           jsonb_agg(jsonb_build_object(
             'provider', coalesce(p.name, l.provider_key), 'model', l.model, 'score', l.score::float8,
             'passed', l.passed, 'run_at', l.run_at,
             'in_use', exists (select 1 from growth.agent_models m
                               where m.agent_key = l.agent_key and m.provider_key = l.provider_key and m.model = l.model))
             order by l.score desc) as results
    from latest l
    join growth.agents a on a.key = l.agent_key
    left join growth.model_providers p on p.key = l.provider_key
    group by l.agent_key, a.name, a.sort_order, l.eval_name
    having count(*) > 1
    order by a.sort_order, l.eval_name`;
}

export type Provider = {
  key: string;
  name: string;
  kind: "claude_code" | "openai_compatible" | "command";
  billing: "subscription" | "local" | "paid";
  base_url: string | null;
  command: string[] | null;
  api_key_env: string | null;
  models: string[];
  enabled: boolean;
  notes: string | null;
  last_checked_at: Date | null;
  last_ok: boolean | null;
  last_latency_ms: number | null;
  last_detail: string | null;
  used_by: number;
};

export async function getProviders() {
  return sql<Provider[]>`
    select p.key, p.name, p.kind, p.billing, p.base_url, p.command, p.api_key_env, p.models, p.enabled, p.notes,
           p.last_checked_at, p.last_ok, p.last_latency_ms, p.last_detail,
           (select count(*)::int from growth.agent_models m
            where m.provider_key = p.key or m.fallback_provider_key = p.key) as used_by
    from growth.model_providers p
    order by (p.kind = 'claude_code') desc, p.enabled desc, p.name`;
}

export type RouteRow = {
  agent_key: string;
  agent_name: string;
  role: string;
  purpose: string;
  provider_key: string;
  model: string;
  fallback_provider_key: string | null;
  fallback_model: string | null;
};

export async function getRoutes() {
  return sql<RouteRow[]>`
    select m.agent_key, a.name as agent_name, m.role, m.purpose, m.provider_key, m.model,
           m.fallback_provider_key, m.fallback_model
    from growth.agent_models m join growth.agents a on a.key = m.agent_key
    order by a.sort_order, m.role`;
}

export async function getAllowPaid() {
  const [row] = await sql<{ allow: boolean | null }[]>`
    select (value ->> 'allow_paid_models')::boolean as allow from growth.settings where key = 'guardrails'`;
  return row?.allow ?? false;
}

export type Check = { name: string; passed: boolean; detail: string };
export type Approval = {
  id: number;
  kind: string;
  agent_key: string;
  agent_name: string;
  vendor_id: number | null;
  vendor_name: string | null;
  title: string;
  body: string;
  checks: Check[];
  status: string;
  created_at: Date;
};

export async function getPendingApprovals() {
  return sql<Approval[]>`
    select ap.id::int, ap.kind, ap.agent_key, a.name as agent_name, ap.vendor_id::int, v.name as vendor_name,
           ap.title, ap.body, ap.checks, ap.status, ap.created_at
    from growth.approvals ap
    join growth.agents a on a.key = ap.agent_key
    left join growth.vendors v on v.id = ap.vendor_id
    where ap.status = 'pending'
    order by ap.created_at`;
}

export async function getRecentDecisions(limit = 8) {
  return sql<{ id: number; title: string; status: string; decided_at: Date; decision_note: string | null; review_seconds: number | null }[]>`
    select id::int, title, status, decided_at, decision_note, review_seconds
    from growth.approvals where status <> 'pending' and decided_at is not null
    order by decided_at desc limit ${limit}`;
}

export type Fact = {
  id: number;
  field: string;
  value: string;
  evidence_url: string;
  evidence_snippet: string;
  grounded: boolean;
  fetched_at: Date;
};

export async function getFacts(vendorId: number) {
  return sql<Fact[]>`
    select id::int, field, value, evidence_url, evidence_snippet, grounded, fetched_at
    from growth.vendor_facts where vendor_id = ${vendorId} order by field`;
}

export type Vendor = {
  id: number;
  name: string;
  website: string | null;
  domain: string | null;
  uen: string | null;
  category: string;
  area: string | null;
  status: string;
  fit_score: number | null;
  pitch_angle: string | null;
  acra_verified: boolean;
  source: string;
  created_at: Date;
  updated_at: Date;
  ungrounded: number;
};

export async function getVendors(filter: { status?: string; category?: string; q?: string }) {
  const { status, category, q } = filter;
  return sql<Vendor[]>`
    select v.id::int, v.name, v.website, v.domain, v.uen, v.category, v.area, v.status, v.fit_score, v.pitch_angle,
           v.acra_verified, v.source, v.created_at, v.updated_at,
           (select count(*)::int from growth.vendor_facts f where f.vendor_id = v.id and not f.grounded) as ungrounded
    from growth.vendors v
    where true
      ${status ? sql`and v.status = ${status}` : sql``}
      ${category ? sql`and v.category = ${category}` : sql``}
      ${q ? sql`and (v.name ilike ${"%" + q + "%"} or v.domain ilike ${"%" + q + "%"} or v.area ilike ${"%" + q + "%"})` : sql``}
    order by v.fit_score desc nulls last, v.created_at desc
    limit 300`;
}

export async function getVendorFacets() {
  const [row] = await sql<{ statuses: { status: string; n: number }[]; categories: { category: string; n: number }[] }[]>`
    select
      (select jsonb_agg(jsonb_build_object('status', status, 'n', n) order by n desc)
         from (select status, count(*)::int n from growth.vendors group by status) s) as statuses,
      (select jsonb_agg(jsonb_build_object('category', category, 'n', n) order by category)
         from (select category, count(*)::int n from growth.vendors group by category) c) as categories`;
  return row;
}

export async function getVendor(id: number) {
  const [v] = await sql<Vendor[]>`
    select v.id::int, v.name, v.website, v.domain, v.uen, v.category, v.area, v.status, v.fit_score, v.pitch_angle,
           v.acra_verified, v.source, v.created_at, v.updated_at, 0 as ungrounded
    from growth.vendors v where v.id = ${id}`;
  return v ?? null;
}

export async function getVendorTimeline(id: number) {
  return sql<{ event: string; agent_name: string; occurred_at: Date }[]>`
    select e.event, a.name as agent_name, e.occurred_at
    from growth.outcome_events e join growth.agents a on a.key = e.agent_key
    where e.vendor_id = ${id} order by e.occurred_at`;
}

export async function getVendorApprovals(id: number) {
  return sql<{ id: number; title: string; status: string; created_at: Date; decided_at: Date | null }[]>`
    select id::int, title, status, created_at, decided_at from growth.approvals where vendor_id = ${id} order by created_at`;
}

export type Run = {
  id: number;
  agent_key: string;
  agent_name: string;
  version: string;
  started_at: Date;
  ended_at: Date | null;
  status: string;
  input_tokens: number;
  output_tokens: number;
  api_equiv_usd: number;
  summary: string | null;
  error: string | null;
  provider: string | null;
  model: string | null;
  used_fallback: boolean;
};

export async function getRuns(agentKey?: string, limit = 40) {
  return sql<Run[]>`
    select r.id::int, r.agent_key, a.name as agent_name, r.version, r.started_at, r.ended_at, r.status,
           r.input_tokens, r.output_tokens, r.api_equiv_usd::float8, r.summary, r.error,
           coalesce(p.name, r.provider_key) as provider, r.model, r.used_fallback
    from growth.agent_runs r join growth.agents a on a.key = r.agent_key
    left join growth.model_providers p on p.key = r.provider_key
    ${agentKey ? sql`where r.agent_key = ${agentKey}` : sql``}
    order by r.started_at desc limit ${limit}`;
}

export type Settings = {
  brand: { name: string; placeholder: boolean };
  roi: { hourly_rate_sgd: number; usd_to_sgd: number };
  guardrails: { bounce_rate_max: number; complaint_rate_max: number; daily_send_cap: number; allow_paid_models: boolean };
};

export async function getSettings(): Promise<Settings> {
  const rows = await sql<{ key: string; value: unknown }[]>`select key, value from growth.settings`;
  return Object.fromEntries(rows.map((r) => [r.key, r.value])) as Settings;
}

export async function getRoiAssumptions() {
  return sql<{ agent_key: string; name: string; unit_event: string; unit_label: string; manual_minutes: number }[]>`
    select r.agent_key, a.name, r.unit_event, r.unit_label, r.manual_minutes::float8
    from growth.roi_assumptions r join growth.agents a on a.key = r.agent_key order by a.sort_order`;
}
