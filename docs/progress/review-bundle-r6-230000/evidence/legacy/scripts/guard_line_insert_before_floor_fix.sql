CREATE OR REPLACE FUNCTION public.guard_project_line_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$

