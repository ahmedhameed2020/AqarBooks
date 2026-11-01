#!/bin/bash
# ONE sequential run of everything affected on the FINAL state (both RLS migrations applied). No reruns; each result goes to the summary as it comes.
# The 40 formerly skipped tests (owner-portal-access.local-sql) run with the ISOLATED stack's DB port (55322; the dev DB is 54322 and is never used).
cd /d/Web/AqarBooks
D=docs/audits/phase3-evidence/task10-rls/final-run-final
: > $D/summary.txt
echo "=== vitest (one invocation) $(date +%H:%M:%S)" >> $D/summary.txt
export LOCAL_PG_PORT=55322 PG_BIN="C:\Users\Lenovo\scoop\apps\postgresql\current\bin" PGPASSWORD=postgres
node scripts/demo-local/run-vitest-local.mjs tests/assert-read.test.ts tests/customer-advances-schema.integration.test.ts tests/financial-views-equivalence.integration.test.ts tests/helpers/legacy-financial-views.ts tests/member-opening-balance.integration.test.ts tests/membership-status-access.integration.test.ts tests/migration-directory-guard.test.ts tests/page-read-guard.test.ts tests/payment-allocation-readers.integration.test.ts tests/tenant-dashboard-access.test.tsx  tests/customer-advances-actions.test.ts tests/customer-advances-actions.integration.test.ts tests/customer-advances-integrity.integration.test.ts tests/customer-advances-review2.integration.test.ts tests/customer-advances-review3.integration.test.ts tests/customer-advances.integration.test.ts tests/customer-advances-schema.integration.test.ts tests/advance-account-configured.integration.test.ts tests/owner-statement-settlement.integration.test.ts tests/portal-statement-history.integration.test.ts tests/member-opening-balance.integration.test.ts tests/membership-status-access.integration.test.ts tests/owner-portal-functions-authz.integration.test.ts tests/owner-portal-access.local-sql.test.ts tests/page-read-guard.test.ts tests/assert-read.test.ts tests/security-function-grants.integration.test.ts tests/migration-directory-guard.test.ts tests/financial-views-equivalence.integration.test.ts tests/rls-set-based-policies-equivalence.integration.test.ts tests/rls-journal-entry-lines-equivalence.integration.test.ts tests/drift-verdict.test.ts tests/deposit-accounts.test.ts > $D/vitest.log 2>&1
echo "exit $? ; $(grep -E 'Test Files|Tests ' $D/vitest.log | sed 's/\x1b\[[0-9;]*m//g' | tr -s ' ' | tr '\n' ';')" >> $D/summary.txt
unset LOCAL_PG_PORT PG_BIN PGPASSWORD
for s in page-error-states owner-portal-isolation portal-refusals accounting-duplicates accounting-journey portal-journey portal-statement customer-advances customer-advances-ui-screens; do
  echo "=== $s $(date +%H:%M:%S)" >> $D/summary.txt
  node scripts/demo-local/e2e.mjs tests/e2e/$s.spec.ts --reporter=line --workers=1 > $D/$s.log 2>&1
  echo "exit $? ; $(grep -E '^\s+[0-9]+ (passed|failed|skipped|did not run|flaky)' $D/$s.log | tr -s ' ' | tr '\n' ';')" >> $D/summary.txt
done
echo ALL-DONE >> $D/summary.txt
