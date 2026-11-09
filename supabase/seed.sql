-- SAMPLE DATA for local development only. All vendors are fictional and use the reserved
-- `.example` TLD so nothing here can ever be contacted. Times are relative to now().

select setseed(0.42);

insert into growth.settings (key, value) values
  ('brand', '{"name": "Occasion", "placeholder": true}'),
  ('roi', '{"hourly_rate_sgd": 40, "usd_to_sgd": 1.30}'),
  ('guardrails', '{"bounce_rate_max": 0.02, "complaint_rate_max": 0.001, "daily_send_cap": 30, "allow_paid_models": false}');

insert into growth.agents (key, name, team, purpose, cadence, autonomy_level, sort_order) values
  ('scout',      'Vendor Scout',    'supply', 'Finds SG event vendors not yet in the knowledge base', 'Weekly, Sun 22:00', 3, 1),
  ('enricher',   'Enricher',        'supply', 'Verifies and scores each vendor, with evidence for every fact', 'Weekly, Mon 01:00', 3, 2),
  ('outreach',   'Outreach',        'supply', 'Drafts cold emails and follow-ups, classifies replies', 'Drafts Mon 03:00, sends daily', 0, 3),
  ('onboarding', 'Onboarding',      'supply', 'Builds draft profiles for interested vendors and nudges them to publish', 'On reply + weekly nudges', 0, 4),
  ('marketer',   'Growth Marketer', 'demand', 'Weekly marketing plan plus SEO, social and email drafts', 'Weekly, Mon 06:00', 0, 5),
  ('analyst',    'Analyst',         'ops',    'Weekly numbers from logged queries, anomaly flags', 'Weekly, Mon 07:00', 3, 6),
  ('chief',      'Chief of Staff',  'ops',    'Runs the weekly pipeline and sends the Monday brief', 'Weekly, Mon 09:00', 3, 7);

-- Model providers. Only `claude` is live by default; the local ones are ready to switch on
-- once the server is installed. The example command provider is the template for plugging
-- in your own local agent (see runner/README.md).
insert into growth.model_providers (key, name, kind, billing, base_url, command, models, enabled, notes) values
  ('claude',   'Claude subscription', 'claude_code',       'subscription', null, null,
               '{haiku,sonnet,opus}', true, 'Headless claude -p. Stops at the plan''s usage limit, never bills extra.'),
  ('ollama',   'Ollama on this Mac',  'openai_compatible', 'local', 'http://127.0.0.1:11434/v1', null,
               '{qwen3:8b,qwen3:14b,gemma3:12b}', true, 'Install from ollama.com, then: ollama pull qwen3:8b'),
  ('lmstudio', 'LM Studio',           'openai_compatible', 'local', 'http://127.0.0.1:1234/v1', null,
               '{}', false, 'Start the local server in LM Studio, then add the model ids you load.'),
  ('echo',     'Example local agent', 'command',           'local', null, '{node,runner/examples/echo-agent.ts}',
               '{echo}', false, 'Template for your own agent: reads a JSON request on stdin, prints a JSON reply.');

insert into growth.agent_models (agent_key, role, purpose, provider_key, model, fallback_provider_key, fallback_model) values
  ('scout',      'main',    'Classify candidates as in or out of scope', 'claude', 'haiku',  'ollama', 'qwen3:8b'),
  ('enricher',   'extract', 'Pull facts from vendor pages',              'claude', 'haiku',  'ollama', 'qwen3:8b'),
  ('enricher',   'score',   'Fit score and pitch angle',                 'claude', 'sonnet', null, null),
  ('outreach',   'draft',   'Write first emails and follow-ups',         'claude', 'sonnet', null, null),
  ('outreach',   'classify','Sort replies by intent',                    'claude', 'haiku',  'ollama', 'qwen3:8b'),
  ('onboarding', 'draft',   'Draft vendor profiles',                     'claude', 'sonnet', null, null),
  ('marketer',   'draft',   'Plan and draft marketing content',          'claude', 'sonnet', null, null),
  ('analyst',    'main',    'Explain the week''s numbers',               'claude', 'sonnet', null, null),
  ('chief',      'main',    'Write the Monday brief',                    'claude', 'haiku',  'ollama', 'qwen3:8b');

insert into growth.roi_assumptions (agent_key, unit_event, unit_label, manual_minutes) values
  ('scout',      'discovered',    'vendors found',      4),
  ('enricher',   'enriched',      'vendors verified',   12),
  ('outreach',   'outreach_sent', 'emails sent',        8),
  ('onboarding', 'published',     'profiles published', 45);

do $$
declare
  w int;
  wk_start timestamptz;
  run_id bigint;
  cats text[] := array['Photography','Videography','Florist','Decor & Styling','Catering',
                       'Cakes & Desserts','Makeup & Hair','Event Planner','Entertainment & DJ','Bridal Wear'];
  nouns text[] := array['Studio','Atelier','Co.','House','Collective','Works','Lab','& Co','Room','Social'];
  firsts text[] := array['Lumen','Saffron','Kampong','Orchid','Juniper','Pandan','Marigold','Tembusu','Halcyon',
                         'Cendol','Ivory','Banyan','Monsoon','Jasmine','Kopi','Lotus','Peranakan','Merlion',
                         'Sago','Rambutan','Atlas','Copper','Little','Golden','Indigo','Ember','Willow','Kaya',
                         'Nutmeg','Selat','Dunearn','Joo Chiat','Katong','Rochor','Bukit','Sentosa'];
  areas text[] := array['Tampines','Jurong East','Bishan','Tiong Bahru','Paya Lebar','Toa Payoh','Bukit Timah',
                        'Woodlands','Punggol','Kallang','Geylang','Novena','Clementi','Serangoon'];
  angles text[] := array['Bookings only via Instagram DMs','No pricing on website','New business, under 2 years',
                         'Strong portfolio, few reviews','Website has no enquiry form','Active on XHS, no website reviews'];
  statuses text[];
  st text; nm text; price int; grounded_price boolean; dom text; cat text; v_id bigint; fit int; seen_week int; i int; ev_time timestamptz;
  scout_runs bigint[] := '{}'; enrich_runs bigint[] := '{}'; outreach_runs bigint[] := '{}'; onboard_runs bigint[] := '{}';
begin
  -- 6 weeks of runs. Week 1 = oldest.
  for w in 1..6 loop
    wk_start := date_trunc('week', now()) - make_interval(weeks => 6 - w) - interval '1 day' + interval '14 hours'; -- Sun 22:00 SGT

    insert into growth.agent_runs (agent_key, version, started_at, ended_at, status, input_tokens, output_tokens, api_equiv_usd, items_out, summary)
    values ('scout', 'a1c' || w, wk_start, wk_start + interval '23 minutes', 'succeeded',
            180000 + (random()*40000)::int, 22000 + (random()*6000)::int, round((0.9 + random()*0.4)::numeric, 4), 0,
            'Searched ACRA SSIC list, Places text search and vendor sites')
    returning id into run_id;
    scout_runs := scout_runs || run_id;

    if w = 4 then
      insert into growth.agent_runs (agent_key, version, started_at, ended_at, status, input_tokens, output_tokens, api_equiv_usd, items_out, summary, error)
      values ('enricher', 'b7e' || w, wk_start + interval '3 hours', wk_start + interval '3 hours 41 minutes', 'limit_reached',
              410000, 52000, 2.1100, 0, 'Stopped after 31 of 44 vendors', 'You''ve hit your session limit. Pipeline paused until reset.');
    end if;
    insert into growth.agent_runs (agent_key, version, started_at, ended_at, status, input_tokens, output_tokens, api_equiv_usd, items_out, summary)
    values ('enricher', 'b7e' || w, wk_start + interval '3 hours' + case when w = 4 then interval '6 hours' else interval '0' end,
            wk_start + interval '4 hours' + case when w = 4 then interval '6 hours' else interval '0' end, 'succeeded',
            520000 + (random()*90000)::int, 64000 + (random()*9000)::int, round((2.6 + random()*0.8)::numeric, 4), 0,
            'Fetched sites, extracted facts with evidence, checked ACRA status, scored fit')
    returning id into run_id;
    enrich_runs := enrich_runs || run_id;

    if w >= 3 then
      insert into growth.agent_runs (agent_key, version, started_at, ended_at, status, input_tokens, output_tokens, api_equiv_usd, items_out, summary)
      values ('outreach', 'c2d' || w, wk_start + interval '5 hours', wk_start + interval '5 hours 18 minutes', 'succeeded',
              140000 + (random()*20000)::int, 31000, round((1.1 + random()*0.3)::numeric, 4), 0, 'Drafted first emails and follow-ups for approval')
      returning id into run_id;
      outreach_runs := outreach_runs || run_id;
    end if;
    if w >= 5 then
      insert into growth.agent_runs (agent_key, version, started_at, ended_at, status, input_tokens, output_tokens, api_equiv_usd, items_out, summary)
      values ('onboarding', 'd0f' || w, wk_start + interval '6 hours', wk_start + interval '6 hours 9 minutes', 'succeeded',
              60000, 18000, 0.5200, 0, 'Built draft profiles, sent claim reminders')
      returning id into run_id;
      onboard_runs := onboard_runs || run_id;
      insert into growth.agent_runs (agent_key, version, started_at, ended_at, status, input_tokens, output_tokens, api_equiv_usd, items_out, summary)
      values ('chief', 'e11' || w, wk_start + interval '11 hours', wk_start + interval '11 hours 6 minutes', 'succeeded',
              90000, 12000, 0.6100, 1, 'Monday brief sent');
    end if;
  end loop;

  -- One failed scout run this week to show error handling.
  insert into growth.agent_runs (agent_key, version, started_at, ended_at, status, api_equiv_usd, summary, error)
  values ('scout', 'a1c6', now() - interval '20 hours', now() - interval '19 hours 58 minutes', 'failed', 0.0400,
          'Aborted at start', 'data.gov.sg dataset endpoint returned 503 three times');

  -- ~180 vendors with a funnel-shaped status mix.
  statuses := array_fill('candidate'::text, array[40]) || array_fill('enriched'::text, array[72])
           || array_fill('contacted'::text, array[36]) || array_fill('replied'::text, array[6])
           || array_fill('interested'::text, array[7]) || array_fill('claimed'::text, array[5])
           || array_fill('published'::text, array[9]) || array_fill('rejected'::text, array[5])
           || array_fill('do_not_contact'::text, array[2]);

  for i in 1..array_length(statuses, 1) loop
    st  := statuses[i];
    cat := cats[1 + (i % array_length(cats, 1))];
    nm  := firsts[1 + ((i * 7) % array_length(firsts, 1))] || ' ' || nouns[1 + ((i * 3) % array_length(nouns, 1))];
    nm  := case cat when 'Photography' then nm || ' Photography' when 'Florist' then nm || ' Florals'
                    when 'Catering' then nm || ' Kitchen' when 'Cakes & Desserts' then nm || ' Bakes'
                    when 'Makeup & Hair' then nm || ' Beauty' else nm end;
    dom := lower(regexp_replace(nm, '[^A-Za-z]', '', 'g')) || i || '.example';
    fit := case when st = 'candidate' then null when st = 'rejected' then 20 + (random()*25)::int
                else 45 + (random()*50)::int end;
    -- later funnel stages were found earlier
    seen_week := case when st in ('published','claimed','interested','replied','do_not_contact') then 1 + (random()*2)::int
                      when st = 'contacted' then 2 + (random()*2)::int
                      when st in ('enriched','rejected') then 3 + (random()*2)::int
                      else 6 end;

    insert into growth.vendors (name, website, domain, uen, category, area, status, fit_score, pitch_angle,
                                acra_verified, source, first_seen_run_id, created_at, updated_at)
    values (nm, 'https://' || dom, dom,
            case when random() < 0.85 then '20' || (18 + (random()*7)::int) || lpad(((random()*99999)::int)::text, 5, '0') || chr(65 + (random()*25)::int) end,
            cat, areas[1 + ((i * 5) % array_length(areas, 1))], st, fit,
            case when st <> 'candidate' then angles[1 + (i % array_length(angles, 1))] end,
            st <> 'candidate' and random() < 0.9,
            (array['ACRA SSIC match','Places text search','Vendor website','Directory lead'])[1 + (i % 4)],
            scout_runs[seen_week], now() - make_interval(weeks => 6 - seen_week), now() - make_interval(days => (random()*5)::int))
    returning id into v_id;

    ev_time := now() - make_interval(weeks => 6 - seen_week);
    insert into growth.outcome_events (vendor_id, agent_key, run_id, event, occurred_at)
    values (v_id, 'scout', scout_runs[seen_week], 'discovered', ev_time);

    if st = 'candidate' then continue; end if;

    ev_time := ev_time + interval '4 hours';
    insert into growth.outcome_events (vendor_id, agent_key, run_id, event, occurred_at)
    values (v_id, 'enricher', enrich_runs[seen_week], 'enriched', ev_time);

    price := 300 + (random()*25)::int * 100;
    grounded_price := random() > 0.12;
    insert into growth.vendor_facts (vendor_id, field, value, evidence_url, evidence_snippet, grounded, fetched_at, run_id) values
      (v_id, 'email', 'hello@' || dom, 'https://' || dom || '/contact', 'Drop us a note at hello@' || dom || ' and we reply within a day.', true, ev_time, enrich_runs[seen_week]),
      (v_id, 'services', cat, 'https://' || dom || '/services', 'Our ' || lower(cat) || ' packages cover weddings, ROM ceremonies and corporate events.', true, ev_time, enrich_runs[seen_week]),
      (v_id, 'price_from', 'S$' || price, 'https://' || dom || '/packages',
       case when grounded_price then 'Packages from S$' || price || ', GST inclusive.'
            else 'Packages are tailored to each event. Contact us for a quote.' end,
       grounded_price, ev_time, enrich_runs[seen_week]),
      (v_id, 'instagram', '@' || split_part(dom, '.', 1), 'https://' || dom, 'Follow our latest work on Instagram @' || split_part(dom, '.', 1), true, ev_time, enrich_runs[seen_week]),
      (v_id, 'service_area', 'Islandwide', 'https://' || dom || '/faq', 'We serve clients islandwide, including Sentosa.', true, ev_time, enrich_runs[seen_week]);

    if st in ('enriched', 'rejected') then continue; end if;

    -- outreach was approved by a human (L0), then sent
    ev_time := now() - make_interval(weeks => greatest(0, 6 - (seen_week + 2))) + interval '6 hours';
    if ev_time > now() then ev_time := now() - interval '2 days'; end if;
    insert into growth.approvals (kind, agent_key, run_id, vendor_id, title, body, checks, status, edited_body, review_seconds, created_at, decided_at)
    values ('outreach_email', 'outreach', outreach_runs[1 + (i % greatest(array_length(outreach_runs,1),1))], v_id,
            'First email to ' || nm, 'Hi ' || nm || ' team, …', '[]', case when random() < 0.78 then 'approved' else 'edited' end,
            null, 35 + (random()*110)::int, ev_time - interval '5 hours', ev_time - interval '1 hour');
    insert into growth.outcome_events (vendor_id, agent_key, event, occurred_at) values (v_id, 'outreach', 'outreach_sent', ev_time);

    if st = 'contacted' then continue; end if;
    if st = 'do_not_contact' then
      insert into growth.outcome_events (vendor_id, agent_key, event, occurred_at) values (v_id, 'outreach', 'unsubscribed', ev_time + interval '1 day');
      insert into growth.suppression_list (value, reason, added_at) values ('hello@' || dom, 'unsubscribed', ev_time + interval '1 day');
      continue;
    end if;

    insert into growth.outcome_events (vendor_id, agent_key, event, occurred_at) values (v_id, 'outreach', 'replied', ev_time + interval '2 days');
    if st = 'replied' then continue; end if;
    insert into growth.outcome_events (vendor_id, agent_key, event, occurred_at) values (v_id, 'outreach', 'interested', ev_time + interval '2 days 2 hours');
    if st = 'interested' then continue; end if;
    insert into growth.outcome_events (vendor_id, agent_key, run_id, event, occurred_at) values (v_id, 'onboarding', onboard_runs[1], 'claimed', ev_time + interval '5 days');
    if st = 'claimed' then continue; end if;
    insert into growth.outcome_events (vendor_id, agent_key, run_id, event, occurred_at) values (v_id, 'onboarding', onboard_runs[1], 'published', least(now() - interval '1 day', ev_time + interval '8 days'));
    if random() < 0.5 then
      insert into growth.outcome_events (vendor_id, agent_key, event, occurred_at) values (v_id, 'onboarding', 'first_enquiry', least(now() - interval '6 hours', ev_time + interval '12 days'));
    end if;
  end loop;

  -- A few rejected drafts (history), to show reasons.
  insert into growth.approvals (kind, agent_key, run_id, vendor_id, title, body, checks, status, decision_note, review_seconds, created_at, decided_at)
  select 'outreach_email', 'outreach', outreach_runs[1], id, 'First email to ' || name, 'Hi ' || name || ' team, …', '[]', 'rejected',
         'Vendor is a venue, not in scope', 50, now() - interval '9 days', now() - interval '9 days'
  from growth.vendors where status = 'rejected' limit 3;

  -- Human time outside approvals (fixing records, checking samples).
  insert into growth.human_time_log (agent_key, minutes, note, logged_at) values
    ('scout', 20, 'Weekly precision sample (20 vendors)', now() - interval '8 days'),
    ('scout', 20, 'Weekly precision sample (20 vendors)', now() - interval '1 day'),
    ('enricher', 35, 'Fixed price fields on 6 records', now() - interval '12 days'),
    ('enricher', 15, 'Re-ran after usage limit', now() - interval '15 days'),
    ('outreach', 25, 'Reworked follow-up template', now() - interval '6 days'),
    ('onboarding', 40, 'Claim call with 2 vendors', now() - interval '3 days');
end $$;

-- ---------------------------------------------------------------- pending approvals (the live queue)
with picks as (
  select v.*, row_number() over (order by v.fit_score desc nulls last) as rn,
         coalesce((select f.grounded from growth.vendor_facts f where f.vendor_id = v.id and f.field = 'price_from'), false) as price_grounded
  from growth.vendors v where v.status = 'enriched'
)
insert into growth.approvals (kind, agent_key, run_id, vendor_id, title, body, checks, created_at)
select 'outreach_email', 'outreach',
       (select max(id) from growth.agent_runs where agent_key = 'outreach'),
       p.id,
       'First email to ' || p.name,
       format(
'Subject: A free profile for %1$s on Occasion

Hi %1$s team,

I came across your %2$s work while putting together a list of %3$s-based vendors, and the packages page on %4$s stood out. Clear pricing is rare.

We''re building Occasion, a Singapore marketplace where couples and event planners compare vendors and send enquiries in one place. We''re inviting 150 founding vendors: a free premium profile for 12 months and a featured slot in %2$s.

We can set up the profile for you from your existing site, and you just approve it. Would that be useful?

Best,
[Your name]
Occasion, [Business address]

Not interested? Reply "stop" or unsubscribe: [link]. We won''t email again.',
         p.name, lower(p.category), p.area, p.domain),
       jsonb_build_array(
         jsonb_build_object('name', 'Sender identity and address', 'passed', true, 'detail', 'Name and business address in footer'),
         jsonb_build_object('name', 'Unsubscribe works', 'passed', true, 'detail', 'Link + reply "stop" handled within 24h'),
         jsonb_build_object('name', 'Not on suppression list', 'passed', true, 'detail', 'Checked hello@' || p.domain),
         jsonb_build_object('name', 'Personal facts grounded', 'passed', p.price_grounded,
                            'detail', case when not p.price_grounded then 'Claim "clear pricing" has no evidence: the packages page gives no price' else '2 of 2 facts match evidence' end),
         jsonb_build_object('name', 'Under 120 words', 'passed', true, 'detail', '104 words'),
         jsonb_build_object('name', '<ADV> label', 'passed', true, 'detail', 'Not required: below bulk threshold this week')
       ),
       now() - make_interval(hours => (p.rn * 3)::int)
from picks p where p.rn <= 7;

-- Make sure the queue shows one draft that fails grounding.
update growth.approvals ap set checks = jsonb_set(ap.checks, '{3}',
  '{"name": "Personal facts grounded", "passed": false, "detail": "Claim \"clear pricing\" has no evidence: the packages page gives no price"}')
where ap.id = (select id from growth.approvals where status = 'pending' and kind = 'outreach_email' order by created_at offset 2 limit 1);
update growth.vendor_facts set grounded = false, evidence_snippet = 'Packages are tailored to each event. Contact us for a quote.'
where field = 'price_from' and vendor_id = (select vendor_id from growth.approvals where status = 'pending' and kind = 'outreach_email' order by created_at offset 2 limit 1);

insert into growth.approvals (kind, agent_key, run_id, vendor_id, title, body, checks, created_at)
select 'vendor_profile', 'onboarding',
       (select max(id) from growth.agent_runs where agent_key = 'onboarding'),
       v.id,
       'Draft profile for ' || v.name,
       format(
'%1$s
%2$s in %3$s, serves islandwide

About
%1$s offers %4$s for weddings, ROM ceremonies and corporate events across Singapore.

Packages
From %5$s (GST inclusive)

Links
Website: %6$s
Instagram: %7$s

Photos: 12 portfolio links found. Shown only after the vendor approves.',
         v.name, v.category, v.area, lower(v.category),
         (select value from growth.vendor_facts f where f.vendor_id = v.id and field = 'price_from' limit 1),
         v.website,
         (select value from growth.vendor_facts f where f.vendor_id = v.id and field = 'instagram' limit 1)),
       jsonb_build_array(
         jsonb_build_object('name', 'Every field has evidence', 'passed', true, 'detail', '5 of 5 facts grounded'),
         jsonb_build_object('name', 'No photos published without consent', 'passed', true, 'detail', 'Links only until claimed'),
         jsonb_build_object('name', 'ACRA status live', 'passed', v.acra_verified, 'detail', case when v.acra_verified then 'UEN ' || coalesce(v.uen, '-') || ' live' else 'UEN not matched yet' end)
       ),
       now() - interval '5 hours'
from growth.vendors v where v.status = 'interested' order by v.id limit 2;

-- ---------------------------------------------------------------- evals (6 weekly points per eval)
insert into growth.eval_results (agent_key, version, eval_name, kind, score, threshold, higher_is_better, passed, run_at, provider_key, model)
select e.agent_key, e.agent_key || '-v' || w, e.eval_name, e.kind, s.score, e.threshold, e.hib,
       case when e.hib then s.score >= e.threshold else s.score <= e.threshold end,
       date_trunc('week', now()) - make_interval(weeks => 6 - w) + interval '2 hours',
       'claude', case when e.agent_key = 'outreach' then 'sonnet' else 'haiku' end
from (values
  ('scout',    'In-scope precision',          'online',  0.90, true,  0.84, 0.020),
  ('scout',    'Recall on golden vendors',    'offline', 0.70, true,  0.61, 0.025),
  ('scout',    'Duplicate rate',              'online',  0.03, false, 0.060, -0.007),
  ('enricher', 'Grounding (value in snippet)','offline', 1.00, true,  0.97, 0.008),
  ('enricher', 'Email/phone accuracy',        'offline', 0.95, true,  0.91, 0.010),
  ('enricher', 'Price accuracy',              'offline', 0.80, true,  0.70, 0.016),
  ('outreach', 'Compliance checklist',        'offline', 1.00, true,  1.00, 0.0),
  ('outreach', 'Approved without edits',      'online',  0.85, true,  0.66, 0.030),
  ('outreach', 'Positive reply rate',         'online',  0.03, true,  0.020, 0.004),
  ('outreach', 'Bounce rate',                 'online',  0.02, false, 0.031, -0.003)
) as e(agent_key, eval_name, kind, threshold, hib, base, step)
cross join generate_series(1, 6) w
cross join lateral (select round(least(1, greatest(0, e.base + e.step * w + (random() - 0.5) * abs(e.step)))::numeric, 3) as score) s
where not (e.agent_key = 'outreach' and w < 3);

-- Runs so far all used the subscription.
update growth.agent_runs r
set provider_key = 'claude',
    model = (select m.model from growth.agent_models m where m.agent_key = r.agent_key order by m.role limit 1);

-- One trial of a local model against the same test sets, to show a side-by-side comparison.
insert into growth.eval_results (agent_key, version, eval_name, kind, score, threshold, higher_is_better, passed, run_at, provider_key, model)
select e.agent_key, e.agent_key || '-v6', e.eval_name, 'offline', e.score, e.threshold, true, e.score >= e.threshold,
       now() - interval '2 days', 'ollama', 'qwen3:8b'
from (values
  ('scout',    'Recall on golden vendors',     0.70, 0.66),
  ('enricher', 'Grounding (value in snippet)', 1.00, 0.982),
  ('enricher', 'Email/phone accuracy',         0.95, 0.953),
  ('enricher', 'Price accuracy',               0.80, 0.712)
) as e(agent_key, eval_name, threshold, score);
