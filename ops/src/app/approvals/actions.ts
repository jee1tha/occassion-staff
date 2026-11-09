"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sql } from "@/lib/db";

const Decision = z.object({
  id: z.coerce.number().int().positive(),
  decision: z.enum(["approve", "reject"]),
  body: z.string().max(20_000),
  original: z.string().max(20_000),
  note: z.string().trim().max(500).optional().default(""),
  seconds: z.coerce.number().int().min(0).max(24 * 3600),
});

export type DecisionState = { error?: string };

export async function decide(_prev: DecisionState, form: FormData): Promise<DecisionState> {
  const parsed = Decision.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "That decision could not be read. Reload the page and try again." };
  const d = parsed.data;
  if (d.decision === "reject" && !d.note) return { error: "Add a short reason so the agent can learn from the rejection." };

  const edited = d.decision === "approve" && d.body.trim() !== d.original.trim();
  const status = d.decision === "reject" ? "rejected" : edited ? "edited" : "approved";

  const rows = await sql`
    update growth.approvals
    set status = ${status},
        edited_body = ${edited ? d.body : null},
        decision_note = ${d.note || null},
        review_seconds = ${d.seconds},
        decided_at = now()
    where id = ${d.id} and status = 'pending'
    returning id`;
  if (rows.length === 0) return { error: "Someone already decided this draft. Showing the next one." };

  revalidatePath("/", "layout");
  redirect("/approvals");
}
