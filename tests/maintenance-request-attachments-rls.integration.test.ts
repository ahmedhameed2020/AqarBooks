import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";

type Client = SupabaseClient<Database>;

const TEST_PASSWORD = "Maintenance_Attachments_RLS_Test_P@ssw0rd_2026!";
const BUCKET = "maintenance-attachments";
const PNG_BYTES = new TextEncoder().encode("maintenance attachment png bytes");
const PDF_BYTES = new TextEncoder().encode("%PDF-1.4 maintenance attachment pdf bytes");

type LocalSupabaseEnv = {
  API_URL: string;
  ANON_KEY: string;
  SERVICE_ROLE_KEY: string;
};

type Actor = {
  userId: string;
  email: string;
  client: Client;
};

type MemberActor = Actor & {
  memberId: string;
};

type OrgFixture = {
  orgId: string;
  propertyId: string;
  unitAId: string;
  unitBId: string;
  futureUnitId: string;
  categoryId: string;
  memberA: MemberActor;
  memberB: MemberActor;
  staffManager: Actor;
  staffViewer: Actor;
};

type AttachmentIntent = {
  attachment_id: string;
  storage_bucket: string;
  storage_path: string;
};

function readLocalSupabaseEnv(): LocalSupabaseEnv {
  const output = execFileSync("supabase", ["status", "-o", "env"], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const env: Record<string, string> = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
    if (match) env[match[1]] = match[2];
  }

  if (!env.API_URL?.startsWith("http://127.0.0.1:") && !env.API_URL?.startsWith("http://localhost:")) {
    throw new Error("Maintenance attachment RLS gate must run against local Supabase.");
  }

  if (!env.ANON_KEY || !env.SERVICE_ROLE_KEY) {
    throw new Error("Local Supabase anon/service-role keys were not available from supabase status.");
  }

  return {
    API_URL: env.API_URL,
    ANON_KEY: env.ANON_KEY,
    SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY,
  };
}

function runLocalDbQuery(sql: string): string {
  return execFileSync(
    "docker",
    [
      "exec",
      "supabase_db_aqarbooks",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-tA",
      "-F",
      "|",
      "-c",
      sql,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).trim();
}

function expectSecurityRejection(error: { message: string } | null, context: string) {
  expect(error, context).not.toBeNull();
  expect(error!.message).toMatch(
    /row-level security|permission denied|not authorized|not_authenticated|forbidden|unauthorized|not_entitled|not_authorized|violates row-level security|invalid|closed|not accepting|object_not_found|object not found|request_not_accepting|mismatch/i,
  );
}

function expectRejectedOrNoop<T>(
  result: { data: T[] | null; error: { message: string } | null },
  context: string,
) {
  if (result.error) {
    expectSecurityRejection(result.error, context);
    return;
  }

  expect(result.data ?? [], context).toEqual([]);
}

async function createSignedInClient(local: LocalSupabaseEnv, email: string): Promise<Client> {
  const client = createClient<Database>(local.API_URL, local.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  expect(error, `sign-in failed for ${email}: ${error?.message}`).toBeNull();
  return client;
}

async function createAuthUser(admin: Client, label: string): Promise<{ userId: string; email: string }> {
  const email = `maintenance-attachments-${label}-${randomUUID()}@aqarbooks-test.local`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  expect(error, `auth user create failed for ${label}: ${error?.message}`).toBeNull();
  return { userId: data.user!.id, email };
}

async function createStaffActor(
  admin: Client,
  local: LocalSupabaseEnv,
  orgId: string,
  roleKey: "PROPERTY_MANAGER" | "VIEWER",
  label: string,
): Promise<Actor> {
  const actor = await createAuthUser(admin, label);

  const { error: membershipError } = await admin
    .from("organization_memberships")
    .insert({ organization_id: orgId, user_id: actor.userId, status: "active" });
  expect(membershipError, `staff membership failed: ${membershipError?.message}`).toBeNull();

  const { data: role, error: roleError } = await admin
    .from("roles")
    .select("id")
    .eq("organization_id", orgId)
    .eq("key", roleKey)
    .single();
  expect(roleError, `role lookup failed for ${roleKey}: ${roleError?.message}`).toBeNull();

  const { error: assignmentError } = await admin.from("user_role_assignments").insert({
    user_id: actor.userId,
    role_id: role!.id,
    organization_id: orgId,
  });
  expect(assignmentError, `staff role assignment failed: ${assignmentError?.message}`).toBeNull();

  return { ...actor, client: await createSignedInClient(local, actor.email) };
}

async function createMemberActor(
  admin: Client,
  local: LocalSupabaseEnv,
  orgId: string,
  label: string,
): Promise<MemberActor> {
  const actor = await createAuthUser(admin, label);
  const { data: member, error } = await admin
    .from("members")
    .insert({
      organization_id: orgId,
      full_name: `Maintenance Attachment Member ${label}`,
      email: actor.email,
      user_id: actor.userId,
    })
    .select("id")
    .single();
  expect(error, `member insert failed: ${error?.message}`).toBeNull();

  return { ...actor, memberId: member!.id, client: await createSignedInClient(local, actor.email) };
}

async function createOrgFixture(
  admin: Client,
  local: LocalSupabaseEnv,
  label: string,
  planKey: "PROFESSIONAL" | "STARTER",
): Promise<OrgFixture> {
  const suffix = randomUUID().slice(0, 8);
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({
      name: `Maintenance Attachment RLS ${label}`,
      slug: `maintenance-attachments-rls-${label.toLowerCase()}-${suffix}`,
      default_currency: "EGP",
      status: "ACTIVE",
    })
    .select("id")
    .single();
  expect(orgError, `organization insert failed: ${orgError?.message}`).toBeNull();
  const orgId = org!.id;

  const { error: cloneError } = await admin.rpc("clone_tenant_role_templates", {
    p_organization_id: orgId,
  });
  expect(cloneError, `role clone failed: ${cloneError?.message}`).toBeNull();

  const { data: plan, error: planError } = await admin
    .from("plans")
    .select("id")
    .eq("key", planKey)
    .single();
  expect(planError, `plan lookup failed for ${planKey}: ${planError?.message}`).toBeNull();

  const { error: subscriptionError } = await admin.from("subscriptions").insert({
    organization_id: orgId,
    plan_id: plan!.id,
    status: "ACTIVE",
  });
  expect(subscriptionError, `subscription insert failed: ${subscriptionError?.message}`).toBeNull();

  const { data: property, error: propertyError } = await admin
    .from("properties")
    .insert({
      organization_id: orgId,
      name: `Maintenance Attachment Property ${label}`,
      code: `MAR-${label}-${suffix}`,
      timezone: "Africa/Cairo",
      property_type: "building",
    })
    .select("id")
    .single();
  expect(propertyError, `property insert failed: ${propertyError?.message}`).toBeNull();
  const propertyId = property!.id;

  const [unitAResult, unitBResult, futureUnitResult] = await Promise.all([
    admin
      .from("units")
      .insert({ organization_id: orgId, property_id: propertyId, code: `A-${suffix}` })
      .select("id")
      .single(),
    admin
      .from("units")
      .insert({ organization_id: orgId, property_id: propertyId, code: `B-${suffix}` })
      .select("id")
      .single(),
    admin
      .from("units")
      .insert({ organization_id: orgId, property_id: propertyId, code: `F-${suffix}` })
      .select("id")
      .single(),
  ]);
  expect(unitAResult.error, `unit A insert failed: ${unitAResult.error?.message}`).toBeNull();
  expect(unitBResult.error, `unit B insert failed: ${unitBResult.error?.message}`).toBeNull();
  expect(futureUnitResult.error, `future unit insert failed: ${futureUnitResult.error?.message}`).toBeNull();

  const memberA = await createMemberActor(admin, local, orgId, `${label}-member-a`);
  const memberB = await createMemberActor(admin, local, orgId, `${label}-member-b`);

  const { error: ownershipError } = await admin.from("unit_ownerships").insert([
    {
      organization_id: orgId,
      unit_id: unitAResult.data!.id,
      member_id: memberA.memberId,
      share_percentage: 100,
      is_primary_contact: true,
      start_date: "2020-01-01",
    },
    {
      organization_id: orgId,
      unit_id: unitBResult.data!.id,
      member_id: memberB.memberId,
      share_percentage: 100,
      is_primary_contact: true,
      start_date: "2020-01-01",
    },
    {
      organization_id: orgId,
      unit_id: futureUnitResult.data!.id,
      member_id: memberA.memberId,
      share_percentage: 100,
      is_primary_contact: true,
      start_date: "2099-01-01",
    },
  ]);
  expect(ownershipError, `ownership insert failed: ${ownershipError?.message}`).toBeNull();

  const { data: categories, error: categoryError } = await admin
    .from("maintenance_categories")
    .select("id")
    .eq("organization_id", orgId)
    .order("sort_order", { ascending: true })
    .limit(1);
  expect(categoryError, `category lookup failed: ${categoryError?.message}`).toBeNull();
  expect(categories).toHaveLength(1);

  return {
    orgId,
    propertyId,
    unitAId: unitAResult.data!.id,
    unitBId: unitBResult.data!.id,
    futureUnitId: futureUnitResult.data!.id,
    categoryId: categories![0].id,
    memberA,
    memberB,
    staffManager: await createStaffActor(admin, local, orgId, "PROPERTY_MANAGER", `${label}-manager`),
    staffViewer: await createStaffActor(admin, local, orgId, "VIEWER", `${label}-viewer`),
  };
}

async function createRequest(client: Client, unitId: string, categoryId: string, label: string): Promise<string> {
  const { data, error } = await client.rpc("create_maintenance_request", {
    p_unit_id: unitId,
    p_category_id: categoryId,
    p_title: `Attachment issue ${label}`,
    p_description: `The AC drain is leaking in attachment test ${label}.`,
    p_priority: "NORMAL",
  });
  expect(error, `request create failed: ${error?.message}`).toBeNull();
  expect(data).toMatch(/^[0-9a-f-]{36}$/i);
  return data as string;
}

async function beginAttachment(
  client: Client,
  requestId: string,
  overrides: Partial<{
    originalFileName: string;
    mimeType: string;
    byteSize: number;
    kind: string;
    visibility: string;
  }> = {},
): Promise<AttachmentIntent> {
  const { data, error } = await client.rpc("begin_maintenance_attachment_upload", {
    p_request_id: requestId,
    p_original_file_name: overrides.originalFileName ?? "issue.png",
    p_mime_type: overrides.mimeType ?? "image/png",
    p_byte_size: overrides.byteSize ?? PNG_BYTES.byteLength,
    p_kind: overrides.kind ?? "ISSUE",
    p_visibility: overrides.visibility ?? "MEMBER_VISIBLE",
  });
  expect(error, `begin attachment failed: ${error?.message}`).toBeNull();
  expect(data).toHaveLength(1);
  return data![0] as AttachmentIntent;
}

async function uploadAndFinalize(
  client: Client,
  requestId: string,
  overrides: Partial<{
    originalFileName: string;
    mimeType: string;
    byteSize: number;
    kind: string;
    visibility: string;
    body: Uint8Array;
  }> = {},
): Promise<AttachmentIntent> {
  const body = overrides.body ?? PNG_BYTES;
  const mimeType = overrides.mimeType ?? "image/png";
  const intent = await beginAttachment(client, requestId, {
    ...overrides,
    mimeType,
    byteSize: overrides.byteSize ?? body.byteLength,
  });

  const signedUpload = await client.storage.from(BUCKET).createSignedUploadUrl(intent.storage_path, { upsert: false });
  expect(signedUpload.error, `signed upload failed: ${signedUpload.error?.message}`).toBeNull();
  expect(signedUpload.data?.token).toBeTruthy();

  const upload = await client.storage.from(BUCKET).uploadToSignedUrl(
    intent.storage_path,
    signedUpload.data!.token,
    new Blob([body], { type: mimeType }),
    { contentType: mimeType, upsert: false },
  );
  expect(upload.error, `signed object upload failed: ${upload.error?.message}`).toBeNull();

  const finalize = await client.rpc("finalize_maintenance_attachment_upload", {
    p_attachment_id: intent.attachment_id,
  });
  expect(finalize.error, `finalize failed: ${finalize.error?.message}`).toBeNull();

  return intent;
}

async function countRows(admin: Client, table: "dues" | "expenses" | "journal_entries" | "payments" | "supplier_invoices", orgId: string) {
  const { count, error } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  expect(error, `${table} count failed: ${error?.message}`).toBeNull();
  return count ?? 0;
}

describe.sequential("maintenance request attachments runtime Storage/RLS gate", () => {
  let local: LocalSupabaseEnv;
  let admin: Client;
  let orgA: OrgFixture;
  let orgB: OrgFixture;
  let disabledOrg: OrgFixture;
  const createdOrgIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdStoragePaths: string[] = [];

  beforeAll(async () => {
    local = readLocalSupabaseEnv();
    admin = createClient<Database>(local.API_URL, local.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    orgA = await createOrgFixture(admin, local, "A", "PROFESSIONAL");
    orgB = await createOrgFixture(admin, local, "B", "PROFESSIONAL");
    disabledOrg = await createOrgFixture(admin, local, "Disabled", "STARTER");

    createdOrgIds.push(orgA.orgId, orgB.orgId, disabledOrg.orgId);
    createdUserIds.push(
      orgA.memberA.userId,
      orgA.memberB.userId,
      orgA.staffManager.userId,
      orgA.staffViewer.userId,
      orgB.memberA.userId,
      orgB.memberB.userId,
      orgB.staffManager.userId,
      orgB.staffViewer.userId,
      disabledOrg.memberA.userId,
      disabledOrg.memberB.userId,
      disabledOrg.staffManager.userId,
      disabledOrg.staffViewer.userId,
    );
  }, 120_000);

  afterAll(async () => {
    if (createdStoragePaths.length > 0) {
      await admin.storage.from(BUCKET).remove(createdStoragePaths);
    }

    for (const orgId of createdOrgIds) {
      await admin.from("maintenance_request_attachments").delete().eq("organization_id", orgId);
      await admin.from("maintenance_request_updates").delete().eq("organization_id", orgId);
      await admin.from("maintenance_requests").delete().eq("organization_id", orgId);
      await admin.from("platform_audit_logs").delete().eq("organization_id", orgId);
      await admin.from("unit_ownerships").delete().eq("organization_id", orgId);
      await admin.from("members").delete().eq("organization_id", orgId);
      await admin.from("units").delete().eq("organization_id", orgId);
      await admin.from("properties").delete().eq("organization_id", orgId);
      await admin.from("subscriptions").delete().eq("organization_id", orgId);
      await admin.from("user_role_assignments").delete().eq("organization_id", orgId);
      await admin.from("organization_memberships").delete().eq("organization_id", orgId);
      await admin.from("roles").delete().eq("organization_id", orgId);
      await admin.from("maintenance_categories").delete().eq("organization_id", orgId);
      await admin.from("organizations").delete().eq("id", orgId);
    }

    for (const userId of createdUserIds) {
      await admin.auth.admin.deleteUser(userId);
    }
  }, 120_000);

  it("installs the private bucket, metadata ACLs, and intended RPC grants", () => {
    const bucketRows = runLocalDbQuery(`
      select id, public, file_size_limit, array_to_string(allowed_mime_types, ',')
      from storage.buckets
      where id = 'maintenance-attachments';
    `);
    expect(bucketRows).toBe("maintenance-attachments|f|10485760|image/jpeg,image/png,image/webp,application/pdf");

    const tableGrants = runLocalDbQuery(`
      select r.role_name,
             has_table_privilege(r.role_name, 'public.maintenance_request_attachments', 'SELECT') as can_select,
             has_table_privilege(r.role_name, 'public.maintenance_request_attachments', 'INSERT') as can_insert,
             has_table_privilege(r.role_name, 'public.maintenance_request_attachments', 'UPDATE') as can_update,
             has_table_privilege(r.role_name, 'public.maintenance_request_attachments', 'DELETE') as can_delete
      from (values ('anon'), ('authenticated')) as r(role_name)
      order by r.role_name;
    `).split(/\r?\n/);
    expect(tableGrants).toEqual([
      "anon|f|f|f|f",
      "authenticated|t|f|f|f",
    ]);

    const policies = runLocalDbQuery(`
      select schemaname || '.' || tablename || '|' || policyname
      from pg_policies
      where (schemaname = 'public' and tablename = 'maintenance_request_attachments')
         or (schemaname = 'storage' and tablename = 'objects' and policyname like 'maintenance_attachments_%')
      order by 1;
    `).split(/\r?\n/);
    expect(policies).toEqual([
      "public.maintenance_request_attachments|maintenance_request_attachments_select_authorized",
      "storage.objects|maintenance_attachments_storage_delete_pending_or_failed",
      "storage.objects|maintenance_attachments_storage_insert_pending",
      "storage.objects|maintenance_attachments_storage_select_ready",
    ]);

    const functionGrants = runLocalDbQuery(`
      select p.proname,
             has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname like '%maintenance_attachment%'
      order by p.proname;
    `).split(/\r?\n/);
    expect(functionGrants).toEqual([
      "abort_maintenance_attachment_upload|f|t",
      "begin_maintenance_attachment_upload|f|t",
      "finalize_maintenance_attachment_upload|f|t",
      "maintenance_attachment_can_delete_object|f|t",
      "maintenance_attachment_can_select_object|f|t",
      "maintenance_attachment_can_upload_object|f|t",
      "maintenance_attachment_extension|f|f",
      "maintenance_attachment_member_can_read|f|t",
      "maintenance_attachment_staff_can_manage|f|t",
      "maintenance_attachment_staff_can_read|f|t",
    ]);
  });

  it("lets a member upload member-visible issue evidence for their current request only", async () => {
    const requestId = await createRequest(orgA.memberA.client, orgA.unitAId, orgA.categoryId, "member-upload");
    const intent = await uploadAndFinalize(orgA.memberA.client, requestId);
    createdStoragePaths.push(intent.storage_path);

    expect(intent.storage_bucket).toBe(BUCKET);
    expect(intent.storage_path).toMatch(new RegExp(`^${orgA.orgId}/${requestId}/${intent.attachment_id}\\.png$`));

    const { data: ownRows, error: ownReadError } = await orgA.memberA.client
      .from("maintenance_request_attachments")
      .select("id, visibility, kind, status, storage_path")
      .eq("id", intent.attachment_id);
    expect(ownReadError, `owner metadata read failed: ${ownReadError?.message}`).toBeNull();
    expect(ownRows).toEqual([
      {
        id: intent.attachment_id,
        visibility: "MEMBER_VISIBLE",
        kind: "ISSUE",
        status: "READY",
        storage_path: intent.storage_path,
      },
    ]);

    const signedLink = await orgA.memberA.client.storage.from(BUCKET).createSignedUrl(intent.storage_path, 300);
    expect(signedLink.error, `owner signed link failed: ${signedLink.error?.message}`).toBeNull();
    expect(signedLink.data?.signedUrl).toContain("/object/sign/");

    const directInsert = await orgA.memberA.client.from("maintenance_request_attachments").insert({
      organization_id: orgA.orgId,
      maintenance_request_id: requestId,
      uploaded_by_user_id: orgA.memberA.userId,
      uploaded_by_member_id: orgA.memberA.memberId,
      kind: "ISSUE",
      visibility: "MEMBER_VISIBLE",
      original_file_name: "forged.png",
      storage_bucket: BUCKET,
      storage_path: `${orgA.orgId}/${requestId}/${randomUUID()}.png`,
      mime_type: "image/png",
      byte_size: PNG_BYTES.byteLength,
      status: "PENDING",
    }).select("id");
    expectSecurityRejection(directInsert.error, "authenticated users must not directly insert attachment metadata");

    const directUpdate = await orgA.memberA.client
      .from("maintenance_request_attachments")
      .update({ visibility: "STAFF_ONLY" })
      .eq("id", intent.attachment_id)
      .select("id");
    expectRejectedOrNoop(directUpdate, "authenticated users must not directly update attachment metadata");

    const directDelete = await orgA.memberA.client
      .from("maintenance_request_attachments")
      .delete()
      .eq("id", intent.attachment_id)
      .select("id");
    expectRejectedOrNoop(directDelete, "authenticated users must not directly delete attachment metadata");
  });

  it("rejects member spoofing, cross-tenant uploads, unsupported kinds, and closed request uploads", async () => {
    const requestId = await createRequest(orgA.memberA.client, orgA.unitAId, orgA.categoryId, "member-denials");
    const orgBRequestId = await createRequest(orgB.memberA.client, orgB.unitAId, orgB.categoryId, "cross-tenant");

    for (const denied of [
      { kind: "BEFORE", visibility: "MEMBER_VISIBLE", context: "member cannot create BEFORE" },
      { kind: "AFTER", visibility: "MEMBER_VISIBLE", context: "member cannot create AFTER" },
      { kind: "INVOICE", visibility: "MEMBER_VISIBLE", context: "member cannot create INVOICE" },
      { kind: "ISSUE", visibility: "STAFF_ONLY", context: "member cannot create STAFF_ONLY" },
    ]) {
      const result = await orgA.memberA.client.rpc("begin_maintenance_attachment_upload", {
        p_request_id: requestId,
        p_original_file_name: "denied.png",
        p_mime_type: "image/png",
        p_byte_size: PNG_BYTES.byteLength,
        p_kind: denied.kind,
        p_visibility: denied.visibility,
      });
      expectSecurityRejection(result.error, denied.context);
    }

    const anotherMemberRequest = await orgA.memberA.client.rpc("begin_maintenance_attachment_upload", {
      p_request_id: await createRequest(orgA.memberB.client, orgA.unitBId, orgA.categoryId, "other-member"),
      p_original_file_name: "denied.png",
      p_mime_type: "image/png",
      p_byte_size: PNG_BYTES.byteLength,
      p_kind: "ISSUE",
      p_visibility: "MEMBER_VISIBLE",
    });
    expectSecurityRejection(anotherMemberRequest.error, "member cannot upload to another member request");

    const crossTenant = await orgA.memberA.client.rpc("begin_maintenance_attachment_upload", {
      p_request_id: orgBRequestId,
      p_original_file_name: "denied.png",
      p_mime_type: "image/png",
      p_byte_size: PNG_BYTES.byteLength,
      p_kind: "ISSUE",
      p_visibility: "MEMBER_VISIBLE",
    });
    expectSecurityRejection(crossTenant.error, "member cannot upload cross-tenant");

    const unsupportedMime = await orgA.memberA.client.rpc("begin_maintenance_attachment_upload", {
      p_request_id: requestId,
      p_original_file_name: "denied.svg",
      p_mime_type: "image/svg+xml",
      p_byte_size: PNG_BYTES.byteLength,
      p_kind: "ISSUE",
      p_visibility: "MEMBER_VISIBLE",
    });
    expectSecurityRejection(unsupportedMime.error, "unsupported MIME must be denied");

    const emptyFile = await orgA.memberA.client.rpc("begin_maintenance_attachment_upload", {
      p_request_id: requestId,
      p_original_file_name: "empty.png",
      p_mime_type: "image/png",
      p_byte_size: 0,
      p_kind: "ISSUE",
      p_visibility: "MEMBER_VISIBLE",
    });
    expectSecurityRejection(emptyFile.error, "empty file must be denied");

    const oversized = await orgA.memberA.client.rpc("begin_maintenance_attachment_upload", {
      p_request_id: requestId,
      p_original_file_name: "oversized.png",
      p_mime_type: "image/png",
      p_byte_size: 10 * 1024 * 1024 + 1,
      p_kind: "ISSUE",
      p_visibility: "MEMBER_VISIBLE",
    });
    expectSecurityRejection(oversized.error, "oversized file must be denied");

    const cancelledRequest = await createRequest(orgA.memberA.client, orgA.unitAId, orgA.categoryId, "cancelled");
    const cancel = await orgA.memberA.client.rpc("cancel_own_maintenance_request", {
      p_request_id: cancelledRequest,
      p_note: "No longer needed.",
    });
    expect(cancel.error, `cancel request failed: ${cancel.error?.message}`).toBeNull();
    const cancelledUpload = await orgA.memberA.client.rpc("begin_maintenance_attachment_upload", {
      p_request_id: cancelledRequest,
      p_original_file_name: "closed.png",
      p_mime_type: "image/png",
      p_byte_size: PNG_BYTES.byteLength,
      p_kind: "ISSUE",
      p_visibility: "MEMBER_VISIBLE",
    });
    expectSecurityRejection(cancelledUpload.error, "cancelled requests must not accept attachments");

    const futureOwnedRequest = await orgA.memberA.client.rpc("create_maintenance_request", {
      p_unit_id: orgA.futureUnitId,
      p_category_id: orgA.categoryId,
      p_title: "Future request",
      p_description: "Future ownership must not create requests or attachments.",
      p_priority: "NORMAL",
    });
    expectSecurityRejection(futureOwnedRequest.error, "future-owned unit must not create request");

    const disabledRequest = await disabledOrg.memberA.client.rpc("create_maintenance_request", {
      p_unit_id: disabledOrg.unitAId,
      p_category_id: disabledOrg.categoryId,
      p_title: "Disabled request",
      p_description: "Disabled entitlement must not create requests or attachments.",
      p_priority: "NORMAL",
    });
    expectSecurityRejection(disabledRequest.error, "disabled entitlement must block request creation");
  });

  it("keeps metadata and storage objects invisible to unrelated members and cross-tenant users", async () => {
    const requestId = await createRequest(orgA.memberA.client, orgA.unitAId, orgA.categoryId, "visibility");
    const memberVisible = await uploadAndFinalize(orgA.memberA.client, requestId, { originalFileName: "member-visible.png" });
    createdStoragePaths.push(memberVisible.storage_path);

    const staffOnly = await uploadAndFinalize(orgA.staffManager.client, requestId, {
      originalFileName: "staff-before.png",
      kind: "BEFORE",
      visibility: "STAFF_ONLY",
    });
    createdStoragePaths.push(staffOnly.storage_path);

    const { data: ownerRows, error: ownerError } = await orgA.memberA.client
      .from("maintenance_request_attachments")
      .select("id, visibility")
      .in("id", [memberVisible.attachment_id, staffOnly.attachment_id])
      .order("id");
    expect(ownerError, `owner attachment read failed: ${ownerError?.message}`).toBeNull();
    expect(ownerRows).toEqual([{ id: memberVisible.attachment_id, visibility: "MEMBER_VISIBLE" }]);

    const { data: memberBRows, error: memberBError } = await orgA.memberB.client
      .from("maintenance_request_attachments")
      .select("id")
      .in("id", [memberVisible.attachment_id, staffOnly.attachment_id]);
    expect(memberBError, `member B metadata read failed: ${memberBError?.message}`).toBeNull();
    expect(memberBRows).toEqual([]);

    const { data: crossTenantRows, error: crossTenantError } = await orgB.memberA.client
      .from("maintenance_request_attachments")
      .select("id")
      .in("id", [memberVisible.attachment_id, staffOnly.attachment_id]);
    expect(crossTenantError, `cross-tenant metadata read failed: ${crossTenantError?.message}`).toBeNull();
    expect(crossTenantRows).toEqual([]);

    const memberBDownload = await orgA.memberB.client.storage.from(BUCKET).download(memberVisible.storage_path);
    expectSecurityRejection(memberBDownload.error, "unrelated member cannot download known storage object");

    const memberStaffOnlyDownload = await orgA.memberA.client.storage.from(BUCKET).download(staffOnly.storage_path);
    expectSecurityRejection(memberStaffOnlyDownload.error, "owner cannot download STAFF_ONLY object");

    const staffRows = await orgA.staffManager.client
      .from("maintenance_request_attachments")
      .select("id, visibility")
      .in("id", [memberVisible.attachment_id, staffOnly.attachment_id])
      .order("id");
    expect(staffRows.error, `staff metadata read failed: ${staffRows.error?.message}`).toBeNull();
    expect(staffRows.data).toHaveLength(2);

    const publicUrl = `${local.API_URL}/storage/v1/object/public/${BUCKET}/${memberVisible.storage_path}`;
    const publicResponse = await fetch(publicUrl);
    expect(publicResponse.ok).toBe(false);
  });

  it("permits staff manager uploads while keeping view-only staff read-only and tenant-scoped", async () => {
    const requestId = await createRequest(orgA.memberA.client, orgA.unitAId, orgA.categoryId, "staff-upload");
    const orgBRequestId = await createRequest(orgB.memberA.client, orgB.unitAId, orgB.categoryId, "staff-cross");

    for (const kind of ["BEFORE", "AFTER", "INVOICE", "OTHER"] as const) {
      const intent = await uploadAndFinalize(orgA.staffManager.client, requestId, {
        originalFileName: `${kind.toLowerCase()}.${kind === "INVOICE" ? "pdf" : "png"}`,
        mimeType: kind === "INVOICE" ? "application/pdf" : "image/png",
        body: kind === "INVOICE" ? PDF_BYTES : PNG_BYTES,
        kind,
        visibility: kind === "AFTER" ? "MEMBER_VISIBLE" : "STAFF_ONLY",
      });
      createdStoragePaths.push(intent.storage_path);
    }

    const { data: viewerRows, error: viewerReadError } = await orgA.staffViewer.client
      .from("maintenance_request_attachments")
      .select("id")
      .eq("maintenance_request_id", requestId);
    expect(viewerReadError, `view-only staff read failed: ${viewerReadError?.message}`).toBeNull();
    expect(viewerRows).toHaveLength(4);

    const viewerBegin = await orgA.staffViewer.client.rpc("begin_maintenance_attachment_upload", {
      p_request_id: requestId,
      p_original_file_name: "viewer.png",
      p_mime_type: "image/png",
      p_byte_size: PNG_BYTES.byteLength,
      p_kind: "ISSUE",
      p_visibility: "MEMBER_VISIBLE",
    });
    expectSecurityRejection(viewerBegin.error, "view-only staff cannot upload");

    const crossTenantStaff = await orgA.staffManager.client.rpc("begin_maintenance_attachment_upload", {
      p_request_id: orgBRequestId,
      p_original_file_name: "cross.png",
      p_mime_type: "image/png",
      p_byte_size: PNG_BYTES.byteLength,
      p_kind: "ISSUE",
      p_visibility: "MEMBER_VISIBLE",
    });
    expectSecurityRejection(crossTenantStaff.error, "staff manager cannot upload cross-tenant");
  });

  it("rejects forged object paths, object replacement, ready deletion, and invalid finalization", async () => {
    const requestId = await createRequest(orgA.memberA.client, orgA.unitAId, orgA.categoryId, "object-security");
    const directUpload = await orgA.memberA.client.storage.from(BUCKET).upload(
      `${orgA.orgId}/${requestId}/${randomUUID()}.png`,
      new Blob([PNG_BYTES], { type: "image/png" }),
      { contentType: "image/png", upsert: false },
    );
    expectSecurityRejection(directUpload.error, "direct upload to arbitrary path must be denied");

    const missingIntent = await beginAttachment(orgA.memberA.client, requestId, { originalFileName: "missing.png" });
    const missingFinalize = await orgA.memberA.client.rpc("finalize_maintenance_attachment_upload", {
      p_attachment_id: missingIntent.attachment_id,
    });
    expectSecurityRejection(missingFinalize.error, "missing object cannot finalize");

    const mismatchIntent = await beginAttachment(orgA.memberA.client, requestId, {
      originalFileName: "mismatch.png",
      byteSize: PNG_BYTES.byteLength + 1,
    });
    const mismatchSigned = await orgA.memberA.client.storage.from(BUCKET).createSignedUploadUrl(mismatchIntent.storage_path, { upsert: false });
    expect(mismatchSigned.error, `mismatch signed upload failed: ${mismatchSigned.error?.message}`).toBeNull();
    const mismatchUpload = await orgA.memberA.client.storage.from(BUCKET).uploadToSignedUrl(
      mismatchIntent.storage_path,
      mismatchSigned.data!.token,
      new Blob([PNG_BYTES], { type: "image/png" }),
      { contentType: "image/png", upsert: false },
    );
    expect(mismatchUpload.error, `mismatch object upload failed: ${mismatchUpload.error?.message}`).toBeNull();
    createdStoragePaths.push(mismatchIntent.storage_path);
    const mismatchFinalize = await orgA.memberA.client.rpc("finalize_maintenance_attachment_upload", {
      p_attachment_id: mismatchIntent.attachment_id,
    });
    expectSecurityRejection(mismatchFinalize.error, "size mismatch cannot finalize");

    const readyIntent = await uploadAndFinalize(orgA.memberA.client, requestId, { originalFileName: "ready.png" });
    createdStoragePaths.push(readyIntent.storage_path);

    const repeatFinalize = await orgA.memberA.client.rpc("finalize_maintenance_attachment_upload", {
      p_attachment_id: readyIntent.attachment_id,
    });
    expectSecurityRejection(repeatFinalize.error, "repeated finalize must not create duplicate evidence");

    const overwrite = await orgA.memberA.client.storage.from(BUCKET).upload(
      readyIntent.storage_path,
      new Blob([PNG_BYTES], { type: "image/png" }),
      { contentType: "image/png", upsert: true },
    );
    expectSecurityRejection(overwrite.error, "ready object overwrite must be denied");

    const readyDelete = await orgA.memberA.client.storage.from(BUCKET).remove([readyIntent.storage_path]);
    expect(readyDelete.error, "ready object delete should be rejected or affect zero rows").toBeNull();
    expect(readyDelete.data ?? []).toEqual([]);

    const download = await orgA.memberA.client.storage.from(BUCKET).download(readyIntent.storage_path);
    expect(download.error, `ready object should remain after denied delete: ${download.error?.message}`).toBeNull();
  });

  it("allows pending upload aborts only for the authorized uploader and keeps accounting unchanged", async () => {
    const beforeAccounting = {
      dues: await countRows(admin, "dues", orgA.orgId),
      expenses: await countRows(admin, "expenses", orgA.orgId),
      journalEntries: await countRows(admin, "journal_entries", orgA.orgId),
      payments: await countRows(admin, "payments", orgA.orgId),
      supplierInvoices: await countRows(admin, "supplier_invoices", orgA.orgId),
    };

    const requestId = await createRequest(orgA.memberA.client, orgA.unitAId, orgA.categoryId, "abort-accounting");
    const pending = await beginAttachment(orgA.memberA.client, requestId, { originalFileName: "pending.png" });

    const bystanderAbort = await orgA.memberB.client.rpc("abort_maintenance_attachment_upload", {
      p_attachment_id: pending.attachment_id,
    });
    expectSecurityRejection(bystanderAbort.error, "unrelated member cannot abort another upload intent");

    const ownerAbort = await orgA.memberA.client.rpc("abort_maintenance_attachment_upload", {
      p_attachment_id: pending.attachment_id,
    });
    expect(ownerAbort.error, `owner abort failed: ${ownerAbort.error?.message}`).toBeNull();

    const { data: ownerRows, error: ownerRowsError } = await orgA.memberA.client
      .from("maintenance_request_attachments")
      .select("id")
      .eq("id", pending.attachment_id);
    expect(ownerRowsError, `failed metadata is not visible to member: ${ownerRowsError?.message}`).toBeNull();
    expect(ownerRows).toEqual([]);

    const afterAccounting = {
      dues: await countRows(admin, "dues", orgA.orgId),
      expenses: await countRows(admin, "expenses", orgA.orgId),
      journalEntries: await countRows(admin, "journal_entries", orgA.orgId),
      payments: await countRows(admin, "payments", orgA.orgId),
      supplierInvoices: await countRows(admin, "supplier_invoices", orgA.orgId),
    };
    expect(afterAccounting).toEqual(beforeAccounting);
  });
});
