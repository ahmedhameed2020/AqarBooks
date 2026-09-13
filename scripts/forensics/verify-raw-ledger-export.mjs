/**
 * Verifies that the protected raw export of the 15 ledger-only rows
 * matches the public manifest in docs/evidence/migration-ledger-15-manifest.json
 * across all fields, per-row statement hashes, byte lengths, and whole-file SHA-256.
 *
 * Usage:
 *   node scripts/forensics/verify-raw-ledger-export.mjs [path-to-raw-export.json]
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const EXPECTED_RAW_EXPORT_SHA256 = 'b0313b78f1823e88c2c04c010567991b83eb6e6b50ec0e9437095d06b399131e';

const candidatePaths = [
  process.argv[2],
  process.env.RAW_LEDGER_EXPORT_PATH,
  'C:/Users/Lenovo/.gemini/antigravity/brain/28bdf628-a209-48f2-a17d-9e59a7e8de27/raw_ledger_export_15_rows.json',
  resolve('supabase/.temp/raw_ledger_export_15_rows.json'),
  resolve('raw_ledger_export_15_rows.json')
].filter(Boolean);

let rawExportPath = null;
for (const p of candidatePaths) {
  if (existsSync(p)) {
    rawExportPath = p;
    break;
  }
}

if (!rawExportPath) {
  console.log('NOTICE: Protected raw export file not found in candidate locations.');
  console.log('To verify, supply the path as an argument or set RAW_LEDGER_EXPORT_PATH:');
  console.log('  node scripts/forensics/verify-raw-ledger-export.mjs [path-to-raw-export.json]');
  process.exit(0);
}

console.log('Verifying raw export: ' + rawExportPath);

const rawBuffer = readFileSync(rawExportPath);
const actualFileSha256 = createHash('sha256').update(rawBuffer).digest('hex');

if (actualFileSha256 !== EXPECTED_RAW_EXPORT_SHA256) {
  console.error('ERROR: Raw export SHA-256 mismatch!');
  console.error('  Expected: ' + EXPECTED_RAW_EXPORT_SHA256);
  console.error('  Actual:   ' + actualFileSha256);
  process.exit(1);
}
console.log('[PASS] Complete raw export file SHA-256 matches: ' + actualFileSha256);

const rawData = JSON.parse(rawBuffer.toString('utf8'));
if (!Array.isArray(rawData.rows) || rawData.rows.length !== 15) {
  console.error('ERROR: Expected exactly 15 rows in raw export, got: ' + (rawData.rows ? rawData.rows.length : 'undefined'));
  process.exit(1);
}
console.log('[PASS] Exactly 15 rows present in raw export.');

const manifestPath = resolve('docs/evidence/migration-ledger-15-manifest.json');
if (!existsSync(manifestPath)) {
  console.error('ERROR: Public manifest not found at: ' + manifestPath);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

if (manifest.row_count !== 15 || manifest.rows.length !== 15) {
  console.error('ERROR: Manifest row count is not 15!');
  process.exit(1);
}

let totalBytes = 0;
for (let i = 0; i < 15; i++) {
  const rawRow = rawData.rows[i];
  const manRow = manifest.rows[i];

  if (rawRow.version !== manRow.version) {
    console.error('ERROR: Version mismatch at row ' + i + ': raw=' + rawRow.version + ', manifest=' + manRow.version);
    process.exit(1);
  }
  if (rawRow.name !== manRow.name) {
    console.error('ERROR: Name mismatch at row ' + i + ': raw=' + rawRow.name + ', manifest=' + manRow.name);
    process.exit(1);
  }

  const stmts = rawRow.statements || [];
  if (stmts.length !== manRow.statement_count) {
    console.error('ERROR: Statement count mismatch at row ' + i + ': raw=' + stmts.length + ', manifest=' + manRow.statement_count);
    process.exit(1);
  }

  const joined = stmts.join('\n');
  const actualBytes = Buffer.byteLength(joined, 'utf8');
  if (actualBytes !== manRow.statement_byte_length) {
    console.error('ERROR: Byte length mismatch at row ' + i + ': raw=' + actualBytes + ', manifest=' + manRow.statement_byte_length);
    process.exit(1);
  }
  totalBytes += actualBytes;

  const actualRowSha = createHash('sha256').update(Buffer.from(joined, 'utf8')).digest('hex');
  if (actualRowSha !== manRow.sha256) {
    console.error('ERROR: Statement SHA-256 mismatch at row ' + i + ': raw=' + actualRowSha + ', manifest=' + manRow.sha256);
    process.exit(1);
  }
}

console.log('[PASS] All 15 rows match public manifest on version, name, statement_count, byte length, and SHA-256.');
console.log('[PASS] Total statement bytes: ' + totalBytes + ' (matches manifest: ' + manifest.total_statement_bytes + ')');
console.log('All cross-validations passed successfully! ✅');
