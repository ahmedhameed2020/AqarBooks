#!/bin/bash
# The affected test files that none of the earlier lists ran (see missing-test-list.txt): one vitest process per file, strictly sequential, first run only.
cd /d/Web/AqarBooks
D=docs/audits/phase3-evidence/task11-deposit-account
export LOCAL_PG_PORT=55322 PG_BIN="C:\Users\Lenovo\scoop\apps\postgresql\current\bin" PGPASSWORD=postgres
node scripts/demo-local/run-vitest-local.mjs $(cat $D/missing-test-list.txt | tr '\n' ' ') --each > $D/missing-vitest-each.log 2>&1
echo "done-exit=$?" >> $D/missing-vitest-each.log
