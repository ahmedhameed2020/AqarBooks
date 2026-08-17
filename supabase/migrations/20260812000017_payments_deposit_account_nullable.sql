-- Migration: Make deposit_account_id nullable on public.payments table
-- File: supabase/migrations/20260812000017_payments_deposit_account_nullable.sql

ALTER TABLE public.payments 
  ALTER COLUMN deposit_account_id DROP NOT NULL;
