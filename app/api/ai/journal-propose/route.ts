import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { proveTenantPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import { isDemoOrganization } from "@/lib/demo/config";
import { proposeJournalEntryDraft } from "@/lib/ai/journal-copilot";
import { isAiAvailable } from "@/lib/ai/availability";

/**
 * POST /api/ai/journal-propose
 *
 * Order matters: nothing that can reach the AI provider (or read tenant data on its behalf) runs until
 * the caller is proven to be an ACTIVE member of the named organization holding the permission that the
 * journal form itself requires.
 *
 *   1. identity            -> 401
 *   2. input shape         -> 400   (organizationId is REQUIRED; there is no fallback to the user id)
 *   3. organization + permission (tenant-scoped proof, no platform-admin bypass) -> 403
 *      One answer for "not a member", "no permission", "suspended" and "no such organization", so the
 *      route cannot be used to probe which organizations exist.
 *   4. organization active and not the public demo -> 403 / 503
 *   5. operational kill switch AI_JOURNAL_COPILOT_DISABLED=true    -> 503
 *   6. only now: read the organization's chart of accounts (RLS applies) and call the provider.
 */
const bodySchema = z.object({
  organizationId: z.string().uuid(),
  description: z.string().trim().min(1).max(1000),
  amount: z.coerce.number().finite().min(0).max(1e12).optional().default(0),
  vendorName: z.string().trim().max(200).optional().default(""),
  unitCode: z.string().trim().max(100).optional().default(""),
  locale: z.enum(["ar", "en"]).optional().default("ar"),
});

const JOURNAL_PERMISSION = "finance.entries.create";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      const emptyDescription = (raw as { description?: unknown } | null)?.description !== undefined
        && String((raw as { description?: unknown }).description ?? "").trim() === "";
      return NextResponse.json({ error: emptyDescription ? "EMPTY_DESCRIPTION" : "INVALID_INPUT" }, { status: 400 });
    }
    const { organizationId, description, amount, vendorName, unitCode, locale } = parsed.data;

    const proof = await proveTenantPermission(organizationId, JOURNAL_PERMISSION, user.id);
    if (!proof.ok) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const supabase = await createClient();
    const { data: organization, error: orgError } = await supabase
      .from("organizations")
      .select("id, status")
      .eq("id", organizationId)
      .maybeSingle();
    if (orgError || !organization || !["ACTIVE", "TRIAL"].includes(organization.status)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    // Not part of the public demo, an operational off switch, and nothing to call without a provider credential.
    if (isDemoOrganization(organizationId) || process.env.AI_JOURNAL_COPILOT_DISABLED === "true" || !isAiAvailable()) {
      return NextResponse.json({ error: "AI_DISABLED" }, { status: 503 });
    }

    const { data: accounts } = await supabase
      .from("chart_of_accounts")
      .select("id, code, name_ar, name_en, category")
      .eq("organization_id", organizationId)
      .eq("is_group", false)
      .eq("is_active", true)
      .order("code");

    const availableAccounts = (accounts || []).map((a) => ({
      id: a.id,
      code: a.code,
      name_ar: a.name_ar,
      name_en: a.name_en,
      category: a.category,
    }));

    const proposal = await proposeJournalEntryDraft({
      rawDescription: description,
      amount,
      vendorName,
      unitCode,
      organizationId,
      availableAccounts,
      isAr: locale === "ar",
    });

    return NextResponse.json({ success: true, proposal });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
