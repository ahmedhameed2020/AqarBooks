import { execFile, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";
const args = ["exec", "supabase_db_aqarbooks", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-c"];
const sql = (query: string) => execFileSync("docker", [...args, query], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const org = randomUUID(), property = randomUUID(), gate = randomUUID(), operator = randomUUID(), endpoint = randomUUID();
const unit = randomUUID(), member = randomUUID(), device = randomUUID();
function invitation() {
  const id = randomUUID();
  sql(`insert into public.visitor_invitations(id,organization_id,property_id,unit_id,invited_by_member_id,invitation_no,guest_name,valid_from,valid_until,usage_policy,created_by)
    values('${id}','${org}','${property}','${unit}','${member}','${id}','Private Guest',now()-interval '1 hour',now()+interval '1 hour','MULTI_USE','${operator}');
    insert into public.visitor_invitation_secrets(invitation_id,organization_id,token_hash) values('${id}','${org}',encode(extensions.digest('private-qr:${id}','sha256'),'hex'));`);
  return id;
}
const asOperator = (query: string) => `begin; set local role authenticated; set local request.jwt.claim.sub='${operator}'; ${query}; commit;`;
function event(decision = "ALLOW", reason = "VALID_ENTRY") {
  const id = randomUUID();
  sql(`insert into public.access_events(id,organization_id,property_id,gate_id,direction,decision,reason_code,client_scan_id,operator_user_id,guest_name) values('${id}','${org}','${property}','${gate}','ENTRY','${decision}','${reason}','${randomUUID()}','${operator}','private guest')`);
  return id;
}
const commandFor = (eventId: string) => sql(`select id from public.gate_hardware_commands where access_event_id='${eventId}'`);
const claim = () => JSON.parse(sql("select coalesce(json_agg(c),'[]') from public.claim_gate_hardware_commands(50) c"));
const complete = (id: string, token: string, result: string) => sql(`select public.complete_gate_hardware_command('${id}','${token}','${result}')`);
describe.sequential("hardware outbox database", () => {
  beforeAll(() => {
    sql(`insert into auth.users(id,email) values('${operator}','${operator}@test.local');
      insert into public.organizations(id,name,slug,default_currency,status) values('${org}','Hardware','${org}','QAR','ACTIVE');
      insert into public.subscriptions(organization_id,plan_id,status) select '${org}',id,'ACTIVE' from public.plans where key='PROFESSIONAL';
      insert into public.properties(id,organization_id,name,code,timezone,property_type) values('${property}','${org}','Hardware','${property}','Asia/Qatar','building');
      insert into public.gates(id,organization_id,property_id,code,name_ar,name_en,created_by) values('${gate}','${org}','${property}','HW','Gate','Gate','${operator}');
      insert into public.units(id,organization_id,property_id,code) values('${unit}','${org}','${property}','HW1');
      insert into public.members(id,organization_id,full_name) values('${member}','${org}','Host');
      insert into public.organization_memberships(organization_id,user_id) values('${org}','${operator}');
      insert into public.roles(id,organization_id,key,name_ar,name_en) values('${operator}','${org}','HW_OPERATOR','Scan','Scan');
      insert into public.role_permissions(role_id,permission_id) select '${operator}',id from public.permissions where key in ('operations.gates.scan','operations.gates.occupancy.reconcile');
      insert into public.user_role_assignments(organization_id,user_id,role_id) values('${org}','${operator}','${operator}');
      insert into public.gate_completion_policy(organization_id,enabled,updated_by) values('${org}',true,'${operator}');
      insert into public.gate_devices(id,organization_id,property_id,gate_id,installation_id_hash,credential_hash,display_name,allowed_direction,enrolled_by)
      values('${device}','${org}','${property}','${gate}',repeat('d',64),encode(extensions.digest('private-device','sha256'),'hex'),'Hardware test','BOTH','${operator}');`);
  });
  it("creates a private durable schema with unique event command identity", () => {
    const file = readdirSync("supabase/migrations").find((name) => name.endsWith("_gate_hardware_outbox.sql"));
    expect(file).toBeDefined(); const migration = readFileSync(`supabase/migrations/${file}`, "utf8");
    expect(migration).toContain("unique (access_event_id, command_type)");
    expect(migration).toMatch(/revoke all.+gate_hardware_endpoints.+authenticated/is);
  });
  it("does nothing without explicit organization enable and an active endpoint", () => {
    expect(commandFor(event())).toBe("");
    sql(`insert into public.gate_hardware_settings(organization_id) values('${org}'); insert into public.gate_hardware_endpoints(id,organization_id,gate_id,adapter,is_active) values('${endpoint}','${org}','${gate}','NOOP',true)`);
    expect(commandFor(event())).toBe("");
    sql(`update public.gate_hardware_settings set enabled=true where organization_id='${org}'; update public.gate_hardware_endpoints set is_active=false where id='${endpoint}'`);
    expect(commandFor(event())).toBe("");
    sql(`update public.gate_hardware_endpoints set is_active=true where id='${endpoint}'`);
  });
  it("enqueues once for the original allow; DENY and manual evidence cannot enqueue", async () => {
    const id = event(); expect(commandFor(id)).not.toBe("");
    await Promise.all([1, 2].map(() => promisify(execFile)("docker", [...args, `set role service_role; select public.enqueue_gate_hardware_command('${id}')`])));
    expect(sql(`select count(*) from public.gate_hardware_commands where access_event_id='${id}'`)).toBe("1");
    expect(commandFor(event("DENY", "INVALID_PASS"))).toBe("");
    expect(sql(`select public.enqueue_gate_hardware_command('${randomUUID()}')`)).toBe("");
    expect(sql(`select row_to_json(c) from public.gate_hardware_commands c where access_event_id='${id}'`)).not.toContain("private guest");
    const rows = claim(); for (const row of rows) complete(row.id, row.claim_token, "NOT_CONFIGURED");
    expect(sql(`select status||'|'||result_code from public.gate_hardware_commands where access_event_id='${id}'`)).toBe("DEAD|NOT_CONFIGURED");
  });
  it("concurrent workers cannot claim the same event and stale leases cannot complete", async () => {
    const id = commandFor(event());
    const responses = await Promise.all([1, 2].map(() => promisify(execFile)("docker", [...args, "select coalesce(json_agg(c),'[]') from public.claim_gate_hardware_commands(50) c"])));
    const jobs = responses.flatMap((response) => JSON.parse(response.stdout)); expect(jobs.filter((job) => job.id === id)).toHaveLength(1);
    const first = jobs.find((job) => job.id === id);
    sql(`update public.gate_hardware_commands set claimed_at=now()-interval '11 minutes' where id='${id}'`);
    const second = claim().find((job: { id: string }) => job.id === id); expect(second.claim_token).not.toBe(first.claim_token);
    expect(complete(id, first.claim_token, "ACKNOWLEDGED")).toBe("STALE");
    expect(complete(id, second.claim_token, "ACKNOWLEDGED")).toBe("ACKNOWLEDGED");
    expect(complete(id, second.claim_token, "ACKNOWLEDGED")).toBe("STALE");
  });
  it("scanner replays, distinct duplicate scans, reconciliation and manual approval never create extra opens", async () => {
    const visitor = invitation(), scanId = randomUUID();
    const scan = (key: string) => asOperator(`select decision from public.process_visitor_gate_scan('${device}','private-device','${gate}','${visitor}','private-qr:${visitor}','ENTRY','${key}')`);
    await Promise.all([scan(scanId), scan(scanId), scan(randomUUID())].map((query) => promisify(execFile)("docker", [...args, query])));
    expect(sql(`select count(*) from public.gate_hardware_commands c join public.access_events e on e.id=c.access_event_id where e.visitor_invitation_id='${visitor}'`)).toBe("1");
    sql(asOperator(`select public.reconcile_visitor_access_state('${gate}','${visitor}',false,'MISSED_SCAN','private notes')`));
    const reconcile = sql(`select id from public.access_events where visitor_invitation_id='${visitor}' and decision='RECONCILE'`);
    expect(sql(`select public.enqueue_gate_hardware_command('${reconcile}')`)).toBe("");
    const manual = randomUUID();
    sql(`insert into public.gate_manual_exceptions(id,organization_id,gate_id,property_id,visitor_invitation_id,record_type,direction,outcome,category,reason,actor_user_id)
      values('${manual}','${org}','${gate}','${property}','${visitor}','REQUEST','ENTRY','ENTERED','OTHER','private notes','${operator}');
      insert into public.gate_manual_exceptions(organization_id,gate_id,property_id,visitor_invitation_id,record_type,parent_exception_id,direction,outcome,category,reason,actor_user_id)
      values('${org}','${gate}','${property}','${visitor}','APPROVAL','${manual}','ENTRY','ENTERED','OTHER','private notes','${operator}');`);
    expect(sql(`select public.enqueue_gate_hardware_command('${manual}')`)).toBe("");
    expect(sql(`select count(*) from public.gate_hardware_commands c join public.access_events e on e.id=c.access_event_id where e.visitor_invitation_id='${visitor}'`)).toBe("1");
    const serialized = sql(`select row_to_json(c) from public.gate_hardware_commands c join public.access_events e on e.id=c.access_event_id where e.visitor_invitation_id='${visitor}'`);
    for (const sensitive of ["Private Guest", "private-qr", "private-device", "private notes", visitor]) expect(serialized).not.toContain(sensitive);
    for (const row of claim()) complete(row.id, row.claim_token, "NOT_CONFIGURED");
  });
  it("bounds exponential retries and dead-letters attempt ten", () => {
    const id = commandFor(event());
    for (let attempt = 1; attempt <= 10; attempt++) {
      const job = claim().find((row: { id: string }) => row.id === id); expect(job).toBeDefined();
      expect(complete(id, job.claim_token, "RETRYABLE_ERROR")).toBe(attempt === 10 ? "DEAD" : "FAILED");
      if (attempt < 10) {
        const delay = Number(sql(`select extract(epoch from next_attempt_at-updated_at)::integer from public.gate_hardware_commands where id='${id}'`));
        expect(delay).toBe(Math.min(60 * 2 ** (attempt - 1), 3600));
        expect(claim().some((row: { id: string }) => row.id === id)).toBe(false);
        sql(`update public.gate_hardware_commands set next_attempt_at=now() where id='${id}'`);
      }
    }
    expect(claim().some((row: { id: string }) => row.id === id)).toBe(false);
  }, 120_000);
  it("rechecks policy after a claim and preserves immutable allow", () => {
    const source = event(), id = commandFor(source), job = claim().find((row: { id: string }) => row.id === id);
    sql(`update public.gate_hardware_settings set enabled=false where organization_id='${org}'`);
    expect(sql(`select public.validate_gate_hardware_command('${id}','${job.claim_token}')`)).toBe("f");
    expect(sql(`select status from public.gate_hardware_commands where id='${id}'`)).toBe("DEAD");
    expect(sql(`select decision from public.access_events where id='${source}'`)).toBe("ALLOW");
    sql(`update public.gate_hardware_settings set enabled=true where organization_id='${org}'`);
  });
  it("dead-letters a tenth abandoned lease and rejects expired completion", () => {
    const id = commandFor(event()), job = claim().find((row: { id: string }) => row.id === id);
    sql(`update public.gate_hardware_commands set attempts=10,claimed_at=now()-interval '11 minutes' where id='${id}'`);
    expect(complete(id, job.claim_token, "ACKNOWLEDGED")).toBe("STALE");
    expect(claim().some((row: { id: string }) => row.id === id)).toBe(false);
    expect(sql(`select status||'|'||result_code from public.gate_hardware_commands where id='${id}'`)).toBe("DEAD|ATTEMPTS_EXHAUSTED");
  });
  it("rejects an endpoint that belongs to a different tenant and disables queued commands", () => {
    expect(() => sql(`insert into public.gate_hardware_endpoints(organization_id,gate_id) values('${randomUUID()}','${gate}')`)).toThrow();
    const id = commandFor(event());
    sql(`update public.gate_hardware_endpoints set is_active=false where id='${endpoint}'`);
    expect(claim().some((row: { id: string }) => row.id === id)).toBe(false);
    expect(sql(`select status||'|'||result_code from public.gate_hardware_commands where id='${id}'`)).toBe("DEAD|POLICY_DISABLED");
    sql(`update public.gate_hardware_endpoints set is_active=true where id='${endpoint}'`);
  });
  it("isolates enqueue failure from canonical access evidence", () => {
    sql(`create function public.test_hardware_failure() returns trigger language plpgsql as $$ begin raise exception 'private credential'; end $$;
      revoke all on function public.test_hardware_failure() from public,anon,authenticated,service_role;
      create trigger test_hardware_failure before insert on public.gate_hardware_commands for each row execute function public.test_hardware_failure()`);
    try { const id = event(); expect(sql(`select decision from public.access_events where id='${id}'`)).toBe("ALLOW"); }
    finally { sql("drop trigger test_hardware_failure on public.gate_hardware_commands; drop function public.test_hardware_failure()"); }
  });
  it("restricts tables and worker functions and validates batches and adapters", () => {
    for (const table of ["gate_hardware_settings", "gate_hardware_endpoints", "gate_hardware_commands"]) {
      expect(sql(`select has_table_privilege('authenticated','public.${table}','select')||'|'||has_table_privilege('anon','public.${table}','select')||'|'||relrowsecurity from pg_class where oid='public.${table}'::regclass`)).toBe("false|false|true");
    }
    expect(sql("select count(*) from pg_proc p where proname in ('enqueue_gate_hardware_command','claim_gate_hardware_commands','complete_gate_hardware_command','validate_gate_hardware_command') and (has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('anon',p.oid,'execute'))")).toBe("0");
    for (const limit of [0, 51]) expect(() => sql(`select public.claim_gate_hardware_commands(${limit})`)).toThrow(/INVALID_BATCH_LIMIT/);
    expect(() => sql(`update public.gate_hardware_endpoints set adapter='VENDOR' where id='${endpoint}'`)).toThrow();
  });
});
