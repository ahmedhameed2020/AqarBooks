-- PROPOSAL, r6 ONLY until reviewed. Forward-only. Replaces project_wip_summary (same signature and columns).
-- Fix: a draft cancelled by setting status to REVERSED must not be counted as a cost release.
-- A real reversal is identified by its child POSTED entry whose reversed_entry_id points to the original.
-- Classification and aggregation remain unchanged:
--   original capitalisation (WIP debited)  -> capitalised += debit
--   original release        (WIP credited) -> released    += credit
--   reversal of a capitalisation           -> capitalised += (debit - credit)   (reduces it)
--   reversal of a release                  -> released    += (credit - debit)   (reduces it)
-- wip_balance stays debit - credit over the same included lines, so every caller that reads the balance is unchanged.

CREATE OR REPLACE FUNCTION public.project_wip_summary(p_project_id uuid)
RETURNS TABLE(capitalised numeric, released numeric, wip_balance numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_wip uuid;
BEGIN
  SELECT pr.wip_account_id INTO v_wip FROM public.projects pr WHERE pr.id = p_project_id;

  RETURN QUERY
  WITH wip AS (
    SELECT
      l.debit,
      l.credit,
      je.reversed_entry_id AS origin_id,
      CASE WHEN je.reversed_entry_id IS NULL THEN NULL ELSE (
        SELECT (ol.debit > 0)
        FROM public.journal_entry_lines ol
        WHERE ol.journal_entry_id = je.reversed_entry_id
          AND ol.account_id = v_wip
          AND ol.project_id = p_project_id
        ORDER BY ol.debit DESC
        LIMIT 1
      ) END AS origin_is_cap
    FROM public.journal_entry_lines l
    JOIN public.journal_entries je ON je.id = l.journal_entry_id
    WHERE l.project_id = p_project_id
      AND l.account_id = v_wip
      AND (
        je.status = 'POSTED'
        OR (
          je.status = 'REVERSED'
          AND EXISTS (
            SELECT 1
            FROM public.journal_entries r
            WHERE r.reversed_entry_id = je.id
          )
        )
      )
  )
  SELECT
    COALESCE(SUM(CASE
      WHEN origin_id IS NULL THEN debit
      WHEN origin_is_cap THEN debit - credit
      ELSE 0 END), 0),
    COALESCE(SUM(CASE
      WHEN origin_id IS NULL THEN credit
      WHEN origin_is_cap IS FALSE THEN credit - debit
      ELSE 0 END), 0),
    COALESCE(SUM(debit - credit), 0)
  FROM wip;
END;
$$;

-- ROLLBACK: re-run docs/progress/proposals/20261029140000_project_wip_summary_reversals.sql on r6 only.
