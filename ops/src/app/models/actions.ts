"use server";

import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sql } from "@/lib/db";
import { isLocalUrl } from "@/lib/local-url";

export type FormState = { ok?: boolean; error?: string; message?: string };

const pick = z.string().regex(/^[a-z0-9_-]+::.+$/, "Choose a model");
const split = (v: string) => {
  const i = v.indexOf("::");
  return { provider: v.slice(0, i), model: v.slice(i + 2) };
};

const Route = z.object({
  agent_key: z.string().min(1).max(40),
  role: z.string().min(1).max(30),
  primary: pick,
  fallback: z.union([z.literal(""), pick]),
});

export async function saveRoute(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = Route.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Choose a model for this job." };
  const d = parsed.data;
  const primary = split(d.primary);
  const fallback = d.fallback ? split(d.fallback) : null;
  if (fallback && fallback.provider === primary.provider && fallback.model === primary.model) {
    return { error: "The fallback is the same model. Pick a different one, or no fallback." };
  }
  await sql`
    update growth.agent_models set
      provider_key = ${primary.provider}, model = ${primary.model},
      fallback_provider_key = ${fallback?.provider ?? null}, fallback_model = ${fallback?.model ?? null}
    where agent_key = ${d.agent_key} and role = ${d.role}`;
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved. Used from the next run." };
}

const Key = z.object({ key: z.string().regex(/^[a-z0-9_-]{2,40}$/) });

export async function setProviderEnabled(form: FormData) {
  const { key } = Key.parse(Object.fromEntries(form));
  const enabled = form.get("enabled") === "true";
  await sql`update growth.model_providers set enabled = ${enabled} where key = ${key}`;
  revalidatePath("/", "layout");
}

export async function removeProvider(form: FormData) {
  const { key } = Key.parse(Object.fromEntries(form));
  // Routes reference providers by foreign key, so a provider in use can't be removed.
  await sql`
    delete from growth.model_providers p
    where p.key = ${key} and p.kind <> 'claude_code'
      and not exists (select 1 from growth.agent_models m where m.provider_key = p.key or m.fallback_provider_key = p.key)`;
  revalidatePath("/", "layout");
}

const Provider = z
  .object({
    mode: z.enum(["create", "edit"]),
    key: z.string().trim().regex(/^[a-z0-9_-]{2,40}$/, "Short name: 2–40 lowercase letters, digits, - or _"),
    name: z.string().trim().min(1, "Give it a name").max(60),
    kind: z.enum(["openai_compatible", "command"]),
    billing: z.enum(["local", "paid"]),
    base_url: z.string().trim().optional(),
    command: z.string().trim().optional(),
    api_key_env: z
      .string()
      .trim()
      .regex(/^([A-Z][A-Z0-9_]*)?$/, "Key variable must be an env var name like OPENROUTER_API_KEY")
      .optional(),
    models: z.string().trim().min(1, "List at least one model id"),
    notes: z.string().trim().max(300).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.kind === "openai_compatible") {
      if (!d.base_url || !URL.canParse(d.base_url)) {
        ctx.addIssue({ code: "custom", message: "Enter the server address, like http://127.0.0.1:11434/v1" });
      } else if (d.billing === "local" && !isLocalUrl(d.base_url)) {
        ctx.addIssue({
          code: "custom",
          message: "That address isn't on this Mac or your network, so it can't be marked free. Mark it paid.",
        });
      }
    }
    if (d.kind === "command" && !d.command) ctx.addIssue({ code: "custom", message: "Enter the command to run" });
  });

export async function saveProvider(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = Provider.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const models = [...new Set(d.models.split(/[\s,]+/).filter(Boolean))];
  const row = {
    name: d.name,
    kind: d.kind,
    billing: d.billing,
    base_url: d.kind === "openai_compatible" ? d.base_url!.replace(/\/+$/, "") : null,
    command: d.kind === "command" ? d.command!.split(/\s+/).filter(Boolean) : null,
    api_key_env: d.api_key_env || null,
    models,
    notes: d.notes || null,
  };
  try {
    if (d.mode === "create") {
      await sql`insert into growth.model_providers ${sql({ key: d.key, ...row, enabled: true })}`;
    } else {
      const res = await sql`
        update growth.model_providers set ${sql(row)}, last_checked_at = null, last_ok = null, last_detail = null
        where key = ${d.key} and kind <> 'claude_code'`;
      if (res.count === 0) return { error: "That provider can't be edited here." };
    }
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "23505") return { error: `There's already a provider called ${d.key}.` };
    throw e;
  }
  revalidatePath("/", "layout");
  return { ok: true, message: d.mode === "create" ? "Added. Run a check to make sure it answers." : "Saved." };
}

const RUNNER_DIR = process.env.RUNNER_DIR ?? resolve(process.cwd(), "../runner");

/** Sends one tiny test request through the runner, so the check uses exactly the code agents use. */
export async function checkProvider(_prev: FormState, form: FormData): Promise<FormState> {
  const { key } = Key.parse(Object.fromEntries(form));
  try {
    await promisify(execFile)(process.execPath, ["src/cli.ts", "ping", key], { cwd: RUNNER_DIR, timeout: 150_000 });
  } catch {
    // A failed ping exits 1; the reason is stored on the provider row and shown on the page.
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setAllowPaid(form: FormData) {
  const allow = form.get("allow") === "true";
  await sql`
    update growth.settings set value = jsonb_set(value, '{allow_paid_models}', to_jsonb(${allow}::boolean))
    where key = 'guardrails'`;
  revalidatePath("/", "layout");
}
