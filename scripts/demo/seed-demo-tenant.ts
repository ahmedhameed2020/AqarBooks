import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/types";
import { DEMO_STORY } from "../../lib/demo/story";
import { assertSafeDemoTarget } from "./demo-guard";
import {
  DEMO_SEED_VERSION,
  generateMembers,
  generateUnits,
  type GeneratedUnit,
} from "./demo-fixtures";

/**
 * Seeds the public demo tenant.
 *
 * HOW IT WRITES, AND WHY THAT MATTERS
 * Structure (properties, zones, buildings, units, members) is written directly
 * with the service role. Money is NOT. Every due, payment, levy and expense
 * goes through the same SECURITY DEFINER RPCs the product itself calls, run
 * under a signed-in owner session.
 *
 * That is the whole reason the dataset can be trusted. Those RPCs are where
 * the double-entry is constructed, the fiscal period is checked, the document
 * number is allocated and the audit chain is appended. Writing rows directly
 * would produce a database that looked populated and was not balanced --
 * exactly the "visually attractive but mathematically inconsistent" outcome
 * spec §22 forbids. Posting through the RPCs makes the demo balance by
 * construction rather than by inspection.
 *
 * IDEMPOTENCE
 * Every object is looked up by a stable natural key (`code`, or a name that
 * the fixtures fix) before being created. A second run creates nothing and
 * reports zeros. Financial postings additionally carry deterministic
 * idempotency keys, so a run interrupted halfway resumes rather than
 * double-posting.
 *
 * DRY RUN
 * `dryRun: true` performs the guard, every lookup and every resolution, then
 * reports what it WOULD create without writing anything. This exists because
 * the first real run happens against the production database, where a
 * half-applied financial seed is not something that can simply be deleted --
 * posted entries are immutable by design. Resolve the plan first, then write.
 */

export type SeedOptions = {
  admin: SupabaseClient<Database>;
  /** Signed-in session for the owner account that performs the financial postings. */
  owner: SupabaseClient<Database>;
  ownerUserId: string;
  /** The read-only account the public demo signs into. */
  demoUserId: string;
  organizationId: string;
  configuredDemoOrganizationId: string | null | undefined;
  expectedSlug: string;
  dryRun: boolean;
  log: (line: string) => void;
};

export type SeedReport = {
  ok: boolean;
  dryRun: boolean;
  seedVersion: string;
  /** Per-stage: how many objects existed, and how many were created. */
  stages: Array<{ stage: string; existing: number; created: number; note?: string }>;
  failure?: string;
};

type Ctx = SeedOptions & {
  report: SeedReport;
  /** Resolved ids, filled in as stages run. */
  ids: {
    propertyByCode: Map<string, string>;
    zoneByKey: Map<string, string>;
    buildingByCode: Map<string, string>;
    unitByCode: Map<string, string>;
    memberByEmail: Map<string, string>;
    accountByCode: Map<string, string>;
    fiscalPeriodId?: string;
    dueTypeServiceCharge?: string;
    dueTypeRent?: string;
    receivableAccountId?: string;
    cashAccountId?: string;
    bankAccountGlId?: string;
  };
};

function stage(ctx: Ctx, name: string, existing: number, created: number, note?: string) {
  ctx.report.stages.push({ stage: name, existing, created, note });
  ctx.log(
    `  ${name.padEnd(28)} existing=${String(existing).padStart(4)} created=${String(created).padStart(4)}` +
      (note ? `  (${note})` : ""),
  );
}

export async function seedDemoTenant(options: SeedOptions): Promise<SeedReport> {
  const report: SeedReport = {
    ok: false,
    dryRun: options.dryRun,
    seedVersion: DEMO_SEED_VERSION,
    stages: [],
  };

  const ctx: Ctx = {
    ...options,
    report,
    ids: {
      propertyByCode: new Map(),
      zoneByKey: new Map(),
      buildingByCode: new Map(),
      unitByCode: new Map(),
      memberByEmail: new Map(),
      accountByCode: new Map(),
    },
  };

  ctx.log(`AqarBooks demo seed — ${DEMO_SEED_VERSION}${options.dryRun ? " (DRY RUN)" : ""}`);
  ctx.log("");

  // -----------------------------------------------------------------------
  // Stage 0 — refuse to run anywhere but the demo tenant.
  // -----------------------------------------------------------------------
  const guard = await assertSafeDemoTarget({
    admin: options.admin,
    organizationId: options.organizationId,
    configuredDemoOrganizationId: options.configuredDemoOrganizationId,
    expectedSlug: options.expectedSlug,
    allowedUserIds: [options.ownerUserId, options.demoUserId],
  });

  if (!guard.ok) {
    report.failure = guard.reason;
    ctx.log(`ABORTED: ${guard.reason}`);
    return report;
  }
  ctx.log(`Target verified: ${guard.organizationName} (${guard.slug})`);
  ctx.log("");

  try {
    await stageChartOfAccounts(ctx);
    await stageFiscalPeriod(ctx);
    await stageProperties(ctx);
    await stageZonesAndBuildings(ctx);
    await stageUnits(ctx);
    await stageMembers(ctx);
    await stageDueTypes(ctx);
    await stageTreasuryAccounts(ctx);
    report.ok = true;
  } catch (err) {
    report.failure = err instanceof Error ? err.message : String(err);
    ctx.log("");
    ctx.log(`FAILED: ${report.failure}`);
    return report;
  }

  ctx.log("");
  ctx.log(
    options.dryRun
      ? "Dry run complete. Nothing was written."
      : "Structural seed complete.",
  );
  return report;
}

// ---------------------------------------------------------------------------
// Stage 1 — chart of accounts.
//
// Cloned from the RESORT_STANDARD template through the product's own RPC, so
// the demo's account tree is byte-identical to what a real customer receives
// at onboarding. A hand-written tree would be a second source of truth that
// nobody maintains.
// ---------------------------------------------------------------------------
async function stageChartOfAccounts(ctx: Ctx): Promise<void> {
  const { data: existing, error } = await ctx.admin
    .from("chart_of_accounts")
    .select("id, code")
    .eq("organization_id", ctx.organizationId);

  if (error) throw new Error(`chart_of_accounts read failed: ${error.message}`);

  const rows = existing ?? [];
  for (const row of rows) ctx.ids.accountByCode.set(row.code, row.id);

  if (rows.length > 0) {
    stage(ctx, "chart of accounts", rows.length, 0, "already cloned");
    return;
  }

  if (ctx.dryRun) {
    stage(ctx, "chart of accounts", 0, 0, "would clone RESORT_STANDARD");
    return;
  }

  const { error: cloneErr } = await ctx.owner.rpc("clone_chart_of_accounts_template", {
    p_organization_id: ctx.organizationId,
    p_template_key: "RESORT_STANDARD",
  });
  if (cloneErr) throw new Error(`clone_chart_of_accounts_template failed: ${cloneErr.message}`);

  const { data: cloned } = await ctx.admin
    .from("chart_of_accounts")
    .select("id, code")
    .eq("organization_id", ctx.organizationId);

  for (const row of cloned ?? []) ctx.ids.accountByCode.set(row.code, row.id);
  stage(ctx, "chart of accounts", 0, (cloned ?? []).length, "RESORT_STANDARD");
}

// ---------------------------------------------------------------------------
// Stage 2 — the fiscal year, and an OPEN period covering the operating month.
//
// This stage is load-bearing for everything financial that follows. Dues are
// only recognised into the ledger once an OPEN period covers their issue date,
// so seeding transactions before the period exists would leave the demo with
// receivables that never reached the general ledger -- the exact defect the
// dues-recognition trigger was added to close.
// ---------------------------------------------------------------------------
async function stageFiscalPeriod(ctx: Ctx): Promise<void> {
  const { year } = DEMO_STORY.period;

  const { data: periods, error } = await ctx.admin
    .from("fiscal_periods")
    .select("id, start_date, end_date, status")
    .eq("organization_id", ctx.organizationId);

  if (error) throw new Error(`fiscal_periods read failed: ${error.message}`);

  const covering = (periods ?? []).find(
    (p) => p.start_date <= DEMO_STORY.period.start && p.end_date >= DEMO_STORY.period.end,
  );

  if (covering) {
    ctx.ids.fiscalPeriodId = covering.id;
    stage(ctx, "fiscal period", 1, 0, `${DEMO_STORY.headline.periodEn} — ${covering.status}`);
    return;
  }

  if (ctx.dryRun) {
    stage(ctx, "fiscal period", 0, 0, `would create FY${year} and open ${DEMO_STORY.headline.periodEn}`);
    return;
  }

  const { error: fyErr } = await ctx.owner.rpc("create_fiscal_year", {
    p_organization_id: ctx.organizationId,
    p_name: `FY${year}`,
    p_start_date: `${year}-01-01`,
    p_end_date: `${year}-12-31`,
  });
  if (fyErr) throw new Error(`create_fiscal_year failed: ${fyErr.message}`);

  const { data: created } = await ctx.admin
    .from("fiscal_periods")
    .select("id, start_date, end_date")
    .eq("organization_id", ctx.organizationId);

  const target = (created ?? []).find(
    (p) => p.start_date <= DEMO_STORY.period.start && p.end_date >= DEMO_STORY.period.end,
  );
  if (!target) throw new Error("create_fiscal_year did not produce a period covering the demo month");

  ctx.ids.fiscalPeriodId = target.id;
  stage(ctx, "fiscal period", 0, (created ?? []).length, `FY${year}`);
}

// ---------------------------------------------------------------------------
// Stage 3 — properties.
//
// create_organization_onboarding already made one property when the tenant was
// bootstrapped, so the first of the three is matched by code rather than
// created twice.
// ---------------------------------------------------------------------------
async function stageProperties(ctx: Ctx): Promise<void> {
  const { data: existing, error } = await ctx.admin
    .from("properties")
    .select("id, code")
    .eq("organization_id", ctx.organizationId);

  if (error) throw new Error(`properties read failed: ${error.message}`);
  for (const row of existing ?? []) ctx.ids.propertyByCode.set(row.code, row.id);

  let created = 0;
  for (const property of DEMO_STORY.properties) {
    if (ctx.ids.propertyByCode.has(property.code)) continue;
    if (ctx.dryRun) {
      created++;
      continue;
    }

    const { data: id, error: createErr } = await ctx.owner.rpc("create_resort", {
      p_organization_id: ctx.organizationId,
      p_name: property.nameEn,
      p_code: property.code,
      p_timezone: "Africa/Cairo",
      p_governorate: property.governorate,
    });
    if (createErr) throw new Error(`create_resort(${property.code}) failed: ${createErr.message}`);
    ctx.ids.propertyByCode.set(property.code, id as unknown as string);
    created++;
  }

  stage(ctx, "properties", (existing ?? []).length, created);
}

// ---------------------------------------------------------------------------
// Stage 4 — zones and buildings.
// ---------------------------------------------------------------------------
async function stageZonesAndBuildings(ctx: Ctx): Promise<void> {
  const { data: existingZones } = await ctx.admin
    .from("zones")
    .select("id, name_en, property_id")
    .eq("organization_id", ctx.organizationId);

  for (const z of existingZones ?? []) {
    ctx.ids.zoneByKey.set(`${z.property_id}::${z.name_en}`, z.id);
  }

  const wantedZones = new Map<string, { propertyCode: string; ar: string; en: string }>();
  for (const b of DEMO_STORY.buildings) {
    wantedZones.set(`${b.propertyCode}::${b.zoneEn}`, {
      propertyCode: b.propertyCode,
      ar: b.zoneAr,
      en: b.zoneEn,
    });
  }

  let zonesCreated = 0;
  for (const zone of wantedZones.values()) {
    const propertyId = ctx.ids.propertyByCode.get(zone.propertyCode);
    if (!propertyId) {
      if (ctx.dryRun) {
        zonesCreated++;
        continue;
      }
      throw new Error(`zone ${zone.en}: property ${zone.propertyCode} not resolved`);
    }
    const key = `${propertyId}::${zone.en}`;
    if (ctx.ids.zoneByKey.has(key)) continue;
    if (ctx.dryRun) {
      zonesCreated++;
      continue;
    }

    const { data, error } = await ctx.admin
      .from("zones")
      .insert({
        organization_id: ctx.organizationId,
        property_id: propertyId,
        name_ar: zone.ar,
        name_en: zone.en,
      })
      .select("id")
      .single();
    if (error) throw new Error(`zone insert(${zone.en}) failed: ${error.message}`);
    ctx.ids.zoneByKey.set(key, data.id);
    zonesCreated++;
  }

  stage(ctx, "zones", (existingZones ?? []).length, zonesCreated);

  const { data: existingBuildings } = await ctx.admin
    .from("buildings")
    .select("id, code")
    .eq("organization_id", ctx.organizationId);

  for (const b of existingBuildings ?? []) ctx.ids.buildingByCode.set(b.code, b.id);

  let buildingsCreated = 0;
  for (const building of DEMO_STORY.buildings) {
    if (ctx.ids.buildingByCode.has(building.code)) continue;
    if (ctx.dryRun) {
      buildingsCreated++;
      continue;
    }

    const propertyId = ctx.ids.propertyByCode.get(building.propertyCode)!;
    const zoneId = ctx.ids.zoneByKey.get(`${propertyId}::${building.zoneEn}`) ?? null;

    const { data, error } = await ctx.admin
      .from("buildings")
      .insert({
        organization_id: ctx.organizationId,
        property_id: propertyId,
        zone_id: zoneId,
        code: building.code,
        name_ar: building.nameAr,
        name_en: building.nameEn,
      })
      .select("id")
      .single();
    if (error) throw new Error(`building insert(${building.code}) failed: ${error.message}`);
    ctx.ids.buildingByCode.set(building.code, data.id);
    buildingsCreated++;
  }

  stage(ctx, "buildings", (existingBuildings ?? []).length, buildingsCreated);
}

// ---------------------------------------------------------------------------
// Stage 5 — units.
//
// Inserted in batches with the service role rather than one call per unit:
// 156 sequential round trips is minutes of wall clock for no benefit, and
// units carry no accounting consequence at creation time.
// ---------------------------------------------------------------------------
async function stageUnits(ctx: Ctx): Promise<void> {
  const generated = generateUnits();

  const { data: existing, error } = await ctx.admin
    .from("units")
    .select("id, code")
    .eq("organization_id", ctx.organizationId);

  if (error) throw new Error(`units read failed: ${error.message}`);
  for (const u of existing ?? []) ctx.ids.unitByCode.set(u.code, u.id);

  const missing = generated.filter((u) => !ctx.ids.unitByCode.has(u.code));

  if (ctx.dryRun) {
    stage(ctx, "units", (existing ?? []).length, missing.length, `${generated.length} in fixtures`);
    return;
  }

  const BATCH = 50;
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH).map((u) => ({
      organization_id: ctx.organizationId,
      property_id: ctx.ids.propertyByCode.get(u.propertyCode)!,
      building_id: ctx.ids.buildingByCode.get(u.buildingCode)!,
      zone_id: null,
      code: u.code,
      unit_type: u.unitType,
      floor_number: u.floorNumber,
      area: u.area,
      is_active: !u.archived,
      // Archived stock is marked as such rather than deleted: a portfolio with
      // no history of withdrawn units is not a portfolio anyone recognises.
      archived_at: u.archived ? `${DEMO_STORY.period.openingDate}T00:00:00Z` : null,
      archived_by: u.archived ? ctx.ownerUserId : null,
    }));

    const { data, error: insErr } = await ctx.admin.from("units").insert(batch).select("id, code");
    if (insErr) throw new Error(`units insert failed at offset ${i}: ${insErr.message}`);
    for (const row of data ?? []) ctx.ids.unitByCode.set(row.code, row.id);
  }

  stage(ctx, "units", (existing ?? []).length, missing.length, `${generated.length} in fixtures`);
}

// ---------------------------------------------------------------------------
// Stage 6 — members, and the ownership links that make units billable.
// ---------------------------------------------------------------------------
async function stageMembers(ctx: Ctx): Promise<void> {
  const units = generateUnits();
  const { members, assignment } = generateMembers(units);

  const { data: existing, error } = await ctx.admin
    .from("members")
    .select("id, email")
    .eq("organization_id", ctx.organizationId);

  if (error) throw new Error(`members read failed: ${error.message}`);
  for (const m of existing ?? []) {
    if (m.email) ctx.ids.memberByEmail.set(m.email, m.id);
  }

  const missing = members.filter((m) => !ctx.ids.memberByEmail.has(m.email));

  if (!ctx.dryRun) {
    const BATCH = 50;
    for (let i = 0; i < missing.length; i += BATCH) {
      const batch = missing.slice(i, i + BATCH).map((m) => ({
        organization_id: ctx.organizationId,
        full_name: m.fullName,
        phone: m.phone,
        email: m.email,
      }));
      const { data, error: insErr } = await ctx.admin
        .from("members")
        .insert(batch)
        .select("id, email");
      if (insErr) throw new Error(`members insert failed at offset ${i}: ${insErr.message}`);
      for (const row of data ?? []) {
        if (row.email) ctx.ids.memberByEmail.set(row.email, row.id);
      }
    }
  }

  stage(ctx, "members", (existing ?? []).length, missing.length);

  // Ownership is linked through the RPC, not inserted: it validates share
  // percentages and refuses overlapping primary contacts, and a demo whose
  // ownership rows could not have been produced by the product is not a demo
  // of the product.
  const ownerResident = units.filter((u) => !u.archived && u.tenure === "OWNER_RESIDENT");

  const { data: existingLinks } = await ctx.admin
    .from("unit_ownerships")
    .select("unit_id")
    .eq("organization_id", ctx.organizationId);

  const linked = new Set((existingLinks ?? []).map((l) => l.unit_id));
  let linksCreated = 0;

  for (const unit of ownerResident) {
    const unitId = ctx.ids.unitByCode.get(unit.code);
    const memberId = ctx.ids.memberByEmail.get(assignment.get(unit.code) ?? "");
    if (!unitId || !memberId) {
      if (ctx.dryRun) {
        linksCreated++;
        continue;
      }
      throw new Error(`ownership link: unresolved unit ${unit.code}`);
    }
    if (linked.has(unitId)) continue;
    if (ctx.dryRun) {
      linksCreated++;
      continue;
    }

    const { error: linkErr } = await ctx.owner.rpc("link_unit_ownership", {
      p_organization_id: ctx.organizationId,
      p_unit_id: unitId,
      p_member_id: memberId,
      p_share_percentage: 100,
      p_is_primary_contact: true,
      p_start_date: DEMO_STORY.period.openingDate,
    });
    if (linkErr) throw new Error(`link_unit_ownership(${unit.code}) failed: ${linkErr.message}`);
    linksCreated++;
  }

  stage(ctx, "ownership links", linked.size, linksCreated);
}

// ---------------------------------------------------------------------------
// Stage 7 — due types.
//
// Two, because the demo bills two fundamentally different things: a recurring
// service charge against every unit, and rent against leased units only. They
// point at different revenue accounts so the income statement can tell them
// apart, which is the whole argument for property-aware accounting.
// ---------------------------------------------------------------------------
async function stageDueTypes(ctx: Ctx): Promise<void> {
  const serviceRevenue = ctx.ids.accountByCode.get("4100") ?? ctx.ids.accountByCode.get("4000");
  const rentRevenue = ctx.ids.accountByCode.get("4200") ?? serviceRevenue;
  const receivable = ctx.ids.accountByCode.get("1200") ?? ctx.ids.accountByCode.get("1100");

  if (!serviceRevenue || !receivable) {
    if (ctx.dryRun) {
      stage(ctx, "due types", 0, 2, "revenue/receivable accounts not resolvable in dry run");
      return;
    }
    throw new Error(
      "Could not resolve revenue/receivable accounts from the cloned chart of accounts. " +
        "Inspect the RESORT_STANDARD template codes before re-running.",
    );
  }

  ctx.ids.receivableAccountId = receivable;

  const { data: existing, error } = await ctx.admin
    .from("due_types")
    .select("id, name_en")
    .eq("organization_id", ctx.organizationId);

  if (error) throw new Error(`due_types read failed: ${error.message}`);

  const wanted = [
    {
      name_ar: "رسوم الخدمات المشتركة",
      name_en: "Common Area Service Charge",
      account: serviceRevenue,
      key: "service" as const,
    },
    {
      name_ar: "إيجار الوحدة",
      name_en: "Unit Rent",
      account: rentRevenue!,
      key: "rent" as const,
    },
  ];

  let created = 0;
  for (const dueType of wanted) {
    const found = (existing ?? []).find((d) => d.name_en === dueType.name_en);
    if (found) {
      if (dueType.key === "service") ctx.ids.dueTypeServiceCharge = found.id;
      else ctx.ids.dueTypeRent = found.id;
      continue;
    }
    if (ctx.dryRun) {
      created++;
      continue;
    }

    const { data, error: insErr } = await ctx.admin
      .from("due_types")
      .insert({
        organization_id: ctx.organizationId,
        name_ar: dueType.name_ar,
        name_en: dueType.name_en,
        default_revenue_account_id: dueType.account,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(`due_types insert(${dueType.name_en}) failed: ${insErr.message}`);
    if (dueType.key === "service") ctx.ids.dueTypeServiceCharge = data.id;
    else ctx.ids.dueTypeRent = data.id;
    created++;
  }

  stage(ctx, "due types", (existing ?? []).length, created);
}

// ---------------------------------------------------------------------------
// Stage 8 — treasury: a bank, two bank accounts, and a cashbox.
// ---------------------------------------------------------------------------
async function stageTreasuryAccounts(ctx: Ctx): Promise<void> {
  const bankGl = ctx.ids.accountByCode.get("1020") ?? ctx.ids.accountByCode.get("1010");
  const cashGl = ctx.ids.accountByCode.get("1010") ?? ctx.ids.accountByCode.get("1000");

  ctx.ids.bankAccountGlId = bankGl;
  ctx.ids.cashAccountId = cashGl;

  const { data: existingBanks } = await ctx.admin
    .from("banks")
    .select("id, name_en")
    .eq("organization_id", ctx.organizationId);

  let bankId = (existingBanks ?? []).find((b) => b.name_en === "Commercial International Bank")?.id;
  let banksCreated = 0;

  if (!bankId && !ctx.dryRun) {
    const { data, error } = await ctx.admin
      .from("banks")
      .insert({
        organization_id: ctx.organizationId,
        name_ar: "البنك التجاري الدولي",
        name_en: "Commercial International Bank",
      })
      .select("id")
      .single();
    if (error) throw new Error(`banks insert failed: ${error.message}`);
    bankId = data.id;
    banksCreated = 1;
  } else if (!bankId) {
    banksCreated = 1;
  }

  stage(ctx, "banks", (existingBanks ?? []).length, banksCreated);

  const { data: existingAccounts } = await ctx.admin
    .from("bank_accounts")
    .select("id, account_number")
    .eq("organization_id", ctx.organizationId);

  // Two accounts, one per legal entity, so the demo shows consolidated cash
  // across entities rather than a single balance that proves nothing.
  const wanted = [
    { property: "NH", name: "Operating Account — Nile Heights", number: "1001-DEMO-0001" },
    { property: "MR", name: "Operating Account — Marina", number: "1001-DEMO-0002" },
  ];

  let accountsCreated = 0;
  for (const account of wanted) {
    if ((existingAccounts ?? []).some((a) => a.account_number === account.number)) continue;
    if (ctx.dryRun || !bankId || !bankGl) {
      accountsCreated++;
      continue;
    }

    const { error } = await ctx.admin.from("bank_accounts").insert({
      organization_id: ctx.organizationId,
      property_id: ctx.ids.propertyByCode.get(account.property)!,
      bank_id: bankId,
      account_name: account.name,
      account_number: account.number,
      gl_account_id: bankGl,
    });
    if (error) throw new Error(`bank_accounts insert(${account.number}) failed: ${error.message}`);
    accountsCreated++;
  }

  stage(ctx, "bank accounts", (existingAccounts ?? []).length, accountsCreated);
}

export type { GeneratedUnit };
