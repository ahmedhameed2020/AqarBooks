-- REG-006 finding: journals/[id]/page.tsx gated viewing a SPECIFIC entry
-- only on org-level has_permission('finance.reports.read' /
-- 'finance.entries.create') -- never checking the entry's own resort_id
-- against the viewer's resort-scoped grants. Confirmed live: CASHIER
-- (whose only route to finance.entries.create is a Resort-A-scoped grant)
-- could view a Resort B journal entry's full detail page by direct URL.
--
-- Compounding this, journal_entries SELECT RLS ("journal_entries_select_
-- member") was still is_org_member-only -- any org member, even with zero
-- finance permissions at all, could read every journal entry in the org
-- directly via their own Supabase client, bypassing the page entirely.
-- Tightened here to the same org-level-permission pattern already
-- established for payments/dues (20260812000009, 20260812000012).
--
-- has_financial_permission itself stays REVOKE ALL FROM PUBLIC/authenticated
-- (it must -- a client could otherwise probe arbitrary permission/resort
-- combinations directly). It is NOT used in this RLS policy for that exact
-- reason: an RLS USING clause is evaluated with the querying role's own
-- privileges, so a revoked function there would break every authenticated
-- SELECT, not enforce anything. Resort-level enforcement for the
-- single-entry view instead lives in a new, purpose-built, callable
-- SECURITY DEFINER RPC (get_journal_entry_for_view) that calls
-- has_financial_permission internally (safe: SECURITY DEFINER functions
-- run with the function owner's privileges, not the caller's) and REJECTS
-- with a real error when the entry's resort is out of the caller's scope
-- -- never silently returning an empty/null row, which could be mistaken
-- for "not found" and mask the real reason.

drop policy if exists "journal_entries_select_member" on public.journal_entries;
create policy "journal_entries_select_permission"
  on public.journal_entries for select
  using (
    public.has_permission(auth.uid(), organization_id, 'finance.reports.read')
    or public.has_permission(auth.uid(), organization_id, 'finance.entries.create')
  );

create or replace function public.get_journal_entry_for_view(p_entry_id uuid)
returns public.journal_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.journal_entries;
begin
  select * into v_entry from public.journal_entries where id = p_entry_id;
  if v_entry.id is null then
    raise exception 'JOURNAL_ENTRY_NOT_FOUND: القيد غير موجود' using errcode = 'P0002';
  end if;

  -- Resort-scoped: a role assignment with resort_id IS NULL (org-wide,
  -- e.g. FINANCE_MANAGER/TENANT_OWNER) always passes; a resort-scoped
  -- assignment (e.g. CASHIER's Resort-A-only grant) only passes when it
  -- matches the entry's own resort_id (or the entry itself has no resort,
  -- i.e. a general/org-level entry -- has_financial_permission treats
  -- p_resort_id IS NULL as universally visible, matching how such entries
  -- already behave everywhere else in this schema).
  if not (
    public.has_financial_permission(v_entry.organization_id, 'finance.reports.read', v_entry.resort_id)
    or public.has_financial_permission(v_entry.organization_id, 'finance.entries.create', v_entry.resort_id)
  ) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية عرض هذا القيد في هذا الموقع' using errcode = '42501';
  end if;

  return v_entry;
end;
$$;

notify pgrst, 'reload schema';
