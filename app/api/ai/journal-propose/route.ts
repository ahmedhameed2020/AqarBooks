import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { proposeJournalEntryDraft } from "@/lib/ai/journal-copilot";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await req.json();
    const rawDescription = body?.description as string;
    const amount = Number(body?.amount) || 0;
    const vendorName = body?.vendorName as string;
    const unitCode = body?.unitCode as string;
    const organizationId = body?.organizationId as string;
    const locale = (body?.locale as string) || "ar";

    if (!rawDescription || !rawDescription.trim()) {
      return NextResponse.json({ error: "EMPTY_DESCRIPTION" }, { status: 400 });
    }

    const supabase = await createClient();

    // 1. Fetch active accounts for the tenant's chart of accounts
    const { data: accounts } = await supabase
      .from("chart_of_accounts")
      .select("id, code, name_ar, name_en, category")
      .eq("organization_id", organizationId || user.id)
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

    // 2. Generate balanced journal entry proposal with multi-factor confidence and policy memory
    const proposal = await proposeJournalEntryDraft({
      rawDescription,
      amount,
      vendorName,
      unitCode,
      organizationId: organizationId || user.id,
      availableAccounts,
      isAr: locale === "ar",
    });

    return NextResponse.json({
      success: true,
      proposal,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
