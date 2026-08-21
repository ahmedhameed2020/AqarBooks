-- Phase 1 security remediation — migration 1 of 4
--
-- Pins search_path on the 17 application functions that did not set one.
--
-- Scope note: none of these is SECURITY DEFINER -- every one runs as
-- SECURITY INVOKER. The baseline audit framed this as a privilege-escalation
-- vector, which was wrong; pre-flight corrected it. This is defence-in-depth
-- hardening so a caller-controlled search_path cannot change how these
-- resolve unqualified names, not the closure of a live hole.
--
-- Eleven of the seventeen are trigger functions guarding financial
-- immutability (prevent_unreverse_*, prevent_uncancel_*, forbid_*,
-- validate_*), which is why they are worth pinning even at SECURITY INVOKER.
--
-- ALTER FUNCTION ... SET search_path changes only the function's
-- configuration. No function body is modified by this migration.
--
-- btree_gist is deliberately NOT relocated out of `public` here: it backs the
-- unit_leases_no_overlapping_active and tax_rule_no_overlap exclusion
-- constraints, and moving it would require dropping and recreating both,
-- suspending those correctness guarantees during the window.

ALTER FUNCTION public.check_coa_no_loop()                                SET search_path = 'public';
ALTER FUNCTION public.forbid_online_txn_mutation_after_pending()         SET search_path = 'public';
ALTER FUNCTION public.import_property_csv(uuid,text,jsonb,uuid,boolean)  SET search_path = 'public';
ALTER FUNCTION public.lease_rent_period_key(text,date)                   SET search_path = 'public';
ALTER FUNCTION public.lease_rent_period_range(text,text)                 SET search_path = 'public';
ALTER FUNCTION public.list_revenue_natures()                             SET search_path = 'public';
ALTER FUNCTION public.lock_coa_after_use()                               SET search_path = 'public';
ALTER FUNCTION public.normalize_phone(text)                              SET search_path = 'public';
ALTER FUNCTION public.prevent_delete_used_coa()                          SET search_path = 'public';
ALTER FUNCTION public.prevent_uncancel_supplier_invoice()                SET search_path = 'public';
ALTER FUNCTION public.prevent_unreverse_payment()                        SET search_path = 'public';
ALTER FUNCTION public.prevent_unreverse_payment_allocation()             SET search_path = 'public';
ALTER FUNCTION public.prevent_unreverse_supplier_payment()               SET search_path = 'public';
ALTER FUNCTION public.prevent_unreverse_supplier_payment_allocation()    SET search_path = 'public';
ALTER FUNCTION public.set_updated_at()                                   SET search_path = 'public';
ALTER FUNCTION public.validate_online_payments_clearing_account()        SET search_path = 'public';
ALTER FUNCTION public.validate_payment_provider_settings_scope()         SET search_path = 'public';
