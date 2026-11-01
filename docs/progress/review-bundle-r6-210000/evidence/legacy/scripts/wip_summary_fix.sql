-- PROPOSAL, r6 ONLY until reviewed. Forward-only. Replaces project_wip_summary (same signature and columns).
-- Fix: a reversal of a capitalisation was counted as a release, and a reversal of a release as a capitalisation.
-- Classification now follows the ORIGINAL entry the reversal points to (reversed_entry_id):
--   original capitalisation (WIP debited)  -> capitalised += debit
--   original release        (WIP credited) -> released    += credit
--   reversal of a capitalisation           -> capitalised += (debit - credit)   (reduces it)
--   reversal of a release                  -> released    += (credit - debit)   (reduces it)
-- wip_balance stays debit - credit over the same lines, so every caller that reads the balance is unchanged.

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
      AND je.status IN ('POSTED', 'REVERSED')
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

-- ROLLBACK: re-run this file's predecessor definition from docs/progress/evidence-r6-run3/concurrency/project_wip_summary_before.sql
