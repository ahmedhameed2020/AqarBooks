"use server";

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions/platform";
import { denyIfDemo } from "@/lib/demo/guard";

const createSupplierSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(200),
  taxNumber: z.string().max(50).optional().or(z.literal("")),
  commercialRegistry: z.string().max(50).optional().or(z.literal("")),
  contactPerson: z.string().max(100).optional().or(z.literal("")),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().max(30).optional().or(z.literal("")),
  address: z.string().max(300).optional().or(z.literal("")),
  category: z.string().max(100).optional().or(z.literal("")),
  paymentTermsDays: z.coerce.number().int().nonnegative().optional().default(30),
  creditLimit: z.coerce.number().nonnegative().optional().default(0),
  bankName: z.string().max(100).optional().or(z.literal("")),
  bankIban: z.string().max(60).optional().or(z.literal("")),
  payableAccountId: z.string().uuid(),
});

export async function createSupplierAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const parsed = createSupplierSchema.safeParse({
    organizationId: formData.get("organizationId"),
    name: formData.get("name"),
    taxNumber: formData.get("taxNumber") || undefined,
    commercialRegistry: formData.get("commercialRegistry") || undefined,
    contactPerson: formData.get("contactPerson") || undefined,
    contactEmail: formData.get("contactEmail") || undefined,
    contactPhone: formData.get("contactPhone") || undefined,
    address: formData.get("address") || undefined,
    category: formData.get("category") || undefined,
    paymentTermsDays: formData.get("paymentTermsDays") || 30,
    creditLimit: formData.get("creditLimit") || 0,
    bankName: formData.get("bankName") || undefined,
    bankIban: formData.get("bankIban") || undefined,
    payableAccountId: formData.get("payableAccountId"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const bankDetails = [
    parsed.data.bankName ? `البنك: ${parsed.data.bankName}` : null,
    parsed.data.bankIban ? `IBAN / الحساب: ${parsed.data.bankIban}` : null,
  ].filter(Boolean).join(" — ");

  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").insert({
    organization_id: parsed.data.organizationId,
    name: parsed.data.name,
    tax_number: parsed.data.taxNumber || null,
    commercial_registry: parsed.data.commercialRegistry || null,
    contact_person: parsed.data.contactPerson || null,
    contact_email: parsed.data.contactEmail || null,
    contact_phone: parsed.data.contactPhone || null,
    address: parsed.data.address || null,
    bank_account_details: bankDetails || null,
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
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

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
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

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
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

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
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

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
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

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
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

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

// deferred_purchasing_vat_wht_baseline: post_supplier_invoice's live signature
// (confirmed via pg_get_function_identity_arguments, not assumed from the
// migration file, which had drifted) requires p_net_amount/p_discount_amount/
// p_vat_rate/p_vat_account_id/p_wht_rate/p_wht_account_id -- none of which
// this form previously collected (it only ever sent a since-removed p_amount).
// Discount/VAT/WHT are all optional and default to 0/null; the RPC itself
// requires the matching account when a rate above zero is supplied and
// raises a clear error otherwise (VAT/WHT account is required when a
// VAT/WHT rate is set) -- not re-validated here, to avoid the two sides of
// that rule drifting apart.
const postInvoiceSchema = z.object({
  organizationId: z.string().uuid(),
  resortId: z.string().uuid(),
  supplierId: z.string().uuid(),
  purchaseOrderId: z.string().uuid().optional(),
  invoiceNumber: z.string().min(1).max(60),
  expenseAccountId: z.string().uuid(),
  netAmount: z.coerce.number().positive(),
  discountAmount: z.coerce.number().min(0).default(0),
  vatRate: z.coerce.number().min(0).max(100).default(0),
  vatAccountId: z.string().uuid().optional(),
  whtRate: z.coerce.number().min(0).max(100).default(0),
  whtAccountId: z.string().uuid().optional(),
  invoiceDate: z.string().min(1),
  dueDate: z.string().min(1),
  fiscalPeriodId: z.string().uuid(),
  // Empty means the organisation's own currency, which is what every existing
  // caller sends. The wrapper treats that as the identity case and delegates
  // to the original RPC unchanged.
  currency: z.string().trim().length(3).transform((c) => c.toUpperCase()).optional(),
  // Optional: a contracted rate overrides the registry. Omitted means "use the
  // recorded rate", and if none exists the database refuses rather than
  // assuming 1:1.
  exchangeRate: z.coerce.number().positive().optional(),
});

export async function postSupplierInvoiceAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const parsed = postInvoiceSchema.safeParse({
    organizationId: formData.get("organizationId"),
    resortId: formData.get("resortId"),
    supplierId: formData.get("supplierId"),
    purchaseOrderId: formData.get("purchaseOrderId") || undefined,
    invoiceNumber: formData.get("invoiceNumber"),
    expenseAccountId: formData.get("expenseAccountId"),
    netAmount: formData.get("netAmount"),
    discountAmount: formData.get("discountAmount") || undefined,
    vatRate: formData.get("vatRate") || undefined,
    vatAccountId: formData.get("vatAccountId") || undefined,
    whtRate: formData.get("whtRate") || undefined,
    whtAccountId: formData.get("whtAccountId") || undefined,
    invoiceDate: formData.get("invoiceDate"),
    dueDate: formData.get("dueDate"),
    fiscalPeriodId: formData.get("fiscalPeriodId"),
    currency: (formData.get("currency") as string) || undefined,
    exchangeRate: (formData.get("exchangeRate") as string) || undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  // Always the currency-aware wrapper: with a null currency it delegates
  // straight to `post_supplier_invoice`, so the local path is byte-identical
  // to what it was and there is no second code path to keep in step.
  const { error } = await supabase.rpc("post_supplier_invoice_in_currency", {
    p_organization_id: parsed.data.organizationId,
    p_resort_id: parsed.data.resortId,
    p_supplier_id: parsed.data.supplierId,
    p_purchase_order_id: parsed.data.purchaseOrderId ?? null,
    p_invoice_number: parsed.data.invoiceNumber,
    p_expense_account_id: parsed.data.expenseAccountId,
    p_net_amount: parsed.data.netAmount,
    p_discount_amount: parsed.data.discountAmount,
    p_vat_rate: parsed.data.vatRate,
    p_vat_account_id: parsed.data.vatAccountId ?? null,
    p_wht_rate: parsed.data.whtRate,
    p_wht_account_id: parsed.data.whtAccountId ?? null,
    p_invoice_date: parsed.data.invoiceDate,
    p_due_date: parsed.data.dueDate,
    p_fiscal_period_id: parsed.data.fiscalPeriodId,
    p_currency: parsed.data.currency ?? null,
    p_exchange_rate: parsed.data.exchangeRate ?? null,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/finance/suppliers", "page");
  return { ok: true };
}

const settleFxSchema = z.object({
  invoiceId: z.string().uuid(),
  settlementDate: z.string().min(1),
  settlementRate: z.coerce.number().positive(),
});

/**
 * Records the realised difference between the rate an invoice was booked at
 * and the rate it was settled at. Separate from payment on purpose: the
 * payment moves cash, this recognises the currency movement, and conflating
 * them would hide which of the two an entry represents.
 */
export async function settleSupplierInvoiceFxAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const parsed = settleFxSchema.safeParse({
    invoiceId: formData.get("invoiceId"),
    settlementDate: formData.get("settlementDate"),
    settlementRate: formData.get("settlementRate"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("settle_supplier_invoice_fx_difference", {
    p_invoice_id: parsed.data.invoiceId,
    p_settlement_date: parsed.data.settlementDate,
    p_settlement_rate: parsed.data.settlementRate,
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
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

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
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

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
