#!/bin/bash
# FINAL sequential run after the last change: (1) Vitest strictly file by file, (2) Playwright spec by spec, (3) schema verify with catalog capture. First results only; no timeout is changed.
cd /d/Web/AqarBooks
D=docs/audits/phase3-evidence/task10-rls/final-run-closure
: > $D/summary.txt
echo "=== vitest --each (one vitest process per file) $(date +%H:%M:%S)" >> $D/summary.txt
export LOCAL_PG_PORT=55322 PG_BIN="C:\Users\Lenovo\scoop\apps\postgresql\current\bin" PGPASSWORD=postgres
node scripts/demo-local/run-vitest-local.mjs tests/advance-account-configured.integration.test.ts tests/assert-read.test.ts tests/customer-advances-actions.integration.test.ts tests/customer-advances-actions.test.ts tests/customer-advances-integrity.integration.test.ts tests/customer-advances-review2.integration.test.ts tests/customer-advances-review3.integration.test.ts tests/customer-advances-schema.integration.test.ts tests/customer-advances.integration.test.ts tests/deposit-accounts.test.ts tests/drift-verdict.test.ts tests/financial-views-equivalence.integration.test.ts tests/member-opening-balance.integration.test.ts tests/membership-status-access.integration.test.ts tests/migration-directory-guard.test.ts tests/owner-portal-access.local-sql.test.ts tests/owner-portal-functions-authz.integration.test.ts tests/owner-statement-settlement.integration.test.ts tests/page-read-guard.test.ts tests/payment-allocation-readers.integration.test.ts tests/portal-statement-history.integration.test.ts tests/rls-fiscal-years-equivalence.integration.test.ts tests/rls-journal-entry-lines-equivalence.integration.test.ts tests/rls-set-based-policies-equivalence.integration.test.ts tests/security-function-grants.integration.test.ts tests/tenant-dashboard-access.test.tsx  --each > $D/vitest-each.log 2>&1
echo "exit $?" >> $D/summary.txt
unset LOCAL_PG_PORT PG_BIN PGPASSWORD
for s in page-error-states owner-portal-isolation portal-refusals accounting-duplicates accounting-journey portal-journey portal-statement customer-advances customer-advances-ui-screens; do
  echo "=== $s $(date +%H:%M:%S)" >> $D/summary.txt
  node scripts/demo-local/e2e.mjs tests/e2e/$s.spec.ts --reporter=line --workers=1 > $D/$s.log 2>&1
  echo "exit $? ; $(grep -E '^\s+[0-9]+ (passed|failed|skipped|did not run|flaky)' $D/$s.log | tr -s ' ' | tr '\n' ';')" >> $D/summary.txt
done
echo "=== schema verify with catalog capture $(date +%H:%M:%S)" >> $D/summary.txt
VERIFY_CAPTURE=1 VERIFY_OUT_DIR=/d/Web/AqarBooks/docs/audits/phase3-evidence/task10-rls/verify-outputs node scripts/demo-local/stack.mjs verify > $D/verify.txt 2>&1
echo "exit $?" >> $D/summary.txt
echo ALL-DONE >> $D/summary.txt
