import { execFile, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";

const args = ["exec", "supabase_db_aqarbooks", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-c"];
function sql(query: string) {
  return execFileSync("docker", [...args, query], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function asUser(user: string, query: string) {
  return `begin; set local role authenticated; set local request.jwt.claim.sub = '${user}'; ${query}; commit;`;
}
const org = randomUUID(), otherOrg = randomUUID(), property = randomUUID(), gate = randomUUID();
const unit = randomUUID(), member = randomUUID(), creator = randomUUID(), approver = randomUUID(), outsider = randomUUID();
const device = randomUUID();
function invitation() {
  const id = randomUUID();
  sql(`insert into public.visitor_invitations(id,organization_id,property_id,unit_id,invited_by_member_id,invitation_no,guest_name,valid_from,valid_until,usage_policy,created_by)
    values('${id}','${org}','${property}','${unit}','${member}','${id}','Guest',now()-interval '1 hour',now()+interval '1 hour','MULTI_USE','${creator}');
    insert into public.visitor_invitation_secrets(invitation_id,organization_id,token_hash) values('${id}','${org}',encode(extensions.digest('${id}','sha256'),'hex'));`);
  return id;
}
function create(id: string, reason = "Observed at gate", category = "OTHER") {
  return `select public.create_gate_manual_exception('${gate}','${id}','ENTRY','ENTERED','${category}','${reason}',null,'${device}')`;
}
function reconcile(id: string, inside: boolean) {
  return `select public.reconcile_visitor_access_state('${gate}','${id}',${inside},'MISSED_SCAN','Physical occupancy verified')`;
}
function scan(id: string, direction: string) {
  return `select reason_code from public.process_visitor_gate_scan('${device}','test-device-credential','${gate}','${id}','${id}','${direction}','${randomUUID()}')`;
}
function lastUuid(output: string) { return output.match(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/g)!.at(-1)!; }

describe.sequential("gate supervision runtime RLS", () => {
  beforeAll(() => {
    // Fail explicitly at the missing contract before creating any fixtures in RED.
    sql("select 'public.gate_manual_exceptions'::regclass, 'public.gate_access_reconciliations'::regclass");
    sql(`insert into auth.users(id,email) values('${creator}','${creator}@test.local'),('${approver}','${approver}@test.local'),('${outsider}','${outsider}@test.local');
      insert into public.organizations(id,name,slug,default_currency,status) values('${org}','Supervision','${org}','EGP','ACTIVE'),('${otherOrg}','Other','${otherOrg}','EGP','ACTIVE');
      insert into public.subscriptions(organization_id,plan_id,status) select '${org}',id,'ACTIVE' from public.plans where key='PROFESSIONAL';
      insert into public.organization_memberships(organization_id,user_id) values('${org}','${creator}'),('${org}','${approver}'),('${otherOrg}','${outsider}');
      insert into public.roles(id,organization_id,key,name_ar,name_en) values('${creator}','${org}','SUP_CREATE','Create','Create'),('${approver}','${org}','SUP_APPROVE','Approve','Approve'),('${outsider}','${otherOrg}','SUP_OTHER','Other','Other');
      insert into public.role_permissions(role_id,permission_id) select '${creator}',id from public.permissions where key in ('operations.gates.exceptions.create','operations.gates.scan');
      insert into public.role_permissions(role_id,permission_id) select '${approver}',id from public.permissions where key in ('operations.gates.exceptions.approve','operations.gates.occupancy.reconcile','operations.access_events.view');
      insert into public.role_permissions(role_id,permission_id) select '${outsider}',id from public.permissions where key in ('operations.gates.exceptions.create','operations.gates.exceptions.approve','operations.gates.occupancy.reconcile','operations.access_events.view');
      insert into public.user_role_assignments(organization_id,user_id,role_id) values('${org}','${creator}','${creator}'),('${org}','${approver}','${approver}'),('${otherOrg}','${outsider}','${outsider}');
      insert into public.properties(id,organization_id,name,code,timezone,property_type) values('${property}','${org}','Supervision','${property}','Asia/Qatar','building');
      insert into public.units(id,organization_id,property_id,code) values('${unit}','${org}','${property}','TEST');
      insert into public.members(id,organization_id,full_name,user_id) values('${member}','${org}','Guest host','${creator}');
      insert into public.gates(id,organization_id,property_id,code,name_ar,name_en,created_by) values('${gate}','${org}','${property}','TEST','Gate','Gate','${creator}');
      insert into public.gate_devices(id,organization_id,property_id,gate_id,installation_id_hash,credential_hash,display_name,allowed_direction,enrolled_by)
      values('${device}','${org}','${property}','${gate}',repeat('a',64),encode(extensions.digest('test-device-credential','sha256'),'hex'),'Scanner','BOTH','${creator}');`);
  }, 60_000);

  it("exposes only authenticated RPCs and read-only evidence", () => {
    expect(sql(`select has_function_privilege('anon','public.create_gate_manual_exception(uuid,uuid,text,text,text,text,uuid,uuid)','execute')
      ||'|'||has_function_privilege('authenticated','public.gate_supervision_context(uuid,text)','execute')
      ||'|'||has_table_privilege('authenticated','public.gate_manual_exceptions','insert')
      ||'|'||has_table_privilege('authenticated','public.gate_access_reconciliations','update')
      ||'|'||has_table_privilege('service_role','public.gate_manual_exceptions','truncate')`)).toBe("false|false|false|false|false");
    expect(() => sql(`select public.create_gate_manual_exception('${gate}','${randomUUID()}','ENTRY','ENTERED','OTHER','Reason')`)).toThrow(/NOT_AUTHENTICATED/);
  });

  it.each([["ENTRY", "ENTERED"], ["EXIT", "EXITED"], ["ENTRY", "DENIED"]])("records and approves unidentified %s/%s evidence scoped by gate", (direction, outcome) => {
    const statement = `select public.create_gate_manual_exception('${gate}',null,'${direction}','${outcome}','OTHER','Unknown visitor',null,'${device}')`;
    const request = lastUuid(sql(asUser(creator, statement)));
    expect(sql(`select organization_id||'|'||property_id||'|'||(visitor_invitation_id is null)||'|'||outcome from public.gate_manual_exceptions where id='${request}'`)).toBe(`${org}|${property}|true|${outcome}`);
    const before = sql(`select row_to_json(e) from public.gate_manual_exceptions e where id='${request}'`);
    expect(() => sql(asUser(outsider, statement))).toThrow(/NOT_AUTHORIZED/);
    expect(() => sql(asUser(outsider, `select public.approve_gate_manual_exception('${request}','Cross tenant')`))).toThrow(/NOT_AUTHORIZED/);
    expect(sql(asUser(outsider, `select count(*) from public.gate_manual_exception_details where id='${request}'`))).toContain("\n0\n");
    sql(asUser(approver, `select public.approve_gate_manual_exception('${request}','Reviewed unidentified visitor')`));
    expect(sql(`select row_to_json(e) from public.gate_manual_exceptions e where id='${request}'`)).toBe(before);
    expect(sql(asUser(approver, `select status||'|'||property_id||'|'||(visitor_invitation_id is null) from public.gate_manual_exception_details where id='${request}'`))).toContain(`APPROVED|${property}|true`);
    expect(() => sql(asUser(creator, statement.replace(device, randomUUID())))).toThrow(/NOT_AUTHORIZED/);
    expect(() => sql(asUser(approver, `select public.reconcile_visitor_access_state('${gate}',null,true,'MISSED_SCAN','Unidentified')`))).toThrow(/INVALID_RECONCILIATION/);
  });

  it("separates creation and approval without mutating the request or occupancy", () => {
    const id = invitation();
    const request = lastUuid(sql(asUser(creator, create(id))));
    const before = sql(`select row_to_json(e) from public.gate_manual_exceptions e where id='${request}'`);
    expect(() => sql(asUser(approver, create(id)))).toThrow(/NOT_AUTHORIZED/);
    expect(() => sql(asUser(creator, `select public.approve_gate_manual_exception('${request}','Confirmed')`))).toThrow(/NOT_AUTHORIZED/);
    const approved = lastUuid(sql(asUser(approver, `select public.approve_gate_manual_exception('${request}','Confirmed')`)));
    expect(approved).not.toBe(request);
    expect(sql(asUser(approver, `select status||'|'||operator_user_id||'|'||supervisor_user_id from public.gate_manual_exception_details where id='${request}'`))).toContain(`APPROVED|${creator}|${approver}`);
    expect(sql(`select row_to_json(e) from public.gate_manual_exceptions e where id='${request}'`)).toBe(before);
    expect(sql(`select count(*) from public.visitor_access_state where visitor_invitation_id='${id}'`)).toBe("0");
    expect(() => sql(asUser(approver, `select public.approve_gate_manual_exception('${request}','Again')`))).toThrow(/ALREADY_APPROVED/);
    sql(`insert into public.role_permissions(role_id,permission_id) select '${creator}',id from public.permissions where key='operations.gates.exceptions.approve'`);
    expect(() => sql(asUser(creator, `select public.approve_gate_manual_exception('${request}','Own request')`))).toThrow(/SELF_APPROVAL/);
    sql(`delete from public.role_permissions where role_id='${creator}' and permission_id=(select id from public.permissions where key='operations.gates.exceptions.approve')`);
  });

  it("validates unidentified source events and retains linked property checks", () => {
    const unknown = randomUUID();
    expect(sql(asUser(creator, scan(unknown, "ENTRY")))).toContain("INVALID_PASS");
    const unknownEvent = sql(`select id from public.access_events where organization_id='${org}' and visitor_invitation_id is null order by occurred_at desc limit 1`);
    const unlinked = `select public.create_gate_manual_exception('${gate}',null,'ENTRY','DENIED','OTHER','Unknown at gate','${unknownEvent}','${device}')`;
    const request = lastUuid(sql(asUser(creator, unlinked)));
    expect(sql(`select source_event_id from public.gate_manual_exceptions where id='${request}'`)).toBe(unknownEvent);
    expect(() => sql(asUser(creator, unlinked.replace("'ENTRY'", "'EXIT'")))).toThrow(/NOT_AUTHORIZED/);
    const id = invitation();
    expect(sql(asUser(creator, scan(id, "ENTRY")))).toContain("VALID_ENTRY");
    const knownEvent = sql(`select id from public.access_events where visitor_invitation_id='${id}'`);
    expect(() => sql(asUser(creator, unlinked.replace(unknownEvent, knownEvent)))).toThrow(/NOT_AUTHORIZED/);
    expect(() => sql(asUser(creator, create(id).replace(`null,'${device}'`, `'${unknownEvent}','${device}'`)))).toThrow(/NOT_AUTHORIZED/);
    expect(lastUuid(sql(asUser(creator, create(id).replace(`null,'${device}'`, `'${knownEvent}','${device}'`))))).toBeTruthy();
    const otherProperty = randomUUID(), otherUnit = randomUUID(), otherInvitation = invitation();
    sql(`insert into public.properties(id,organization_id,name,code,timezone,property_type) values('${otherProperty}','${org}','Other property','${otherProperty}','Asia/Qatar','building');
      insert into public.units(id,organization_id,property_id,code) values('${otherUnit}','${org}','${otherProperty}','OTHER');
      update public.visitor_invitations set property_id='${otherProperty}',unit_id='${otherUnit}' where id='${otherInvitation}'`);
    expect(() => sql(asUser(creator, create(otherInvitation)))).toThrow(/NOT_AUTHORIZED/);
  });

  it("requires reason/category and isolates tenants and evidence mutation", () => {
    const id = invitation();
    for (const statement of [create(id, " "), create(id, "Reason", " "), create(id, "Reason", "INVALID")]) {
      expect(() => sql(asUser(creator, statement))).toThrow(/INVALID_/);
    }
    expect(() => sql(asUser(outsider, create(id)))).toThrow(/NOT_AUTHORIZED/);
    expect(() => sql(asUser(outsider, reconcile(id, true)))).toThrow(/NOT_AUTHORIZED/);
    expect(() => sql(asUser(creator, reconcile(id, true)))).toThrow(/NOT_AUTHORIZED/);
    expect(() => sql(asUser(creator, create(randomUUID())))).toThrow(/NOT_AUTHORIZED/);
    expect(() => sql(asUser(creator, create(id).replace(`null,'${device}'`, `'${randomUUID()}','${device}'`)))).toThrow(/NOT_AUTHORIZED/);
    expect(() => sql(asUser(creator, create(id).replace(device, randomUUID())))).toThrow(/NOT_AUTHORIZED/);
    const request = lastUuid(sql(asUser(creator, create(id))));
    expect(sql(asUser(outsider, `select count(*) from public.gate_manual_exceptions where id='${request}'`))).toContain("\n0\n");
    expect(() => sql(asUser(outsider, `select public.approve_gate_manual_exception('${request}','Cross tenant')`))).toThrow(/NOT_AUTHORIZED/);
    expect(() => sql(asUser(approver, `select public.approve_gate_manual_exception('${request}',' ')`))).toThrow(/INVALID_/);
    for (const statement of [`update public.gate_manual_exceptions set reason='changed' where id='${request}'`, `delete from public.gate_manual_exceptions where id='${request}'`]) {
      expect(() => sql(asUser(creator, statement))).toThrow(/permission denied/);
      expect(() => sql(statement)).toThrow(/APPEND_ONLY/);
    }
  });

  it("appends reason-coded before/after evidence and preserves original scan decisions", () => {
    const id = invitation();
    expect(sql(asUser(creator, scan(id, "ENTRY")))).toContain("VALID_ENTRY");
    const original = sql(`select row_to_json(e) from public.access_events e where visitor_invitation_id='${id}'`);
    const result = lastUuid(sql(asUser(approver, reconcile(id, false))));
    expect(sql(`select row_to_json(e) from public.access_events e where visitor_invitation_id='${id}' and decision='ALLOW'`)).toBe(original);
    expect(sql(`select entry_count||'|'||exit_count||'|'||is_inside from public.visitor_access_state where visitor_invitation_id='${id}'`)).toBe("1|1|false");
    expect(sql(`select before_is_inside||'|'||after_is_inside from public.gate_access_reconciliations where id='${result}'`)).toBe("true|false");
    expect(sql(`select decision||'|'||reason_code from public.access_events where visitor_invitation_id='${id}' and decision='RECONCILE'`)).toBe("RECONCILE|RECONCILED_EXIT");
    expect(() => sql(`update public.gate_access_reconciliations set reason='changed' where id='${result}'`)).toThrow(/APPEND_ONLY/);
    expect(() => sql(`delete from public.gate_access_reconciliations where id='${result}'`)).toThrow(/APPEND_ONLY/);
    expect(() => sql(asUser(approver, reconcile(id, false)))).toThrow(/STATE_UNCHANGED/);
    expect(sql(asUser(outsider, `select count(*) from public.gate_access_reconciliations where id='${result}'`))).toContain("\n0\n");
    for (const query of [reconcile(id, true).replace("'MISSED_SCAN'", "null"), reconcile(id, true).replace("'Physical occupancy verified'", "' '")]) {
      expect(() => sql(asUser(approver, query))).toThrow(/INVALID_/);
    }
    expect(sql(`select count(*) from public.gate_access_reconciliations where visitor_invitation_id='${id}'`)).toBe("1");
  });

  it.each(["scan-first", "reconcile-first"])("serializes reconciliation racing a scan (%s)", async (order) => {
    const id = invitation();
    const first = order === "scan-first" ? scan(id, "ENTRY") : reconcile(id, true);
    const second = order === "scan-first" ? reconcile(id, false) : scan(id, "EXIT");
    const firstUser = order === "scan-first" ? creator : approver;
    const secondUser = order === "scan-first" ? approver : creator;
    // Hold the same invitation lock as the RPCs, mark a distinguishable backend,
    // and wait until PostgreSQL confirms that lock is held before racing the peer.
    const run = promisify(execFile);
    const marker = `supervision-${id}`;
    // Keep an interactive transaction open until the peer is observed waiting.
    // A fixed sleep can expire before Windows launches the peer under load.
    const pending = run("docker", ["exec", "-i", ...args.slice(1, -1)], { timeout: 30_000 });
    // Attach rejection handlers immediately so infrastructure failure cannot leave
    // an unhandled promise while polling for the lock owner.
    const settled = [pending.then((value) => ({ value }), (error: unknown) => ({ error }))];
    const queryOwner = (query: string) => new Promise<string>((resolve, reject) => {
      const prefix = `owner-result-${randomUUID()}:`;
      let buffer = "";
      const cleanup = () => {
        pending.child.stdout!.off("data", onData);
        pending.child.off("close", onClose);
      };
      const onData = (chunk: Buffer) => {
        buffer += chunk.toString();
        const start = buffer.indexOf(prefix);
        const end = buffer.indexOf("\n", start);
        if (start >= 0 && end >= 0) {
          cleanup();
          resolve(buffer.slice(start + prefix.length, end).trim());
        }
      };
      const onClose = () => { cleanup(); reject(new Error("Lock owner exited before observation completed")); };
      pending.child.stdout!.on("data", onData);
      pending.child.once("close", onClose);
      // Reuse the lock owner's connection, avoiding a third concurrent Docker
      // process. Clear statistics snapshots so each poll sees the live peer.
      pending.child.stdin!.write(`select pg_stat_clear_snapshot(); select '${prefix}' || (${query})::text;\n`);
    });
    let results: Awaited<typeof pending>[] = [];
    let released = false;
    try {
      pending.child.stdin!.write(`begin; set application_name='${marker}'; select id from public.visitor_invitations where id='${id}' for update;\n`);
      // A reply is emitted only after the preceding FOR UPDATE has completed.
      expect(await queryOwner("select 1")).toBe("1");
      const peer = run("docker", [...args, `set application_name='peer-${marker}'; ${asUser(secondUser, second)}`], { timeout: 30_000 });
      settled.push(peer.then((value) => ({ value }), (error: unknown) => ({ error })));
      let blocked = false;
      const observationDeadline = Date.now() + 15_000;
      while (Date.now() < observationDeadline) {
        blocked = await queryOwner(`select count(*) from pg_stat_activity where application_name='peer-${marker}' and wait_event_type='Lock'`) === "1";
        if (blocked) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(blocked).toBe(true);
      pending.child.stdin!.end(`set local role authenticated; set local request.jwt.claim.sub='${firstUser}'; ${first}; commit;\n`);
      released = true;
      results = await Promise.all([pending, peer]);
    } finally {
      if (!released) pending.child.stdin?.end("rollback;\n");
      await Promise.all(settled);
    }
    expect(results.every((result) => !result.stderr)).toBe(true);
    expect(sql(`select entry_count||'|'||exit_count||'|'||is_inside from public.visitor_access_state where visitor_invitation_id='${id}'`)).toBe("1|1|false");
    expect(sql(`select count(*) from public.access_events where visitor_invitation_id='${id}'`)).toBe("2");
    expect(sql(`select count(*) from public.gate_access_reconciliations where visitor_invitation_id='${id}'`)).toBe("1");
    expect(sql(`select string_agg(is_inside_after::text,',' order by occurred_at) from public.access_events where visitor_invitation_id='${id}'`)).toBe("true,false");
    expect(sql(`select last_entry_at <= last_exit_at from public.visitor_access_state where visitor_invitation_id='${id}'`)).toBe("t");
  }, 45_000);
});
