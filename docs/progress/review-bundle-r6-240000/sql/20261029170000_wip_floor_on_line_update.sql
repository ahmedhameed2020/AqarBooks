-- PROPOSAL, r6 ONLY until reviewed. Forward-only. Extends 20261029130000 and 20261029160000 to UPDATE.
-- Defect proven on r6 (concurrency/q_update_result.txt): the floor ran on INSERT only, so updating a committed draft line
-- from credit 600 to 1500 was accepted and left the project's net at -500.
-- Fix: the lock and the floor run on INSERT and UPDATE; on UPDATE, a line moved OUT of a project also rechecks that project.

CREATE OR REPLACE FUNCTION public.guard_project_line_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.project_id IS NOT NULL THEN
    PERFORM 1 FROM public.projects WHERE id = NEW.project_id FOR UPDATE;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.project_id IS NOT NULL AND OLD.project_id IS DISTINCT FROM NEW.project_id THEN
    PERFORM 1 FROM public.projects WHERE id = OLD.project_id FOR UPDATE;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_project_wip_floor(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
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
    RETURN;
  END IF;
  SELECT s.wip_balance INTO v_posted FROM public.project_wip_summary(p_project_id) s;
  SELECT COALESCE(SUM(l.debit - l.credit), 0) INTO v_pending
  FROM public.journal_entry_lines l
  JOIN public.journal_entries je ON je.id = l.journal_entry_id
  WHERE l.project_id = p_project_id
    AND l.account_id = v_wip
    AND je.status NOT IN ('POSTED', 'REVERSED');
  IF COALESCE(v_posted, 0) + COALESCE(v_pending, 0) < 0 THEN
    RAISE EXCEPTION 'PROJECT_WIP_NEGATIVE: صافي الحركات يجعل رصيد WIP سالبًا (المرحّل %, المعلّق %)',
      COALESCE(v_posted, 0), COALESCE(v_pending, 0)
      USING ERRCODE = 'P0001';
  END IF;
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
  IF NEW.project_id IS NOT NULL THEN
    PERFORM public.check_project_wip_floor(NEW.project_id);
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.project_id IS NOT NULL AND OLD.project_id IS DISTINCT FROM NEW.project_id THEN
    PERFORM public.check_project_wip_floor(OLD.project_id);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_project_floor_at_commit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_jel_project_lock ON public.journal_entry_lines;
CREATE TRIGGER trg_jel_project_lock
  BEFORE INSERT OR UPDATE ON public.journal_entry_lines
  FOR EACH ROW EXECUTE FUNCTION public.guard_project_line_insert();

DROP TRIGGER IF EXISTS trg_jel_project_floor ON public.journal_entry_lines;
CREATE CONSTRAINT TRIGGER trg_jel_project_floor
  AFTER INSERT OR UPDATE ON public.journal_entry_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_project_floor_at_commit();

-- ROLLBACK: restore 20261029160000 (insert-only trigger trg_jel_project_floor and the row lock) from its file.
