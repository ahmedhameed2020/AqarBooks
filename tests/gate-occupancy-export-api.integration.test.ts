import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { createGateFixture, sql } from "./helpers/gate-release";

it("exports beyond PostgREST's 1000-row cap and reports real 5000-row overflow through HTTP", async () => {
  const f = await createGateFixture(), template = f.invitation(), unlinked = randomUUID();
  sql(`insert into public.members(id,organization_id,full_name) values('${unlinked}','${f.org}','Export fixture host')`);
  function addVisitors(first: number, last: number) {
    sql(`insert into public.visitor_invitations(id,organization_id,property_id,unit_id,invited_by_member_id,invitation_no,guest_name,valid_from,valid_until,usage_policy,created_by)
      select gen_random_uuid(),i.organization_id,i.property_id,i.unit_id,'${unlinked}','export-'||n,'Export visitor '||n,i.valid_from,i.valid_until,i.usage_policy,i.created_by
      from public.visitor_invitations i cross join generate_series(${first},${last}) n where i.id='${template.id}';
      insert into public.visitor_access_state(visitor_invitation_id,organization_id,property_id,unit_id,is_inside,entry_count,exit_count,last_entry_at,last_gate_id)
      select i.id,i.organization_id,i.property_id,i.unit_id,true,1,0,now(),'${f.gate}' from public.visitor_invitations i
      where i.organization_id='${f.org}' and i.invited_by_member_id='${unlinked}'
      and not exists(select 1 from public.visitor_access_state s where s.visitor_invitation_id=i.id);`);
  }
  const args = { p_organization_id: f.org, p_limit: 5000, p_offset: 0 };
  addVisitors(1, 1001);
  const first = await f.manager.client.rpc("export_gate_current_visitors", args);
  expect(first.error).toBeNull();
  expect(first.data.totalCountLowerBound).toBe(1001);
  expect(first.data.rows).toHaveLength(1001);
  expect(first.data.truncated).toBe(false);
  expect(new Set(first.data.rows.map((r: { invitation_no: string }) => r.invitation_no)).size).toBe(1001);

  addVisitors(1002, 5000);
  const atCap = await f.manager.client.rpc("export_gate_current_visitors", args);
  expect(atCap.error).toBeNull();
  expect(atCap.data.totalCountLowerBound).toBe(5000);
  expect(atCap.data.rows).toHaveLength(5000);
  expect(atCap.data.truncated).toBe(false);

  addVisitors(5001, 5001);
  const overflow = await f.manager.client.rpc("export_gate_current_visitors", args);
  expect(overflow.error).toBeNull();
  expect(overflow.data.totalCountLowerBound).toBe(5001);
  expect(overflow.data.rows).toHaveLength(5000);
  expect(overflow.data.truncated).toBe(true);
  expect(new Set(overflow.data.rows.map((r: { invitation_no: string }) => r.invitation_no)).size).toBe(5000);
  addVisitors(5002, 25000);
  const largePopulation = await f.manager.client.rpc("export_gate_current_visitors", args);
  expect(largePopulation.error).toBeNull();
  expect(largePopulation.data.totalCountLowerBound).toBe(5001);
  expect(largePopulation.data.rows).toHaveLength(5000);
  expect(largePopulation.data.truncated).toBe(true);
  expect(Object.keys(overflow.data.rows[0]).sort()).toEqual(["entered_at", "gate_code", "guest_name", "invitation_no", "property_name", "unit_code", "valid_until"]);
  const empty = await f.manager.client.rpc("export_gate_current_visitors", { ...args, p_query: "no matching export visitor" });
  expect(empty.error).toBeNull(); expect(empty.data).toEqual({ totalCountLowerBound: 0, truncated: false, rows: [] });
  const denied = await f.owner.client.rpc("export_gate_current_visitors", args);
  expect(denied.error?.message).toContain("NOT_AUTHORIZED");
}, 180_000);
