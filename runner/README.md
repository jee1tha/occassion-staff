# Agent runner

Runs the agents and logs every run to `growth.agent_runs`. Agents are model-agnostic: an
agent asks for a **job** (`ctx.ask("extract", …)`), and the Growth desk **Models** page
decides which model does that job, with an optional fallback.

```
agent code ──ctx.ask(role)──▶ router ──▶ primary provider ──(out of usage / offline)──▶ fallback provider
                                │
                                └─ guardrails: no paid providers, "free" must be local, Claude on your plan only
```

The runner's own code does all fetching, database writes and grounding checks. A model is
only asked to read, judge or draft, and to reply as JSON matching a schema. That keeps any
model swappable, and makes small local models workable.

## Provider kinds

| Kind | Use it for | Cost |
|---|---|---|
| `claude_code` | Headless `claude -p` on your Claude plan | Your plan. API-key env vars are stripped; `claude auth status` must say `claude.ai` |
| `openai_compatible` | Ollama, LM Studio, llama.cpp server, vLLM, MLX, LocalAI | Free when the address is on this Mac or your network |
| `command` | Your own local agent or script | Free (you label it) |

## Plug in your own agent

Add it on the Models page as "Program on this Mac", or as a row in `growth.model_providers`
with `kind = 'command'`. The runner starts it from the repo root and:

- writes one JSON request to **stdin**: `{ "model", "system", "prompt", "schema", "schema_name" }`
- reads one JSON reply from **stdout**: `{ "output": <matches schema>, "input_tokens"?, "output_tokens"? }`
- treats exit **75** as "out of usage" (fallback or stop), any other non-zero exit as "unavailable"

`examples/echo-agent.ts` is a working template.

## Use a local model

1. Install Ollama (ollama.com), then `ollama pull qwen3:8b`.
2. `node src/cli.ts ping ollama` or **Check now** on the Models page.
3. Route a job to it on the Models page. Keep Claude as the fallback until its evals pass.

## Commands

```bash
npm install
node src/cli.ts providers          # list providers and their last check
node src/cli.ts ping [provider]    # tiny test request; all switched-on providers if none given
node src/cli.ts run <agent>        # run one agent (exit 75 = usage limit stopped it)
npm test                           # router, guardrails and provider tests (no network, no DB)
```

Reads `DATABASE_URL` from the environment or `runner/.env` (defaults to the local stack on 55322).

## What happens when

| Situation | Result |
|---|---|
| Primary out of usage or unreachable, fallback set | Fallback answers; the run is marked "fallback" and the summary says why |
| Same, no fallback | Run ends as `limit_reached` (or `failed` if offline) |
| Reply doesn't match the schema | One repair attempt on the same model, then the run fails. No fallback: a wrong answer is a quality problem, not a capacity one |
| Provider is paid while paid models are blocked, or "free" but not local | Refused before anything is sent; never routed around |
| Agent paused on the desk | Run logged as `skipped` |
