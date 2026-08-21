# Step 5 Baseline Artifacts — Manifest

Produced by Phase 2 / Item 1 (migration reconciliation), Steps 2-4, and proven
by the Step 5 reproduction gate on 2026-08-21.

These five files are the evidence, not merely a convenience copy. The scratch
database proves the files work; without the files the scratch database cannot
rebuild anything. Regenerating them is not equivalent: a fresh pg_dump can produce byte-different output, breaking these hashes.

STATUS: evidence only. NOT part of the migration sequence.
Nothing in supabase/migrations/ was changed to place these here, and their
presence does not authorise retiring any migration, writing to
schema_migrations, or lifting the supabase db push prohibition.

## Apply order — load-bearing

    0  baseline_00_security_preamble.sql    MUST run before any object exists
    1  baseline_schema.sql
    2  baseline_auth_objects.sql
    3  baseline_03_security_postamble.sql
    4  baseline_04_reference_data.sql

The preamble revokes anon from default privileges on FUNCTIONS. Run out of
order it becomes a no-op for objects already created, and all 203 application
functions are born executable by anon — the exact defect that failed the first
gate run.

## Integrity

SHA-256, recorded during the PASS run and re-verified on copy:

    baseline_00_security_preamble.sql          3230 bytes  c4dd9b3830027d9d14ff425a0efe140cb1c9fbf39bbb6b5cd4eaef34b1ae6ba0
    baseline_schema.sql                      897425 bytes  7e8d8b457ff77ca344e99d8ff96b260cbc37b87e1386ea233c8f77dedeb068fc
    baseline_auth_objects.sql                  3166 bytes  2bae9922168a07360a45b868243d8f571060d8d2975f98dd386dfddf139d4b82
    baseline_03_security_postamble.sql         7457 bytes  52d23cbbc8ca267bff6fdba03d6446e4a6ec3930e0d6b7a729df63dd9ab8de43
    baseline_04_reference_data.sql            41556 bytes  255fa05a5458e833dbfec5c0dfe933233f6232227fc325d2cf0e1f24518c0325

Verify at any time with:
    sha256sum supabase/baseline/*.sql

## What Step 5 proved

Applied to a freshly created, empty Supabase project (PostgreSQL 17.6, the same
build as production), all sixteen comparison classes matched production exactly:

    columns 101 · constraints 707 · indexes 303 · functions 203 · views 3
    triggers 49 · policies 167 · rls 101 · extensions 6
    A1 function ACLs (order-independent) · A2 anon 0/203, authenticated 193/203
    A3 relation ACLs · A4 default privileges · A5 column ACLs 0
    A6 schema ACL · A7 seed contents

    reference rows 456/456 · roles 1 (PLATFORM_SUPER_ADMIN) · tenant rows 0/92
    auth.users trigger bound to public.handle_new_user()

Zero unclassified differences. One permitted difference applied: ACL array
element ordering, allowed only because the order-independent fingerprint is
identical and A2 independently proves effective privilege.
