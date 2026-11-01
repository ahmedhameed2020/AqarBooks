#!/bin/bash
cd /d/Web/AqarBooks
D=docs/audits/phase3-evidence/task11-deposit-account/final-playwright
: > $D/summary.txt
for s in accounting-journey accounting-duplicates accounting-void-permission customer-advances customer-advances-ui-screens portal-statement page-error-states treasury-account-filter; do
  echo "=== $s $(date +%H:%M:%S)" >> $D/summary.txt
  node scripts/demo-local/e2e.mjs tests/e2e/$s.spec.ts --reporter=line --workers=1 > $D/$s.log 2>&1
  echo "exit $? ; $(grep -E '^\s+[0-9]+ (passed|failed|skipped|did not run|flaky)' $D/$s.log | tr -s ' ' | tr '\n' ';')" >> $D/summary.txt
done
echo ALL-DONE >> $D/summary.txt
