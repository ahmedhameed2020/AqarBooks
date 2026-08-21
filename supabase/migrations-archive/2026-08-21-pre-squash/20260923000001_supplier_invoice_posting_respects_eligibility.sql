-- ترحيل ضريبة المدخلات — والاكتشاف الذي غيّر المهمة.
--
-- ═══ ما وجدته قبل أن أبني ═══
--
-- `post_supplier_invoice` **كانت تُرحّل الضريبة أصلًا**: تُحمّلها مدينًا كاملةً
-- على حساب يمرره المستدعي (`p_vat_account_id`)، والمصروف بالصافي، والدائنون
-- بالإجمالي. أي أن القيد المطلوب موجود منذ البداية — لكن بعيبين:
--
--   ١. الحساب **يختاره المستدعي** لا النظام.
--   ٢. الضريبة **قابلة للاسترداد دائمًا** بلا أي إثبات أهلية: لا إعلان، ولا
--      رقم تسجيل للمورد، ولا مستند — ومع ذلك يُنشأ أصل ضريبة مدخلات.
--
-- فالمهمة لم تكن «أضف ترحيلًا» بل **«اجعل الترحيل القائم يحترم الأهلية»**.
--
-- ═══ القاعدة المطبَّقة ═══
--
--   قابل بالكامل   →  المصروف بالصافي · أصل الضريبة بالكامل · الدائنون بالإجمالي
--   غير قابل        →  المصروف بالإجمالي (الضريبة تكلفة) · **لا أصل**
--   مختلط           →  الجزء القابل أصل، والباقي تكلفة على حساب المصروف
--
-- والدائن **بالإجمالي دائمًا**: ما يُدفع للمورد لا يتغير بأهلية الاسترداد.
--
-- ═══ الفصل بين التسجيل وحق المطالبة ═══
--
-- غياب الإعلان أو المستند أو رقم تسجيل المورد **لا يمنع تسجيل المصروف** — يمنع
-- إنشاء **الأصل** فقط، فتصير الضريبة تكلفةً. وهذا هو الفصل الصحيح: المشترى
-- حدث ويُسجَّل، والمطالبة حق يحتاج إثباتًا. ورفض الترحيل هنا كان سيعطّل
-- المشتريات في كل مؤسسة لم تُعلن بعد، وهو ضرر بلا مقابل.
--
-- ═══ مصدر واحد للتقسيم ═══
--
-- `compute_input_tax_split` يستعمله الترحيل وتسجيل القرار معًا. حسابان منفصلان
-- للمنطق نفسه ينحرفان عند أول تعديل، فيصير القيد يقول شيئًا والقرار غيره.
--
-- ═══ ما لم يُفعل ═══
--
-- **لا تُعاد كتابة أي قيد تاريخي.** الفواتير المرحَّلة سابقًا قد تحمل أصل ضريبة
-- لا تثبت أهليته — وتصحيحها قرار محاسبي بفترات قد تكون مغلقة، لا أثر جانبي
-- لهذا التغيير.

create or replace function public.compute_input_tax_split(
  p_organization_id uuid,
  p_expense_account_id uuid,
  p_supplier_id uuid,
  p_invoice_number text,
  p_vat_amount numeric,
  p_decimals integer
)
returns table (
  eligible boolean,
  ineligible_reason text,
  recoverability text,
  recoverable_ratio numeric,
  recoverable_amount numeric,
  non_recoverable_amount numeric,
  input_tax_account_id uuid,
  declaration_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_decl record;
  v_supplier_tax text;
  v_vat numeric(19,4);
  v_recoverable numeric(19,4);
  v_account uuid;
begin
  v_vat := round(coalesce(p_vat_amount, 0), p_decimals);

  eligible := false;
  recoverability := 'NON_RECOVERABLE';
  recoverable_ratio := 0;
  recoverable_amount := 0;
  non_recoverable_amount := v_vat;
  input_tax_account_id := null;
  declaration_id := null;

  if v_vat <= 0 then
    ineligible_reason := 'NO_TAX';
    return next; return;
  end if;

  if nullif(btrim(coalesce(p_invoice_number, '')), '') is null then
    ineligible_reason := 'SUPPLIER_INVOICE_MISSING';
    return next; return;
  end if;

  select * into v_decl
  from public.expense_account_input_tax
  where organization_id = p_organization_id and expense_account_id = p_expense_account_id;

  if v_decl.id is null or v_decl.status <> 'APPROVED' then
    ineligible_reason := 'INPUT_TAX_RECOVERABILITY_UNDECLARED';
    return next; return;
  end if;

  declaration_id := v_decl.id;
  recoverability := v_decl.recoverability;

  -- غير القابل حالة **معلنة ومعتمدة**، لا نقص: مؤهل للتسجيل، بلا أصل.
  if v_decl.recoverability = 'NON_RECOVERABLE' then
    eligible := true;
    return next; return;
  end if;

  select s.tax_number into v_supplier_tax
  from public.suppliers s where s.id = p_supplier_id;

  if nullif(btrim(coalesce(v_supplier_tax, '')), '') is null then
    ineligible_reason := 'SUPPLIER_TAX_ID_MISSING';
    recoverable_ratio := 0;
    return next; return;
  end if;

  v_account := public.resolve_input_tax_account(p_organization_id);
  if v_account is null then
    ineligible_reason := 'INPUT_TAX_ACCOUNT_MISSING';
    recoverable_ratio := 0;
    return next; return;
  end if;

  if v_decl.recoverability = 'FULLY_RECOVERABLE' then
    recoverable_ratio := 1;
    v_recoverable := v_vat;
  else
    recoverable_ratio := v_decl.recoverable_ratio;
    v_recoverable := round(v_vat * v_decl.recoverable_ratio, p_decimals);
  end if;

  eligible := true;
  recoverable_amount := v_recoverable;
  non_recoverable_amount := v_vat - v_recoverable;
  input_tax_account_id := case when v_recoverable > 0 then v_account else null end;
  return next;
end;
$$;

-- الترحيل يُرقَّع على **جسمه المنشور** لا بلصق تعريف كامل: لصق تعريف كامل هو
-- بالضبط ما أعاد خطأ `clone_chart_of_accounts_template` بعد إصلاحه من قبل.
do $do$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'post_supplier_invoice';

  if v_def is null then
    raise exception 'post_supplier_invoice not found';
  end if;

  v_old := 'v_debit_lines := jsonb_build_array(jsonb_build_object(''account_id'', p_expense_account_id, ''debit'', v_taxable_base, ''credit'', 0));
  if v_vat_amount > 0 then
    v_debit_lines := v_debit_lines || jsonb_build_array(jsonb_build_object(''account_id'', p_vat_account_id, ''debit'', v_vat_amount, ''credit'', 0));
  end if;';

  if position(v_old in v_def) = 0 then
    -- إمّا رُقّع بالفعل، أو تغيّر الجسم فلا يجوز الترقيع الأعمى.
    raise notice 'posting block not found; leaving post_supplier_invoice untouched';
    return;
  end if;

  v_new := 'v_debit_lines := jsonb_build_array(jsonb_build_object(''account_id'', p_expense_account_id, ''debit'', v_taxable_base, ''credit'', 0));
  -- ضريبة المدخلات كانت تُحمَّل كاملةً على حساب يمرره المستدعي، أي **أصلًا
  -- قابلًا للاسترداد دائمًا** بلا أي إثبات أهلية. صار التقسيم من نموذج الأهلية:
  -- الجزء القابل أصل على الحساب المحلول، والباقي تكلفة على حساب المصروف.
  if v_vat_amount > 0 then
    v_debit_lines := v_debit_lines || (
      select case
        when s.recoverable_amount > 0 and s.non_recoverable_amount > 0 then
          jsonb_build_array(
            jsonb_build_object(''account_id'', s.input_tax_account_id,
                               ''debit'', s.recoverable_amount, ''credit'', 0),
            jsonb_build_object(''account_id'', p_expense_account_id,
                               ''debit'', s.non_recoverable_amount, ''credit'', 0))
        when s.recoverable_amount > 0 then
          jsonb_build_array(
            jsonb_build_object(''account_id'', s.input_tax_account_id,
                               ''debit'', s.recoverable_amount, ''credit'', 0))
        else
          jsonb_build_array(
            jsonb_build_object(''account_id'', p_expense_account_id,
                               ''debit'', v_vat_amount, ''credit'', 0))
      end
      from public.compute_input_tax_split(
        p_organization_id, p_expense_account_id, p_supplier_id, p_invoice_number, v_vat_amount,
        public.currency_decimals(
          coalesce((select default_currency from public.organizations where id = p_organization_id), ''EGP''))
      ) s
    );
  end if;';

  v_def := replace(v_def, v_old, v_new);
  execute v_def;
end
$do$;
