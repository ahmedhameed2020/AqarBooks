-- Migration: Member Phones, Primary Phone Sync Trigger, and Atomic Ownership RPC

-- 1. Create member_phones table
CREATE TABLE IF NOT EXISTS public.member_phones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  normalized_phone text NOT NULL,
  label text NOT NULL DEFAULT 'PERSONAL' CHECK (label IN ('PERSONAL', 'WORK', 'WHATSAPP', 'HOME', 'OTHER')),
  is_primary boolean NOT NULL DEFAULT false,
  can_receive_whatsapp boolean NOT NULL DEFAULT false,
  is_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for search and uniqueness constraints
CREATE INDEX IF NOT EXISTS idx_member_phones_member ON public.member_phones (member_id);
CREATE INDEX IF NOT EXISTS idx_member_phones_normalized ON public.member_phones (organization_id, normalized_phone);
CREATE UNIQUE INDEX IF NOT EXISTS idx_member_phones_one_primary ON public.member_phones (member_id) WHERE is_primary = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_member_phones_unique_num ON public.member_phones (member_id, normalized_phone);

-- 2. Updated_at Trigger for member_phones
DROP TRIGGER IF EXISTS trg_member_phones_updated_at ON public.member_phones;
CREATE TRIGGER trg_member_phones_updated_at
  BEFORE UPDATE ON public.member_phones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. SQL Phone Normalization Function (Handles Eastern Arabic Digits & Characters)
CREATE OR REPLACE FUNCTION public.normalize_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_res text;
BEGIN
  IF p_phone IS NULL THEN RETURN NULL; END IF;
  v_res := trim(p_phone);
  -- Replace Eastern Arabic numerals
  v_res := translate(v_res, '٠١٢٣٤٥٦٧٨٩', '0123456789');
  -- Remove spaces, dashes, parentheses
  v_res := regexp_replace(v_res, '[\s\-\(\)]', '', 'g');
  RETURN v_res;
END;
$$;

-- 4. Primary Phone Automatic Sync Trigger for Legacy members.phone Alignment
CREATE OR REPLACE FUNCTION public.sync_member_primary_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id uuid;
  v_primary_phone text;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_member_id := OLD.member_id;
  ELSE
    v_member_id := NEW.member_id;
  END IF;

  -- Select current primary phone number or fallback to most recent
  SELECT phone_number INTO v_primary_phone
  FROM public.member_phones
  WHERE member_id = v_member_id
  ORDER BY is_primary DESC, created_at DESC
  LIMIT 1;

  UPDATE public.members
  SET phone = v_primary_phone,
      updated_at = now()
  WHERE id = v_member_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_member_primary_phone ON public.member_phones;
CREATE TRIGGER trg_sync_member_primary_phone
  AFTER INSERT OR UPDATE OR DELETE ON public.member_phones
  FOR EACH ROW EXECUTE FUNCTION public.sync_member_primary_phone();

-- 5. Data Migration for Existing Members
INSERT INTO public.member_phones (organization_id, member_id, phone_number, normalized_phone, label, is_primary, can_receive_whatsapp)
SELECT 
  organization_id,
  id AS member_id,
  phone AS phone_number,
  public.normalize_phone(phone) AS normalized_phone,
  'PERSONAL' AS label,
  true AS is_primary,
  false AS can_receive_whatsapp
FROM public.members
WHERE phone IS NOT NULL AND trim(phone) != ''
ON CONFLICT (member_id, normalized_phone) DO NOTHING;

-- 6. Strict RLS Policies for member_phones
ALTER TABLE public.member_phones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "member_phones_select" ON public.member_phones;
CREATE POLICY "member_phones_select" ON public.member_phones
  FOR SELECT USING (
    public.has_permission(auth.uid(), organization_id, 'property.members.view') OR
    public.has_permission(auth.uid(), organization_id, 'property.members.manage')
  );

DROP POLICY IF EXISTS "member_phones_insert" ON public.member_phones;
CREATE POLICY "member_phones_insert" ON public.member_phones
  FOR INSERT WITH CHECK (
    public.has_permission(auth.uid(), organization_id, 'property.members.manage') AND
    public.is_org_member(auth.uid(), organization_id)
  );

DROP POLICY IF EXISTS "member_phones_update" ON public.member_phones;
CREATE POLICY "member_phones_update" ON public.member_phones
  FOR UPDATE USING (
    public.has_permission(auth.uid(), organization_id, 'property.members.manage')
  ) WITH CHECK (
    public.has_permission(auth.uid(), organization_id, 'property.members.manage')
  );

DROP POLICY IF EXISTS "member_phones_delete" ON public.member_phones;
CREATE POLICY "member_phones_delete" ON public.member_phones
  FOR DELETE USING (
    public.has_permission(auth.uid(), organization_id, 'property.members.manage')
  );

-- 7. Atomic RPC for Linking Ownership with Concurrency Lock & Total Share Verification
CREATE OR REPLACE FUNCTION public.link_unit_ownership(
  p_organization_id uuid,
  p_unit_id uuid,
  p_member_id uuid,
  p_share_percentage numeric,
  p_is_primary_contact boolean DEFAULT true,
  p_start_date date DEFAULT current_date,
  p_end_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit_org uuid;
  v_member_org uuid;
  v_existing_shares numeric;
  v_new_ownership_id uuid;
BEGIN
  -- Concurrency lock per unit
  PERFORM pg_advisory_xact_lock(hashtext('unit_ownership_' || p_unit_id::text));

  -- Permission Check
  IF NOT public.has_permission(auth.uid(), p_organization_id, 'property.members.manage') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: ليس لديك صلاحية ربط الملكية' USING ERRCODE = '42501';
  END IF;

  -- Verify Unit Organization Match
  SELECT organization_id INTO v_unit_org FROM public.units WHERE id = p_unit_id;
  IF v_unit_org IS NULL OR v_unit_org != p_organization_id THEN
    RAISE EXCEPTION 'INVALID_UNIT: الوحدة المحددة غير موجودة في هذا الكيان' USING ERRCODE = '22023';
  END IF;

  -- Verify Member Organization Match
  SELECT organization_id INTO v_member_org FROM public.members WHERE id = p_member_id;
  IF v_member_org IS NULL OR v_member_org != p_organization_id THEN
    RAISE EXCEPTION 'INVALID_MEMBER: العضو المحدد غير موجود في هذا الكيان' USING ERRCODE = '22023';
  END IF;

  -- Calculate Active Ownership Share Sum
  SELECT COALESCE(SUM(share_percentage), 0) INTO v_existing_shares
  FROM public.unit_ownerships
  WHERE unit_id = p_unit_id AND (end_date IS NULL OR end_date >= current_date);

  IF (v_existing_shares + p_share_percentage) > 100.00 THEN
    RAISE EXCEPTION 'SHARE_OVERFLOW: إجمالي نسب الملكية الحالية (%) بالإضافة للنسبة الجديدة ينتهي إلى أكثر من 100%%', v_existing_shares USING ERRCODE = '22023';
  END IF;

  -- If new contact is primary, reset existing active primary contacts for this unit
  IF p_is_primary_contact THEN
    UPDATE public.unit_ownerships
    SET is_primary_contact = false
    WHERE unit_id = p_unit_id AND (end_date IS NULL OR end_date >= current_date);
  END IF;

  -- Insert Ownership Row
  INSERT INTO public.unit_ownerships (
    organization_id, unit_id, member_id, share_percentage, is_primary_contact, start_date, end_date
  ) VALUES (
    p_organization_id, p_unit_id, p_member_id, p_share_percentage, p_is_primary_contact, p_start_date, p_end_date
  ) RETURNING id INTO v_new_ownership_id;

  RETURN jsonb_build_object('success', true, 'ownership_id', v_new_ownership_id);
END;
$$;
