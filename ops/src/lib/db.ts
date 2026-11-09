import "server-only";
import postgres from "postgres";

// One pooled client per server process (survives dev hot reloads).
const globalForDb = globalThis as unknown as { sql?: postgres.Sql };

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy ops/.env.example to ops/.env.local.");
  return postgres(url, { max: 5, idle_timeout: 20 });
}

export const sql = globalForDb.sql ?? createClient();
if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;
