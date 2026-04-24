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
const normalizedConnectionString = rawUrl?.replace(/^\s*"|"\s*$/g, "") ?? "";

// Remove sslmode from the URL string — we handle SSL exclusively via the
// Pool's `ssl` option.  Leaving sslmode=verify-full in the URL while also
// passing ssl:{rejectUnauthorized:false} causes a conflict in pg.
const connectionString = normalizedConnectionString
  .replace(/[?&]sslmode=[^&]*/g, '')   // remove sslmode param entirely
  .replace(/\?$/, '')                   // cleanup trailing ? if no params left
  .replace(/\?&/, '?')                  // cleanup ?& → ?
  .replace(/&&/, '&');                  // cleanup && → &

// Detect whether this is a remote / cloud database (Neon, Supabase, etc.)
const isRemoteDb = /\.(neon\.tech|supabase\.co|aws\.amazonaws\.com|railway\.app|render\.com|fly\.dev)\b/i.test(connectionString);

// Remote databases (Neon) require SSL.  For local Postgres, skip it
// to avoid "self-signed certificate" errors when no TLS is configured.
const sslConfig = isRemoteDb ? { rejectUnauthorized: false } : false;

// Neon free-tier databases auto-suspend after inactivity and need extra
// time on the first connection (cold start).  Use 30s for remote, 10s
// for local.
const connectionTimeout = isRemoteDb ? 30000 : 10000;

export const pool = new Pool({
  connectionString,
  connectionTimeoutMillis: connectionTimeout,
  idleTimeoutMillis: 30000,
  max: 10,
  ssl: sslConfig as any,
});

pool.on("error", (error) => {
  console.error("[db] Unexpected PostgreSQL pool error:", error);
});

// Diagnostic: log a masked version of the URL so we can verify host/port
const maskedUrl = connectionString.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
console.log("[db] DATABASE_URL detected:", Boolean(rawUrl));
console.log("[db] Connection target:", maskedUrl);
console.log("[db] PostgreSQL pool configuration:", {
  connectionTimeoutMillis: connectionTimeout,
  idleTimeoutMillis: 30000,
  max: 10,
  ssl: sslConfig,
  isRemoteDb,
});

export const db = drizzle(pool, { schema });