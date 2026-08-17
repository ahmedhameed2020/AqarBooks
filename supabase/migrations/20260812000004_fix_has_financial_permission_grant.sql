-- 20260811000005_phase11_financial_rbac.sql revoked EXECUTE on
-- has_financial_permission from both PUBLIC and authenticated, intending to
-- block direct anonymous/public calls. That also blocked every legitimate
-- authenticated call made straight from the app (lib/actions/receivables.ts
-- calls supabase.rpc("has_financial_permission", ...) directly), so every
-- user -- including org owners -- got FORBIDDEN_FINANCE_PERMISSION
-- unconditionally. The function already re-checks auth.uid()/membership/role
-- internally, so it's safe for any authenticated user to call; only PUBLIC
-- (anonymous) access should stay blocked.
GRANT EXECUTE ON FUNCTION public.has_financial_permission(uuid, text, uuid) TO authenticated;
