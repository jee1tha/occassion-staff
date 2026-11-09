import { existsSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const envFile = resolve(import.meta.dirname, "../.env");
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);

export const sql = postgres(process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres", {
  max: 3,
  idle_timeout: 10,
  onnotice: () => {},
});

export type Sql = typeof sql;
