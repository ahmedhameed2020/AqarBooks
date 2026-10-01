import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { createGateFixture, sql } from "./helpers/gate-release";

function runSql(query: string): Promise<string> {
  return new Promise((resolve, reject) => execFile("docker", ["exec", "supabase_db_aqarbooks", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-c", query],
    { timeout: 30_000 }, (error, stdout, stderr) => error ? reject(new Error(stderr)) : resolve(stdout)));
}
async function waitFor(query: string, expected: string) {
  const deadline = Date.now()+10_000;
  while (Date.now()<deadline) {
    if (sql(query) === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Expected database fencing state did not appear");
}

it("rollback waits for an admitted scan transaction, then rejects subsequent trusted scans", async () => {
  const f = await createGateFixture(), visitor = f.invitation(), device = f.device();
  const scanApp = `gate-scan-${randomUUID()}`, rollbackApp = `gate-rollback-${randomUUID()}`;
  const scan = runSql(`set application_name='${scanApp}'; begin; set local role authenticated; set local request.jwt.claim.sub='${f.guard.id}';
    select decision from public.process_visitor_gate_scan('${device.id}','${device.credential}','${f.gate}','${visitor.id}','${visitor.secret}','ENTRY','${randomUUID()}');
    select pg_sleep(4); commit;`);
  await waitFor(`select wait_event from pg_stat_activity where application_name='${scanApp}'`, "PgSleep");
  const rollback = runSql(`set application_name='${rollbackApp}'; begin; set local role authenticated; set local request.jwt.claim.sub='${f.manager.id}';
    select public.set_gate_completion_policy('${f.org}',false); commit;`);
  await waitFor(`select wait_event_type||'|'||wait_event from pg_stat_activity where application_name='${rollbackApp}'`, "Lock|advisory");
  const results = await Promise.all([scan,rollback]);
  expect(results[0]).toContain("ALLOW");
  const subsequent = await f.guard.client.rpc("process_visitor_gate_scan", { p_device_id: device.id, p_device_credential: device.credential,
    p_gate_id: f.gate, p_invitation_id: visitor.id, p_raw_secret: visitor.secret, p_direction: "EXIT", p_client_scan_id: randomUUID() });
  expect(subsequent.error?.message).toContain("GATE_COMPLETION_DISABLED");
  expect(sql(`select count(*) from public.access_events where visitor_invitation_id='${visitor.id}'`)).toBe("1");
  expect(sql(`select is_inside from public.visitor_access_state where visitor_invitation_id='${visitor.id}'`)).toBe("t");
}, 60_000);
