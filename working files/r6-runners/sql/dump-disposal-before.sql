\pset tuples_only on
\pset format unaligned
SELECT pg_get_functiondef('public.dispose_fixed_asset(uuid,date,numeric,uuid,text)'::regprocedure);
