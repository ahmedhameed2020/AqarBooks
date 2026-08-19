"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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

export async function saveProject(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = projectSchema.safeParse({
    organizationId: formData.get("organizationId"),
    code: formData.get("code"),
    nameAr: formData.get("nameAr"),
    nameEn: formData.get("nameEn"),
    propertyId: (formData.get("propertyId") as string) || undefined,
    wipAccountId: (formData.get("wipAccountId") as string) ?? "",
    costOfSalesAccountId: (formData.get("costOfSalesAccountId") as string) ?? "",
    budgetAmount: (formData.get("budgetAmount") as string) || undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("projects").upsert(
    {
      organization_id: d.organizationId,
      code: d.code,
      name_ar: d.nameAr,
      name_en: d.nameEn,
      property_id: d.propertyId ?? null,
      wip_account_id: d.wipAccountId || null,
      cost_of_sales_account_id: d.costOfSalesAccountId || null,
      budget_amount: d.budgetAmount ?? null,
    },
    { onConflict: "organization_id,code" },
  );
  if (error) return { ok: false, error: error.message };

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
