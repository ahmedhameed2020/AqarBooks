#!/usr/bin/env node
// node scripts/demo-local/probe-auth-user.mjs <apiUrl> <serviceKey> <userId|->
// READ-ONLY. Asks the auth admin API for one user (by id) or, with "-", for the first page of users, and prints
// {"status":<http>,"email":<string|null>,"count":<n|null>} as JSON. Used by the isolation guard to prove that the API
// the tests will write through and the SQL container they will write into are the SAME database.
const [url, key, id] = process.argv.slice(2);
if (!url || !key || !id) { console.log(JSON.stringify({ status: 0, error: "usage" })); process.exit(0); }
const headers = { apikey: key, authorization: `Bearer ${key}` };
try {
  if (id === "-") {
    const r = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1`, { headers });
    const body = await r.json().catch(() => ({}));
    console.log(JSON.stringify({ status: r.status, count: Array.isArray(body.users) ? body.users.length : null, email: null }));
  } else {
    const r = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(id)}`, { headers });
    const body = await r.json().catch(() => ({}));
    console.log(JSON.stringify({ status: r.status, email: typeof body.email === "string" ? body.email : null, count: null }));
  }
} catch (error) {
  console.log(JSON.stringify({ status: 0, error: String(error).slice(0, 120) }));
}
