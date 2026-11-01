CREATE OR REPLACE FUNCTION public.check_project_wip_floor(p_project_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$

