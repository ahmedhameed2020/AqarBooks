# Final release bundle manifest (2026-10-17) -- LOCAL ONLY, NOT COMMITTED, NOT DEPLOYED

* bundle: `docs/audits/release-final-bundle-2026-10-17.zip` -- 2,814,996 bytes -- SHA-256 `ec1b669ade030d8047f409f44aaf19fb65cc601297432cfcb1587ba6043a780e`
* base commit: `5d2804f3ac2979872e8f657da645ad5ef4c8852a` on branch `fix/phase1-financial-report-authz` (fix(marketing): remove placeholder support phone); details in `BASE-COMMIT.txt` (also inside the bundle at `meta/`)
* deletions / renames vs the base commit: deleted 0, renamed 0, tracked files changed under supabase/migrations 0; see `CHANGES-DELETIONS-RENAMES.txt` (also at `meta/`)
* entries: 356 (candidate files 256, evidence files 96, meta files 4); per-file SHA-256 in `SHA256SUMS.txt`
* candidate groups: {"A1": 27, "A2": 79, "A4": 113, "D1": 15, "T1": 22}; excluded: H1 Fawry 10, X1 environment/tools 10, X2 mobile 70, X3 internal plans 2, X4 other evidence/zips/screens 670, X5 dev-DB incident 2
* migration `20261018100000_deposit_account_cash_or_bank.sql`: 12,701 bytes, SHA-256 `add8a244a189b58f548db0d9a6ed6061556504f4326f1b8276349f7b443c1b99` (pinned in tests/migration-directory-guard.test.ts; 54 authorized migrations; ledger 87/87 on the isolated stack)
* production build behind the final browser run: BUILD_ID `_fHhDXa2gWpG2rqiIY7rD` (2026-10-16 11:19); no app source or dependency newer than it; Playwright 53/53 (8 specs)
* production read-only query 6e was rewritten (all link and account conditions, per reason, per organization) and validated locally by `evidence/task11-deposit-account/q6e-validation/` (rolled-back fixture, every rejection reason, parity with the real function over all links of the isolated stack)
* secret-pattern scan (JWT, sk_/rk_ keys, AKIA, private keys, Postgres URLs with passwords) over every bundled file: 0 hit(s) 
* results: `candidate/docs/audits/release-plan/VERIFICATION-SUMMARY.md` (passed / failed / not run); the verification is NOT declared complete.
* written AFTER the last edit; any later edit to a listed file makes `SHA256SUMS.txt` stale -- rebuild with the builder (scratchpad `final_bundle2.py`).
