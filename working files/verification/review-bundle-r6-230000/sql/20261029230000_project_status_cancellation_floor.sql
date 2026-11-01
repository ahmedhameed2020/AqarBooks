-- PROPOSAL, r6 ONLY until reviewed. Forward-only.
-- Defect proven after 20261029220000: changing a DRAFT WIP debit to REVERSED by status alone changed
-- project_wip_floor_net from 100 to -200, while SET CONSTRAINTS ALL IMMEDIATE passed because no
-- journal_entry_lines trigger had been queued by the journal_entries status update.
-- Fix: a pending -> REVERSED status-only cancellation now locks affected projects and captures the
-- floor baseline BEFORE update, then queues the same floor check AFTER update. The deferred check keeps
-- multi-row updates atomic and runs at SET CONSTRAINTS ALL IMMEDIATE or COMMIT.
-- Genuine POSTED -> REVERSED reversals are excluded here; their existing journal-line guards remain intact.

CREATE OR REPLACE FUNCTION public.guard_project_status_cancel_before()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project_id uuid;
BEGIN
  IF OLD.status NOT IN ('POSTED', 'REVERSED') AND NEW.status = 'REVERSED'
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    FOR v_project_id IN
      SELECT DISTINCT l.project_id
      FROM public.journal_entry_lines l
      WHERE l.journal_entry_id = OLD.id AND l.project_id IS NOT NULL
      ORDER BY l.project_id
    LOOP
      PERFORM 1 FROM public.projects WHERE id = v_project_id FOR UPDATE;
      PERFORM public.capture_project_floor_baseline(v_project_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_project_status_cancel_before() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_project_status_cancel_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project_id uuid;
BEGIN
  IF OLD.status NOT IN ('POSTED', 'REVERSED') AND NEW.status = 'REVERSED'
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    FOR v_project_id IN
      SELECT DISTINCT l.project_id
      FROM public.journal_entry_lines l
      WHERE l.journal_entry_id = OLD.id AND l.project_id IS NOT NULL
      ORDER BY l.project_id
    LOOP
      PERFORM public.check_project_wip_floor(v_project_id);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_project_status_cancel_after() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_je_status_cancel_lock ON public.journal_entries;
CREATE TRIGGER trg_je_status_cancel_lock
  BEFORE UPDATE OF status ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_project_status_cancel_before();

DROP TRIGGER IF EXISTS trg_je_status_cancel_floor ON public.journal_entries;
CREATE CONSTRAINT TRIGGER trg_je_status_cancel_floor
  AFTER UPDATE OF status ON public.journal_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.guard_project_status_cancel_after();

-- ROLLBACK on r6 only:
-- DROP TRIGGER IF EXISTS trg_je_status_cancel_floor ON public.journal_entries;
-- DROP TRIGGER IF EXISTS trg_je_status_cancel_lock ON public.journal_entries;
-- DROP FUNCTION IF EXISTS public.guard_project_status_cancel_after();
-- DROP FUNCTION IF EXISTS public.guard_project_status_cancel_before();
