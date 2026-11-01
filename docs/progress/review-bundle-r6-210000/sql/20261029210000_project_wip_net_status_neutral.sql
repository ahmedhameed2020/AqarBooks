-- PROPOSAL, r6 ONLY until reviewed. Forward-only. Replaces project_wip_net (same signature and return type).
-- Defect proven after 20261029200000: project_wip_summary now excludes a status-only cancelled draft,
-- while the pending-line query also excludes REVERSED. Cancelling a DRAFT WIP debit therefore changed
-- the floor net without touching a journal line or running the floor guard (100 -> -200 in the regression).
-- Fix: keep the guard's net status-neutral, as it was before 20261029200000, by summing all WIP lines directly.
-- Report classification remains unchanged: project_wip_summary still excludes status-only cancelled drafts.

CREATE OR REPLACE FUNCTION public.project_wip_net(p_project_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_wip uuid;
  v_net numeric;
BEGIN
  SELECT wip_account_id INTO v_wip FROM public.projects WHERE id = p_project_id;
  IF v_wip IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(l.debit - l.credit), 0) INTO v_net
  FROM public.journal_entry_lines l
  WHERE l.project_id = p_project_id
    AND l.account_id = v_wip;

  RETURN v_net;
END;
$$;
REVOKE ALL ON FUNCTION public.project_wip_net(uuid) FROM PUBLIC, anon, authenticated;

-- ROLLBACK: re-run docs/progress/proposals/20261029180000_wip_floor_baseline_and_delete.sql on r6 only,
-- then re-apply 20261029190000 and 20261029200000 to retain their later changes.
