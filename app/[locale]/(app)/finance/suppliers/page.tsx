import { setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { CreateSupplierForm } from "./supplier-forms";
import {
  CreateRequestForm,
  DecideRequestForm,
  CreateOrderForm,
  OrderActions,
} from "./request-order-forms";
import { PostInvoiceForm, RecordSupplierPaymentForm } from "./invoice-payment-forms";

export default async function SuppliersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const supabase = await createClient();
  const { data: resort } = await supabase
    .from("resorts")
    .select("id")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const [
    { data: suppliers },
    { data: accounts },
    { data: requests },
    { data: orders },
    { data: invoices },
    { data: periods },
    { data: paymentAllocations },
  ] = await Promise.all([
    supabase.from("suppliers").select("id, name").eq("organization_id", organization.id),
    supabase
      .from("chart_of_accounts")
      .select("id, code, name_ar, name_en, category")
      .eq("organization_id", organization.id)
      .eq("is_group", false),
    supabase
      .from("purchase_requests")
      .select("id, description, estimated_amount, status")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("purchase_orders")
      .select("id, order_number, description, amount, status, supplier_id")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("supplier_invoices")
      .select("id, invoice_number, amount, status, supplier_id, due_date")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("fiscal_periods")
      .select("id, name")
      .eq("organization_id", organization.id)
      .eq("status", "OPEN"),
    supabase.from("supplier_payment_allocations").select("invoice_id, amount"),
  ]);

  const supplierNameById = new Map((suppliers ?? []).map((s) => [s.id, s.name]));
  const liabilityAccounts = (accounts ?? []).filter((a) => a.category === "LIABILITY");
  const expenseAccounts = (accounts ?? []).filter((a) => a.category === "EXPENSE");
  const assetAccounts = (accounts ?? []).filter((a) => a.category === "ASSET");
  const approvedRequests = (requests ?? []).filter((r) => r.status === "APPROVED");

  const paidByInvoice = new Map<string, number>();
  for (const a of paymentAllocations ?? []) {
    paidByInvoice.set(a.invoice_id, (paidByInvoice.get(a.invoice_id) ?? 0) + a.amount);
  }
  const invoiceOptions = (invoices ?? [])
    .filter((i) => i.status !== "PAID" && i.status !== "CANCELLED")
    .map((i) => ({
      id: i.id,
      label: `${i.invoice_number} — ${supplierNameById.get(i.supplier_id) ?? ""}`,
      remaining: i.amount - (paidByInvoice.get(i.id) ?? 0),
    }));

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">{isAr ? "الموردون والمشتريات" : "Suppliers & Purchasing"}</h1>

      <section className="space-y-4">
        <h2 className="text-sm font-medium">{isAr ? "الموردون" : "Suppliers"}</h2>
        <CreateSupplierForm
          organizationId={organization.id}
          payableAccounts={liabilityAccounts.map((a) => ({ id: a.id, label: `${a.code} — ${isAr ? a.name_ar : a.name_en}` }))}
          locale={locale}
        />
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isAr ? "الاسم" : "Name"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers?.length ? (
                suppliers.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell className="text-center text-muted-foreground">
                    {isAr ? "لا يوجد موردون بعد" : "No suppliers yet"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      {resort && (
        <>
          <section className="space-y-4">
            <h2 className="text-sm font-medium">{isAr ? "طلبات الشراء" : "Purchase Requests"}</h2>
            <CreateRequestForm organizationId={organization.id} resortId={resort.id} locale={locale} />
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isAr ? "الوصف" : "Description"}</TableHead>
                    <TableHead>{isAr ? "المبلغ" : "Amount"}</TableHead>
                    <TableHead>{isAr ? "الحالة" : "Status"}</TableHead>
                    <TableHead>{isAr ? "إجراء" : "Action"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests?.length ? (
                    requests.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.description}</TableCell>
                        <TableCell>{r.estimated_amount.toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant={r.status === "APPROVED" ? "default" : r.status === "REJECTED" ? "destructive" : "secondary"}>
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {r.status === "SUBMITTED" && <DecideRequestForm requestId={r.id} locale={locale} />}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        {isAr ? "لا توجد طلبات بعد" : "No requests yet"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-medium">{isAr ? "أوامر الشراء" : "Purchase Orders"}</h2>
            <CreateOrderForm
              organizationId={organization.id}
              resortId={resort.id}
              suppliers={(suppliers ?? []).map((s) => ({ id: s.id, label: s.name }))}
              approvedRequests={approvedRequests.map((r) => ({ id: r.id, label: r.description }))}
              locale={locale}
            />
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>{isAr ? "المورد" : "Supplier"}</TableHead>
                    <TableHead>{isAr ? "المبلغ" : "Amount"}</TableHead>
                    <TableHead>{isAr ? "الحالة" : "Status"}</TableHead>
                    <TableHead>{isAr ? "إجراء" : "Action"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders?.length ? (
                    orders.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell>{o.order_number ?? "—"}</TableCell>
                        <TableCell>{supplierNameById.get(o.supplier_id) ?? "—"}</TableCell>
                        <TableCell>{o.amount.toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant={o.status === "RECEIVED" ? "default" : "secondary"}>{o.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <OrderActions purchaseOrderId={o.id} status={o.status} locale={locale} />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        {isAr ? "لا توجد أوامر شراء بعد" : "No purchase orders yet"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-medium">{isAr ? "فواتير الموردين" : "Supplier Invoices"}</h2>
            <PostInvoiceForm
              organizationId={organization.id}
              resortId={resort.id}
              suppliers={(suppliers ?? []).map((s) => ({ id: s.id, label: s.name }))}
              expenseAccounts={expenseAccounts.map((a) => ({ id: a.id, label: `${a.code} — ${isAr ? a.name_ar : a.name_en}` }))}
              liabilityAccounts={liabilityAccounts.map((a) => ({ id: a.id, label: `${a.code} — ${isAr ? a.name_ar : a.name_en}` }))}
              periods={(periods ?? []).map((p) => ({ id: p.id, label: p.name }))}
              locale={locale}
            />
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isAr ? "رقم الفاتورة" : "Invoice #"}</TableHead>
                    <TableHead>{isAr ? "المورد" : "Supplier"}</TableHead>
                    <TableHead>{isAr ? "المبلغ" : "Amount"}</TableHead>
                    <TableHead>{isAr ? "الاستحقاق" : "Due"}</TableHead>
                    <TableHead>{isAr ? "الحالة" : "Status"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices?.length ? (
                    invoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                        <TableCell>{supplierNameById.get(inv.supplier_id) ?? "—"}</TableCell>
                        <TableCell>{inv.amount.toFixed(2)}</TableCell>
                        <TableCell className="text-muted-foreground">{inv.due_date}</TableCell>
                        <TableCell>
                          <Badge variant={inv.status === "PAID" ? "default" : "secondary"}>{inv.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        {isAr ? "لا توجد فواتير بعد" : "No invoices yet"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-medium">{isAr ? "دفعات الموردين" : "Supplier Payments"}</h2>
            <RecordSupplierPaymentForm
              organizationId={organization.id}
              resortId={resort.id}
              suppliers={(suppliers ?? []).map((s) => ({ id: s.id, label: s.name }))}
              invoices={invoiceOptions}
              paymentAccounts={assetAccounts.map((a) => ({ id: a.id, label: `${a.code} — ${isAr ? a.name_ar : a.name_en}` }))}
              periods={(periods ?? []).map((p) => ({ id: p.id, label: p.name }))}
              locale={locale}
            />
          </section>
        </>
      )}
    </div>
  );
}
