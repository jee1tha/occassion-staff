-- Model-agnostic agents. Agents never name a vendor's model directly: each agent role is
-- routed to a provider + model, with an optional fallback (for example, a local model when
-- the Claude subscription hits its usage limit).
--
-- Provider kinds:
--   claude_code        headless `claude -p` on the Claude subscription
--   openai_compatible  any /v1/chat/completions server: Ollama, LM Studio, llama.cpp, vLLM, MLX
--   command            any local program or agent: JSON request on stdin, JSON reply on stdout
--
-- Billing is what keeps the zero-spend rule: the runner refuses `paid` providers unless
-- settings.guardrails.allow_paid_models is true, and refuses a `local` provider whose
-- base_url is not on this machine or the private network.

create table growth.model_providers (
  key              text primary key check (key ~ '^[a-z0-9_-]{2,40}$'),
  name             text not null,
  kind             text not null check (kind in ('claude_code', 'openai_compatible', 'command')),
  billing          text not null check (billing in ('subscription', 'local', 'paid')),
  base_url         text,
  command          text[],                -- argv for kind = command
  api_key_env      text check (api_key_env ~ '^[A-Z][A-Z0-9_]*$'), -- name of an env var, never the key
  models           text[] not null default '{}',
  enabled          boolean not null default true,
  notes            text,
  last_checked_at  timestamptz,
  last_ok          boolean,
  last_latency_ms  integer,
  last_detail      text,
  constraint provider_kind_fields check (
    case kind
      when 'claude_code'       then billing = 'subscription' and base_url is null and command is null and api_key_env is null
      when 'openai_compatible' then base_url is not null and command is null
      when 'command'           then command is not null and cardinality(command) > 0 and base_url is null
    end
  )
);

create table growth.agent_models (
  agent_key              text not null references growth.agents (key) on delete cascade,
  role                   text not null default 'main' check (role ~ '^[a-z_]{2,30}$'),
  purpose                text not null,
  provider_key           text not null references growth.model_providers (key),
  model                  text not null,
  fallback_provider_key  text references growth.model_providers (key),
  fallback_model         text,
  primary key (agent_key, role),
  constraint fallback_pair check ((fallback_provider_key is null) = (fallback_model is null))
);
create index agent_models_provider_idx on growth.agent_models (provider_key);
create index agent_models_fallback_provider_idx on growth.agent_models (fallback_provider_key);

alter table growth.agents drop column model;

-- Logs keep plain text so history survives a provider being renamed or removed.
alter table growth.agent_runs
  add column provider_key  text,
  add column model         text,
  add column used_fallback boolean not null default false;

alter table growth.eval_results
  add column provider_key text,
  add column model        text;
create index eval_results_model_idx on growth.eval_results (agent_key, eval_name, provider_key, model, run_at desc);

alter table growth.model_providers enable row level security;
alter table growth.agent_models    enable row level security;
revoke all on growth.model_providers, growth.agent_models from public, anon, authenticated;
