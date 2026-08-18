/**
 * ضريبة المدخلات — نموذج الأهلية والاعتماد، قبل أي قيد.
 *
 * الترتيب مقصود ومعتمد: تُصمَّم الأهلية أولًا ثم تُبنى القيود عليها. فما يُختبر
 * هنا هو **مَن يستحق الاسترداد ولماذا**، لا كيف يُرحَّل — الترحيل مرحلة تالية.
 *
 * ثلاث حالات لا اثنتان: قابل بالكامل، وغير قابل، **ومختلط** — والمختلط هو الذي
 * يُخطئ صامتًا: نسبة افتراضية تبدو معقولة تسترد ضريبة لا يجوز استردادها. فلا
 * نسبة بلا منهج، ولا منهج بلا فترة.
 *
 * ويُختبر أيضًا ما كشفته البيانات: **صفر من 14 موردًا يحمل رقمًا ضريبيًا**، فحاجز
 * «لا استرداد بلا رقم تسجيل» ليس نظريًا بل هو الحالة السائدة اليوم.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import type { Database } from "../lib/supabase/types";

loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const PASSWORD = "E2E_Test_P@ssw0rd_2026!";

const admin = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });

const createdOrgIds: string[] = [];
const createdUserIds: string[] = [];

let orgId: string;
let owner: { userId: string; client: ReturnType<typeof createClient<Database>> };
let payableId: string;
let propertyId: string;
let vatAccountId: string;
let accFull: string;
let accNone: string;
let accMixed: string;
let supplierWithTaxId: string;
let supplierNoTaxId: string;

async function makeAccount(code: string, nameAr: string, category: string, balance: string) {
  const { data, error } = await admin.from("chart_of_accounts").insert({
    organization_id: orgId, code, name_ar: nameAr, name_en: code,
    category, normal_balance: balance,
  } as never).select("id").single();
  expect(error, `account ${code} failed: ${error?.message}`).toBeNull();
  return data!.id as string;
}

async function makeInvoice(opts: {
  supplierId: string; expenseAccountId: string; net: number; vat: number;
  invoiceNumber?: string;
}) {
  const { data, error } = await admin.from("supplier_invoices").insert({
    organization_id: orgId,
    property_id: propertyId,
    supplier_id: opts.supplierId,
    expense_account_id: opts.expenseAccountId,
    payable_account_id: payableId,
    invoice_number: opts.invoiceNumber ?? `INV-${Date.now()}-${Math.random()}`,
    net_amount: opts.net,
    vat_amount: opts.vat,
    vat_rate: opts.net > 0 ? (opts.vat / opts.net) * 100 : 0,
    amount: opts.net + opts.vat,
    invoice_date: "2026-06-01",
    due_date: "2026-07-01",
    status: "POSTED",
  } as never).select("id").single();
  expect(error, `invoice failed: ${error?.message}`).toBeNull();
  return data!.id as string;
}

async function declare(accountId: string, recoverability: string, extra: Record<string, unknown> = {}) {
  const { data: id, error } = await owner.client.rpc("set_expense_account_input_tax", {
    p_expense_account_id: accountId,
    p_recoverability: recoverability,
    ...extra,
  } as never);
  return { id: id as unknown as string | null, error };
}

async function approve(id: string) {
  const { error } = await owner.client.rpc("approve_expense_account_input_tax", { p_id: id });
  expect(error, `approve failed: ${error?.message}`).toBeNull();
}

beforeAll(async () => {
  const { data: org, error } = await admin.from("organizations").insert({
    name: `E2E InputTax ${Date.now()}`, slug: `e2e-inputtax-${Date.now()}`,
    default_currency: "EGP", status: "ACTIVE",
    tax_id: "100-INPUT-001", tax_jurisdiction: "EG",
  } as never).select("id").single();
  expect(error, `org insert failed: ${error?.message}`).toBeNull();
  orgId = org!.id as string;
  createdOrgIds.push(orgId);

  await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });

  const { data: property } = await admin.from("properties").insert({
    organization_id: orgId, name: "InputTax P", code: `E2E-IT-${Date.now()}`,
    timezone: "Africa/Cairo", property_type: "building",
  } as never).select("id").single();
  propertyId = property!.id as string;

  payableId = await makeAccount("2100", "ذمم موردين", "LIABILITY", "CREDIT");
  vatAccountId = await makeAccount("1140", "ضريبة مدخلات قابلة للاسترداد", "ASSET", "DEBIT");
  accFull = await makeAccount("5100", "مصروف قابل بالكامل", "EXPENSE", "DEBIT");
  accNone = await makeAccount("5200", "مصروف غير قابل", "EXPENSE", "DEBIT");
  accMixed = await makeAccount("5300", "مصروف مختلط", "EXPENSE", "DEBIT");

  const { data: s1 } = await admin.from("suppliers").insert({
    organization_id: orgId, name: "مورد برقم ضريبي",
    payable_account_id: payableId, tax_number: "TRN-SUP-001", is_active: true,
  } as never).select("id").single();
  supplierWithTaxId = s1!.id as string;

  const { data: s2 } = await admin.from("suppliers").insert({
    organization_id: orgId, name: "مورد بلا رقم ضريبي",
    payable_account_id: payableId, is_active: true,
  } as never).select("id").single();
  supplierNoTaxId = s2!.id as string;

  const email = `e2e-inputtax-${Date.now()}@aqarbooks-test.local`;
  const { data: created } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
  });
  createdUserIds.push(created!.user!.id);
  await admin.from("organization_memberships")
    .insert({ organization_id: orgId, user_id: created!.user!.id, status: "active" });
  const { data: role } = await admin.from("roles")
    .select("id").eq("organization_id", orgId).eq("key", "TENANT_OWNER").single();
  await admin.from("user_role_assignments")
    .insert({ user_id: created!.user!.id, role_id: role!.id, organization_id: orgId });

  const client = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  expect(signInErr, `sign-in failed: ${signInErr?.message}`).toBeNull();
  owner = { userId: created!.user!.id, client };
}, 180_000);

afterAll(async () => {
  const failures: string[] = [];
  for (const id of createdOrgIds) {
    await admin.from("input_tax_decisions").delete().eq("organization_id", id);
    await admin.from("expense_account_input_tax").delete().eq("organization_id", id);
    await admin.from("supplier_invoices").delete().eq("organization_id", id);
    await admin.from("suppliers").delete().eq("organization_id", id);
    await admin.from("properties").delete().eq("organization_id", id);
    await admin.from("platform_audit_logs").delete().eq("organization_id", id);
    await admin.from("chart_of_accounts")
      .update({ is_used: false } as never).eq("organization_id", id);
    await admin.from("chart_of_accounts").delete().eq("organization_id", id);
    const { error } = await admin.from("organizations").delete().eq("id", id);
    if (error) failures.push(`org ${id}: ${error.message}`);
  }
  for (const userId of createdUserIds) await admin.auth.admin.deleteUser(userId);
  expect(failures, `teardown left state behind: ${failures.join(" | ")}`).toEqual([]);
}, 180_000);

describe("أهلية ضريبة المدخلات", () => {
  it("المختلط بلا نسبة أو منهج أو فترة مرفوض — الإعلان نية لا وثيقة", async () => {
    const noRatio = await declare(accMixed, "MIXED");
    expect(noRatio.error!.message).toMatch(/MIXED_USE_RATIO_MISSING/);

    const noMethod = await declare(accMixed, "MIXED", { p_recoverable_ratio: 0.6 });
    expect(noMethod.error!.message).toMatch(/MIXED_USE_METHOD_MISSING/);

    const noPeriod = await declare(accMixed, "MIXED", {
      p_recoverable_ratio: 0.6, p_ratio_method: "نسبة الإيراد الخاضع",
    });
    expect(noPeriod.error!.message).toMatch(/MIXED_USE_PERIOD_MISSING/);
  });

  it("لا استرداد بلا إعلان معتمد — ولا نسبة افتراضية تسدّ الفراغ", async () => {
    const invoice = await makeInvoice({
      supplierId: supplierWithTaxId, expenseAccountId: accFull, net: 1000, vat: 140,
    });

    const undeclared = await owner.client.rpc("record_input_tax_decision", { p_invoice_id: invoice });
    expect(undeclared.error!.message).toMatch(/INPUT_TAX_RECOVERABILITY_UNDECLARED/);

    // والإعلان غير المعتمد يظل حاجبًا: الحفظ ليس اعتمادًا.
    const decl = await declare(accFull, "FULLY_RECOVERABLE");
    expect(decl.error, `declare failed: ${decl.error?.message}`).toBeNull();

    const unapproved = await owner.client.rpc("record_input_tax_decision", { p_invoice_id: invoice });
    expect(unapproved.error!.message).toMatch(/INPUT_TAX_RECOVERABILITY_UNDECLARED/);

    await approve(decl.id!);
  });

  it("قابل بالكامل: الضريبة كلها أصل قابل للاسترداد", async () => {
    const invoice = await makeInvoice({
      supplierId: supplierWithTaxId, expenseAccountId: accFull, net: 1000, vat: 140,
    });
    const { data: id, error } = await owner.client.rpc("record_input_tax_decision", {
      p_invoice_id: invoice,
    });
    expect(error, `record failed: ${error?.message}`).toBeNull();

    const { data: d } = await admin.from("input_tax_decisions")
      .select("recoverability, recoverable_ratio, recoverable_amount, non_recoverable_amount, tax_amount, taxable_base, gross_amount, input_tax_account_id")
      .eq("id", id as unknown as string).single();

    expect(d!.recoverability).toBe("FULLY_RECOVERABLE");
    expect(Number(d!.recoverable_amount)).toBe(140);
    expect(Number(d!.non_recoverable_amount)).toBe(0);
    expect(Number(d!.taxable_base)).toBe(1000);
    expect(Number(d!.gross_amount)).toBe(1140);
    // الأصل يُختم على الحساب المحلول، لا يُترك ليُحلّ وقت الترحيل.
    expect(d!.input_tax_account_id).toBe(vatAccountId);
  });

  it("غير قابل: لا أصل ضريبة مدخلات أصلًا، ولا يشترط رقم المورد", async () => {
    const decl = await declare(accNone, "NON_RECOVERABLE");
    await approve(decl.id!);

    // مورد بلا رقم ضريبي: لا مطالبة هنا أصلًا، فلا حاجة إلى رقمه.
    const invoice = await makeInvoice({
      supplierId: supplierNoTaxId, expenseAccountId: accNone, net: 500, vat: 70,
    });
    const { data: id, error } = await owner.client.rpc("record_input_tax_decision", {
      p_invoice_id: invoice,
    });
    expect(error, `record failed: ${error?.message}`).toBeNull();

    const { data: d } = await admin.from("input_tax_decisions")
      .select("recoverable_amount, non_recoverable_amount, input_tax_account_id")
      .eq("id", id as unknown as string).single();
    expect(Number(d!.recoverable_amount)).toBe(0);
    expect(Number(d!.non_recoverable_amount)).toBe(70);
    expect(d!.input_tax_account_id, "لا أصل بلا جزء قابل").toBeNull();
  });

  it("مختلط: النسبة تُطبَّق، والباقي يُشتق طرحًا فلا يضيع فلس", async () => {
    const decl = await declare(accMixed, "MIXED", {
      p_recoverable_ratio: 0.6,
      p_ratio_method: "نسبة الإيراد الخاضع إلى الإجمالي",
      p_ratio_period: "2026",
      p_ratio_reference: "ورقة عمل التسوية السنوية 2026",
    });
    expect(decl.error, `declare failed: ${decl.error?.message}`).toBeNull();
    await approve(decl.id!);

    // 333.33 × 0.6 = 199.998 ⇒ 200.00 بخانتين، والباقي 133.33 طرحًا.
    const invoice = await makeInvoice({
      supplierId: supplierWithTaxId, expenseAccountId: accMixed, net: 2380.93, vat: 333.33,
    });
    const { data: id, error } = await owner.client.rpc("record_input_tax_decision", {
      p_invoice_id: invoice,
    });
    expect(error, `record failed: ${error?.message}`).toBeNull();

    const { data: d } = await admin.from("input_tax_decisions")
      .select("recoverable_ratio, recoverable_amount, non_recoverable_amount, tax_amount, decision_snapshot")
      .eq("id", id as unknown as string).single();

    expect(Number(d!.recoverable_ratio)).toBe(0.6);
    expect(Number(d!.recoverable_amount)).toBe(200);
    expect(Number(d!.non_recoverable_amount)).toBe(133.33);
    // الجزآن يستوعبان الضريبة كاملةً — والقيد في القاعدة يفرضه بدقة numeric.
    // المقارنة هنا بالقروش لأن جمع 200 + 133.33 في JS يعطي 333.33000000000004،
    // وهو حدّ عائم في لغة الاختبار لا فرق في البيانات.
    expect(
      Math.round(Number(d!.recoverable_amount) * 100)
        + Math.round(Number(d!.non_recoverable_amount) * 100),
    ).toBe(Math.round(Number(d!.tax_amount) * 100));

    const snap = d!.decision_snapshot as Record<string, unknown>;
    // المنهج والفترة والمرجع مختومة مع القرار: نسبة بلا منهج لا تُراجَع لاحقًا.
    expect(snap.ratio_method).toBe("نسبة الإيراد الخاضع إلى الإجمالي");
    expect(snap.ratio_period).toBe("2026");
    expect(snap.ratio_reference).toBe("ورقة عمل التسوية السنوية 2026");
  });

  it("لا استرداد بلا رقم تسجيل للمورد", async () => {
    const invoice = await makeInvoice({
      supplierId: supplierNoTaxId, expenseAccountId: accFull, net: 1000, vat: 140,
    });
    const { error } = await owner.client.rpc("record_input_tax_decision", { p_invoice_id: invoice });
    expect(error, "الاسترداد يستلزم مورّدًا مسجَّلًا").not.toBeNull();
    expect(error!.message).toMatch(/SUPPLIER_TAX_ID_MISSING/);
  });

  it("لا مطالبة بلا فاتورة صالحة برقم", async () => {
    // العمود `invoice_number` غير قابل للعدم في القاعدة، فالحالة الممكنة فعلًا
    // هي نص فارغ لا عدم — والحارس يفحص `btrim` لا `is null` وحده لهذا السبب.
    const invoice = await makeInvoice({
      supplierId: supplierWithTaxId, expenseAccountId: accFull, net: 1000, vat: 140,
      invoiceNumber: "   ",
    });
    const { error } = await owner.client.rpc("record_input_tax_decision", { p_invoice_id: invoice });
    expect(error!.message).toMatch(/SUPPLIER_INVOICE_MISSING/);
  });

  it("فاتورة بلا ضريبة ليست محل قرار", async () => {
    const invoice = await makeInvoice({
      supplierId: supplierWithTaxId, expenseAccountId: accFull, net: 1000, vat: 0,
    });
    const { error } = await owner.client.rpc("record_input_tax_decision", { p_invoice_id: invoice });
    expect(error!.message).toMatch(/INPUT_TAX_NOT_ELIGIBLE/);
  });

  it("تكرار الاستدعاء يعيد القرار نفسه، والقرار لا يُعدَّل", async () => {
    const invoice = await makeInvoice({
      supplierId: supplierWithTaxId, expenseAccountId: accFull, net: 200, vat: 28,
    });
    const first = await owner.client.rpc("record_input_tax_decision", { p_invoice_id: invoice });
    const second = await owner.client.rpc("record_input_tax_decision", { p_invoice_id: invoice });
    expect(second.error, "إعادة المحاولة لا تنفجر").toBeNull();
    expect(second.data).toBe(first.data);

    const { error: editErr } = await admin.from("input_tax_decisions")
      .update({ recoverable_amount: 999 } as never)
      .eq("id", first.data as unknown as string);
    expect(editErr, "القرار المسجَّل لا يُعدَّل").not.toBeNull();
    expect(editErr!.message).toMatch(/INPUT_TAX_DECISION_IMMUTABLE/);
  });

  it("تغيير الإعلان يُلغي اعتماده، ولا يحرّك قرارًا مختومًا", async () => {
    const { data: before } = await admin.from("input_tax_decisions")
      .select("id, recoverable_amount").eq("expense_account_id", accFull)
      .order("decided_at", { ascending: true }).limit(1).single();

    const changed = await declare(accFull, "NON_RECOVERABLE");
    expect(changed.error, `redeclare failed: ${changed.error?.message}`).toBeNull();

    const { data: decl } = await admin.from("expense_account_input_tax")
      .select("status, approved_at").eq("expense_account_id", accFull).single();
    expect(decl!.status, "تغيير قابلية الخصم قرار لا إعداد").toBe("REVIEW_REQUIRED");
    expect(decl!.approved_at).toBeNull();

    const { data: after } = await admin.from("input_tax_decisions")
      .select("recoverable_amount").eq("id", before!.id).single();
    expect(Number(after!.recoverable_amount)).toBe(Number(before!.recoverable_amount));
  });

  it("الجاهزية تُبلغ عن النواقص كلها بأسمائها", async () => {
    const { data: gaps, error } = await owner.client.rpc("check_input_tax_readiness", {
      p_organization_id: orgId,
    });
    expect(error, `readiness failed: ${error?.message}`).toBeNull();
    const codes = new Set((gaps as unknown as { gap_code: string }[]).map((g) => g.gap_code));

    // حساب المصروف القابل صار إعلانه غير معتمد بعد تغييره في الاختبار السابق.
    expect(codes).toContain("INPUT_TAX_RECOVERABILITY_UNDECLARED");
    expect(codes).toContain("SUPPLIER_TAX_ID_MISSING");
    expect(codes).toContain("SUPPLIER_INVOICE_MISSING");
  });

  it("حساب ضريبة المدخلات لا يكون حساب المخرجات نفسه", async () => {
    const outputAccount = await makeAccount("2300", "ضريبة مخرجات", "LIABILITY", "CREDIT");
    const { error: setOut } = await owner.client.rpc("set_output_tax_account", {
      p_organization_id: orgId, p_account_id: outputAccount,
    });
    expect(setOut, `set output failed: ${setOut?.message}`).toBeNull();

    // التزام لا أصل: مرفوض بفئته قبل أن يُقارن بشيء.
    const { error } = await owner.client.rpc("set_input_tax_account", {
      p_organization_id: orgId, p_account_id: outputAccount,
    });
    expect(error, "أصل والتزام في حساب واحد يُخفي الرصيدين").not.toBeNull();
    expect(error!.message).toMatch(/INPUT_TAX_ACCOUNT_INVALID|INPUT_TAX_ACCOUNT_CONFLICT/);
  });
});
