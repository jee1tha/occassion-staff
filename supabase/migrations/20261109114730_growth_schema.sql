-- Growth ops schema: agent runs, vendor knowledge base, approvals, outcomes, evals, ROI.
-- Private schema: not exposed through the Data API. The ops UI and agent runner connect
-- directly to Postgres. RLS is enabled on every table as defence in depth (no policies =
-- no access for anon/authenticated even if the schema is ever exposed).

create schema if not exists growth;
revoke all on schema growth from public, anon, authenticated;

-- ---------------------------------------------------------------- agents
create table growth.agents (
  key             text primary key,
  name            text not null,
  team            text not null check (team in ('supply', 'demand', 'ops')),
  purpose         text not null,
  model           text not null,
  cadence         text not null,
  autonomy_level  smallint not null default 0 check (autonomy_level between 0 and 3),
  paused          boolean not null default false,
  paused_reason   text,
  sort_order      smallint not null default 0
);

-- ---------------------------------------------------------------- runs
create table growth.agent_runs (
  id               bigint generated always as identity primary key,
  agent_key        text not null references growth.agents (key),
  version          text not null,                 -- git sha of prompts/code
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  status           text not null default 'running'
                   check (status in ('running', 'succeeded', 'failed', 'limit_reached', 'skipped')),
  input_tokens     integer not null default 0,
  output_tokens    integer not null default 0,
  api_equiv_usd    numeric(10, 4) not null default 0, -- claude -p total_cost_usd: list-price estimate, not a charge on a subscription
  items_out        integer not null default 0,
  summary          text,
  error            text
);
create index agent_runs_agent_started_idx on growth.agent_runs (agent_key, started_at desc);
create index agent_runs_status_idx on growth.agent_runs (status) where status in ('failed', 'limit_reached');

-- ---------------------------------------------------------------- vendor KB
create table growth.vendors (
  id                bigint generated always as identity primary key,
  name              text not null,
  website           text,
  domain            text unique,
  uen               text unique,
  category          text not null,
  area              text,
  status            text not null default 'candidate'
                    check (status in ('candidate', 'enriched', 'contacted', 'replied', 'interested',
                                      'claimed', 'published', 'rejected', 'do_not_contact')),
  fit_score         smallint check (fit_score between 0 and 100),
  pitch_angle       text,
  acra_verified     boolean not null default false,
  source            text not null,
  first_seen_run_id bigint references growth.agent_runs (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index vendors_status_fit_idx on growth.vendors (status, fit_score desc);
create index vendors_category_idx on growth.vendors (category);
create index vendors_first_seen_run_idx on growth.vendors (first_seen_run_id);

-- Every fact carries its evidence. A fact without a source never enters the KB.
create table growth.vendor_facts (
  id               bigint generated always as identity primary key,
  vendor_id        bigint not null references growth.vendors (id) on delete cascade,
  field            text not null,
  value            text not null,
  evidence_url     text not null,
  evidence_snippet text not null,
  grounded         boolean not null,   -- deterministic check: value appears in snippet
  fetched_at       timestamptz not null default now(),
  run_id           bigint references growth.agent_runs (id) on delete set null
);
create index vendor_facts_vendor_idx on growth.vendor_facts (vendor_id);
create index vendor_facts_run_idx on growth.vendor_facts (run_id);

create table growth.suppression_list (
  value      text primary key,          -- lower-cased email or domain
  reason     text not null check (reason in ('unsubscribed', 'bounced', 'complaint', 'manual')),
  added_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- approvals
create table growth.approvals (
  id              bigint generated always as identity primary key,
  kind            text not null check (kind in ('outreach_email', 'vendor_profile', 'social_post',
                                                'seo_page', 'nurture_email', 'pr_pitch')),
  agent_key       text not null references growth.agents (key),
  run_id          bigint references growth.agent_runs (id) on delete set null,
  vendor_id       bigint references growth.vendors (id) on delete cascade,
  title           text not null,
  body            text not null,
  checks          jsonb not null default '[]'::jsonb,  -- [{name, passed, detail}]
  status          text not null default 'pending'
                  check (status in ('pending', 'approved', 'edited', 'rejected')),
  edited_body     text,
  decision_note   text,
  review_seconds  integer check (review_seconds >= 0),
  created_at      timestamptz not null default now(),
  decided_at      timestamptz
);
create index approvals_pending_idx on growth.approvals (created_at) where status = 'pending';
create index approvals_agent_idx on growth.approvals (agent_key, decided_at desc);
create index approvals_vendor_idx on growth.approvals (vendor_id);
create index approvals_run_idx on growth.approvals (run_id);

-- ---------------------------------------------------------------- outcomes
create table growth.outcome_events (
  id           bigint generated always as identity primary key,
  vendor_id    bigint references growth.vendors (id) on delete cascade,
  agent_key    text not null references growth.agents (key),
  run_id       bigint references growth.agent_runs (id) on delete set null,
  event        text not null check (event in ('discovered', 'enriched', 'outreach_sent', 'replied',
                                              'interested', 'claimed', 'published', 'first_enquiry',
                                              'unsubscribed', 'bounced')),
  occurred_at  timestamptz not null default now()
);
create index outcome_events_event_time_idx on growth.outcome_events (event, occurred_at);
create index outcome_events_vendor_idx on growth.outcome_events (vendor_id);
create index outcome_events_agent_idx on growth.outcome_events (agent_key, occurred_at);
create index outcome_events_run_idx on growth.outcome_events (run_id);

-- ---------------------------------------------------------------- evals
create table growth.eval_results (
  id         bigint generated always as identity primary key,
  agent_key  text not null references growth.agents (key),
  version    text not null,
  eval_name  text not null,
  kind       text not null check (kind in ('offline', 'online')),
  score      numeric(6, 3) not null,
  threshold  numeric(6, 3) not null,
  higher_is_better boolean not null default true,
  passed     boolean not null,
  run_at     timestamptz not null default now()
);
create index eval_results_agent_name_time_idx on growth.eval_results (agent_key, eval_name, run_at desc);

-- ---------------------------------------------------------------- ROI inputs
create table growth.human_time_log (
  id         bigint generated always as identity primary key,
  agent_key  text not null references growth.agents (key),
  minutes    numeric(6, 1) not null check (minutes > 0),
  note       text,
  logged_at  timestamptz not null default now()
);
create index human_time_log_agent_time_idx on growth.human_time_log (agent_key, logged_at);

-- Value assumptions per agent: what one unit of output would cost to do by hand.
create table growth.roi_assumptions (
  agent_key         text primary key references growth.agents (key),
  unit_event        text not null,            -- outcome_events.event that counts as one unit
  unit_label        text not null,
  manual_minutes    numeric(6, 1) not null check (manual_minutes >= 0)
);

create table growth.settings (
  key    text primary key,
  value  jsonb not null
);

-- ---------------------------------------------------------------- RLS (defence in depth)
alter table growth.agents            enable row level security;
alter table growth.agent_runs        enable row level security;
alter table growth.vendors           enable row level security;
alter table growth.vendor_facts      enable row level security;
alter table growth.suppression_list  enable row level security;
alter table growth.approvals         enable row level security;
alter table growth.outcome_events    enable row level security;
alter table growth.eval_results      enable row level security;
alter table growth.human_time_log    enable row level security;
alter table growth.roi_assumptions   enable row level security;
alter table growth.settings          enable row level security;

-- ---------------------------------------------------------------- ROI view (30-day window)
-- Cash cost on a Claude subscription is S$0 per run; human review time is the real cost.
-- API-equivalent spend is shown for reference only.
create view growth.agent_roi_30d with (security_invoker = true) as
with rate as (
  select (value ->> 'hourly_rate_sgd')::numeric as hourly_rate,
         (value ->> 'usd_to_sgd')::numeric      as usd_to_sgd
  from growth.settings where key = 'roi'
),
runs as (
  select agent_key,
         count(*)                                          as runs,
         count(*) filter (where status = 'succeeded')      as runs_ok,
         count(*) filter (where status = 'limit_reached')  as runs_limited,
         coalesce(sum(api_equiv_usd), 0)                   as api_equiv_usd
  from growth.agent_runs
  where started_at > now() - interval '30 days'
  group by agent_key
),
units as (
  select a.agent_key, count(e.id) as units
  from growth.roi_assumptions a
  left join growth.outcome_events e
    on e.agent_key = a.agent_key and e.event = a.unit_event
   and e.occurred_at > now() - interval '30 days'
  group by a.agent_key
),
human as (
  select agent_key, sum(minutes) as minutes
  from (
    select agent_key, minutes from growth.human_time_log
    where logged_at > now() - interval '30 days'
    union all
    select agent_key, review_seconds / 60.0 from growth.approvals
    where decided_at > now() - interval '30 days' and review_seconds is not null
  ) t
  group by agent_key
)
select ag.key                                    as agent_key,
       ag.name,
       ag.team,
       coalesce(r.runs, 0)                       as runs,
       coalesce(r.runs_ok, 0)                    as runs_ok,
       coalesce(r.runs_limited, 0)               as runs_limited,
       coalesce(r.api_equiv_usd, 0)              as api_equiv_usd,
       ra.unit_label,
       coalesce(u.units, 0)                      as units,
       coalesce(h.minutes, 0)                    as human_minutes,
       round(coalesce(u.units, 0) * coalesce(ra.manual_minutes, 0) / 60.0 * rate.hourly_rate, 2) as value_sgd,
       round(coalesce(h.minutes, 0) / 60.0 * rate.hourly_rate, 2)                               as human_cost_sgd,
       round(coalesce(r.api_equiv_usd, 0) * rate.usd_to_sgd, 2)                                 as api_equiv_sgd
from growth.agents ag
cross join rate
left join runs  r  on r.agent_key  = ag.key
left join units u  on u.agent_key  = ag.key
left join human h  on h.agent_key  = ag.key
left join growth.roi_assumptions ra on ra.agent_key = ag.key;

revoke all on all tables in schema growth from public, anon, authenticated;
