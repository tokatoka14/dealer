import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// strip optional quotes, which are common in .env files and can confuse
// pg when they become part of the URL
const rawUrl = process.env.DATABASE_URL;
const connectionString = rawUrl?.replace(/^\s*"|"\s*$/g, "") ?? "";

export const pool = new Pool({
  connectionString,
  // give the underlying driver a bit more time; previously 30s, now 60s
  connectionTimeoutMillis: parseInt(process.env.DB_CONN_TIMEOUT_MS || "60000", 10),
  idleTimeoutMillis: 30000,
  max: 10,
  ssl: { rejectUnauthorized: false },
});
export const db = drizzle(pool, { schema });