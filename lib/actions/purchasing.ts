"use server";

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions/platform";

const createSupplierSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(200),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().max(30).optional(),
  payableAccountId: z.string().uuid(),
});

export async function createSupplierAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createSupplierSchema.safeParse({
    organizationId: formData.get("organizationId"),
    name: formData.get("name"),
    contactEmail: formData.get("contactEmail") || undefined,
    contactPhone: formData.get("contactPhone") || undefined,
    payableAccountId: formData.get("payableAccountId"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").insert({
    organization_id: parsed.data.organizationId,
    name: parsed.data.name,
    contact_email: parsed.data.contactEmail || null,
    contact_phone: parsed.data.contactPhone || null,
    payable_account_id: parsed.data.payableAccountId,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/finance/suppliers", "page");
  return { ok: true };
}

const createExpenseCategorySchema = z.object({
  organizationId: z.string().uuid(),
  nameAr: z.string().min(1).max(200),
  nameEn: z.string().min(1).max(200),
  defaultExpenseAccountId: z.string().uuid(),
});

export async function createExpenseCategoryAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createExpenseCategorySchema.safeParse({
    organizationId: formData.get("organizationId"),
    nameAr: formData.get("nameAr"),
    nameEn: formData.get("nameEn"),
    defaultExpenseAccountId: formData.get("defaultExpenseAccountId"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.from("expense_categories").insert({
    organization_id: parsed.data.organizationId,
    name_ar: parsed.data.nameAr,
    name_en: parsed.data.nameEn,
    default_expense_account_id: parsed.data.defaultExpenseAccountId,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/finance/expenses", "page");
  return { ok: true };
}

const createRequestSchema = z.object({
  organizationId: z.string().uuid(),
  resortId: z.string().uuid(),
  description: z.string().min(1).max(500),
  estimatedAmount: z.coerce.number().positive(),
});

export async function createPurchaseRequestAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createRequestSchema.safeParse({
    organizationId: formData.get("organizationId"),
    resortId: formData.get("resortId"),
    description: formData.get("description"),
    estimatedAmount: formData.get("estimatedAmount"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_purchase_request", {
    p_organization_id: parsed.data.organizationId,
    p_resort_id: parsed.data.resortId,
    p_description: parsed.data.description,
    p_estimated_amount: parsed.data.estimatedAmount,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/finance/suppliers", "page");
  return { ok: true };
}

const decideRequestSchema = z.object({
  requestId: z.string().uuid(),
  approve: z.enum(["true", "false"]),
  reason: z.string().max(500).optional(),
});

export async function decidePurchaseRequestAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = decideRequestSchema.safeParse({
    requestId: formData.get("requestId"),
    approve: formData.get("approve"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_purchase_request", {
    p_request_id: parsed.data.requestId,
    p_approve: parsed.data.approve === "true",
    p_reason: parsed.data.reason ?? null,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/finance/suppliers", "page");
  return { ok: true };
}

const createOrderSchema = z.object({
  organizationId: z.string().uuid(),
  resortId: z.string().uuid(),
  supplierId: z.string().uuid(),
  purchaseRequestId: z.string().uuid().optional(),
  description: z.string().min(1).max(500),
  amount: z.coerce.number().positive(),
  orderDate: z.string().min(1),
});

export async function createPurchaseOrderAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createOrderSchema.safeParse({
    organizationId: formData.get("organizationId"),
    resortId: formData.get("resortId"),
    supplierId: formData.get("supplierId"),
    purchaseRequestId: formData.get("purchaseRequestId") || undefined,
    description: formData.get("description"),
    amount: formData.get("amount"),
    orderDate: formData.get("orderDate"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_purchase_order", {
    p_organization_id: parsed.data.organizationId,
    p_resort_id: parsed.data.resortId,
    p_supplier_id: parsed.data.supplierId,
    p_purchase_request_id: parsed.data.purchaseRequestId ?? null,
    p_description: parsed.data.description,
    p_amount: parsed.data.amount,
    p_order_date: parsed.data.orderDate,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/finance/suppliers", "page");
  return { ok: true };
}

export async function approvePurchaseOrderAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = formData.get("purchaseOrderId");
  if (typeof id !== "string") return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_purchase_order", { p_purchase_order_id: id });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/finance/suppliers", "page");
  return { ok: true };
}

const setOrderStatusSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  status: z.enum(["RECEIVED", "CANCELLED"]),
});

export async function setPurchaseOrderStatusAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = setOrderStatusSchema.safeParse({
    purchaseOrderId: formData.get("purchaseOrderId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_purchase_order_status", {
    p_purchase_order_id: parsed.data.purchaseOrderId,
    p_new_status: parsed.data.status,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/finance/suppliers", "page");
  return { ok: true };
}

const postInvoiceSchema = z.object({
  organizationId: z.string().uuid(),
  resortId: z.string().uuid(),
  supplierId: z.string().uuid(),
  purchaseOrderId: z.string().uuid().optional(),
  invoiceNumber: z.string().min(1).max(60),
  expenseAccountId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  invoiceDate: z.string().min(1),
  dueDate: z.string().min(1),
  fiscalPeriodId: z.string().uuid(),
});

export async function postSupplierInvoiceAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = postInvoiceSchema.safeParse({
    organizationId: formData.get("organizationId"),
    resortId: formData.get("resortId"),
    supplierId: formData.get("supplierId"),
    purchaseOrderId: formData.get("purchaseOrderId") || undefined,
    invoiceNumber: formData.get("invoiceNumber"),
    expenseAccountId: formData.get("expenseAccountId"),
    amount: formData.get("amount"),
    invoiceDate: formData.get("invoiceDate"),
    dueDate: formData.get("dueDate"),
    fiscalPeriodId: formData.get("fiscalPeriodId"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("post_supplier_invoice", {
    p_organization_id: parsed.data.organizationId,
    p_resort_id: parsed.data.resortId,
    p_supplier_id: parsed.data.supplierId,
    p_purchase_order_id: parsed.data.purchaseOrderId ?? null,
    p_invoice_number: parsed.data.invoiceNumber,
    p_expense_account_id: parsed.data.expenseAccountId,
    p_amount: parsed.data.amount,
    p_invoice_date: parsed.data.invoiceDate,
    p_due_date: parsed.data.dueDate,
    p_fiscal_period_id: parsed.data.fiscalPeriodId,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/finance/suppliers", "page");
  return { ok: true };
}

const allocationSchema = z.object({ invoice_id: z.string().uuid(), amount: z.number().positive() });

const recordSupplierPaymentSchema = z.object({
  organizationId: z.string().uuid(),
  resortId: z.string().uuid(),
  supplierId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  method: z.enum(["CASH", "BANK_TRANSFER", "CHEQUE", "OTHER"]),
  paymentDate: z.string().min(1),
  paymentAccountId: z.string().uuid(),
  fiscalPeriodId: z.string().uuid(),
  allocations: z.array(allocationSchema).min(1),
});

export async function recordSupplierPaymentAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let allocationsRaw: unknown;
  try {
    allocationsRaw = JSON.parse(String(formData.get("allocations") ?? "[]"));
  } catch {
    return { ok: false, error: "invalid_input" };
  }

  const parsed = recordSupplierPaymentSchema.safeParse({
    organizationId: formData.get("organizationId"),
    resortId: formData.get("resortId"),
    supplierId: formData.get("supplierId"),
    amount: formData.get("amount"),
    method: formData.get("method"),
    paymentDate: formData.get("paymentDate"),
    paymentAccountId: formData.get("paymentAccountId"),
    fiscalPeriodId: formData.get("fiscalPeriodId"),
    allocations: allocationsRaw,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_supplier_payment", {
    p_organization_id: parsed.data.organizationId,
    p_resort_id: parsed.data.resortId,
    p_supplier_id: parsed.data.supplierId,
    p_amount: parsed.data.amount,
    p_method: parsed.data.method,
    p_payment_date: parsed.data.paymentDate,
    p_payment_account_id: parsed.data.paymentAccountId,
    p_fiscal_period_id: parsed.data.fiscalPeriodId,
    p_allocations: parsed.data.allocations,
    p_idempotency_key: randomUUID(),
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/finance/suppliers", "page");
  return { ok: true };
}

const recordExpenseSchema = z.object({
  organizationId: z.string().uuid(),
  resortId: z.string().uuid(),
  expenseCategoryId: z.string().uuid(),
  description: z.string().min(1).max(500),
  amount: z.coerce.number().positive(),
  expenseDate: z.string().min(1),
  paymentAccountId: z.string().uuid(),
  fiscalPeriodId: z.string().uuid(),
});

export async function recordExpenseAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = recordExpenseSchema.safeParse({
    organizationId: formData.get("organizationId"),
    resortId: formData.get("resortId"),
    expenseCategoryId: formData.get("expenseCategoryId"),
    description: formData.get("description"),
    amount: formData.get("amount"),
    expenseDate: formData.get("expenseDate"),
    paymentAccountId: formData.get("paymentAccountId"),
    fiscalPeriodId: formData.get("fiscalPeriodId"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_expense", {
    p_organization_id: parsed.data.organizationId,
    p_resort_id: parsed.data.resortId,
    p_expense_category_id: parsed.data.expenseCategoryId,
    p_description: parsed.data.description,
    p_amount: parsed.data.amount,
    p_expense_date: parsed.data.expenseDate,
    p_payment_account_id: parsed.data.paymentAccountId,
    p_fiscal_period_id: parsed.data.fiscalPeriodId,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/finance/expenses", "page");
  return { ok: true };
}
