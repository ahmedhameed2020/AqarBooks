# قائمة الملفات المرشحة للإصدار (مسودة للمراجعة — لا commit ولا push)

مصدرها `git status --short -uall` لحظة الإعداد + الملفات التي أُنشئت في هذه الخطوة. `??` = غير مُتتبَّع بعد (**كل ترحيلات المراحل 1–3 غير مُلتزَم بها في git الآن**)، `M` = معدَّل. لا أُدرج شيئًا في commit قبل اعتمادك للقائمة.

## قاعدة التقسيم
كل مجموعة تُلتزم في commit مستقل بترتيب يسمح بالتراجع عن مجموعة دون أخرى. تفاصيل ما استُبعد وسببه في الجزء الأخير.

| المجموعة | عدد الملفات | ملاحظة |
|---|---|---|
| A1 ترحيلات قاعدة البيانات | 27 | 20261009120000 → 20261018100000؛ مثبّتة بالحجم والبصمة في `tests/migration-directory-guard.test.ts` |
| A2 كود التطبيق | 79 | صفحات مالية وبوابة المالك وإجراءات خادمية ومكتبات |
| A4 الاختبارات | 113 | تكافؤ RLS والعروض والسلف والإيداع وE2E |
| D1 وثائق المراحل | 15 | تقارير المراحل + خطة الإصدار |
| T1 أدوات الاختبار المحلي | 22 | `scripts/demo-local`، `package.json`، إعدادات Playwright/Vitest — لا تذهب لبيئة التشغيل |
| H1 معلّق بقرار | 10 | Fawry/الدفع الإلكتروني: تغيير سلوك منفصل |
| مستبعد | 754 | بيئة وأسرار محتملة وجوال وأدلة وحزم |

## A1 — ترحيلات قاعدة البيانات
```
??  supabase/migrations/20261009120000_phase1_financial_report_authz.sql
??  supabase/migrations/20261009130000_phase1_1_membership_roles_audit.sql
??  supabase/migrations/20261009140000_phase1_2_finance_read_permissions.sql
??  supabase/migrations/20261010120000_phase2_ledger_reversals_and_trial_balance_opening.sql
??  supabase/migrations/20261011100000_phase2b_receivable_account_setting.sql
??  supabase/migrations/20261011100100_phase2b_default_receivable_account_rpcs.sql
??  supabase/migrations/20261012100000_phase2c_bank_reconciliation_unhandled_lines.sql
??  supabase/migrations/20261013100000_phase2d_dues_require_open_period.sql
??  supabase/migrations/20261014100000_phase2e_bank_reconciliation_strict_upgrade.sql
??  supabase/migrations/20261015100000_phase2f_notifications_amenity_source_type.sql
??  supabase/migrations/20261015100100_phase2f_notifications_amenity_types.sql
??  supabase/migrations/20261015100200_phase2f_visitor_gate_scan_foreign_pass.sql
??  supabase/migrations/20261016100000_phase2g_owner_suspended_pass_denial.sql
??  supabase/migrations/20261017100000_phase3a_customer_advances_schema.sql
??  supabase/migrations/20261017100100_phase3b_customer_advances_functions.sql
??  supabase/migrations/20261017100200_phase3c_customer_advances_integrity.sql
??  supabase/migrations/20261017100300_phase3d_customer_advances_review2.sql
??  supabase/migrations/20261017100400_phase3e_customer_advances_trusted_backend.sql
??  supabase/migrations/20261017100500_phase3f_portal_statement_history.sql
??  supabase/migrations/20261017100600_phase3g_advance_account_configured.sql
??  supabase/migrations/20261017100700_phase3h_owner_statement_settlement.sql
??  supabase/migrations/20261017100800_phase3i_view_lateral_aggregates.sql
??  supabase/migrations/20261017100900_rls_set_based_permission_policies.sql
??  supabase/migrations/20261017101000_rls_admin_check_once.sql
??  supabase/migrations/20261017101100_rls_journal_entries_and_lines.sql
??  supabase/migrations/20261017101200_rls_fiscal_years.sql
??  supabase/migrations/20261018100000_deposit_account_cash_or_bank.sql
```

## A2 — كود التطبيق
ملاحظة: ملفات `app/[locale]/(app)/operations/**` و`portal/**` ترتبط بترحيلات 2f/2g/3f/3h (بوابة وبوابات الدخول)؛ إن قرّرتَ تجربة مالية فقط، تُفصل في commit خاص أو تُؤجَّل مع ترحيلاتها.
```
M  app/[locale]/(app)/account/page.tsx
M  app/[locale]/(app)/admin/resorts/page.tsx
M  app/[locale]/(app)/dashboard/insights-card.tsx
M  app/[locale]/(app)/dashboard/occupancy-widget.tsx
M  app/[locale]/(app)/dashboard/tenant-dashboard.tsx
??  app/[locale]/(app)/error.tsx
M  app/[locale]/(app)/finance/banks/banks-dialogs.tsx
M  app/[locale]/(app)/finance/banks/page.tsx
M  app/[locale]/(app)/finance/banks/reconciliation/[statementId]/page.tsx
M  app/[locale]/(app)/finance/banks/reconciliation/[statementId]/reconciliation-actions.tsx
M  app/[locale]/(app)/finance/cashier/cashier-dialogs.tsx
M  app/[locale]/(app)/finance/cashier/page.tsx
M  app/[locale]/(app)/finance/dues/dues-client.tsx
M  app/[locale]/(app)/finance/dues/dues-dialogs.tsx
M  app/[locale]/(app)/finance/dues/page.tsx
M  app/[locale]/(app)/finance/dunning/dunning-client.tsx
M  app/[locale]/(app)/finance/dunning/page.tsx
M  app/[locale]/(app)/finance/journals/new/journal-entry-form.tsx
M  app/[locale]/(app)/finance/journals/new/page.tsx
M  app/[locale]/(app)/finance/payments/page.tsx
??  app/[locale]/(app)/finance/payments/payment-credit-dialog.tsx
M  app/[locale]/(app)/finance/payments/payments-client.tsx
M  app/[locale]/(app)/finance/payments/payments-dialog.tsx
M  app/[locale]/(app)/finance/reports/aging/page.tsx
M  app/[locale]/(app)/finance/reports/audit-trail/page.tsx
M  app/[locale]/(app)/finance/reports/balance-sheet/balance-sheet-client.tsx
M  app/[locale]/(app)/finance/reports/balance-sheet/page.tsx
M  app/[locale]/(app)/finance/reports/cash-flow-forecast/page.tsx
M  app/[locale]/(app)/finance/reports/cash-flow/page.tsx
M  app/[locale]/(app)/finance/reports/owner-statement/owner-statement-client.tsx
M  app/[locale]/(app)/finance/reports/owner-statement/page.tsx
M  app/[locale]/(app)/finance/reports/trial-balance/page.tsx
M  app/[locale]/(app)/finance/reports/trial-balance/trial-balance-client.tsx
M  app/[locale]/(app)/layout.tsx
M  app/[locale]/(app)/members/[memberId]/page.tsx
M  app/[locale]/(app)/members/page.tsx
M  app/[locale]/(app)/operations/gate/gate-scanner-client.tsx
M  app/[locale]/(app)/operations/maintenance/[requestId]/page.tsx
M  app/[locale]/(app)/operations/maintenance/page.tsx
M  app/[locale]/(app)/operations/maintenance/work-orders/[workOrderId]/page.tsx
M  app/[locale]/(app)/property/[unitId]/page.tsx
M  app/[locale]/(app)/property/[unitId]/tab-financials.tsx
??  app/[locale]/(app)/property/[unitId]/unit-credit-card.tsx
M  app/[locale]/(app)/property/page.tsx
M  app/[locale]/(app)/property/payments-table.tsx
M  app/[locale]/portal/(member)/dues/page.tsx
??  app/[locale]/portal/(member)/error.tsx
M  app/[locale]/portal/(member)/maintenance/[requestId]/page.tsx
M  app/[locale]/portal/(member)/maintenance/new/page.tsx
M  app/[locale]/portal/(member)/maintenance/page.tsx
M  app/[locale]/portal/(member)/page.tsx
M  app/[locale]/portal/(member)/payments/page.tsx
M  app/[locale]/portal/(member)/payments/portal-print-receipt-button.tsx
M  app/[locale]/portal/(member)/profile/page.tsx
M  app/[locale]/portal/(member)/statement/page.tsx
M  app/[locale]/portal/(member)/statement/portal-statement-client.tsx
M  app/[locale]/portal/(member)/units/page.tsx
M  app/api/ai/journal-propose/route.ts
M  components/ai/journal-copilot-card.tsx
??  components/data-load-error.tsx
??  lib/actions/customer-advances.ts
M  lib/actions/member-portal-receipts.ts
M  lib/actions/receivables.ts
M  lib/actions/roles.ts
??  lib/ai/availability.ts
??  lib/dashboard/finance-visibility.ts
??  lib/finance/customer-advances.ts
??  lib/finance/deposit-accounts.ts
??  lib/finance/operation-key.ts
??  lib/finance/operation-submit.ts
??  lib/finance/payment-allocations.ts
??  lib/finance/use-operation-submit.ts
??  lib/portal/own-position.ts
??  lib/portal/statement-ledger.ts
??  lib/portal/statement-position.ts
M  lib/reports/account-statement-pdf.ts
M  lib/reports/payment-receipt-pdf.ts
??  lib/supabase/assert-read.ts
M  lib/supabase/types.ts
```

## A4 — الاختبارات
```
??  tests/advance-account-configured.integration.test.ts
??  tests/ai-journal-propose-route.test.ts
M  tests/amenity-bookings-rls.integration.test.ts
??  tests/assert-read.test.ts
??  tests/bank-reconciliation-upgrade.integration.test.ts
??  tests/client-guard-port1.test.ts
??  tests/client-target-guard.test.ts
??  tests/coa-cash-equivalent-audit.local-sql.test.ts
??  tests/customer-advances-actions.integration.test.ts
??  tests/customer-advances-actions.test.ts
??  tests/customer-advances-integrity.integration.test.ts
??  tests/customer-advances-review2.integration.test.ts
??  tests/customer-advances-review3.integration.test.ts
??  tests/customer-advances-schema.integration.test.ts
??  tests/customer-advances.integration.test.ts
??  tests/deposit-account-validation.integration.test.ts
??  tests/deposit-accounts.test.ts
??  tests/drift-verdict.test.ts
M  tests/dunning.integration.test.ts
??  tests/e2e/accounting-bank-reconciliation.spec.ts
??  tests/e2e/accounting-bank-unhandled-lines.spec.ts
??  tests/e2e/accounting-demo-defects.spec.ts
??  tests/e2e/accounting-duplicates.spec.ts
??  tests/e2e/accounting-issue-partial-success.spec.ts
??  tests/e2e/accounting-journey.spec.ts
??  tests/e2e/accounting-open-period-required.spec.ts
??  tests/e2e/accounting-receivable-default.spec.ts
??  tests/e2e/accounting-void-permission.spec.ts
??  tests/e2e/customer-advances-ui-screens.spec.ts
??  tests/e2e/customer-advances.spec.ts
??  tests/e2e/helpers/accounting-fixture.ts
??  tests/e2e/helpers/local-only.ts
??  tests/e2e/helpers/portal-fixture.ts
??  tests/e2e/helpers/portal-ui.ts
??  tests/e2e/negative-probes/client-url-attempt.spec.ts
M  tests/e2e/owner-portal-isolation.spec.ts
??  tests/e2e/page-error-states.spec.ts
??  tests/e2e/portal-journey.spec.ts
??  tests/e2e/portal-refusals.spec.ts
M  tests/e2e/portal-statement.spec.ts
??  tests/e2e/portal-visitor-gate-journey.spec.ts
??  tests/e2e/re-prior-year-boundary.spec.ts
??  tests/e2e/treasury-account-filter.spec.ts
??  tests/e2e/trial-balance-opening-db.spec.ts
M  tests/exchange-rates.integration.test.ts
M  tests/final-hardening-migration.test.ts
M  tests/final-hardening.integration.test.ts
??  tests/finance-functions-authz.integration.test.ts
??  tests/finance-read-permissions.integration.test.ts
??  tests/finance-report-authz.integration.test.ts
??  tests/financial-audit-actions.test.ts
??  tests/financial-audit-constraint.integration.test.ts
??  tests/financial-views-equivalence.integration.test.ts
M  tests/fx-difference.integration.test.ts
M  tests/gate-connectivity-rls.integration.test.ts
M  tests/gate-evidence-rls.integration.test.ts
M  tests/gate-final-contracts.integration.test.ts
M  tests/gate-hardware-outbox-migration.test.ts
M  tests/gate-notifications.integration.test.ts
M  tests/gate-operations-rls.integration.test.ts
M  tests/gate-rollout-fencing.integration.test.ts
M  tests/gate-supervision-rls.integration.test.ts
M  tests/helpers/gate-release.ts
??  tests/helpers/install-client-guard.ts
??  tests/helpers/isolated-target.ts
??  tests/helpers/legacy-financial-views.ts
??  tests/helpers/local-target.ts
??  tests/isolated-target-guard.test.ts
??  tests/isolated-target-negative-runs.test.ts
M  tests/lease-renewals-rls.integration.test.ts
??  tests/legacy-receipt-compat.integration.test.ts
??  tests/local-target-guard.test.ts
M  tests/maintenance-accounting-bridge.integration.test.ts
M  tests/maintenance-request-attachments-rls.integration.test.ts
M  tests/maintenance-request-core-rls.integration.test.ts
M  tests/member-opening-balance.integration.test.ts
??  tests/membership-status-access.integration.test.ts
M  tests/migration-directory-guard.test.ts
??  tests/negative-probes/client-url-attempt.test.ts
??  tests/negative-probes/write-attempt.test.ts
??  tests/notification-source-types.integration.test.ts
M  tests/onboarding.integration.test.ts
??  tests/operation-key.test.ts
??  tests/operation-submit.test.ts
M  tests/owner-portal-access.local-sql.test.ts
??  tests/owner-portal-functions-authz.integration.test.ts
??  tests/owner-statement-settlement.integration.test.ts
??  tests/page-read-guard.test.ts
??  tests/payment-allocation-readers-guard.test.ts
??  tests/payment-allocation-readers.integration.test.ts
M  tests/pgtap.integration.test.ts
M  tests/platform-tenant-authorization.test.ts
??  tests/playwright-client-guard.test.ts
??  tests/portal-statement-history.integration.test.ts
??  tests/portal-statement-ledger.test.ts
??  tests/portal-statement-position.test.ts
M  tests/project-wip.integration.test.ts
M  tests/purchasing-invoice-vat-wht.integration.test.ts
??  tests/receipt-methods-contract.test.ts
??  tests/revoked-function-matrix.integration.test.ts
??  tests/rls-fiscal-years-equivalence.integration.test.ts
??  tests/rls-journal-entry-lines-equivalence.integration.test.ts
??  tests/rls-set-based-policies-equivalence.integration.test.ts
??  tests/role-permissions-authz.integration.test.ts
??  tests/role-permissions-rollout.local-sql.test.ts
M  tests/security-function-grants.integration.test.ts
??  tests/setup/guarded-create-client.ts
??  tests/setup/local-only-guard.ts
??  tests/tenant-dashboard-access.test.tsx
??  tests/treasury-link-and-cheque.integration.test.ts
M  tests/unit-experience-rls.integration.test.ts
M  tests/visitor-passes-rls.integration.test.ts
M  tests/work-orders-rls.integration.test.ts
```

## D1 — وثائق
```
??  docs/audits/AqarBooks-Capability-Gap-Audit-2026-10-09.md
??  docs/audits/AqarBooks-vs-Daftra-Gap-Analysis-2026-10-11.md
??  docs/audits/Phase1-Financial-Report-Authz-Report-2026-10-09.md
??  docs/audits/Phase1.1-Roles-Membership-Audit-Report-2026-10-09.md
??  docs/audits/Phase1.2-Finance-Read-Permissions-Report-2026-10-10.md
??  docs/audits/Phase2-Accounting-Journey-Acceptance-Report-2026-10-10.md
??  docs/audits/Phase3-Customer-Advances-Closure-Report-2026-10-12.md
??  docs/audits/Portal-Demo-Scenario-2026-10-10.md
??  docs/audits/Portal-Maintenance-Gates-QR-Acceptance-Review-2026-10-10.md
??  docs/audits/release-plan/ENV-TESTS-PLAN.md
??  docs/audits/release-plan/G-ADV-1-ownership-transfer-procedure.md
??  docs/audits/release-plan/MIGRATION-SCOPE.md
??  docs/audits/release-plan/RELEASE-FILE-LIST.md
??  docs/audits/release-plan/VERIFICATION-SUMMARY.md
??  docs/audits/release-plan/production-readonly-checks.sql
```

## T1 — أدوات الاختبار المحلي (تُلتزم، لا تُنشر)
```
??  docs/runbooks/accounting-demo-local.md
??  docs/runbooks/role-permissions-signature-rollout.md
M  package.json
M  playwright.config.ts
??  scripts/demo-local/advances-baseline.mjs
??  scripts/demo-local/app.mjs
??  scripts/demo-local/build.mjs
??  scripts/demo-local/drift-verdict.mjs
??  scripts/demo-local/e2e.mjs
??  scripts/demo-local/fixtures/phase2c-superseded-explain-exception.sql
??  scripts/demo-local/hardware-stack.mjs
??  scripts/demo-local/lib.mjs
??  scripts/demo-local/make-review-bundle.mjs
??  scripts/demo-local/probe-auth-user.mjs
??  scripts/demo-local/run-vitest-local.mjs
??  scripts/demo-local/scan-bundle.mjs
??  scripts/demo-local/stack.mjs
??  scripts/demo-local/start-prod.mjs
??  scripts/demo-local/supabase/config.toml
??  scripts/demo-local/verify-review-bundle.mjs
??  scripts/local-db/run-sql-tests.mjs
M  vitest.config.ts
```

## H1 — معلّق: يغيّر سلوكًا خارج نطاق هذه التجربة
يعطّل بدء الدفع عبر Fawry على الخادم (`isFawryInitiationAllowed`) ويرافقه اقتراح SQL. هو جزء من مسار الجوال V1، **لا** من خطة التجربة المالية، ويؤثر على الدفع الإلكتروني. لا يدخل الإصدار إلا بقرار مستقل.
```
M  lib/actions/online-payment-checkout.ts
??  lib/payments/fawry-initiation-policy.ts
M  lib/payments/providers/fawry.ts
??  supabase/proposals/fawry_v1_initiation_denial.sql
M  tests/payments/fawry-adapter.test.ts
??  tests/payments/fawry-initiation.test.ts
??  tests/payments/fawry-v1-sql-proposal.test.ts
M  tests/payments/payment-provider-settings-reverify.test.ts
M  tests/payments/payment-provider-verification-race.test.ts
M  tests/payments/resolve-credentials.test.ts
```

## المستبعد وسببه
| المجموعة | العدد | السبب |
|---|---|---|
| X1 بيئة وأدوات | 10 | `.claude/**`، `.agents/**` (ملفات pyc)، `.mcp.json`، `opencode.json`، `supabase/.temp/cli-latest`: إعدادات محلية للأدوات وتحديث تلقائي للـCLI؛ لا علاقة لها بالمنتج |
| X2 تطبيق الجوال | 70 | مسار إصدار مستقل (Google Play)؛ يشمل صور وبيانات متجر وأدلة |
| X3 خطط داخلية | 2 | `docs/superpowers/**` أدوات تخطيط داخلية |
| X4 أدلة وحزم | 574 | حزم zip وصور شاشات وسجلات تشغيل ومجلدات الأدلة: كبيرة؛ تحفظ كأرشيف خارج المستودع أو في commit أدلة مستقل بقرار منك |
| X5 حادثة قاعدة التطوير | 2 | `Dev-DB-Accidental-Run-Inventory-2026-10-11.md` وملف JSON: لم أراجع حساسية محتواه؛ لا يُلتزم قبل مراجعته |

**فحص الأسرار:** مسحتُ ملفات A1/A2/A4/D1/T1 بحثًا عن JWT ومفاتيح sk/rk وAKIA ومفاتيح خاصة وروابط Postgres بكلمة مرور وإسنادات SECRET/API_KEY/PASSWORD الطويلة. **النتيجة:** 11 تطابقًا كلها كلمات مرور حسابات اختبار محلية داخل ملفات `tests/*-rls.integration.test.ts` و`final-hardening` و`owner-portal-access.local-sql` (قيم ثابتة لمستخدمين تُنشأ على الـstack المعزول فقط). لا مفاتيح خدمة ولا JWT ولا روابط قواعد بيانات. المسح بأنماط نصية وليس ضمانًا مطلقًا؛ يُعاد قبل أي commit فعلي.

**قبل أي commit:** (1) إعادة المسح، (2) `git diff --check`، (3) تحذيرات CRLF/LF ظهرت لعدة ملفات (`.mcp.json`، `route.ts`…) — يُقرَّر `.gitattributes` أو تُترك كما هي، (4) تشغيل الحزمة الكاملة على الـstack المعزول مرة أخيرة.

## تحديث 2026-10-16
أُضيف بعد التحقق من قواعد الربط: `banks/page.tsx` (تصفية حسابات الأستاذ للنقدية فقط)، `tests/treasury-link-and-cheque.integration.test.ts` (جديد)، وتعديل `tests/pgtap.integration.test.ts` (حساب الصندوق صار نقديًا). الترحيل `20261018100000` صار 10,729 بايت (يضيف مشغّلين على `cashboxes` و`bank_accounts` وشرط `is_cash_equivalent`). مجلد الأدلة `docs/audits/phase3-evidence/task11-deposit-account/` يُحسب ضمن X4.

تحديث 2026-10-16 (2): أُضيف `cashier-dialogs.tsx` و`banks-dialogs.tsx` (رسالة القائمة الفارغة وتعطيل الحفظ)، ومواصفة `treasury-account-filter.spec.ts`، وتعديل `onboarding.integration.test.ts`، ووثيقتا الخطة والملخص. `pgtap.integration.test.ts` عُدّل مرتين (حساب الصندوق + عقد الدفع الإلكتروني الحالي).

تحديث 2026-10-17: الترحيل `20261018100000` صار 12,701 بايت (مشغّل تدقيق علم النقدية)؛ أُضيف `coa-cash-equivalent-audit.local-sql.test.ts`، وعُدّل `final-hardening` (حارس العزل) و`role-permissions-rollout` (وصفة التخطي).

**تجميد 2026-10-17:** القوائم والأعداد أعلاه أُعيد توليدها من `git status` لحظة تجميد الحزمة (`release-final-bundle-2026-10-17.zip`)؛ الأعداد: A1 27, A2 79, A4 113, D1 15, T1 22, H1 10، مستبعد 754.
