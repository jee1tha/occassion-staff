# Occasion growth agents

A small team of AI agents that runs the growth side of the Occasion marketplace (working name): find
Singapore event vendors, build a vendor knowledge base, write outreach, onboard vendors, plan marketing and
report the numbers. You stay in charge through the **Growth desk**, a local web app where you approve
anything outbound, browse the knowledge base, watch evals and see the return on your time.

Full plan, with the reasoning behind each choice: J-brain `02 Projects/occasion/Plans/2026-11-09 Agent team plan.md`.

> **Status, 2026-11-09.** Built: the Growth desk, the database, and the model-agnostic runner. **No agent is
> built yet.** The desk shows fictional sample data until agents start writing real rows. Scout and Enricher
> come next (phase P1), then the weekly schedule.

## Contents

- [How it fits together](#how-it-fits-together)
- [The agents](#the-agents)
- [Run it](#run-it)
- [Run an agent](#run-an-agent)
- [Choose the model for each job](#choose-the-model-for-each-job)
- [Write a new agent](#write-a-new-agent)
- [Approvals and autonomy](#approvals-and-autonomy)
- [How ROI is counted](#how-roi-is-counted)
- [Evals](#evals)
- [Cost and safety rules](#cost-and-safety-rules)
- [Repo layout](#repo-layout)
- [Troubleshooting](#troubleshooting)

## How it fits together

```
           schedule (launchd, weekly)                 you
                     │                                 │
                     ▼                                 ▼
   ┌──────────────── runner/ ───────────────┐   ┌── ops/ Growth desk ──┐
   │ agent code ──ctx.ask(job)──▶ router    │   │ approvals, vendors,  │
   │                     │                  │   │ agents & evals,      │
   │      Claude (your plan) │ local model  │   │ models, ROI          │
   │      │ your own agent, with fallback   │   └──────────┬───────────┘
   └──────────────────┬─────────────────────┘              │
                      ▼                                    ▼
              Supabase `growth` schema (local stack, ports 553xx)
     vendors + facts with evidence, approvals, runs, evals, ROI inputs
```

- Agents never talk to each other directly. They read and write the same database, and the Chief of Staff
  runs them in order.
- Every vendor fact carries the page it came from and a quoted snippet. A code check confirms the value
  appears in the snippet. Facts that fail are dropped, never sent.
- Anything that leaves the building (emails, posts, published profiles) waits in the Approvals queue until
  that agent has earned more autonomy.

## The agents

The weekly pipeline runs in this order: Scout → Enricher → Outreach drafts → Analyst → Growth Marketer, then
the Chief of Staff sends the Monday brief. Times are Singapore time.

| Agent | Team | When | What it does | Starts at | Built? |
|---|---|---|---|---|---|
| Vendor Scout | Supply | Sun 22:00 | Finds SG event vendors not yet in the knowledge base | L3, autonomous | Not yet (P1) |
| Enricher | Supply | Mon 01:00 | Verifies and scores each vendor, with evidence for every fact | L3, autonomous | Not yet (P1) |
| Outreach | Supply | Drafts Mon 03:00, sends daily | Drafts cold emails and follow-ups, sorts replies | L0, approve each | Not yet (P2) |
| Onboarding | Supply | On reply + weekly nudges | Builds draft profiles for interested vendors, nudges them to publish | L0, approve each | Not yet (P3) |
| Growth Marketer | Demand | Mon 06:00 | Weekly marketing plan, plus SEO, social and email drafts | L0, approve each | Not yet (P4) |
| Analyst | Ops | Mon 07:00 | The week's numbers from logged queries, anomaly flags | L3, autonomous | Not yet (P4) |
| Chief of Staff | Ops | Mon 09:00 | Runs the pipeline, sends the Monday brief, pauses agents that break a guardrail | L3, autonomous | Not yet (P4) |

### Vendor Scout: find candidates

- **Sources, safest first:**
  1. ACRA company data on data.gov.sg, filtered by event-related SSIC codes. This also verifies the company.
  2. Vendors' own websites, fetched only where robots.txt allows.
  3. Public directories and wedding blogs, used only as leads (name and website). Their content is never copied.
- **Never:** scrapes Instagram or Facebook. A social handle is stored only when the vendor's own site links to it.
- **Model's job** (`main`): decide whether each candidate is in scope (SG-based, event-related, operating).
- **Writes:** candidate vendors, deduplicated on domain, UEN, phone and fuzzy name.
- **Target:** 100–200 new candidates a week, weighted toward categories with fewer than 15 vendors.

### Enricher: build the knowledge base record

- Fetches the vendor's home, about, services, pricing and contact pages.
- **Model's job** (`extract`): pull services, "from S$" price, areas served, business email and phone,
  social links and portfolio links. Each value comes with its evidence.
- **Code checks:** the value appears in the snippet, the UEN is live on ACRA, the domain resolves, the
  email has MX records.
- **Model's job** (`score`): a 0–100 fit score and a pitch angle, for example "bookings only via Instagram DMs".
- Re-checks records older than 90 days and marks businesses that have closed.

### Outreach: start conversations

- Each week picks the highest-fit verified vendors that haven't been contacted.
- **Model's job** (`draft`): a short email built only from evidence-backed facts, with the founding-vendor offer.
- **Sequence:** first email, follow-up on day 4, last one on day 10, then stop. At most one thread per vendor
  every 90 days.
- **Model's job** (`classify`): sort replies into interested, question, not now, unsubscribe, wrong person
  or bounce. Unsubscribes go on the suppression list immediately.
- **Code checks before anything sends:** sender identity, a working unsubscribe link, an honest subject
  line, the suppression list, and the daily send cap.

### Onboarding: get interested vendors live

- **Model's job** (`draft`): a draft marketplace profile from knowledge-base facts ("we built it for you,
  just approve it").
- Sends a claim link, with reminders on day 2 and day 7.
- After the vendor claims it: a completeness checklist, then a review-invite kit.
- Needs the app's vendor onboarding (MVP step 4) to be live.

### Growth Marketer: plan and draft demand

- **Model's job** (`draft`): a weekly plan with three goals, a channel mix and experiments. Each experiment
  has a hypothesis, a metric and a stop rule.
- Drafts SEO pages, social captions, vendor spotlights (vendor must opt in), nurture emails and PR angles.
- Plans around SG seasons: wedding fairs, CNY, Hari Raya, Deepavali, school holidays, year-end corporate events.
- Never posts on its own.

### Analyst: measure everything

- Runs read-only SQL over the app data, the `growth` schema and the run logs.
- **Model's job** (`main`): explain the week's numbers and flag anomalies.
- **Rule:** every number in the report comes from a logged query. The eval re-runs each query to check.

### Chief of Staff: run the week

- Runs the pipeline in order. If an agent hits the usage limit with no fallback, it stops the rest of that
  week's pipeline.
- **Model's job** (`main`): write one Monday brief covering what happened, what needs your approval, KPIs
  against targets and the eval scorecard.
- Pauses any agent that breaks a guardrail, such as the bounce or complaint rate.

## Run it

You need Node 24 or later, Docker, the Supabase CLI and Claude Code signed in with your Claude plan.

```sh
# 1. Database (from the repo root). The first start applies the migrations and sample data.
supabase start

# 2. Growth desk
cd ops
cp .env.example .env.local
npm install
npm run dev -- -p 3100              # http://localhost:3100 (3100 keeps clear of the app on 3000)

# 3. Runner
cd ../runner
npm install
npm test                            # 14 tests, no network or database needed
node src/cli.ts ping                # tiny test request to each switched-on model provider
```

- **Back to clean sample data:** run `supabase db reset` from the repo root.
- **Stop everything:** run `supabase stop`, and stop the desk with Ctrl-C.

## Run an agent

```sh
cd runner
node src/cli.ts run scout           # run one agent now
node src/cli.ts providers           # list model providers and their last check
node src/cli.ts ping ollama         # check one provider
```

Every run is logged to `growth.agent_runs` and shows up on the desk under **Agents & evals → Run log**.
`run` exits with:

| Exit | Meaning |
|---|---|
| 0 | Succeeded, or skipped because the agent is paused |
| 75 | Stopped by a usage limit, with no fallback set |
| 1 | Failed. The reason is in the run log |

- **Pausing:** pause an agent from the Agents page. A paused agent's scheduled runs are logged as
  "skipped".
- **Not built yet:** `run` on an agent that doesn't exist yet prints "isn't built yet".
- **Scheduling:** to come. The plan is a launchd job on this Mac that runs the weekly pipeline. It's not set
  up yet, so for now run agents by hand.

## Choose the model for each job

Agents ask for a **job** (`extract`, `draft`, `classify`…), never a model. The desk's **Models** page
decides who does each job:

- **Claude on your plan.** The default: Haiku for extracting and classifying, Sonnet for writing.
- **A model on this Mac or your network.** Ollama, LM Studio, llama.cpp, vLLM, MLX, or any server with an
  OpenAI-style chat API.
- **Your own local agent.** Any program that reads a JSON request on stdin and prints a JSON reply. See
  `runner/README.md` and the template in `runner/examples/echo-agent.ts`.

Each job can have a **fallback**. It takes over when the main model is out of usage or can't be reached,
and the run log marks the run as "fallback" and says why. A wrong answer doesn't trigger the fallback: the
run fails, so the problem shows up.

**Try a local model:**

1. Install Ollama from ollama.com.
2. Run `ollama pull qwen3:8b`.
3. Click **Check now** for Ollama on the Models page.
4. Run the agent's test set on it and compare it with Claude under "How models compare".
5. Switch the job over once it passes, and keep Claude as its fallback.

## Write a new agent

Agents live in `runner/src/agents/`. An agent is a function that does the deterministic work itself and
calls `ctx.ask` only for reading, judging or drafting:

```ts
import { z } from "zod";
import type { Agent } from "../run.ts";

const Verdict = z.object({ in_scope: z.boolean(), category: z.string(), reason: z.string() });

export const scout: Agent = async (ctx) => {
  const candidates = await findCandidatesFromAcra();          // your code: fetch, dedupe
  let kept = 0;
  for (const c of candidates) {
    const v = await ctx.ask("main", {                         // whichever model the desk routes "main" to
      system: "You decide whether a Singapore business is an event vendor.",
      prompt: JSON.stringify(c),
      schema: Verdict,                                        // reply is validated against this
    });
    if (v.in_scope) kept += await saveCandidate(ctx.runId, c, v); // your code: write with run_id
  }
  return { items: kept, summary: `Found ${kept} new candidates.` };
};
```

Then:

1. Register it in `runner/src/agents/index.ts`.
2. Make sure each job it asks for has a row in `growth.agent_models`. Add a seed row or a migration, then
   pick the model on the Models page.
3. Add its outcome events, so the ROI counts what it produces.

Keep fetching, database writes and checks in code. Small local models then only have to do text in and JSON
out, which is what keeps every agent model-agnostic.

## Approvals and autonomy

| Level | What happens | Earned when |
|---|---|---|
| L0 | You approve each item | The default for Outreach, Onboarding and Growth Marketer |
| L1 | You skim and approve a batch | 85% approved without edits for 3 weeks, and all guardrails pass |
| L2 | Sends automatically, you see a sample | 95% approved without edits for 4 weeks, and no compliance failures |
| L3 | Fully autonomous, weekly report only | Only for agents that never send anything outward (Scout, Enricher, Analyst, Chief of Staff) |

On the **Approvals** page:

- Each draft shows the checks code ran on it and every fact it relies on, with the source.
- You can approve it as written, edit then approve, or reject it with a reason.
- A draft that fails a check can't be approved until you edit it.
- Time spent reviewing is recorded, because it counts as a cost in the ROI.

## How ROI is counted

Agent runs cost S$0 in cash on your Claude plan or a local model, so **your time is the real cost**:

```
Value      = units produced × minutes each would take you by hand ÷ 60 × your hourly rate
Your cost  = review time on the Approvals page + time logged fixing things
Return     = Value ÷ Your cost
```

- **What counts as a unit, and how many minutes it takes you,** is set on the desk's ROI settings page, for
  example 12 minutes per vendor verified. Time yourself on your first 20 vendors and enter the real numbers.
- **"API equivalent"** is what the same Claude runs would have cost on the API. It's shown for reference only
  and is never charged.

## Evals

Every agent has test-set evals (hand-labelled data, run on each prompt change) and live-sample evals (run
weekly on real output). Results go to `growth.eval_results` with the model that produced them, so models can
be compared on the same test. If an agent fails two weeks in a row, it drops one autonomy level.

Examples of the pass bars:

- **Scout:** in-scope precision ≥ 90%, duplicates < 3%.
- **Enricher:** grounding 100%, email and phone accuracy ≥ 95%.
- **Outreach:** compliance checklist 100%, bounce rate < 2%.

The full list is in the plan, section 4. The hand-labelled test sets (100 vendors, 30 fully labelled
records, 20 rated emails) are still to be built in phase P0.

## Cost and safety rules

- **No extra charges.**
  - Claude runs as headless `claude -p` on your plan, never the API.
  - The runner removes `ANTHROPIC_API_KEY` and similar variables, and checks that `claude auth status`
    says `claude.ai`.
  - Turn off **extra usage** at claude.ai → Settings → Usage, so hitting a limit stops the run instead of
    billing you.
- **Paid models are blocked** unless you switch them on, on the Models page.
  - A provider marked free is refused if its address isn't on this Mac or your network.
- **Compliance is checked in code, not prompts:**
  - PDPA care with sole proprietors' personal contacts.
  - Spam Control Act: unsubscribe and sender identity.
  - No SMS or WhatsApp outreach.
  - robots.txt respected, and no Instagram or Facebook scraping.
- **The desk has no login.** Keep it local, and don't deploy `ops/` until auth is added.
  - It connects as the local Postgres superuser. In the cloud, use a role limited to the `growth` schema.
- **The sample data is fictional.** Every vendor uses the reserved `.example` domain, so nothing in it can be
  contacted.

## Repo layout

```
supabase/
  config.toml                 local stack on ports 553xx (the app's stack uses 543xx)
  migrations/                 growth schema: vendors, facts, approvals, runs, evals, ROI, model routing
  seed.sql                    fictional sample data
ops/                          Growth desk (Next.js 16), talks to Postgres directly from the server
  src/app/                    overview, approvals, vendors, agents, models, settings
runner/                       agent runner (Node runs the TypeScript directly)
  src/cli.ts                  providers | ping | run
  src/run.ts                  runAgent and ctx.ask: logging, pause, fallback notes
  src/router.ts               job → model routing, schema check, one repair retry, fallback
  src/guard.ts                spending guardrails
  src/providers/              claude-code, openai-compatible, command
  src/agents/                 the agents (none yet)
  examples/echo-agent.ts      template for plugging in your own agent
  test/                       runner tests
```

## Troubleshooting

| You see | Do this |
|---|---|
| Run log says **Usage limit** | Wait for your plan's limit to reset, or set a fallback for that job on the Models page |
| A provider shows **Not answering** | Start its server (for example, open Ollama), then click Check now. The reason is shown under the status |
| "Claude Code is signed in with … not your Claude plan" | Run `claude auth logout`, then `claude auth login` with your claude.ai account. Remove any API key from your shell profile |
| "…is a paid provider and paid models are off" | Working as intended. Route the job to a free provider, or allow paid providers on the Models page |
| "No model is set for <agent>, role …" | Add a row for that job in `growth.agent_models`, then pick a model on the Models page |
| Desk shows a database error | Run `supabase status` from the repo root, and `supabase start` if the stack isn't running |
