#!/usr/bin/env node
// Replays the repository's migrations onto a THROWAWAY local PostgreSQL so SQL
// can be tested without touching any hosted Supabase project.
//
//   LOCAL_PG_PORT=54329 PG_BIN=/path/to/postgres/bin node scripts/local-db/replay.mjs
//
// It never reads .env.local and has no way to reach a remote database: it only
// connects to 127.0.0.1. The cluster itself is started by the caller (see
// README.md). The database `aqar_local` is dropped and recreated each run.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const port = process.env.LOCAL_PG_PORT ?? "54329";
const bin = process.env.PG_BIN ?? "";
const psqlPath = bin ? join(bin, "psql") : "psql";
const db = "aqar_local";

function psql(args, { database = db, quiet = true } = {}) {
  return execFileSync(
    psqlPath,
    ["-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", ...(quiet ? ["-q"] : []), ...args],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

function applyFile(label, file) {
  try {
    psql(["-f", file]);
    console.log(`  ok  ${label}`);
  } catch (error) {
    const stderr = String(error.stderr ?? error.message).split("\n").slice(0, 8).join("\n");
    console.error(`FAILED ${label}\n${stderr}`);
    process.exit(1);
  }
}

psql(["-c", `drop database if exists ${db} with (force)`], { database: "postgres" });
psql(["-c", `create database ${db}`], { database: "postgres" });
console.log(`Replaying into 127.0.0.1:${port}/${db}`);

applyFile("supabase stubs", join(root, "scripts/local-db/00_supabase_stubs.sql"));

const scratch = mkdtempSync(join(tmpdir(), "aqar-replay-"));
const migrationsDir = join(root, "supabase/migrations");
for (const name of readdirSync(migrationsDir).filter((n) => n.endsWith(".sql")).sort()) {
  let sql = readFileSync(join(migrationsDir, name), "utf8");
  // supabase_vault only exists on Supabase; the stub schema `vault` stands in.
  sql = sql.replace(/^CREATE EXTENSION IF NOT EXISTS "supabase_vault".*$/gm, "-- (supabase_vault stubbed)");
  const file = join(scratch, name);
  writeFileSync(file, sql);
  applyFile(name, file);
}
console.log("Replay complete.");
