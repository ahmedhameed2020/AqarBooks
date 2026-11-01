-- PROPOSAL, r6 ONLY until reviewed. Forward-only. Replaces check_project_wip_floor with identical guard logic.
-- Clarifies that the second number is the attempted movement's projected net, not a balance that persisted after the refused reversal.
-- Only the non-negative-to-negative message changes; the pre-existing-negative branch and all calculations are unchanged.

CREATE OR REPLACE FUNCTION public.check_project_wip_floor(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_after numeric;
  v_before numeric;
  v_text text := current_setting('aqar.floor_before_' || replace(p_project_id::text, '-', ''), true);
BEGIN
  v_after := public.project_wip_net(p_project_id);
  IF v_after IS NULL OR v_after >= 0 THEN
    RETURN;
  END IF;
  v_before := COALESCE(NULLIF(v_text, '')::numeric, v_after);
  IF v_before >= 0 THEN
    RAISE EXCEPTION 'PROJECT_WIP_NEGATIVE: الحركة المرفوضة كانت ستجعل رصيد WIP سالبًا (الرصيد قبل الحركة %, الصافي المتوقع بعد الحركة %)', v_before, v_after
      USING ERRCODE = 'P0001';
  END IF;
  IF v_after <= v_before THEN
    RAISE EXCEPTION 'PROJECT_WIP_NEGATIVE: الرصيد سالب أصلًا والحركة لا تحسّنه (قبل %, بعد %)', v_before, v_after
      USING ERRCODE = 'P0001';
  END IF;
  RETURN;
END;
$$;
REVOKE ALL ON FUNCTION public.check_project_wip_floor(uuid) FROM PUBLIC, anon, authenticated;

-- ROLLBACK: re-run docs/progress/proposals/20261029180000_wip_floor_baseline_and_delete.sql on r6 only.
