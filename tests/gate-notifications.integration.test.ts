import { execFile, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";

const args = ["exec", "supabase_db_aqarbooks", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-c"];
function sql(query: string) {
  return execFileSync("docker", [...args, query], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function asUser(user: string, query: string) {
  return `begin; set local role authenticated; set local request.jwt.claim.sub='${user}'; ${query}; commit;`;
}
const org = randomUUID(), property = randomUUID(), gate = randomUUID(), unit = randomUUID();
const member = randomUUID(), owner = randomUUID(), operator = randomUUID(), approver = randomUUID(), outsider = randomUUID(), device = randomUUID();
const rawQr = "private-qr-material", guestPhone = "+97455551234", credential = "private-device-credential";
function invitation() {
  const id = randomUUID();
  sql(`insert into public.visitor_invitations(id,organization_id,property_id,unit_id,invited_by_member_id,invitation_no,guest_name,guest_phone,valid_from,valid_until,usage_policy,created_by)
    values('${id}','${org}','${property}','${unit}','${member}','${id}','Display Guest','${guestPhone}',now()-interval '1 hour',now()+interval '1 hour','MULTI_USE','${owner}');
    insert into public.visitor_invitation_secrets(invitation_id,organization_id,token_hash) values('${id}','${org}',encode(extensions.digest('${rawQr}:${id}','sha256'),'hex'));`);
  return id;
}
function scan(id: string, direction = "ENTRY", scanId = randomUUID()) {
  return asUser(operator, `select reason_code from public.process_visitor_gate_scan('${device}','${credential}','${gate}','${id}','${rawQr}:${id}','${direction}','${scanId}')`);
}
function count(source: string, type: string) {
  return Number(sql(`select count(*) from public.notifications where source_id='${source}' and type='${type}'`));
}
function event(id: string, reason = "VALID_ENTRY") {
  return sql(`select id from public.access_events where visitor_invitation_id='${id}' and reason_code='${reason}' order by occurred_at desc limit 1`);
}
function uuid(output: string) { return output.match(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/g)!.at(-1)!; }

describe.sequential("gate notifications", () => {
  beforeAll(() => {
    sql(`insert into auth.users(id,email) values('${owner}','${owner}@test.local'),('${operator}','${operator}@test.local'),('${approver}','${approver}@test.local'),('${outsider}','${outsider}@test.local');
      insert into public.organizations(id,name,slug,default_currency,status) values('${org}','Notify','${org}','QAR','ACTIVE');
      insert into public.subscriptions(organization_id,plan_id,status) select '${org}',id,'ACTIVE' from public.plans where key='PROFESSIONAL';
      insert into public.organization_memberships(organization_id,user_id) values('${org}','${operator}'),('${org}','${approver}');
      insert into public.roles(id,organization_id,key,name_ar,name_en) values('${operator}','${org}','NOTIFY_SCAN','Scan','Scan'),('${approver}','${org}','NOTIFY_APPROVE','Approve','Approve');
      insert into public.role_permissions(role_id,permission_id) select '${operator}',id from public.permissions where key in ('operations.gates.scan','operations.gates.exceptions.create');
      insert into public.role_permissions(role_id,permission_id) select '${approver}',id from public.permissions where key in ('operations.gates.exceptions.approve','operations.gates.occupancy.reconcile');
      insert into public.user_role_assignments(organization_id,user_id,role_id) values('${org}','${operator}','${operator}'),('${org}','${approver}','${approver}');
      insert into public.properties(id,organization_id,name,code,timezone,property_type) values('${property}','${org}','Harbour Homes','${property}','Asia/Qatar','building');
      insert into public.units(id,organization_id,property_id,code) values('${unit}','${org}','${property}','A-101');
      insert into public.members(id,organization_id,full_name,user_id) values('${member}','${org}','Host','${owner}');
      insert into public.gates(id,organization_id,property_id,code,name_ar,name_en,created_by) values('${gate}','${org}','${property}','NORTH','البوابة الشمالية','North gate','${operator}');
      insert into public.gate_devices(id,organization_id,property_id,gate_id,installation_id_hash,credential_hash,display_name,allowed_direction,enrolled_by)
      values('${device}','${org}','${property}','${gate}',repeat('b',64),encode(extensions.digest('${credential}','sha256'),'hex'),'Scanner','BOTH','${operator}');`);
  }, 60_000);

  it("sends one safe, localized entry per visit cycle despite replay and concurrent scans", async () => {
    const id = invitation(), scanId = randomUUID();
    const run = promisify(execFile);
    await Promise.all([scan(id, "ENTRY", scanId), scan(id, "ENTRY", scanId), scan(id)].map((query) => run("docker", [...args, query])));
    const entry = event(id);
    expect(count(entry, "VISITOR_ENTERED")).toBe(1);
    const serialized = sql(`select row_to_json(n) from public.notifications n where source_id='${entry}'`);
    for (const value of [rawQr, guestPhone, credential]) expect(serialized).not.toContain(value);
    for (const value of ["Harbour Homes", "A-101", "North gate", "البوابة الشمالية", "VALID_ENTRY"]) expect(serialized).toContain(value);
    expect(sql(`select dedupe_key from public.gate_notification_outbox where source_id='${entry}'`)).toBe(`gate-entry:${entry}`);
    sql(scan(id, "EXIT")); sql(scan(id));
    expect(sql(`select count(*) from public.notifications where action_url='/portal/visitors/${id}' and type='VISITOR_ENTERED'`)).toBe("2");
  }, 30_000);

  it.each(["REVOKED", "EXPIRED"])("alerts on repeated %s presentations, with event replay deduplication", (reason) => {
    const id = invitation();
    sql(reason === "REVOKED" ? `update public.visitor_invitations set status='REVOKED',revoked_at=now(),revoked_by='${owner}' where id='${id}'` : `update public.visitor_invitations set valid_until=now()-interval '1 minute' where id='${id}'`);
    const firstScan = randomUUID(); sql(scan(id, "ENTRY", firstScan)); sql(scan(id, "ENTRY", firstScan));
    expect(count(event(id, reason), "VISITOR_SECURITY_ALERT")).toBe(0);
    const replay = randomUUID(); sql(scan(id, "ENTRY", replay)); sql(scan(id, "ENTRY", replay));
    expect(count(event(id, reason), "VISITOR_SECURITY_ALERT")).toBe(1);
  });

  it("alerts for property mismatch but not routine denials or reconciliation", () => {
    const id = invitation(), otherProperty = randomUUID(), otherUnit = randomUUID();
    sql(`insert into public.properties(id,organization_id,name,code,timezone,property_type) values('${otherProperty}','${org}','Other','${otherProperty}','Asia/Qatar','building');
      insert into public.units(id,organization_id,property_id,code) values('${otherUnit}','${org}','${otherProperty}','B-1');
      update public.visitor_invitations set property_id='${otherProperty}',unit_id='${otherUnit}' where id='${id}'`);
    sql(scan(id)); expect(count(event(id, "PROPERTY_MISMATCH"), "VISITOR_SECURITY_ALERT")).toBe(1);
    const ordinary = invitation(); sql(scan(ordinary)); sql(scan(ordinary));
    expect(count(event(ordinary, "ALREADY_INSIDE"), "VISITOR_SECURITY_ALERT")).toBe(0);
    sql(asUser(approver, `select public.reconcile_visitor_access_state('${gate}','${ordinary}',false,'MISSED_SCAN','private reason ${guestPhone}')`));
    const reconciled = event(ordinary, "RECONCILED_EXIT");
    expect(sql(`select count(*) from public.notifications where source_id='${reconciled}'`)).toBe("0");
  });

  it("notifies once for manual allow using the request identity, ignoring approval and unidentified/denied evidence", () => {
    const id = invitation();
    const request = uuid(sql(asUser(operator, `select public.create_gate_manual_exception('${gate}','${id}','ENTRY','ENTERED','OTHER','private reason ${guestPhone}')`)));
    expect(count(request, "VISITOR_MANUAL_EXCEPTION")).toBe(0);
    const approval = uuid(sql(asUser(approver, `select public.approve_gate_manual_exception('${request}','private approval ${rawQr}')`)));
    expect(count(request, "VISITOR_MANUAL_EXCEPTION")).toBe(1);
    expect(count(approval, "VISITOR_MANUAL_EXCEPTION")).toBe(0);
    expect(sql(`select dedupe_key from public.gate_notification_outbox where source_id='${request}'`)).toBe(`gate-exception:${request}`);
    const serialized = sql(`select row_to_json(n) from public.notifications n where source_id='${request}'`);
    expect(serialized).not.toContain(guestPhone); expect(serialized).not.toContain(rawQr); expect(serialized).not.toContain("private reason");
    for (const values of ["null,'ENTRY','ENTERED'", `'${id}','ENTRY','DENIED'`]) {
      const ignored = uuid(sql(asUser(operator, `select public.create_gate_manual_exception('${gate}',${values},'OTHER','Observed')`)));
      sql(asUser(approver, `select public.approve_gate_manual_exception('${ignored}','Reviewed')`));
      expect(count(ignored, "VISITOR_MANUAL_EXCEPTION")).toBe(0);
    }
  });

  it("retains a valid decision when notification delivery fails, then safely retries once", async () => {
    const id = invitation();
    sql(`create function public.test_gate_notification_failure() returns trigger language plpgsql as $$ begin if new.organization_id='${org}' and new.type='VISITOR_ENTERED' then raise exception 'sensitive ${rawQr}'; end if; return new; end $$;
      create trigger test_gate_notification_failure before insert on public.notifications for each row execute function public.test_gate_notification_failure()`);
    try {
      expect(sql(scan(id))).toContain("VALID_ENTRY");
      const entry = event(id);
      expect(count(entry, "VISITOR_ENTERED")).toBe(0);
      expect(sql(`select attempts||'|'||status from public.gate_notification_outbox where source_id='${entry}'`)).toBe("1|PENDING");
      expect(sql(`select row_to_json(q) from public.gate_notification_outbox q where source_id='${entry}'`)).not.toContain(rawQr);
    } finally {
      sql("drop trigger test_gate_notification_failure on public.notifications; drop function public.test_gate_notification_failure()");
    }
    sql(`update public.gate_notification_outbox set next_attempt_at=now() where organization_id='${org}' and status='PENDING'`);
    await Promise.all([1, 2].map(() => promisify(execFile)("docker", [...args, "select public.process_gate_notifications(100)"])));
    expect(count(event(id), "VISITOR_ENTERED")).toBe(1);
  }, 30_000);

  it("keeps worker/outbox private and notification rows recipient scoped", () => {
    const id = invitation(); sql(scan(id)); const entry = event(id);
    expect(sql(asUser(owner, `select count(*) from public.notifications where source_id='${entry}'`))).toContain("\n1\n");
    expect(sql(asUser(outsider, `select count(*) from public.notifications where source_id='${entry}'`))).toContain("\n0\n");
    expect(sql("select has_function_privilege('authenticated','public.process_gate_notifications(integer)','execute')||'|'||has_function_privilege('anon','public.process_gate_notifications(integer)','execute')||'|'||has_table_privilege('authenticated','public.gate_notification_outbox','select')")).toBe("false|false|false");
    expect(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('deliver_gate_notification','enqueue_gate_notification','notify_gate_manual_exception','notify_access_event_allowed') and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('service_role',p.oid,'execute'))")).toBe("0");
    expect(() => sql("select public.process_gate_notifications(101)")).toThrow(/INVALID_BATCH_LIMIT/);
    expect(() => sql("select public.process_gate_notifications(0)")).toThrow(/INVALID_BATCH_LIMIT/);
    expect(sql("select relrowsecurity from pg_class where oid='public.gate_notification_outbox'::regclass")).toBe("t");
  });

  it("bounds failing delivery at five attempts without altering access evidence", () => {
    const id = invitation();
    sql(`create function public.test_gate_notification_failure() returns trigger language plpgsql as $$ begin if new.organization_id='${org}' and new.type='VISITOR_ENTERED' then raise exception 'sensitive ${credential}'; end if; return new; end $$;
      create trigger test_gate_notification_failure before insert on public.notifications for each row execute function public.test_gate_notification_failure()`);
    try {
      expect(sql(scan(id))).toContain("VALID_ENTRY");
      const entry = event(id);
      for (let attempt = 0; attempt < 6; attempt++) {
        sql(`update public.gate_notification_outbox set next_attempt_at=now() where source_id='${entry}'; select public.process_gate_notifications(100)`);
      }
      expect(sql(`select attempts||'|'||status from public.gate_notification_outbox where source_id='${entry}'`)).toBe("5|FAILED");
      expect(count(entry, "VISITOR_ENTERED")).toBe(0);
      expect(sql(`select decision from public.access_events where id='${entry}'`)).toBe("ALLOW");
      expect(sql(`select row_to_json(q) from public.gate_notification_outbox q where source_id='${entry}'`)).not.toContain(credential);
    } finally {
      sql("drop trigger test_gate_notification_failure on public.notifications; drop function public.test_gate_notification_failure()");
    }
  });
});
