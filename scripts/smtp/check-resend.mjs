#!/usr/bin/env node
// Verifies a Resend API key and the sending-domain status without printing the
// key. The key is read from a local file (never from git, never from argv):
//   ~/.aqar-secrets/resend-api-key   (override with RESEND_API_KEY_FILE)
// Read-only: lists domains and API-key metadata; sends no email.
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const file = process.env.RESEND_API_KEY_FILE || join(homedir(), ".aqar-secrets", "resend-api-key");
if (!existsSync(file)) {
  console.error(`key file missing: ${file}`);
  process.exit(2);
}
const key = readFileSync(file, "utf8").trim();
if (!key) {
  console.error(`key file is empty: ${file}`);
  process.exit(2);
}

console.log(`key_format=${/^re_[A-Za-z0-9_-]{8,}$/.test(key) ? "re_*" : "unexpected"} length=${key.length}`);

async function call(path) {
  const res = await fetch(`https://api.resend.com${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

const domains = await call("/domains");
console.log(`domains_status=${domains.status}`);
if (domains.status === 200 && Array.isArray(domains.body?.data)) {
  for (const d of domains.body.data) {
    console.log(`domain=${d.name} status=${d.status} region=${d.region ?? "n/a"}`);
  }
  if (domains.body.data.length === 0) console.log("domain_list=empty");
} else {
  console.log(`domains_error=${domains.body?.name ?? "unknown"}`);
}

const keys = await call("/api-keys");
console.log(`api_keys_status=${keys.status}${keys.status === 200 ? ` count=${keys.body?.data?.length ?? 0}` : ` error=${keys.body?.name ?? "unknown"}`}`);
