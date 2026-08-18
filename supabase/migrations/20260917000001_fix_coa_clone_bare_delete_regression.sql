-- انحدار قائم — ليس من عمل التصنيف الضريبي، بل كشفه تشغيل E2E الكامل.
--
-- `clone_chart_of_accounts_template` تستعمل جدولًا مؤقتًا وتفرغه في بدايتها.
-- امتداد `safeupdate` المفعَّل على هذه القاعدة يرفض `DELETE` بلا `WHERE` ويرفع
-- `DELETE requires a WHERE clause`، فيفشل استنساخ دليل الحسابات القياسي بالكامل.
--
-- وقد أُصلح هذا **مرة من قبل** في
-- `20260813000004_fix_coa_clone_template_safe_delete.sql`، ثم أعادته
-- `20260831000001_cash_flow_account_classification.sql` حين أعادت تعريف الدالة
-- كاملةً لإضافة تصنيف التدفق النقدي، فحملت معها السطر القديم. هذا نمط متكرر:
-- إعادة تعريف دالة كاملة تُلغي إصلاحًا لاحقًا لا يعرف كاتبها بوجوده.
--
-- الأثر: أي مؤسسة تستنسخ دليل الحسابات القياسي تفشل — وهو أول ما تفعله مؤسسة
-- جديدة. اكتُشف لأن `supplier-invoice-vat-wht.spec.ts` يستنسخه في تهيئته.
--
-- الإصلاح يُطبَّق على **الجسم المنشور أيًّا كان** بدل إعادة لصق تعريف كامل:
-- إعادة اللصق هي بالضبط ما أعاد الخطأ أول مرة. ولا أثر له إن كان مُصلحًا فعلًا.

do $do$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'clone_chart_of_accounts_template';

  if v_def is null then
    raise exception 'clone_chart_of_accounts_template not found';
  end if;

  if position('delete from _coa_clone_map;' in v_def) = 0 then
    raise notice 'already safe; nothing to do';
    return;
  end if;

  v_def := replace(v_def, 'delete from _coa_clone_map;', 'delete from _coa_clone_map where true;');
  execute v_def;
end
$do$;
