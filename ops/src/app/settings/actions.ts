"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sql } from "@/lib/db";

export type SaveState = { ok?: boolean; error?: string };

const Form = z.object({
  brand_name: z.string().trim().min(1).max(60),
  hourly_rate_sgd: z.coerce.number().min(0).max(2000),
  usd_to_sgd: z.coerce.number().min(0.5).max(3),
});

export async function saveSettings(_prev: SaveState, form: FormData): Promise<SaveState> {
  const raw = Object.fromEntries(form);
  const parsed = Form.safeParse(raw);
  if (!parsed.success) return { error: "Check the numbers: hourly rate 0–2000, exchange rate 0.5–3." };
  const minutes = Object.entries(raw)
    .filter(([k]) => k.startsWith("minutes:"))
    .map(([k, v]) => ({ key: k.slice(8), minutes: Number(v) }));
  if (minutes.some((m) => !Number.isFinite(m.minutes) || m.minutes < 0 || m.minutes > 600))
    return { error: "Manual minutes must be between 0 and 600." };

  const d = parsed.data;
  await sql.begin(async (tx) => {
    await tx`update growth.settings set value = jsonb_set(value, '{name}', to_jsonb(${d.brand_name}::text)) where key = 'brand'`;
    await tx`update growth.settings set value = value || ${tx.json({ hourly_rate_sgd: d.hourly_rate_sgd, usd_to_sgd: d.usd_to_sgd })} where key = 'roi'`;
    for (const m of minutes) {
      await tx`update growth.roi_assumptions set manual_minutes = ${m.minutes} where agent_key = ${m.key}`;
    }
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
