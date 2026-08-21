-- Bank reconciliation, part 2 of 2: the matching engine and the summary.

-- Auto-match a statement's unmatched lines against unmatched GL movement on
-- the same bank account.
--
-- DELIBERATELY CONSERVATIVE. A line is matched automatically only when there
-- is EXACTLY ONE candidate. Two identical 5,000 transfers three days apart
-- are indistinguishable to any amount+date rule, and guessing between them
-- produces a reconciliation that balances while pointing at the wrong entry --
-- worse than leaving it for a human, because it looks finished. Ambiguous and
-- unmatched lines are both left for manual review.
--
-- p_date_tolerance_days covers value-dating: a payment booked on the 30th can
-- land on the bank's statement on the 2nd.
create or replace function public.auto_match_bank_statement(
  p_statement_id uuid,
  p_date_tolerance_days int default 5
)
returns table (
  matched_count int,
  ambiguous_count int,
  unmatched_count int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_gl_account uuid;
  v_status text;
  v_matched int := 0;
  v_ambiguous int := 0;
  v_unmatched int;
  v_line record;
  v_candidate uuid;
  v_candidate_count int;
begin
  select s.organization_id, ba.gl_account_id, s.status
  into v_org, v_gl_account, v_status
  from public.bank_statements s
  join public.bank_accounts ba on ba.id = s.bank_account_id
  where s.id = p_statement_id;

  if v_org is null then
    raise exception 'BANK_STATEMENT_NOT_FOUND: كشف الحساب غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_org, 'finance.bank_reconciliation.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بتنفيذ المطابقة البنكية' using errcode = '42501';
  end if;

  if v_status <> 'DRAFT' then
    raise exception 'BANK_STATEMENT_NOT_DRAFT: لا يمكن تعديل مطابقة كشف حساب معتمد؛ أعد فتحه أولًا' using errcode = 'P0001';
  end if;

  if p_date_tolerance_days < 0 or p_date_tolerance_days > 60 then
    raise exception 'INVALID_TOLERANCE: نطاق التسامح في التاريخ يجب أن يكون بين 0 و60 يومًا' using errcode = 'P0001';
  end if;

  for v_line in
    select id, line_date, amount
    from public.bank_statement_lines
    where statement_id = p_statement_id
      and matched_journal_entry_line_id is null
    order by line_date, sort_order, id
  loop
    -- array_agg rather than min(): Postgres has no min(uuid). The element is
    -- only read when the count is exactly 1, so which one it picks is moot.
    select count(*), (array_agg(l.id))[1]
    into v_candidate_count, v_candidate
    from public.journal_entry_lines l
    join public.journal_entries je on je.id = l.journal_entry_id
    where l.account_id = v_gl_account
      and je.organization_id = v_org
      and je.status = 'POSTED'
      and (l.debit - l.credit) = v_line.amount
      and je.entry_date between v_line.line_date - p_date_tolerance_days
                            and v_line.line_date + p_date_tolerance_days
      -- Not already claimed, by this statement or any other.
      and not exists (
        select 1 from public.bank_statement_lines bl
        where bl.matched_journal_entry_line_id = l.id
      );

    if v_candidate_count = 1 then
      update public.bank_statement_lines
      set matched_journal_entry_line_id = v_candidate,
          match_type = 'AUTO',
          matched_at = now(),
          matched_by = auth.uid()
      where id = v_line.id;
      v_matched := v_matched + 1;
    elsif v_candidate_count > 1 then
      v_ambiguous := v_ambiguous + 1;
    end if;
  end loop;

  select count(*) into v_unmatched
  from public.bank_statement_lines
  where statement_id = p_statement_id
    and matched_journal_entry_line_id is null;

  return query select v_matched, v_ambiguous, v_unmatched;
end;
$$;

-- The reconciliation itself.
--
-- Classic bank reconciliation, stated as an identity:
--
--   closing_balance                       (what the bank says)
--   + unmatched GL movement               (book has it, bank hasn't shown it:
--                                          deposits in transit, uncleared cheques)
--   - unmatched statement movement        (bank has it, book hasn't recorded it:
--                                          fees, interest, direct debits)
--   = book_balance                        (what the GL says)
--
-- `difference` is that identity's residual. Zero means reconciled. Non-zero
-- means something is genuinely wrong -- a wrong amount, a duplicate posting,
-- a mis-keyed opening balance -- as opposed to merely outstanding, which the
-- two unmatched terms already absorb.
create or replace function public.get_bank_reconciliation_summary(
  p_statement_id uuid
)
returns table (
  book_balance numeric,
  closing_balance numeric,
  opening_balance numeric,
  unmatched_gl_total numeric,
  unmatched_statement_total numeric,
  unmatched_gl_count int,
  unmatched_statement_count int,
  difference numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_gl_account uuid;
  v_period_start date;
  v_period_end date;
  v_closing numeric;
  v_opening numeric;
begin
  select s.organization_id, ba.gl_account_id, s.period_start, s.period_end,
         s.closing_balance, s.opening_balance
  into v_org, v_gl_account, v_period_start, v_period_end, v_closing, v_opening
  from public.bank_statements s
  join public.bank_accounts ba on ba.id = s.bank_account_id
  where s.id = p_statement_id;

  if v_org is null then
    raise exception 'BANK_STATEMENT_NOT_FOUND: كشف الحساب غير موجود' using errcode = 'P0002';
  end if;

  if not (
    public.has_permission(auth.uid(), v_org, 'finance.bank_reconciliation.read')
    or public.has_permission(auth.uid(), v_org, 'finance.bank_reconciliation.manage')
  ) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على المطابقة البنكية' using errcode = '42501';
  end if;

  return query
  with book as (
    -- Cumulative GL balance of the bank account through period_end. The bank
    -- account is a DEBIT-normal asset, so its balance is debit - credit.
    select coalesce(sum(l.debit - l.credit), 0) as bal
    from public.journal_entry_lines l
    join public.journal_entries je on je.id = l.journal_entry_id
    where l.account_id = v_gl_account
      and je.organization_id = v_org
      and je.status = 'POSTED'
      and je.entry_date <= v_period_end
  ),
  unmatched_gl as (
    -- Posted movement inside the statement period that no statement line
    -- claims: the book knows about it, the bank has not shown it yet.
    select coalesce(sum(l.debit - l.credit), 0) as total, count(*)::int as cnt
    from public.journal_entry_lines l
    join public.journal_entries je on je.id = l.journal_entry_id
    where l.account_id = v_gl_account
      and je.organization_id = v_org
      and je.status = 'POSTED'
      and je.entry_date between v_period_start and v_period_end
      and not exists (
        select 1 from public.bank_statement_lines bl
        where bl.matched_journal_entry_line_id = l.id
      )
  ),
  unmatched_stmt as (
    select coalesce(sum(bl.amount), 0) as total, count(*)::int as cnt
    from public.bank_statement_lines bl
    where bl.statement_id = p_statement_id
      and bl.matched_journal_entry_line_id is null
  )
  select
    book.bal,
    v_closing,
    v_opening,
    unmatched_gl.total,
    unmatched_stmt.total,
    unmatched_gl.cnt,
    unmatched_stmt.cnt,
    (v_closing + unmatched_gl.total - unmatched_stmt.total) - book.bal
  from book, unmatched_gl, unmatched_stmt;
end;
$$;

-- Candidate GL lines for manually matching one statement line. Ordered by
-- how close the entry date is to the statement line, so the likeliest match
-- surfaces first; exact-amount candidates only, since a manual match that
-- changes the amount would silently break the reconciliation identity.
create or replace function public.get_bank_match_candidates(
  p_statement_line_id uuid,
  p_date_tolerance_days int default 30
)
returns table (
  journal_entry_line_id uuid,
  entry_id uuid,
  entry_number bigint,
  entry_date date,
  description text,
  signed_amount numeric,
  date_distance int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_gl_account uuid;
  v_line_date date;
  v_amount numeric;
begin
  select bl.organization_id, ba.gl_account_id, bl.line_date, bl.amount
  into v_org, v_gl_account, v_line_date, v_amount
  from public.bank_statement_lines bl
  join public.bank_statements s on s.id = bl.statement_id
  join public.bank_accounts ba on ba.id = s.bank_account_id
  where bl.id = p_statement_line_id;

  if v_org is null then
    raise exception 'BANK_STATEMENT_LINE_NOT_FOUND: سطر كشف الحساب غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_org, 'finance.bank_reconciliation.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بتنفيذ المطابقة البنكية' using errcode = '42501';
  end if;

  return query
  select
    l.id,
    je.id,
    je.entry_number,
    je.entry_date,
    coalesce(l.description, je.description),
    (l.debit - l.credit),
    abs(je.entry_date - v_line_date)::int
  from public.journal_entry_lines l
  join public.journal_entries je on je.id = l.journal_entry_id
  where l.account_id = v_gl_account
    and je.organization_id = v_org
    and je.status = 'POSTED'
    and (l.debit - l.credit) = v_amount
    and je.entry_date between v_line_date - p_date_tolerance_days
                          and v_line_date + p_date_tolerance_days
    and not exists (
      select 1 from public.bank_statement_lines bl
      where bl.matched_journal_entry_line_id = l.id
    )
  order by abs(je.entry_date - v_line_date), je.entry_date, je.entry_number
  limit 50;
end;
$$;

-- Finalize. Refuses unless the reconciliation identity actually holds, so
-- RECONCILED always means "proven", never "someone clicked the button".
create or replace function public.finalize_bank_reconciliation(
  p_statement_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_status text;
  v_difference numeric;
begin
  select organization_id, status into v_org, v_status
  from public.bank_statements where id = p_statement_id;

  if v_org is null then
    raise exception 'BANK_STATEMENT_NOT_FOUND: كشف الحساب غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_org, 'finance.bank_reconciliation.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك باعتماد المطابقة البنكية' using errcode = '42501';
  end if;

  if v_status <> 'DRAFT' then
    raise exception 'BANK_STATEMENT_NOT_DRAFT: كشف الحساب معتمد بالفعل' using errcode = 'P0001';
  end if;

  select difference into v_difference
  from public.get_bank_reconciliation_summary(p_statement_id);

  if abs(v_difference) >= 0.005 then
    raise exception 'RECONCILIATION_NOT_BALANCED: لا يمكن اعتماد المطابقة والفرق % غير صفري', v_difference
      using errcode = 'P0001';
  end if;

  update public.bank_statements
  set status = 'RECONCILED',
      reconciled_at = now(),
      reconciled_by = auth.uid()
  where id = p_statement_id;
end;
$$;

-- Reopening is a separate, auditable act rather than a side effect of editing.
create or replace function public.reopen_bank_reconciliation(
  p_statement_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org
  from public.bank_statements where id = p_statement_id;

  if v_org is null then
    raise exception 'BANK_STATEMENT_NOT_FOUND: كشف الحساب غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_org, 'finance.bank_reconciliation.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإعادة فتح المطابقة البنكية' using errcode = '42501';
  end if;

  update public.bank_statements
  set status = 'DRAFT', reconciled_at = null, reconciled_by = null
  where id = p_statement_id and status = 'RECONCILED';
end;
$$;
