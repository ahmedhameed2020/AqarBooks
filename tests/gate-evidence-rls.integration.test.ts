import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

const args = ["exec", "supabase_db_aqarbooks", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-c"];
function sql(query: string) {
  return execFileSync("docker", [...args, query], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function asUser(user: string, query: string) {
  return `begin; set local role authenticated; set local request.jwt.claim.sub = '${user}'; ${query}; commit;`;
}
function jsonResult<T>(output: string): T {
  const line = output.split(/\r?\n/).find((value) => value.startsWith("[") || value.startsWith("{"));
  if (!line) throw new Error(`No JSON result in: ${output}`);
  return JSON.parse(line) as T;
}

const organizationId = randomUUID();
const otherOrganizationId = randomUUID();
const propertyId = randomUUID();
const unitId = randomUUID();
const gateId = randomUUID();
const memberId = randomUUID();
const operatorId = randomUUID();
const supervisorId = randomUUID();
const outsiderId = randomUUID();
const invitationId = randomUUID();
const eventIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];

function evidenceQuery(extra = "") {
  return `select coalesce(json_agg(row_to_json(x)),'[]'::json) from public.list_gate_access_evidence(
    p_organization_id=>'${organizationId}', p_from=>'2026-09-25T00:00:00Z', p_to=>'2026-09-26T00:00:00Z', ${extra} p_limit=>2
  ) x`;
}

describe.sequential("gate evidence safe projections", () => {
  beforeAll(() => {
    sql("select 'public.list_gate_current_visitors(uuid,uuid,uuid,text,integer,integer)'::regprocedure, 'public.list_gate_access_evidence(uuid,uuid,uuid,text,text,text,text,text,text,timestamp with time zone,timestamp with time zone,integer,integer,timestamp with time zone,uuid,timestamp with time zone,uuid)'::regprocedure");
    sql(`
      insert into auth.users(id,email) values
        ('${operatorId}','${operatorId}@test.local'),
        ('${supervisorId}','${supervisorId}@test.local'),
        ('${outsiderId}','${outsiderId}@test.local');
      update public.profiles set full_name=case id when '${operatorId}' then 'Needle Operator'::text else 'Evidence Supervisor'::text end
      where id in ('${operatorId}','${supervisorId}');
      insert into public.organizations(id,name,slug,default_currency,status) values
        ('${organizationId}','Evidence Org','${organizationId}','QAR','ACTIVE'),
        ('${otherOrganizationId}','Other Evidence Org','${otherOrganizationId}','QAR','ACTIVE');
      insert into public.subscriptions(organization_id,plan_id,status)
        select '${organizationId}',id,'ACTIVE' from public.plans where key='PROFESSIONAL';
      insert into public.organization_memberships(organization_id,user_id) values
        ('${organizationId}','${operatorId}'),('${organizationId}','${supervisorId}'),
        ('${otherOrganizationId}','${outsiderId}');
      insert into public.roles(id,organization_id,key,name_ar,name_en) values
        ('${operatorId}','${organizationId}','EVIDENCE_OPERATOR','Operator','Operator'),
        ('${supervisorId}','${organizationId}','EVIDENCE_SUPERVISOR','Supervisor','Supervisor'),
        ('${outsiderId}','${otherOrganizationId}','OTHER_SUPERVISOR','Other','Other');
      insert into public.role_permissions(role_id,permission_id)
        select '${operatorId}',id from public.permissions where key='operations.gates.scan';
      insert into public.role_permissions(role_id,permission_id)
        select '${supervisorId}',id from public.permissions where key='operations.access_events.view';
      insert into public.role_permissions(role_id,permission_id)
        select '${outsiderId}',id from public.permissions where key='operations.access_events.view';
      insert into public.user_role_assignments(organization_id,user_id,role_id) values
        ('${organizationId}','${operatorId}','${operatorId}'),
        ('${organizationId}','${supervisorId}','${supervisorId}'),
        ('${otherOrganizationId}','${outsiderId}','${outsiderId}');
      insert into public.properties(id,organization_id,name,code,timezone,property_type)
        values('${propertyId}','${organizationId}','Evidence Property','${propertyId}','Asia/Qatar','building');
      insert into public.units(id,organization_id,property_id,code)
        values('${unitId}','${organizationId}','${propertyId}','SAFE-UNIT');
      insert into public.members(id,organization_id,full_name,user_id)
        values('${memberId}','${organizationId}','Host','${operatorId}');
      insert into public.gates(id,organization_id,property_id,code,name_ar,name_en,created_by)
        values('${gateId}','${organizationId}','${propertyId}','SAFE','بوابة آمنة','Safe Gate','${operatorId}');
      insert into public.visitor_invitations(
        organization_id,property_id,unit_id,invited_by_member_id,invitation_no,guest_name,
        valid_from,valid_until,usage_policy,status,created_by
      )
      select '${organizationId}','${propertyId}','${unitId}','${memberId}',
        'DECOY-'||n,'Needle Guest',now()-interval '1 hour',now()+interval '1 hour','MULTI_USE','ACTIVE','${operatorId}'
      from generate_series(1,1001) n;
      insert into public.visitor_invitations(
        id,organization_id,property_id,unit_id,invited_by_member_id,invitation_no,guest_name,
        valid_from,valid_until,usage_policy,status,created_by
      ) values(
        '${invitationId}','${organizationId}','${propertyId}','${unitId}','${memberId}',
        'TARGET-NEEDLE','Needle Guest',now()-interval '2 hours',now()+interval '1 hour','MULTI_USE','ACTIVE','${operatorId}'
      );
      insert into public.visitor_access_state(
        visitor_invitation_id,organization_id,property_id,unit_id,is_inside,entry_count,exit_count,last_entry_at,last_gate_id
      ) values('${invitationId}','${organizationId}','${propertyId}','${unitId}',true,1,0,now()-interval '2 hours','${gateId}');
      insert into public.access_events(
        id,organization_id,property_id,gate_id,visitor_invitation_id,unit_id,direction,decision,
        reason_code,client_scan_id,operator_user_id,guest_name,invitation_no,is_inside_after,occurred_at
      ) values
        ('${eventIds[0]}','${organizationId}','${propertyId}','${gateId}','${invitationId}','${unitId}','ENTRY','DENY','INVALID_PASS','${randomUUID()}','${operatorId}','Needle Guest','TARGET-NEEDLE',null,'2026-09-25T10:00:00Z'),
        ('${eventIds[1]}','${organizationId}','${propertyId}','${gateId}','${invitationId}','${unitId}','ENTRY','DENY','INVALID_PASS','${randomUUID()}','${operatorId}','Needle Guest','TARGET-NEEDLE',null,'2026-09-25T09:00:00Z'),
        ('${eventIds[2]}','${organizationId}','${propertyId}','${gateId}','${invitationId}','${unitId}','ENTRY','DENY','INVALID_PASS','${randomUUID()}','${operatorId}','Needle Guest','TARGET-NEEDLE',null,'2026-09-25T08:00:00Z'),
        ('${eventIds[3]}','${organizationId}','${propertyId}','${gateId}','${invitationId}','${unitId}','ENTRY','DENY','INVALID_PASS','${randomUUID()}','${operatorId}','Needle Guest','TARGET-NEEDLE',null,'2026-09-25T07:00:00Z');
    `);
  }, 60_000);

  it("hydrates canonical occupancy despite invitation RLS and searches before pagination without a 1000-candidate cap", () => {
    expect(sql(asUser(supervisorId, `select count(*) from public.visitor_invitations where id='${invitationId}'`))).toContain("\n0\n");
    const result = jsonResult<Array<{ invitation_id: string; guest_name: string; total_count: number }>>(sql(asUser(supervisorId, `
      select coalesce(json_agg(row_to_json(x)),'[]'::json) from public.list_gate_current_visitors(
        p_organization_id=>'${organizationId}', p_query=>'Needle', p_offset=>0, p_limit=>50
      ) x
    `)));
    expect(result).toEqual([expect.objectContaining({ invitation_id: invitationId, guest_name: "Needle Guest", total_count: 1 })]);
    expect(() => sql(asUser(outsiderId, `select * from public.list_gate_current_visitors('${organizationId}',null,null,null,0,50)`))).toThrow(/GATE_EVIDENCE_NOT_AUTHORIZED/);
  });

  it("filters and hydrates operator names for ordinary supervisors without broad profile access", () => {
    expect(sql(asUser(supervisorId, `select count(*) from public.profiles where id='${operatorId}'`))).toContain("\n0\n");
    const result = jsonResult<Array<{ operator_user_id: string; operator_name: string; total_count: number }>>(sql(asUser(supervisorId, evidenceQuery("p_operator=>'Needle',"))));
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ operator_user_id: operatorId, operator_name: "Needle Operator", total_count: 4 });
    expect(() => sql(asUser(outsiderId, evidenceQuery("p_operator=>'Needle',")))).toThrow(/GATE_EVIDENCE_NOT_AUTHORIZED/);
  });

  it("uses a captured upper bound and keyset cursor when newer evidence arrives", () => {
    const first = jsonResult<Array<{ id: string; occurred_at: string }>>(sql(asUser(supervisorId, evidenceQuery())));
    expect(first.map((row) => row.id)).toEqual(eventIds.slice(0, 2));
    const inserted = randomUUID();
    sql(`insert into public.access_events(
      id,organization_id,property_id,gate_id,direction,decision,reason_code,client_scan_id,operator_user_id,occurred_at
    ) values('${inserted}','${organizationId}','${propertyId}','${gateId}','ENTRY','DENY','INVALID_PASS','${randomUUID()}','${operatorId}','2026-09-25T11:00:00Z')`);
    const upper = first[0];
    const cursor = first[1];
    const second = jsonResult<Array<{ id: string }>>(sql(asUser(supervisorId, evidenceQuery(`
      p_upper_occurred_at=>'${upper.occurred_at}', p_upper_id=>'${upper.id}',
      p_cursor_occurred_at=>'${cursor.occurred_at}', p_cursor_id=>'${cursor.id}',
    `))));
    expect(second.map((row) => row.id)).toEqual(eventIds.slice(2, 4));
    expect(second.some((row) => row.id === inserted)).toBe(false);
  });
});
