-- PROPOSAL, r6 ONLY until reviewed. Forward-only. Replaces the per-row WIP floor of 20261029130000.
-- Defects proven on r6 (see concurrency/guard_before_results.txt, guard_T2b_before.txt):
--  (a) the per-row check ignored DRAFT lines, so two draft credits could overspend WIP;
--  (b) the per-row check depended on line order: the same net effect was accepted or refused depending on
--      whether the debit came before the credit.
-- Fix: the lock stays per row (BEFORE INSERT, same as before). The floor moves to a DEFERRED constraint trigger,
-- which runs at COMMIT: it sees every line the transaction wrote, so it checks the NET effect, independent of order,
-- and it counts pending (draft / under review) WIP lines as well as posted and reversed ones.

-- 1. The row trigger only locks (the floor no longer lives here).
CREATE OR REPLACE FUNCTION public.guard_project_line_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.project_id IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM 1 FROM public.projects WHERE id = NEW.project_id FOR UPDATE;
  RETURN NEW;
END;
$$;

-- 2. Net WIP floor at commit: posted/reversed balance plus pending WIP lines must not be negative.
CREATE OR REPLACE FUNCTION public.guard_project_floor_at_commit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_wip uuid;
  v_posted numeric;
  v_pending numeric;
BEGIN
  SELECT wip_account_id INTO v_wip FROM public.projects WHERE id = NEW.project_id;
  IF v_wip IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT s.wip_balance INTO v_posted FROM public.project_wip_summary(NEW.project_id) s;

  SELECT COALESCE(SUM(l.debit - l.credit), 0) INTO v_pending
  FROM public.journal_entry_lines l
  JOIN public.journal_entries je ON je.id = l.journal_entry_id
  WHERE l.project_id = NEW.project_id
    AND l.account_id = v_wip
    AND je.status NOT IN ('POSTED', 'REVERSED');

  IF COALESCE(v_posted, 0) + COALESCE(v_pending, 0) < 0 THEN
    RAISE EXCEPTION 'PROJECT_WIP_NEGATIVE: صافي الحركات يجعل رصيد WIP سالبًا (المرحّل %, المعلّق %)',
      COALESCE(v_posted, 0), COALESCE(v_pending, 0)
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_project_floor_at_commit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_jel_project_floor ON public.journal_entry_lines;
CREATE CONSTRAINT TRIGGER trg_jel_project_floor
  AFTER INSERT ON public.journal_entry_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.project_id IS NOT NULL)
  EXECUTE FUNCTION public.guard_project_floor_at_commit();

-- ROLLBACK: DROP TRIGGER trg_jel_project_floor ON public.journal_entry_lines; DROP FUNCTION guard_project_floor_at_commit();
--           and restore guard_project_line_insert() from 20261029130000 (the version that also checked the floor per row).
