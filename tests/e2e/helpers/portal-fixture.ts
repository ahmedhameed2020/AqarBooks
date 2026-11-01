/**
 * Fixture for the portal / maintenance / visitor-pass / gate acceptance review (LOCAL clean stack only).
 *
 * Built on the existing gate fixture (organization with an entitled plan, a gate, a manager and a guard) and extended with
 * what the journey needs: two owners of different units in the SAME organization, an owner in ANOTHER organization whose
 * unit has the SAME code, and accounting rows with distinct amounts so any leakage between customers is visible.
 * The service key is used only for set-up (users, rows). Every action under review is performed through the product.
 */
import { randomUUID } from "node:crypto";
import { adminClient, signedInClient } from "./accounting-fixture";
import { createGateFixture, password, sql, type GateFixture } from "../../helpers/gate-release";
import { createOpenFiscalYear } from "../../helpers/fiscal-calendar";

export { password, sql };
export type Owner = { userId: string; email: string; memberId: string; unitId: string; unitCode: string };
export type PortalOrg = { gate: GateFixture; org: string; property: string; owners: Owner[] };

export const AMOUNTS = {
  /** owner 1 of organization A: two dues and one payment */
  a1: { dues: [3000, 1500], paid: 1000, balance: 3500 },
  /** owner 2 of organization A */
  a2: { dues: [7777], paid: 0, balance: 7777 },
  /** owner of organization B (same unit code as owner 1) */
  b1: { dues: [9999], paid: 0, balance: 9999 },
};

async function addOwner(org: string, property: string, label: string, unitCode: string, existing?: { unitId: string; memberId: string; userId: string; email: string }) {
  const admin = adminClient();
  if (existing) {
    sql(`insert into public.unit_ownerships(organization_id,unit_id,member_id,share_percentage,is_primary_contact,start_date)
         values('${org}','${existing.unitId}','${existing.memberId}',100,true,'2020-01-01')`);
    return { userId: existing.userId, email: existing.email, memberId: existing.memberId, unitId: existing.unitId, unitCode };
  }
  const email = `portal-${label}-${randomUUID()}@test.local`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`owner ${label}: ${created.error?.message}`);
  const userId = created.data.user.id, memberId = randomUUID(), unitId = randomUUID();
  sql(`insert into public.units(id,organization_id,property_id,code) values('${unitId}','${org}','${property}','${unitCode}');
       insert into public.members(id,organization_id,full_name,user_id,email) values('${memberId}','${org}','Owner ${label}','${userId}','${email}');
       insert into public.unit_ownerships(organization_id,unit_id,member_id,share_percentage,is_primary_contact,start_date)
         values('${org}','${unitId}','${memberId}',100,true,'2020-01-01')`);
  return { userId, email, memberId, unitId, unitCode };
}

function seedAccounting(org: string, property: string, owner: Owner, dues: number[], paid: number) {
  const rec = randomUUID(), rev = randomUUID(), type = randomUUID();
  sql(`insert into public.chart_of_accounts(id,organization_id,code,name_ar,name_en,category,normal_balance,is_group,is_active)
         values('${rec}','${org}','1130','ذمم','Receivables','ASSET','DEBIT',false,true),('${rev}','${org}','4100','إيراد','Revenue','REVENUE','CREDIT',false,true);
       insert into public.due_types(id,organization_id,name_ar,name_en,default_revenue_account_id) values('${type}','${org}','رسوم','Service charge','${rev}')`);
  dues.forEach((amount, i) => {
    sql(`insert into public.dues(organization_id,property_id,unit_id,due_type_id,receivable_account_id,amount,issue_date,due_date,description,status)
         values('${org}','${property}','${owner.unitId}','${type}','${rec}',${amount},'2026-0${i + 2}-01','2026-0${i + 2}-15','Charge ${amount}','ISSUED')`);
  });
  if (paid > 0) {
    sql(`insert into public.payments(organization_id,property_id,member_id,amount,payment_date,method,status,receipt_no)
         values('${org}','${property}','${owner.memberId}',${paid},'2026-03-10','CASH','POSTED','REC-${paid}')`);
    // A real receipt always has its journal entry (owner statements, balances and the as-of readers only count receipts whose entry
    // is posted), so the fixture gives this one a period, a cash account and a posted entry, the way record_payment would.
    // The fiscal calendar exists already (created through the RPCs in createPortalWorld); the receipt uses its monthly period.
    sql(`with fp as (select id from public.fiscal_periods where organization_id='${org}' and '2026-03-10'::date between start_date and end_date),
              cash as (insert into public.chart_of_accounts(organization_id,code,name_ar,name_en,category,normal_balance,is_group,is_active) values('${org}','1110','صندوق','Cash','ASSET','DEBIT',false,true) returning id),
              je as (insert into public.journal_entries(organization_id,property_id,fiscal_period_id,entry_date,description,source_type,status) select '${org}','${property}',fp.id,'2026-03-10','fixture receipt REC-${paid}','RECEIPT_VOUCHER','POSTED' from fp returning id),
              ln as (insert into public.journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit) select je.id,1,cash.id,${paid},0 from je,cash union all select je.id,2,'${rec}'::uuid,0,${paid} from je returning 1)
         update public.payments set journal_entry_id=(select id from je) where organization_id='${org}' and receipt_no='REC-${paid}'`);
  }
}

/**
 * A signed-in TENANT_OWNER of the organization. The fiscal RPCs check auth.uid() and finance.periods.manage, and the gate
 * fixture's own users hold no finance permission, so a dedicated owner is added for the calendar only.
 */
async function fiscalOwnerSession(org: string) {
  const admin = adminClient();
  const { error: cloneErr } = await admin.rpc("clone_tenant_role_templates", { p_organization_id: org });
  if (cloneErr) throw new Error(`clone_tenant_role_templates failed: ${cloneErr.message}`);
  const email = `portal-fiscal-${randomUUID()}@test.local`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`fiscal owner: ${created.error?.message}`);
  const ownerRole = sql(`select id from public.roles where organization_id='${org}' and key='TENANT_OWNER'`);
  sql(`insert into public.organization_memberships(organization_id,user_id,status) values('${org}','${created.data.user.id}','active');
       insert into public.user_role_assignments(organization_id,user_id,role_id) values('${org}','${created.data.user.id}','${ownerRole}')`);
  return signedInClient(email, password);
}

export async function createPortalWorld() {
  // organization A: the gate fixture's own owner (member without ownership yet) becomes owner 1 of its unit R-101
  const gateA = await createGateFixture();
  const unitA = sql(`select id from public.units where organization_id='${gateA.org}' limit 1`);
  const memberA = sql(`select id from public.members where organization_id='${gateA.org}' limit 1`);
  const a1 = await addOwner(gateA.org, gateA.property, "a1", "R-101", { unitId: unitA, memberId: memberA, userId: gateA.owner.id, email: gateA.owner.email });
  const a2 = await addOwner(gateA.org, gateA.property, "a2", "R-202");
  // Fiscal calendar through the product RPCs (the guard refuses direct writes); the receipt below posts into March.
  await createOpenFiscalYear(adminClient(), await fiscalOwnerSession(gateA.org), {
    orgId: gateA.org, name: "FY-fixture", startDate: "2026-01-01", endDate: "2026-12-31",
  });
  seedAccounting(gateA.org, gateA.property, a1, AMOUNTS.a1.dues, AMOUNTS.a1.paid);
  // a second due-type/accounts set would collide on the unique account code, so owner 2's dues reuse A's accounts
  const recA = sql(`select id from public.chart_of_accounts where organization_id='${gateA.org}' and code='1130'`);
  const typeA = sql(`select id from public.due_types where organization_id='${gateA.org}' limit 1`);
  AMOUNTS.a2.dues.forEach((amount) => sql(`insert into public.dues(organization_id,property_id,unit_id,due_type_id,receivable_account_id,amount,issue_date,due_date,description,status)
      values('${gateA.org}','${gateA.property}','${a2.unitId}','${typeA}','${recA}',${amount},'2026-02-01','2026-02-15','Charge ${amount}','ISSUED')`));

  // organization B: a complete second tenant whose unit has the SAME code as owner 1's
  const gateB = await createGateFixture();
  const unitB = sql(`select id from public.units where organization_id='${gateB.org}' limit 1`);
  const memberB = sql(`select id from public.members where organization_id='${gateB.org}' limit 1`);
  const b1 = await addOwner(gateB.org, gateB.property, "b1", "R-101", { unitId: unitB, memberId: memberB, userId: gateB.owner.id, email: gateB.owner.email });
  seedAccounting(gateB.org, gateB.property, b1, AMOUNTS.b1.dues, 0);

  return {
    A: { gate: gateA, org: gateA.org, property: gateA.property, owners: [a1, a2] } as PortalOrg,
    B: { gate: gateB, org: gateB.org, property: gateB.property, owners: [b1] } as PortalOrg,
  };
}
export type PortalWorld = Awaited<ReturnType<typeof createPortalWorld>>;
