import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migration = readFileSync(join(root, "supabase/migrations/20261001123000_final_hardening_sprint.sql"), "utf8");
const read = (relativePath: string) => readFileSync(join(root, relativePath), "utf8");

describe("Final Hardening Sprint migration", () => {
  it("filters trial balance lines by POSTED status and inclusive date range", () => {
    expect(migration).toMatch(/je\.status = 'POSTED'/);
    expect(migration).toMatch(/je\.entry_date BETWEEN p_start_date AND p_end_date/);
    expect(migration).toMatch(/AND EXISTS \(\s*SELECT 1\s*FROM public\.journal_entries je/s);

    const fixture = [
      { status: "DRAFT", date: "2026-01-10", amount: 50 },
      { status: "POSTED", date: "2025-12-31", amount: 70 },
      { status: "POSTED", date: "2026-01-15", amount: 100 },
    ];
    const total = fixture
      .filter((entry) => entry.status === "POSTED" && entry.date >= "2026-01-01" && entry.date <= "2026-01-31")
      .reduce((sum, entry) => sum + entry.amount, 0);
    expect(total).toBe(100);
  });

  it("makes payment reversal auditable, linked, and double-reversal safe", () => {
    expect(migration).toContain("'PAYMENT_REVERSED'");
    expect(migration).toContain("reversal_journal_entry_id");
    expect(migration).toContain("PAYMENT_JOURNAL_ENTRY_MISSING");
    expect(migration).toContain("ALREADY_REVERSED");
    expect(migration).toContain("reversed_entry_id = v_original.id");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.void_payment");
  });

  it("enforces tenant permission and isolation for audit-chain verification", () => {
    expect(migration).toContain("public.has_permission(auth.uid(), p_organization_id, 'finance.audit.read')");
    expect(migration).toContain("SET search_path TO 'public'");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.verify_financial_audit_chain(uuid) FROM PUBLIC, anon");
  });

  it("uses a transactional role-permission replacement and ownership trigger", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.replace_role_permissions_atomic");
    expect(migration).toContain("DELETE FROM public.role_permissions WHERE role_id = p_role_id");
    expect(migration).toContain("INSERT INTO public.role_permissions(role_id, permission_id)");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.enforce_unit_ownership_total");
    expect(migration).toContain("v_total + NEW.share_percentage > 100");
  });

  it("keeps dunning form names and values aligned with the delivery action", () => {
    const form = read("app/[locale]/(app)/finance/dunning/dunning-forms.tsx");
    const action = read("lib/actions/dunning.ts");
    const client = read("app/[locale]/(app)/finance/dunning/dunning-client.tsx");
    expect(form).toContain('name="channel"');
    expect(form).toContain('name="reference"');
    for (const channel of ["PRINTED", "HAND_DELIVERED", "PHONE", "EMAIL_EXTERNAL", "WHATSAPP_EXTERNAL", "POST"]) {
      expect(form).toContain(`value="${channel}"`);
      expect(action).toContain(`"${channel}"`);
    }
    expect(form).not.toContain("deliveryChannel");
    expect(form).not.toContain("deliveryNotes");
    expect(form).toContain('value="PHONE">{isAr ? "هاتف" : "Phone"}');
    expect(form).not.toContain("SMS");
    expect(form).toContain("raised_on");
    expect(client).toContain("raised_on");
    expect(client).not.toContain("raised_at");
  });

  it("keeps report member phone mappings on the actual phone column", () => {
    const owner = read("app/[locale]/(app)/finance/reports/owner-statement/page.tsx");
    const rentRoll = read("app/[locale]/(app)/finance/reports/rent-roll/page.tsx");
    expect(owner).toContain("members(id, full_name, phone, email)");
    expect(owner).toContain("phone: mem.phone");
    expect(rentRoll).toContain("members(id, full_name, phone)");
    expect(rentRoll).toContain("tenant?.phone");
    expect(owner).not.toContain("phone_number");
    expect(rentRoll).not.toContain("phone_number");
  });

  it("contains creation methods and AI governance to the MVP contract", () => {
    const receivables = read("lib/actions/receivables.ts");
    const dialog = read("app/[locale]/(app)/finance/payments/payments-dialog.tsx");
    const paymentsPage = read("app/[locale]/(app)/finance/payments/page.tsx");
    const ai = read("app/[locale]/(app)/admin/ai-governance/ai-governance-client.tsx");
    expect(receivables).toContain('method: z.enum(["CASH", "CHEQUE", "ONLINE"])');
    expect(receivables).not.toContain('method: z.enum(["CASH", "BANK_TRANSFER"');
    expect(dialog).not.toContain("BANK_TRANSFER");
    expect(paymentsPage).not.toContain("Cash & POS");
    expect(paymentsPage).not.toContain("Cash & POS Receipts");
    expect(ai).toContain("Unavailable / Not operational in MVP");
    expect(ai).not.toContain("switchLogs");
    expect(ai).not.toContain("Instant runtime toggles");
    expect(ai).not.toContain("STATUS: ACTIVE");
    expect(ai).not.toContain("Evidence Volume");
  });
});
