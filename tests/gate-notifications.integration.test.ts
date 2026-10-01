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
  it("does not let 100 older unlinked recipients starve a later deliverable visit", () => {
    const unlinkedMember = randomUUID(), later = invitation();
    sql(`insert into public.members(id,organization_id,full_name) values('${unlinkedMember}','${org}','Unlinked host');
      insert into public.gate_long_stay_policy(organization_id,threshold_hours,notifications_enabled,updated_by)
      values('${org}',1,true,'${approver}') on conflict(organization_id) do update set threshold_hours=1,notifications_enabled=true;
      begin;
      insert into public.visitor_invitations(id,organization_id,property_id,unit_id,invited_by_member_id,invitation_no,guest_name,valid_from,valid_until,usage_policy,created_by)
      select gen_random_uuid(),'${org}','${property}','${unit}','${unlinkedMember}','starve-'||n,'Unlinked guest',now()-interval '8 hours',now()+interval '1 hour','MULTI_USE','${owner}' from generate_series(1,100) n;
      insert into public.visitor_access_state(visitor_invitation_id,organization_id,property_id,unit_id,is_inside,entry_count,exit_count,last_entry_at,last_gate_id)
      select id,'${org}','${property}','${unit}',true,1,0,now()-interval '6 hours','${gate}' from public.visitor_invitations where invited_by_member_id='${unlinkedMember}';
      insert into public.access_events(organization_id,property_id,gate_id,visitor_invitation_id,unit_id,direction,decision,reason_code,client_scan_id,operator_user_id,usage_policy,guest_name,invitation_no,is_inside_after,occurred_at)
      select '${org}','${property}','${gate}',id,'${unit}','ENTRY','ALLOW','VALID_ENTRY',gen_random_uuid(),'${operator}','MULTI_USE',guest_name,invitation_no,true,now()-interval '6 hours' from public.visitor_invitations where invited_by_member_id='${unlinkedMember}';
      insert into public.visitor_access_state(visitor_invitation_id,organization_id,property_id,unit_id,is_inside,entry_count,exit_count,last_entry_at,last_gate_id)
      values('${later}','${org}','${property}','${unit}',true,1,0,now()-interval '2 hours','${gate}');
      insert into public.access_events(organization_id,property_id,gate_id,visitor_invitation_id,unit_id,direction,decision,reason_code,client_scan_id,operator_user_id,usage_policy,guest_name,invitation_no,is_inside_after,occurred_at)
      values('${org}','${property}','${gate}','${later}','${unit}','ENTRY','ALLOW','VALID_ENTRY',gen_random_uuid(),'${operator}','MULTI_USE','Display Guest','${later}',true,now()-interval '2 hours'); commit;`);
    try {
      expect(sql("set role service_role; select public.detect_gate_long_stays(100)").split("\n").at(-1)).toBe("1");
      expect(count(event(later),"VISITOR_SECURITY_ALERT")).toBe(1);
      expect(sql(`select count(*) from public.gate_notification_outbox o join public.access_events e on e.id=o.source_id and e.organization_id=o.organization_id
        join public.visitor_invitations i on i.id=e.visitor_invitation_id and i.organization_id=e.organization_id where i.invited_by_member_id='${unlinkedMember}'`)).toBe("0");
    } finally {
      sql(`update public.gate_long_stay_policy set notifications_enabled=false where organization_id='${org}'`);
    }
  }, 120_000);
  it("uses explicit tenant policy and original visit entry for bounded idempotent alerts", async () => {
    expect(() => sql(asUser(operator, `select public.set_gate_long_stay_policy('${org}',1,true)`))).toThrow();
    expect(() => sql(asUser(outsider, `select public.set_gate_long_stay_policy('${org}',1,true)`))).toThrow();
    sql(`insert into public.role_permissions(role_id,permission_id) select '${approver}',id from public.permissions where key='operations.gates.manage' on conflict do nothing`);
    expect(() => sql(asUser(approver, `select public.set_gate_long_stay_policy('${org}',0,true)`))).toThrow();
    sql(asUser(approver, `select public.set_gate_long_stay_policy('${org}',1,false)`));
    expect(sql(asUser(outsider, `select count(*) from public.gate_long_stay_policy where organization_id='${org}'`))).toContain("0");
    expect(() => sql(asUser(operator, `update public.gate_long_stay_policy set notifications_enabled=true where organization_id='${org}'`))).toThrow();
    expect(() => sql(asUser(operator, `select public.detect_gate_long_stays(100)`))).toThrow();
    expect(() => sql(`select public.detect_gate_long_stays(101)`)).toThrow();
    const id = invitation();
    // Immutable evidence is created with a historical transaction timestamp, as a real old entry.
    sql(`begin; insert into public.visitor_access_state(visitor_invitation_id,organization_id,property_id,unit_id,is_inside,entry_count,exit_count,last_entry_at,last_gate_id)
      values('${id}','${org}','${property}','${unit}',true,1,0,now()-interval '2 hours','${gate}');
      insert into public.access_events(organization_id,property_id,gate_id,visitor_invitation_id,unit_id,direction,decision,reason_code,client_scan_id,operator_user_id,usage_policy,guest_name,invitation_no,is_inside_after,occurred_at)
      values('${org}','${property}','${gate}','${id}','${unit}','ENTRY','ALLOW','VALID_ENTRY',gen_random_uuid(),'${operator}','MULTI_USE','Display Guest','${id}',true,now()-interval '2 hours'); commit;`);
    const entry = event(id);
    sql(`select public.detect_gate_long_stays(100)`);
    expect(count(entry, "VISITOR_SECURITY_ALERT")).toBe(0);
    sql(asUser(approver, `select public.set_gate_long_stay_policy('${org}',3,true)`));
    sql(`select public.detect_gate_long_stays(100)`);
    expect(count(entry, "VISITOR_SECURITY_ALERT")).toBe(0);
    sql(asUser(approver, `select public.set_gate_long_stay_policy('${org}',1,true)`));
    const run = promisify(execFile);
    await Promise.all([1,2,3].map(() => run("docker", [...args, "set role service_role; select public.detect_gate_long_stays(100); select public.process_gate_notifications(100)"])));
    expect(count(entry, "VISITOR_SECURITY_ALERT")).toBe(1);
    const payload = sql(`select row_to_json(n) from public.notifications n where source_id='${entry}' and type='VISITOR_SECURITY_ALERT'`);
    expect(payload).toContain("LONG_STAY");
    for (const secret of [guestPhone,rawQr,credential,"private reason"]) expect(payload).not.toContain(secret);
    // A new reconciliation timestamp cannot reuse the old ALLOW entry as its origin.
    sql(`update public.visitor_access_state set last_entry_at=now()-interval '3 hours' where visitor_invitation_id='${id}'`);
    expect(sql(`select public.detect_gate_long_stays(100)`)).toBe("0");
    expect(count(entry, "VISITOR_SECURITY_ALERT")).toBe(1);
    sql(`begin; update public.visitor_access_state set entry_count=2,exit_count=1,last_entry_at=now()-interval '90 minutes' where visitor_invitation_id='${id}';
      insert into public.access_events(organization_id,property_id,gate_id,visitor_invitation_id,unit_id,direction,decision,reason_code,client_scan_id,operator_user_id,usage_policy,guest_name,invitation_no,is_inside_after,occurred_at)
      values('${org}','${property}','${gate}','${id}','${unit}','ENTRY','ALLOW','VALID_ENTRY',gen_random_uuid(),'${operator}','MULTI_USE','Display Guest','${id}',true,now()-interval '90 minutes'); commit;
      select public.detect_gate_long_stays(100); select public.process_gate_notifications(100); select public.detect_gate_long_stays(100);`);
    expect(sql(`select count(*) from public.notifications where action_url='/portal/visitors/${id}' and type='VISITOR_SECURITY_ALERT'`)).toBe("2");
    sql(asUser(approver, `select public.set_gate_long_stay_policy('${org}',12,false)`));
  }, 120_000);
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
      insert into public.gate_completion_policy(organization_id,enabled,updated_by) values('${org}',true,'${operator}');
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
