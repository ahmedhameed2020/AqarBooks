CREATE OR REPLACE FUNCTION public.guard_project_line_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.project_id IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM 1 FROM public.projects WHERE id = NEW.project_id FOR UPDATE;
  RETURN NEW;
END;
$function$

