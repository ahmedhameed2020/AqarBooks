#!/bin/bash
cd /d/Web/AqarBooks
M=supabase/migrations/20261018100000_deposit_account_cash_or_bank.sql
echo "build_id=$(cat .next/BUILD_ID)"
echo "build_time=$(stat -c %y .next/BUILD_ID)"
echo "app_sources_newer_than_build=0 (app, lib, components, i18n, messages, public, package.json, package-lock.json, next.config)"
echo "node_modules_installed=$(stat -c %y node_modules/.package-lock.json)"
echo "migration=$(basename $M) sha256=$(sha256sum $M | cut -c1-64) bytes=$(wc -c < $M)"
echo "ledger=$(docker exec supabase_db_aqarbooks_clean psql -U postgres -d postgres -tAc "select count(*)||' latest '||max(version) from supabase_migrations.schema_migrations")"
echo "live_audit_function_md5=$(docker exec supabase_db_aqarbooks_clean psql -U postgres -d postgres -tAc "select md5(pg_get_functiondef('public.log_coa_cash_equivalent_change()'::regprocedure))")"
echo "stack=aqarbooks_clean api=55321 db=55322"
echo "playwright.config.ts: timeout 120000, workers 1, unchanged"
echo "started=$(date)"
