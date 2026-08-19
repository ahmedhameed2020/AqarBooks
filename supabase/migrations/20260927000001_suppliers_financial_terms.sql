-- Migration: Add financial terms and bank details to suppliers table
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS tax_number text,
  ADD COLUMN IF NOT EXISTS commercial_registry text,
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS secondary_phone text,
  ADD COLUMN IF NOT EXISTS bank_account_details text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_iban text,
  ADD COLUMN IF NOT EXISTS payment_terms_days integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS credit_limit numeric(19,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS category text;
