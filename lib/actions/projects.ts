"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasPermission } from "@/lib/auth/authorize";
import type { ActionResult } from "@/lib/actions/platform";

const PATH = "/[locale]/finance/projects";

/**
 * The rules live in the database: only `finance.accounts.manage` may post, the
 * two accounts must be designated before anything is capitalised, a release
 * cannot exceed what has accumulated, and a completed project takes no new
 * cost. None is duplicated here.
 */

const projectSchema = z.object({
  organizationId: z.string().uuid(),
  code: z.string().min(1).max(40),
  nameAr: z.string().min(1).max(200),
  nameEn: z.string().min(1).max(200),
  propertyId: z.string().uuid().optional(),
  wipAccountId: z.string().uuid().or(z.literal("")).optional(),
  costOfSalesAccountId: z.string().uuid().or(z.literal("")).optional(),
  // Optional: a project without a budget is legitimate, and the report shows
  // its variance as "no budget" rather than pretending it is on target.
  budgetAmount: z.coerce.number().positive().optional(),
});

const DUPLICATE_CODE = "23505";

/** Creates a project. A code that already exists in the organization is refused, never overwritten. */
function readProjectFields(formData: FormData) {
  return {
    organizationId: formData.get("organizationId"),
    code: formData.get("code"),
    nameAr: formData.get("nameAr"),
    nameEn: formData.get("nameEn"),
    propertyId: (formData.get("propertyId") as string) || undefined,
    wipAccountId: (formData.get("wipAccountId") as string) ?? "",
    costOfSalesAccountId: (formData.get("costOfSalesAccountId") as string) ?? "",
    budgetAmount: (formData.get("budgetAmount") as string) || undefined,
  };
}

const updateProjectSchema = projectSchema.extend({ projectId: z.string().uuid() });

export async function createProject(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = projectSchema.safeParse(readProjectFields(formData));
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("projects").insert({
    organization_id: d.organizationId,
    code: d.code,
    name_ar: d.nameAr,
    name_en: d.nameEn,
    property_id: d.propertyId ?? null,
    wip_account_id: d.wipAccountId || null,
    cost_of_sales_account_id: d.costOfSalesAccountId || null,
    budget_amount: d.budgetAmount ?? null,
  });
  if (error) {
    if (error.code === DUPLICATE_CODE) return { ok: false, error: "PROJECT_CODE_EXISTS" };
    return { ok: false, error: error.message };
  }

  revalidatePath(PATH, "page");
  return { ok: true };
}

/**
 * Explicit edit of an existing project. The server, not the form, decides what may change:
 * - the caller must hold finance.accounts.manage (checked here and again by RLS on the update);
 * - once the project has any POSTED or REVERSED journal line, its code, property and both
 *   ledger accounts are locked, so past postings never change their meaning silently.
 * Name and budget stay editable at any time.
 */
export async function updateProject(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateProjectSchema.safeParse({
    projectId: formData.get("projectId"),
    ...readProjectFields(formData),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  if (!(await hasPermission(d.organizationId, "finance.accounts.manage"))) {
    return { ok: false, error: "FORBIDDEN_ACCOUNTS_PERMISSION" };
  }

  const admin = createAdminClient();
  const { data: current, error: currentErr } = await admin
    .from("projects")
    .select("id, code, property_id, wip_account_id, cost_of_sales_account_id")
    .eq("id", d.projectId)
    .eq("organization_id", d.organizationId)
    .maybeSingle();
  if (currentErr) return { ok: false, error: currentErr.message };
  if (!current) return { ok: false, error: "PROJECT_NOT_FOUND" };

  const { count: postedLines, error: postingsErr } = await admin
    .from("journal_entry_lines")
    .select("id, journal_entries!inner(status)", { count: "exact", head: true })
    .eq("project_id", d.projectId)
    .in("journal_entries.status", ["POSTED", "REVERSED"]);
  if (postingsErr) return { ok: false, error: postingsErr.message };

  const hasPostings = (postedLines ?? 0) > 0;
  if (hasPostings) {
    const lockedChanged =
      d.code !== current.code ||
      (d.propertyId ?? null) !== (current.property_id ?? null) ||
      (d.wipAccountId || null) !== (current.wip_account_id ?? null) ||
      (d.costOfSalesAccountId || null) !== (current.cost_of_sales_account_id ?? null);
    if (lockedChanged) return { ok: false, error: "PROJECT_HAS_POSTINGS" };
  }

  // The write runs on the caller's session, so RLS enforces the same permission a second time.
  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("projects")
    .update({
      code: d.code,
      name_ar: d.nameAr,
      name_en: d.nameEn,
      property_id: d.propertyId ?? null,
      wip_account_id: d.wipAccountId || null,
      cost_of_sales_account_id: d.costOfSalesAccountId || null,
      budget_amount: d.budgetAmount ?? null,
    })
    .eq("id", d.projectId)
    .eq("organization_id", d.organizationId)
    .select("id");
  if (error) {
    if (error.code === DUPLICATE_CODE) return { ok: false, error: "PROJECT_CODE_EXISTS" };
    return { ok: false, error: error.message };
  }
  if (!updated || updated.length === 0) {
    return { ok: false, error: "FORBIDDEN_ACCOUNTS_PERMISSION" };
  }

  revalidatePath(PATH, "page");
  return { ok: true };
}

const capitaliseSchema = z.object({
  projectId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  creditAccountId: z.string().uuid(),
  entryDate: z.string().min(1),
  description: z.string().min(1).max(300),
});

export async function capitaliseProjectCost(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = capitaliseSchema.safeParse({
    projectId: formData.get("projectId"),
    amount: formData.get("amount"),
    creditAccountId: formData.get("creditAccountId"),
    entryDate: formData.get("entryDate"),
    description: formData.get("description"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("capitalise_project_cost", {
    p_project_id: parsed.data.projectId,
    p_amount: parsed.data.amount,
    p_credit_account_id: parsed.data.creditAccountId,
    p_entry_date: parsed.data.entryDate,
    p_description: parsed.data.description,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(PATH, "page");
  return { ok: true };
}

const releaseSchema = z.object({
  projectId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  entryDate: z.string().min(1),
  description: z.string().max(300).optional(),
});

export async function releaseProjectWip(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = releaseSchema.safeParse({
    projectId: formData.get("projectId"),
    amount: formData.get("amount"),
    entryDate: formData.get("entryDate"),
    description: (formData.get("description") as string) || undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("release_project_wip", {
    p_project_id: parsed.data.projectId,
    p_amount: parsed.data.amount,
    p_entry_date: parsed.data.entryDate,
    p_description: parsed.data.description ?? null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(PATH, "page");
  return { ok: true };
}
