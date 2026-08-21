-- Migration: Add extra enterprise details to public.suppliers table
-- File: supabase/migrations/20260812000024_suppliers_extra_details.sql

ALTER TABLE public.suppliers 
  ADD COLUMN IF NOT EXISTS tax_number text,
  ADD COLUMN IF NOT EXISTS commercial_registry text,
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS secondary_phone text,
  ADD COLUMN IF NOT EXISTS bank_account_details text;
