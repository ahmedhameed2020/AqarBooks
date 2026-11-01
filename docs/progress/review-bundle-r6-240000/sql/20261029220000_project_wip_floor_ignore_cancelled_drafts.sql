-- PROPOSAL, r6 ONLY until reviewed. Forward-only.
-- Defect proven after 20261029210000: project_wip_net deliberately sums every WIP line so a status-only
-- cancellation cannot change that status-neutral total. The deferred floor used the same total, however,
-- so a cancelled WIP credit could make a valid POSTED release fail at SET CONSTRAINTS ALL IMMEDIATE.
-- Fix: keep project_wip_net unchanged, but give the floor its own enforceable net:
--   posted/genuinely reversed WIP from project_wip_summary + active pending WIP lines only.
-- Status-only cancelled drafts are excluded from BOTH the transaction baseline and the final floor check.
-- The project row locks, constraint triggers, non-negative rule and improvement-only negative rule are unchanged.

CREATE OR REPLACE FUNCTION public.project_wip_floor_net(p_project_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_wip uuid;
  v_posted numeric;
  v_pending numeric;
BEGIN
  SELECT wip_account_id INTO v_wip FROM public.projects WHERE id = p_project_id;
  IF v_wip IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT s.wip_balance INTO v_posted FROM public.project_wip_summary(p_project_id) s;
  SELECT COALESCE(SUM(l.debit - l.credit), 0) INTO v_pending
  FROM public.journal_entry_lines l
  JOIN public.journal_entries je ON je.id = l.journal_entry_id
  WHERE l.project_id = p_project_id
    AND l.account_id = v_wip
    AND je.status NOT IN ('POSTED', 'REVERSED');

  RETURN COALESCE(v_posted, 0) + COALESCE(v_pending, 0);
END;
$$;
REVOKE ALL ON FUNCTION public.project_wip_floor_net(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.capture_project_floor_baseline(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_name text := 'aqar.floor_before_' || replace(p_project_id::text, '-', '');
  v_current text := current_setting(v_name, true);
BEGIN
  IF p_project_id IS NULL OR (v_current IS NOT NULL AND v_current <> '') THEN
    RETURN;
  END IF;
  PERFORM set_config(v_name, COALESCE(public.project_wip_floor_net(p_project_id), 0)::text, true);
END;
$$;
REVOKE ALL ON FUNCTION public.capture_project_floor_baseline(uuid) FROM PUBLIC, anon, authenticated;

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
  v_after := public.project_wip_floor_net(p_project_id);
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

-- ROLLBACK on r6 only: re-run 20261029180000, then 20261029190000, 20261029200000 and 20261029210000
-- in that order to restore the preceding live functions. Drop project_wip_floor_net(uuid) afterwards.
