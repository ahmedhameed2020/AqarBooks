-- PROPOSAL, r6 ONLY until reviewed. Forward-only. Replaces 20261029170000 (same triggers, extended).
-- 1. DELETE is covered (a deleted WIP debit lowers the net). A line moved out of a project rechecks the old project.
-- 2. Pre-existing negative: the first trigger that touches a project in a transaction stores the project's net BEFORE
--    the transaction (transaction-local setting aqar.floor_before_<project>). At commit:
--      after >= 0                      -> allowed
--      after < 0 and before >= 0       -> refused (no non-negative balance may become negative)
--      after < 0 and before < 0        -> allowed only if after > before (the movement improves the balance)
-- 3. The net = posted/reversed balance + pending (draft / under review) WIP lines.

CREATE OR REPLACE FUNCTION public.project_wip_net(p_project_id uuid)
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
REVOKE ALL ON FUNCTION public.project_wip_net(uuid) FROM PUBLIC, anon, authenticated;

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
  PERFORM set_config(v_name, COALESCE(public.project_wip_net(p_project_id), 0)::text, true);
END;
$$;
REVOKE ALL ON FUNCTION public.capture_project_floor_baseline(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_project_line_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.project_id IS NOT NULL THEN
    PERFORM 1 FROM public.projects WHERE id = OLD.project_id FOR UPDATE;
    PERFORM public.capture_project_floor_baseline(OLD.project_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.project_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.project_id IS DISTINCT FROM OLD.project_id) THEN
    PERFORM 1 FROM public.projects WHERE id = NEW.project_id FOR UPDATE;
    PERFORM public.capture_project_floor_baseline(NEW.project_id);
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_project_line_insert() FROM PUBLIC, anon, authenticated;

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
    RAISE EXCEPTION 'PROJECT_WIP_NEGATIVE: الحركة تجعل رصيد WIP سالبًا (قبل %, بعد %)', v_before, v_after
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

CREATE OR REPLACE FUNCTION public.guard_project_floor_at_commit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.project_id IS NOT NULL THEN
    PERFORM public.check_project_wip_floor(NEW.project_id);
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.project_id IS NOT NULL
     AND (TG_OP = 'DELETE' OR OLD.project_id IS DISTINCT FROM NEW.project_id) THEN
    PERFORM public.check_project_wip_floor(OLD.project_id);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_project_floor_at_commit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_jel_project_lock ON public.journal_entry_lines;
CREATE TRIGGER trg_jel_project_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entry_lines
  FOR EACH ROW EXECUTE FUNCTION public.guard_project_line_insert();

DROP TRIGGER IF EXISTS trg_jel_project_floor ON public.journal_entry_lines;
CREATE CONSTRAINT TRIGGER trg_jel_project_floor
  AFTER INSERT OR UPDATE OR DELETE ON public.journal_entry_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_project_floor_at_commit();

-- ROLLBACK: restore 20261029170000 (its functions and triggers). It has no baseline and no DELETE check.
