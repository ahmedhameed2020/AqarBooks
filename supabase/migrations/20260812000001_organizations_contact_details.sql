-- Adds address/contact/tax fields to organizations so the profile page can
-- show where the entity is located and how to reach it, not just its name.

alter table public.organizations
  add column if not exists address text,
  add column if not exists governorate text,
  add column if not exists city text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists tax_id text;

alter table public.organizations
  drop constraint if exists organizations_governorate_check;

alter table public.organizations
  add constraint organizations_governorate_check
    check (governorate is null or governorate in (
      'القاهرة', 'الجيزة', 'الإسكندرية', 'الدقهلية', 'البحر الأحمر',
      'البحيرة', 'الفيوم', 'الغربية', 'الإسماعيلية', 'المنوفية',
      'المنيا', 'القليوبية', 'الوادي الجديد', 'السويس', 'أسوان',
      'أسيوط', 'بني سويف', 'بورسعيد', 'دمياط', 'الشرقية',
      'جنوب سيناء', 'كفر الشيخ', 'مطروح', 'الأقصر', 'قنا',
      'شمال سيناء', 'سوهاج'
    ));
