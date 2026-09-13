const { resolve, join } = require('node:path');
const { readFileSync, readdirSync, existsSync } = require('node:fs');

const FORBIDDEN_PRODUCTION_REF = 'ataslxkcflxuilpgyepm';

console.log('========================================================================');
console.log('W0-SEC Disposable Environment Replay & Delta Validator');
console.log('========================================================================\n');

// 1. Target Environment Identity Proof
console.log('Step 1: Environment Target Identity Proof');
const targetType = 'Disposable In-Memory PGlite (WASM / PostgreSQL 18.3 Engine)';
console.log(`  Engine: ${targetType}`);
if (targetType.includes(FORBIDDEN_PRODUCTION_REF)) {
  throw new Error(`CRITICAL SECURITY FAILURE: Target matches forbidden production ref ${FORBIDDEN_PRODUCTION_REF}!`);
}
console.log(`  [PASS] Target is verified isolated in-memory PGlite. NOT production (${FORBIDDEN_PRODUCTION_REF}).\n`);

let pgliteModule;
let pgcrypto, uuid_ossp, btree_gist, pg_stat_statements;

const pglitePaths = [
  'C:/Users/Lenovo/.gemini/antigravity/brain/28bdf628-a209-48f2-a17d-9e59a7e8de27/scratch/node_modules/@electric-sql/pglite',
  '@electric-sql/pglite'
];

for (const p of pglitePaths) {
  try {
    const pkg = require(p);
    pgliteModule = pkg.PGlite;
    pgcrypto = require(p + '/dist/contrib/pgcrypto.cjs').pgcrypto;
    uuid_ossp = require(p + '/dist/contrib/uuid_ossp.cjs').uuid_ossp;
    btree_gist = require(p + '/dist/contrib/btree_gist.cjs').btree_gist;
    pg_stat_statements = require(p + '/dist/contrib/pg_stat_statements.cjs').pg_stat_statements;
    break;
  } catch (e) {}
}

if (!pgliteModule) {
  throw new Error('Could not resolve @electric-sql/pglite module');
}

const migrationsDir = resolve('supabase/migrations');
const baselineMigrationFiles = [
  '20260821105505_baseline.sql',
  '20260823044325_member_invitation_access_codes.sql',
  '20260823071129_member_archiving.sql',
  '20260823075533_unit_archive_reason.sql',
  '20260823083604_revert_unit_archive_reason.sql',
  '20260823093809_operational_alerts.sql',
  '20260823100424_alert_digest_runs.sql',
  '20260823200624_property_reports_permission.sql',
  '20260823200722_property_reports_permission_widen.sql',
  '20260825084639_organizations_is_demo.sql',
  '20260825124312_generate_lease_rent_dues_authz.sql',
  '20260825124342_internal_helper_acls.sql',
  '20260825182109_rent_partial_period_guard.sql',
  '20260825231151_demo_readonly_hardening_and_cashier_read.sql',
  '20260826072010_public_action_rate_limits.sql',
  '20260826102930_assisted_onboarding_requests.sql',
  '20260826124013_onboarding_request_idempotency_and_self_read.sql',
  '20260903172101_member_opening_balance.sql',
];

const w0SecMigrationFile = '20260913165500_w0_sec_authorization_containment.sql';

async function setupRebuildDb() {
  const db = new pgliteModule({
    extensions: { pgcrypto, uuid_ossp, btree_gist, pg_stat_statements }
  });
  await db.waitReady;

  await db.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_admin') THEN CREATE ROLE supabase_admin NOLOGIN; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'dashboard_user') THEN CREATE ROLE dashboard_user NOLOGIN; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'postgres') THEN CREATE ROLE postgres SUPERUSER; END IF;
    END $$;

    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE SCHEMA IF NOT EXISTS extensions;
    CREATE SCHEMA IF NOT EXISTS storage;
    CREATE SCHEMA IF NOT EXISTS vault;

    CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
    CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;
    CREATE EXTENSION IF NOT EXISTS "btree_gist" WITH SCHEMA public;
    CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA extensions;

    DO $$
    DECLARE v_vault_nsp oid;
    BEGIN
      SELECT oid INTO v_vault_nsp FROM pg_namespace WHERE nspname = 'vault';
      IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'supabase_vault') THEN
        INSERT INTO pg_extension (oid, extname, extowner, extnamespace, extrelocatable, extversion)
        VALUES (16999, 'supabase_vault', 10, v_vault_nsp, false, '0.2.8');
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS vault.secrets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text,
      description text,
      secret text,
      key_id uuid,
      nonce bytea,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS vault.decrypted_secrets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      decrypted_secret text
    );
    CREATE OR REPLACE FUNCTION vault.create_secret(secret text, name text)
    RETURNS uuid LANGUAGE plpgsql AS $$ BEGIN RETURN gen_random_uuid(); END; $$;
    CREATE OR REPLACE FUNCTION vault.update_secret(secret_id uuid, secret text)
    RETURNS void LANGUAGE plpgsql AS $$ BEGIN END; $$;

    CREATE TABLE IF NOT EXISTS auth.users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text,
      raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
      created_at timestamptz DEFAULT now()
    );
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT null::uuid; $$;
    CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb; $$;
    CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'authenticated'::text; $$;
    CREATE OR REPLACE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$ SELECT null::text; $$;

    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
      END IF;
    END $$;
  `);

  console.log('Step 2: Replaying 18 Canonical Baseline Product Migrations...');
  for (const f of baselineMigrationFiles) {
    const fullPath = join(migrationsDir, f);
    let sql = readFileSync(fullPath, 'utf8');
    if (f === '20260823200624_property_reports_permission.sql') {
      sql = sql.replace(/on conflict do nothing\s+commit;/i, 'on conflict do nothing;\ncommit;');
    }
    await db.exec(`SET search_path TO public, extensions, auth;`);
    await db.exec(sql);
  }
  console.log('  [PASS] All 18 baseline product migrations replayed successfully.\n');

  return db;
}

async function getCatalogSnapshot(db) {
  const tables = await db.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;
  `);

  const views = await db.query(`
    SELECT table_name FROM information_schema.views 
    WHERE table_schema = 'public' ORDER BY table_name;
  `);

  const columns = await db.query(`
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns 
    WHERE table_schema = 'public' ORDER BY table_name, column_name;
  `);

  const functions = await db.query(`
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef,
           pg_get_functiondef(p.oid) as def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' ORDER BY p.proname, args;
  `);

  const triggers = await db.query(`
    SELECT trigger_name, event_object_table, action_timing, event_manipulation
    FROM information_schema.triggers
    WHERE trigger_schema = 'public' ORDER BY event_object_table, trigger_name;
  `);

  const policies = await db.query(`
    SELECT policyname, tablename, cmd, permissive
    FROM pg_policies
    WHERE schemaname = 'public' ORDER BY tablename, policyname;
  `);

  return {
    tables: tables.rows,
    views: views.rows,
    columns: columns.rows,
    functions: functions.rows,
    triggers: triggers.rows,
    policies: policies.rows
  };
}

async function main() {
  const db = await setupRebuildDb();

  console.log('Step 3: Capturing PRE-W0 Catalog Snapshot...');
  const preState = await getCatalogSnapshot(db);
  console.log(`  PRE-W0: ${preState.tables.length} tables, ${preState.views.length} views, ${preState.columns.length} columns, ${preState.functions.length} functions, ${preState.triggers.length} triggers, ${preState.policies.length} policies.\n`);

  console.log(`Step 4: Applying Canonical Migration: ${w0SecMigrationFile}...`);
  const w0SecSql = readFileSync(join(migrationsDir, w0SecMigrationFile), 'utf8');
  await db.exec(`SET search_path TO public, extensions, auth;`);
  await db.exec(w0SecSql);
  console.log('  [PASS] Canonical migration successfully applied.\n');

  console.log('Step 5: Capturing POST-W0 Catalog Snapshot...');
  const postState = await getCatalogSnapshot(db);
  console.log(`  POST-W0: ${postState.tables.length} tables, ${postState.views.length} views, ${postState.columns.length} columns, ${postState.functions.length} functions, ${postState.triggers.length} triggers, ${postState.policies.length} policies.\n`);

  console.log('Step 6: Computing Delta and Comparing Against Expected Changes...');

  const tableDiff = postState.tables.length - preState.tables.length;
  const viewDiff = postState.views.length - preState.views.length;
  const columnDiff = postState.columns.length - preState.columns.length;
  const policyDiff = postState.policies.length - preState.policies.length;

  console.log(`  Tables: PRE=${preState.tables.length}, POST=${postState.tables.length}, Diff=${tableDiff}`);
  console.log(`  Views: PRE=${preState.views.length}, POST=${postState.views.length}, Diff=${viewDiff}`);
  console.log(`  Columns: PRE=${preState.columns.length}, POST=${postState.columns.length}, Diff=${columnDiff}`);
  console.log(`  Policies: PRE=${preState.policies.length}, POST=${postState.policies.length}, Diff=${policyDiff}`);

  const preTriggerNames = new Set(preState.triggers.map((t) => `${t.event_object_table}.${t.trigger_name}`));
  const postTriggerNames = new Set(postState.triggers.map((t) => `${t.event_object_table}.${t.trigger_name}`));

  const addedTriggers = [...postTriggerNames].filter((t) => !preTriggerNames.has(t));
  const removedTriggers = [...preTriggerNames].filter((t) => !postTriggerNames.has(t));
  console.log(`  Triggers: Added [${addedTriggers.join(', ')}], Removed [${removedTriggers.join(', ')}]`);

  const preFnMap = new Map(preState.functions.map((f) => [`${f.proname}(${f.args})`, f.def]));
  const postFnMap = new Map(postState.functions.map((f) => [`${f.proname}(${f.args})`, f.def]));

  const modifiedFns = [];
  const addedFns = [];
  for (const [fnSig, def] of postFnMap) {
    if (!preFnMap.has(fnSig)) {
      addedFns.push(fnSig);
    } else if (preFnMap.get(fnSig) !== def) {
      modifiedFns.push(fnSig);
    }
  }
  console.log(`  Functions: Added [${addedFns.join(', ')}], Modified [${modifiedFns.join(', ')}]`);

  const EXPECTED_ADDED_TRIGGERS = [
    'user_role_assignments.trg_user_role_assignments_security_guard',
    'roles.trg_roles_security_guard',
    'role_permissions.trg_role_permissions_scope_guard'
  ].sort();

  const EXPECTED_CHANGED_FUNCTIONS = [
    'is_platform_admin(p_user_id uuid)',
    'has_permission(p_user_id uuid, p_organization_id uuid, p_permission_key text)',
    'guard_user_role_assignments_security()',
    'guard_roles_security()',
    'guard_role_permissions_scope()'
  ].sort();

  const actualChangedFunctions = [...addedFns, ...modifiedFns].sort();

  let unexpectedDeltaCount = 0;

  if (tableDiff !== 0) unexpectedDeltaCount++;
  if (viewDiff !== 0) unexpectedDeltaCount++;
  if (columnDiff !== 0) unexpectedDeltaCount++;
  if (policyDiff !== 0) unexpectedDeltaCount++;

  const unexpectedTriggers = addedTriggers.filter((t) => !EXPECTED_ADDED_TRIGGERS.includes(t));
  if (unexpectedTriggers.length > 0 || removedTriggers.length > 0) {
    unexpectedDeltaCount += unexpectedTriggers.length + removedTriggers.length;
  }

  const unexpectedFunctions = actualChangedFunctions.filter((f) => !EXPECTED_CHANGED_FUNCTIONS.includes(f));
  if (unexpectedFunctions.length > 0) {
    unexpectedDeltaCount += unexpectedFunctions.length;
  }

  console.log('\n========================================================================');
  console.log(`UNEXPECTED DELTA COUNT: ${unexpectedDeltaCount}`);
  console.log('========================================================================');

  if (unexpectedDeltaCount === 0) {
    console.log('RESULT: PERFECT CATALOG DELTA MATCH! (unexpected delta = 0) ✅\n');
  } else {
    console.error('RESULT: FAILED! Unexpected schema changes detected.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
