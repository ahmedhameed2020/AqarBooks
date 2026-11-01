-- PROPOSAL, r6 ONLY until reviewed. Forward-only. Does not edit reverse_journal_entry, release_project_wip,
-- capitalise_project_cost, or create_journal_entry: it adds one trigger on journal_entry_lines.
--
-- 1. Every journal line tagged with a project takes the project row lock (FOR UPDATE) before it is inserted.
--    This is the same lock capitalise and release already take at their start, so the postings, the reversals
--    of postings, and the edits serialize. Re-taking a lock held by the same transaction is a no-op.
-- 2. A line that CREDITS the project's WIP account must not take the committed WIP balance below zero.
--    This closes the reversal-after-release race: a reversal of a capitalisation that was partly released
--    is refused instead of driving WIP negative.
-- Lock order: fiscal_periods (FOR SHARE, shared) is always taken before the project row by the reversal path,
-- and after it by the posting path; shared locks do not conflict, so the two orders cannot deadlock.

CREATE OR REPLACE FUNCTION public.guard_project_line_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_wip uuid;
  v_balance numeric;
BEGIN
  IF NEW.project_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM 1 FROM public.projects WHERE id = NEW.project_id FOR UPDATE;

  SELECT wip_account_id INTO v_wip FROM public.projects WHERE id = NEW.project_id;
  IF v_wip IS NOT NULL AND NEW.account_id = v_wip AND COALESCE(NEW.credit, 0) > 0 THEN
    SELECT s.wip_balance INTO v_balance FROM public.project_wip_summary(NEW.project_id) s;
    IF COALESCE(v_balance, 0) - NEW.credit < 0 THEN
      RAISE EXCEPTION 'PROJECT_WIP_NEGATIVE: العكس أو التحرير يجعل رصيد WIP سالبًا (الرصيد %, المطلوب %)',
        COALESCE(v_balance, 0), NEW.credit
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_project_line_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_jel_project_lock ON public.journal_entry_lines;
CREATE TRIGGER trg_jel_project_lock
  BEFORE INSERT ON public.journal_entry_lines
  FOR EACH ROW
  WHEN (NEW.project_id IS NOT NULL)
  EXECUTE FUNCTION public.guard_project_line_insert();

-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_jel_project_lock ON public.journal_entry_lines;
--   DROP FUNCTION IF EXISTS public.guard_project_line_insert();
