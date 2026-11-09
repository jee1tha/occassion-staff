"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sql } from "@/lib/db";

const Toggle = z.object({ key: z.string().min(1).max(40), pause: z.enum(["true", "false"]) });

export async function setPaused(form: FormData) {
  const { key, pause } = Toggle.parse(Object.fromEntries(form));
  const paused = pause === "true";
  await sql`
    update growth.agents
    set paused = ${paused}, paused_reason = ${paused ? "Paused by you from the desk" : null}
    where key = ${key}`;
  revalidatePath("/", "layout");
}
