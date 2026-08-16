"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { revalidatePath } from "next/cache";
import { IMPORT_KINDS, previewImportRows, buildMembersImportRows, buildUnitsImportRows, type ImportKind, type ImportPreviewRow, type MemberImportRow, type UnitImportRow } from "@/lib/import-schemas";

type ImportActionSuccess = {
  ok: true;
  importedRows: number;
  skippedRows: number;
  failures: Array<{ row: number; error: string }>;
};

type ImportRpcResponse = {
  imported_rows?: number;
  skipped_rows?: number;
  failures?: Array<{ row?: number; error?: string }>;
};

type ImportActionFailure = {
  ok: false;
  error: string;
  validationErrors?: Array<{ rowIndex: number; errors: string[] }>;
};

export type PropertyImportActionResult = ImportActionSuccess | ImportActionFailure;

export async function importPropertyCsvAction(
  _prevState: PropertyImportActionResult,
  formData: FormData,
): Promise<PropertyImportActionResult> {
  const kind = String(formData.get("kind") || "");
  if (!IMPORT_KINDS.includes(kind as ImportKind)) {
    return { ok: false, error: "invalid_import_kind" };
  }

  const allowPartial = Boolean(formData.get("allowPartial"));
  const resortId = String(formData.get("resortId") || "");
  const csvFile = formData.get("csv");
  if (!(csvFile instanceof File)) {
    return { ok: false, error: "missing_csv_file" };
  }

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "not_authenticated" };
  const organization = await getPrimaryOrganization(user.id);
  if (!organization) return { ok: false, error: "no_organization" };

  const csvText = await csvFile.text();
  const supabase = await createClient();

  const buildingsByCode = new Map<string, string>();
  const zonesByCode = new Map<string, string>();
  const membersByEmail = new Map<string, string>();
  const membersByPhone = new Map<string, string>();

  if (kind === "units") {
    const [{ data: buildings }, { data: zones }, { data: members }] = await Promise.all([
      supabase
        .from("buildings")
        .select("id, code")
        .eq("organization_id", organization.id)
        .eq("property_id", resortId),
      supabase
        .from("zones")
        .select("id, code")
        .eq("organization_id", organization.id)
        .eq("property_id", resortId),
      supabase
        .from("members")
        .select("id, email, phone")
        .eq("organization_id", organization.id),
    ]);

    for (const building of buildings ?? []) {
      if (building.code) buildingsByCode.set(building.code.trim().toLowerCase(), building.id);
    }
    for (const zone of (zones as any[]) ?? []) {
      if (zone.code) zonesByCode.set(zone.code.trim().toLowerCase(), zone.id);
    }
    for (const member of members ?? []) {
      if (member.email) membersByEmail.set(member.email.trim().toLowerCase(), member.id);
      if (member.phone) membersByPhone.set(member.phone.trim().toLowerCase(), member.id);
    }
  } else {
    const { data: members } = await supabase
      .from("members")
      .select("id, email, phone")
      .eq("organization_id", organization.id);

    for (const member of members ?? []) {
      if (member.email) membersByEmail.set(member.email.trim().toLowerCase(), member.id);
      if (member.phone) membersByPhone.set(member.phone.trim().toLowerCase(), member.id);
    }
  }

  const preview = previewImportRows(csvText, kind as ImportKind, {
    buildingsByCode,
    zonesByCode,
    membersByEmail,
    membersByPhone,
  });

  if (preview.parseError) {
    return { ok: false, error: preview.parseError };
  }

  const invalidRows = preview.rows.filter((row) => row.errors.length > 0);
  if (!allowPartial && invalidRows.length > 0) {
    return {
      ok: false,
      error: "invalid_rows",
      validationErrors: invalidRows.map((row) => ({ rowIndex: row.rowIndex, errors: row.errors })),
    };
  }

  const rows = kind === "members"
    ? buildMembersImportRows(preview.rows as any)
    : buildUnitsImportRows(preview.rows as any);
  if (rows.length === 0) {
    return { ok: false, error: "no_valid_rows" };
  }

  if (kind === "units" && !resortId) {
    return { ok: false, error: "missing_resort" };
  }

  const { data, error } = await (supabase.rpc as any)("import_property_csv", {
    p_organization_id: organization.id,
    p_resort_id: kind === "units" ? resortId : null,
    p_import_kind: kind,
    p_rows: JSON.stringify(rows),
    p_allow_partial: allowPartial,
  });

  if (error || !data) {
    return { ok: false, error: error?.message ?? "import_failed" };
  }

  const importResult = data as ImportRpcResponse | null;
  const importedRows = Number(importResult?.imported_rows ?? 0);
  const skippedRows = Number(importResult?.skipped_rows ?? 0);
  const failures = Array.isArray(importResult?.failures)
    ? importResult.failures.map((failure) => ({ row: Number(failure.row ?? 0), error: String(failure.error ?? "unknown") }))
    : [];

  revalidatePath("/[locale]/property", "page");
  revalidatePath("/[locale]/members", "page");
  revalidatePath("/[locale]/import", "page");

  return { ok: true, importedRows, skippedRows, failures };
}
