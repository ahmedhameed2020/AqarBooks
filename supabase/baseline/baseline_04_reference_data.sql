-- Baseline file 4 of 5 -- REFERENCE DATA SEED
--
-- Applied last: after the schema, the auth companion and the security postamble.
--
-- TRANSPORT -- INSERT, not COPY
-- The previous attempt used `--use-copy`, producing `COPY ... FROM stdin`: a
-- form requiring a client that streams the following lines as data. The
-- Management API executes SQL text only, so line 29 was parsed as a statement
-- and the apply failed with `42601 syntax error at or near "RESORT_STANDARD"`.
-- That was a transport incompatibility, not a data defect -- but INSERT is the
-- right choice regardless: 456 rows is a trivial volume, and a security-
-- sensitive artefact worth reading line by line beats a faster load path.
--
-- NO `ON CONFLICT DO NOTHING`
-- Deliberately absent. This reproduces a database from zero; it is not an
-- idempotent migration. A row that already exists means the target was not the
-- empty database it is supposed to be, and that must fail loudly rather than be
-- skipped in silence -- exactly the condition that would make a gate result
-- meaningless.
--
-- `session_replication_role = replica` REMOVED
-- pg_dump emits it to suppress triggers and foreign-key checks during a bulk
-- load. It is stripped here on purpose: with it, `plan_entitlements -> plans`
-- and `role_template_permissions -> role_templates/permissions` would load
-- without being validated. Keeping the checks live means a successful apply is
-- itself evidence that the reference data is internally consistent.
--
-- CONTENTS -- 456 rows across 8 reference tables, plus one global role.
-- No tenant data: generated with `-s public` and 92 explicit table exclusions,
-- then proven by set-equality of every UUID against production's reference
-- primary keys.

BEGIN;

INSERT INTO "public"."coa_templates" ("key", "name_ar", "name_en") VALUES
	('RESORT_STANDARD', 'دليل الحسابات القياسي للمنتجعات', 'Standard Resort Chart of Accounts');

INSERT INTO "public"."coa_template_accounts" ("id", "template_key", "sort_order", "code", "parent_code", "name_ar", "name_en", "category", "normal_balance", "is_group", "is_cash_equivalent", "cash_flow_section") VALUES
	('f0727d6d-e9f5-43db-9ad1-9b0694e31ca6', 'RESORT_STANDARD', 1, '1000', NULL, 'الأصول', 'Assets', 'ASSET', 'DEBIT', true, false, NULL),
	('23d6be87-485f-49fe-95e0-756d7987c619', 'RESORT_STANDARD', 2, '1100', '1000', 'الأصول المتداولة', 'Current Assets', 'ASSET', 'DEBIT', true, false, NULL),
	('2b05eecb-9cf6-4e0f-8eef-8afa98b601fd', 'RESORT_STANDARD', 6, '1200', '1000', 'الأصول الثابتة', 'Fixed Assets', 'ASSET', 'DEBIT', true, false, NULL),
	('2574d24b-8409-4230-885a-e6586aeddb82', 'RESORT_STANDARD', 9, '2000', NULL, 'الخصوم', 'Liabilities', 'LIABILITY', 'CREDIT', true, false, NULL),
	('cfe8afa5-4977-49e3-9746-40ba08ab3ea9', 'RESORT_STANDARD', 12, '3000', NULL, 'حقوق الملكية', 'Equity', 'EQUITY', 'CREDIT', true, false, NULL),
	('005eb716-2e48-4789-a2a1-6dbf0c34f8a7', 'RESORT_STANDARD', 14, '4000', NULL, 'الإيرادات', 'Revenue', 'REVENUE', 'CREDIT', true, false, NULL),
	('1342a66d-40f7-489f-a5f6-8c407937eb28', 'RESORT_STANDARD', 18, '5000', NULL, 'المصروفات', 'Expenses', 'EXPENSE', 'DEBIT', true, false, NULL),
	('c3abee61-14a5-4a4d-9d18-19c9d886466b', 'RESORT_STANDARD', 3, '1110', '1100', 'الصندوق', 'Cash on Hand', 'ASSET', 'DEBIT', false, true, NULL),
	('19f1514f-fcd1-4659-bf05-87f41f01cf9f', 'RESORT_STANDARD', 4, '1120', '1100', 'البنوك', 'Banks', 'ASSET', 'DEBIT', false, true, NULL),
	('c13fbc01-eaf3-47bb-a158-71631291b114', 'RESORT_STANDARD', 5, '1130', '1100', 'ذمم الأعضاء المدينة', 'Accounts Receivable - Members', 'ASSET', 'DEBIT', false, false, 'OPERATING'),
	('cfd4124a-3826-4594-bd9c-bcb0c55db9ca', 'RESORT_STANDARD', 10, '2100', '2000', 'ذمم الموردين الدائنة', 'Accounts Payable - Suppliers', 'LIABILITY', 'CREDIT', false, false, 'OPERATING'),
	('f85c6abc-d061-43b6-9ca9-a1165d71a7d5', 'RESORT_STANDARD', 11, '2200', '2000', 'إيرادات مقبوضة مقدمًا', 'Unearned Revenue', 'LIABILITY', 'CREDIT', false, false, 'OPERATING'),
	('87fa7c6a-a874-4c46-8953-e47fed78bb03', 'RESORT_STANDARD', 15, '4100', '4000', 'إيرادات اشتراكات الصيانة', 'Maintenance Fee Revenue', 'REVENUE', 'CREDIT', false, false, 'OPERATING'),
	('34f60e4b-4440-415f-a9fc-510b3dcd9b7e', 'RESORT_STANDARD', 16, '4200', '4000', 'إيرادات رسوم العضوية', 'Membership Fee Revenue', 'REVENUE', 'CREDIT', false, false, 'OPERATING'),
	('0847b67b-8b7f-4b68-8c74-42f6369bf21f', 'RESORT_STANDARD', 17, '4300', '4000', 'إيرادات أخرى', 'Other Revenue', 'REVENUE', 'CREDIT', false, false, 'OPERATING'),
	('2e13e135-1860-4b31-be42-432338acb568', 'RESORT_STANDARD', 19, '5100', '5000', 'الرواتب والأجور', 'Salaries & Wages', 'EXPENSE', 'DEBIT', false, false, 'OPERATING'),
	('9d085f3a-742c-45e8-b50b-b5a350a3209f', 'RESORT_STANDARD', 20, '5200', '5000', 'الصيانة والتشغيل', 'Maintenance & Operations', 'EXPENSE', 'DEBIT', false, false, 'OPERATING'),
	('25f358be-9528-4922-a111-88f7c9250429', 'RESORT_STANDARD', 21, '5300', '5000', 'المرافق (كهرباء ومياه)', 'Utilities', 'EXPENSE', 'DEBIT', false, false, 'OPERATING'),
	('a14cc56f-73c4-46ae-b5c8-1f16b737acfe', 'RESORT_STANDARD', 22, '5400', '5000', 'مصروفات إدارية عامة', 'General & Administrative', 'EXPENSE', 'DEBIT', false, false, 'OPERATING'),
	('3d90aa2a-a5c9-4b23-89b3-ba36d2fe2524', 'RESORT_STANDARD', 7, '1210', '1200', 'مبانٍ ومنشآت', 'Buildings & Facilities', 'ASSET', 'DEBIT', false, false, 'INVESTING'),
	('9dd4911a-13bf-477b-a291-213e6353dded', 'RESORT_STANDARD', 8, '1220', '1200', 'مجمع الإهلاك', 'Accumulated Depreciation', 'ASSET', 'DEBIT', false, false, 'INVESTING'),
	('9307e3c1-902f-4bb9-a301-2d29af4384f7', 'RESORT_STANDARD', 13, '3100', '3000', 'الأرباح المرحّلة', 'Retained Earnings', 'EQUITY', 'CREDIT', false, false, 'FINANCING'),
	('b0e31738-1893-486e-ac0f-dd8160b13e08', 'RESORT_STANDARD', 23, '2300', '2000', 'ضريبة مخرجات مستحقة', 'Output Tax Payable', 'LIABILITY', 'CREDIT', false, false, 'OPERATING'),
	('51bd9b26-594b-4073-b4f7-de5166146c6c', 'RESORT_STANDARD', 24, '1140', '1100', 'ضريبة مدخلات قابلة للاسترداد', 'Recoverable Input Tax', 'ASSET', 'DEBIT', false, false, 'OPERATING');

INSERT INTO "public"."permissions" ("id", "key", "description") VALUES
	('4228356f-a24f-427a-bed8-280739f3e8f7', 'platform.organizations.manage', 'Create, suspend, reactivate organizations'),
	('f41dd8ee-b53b-4b1d-a8ac-295130ae8196', 'platform.subscriptions.manage', 'Assign plans and manage entitlements'),
	('c3c64b9a-6c40-433c-8790-7c0180249593', 'platform.audit.view', 'View platform-wide audit logs'),
	('11650e77-9e56-4111-a080-cc9ff76d5eb3', 'tenant.settings.manage', 'Manage organization profile, resorts, branding, financial settings'),
	('7d55dfb9-4b35-4eed-b807-9495c228f4e0', 'tenant.users.manage', 'Manage organization users, invitations, memberships'),
	('5ebb917a-3379-4160-ab8e-8cee01a96832', 'tenant.roles.manage', 'Manage organization roles and permission grants'),
	('69dbb48a-1ef0-4ba3-a6e3-927356a3c75c', 'property.units.view', 'View property units'),
	('cd9f241f-a48b-4aeb-bfc1-7bb654583374', 'property.units.manage', 'Manage property units'),
	('b880ce9f-c87a-405b-879d-351db72b2de8', 'property.members.view', 'View owners/members'),
	('764229dd-5d10-49a9-8cdf-3a32877a46e0', 'property.members.manage', 'Manage owners/members'),
	('3c3e8a8a-14dd-459a-8767-bed39ef9f738', 'finance.accounts.view', 'View chart of accounts'),
	('390d4173-6ba9-48d7-a0db-4cfcdc5cc9d0', 'finance.accounts.manage', 'Manage chart of accounts'),
	('1b1f35ee-d999-4715-807d-48e21721a327', 'finance.entries.create', 'Create journal entries'),
	('cdb07a01-d2e7-4f30-bac6-f252f3c192f6', 'finance.entries.review', 'Review journal entries'),
	('003a4503-5d04-4041-926b-fe3779b3b63f', 'finance.entries.post', 'Post journal entries'),
	('a6f2c50e-c770-4134-8271-e2b8173c5a2a', 'finance.entries.reverse', 'Reverse posted journal entries'),
	('2acf2eb2-e82c-4b74-b4f8-8e09dc277508', 'finance.periods.manage', 'Manage fiscal years and periods'),
	('9436b217-d17b-46f6-acd9-1f4dfe7fc14b', 'finance.reports.view', 'View financial reports'),
	('33934426-a8c1-4b6e-9123-cac421dae5ef', 'receivables.dues.create', 'Create dues'),
	('bad69c74-0ed0-486c-b291-775d0c8c230f', 'receivables.payments.create', 'Create payments'),
	('85d846f9-8b31-4e7b-964c-c0626cce0099', 'receivables.allocations.manage', 'Manage payment allocations'),
	('40888e42-556b-44f6-800e-333dcd5d3539', 'cashier.sessions.open', 'Open cashier sessions'),
	('4a38d1e9-c20f-40b2-8732-6520f99ead0b', 'cashier.sessions.close', 'Close cashier sessions'),
	('f66eb67a-886d-4ed4-bcef-60b0df6a93cc', 'cashier.transactions.create', 'Create cashier transactions'),
	('a45b1927-38d8-4475-a721-53c43d12356a', 'cashier.reconciliations.approve', 'Approve cashier reconciliations'),
	('0eae72b9-17e8-42d6-84a9-5f5d523b468c', 'banking.accounts.view', 'View bank accounts'),
	('d0e7ec37-9689-4cd6-80c6-16f38649d6e8', 'banking.cheques.manage', 'Manage cheques'),
	('b379de1c-453c-4b8e-bc32-06937574bc20', 'banking.reconciliations.manage', 'Manage bank reconciliations'),
	('9155198f-1b4c-4d25-b305-8cbf2d578127', 'inventory.items.manage', 'Manage inventory items'),
	('67d7d7a8-5553-4a20-a9e2-4d86272454a3', 'inventory.transactions.create', 'Create inventory transactions'),
	('7dc3dec4-9daa-45e7-9566-eaf78eb28387', 'inventory.adjustments.approve', 'Approve inventory adjustments'),
	('ce517338-d3ab-47fa-a41e-4ba408d6580f', 'purchasing.requests.create', 'Create purchase requests'),
	('04df2b75-8f30-4eb3-af84-cae4e8674e4e', 'purchasing.orders.approve', 'Approve purchase orders'),
	('e969ee9f-a24b-40a1-89ee-d4af1484670e', 'finance.payments.read', 'قراءة سجل الدفعات والإيصالات المالية'),
	('3f0176bd-badc-40e1-af69-d73f91df027e', 'finance.payments.create', 'تسجيل الدفعات وتحصيل الرسوم وتوزيعها'),
	('bb2cdbdd-3a42-4dec-8eec-8e930cfb680e', 'finance.dues.read', 'قراءة كشوف المستحقات ورصيد الديون'),
	('482eddac-f113-4b99-a284-431f1238a171', 'finance.dues.issue', 'إصدار المستحقات اليدوية الفردية والجماعية'),
	('c2f96681-1ca9-47fb-907a-9a258e8ef143', 'finance.schedules.read', 'قراءة الجداول والرسوم الدورية'),
	('3316b55a-f6ea-43fb-96c9-bbf41631ddab', 'finance.schedules.manage', 'إنشاء وتعديل وتفعيل الجداول الدورية'),
	('751b6759-9ca1-496c-835f-375ebdbb6815', 'finance.schedules.generate', 'التوليد الفوري للدورة المالية الآن'),
	('3506066a-987d-48c5-b620-c0dabc6ab51e', 'finance.reports.read', 'قراءة التقارير المالية وكشوف الحساب والميزانيات'),
	('fbf4377e-ff58-4a2c-8d52-08e40fff1c71', 'finance.reports.export', 'تصدير التقارير المالية بصيغة CSV أو PDF'),
	('06af1f25-6410-4c8f-b38d-92214c8e3a98', 'finance.audit.read', 'قراءة سجل التدقيق المالي المشفّر'),
	('3a4cb8ac-51aa-4a65-9f4f-95bc70d1b155', 'finance.audit.verify', 'تشغيل فحص سلامة سلسلة التشفير SHA-256'),
	('8bb704d5-5b6e-45c2-8e77-6e10f4587df0', 'finance.payments.void', 'إلغاء دفعة مسجَّلة (عكس محاسبي دون حذف)'),
	('06506bad-8392-4141-b5e8-7d6338a038b0', 'finance.expenses.read', 'قراءة سجل المصروفات وسندات الصرف'),
	('eea54123-734c-4b78-9305-dd4e770f00f0', 'finance.service_charges.read', 'الاطلاع على تحصيلات رسوم الخدمة وتوزيعها على الوحدات'),
	('c41b62cf-7e02-4bed-85e4-3e1d30267278', 'finance.suppliers.read', 'قراءة بيانات الموردين وطلبات وأوامر الشراء والفواتير والدفعات'),
	('b0d60e78-9f50-466b-879f-adbf70f2cdcd', 'finance.budgets.manage', 'إدارة الميزانيات التقديرية للحسابات لكل فترة مالية'),
	('1ab2f99b-fd8b-4253-819c-9010316aa5bc', 'finance.suppliers.void', 'إلغاء فاتورة مورد أو عكس دفعة مسددة له (عكس محاسبي دون حذف)'),
	('5305b7c7-c71e-460a-ad2f-523c6920c7b5', 'members.portal.invite', 'دعوة عضو (مالك) لإنشاء حساب في بوابة الملاك الذاتية'),
	('e2720f4f-7533-4873-8d1f-2d035a6f856a', 'finance.online_payments.manage', 'إدارة إعدادات مزودي الدفع الإلكتروني (Manage online payment provider settings)'),
	('e7cad0f6-1a04-489c-a3ba-4ebbeba1fe79', 'property.leases.view', 'عرض عقود الإيجار والإشغال'),
	('1cb25622-d6cd-4377-94e6-50a5de5ff7dc', 'property.leases.manage', 'إدارة عقود الإيجار والإشغال (إنشاء، تفعيل، إنهاء)'),
	('f6b90b8c-f372-4d51-bfa1-af777aa1e561', 'property.installments.view', 'عرض خطط التقسيط'),
	('4008104d-6662-4bd9-a5dd-8de2571d4092', 'property.installments.manage', 'إدارة خطط التقسيط (إنشاء، إلغاء)'),
	('e2e432de-bf71-48a8-8ceb-a19e82babdb0', 'finance.bank_reconciliation.read', 'الاطلاع على كشوف الحسابات البنكية والمطابقات'),
	('2a36bd49-2dcd-4237-b1be-18247964d707', 'finance.bank_reconciliation.manage', 'استيراد كشوف الحسابات البنكية وتنفيذ المطابقة واعتمادها'),
	('b5a536fe-e643-4074-809c-8e5fa4d724d1', 'finance.service_charges.manage', 'إنشاء تحصيلات رسوم الخدمة وحساب التوزيع وإصدارها على الوحدات'),
	('24709092-fc90-468d-9be3-dda45973d9ca', 'finance.commissions.read', 'الاطلاع على الوسطاء وعمولاتهم'),
	('856e50e3-93d6-44d9-8f37-1c276caa6314', 'finance.commissions.manage', 'إضافة الوسطاء وتسجيل استحقاق العمولات وسدادها'),
	('14c88d5c-e441-4081-9958-ce241a71bb90', 'property.handover.read', 'الاطلاع على تسليم الوحدات وقوائم الملاحظات'),
	('a1f13ee1-c601-4e56-b53f-61cb0722a88e', 'property.handover.manage', 'جدولة تسليم الوحدات وتسجيل الملاحظات واعتماد التسليم'),
	('7bdb05ca-01e9-41f0-8592-b1045d695b49', 'finance.einvoice.read', 'الاطلاع على حالة الفواتير الإلكترونية وسجل إرسالها'),
	('1cf58bde-2898-4265-8a80-a3a96537380a', 'finance.einvoice.manage', 'ضبط التسجيل لدى مصلحة الضرائب وإرسال الفواتير الإلكترونية'),
	('6f6b7549-4d4e-4356-915a-da3a8a04a177', 'finance.tax_mapping.read', 'الاطلاع على ربط أنواع المستحقات بطبيعة الإيراد والقرارات الضريبية'),
	('3fc89a3e-2a87-4484-9280-af1f1fe15793', 'finance.tax_mapping.manage', 'ربط أنواع المستحقات بطبيعة الإيراد واعتمادها'),
	('b75fd988-f070-473b-9cac-81c6b0a3f7d7', 'finance.tax_enforcement.manage', 'تفعيل أو إيقاف الإنفاذ الضريبي للمؤسسة'),
	('531c6fdd-11f2-429e-8bbb-044a5a79d4ac', 'finance.assets.read', 'الاطلاع على سجل الأصول الثابتة وإهلاكها'),
	('05b21a38-8757-4f0d-85f6-ec4e6f96130d', 'finance.assets.manage', 'تسجيل الأصول الثابتة وترحيل الإهلاك'),
	('9a34c54a-2076-417c-a98d-f3ae4a4ec4a0', 'finance.fx.read', 'الاطلاع على أسعار الصرف'),
	('6ac66a7e-2a23-42ef-9901-6c2cc344914c', 'finance.fx.manage', 'تسجيل أسعار الصرف وتعديلها'),
	('4b05ae1e-2a58-4688-8ec6-f0c24cf8165d', 'finance.dunning.read', 'الاطلاع على سياسات وإشعارات التحصيل'),
	('3542b267-81bd-4a7f-a6f5-60ec6b3f371f', 'finance.dunning.manage', 'ضبط سياسات التحصيل ورفع الإشعارات');

INSERT INTO "public"."plans" ("id", "key", "name_ar", "name_en", "sort_order", "created_at") VALUES
	('da6711ae-16fd-4409-9da2-896d68227ba6', 'STARTER', 'الأساسية', 'Starter', 1, '2026-08-10 12:54:06.042068+00'),
	('a09b61fb-6ee2-4446-9fc4-6bd70eb11b33', 'PROFESSIONAL', 'الاحترافية', 'Professional', 2, '2026-08-10 12:54:06.042068+00'),
	('8ffcdb95-43db-4df8-85e1-d045d8272563', 'ENTERPRISE', 'المؤسسية', 'Enterprise', 3, '2026-08-10 12:54:06.042068+00');

INSERT INTO "public"."plan_entitlements" ("id", "plan_id", "key", "value") VALUES
	('f42b9295-0d65-4e54-9cdc-df6572dc0958', 'da6711ae-16fd-4409-9da2-896d68227ba6', 'max_resorts', '1'),
	('bcc6ac98-e478-42ad-bd04-2dd3fdc17716', 'da6711ae-16fd-4409-9da2-896d68227ba6', 'max_users', '5'),
	('977f40cc-625e-4eed-9448-e7a3d0dff7fa', 'da6711ae-16fd-4409-9da2-896d68227ba6', 'max_units', '100'),
	('c149c612-0223-41da-8a17-96b3a97177e9', 'da6711ae-16fd-4409-9da2-896d68227ba6', 'finance_module', 'true'),
	('2823c4d5-db46-4f78-87a1-3834696474d1', 'da6711ae-16fd-4409-9da2-896d68227ba6', 'cashier_module', 'true'),
	('f5f57a73-4f51-4ef6-b379-f599835c8a95', 'da6711ae-16fd-4409-9da2-896d68227ba6', 'banking_module', 'false'),
	('ec899a24-3e45-43d5-a178-11d2eaeb1e79', 'da6711ae-16fd-4409-9da2-896d68227ba6', 'fixed_assets_module', 'false'),
	('80694aa9-9824-4aa3-bf5d-732067e4b0fd', 'da6711ae-16fd-4409-9da2-896d68227ba6', 'inventory_module', 'false'),
	('1faf49f1-b230-4280-99df-b785981b868f', 'da6711ae-16fd-4409-9da2-896d68227ba6', 'purchasing_module', 'false'),
	('ccf1274b-e910-4a10-a0a2-14e5bc9866ca', 'da6711ae-16fd-4409-9da2-896d68227ba6', 'advanced_reports', 'false'),
	('5fc3a707-6fe4-4535-8919-a17fc78f5df4', 'da6711ae-16fd-4409-9da2-896d68227ba6', 'white_label', 'false'),
	('2effa5b7-3af8-492d-ab66-af75e2002dbf', 'da6711ae-16fd-4409-9da2-896d68227ba6', 'api_access', 'false'),
	('317ce911-4b1e-42a9-a262-4742d84fc8c4', 'da6711ae-16fd-4409-9da2-896d68227ba6', 'audit_retention_days', '30'),
	('f0f583a5-ef36-4ce1-8496-fc76075ae08a', 'da6711ae-16fd-4409-9da2-896d68227ba6', 'priority_support', 'false'),
	('f53387b0-c24a-429c-9ca3-981457e68629', 'a09b61fb-6ee2-4446-9fc4-6bd70eb11b33', 'max_resorts', '3'),
	('6608cfa4-9c32-4eda-8dd1-25143ca3527a', 'a09b61fb-6ee2-4446-9fc4-6bd70eb11b33', 'max_users', '25'),
	('f98779f8-bfa9-4434-8577-409ab9ea314a', 'a09b61fb-6ee2-4446-9fc4-6bd70eb11b33', 'max_units', '1000'),
	('e3e9b9ae-65d3-419c-99bd-05bd986318c7', 'a09b61fb-6ee2-4446-9fc4-6bd70eb11b33', 'finance_module', 'true'),
	('b74096c5-ae48-4686-8e4c-9f5ab5b11dce', 'a09b61fb-6ee2-4446-9fc4-6bd70eb11b33', 'cashier_module', 'true'),
	('3e46a215-4044-47ef-a7f1-9c00b6bdeee5', 'a09b61fb-6ee2-4446-9fc4-6bd70eb11b33', 'banking_module', 'true'),
	('d342ad41-821a-4784-a01f-e5f9b6f9da42', 'a09b61fb-6ee2-4446-9fc4-6bd70eb11b33', 'fixed_assets_module', 'true'),
	('5796f2cf-a42d-4852-9b53-cb44f7488f79', 'a09b61fb-6ee2-4446-9fc4-6bd70eb11b33', 'inventory_module', 'true'),
	('3e66927a-5779-4948-aeed-847ed3c33308', 'a09b61fb-6ee2-4446-9fc4-6bd70eb11b33', 'purchasing_module', 'false'),
	('f34a2727-46e2-4cb6-8517-bae9455af475', 'a09b61fb-6ee2-4446-9fc4-6bd70eb11b33', 'advanced_reports', 'true'),
	('3217ac2c-a83b-4690-a934-0bfd68a0c720', 'a09b61fb-6ee2-4446-9fc4-6bd70eb11b33', 'white_label', 'false'),
	('2dea28d3-f545-4e45-8ac5-86f804c3b226', 'a09b61fb-6ee2-4446-9fc4-6bd70eb11b33', 'api_access', 'false'),
	('493ead8a-45ae-44f5-94b8-2fbaa3f5e271', 'a09b61fb-6ee2-4446-9fc4-6bd70eb11b33', 'audit_retention_days', '180'),
	('69126009-9b16-4736-a8b8-1dad0f84144d', 'a09b61fb-6ee2-4446-9fc4-6bd70eb11b33', 'priority_support', 'false'),
	('2d18d11a-f3ba-4715-80cb-5c3b038c7ba8', '8ffcdb95-43db-4df8-85e1-d045d8272563', 'max_resorts', '-1'),
	('b5b7c3c3-7d36-4e09-bb69-c7ce34ac5583', '8ffcdb95-43db-4df8-85e1-d045d8272563', 'max_users', '-1'),
	('71abd6bb-1006-4763-a34e-73e372994392', '8ffcdb95-43db-4df8-85e1-d045d8272563', 'max_units', '-1'),
	('c5119bd5-0d60-4218-b7a0-4601cc4f866d', '8ffcdb95-43db-4df8-85e1-d045d8272563', 'finance_module', 'true'),
	('ff603f5c-a8cf-44ab-bc1b-2fe248b93f93', '8ffcdb95-43db-4df8-85e1-d045d8272563', 'cashier_module', 'true'),
	('deb6be7c-7ba7-4ec5-83de-81fd6cdc6e7c', '8ffcdb95-43db-4df8-85e1-d045d8272563', 'banking_module', 'true'),
	('a22aca8c-bc99-4323-9b14-22243f10adb5', '8ffcdb95-43db-4df8-85e1-d045d8272563', 'fixed_assets_module', 'true'),
	('5df6f529-0a8a-411c-b810-4a3c7c124ef2', '8ffcdb95-43db-4df8-85e1-d045d8272563', 'inventory_module', 'true'),
	('93fa22eb-68c3-4b29-8d7b-0a029e3d14e5', '8ffcdb95-43db-4df8-85e1-d045d8272563', 'purchasing_module', 'true'),
	('8091ef53-ab69-4f2e-b3c2-0ca52aeaff7c', '8ffcdb95-43db-4df8-85e1-d045d8272563', 'advanced_reports', 'true'),
	('6d27102a-3a82-4f29-ae9e-0ba0babf29ad', '8ffcdb95-43db-4df8-85e1-d045d8272563', 'white_label', 'true'),
	('8466ec8d-bd61-40ec-8275-bceef4897dad', '8ffcdb95-43db-4df8-85e1-d045d8272563', 'api_access', 'true'),
	('4e375b38-b85a-41cb-9066-095eaf31fb4b', '8ffcdb95-43db-4df8-85e1-d045d8272563', 'audit_retention_days', '365'),
	('c4ed42e0-2ceb-4651-a935-0a03ef2f5c41', '8ffcdb95-43db-4df8-85e1-d045d8272563', 'priority_support', 'true');

INSERT INTO "public"."revenue_natures" ("code", "name_ar", "name_en", "is_derived", "sort_order", "created_at") VALUES
	('RESIDENTIAL_RENT', 'إيجار وحدة سكنية', 'Residential Rent', false, 1, '2026-08-18 14:33:37.706927+00'),
	('COMMERCIAL_RENT', 'إيجار وحدة تجارية', 'Commercial Rent', false, 2, '2026-08-18 14:33:37.706927+00'),
	('RESIDENTIAL_UNIT_SALE', 'بيع وحدة سكنية', 'Residential Unit Sale', false, 3, '2026-08-18 14:33:37.706927+00'),
	('COMMERCIAL_UNIT_SALE', 'بيع وحدة تجارية', 'Commercial Unit Sale', false, 4, '2026-08-18 14:33:37.706927+00'),
	('SALE_BOOKING_PAYMENT', 'دفعة حجز', 'Booking / Reservation', true, 5, '2026-08-18 14:33:37.706927+00'),
	('SALE_DOWN_PAYMENT', 'مقدم بيع', 'Down Payment', true, 6, '2026-08-18 14:33:37.706927+00'),
	('SALE_INSTALLMENT', 'قسط وحدة', 'Unit Installment', true, 7, '2026-08-18 14:33:37.706927+00'),
	('SALE_FINAL_PAYMENT', 'الدفعة النهائية', 'Final Unit Payment', true, 8, '2026-08-18 14:33:37.706927+00'),
	('SALE_ADMINISTRATIVE_FEE', 'رسوم إدارية للبيع', 'Administrative Fee - Sale', false, 9, '2026-08-18 14:33:37.706927+00'),
	('TRANSFER_FEE', 'رسوم نقل أو تنازل', 'Transfer Fee', false, 10, '2026-08-18 14:33:37.706927+00'),
	('MANAGEMENT_FEE', 'رسوم إدارة', 'Management Fee', false, 11, '2026-08-18 14:33:37.706927+00'),
	('MAINTENANCE_SERVICE', 'رسوم صيانة', 'Maintenance Fee', false, 12, '2026-08-18 14:33:37.706927+00'),
	('SECURITY_SERVICE', 'أمن وحراسة', 'Security Fee', false, 13, '2026-08-18 14:33:37.706927+00'),
	('CLEANING_SERVICE', 'نظافة', 'Cleaning Fee', false, 14, '2026-08-18 14:33:37.706927+00'),
	('LANDSCAPING_SERVICE', 'تنسيق حدائق', 'Landscaping Fee', false, 15, '2026-08-18 14:33:37.706927+00'),
	('CLUB_OR_FACILITY_SERVICE', 'استخدام مرافق أو نادٍ', 'Facility / Club Fee', false, 16, '2026-08-18 14:33:37.706927+00'),
	('UTILITY_RECHARGE', 'إعادة تحميل مرافق', 'Utilities Recharge', false, 17, '2026-08-18 14:33:37.706927+00'),
	('UTILITY_ADMINISTRATION_FEE', 'رسوم إدارة مرافق', 'Utility Administration Fee', false, 18, '2026-08-18 14:33:37.706927+00'),
	('LATE_PAYMENT_PENALTY', 'غرامة تأخير', 'Late Payment Penalty', false, 19, '2026-08-18 14:33:37.706927+00'),
	('RESERVATION_CANCELLATION_FEE', 'رسوم إلغاء حجز', 'Reservation Cancellation Fee', false, 20, '2026-08-18 14:33:37.706927+00'),
	('REFUND_RENT', 'رد إيجار', 'Refund - Rent', true, 21, '2026-08-18 14:33:37.706927+00'),
	('REFUND_INSTALLMENT', 'رد قسط', 'Refund - Installment', true, 22, '2026-08-18 14:33:37.706927+00'),
	('REFUND_SERVICE', 'رد رسوم خدمة', 'Refund - Service', true, 23, '2026-08-18 14:33:37.706927+00'),
	('SECURITY_DEPOSIT', 'تأمين قابل للرد', 'Security Deposit', false, 24, '2026-08-18 14:33:37.706927+00'),
	('DEPOSIT_APPLIED_TO_SALE', 'تأمين محوَّل للبيع', 'Deposit Applied to Sale', true, 25, '2026-08-18 14:33:37.706927+00'),
	('DEPOSIT_FORFEITED', 'تأمين مصادَر', 'Deposit Forfeited', false, 26, '2026-08-18 14:33:37.706927+00'),
	('PARKING_FEE', 'رسوم موقف سيارات', 'Parking Fee', false, 27, '2026-08-18 14:33:37.706927+00'),
	('ACCESS_CARD_FEE', 'كارت دخول', 'Access Card Fee', false, 28, '2026-08-18 14:33:37.706927+00'),
	('REPLACEMENT_CARD_FEE', 'بدل فاقد', 'Replacement Card Fee', false, 29, '2026-08-18 14:33:37.706927+00'),
	('GUEST_SERVICE_FEE', 'خدمة للزائر', 'Guest Service Fee', false, 30, '2026-08-18 14:33:37.706927+00'),
	('RENTAL_MANAGEMENT_COMMISSION', 'عمولة إدارة تأجير', 'Rental Management Commission', false, 31, '2026-08-18 14:33:37.706927+00'),
	('BROKER_COMMISSION', 'عمولة وساطة', 'Broker / Commission Income', false, 32, '2026-08-18 14:33:37.706927+00'),
	('ADVERTISING_PROMOTION_FEE', 'إعلان أو ترويج', 'Advertising / Promotion Fee', false, 33, '2026-08-18 14:33:37.706927+00'),
	('EVENT_VENUE_FEE', 'تأجير مكان لحدث', 'Event / Venue Fee', false, 34, '2026-08-18 14:33:37.706927+00'),
	('CONTRACTOR_RECHARGE', 'تحميل تكلفة مقاول', 'Contractor Recharge', false, 35, '2026-08-18 14:33:37.706927+00'),
	('INTEREST_FINANCING_CHARGE', 'فوائد أو رسوم تمويل', 'Interest / Financing Charge', false, 36, '2026-08-18 14:33:37.706927+00'),
	('OWNER_ASSOCIATION_CONTRIBUTION', 'مساهمة اتحاد ملاك', 'Owners Association Contribution', false, 37, '2026-08-18 14:33:37.706927+00');

INSERT INTO "public"."role_templates" ("key", "name_ar", "name_en", "sort_order") VALUES
	('TENANT_OWNER', 'مالك المنظمة', 'Tenant Owner', 1),
	('TENANT_ADMIN', 'مدير النظام', 'Tenant Admin', 2),
	('GENERAL_MANAGER', 'المدير العام', 'General Manager', 3),
	('FINANCE_MANAGER', 'المدير المالي', 'Finance Manager', 4),
	('ACCOUNTANT', 'محاسب', 'Accountant', 5),
	('CASHIER', 'أمين خزينة', 'Cashier', 6),
	('COLLECTOR', 'محصّل', 'Collector', 7),
	('AUDITOR', 'مراجع', 'Auditor', 8),
	('PROPERTY_MANAGER', 'مدير أملاك', 'Property Manager', 9),
	('STOREKEEPER', 'أمين مخزن', 'Storekeeper', 10),
	('PURCHASING_MANAGER', 'مدير مشتريات', 'Purchasing Manager', 11),
	('VIEWER', 'مشاهد', 'Viewer', 12);

INSERT INTO "public"."role_template_permissions" ("role_template_key", "permission_key") VALUES
	('TENANT_OWNER', 'tenant.settings.manage'),
	('TENANT_OWNER', 'tenant.users.manage'),
	('TENANT_OWNER', 'tenant.roles.manage'),
	('TENANT_OWNER', 'property.units.view'),
	('TENANT_OWNER', 'property.units.manage'),
	('TENANT_OWNER', 'property.members.view'),
	('TENANT_OWNER', 'property.members.manage'),
	('TENANT_OWNER', 'finance.accounts.view'),
	('TENANT_OWNER', 'finance.accounts.manage'),
	('TENANT_OWNER', 'finance.entries.create'),
	('TENANT_OWNER', 'finance.entries.review'),
	('TENANT_OWNER', 'finance.entries.post'),
	('TENANT_OWNER', 'finance.entries.reverse'),
	('TENANT_OWNER', 'finance.periods.manage'),
	('TENANT_OWNER', 'finance.reports.view'),
	('TENANT_OWNER', 'finance.reports.export'),
	('TENANT_OWNER', 'receivables.dues.create'),
	('TENANT_OWNER', 'receivables.payments.create'),
	('TENANT_OWNER', 'receivables.allocations.manage'),
	('TENANT_OWNER', 'cashier.sessions.open'),
	('TENANT_OWNER', 'cashier.sessions.close'),
	('TENANT_OWNER', 'cashier.transactions.create'),
	('TENANT_OWNER', 'cashier.reconciliations.approve'),
	('TENANT_OWNER', 'banking.accounts.view'),
	('TENANT_OWNER', 'banking.cheques.manage'),
	('TENANT_OWNER', 'banking.reconciliations.manage'),
	('TENANT_OWNER', 'inventory.items.manage'),
	('TENANT_OWNER', 'inventory.transactions.create'),
	('TENANT_OWNER', 'inventory.adjustments.approve'),
	('TENANT_OWNER', 'purchasing.requests.create'),
	('TENANT_OWNER', 'purchasing.orders.approve'),
	('TENANT_ADMIN', 'tenant.settings.manage'),
	('TENANT_ADMIN', 'tenant.users.manage'),
	('TENANT_ADMIN', 'tenant.roles.manage'),
	('TENANT_ADMIN', 'property.units.view'),
	('TENANT_ADMIN', 'property.members.view'),
	('TENANT_ADMIN', 'finance.reports.view'),
	('GENERAL_MANAGER', 'property.units.view'),
	('GENERAL_MANAGER', 'property.members.view'),
	('GENERAL_MANAGER', 'finance.reports.view'),
	('GENERAL_MANAGER', 'finance.reports.export'),
	('GENERAL_MANAGER', 'receivables.dues.create'),
	('GENERAL_MANAGER', 'receivables.payments.create'),
	('GENERAL_MANAGER', 'cashier.reconciliations.approve'),
	('GENERAL_MANAGER', 'banking.accounts.view'),
	('GENERAL_MANAGER', 'inventory.adjustments.approve'),
	('GENERAL_MANAGER', 'purchasing.orders.approve'),
	('FINANCE_MANAGER', 'finance.accounts.view'),
	('FINANCE_MANAGER', 'finance.accounts.manage'),
	('FINANCE_MANAGER', 'finance.entries.create'),
	('FINANCE_MANAGER', 'finance.entries.review'),
	('FINANCE_MANAGER', 'finance.entries.post'),
	('FINANCE_MANAGER', 'finance.entries.reverse'),
	('FINANCE_MANAGER', 'finance.periods.manage'),
	('FINANCE_MANAGER', 'finance.reports.view'),
	('FINANCE_MANAGER', 'finance.reports.export'),
	('FINANCE_MANAGER', 'receivables.dues.create'),
	('FINANCE_MANAGER', 'receivables.payments.create'),
	('FINANCE_MANAGER', 'receivables.allocations.manage'),
	('FINANCE_MANAGER', 'banking.accounts.view'),
	('FINANCE_MANAGER', 'banking.cheques.manage'),
	('FINANCE_MANAGER', 'banking.reconciliations.manage'),
	('FINANCE_MANAGER', 'cashier.reconciliations.approve'),
	('ACCOUNTANT', 'finance.accounts.view'),
	('ACCOUNTANT', 'finance.entries.create'),
	('ACCOUNTANT', 'finance.entries.review'),
	('ACCOUNTANT', 'finance.reports.view'),
	('ACCOUNTANT', 'receivables.dues.create'),
	('ACCOUNTANT', 'receivables.payments.create'),
	('ACCOUNTANT', 'receivables.allocations.manage'),
	('CASHIER', 'cashier.sessions.open'),
	('CASHIER', 'cashier.sessions.close'),
	('CASHIER', 'cashier.transactions.create'),
	('CASHIER', 'receivables.payments.create'),
	('COLLECTOR', 'property.units.view'),
	('COLLECTOR', 'property.members.view'),
	('COLLECTOR', 'receivables.payments.create'),
	('AUDITOR', 'finance.accounts.view'),
	('AUDITOR', 'finance.reports.view'),
	('AUDITOR', 'finance.reports.export'),
	('AUDITOR', 'property.units.view'),
	('AUDITOR', 'property.members.view'),
	('AUDITOR', 'banking.accounts.view'),
	('PROPERTY_MANAGER', 'property.units.view'),
	('PROPERTY_MANAGER', 'property.units.manage'),
	('PROPERTY_MANAGER', 'property.members.view'),
	('PROPERTY_MANAGER', 'property.members.manage'),
	('STOREKEEPER', 'inventory.items.manage'),
	('STOREKEEPER', 'inventory.transactions.create'),
	('PURCHASING_MANAGER', 'purchasing.requests.create'),
	('PURCHASING_MANAGER', 'purchasing.orders.approve'),
	('VIEWER', 'finance.reports.view'),
	('VIEWER', 'property.units.view'),
	('VIEWER', 'property.members.view'),
	('TENANT_OWNER', 'finance.payments.read'),
	('TENANT_OWNER', 'finance.payments.create'),
	('TENANT_OWNER', 'finance.dues.read'),
	('TENANT_OWNER', 'finance.dues.issue'),
	('TENANT_OWNER', 'finance.schedules.read'),
	('TENANT_OWNER', 'finance.schedules.manage'),
	('TENANT_OWNER', 'finance.schedules.generate'),
	('TENANT_OWNER', 'finance.reports.read'),
	('TENANT_OWNER', 'finance.audit.read'),
	('TENANT_OWNER', 'finance.audit.verify'),
	('TENANT_ADMIN', 'finance.reports.read'),
	('TENANT_ADMIN', 'finance.dues.read'),
	('TENANT_ADMIN', 'finance.schedules.read'),
	('TENANT_ADMIN', 'finance.payments.read'),
	('TENANT_ADMIN', 'finance.audit.read'),
	('GENERAL_MANAGER', 'finance.reports.read'),
	('GENERAL_MANAGER', 'finance.dues.read'),
	('GENERAL_MANAGER', 'finance.dues.issue'),
	('GENERAL_MANAGER', 'finance.payments.read'),
	('GENERAL_MANAGER', 'finance.payments.create'),
	('GENERAL_MANAGER', 'finance.schedules.read'),
	('FINANCE_MANAGER', 'finance.payments.read'),
	('FINANCE_MANAGER', 'finance.payments.create'),
	('FINANCE_MANAGER', 'finance.dues.read'),
	('FINANCE_MANAGER', 'finance.dues.issue'),
	('FINANCE_MANAGER', 'finance.schedules.read'),
	('FINANCE_MANAGER', 'finance.schedules.manage'),
	('FINANCE_MANAGER', 'finance.schedules.generate'),
	('FINANCE_MANAGER', 'finance.reports.read'),
	('FINANCE_MANAGER', 'finance.audit.read'),
	('ACCOUNTANT', 'finance.reports.read'),
	('ACCOUNTANT', 'finance.dues.read'),
	('ACCOUNTANT', 'finance.dues.issue'),
	('ACCOUNTANT', 'finance.payments.read'),
	('ACCOUNTANT', 'finance.payments.create'),
	('ACCOUNTANT', 'finance.schedules.read'),
	('CASHIER', 'finance.payments.read'),
	('CASHIER', 'finance.payments.create'),
	('CASHIER', 'finance.dues.read'),
	('CASHIER', 'finance.schedules.read'),
	('CASHIER', 'finance.reports.read'),
	('COLLECTOR', 'finance.dues.read'),
	('COLLECTOR', 'finance.payments.read'),
	('COLLECTOR', 'finance.payments.create'),
	('AUDITOR', 'finance.reports.read'),
	('AUDITOR', 'finance.dues.read'),
	('AUDITOR', 'finance.schedules.read'),
	('AUDITOR', 'finance.payments.read'),
	('AUDITOR', 'finance.audit.read'),
	('AUDITOR', 'finance.audit.verify'),
	('PROPERTY_MANAGER', 'finance.dues.read'),
	('PROPERTY_MANAGER', 'finance.schedules.read'),
	('PROPERTY_MANAGER', 'finance.payments.read'),
	('VIEWER', 'finance.reports.read'),
	('VIEWER', 'finance.dues.read'),
	('VIEWER', 'finance.schedules.read'),
	('VIEWER', 'finance.payments.read'),
	('FINANCE_MANAGER', 'finance.payments.void'),
	('FINANCE_MANAGER', 'finance.expenses.read'),
	('ACCOUNTANT', 'finance.expenses.read'),
	('AUDITOR', 'finance.expenses.read'),
	('TENANT_OWNER', 'finance.payments.void'),
	('TENANT_OWNER', 'finance.expenses.read'),
	('TENANT_OWNER', 'finance.suppliers.read'),
	('PURCHASING_MANAGER', 'finance.suppliers.read'),
	('GENERAL_MANAGER', 'finance.suppliers.read'),
	('FINANCE_MANAGER', 'finance.suppliers.read'),
	('ACCOUNTANT', 'finance.suppliers.read'),
	('AUDITOR', 'finance.suppliers.read'),
	('TENANT_OWNER', 'finance.budgets.manage'),
	('FINANCE_MANAGER', 'finance.budgets.manage'),
	('TENANT_OWNER', 'finance.suppliers.void'),
	('FINANCE_MANAGER', 'finance.suppliers.void'),
	('TENANT_OWNER', 'members.portal.invite'),
	('FINANCE_MANAGER', 'members.portal.invite'),
	('ACCOUNTANT', 'members.portal.invite'),
	('PROPERTY_MANAGER', 'members.portal.invite'),
	('TENANT_OWNER', 'finance.online_payments.manage'),
	('FINANCE_MANAGER', 'finance.online_payments.manage'),
	('TENANT_OWNER', 'property.leases.view'),
	('TENANT_OWNER', 'property.leases.manage'),
	('TENANT_ADMIN', 'property.leases.view'),
	('GENERAL_MANAGER', 'property.leases.view'),
	('PROPERTY_MANAGER', 'property.leases.view'),
	('PROPERTY_MANAGER', 'property.leases.manage'),
	('FINANCE_MANAGER', 'property.leases.view'),
	('ACCOUNTANT', 'property.leases.view'),
	('COLLECTOR', 'property.leases.view'),
	('AUDITOR', 'property.leases.view'),
	('VIEWER', 'property.leases.view'),
	('TENANT_OWNER', 'property.installments.view'),
	('TENANT_OWNER', 'property.installments.manage'),
	('TENANT_ADMIN', 'property.installments.view'),
	('GENERAL_MANAGER', 'property.installments.view'),
	('PROPERTY_MANAGER', 'property.installments.view'),
	('PROPERTY_MANAGER', 'property.installments.manage'),
	('FINANCE_MANAGER', 'property.installments.view'),
	('ACCOUNTANT', 'property.installments.view'),
	('COLLECTOR', 'property.installments.view'),
	('AUDITOR', 'property.installments.view'),
	('VIEWER', 'property.installments.view'),
	('TENANT_OWNER', 'finance.bank_reconciliation.read'),
	('TENANT_OWNER', 'finance.bank_reconciliation.manage'),
	('FINANCE_MANAGER', 'finance.bank_reconciliation.read'),
	('FINANCE_MANAGER', 'finance.bank_reconciliation.manage'),
	('ACCOUNTANT', 'finance.bank_reconciliation.read'),
	('ACCOUNTANT', 'finance.bank_reconciliation.manage'),
	('AUDITOR', 'finance.bank_reconciliation.read'),
	('TENANT_OWNER', 'finance.service_charges.read'),
	('TENANT_OWNER', 'finance.service_charges.manage'),
	('FINANCE_MANAGER', 'finance.service_charges.read'),
	('FINANCE_MANAGER', 'finance.service_charges.manage'),
	('ACCOUNTANT', 'finance.service_charges.read'),
	('ACCOUNTANT', 'finance.service_charges.manage'),
	('PROPERTY_MANAGER', 'finance.service_charges.read'),
	('AUDITOR', 'finance.service_charges.read'),
	('TENANT_OWNER', 'finance.commissions.read'),
	('TENANT_OWNER', 'finance.commissions.manage'),
	('FINANCE_MANAGER', 'finance.commissions.read'),
	('FINANCE_MANAGER', 'finance.commissions.manage'),
	('ACCOUNTANT', 'finance.commissions.read'),
	('ACCOUNTANT', 'finance.commissions.manage'),
	('PROPERTY_MANAGER', 'finance.commissions.read'),
	('AUDITOR', 'finance.commissions.read'),
	('TENANT_OWNER', 'property.handover.read'),
	('TENANT_OWNER', 'property.handover.manage'),
	('PROPERTY_MANAGER', 'property.handover.read'),
	('PROPERTY_MANAGER', 'property.handover.manage'),
	('GENERAL_MANAGER', 'property.handover.read'),
	('AUDITOR', 'property.handover.read'),
	('TENANT_OWNER', 'finance.einvoice.read'),
	('TENANT_OWNER', 'finance.einvoice.manage'),
	('FINANCE_MANAGER', 'finance.einvoice.read'),
	('FINANCE_MANAGER', 'finance.einvoice.manage'),
	('ACCOUNTANT', 'finance.einvoice.read'),
	('ACCOUNTANT', 'finance.einvoice.manage'),
	('AUDITOR', 'finance.einvoice.read'),
	('TENANT_OWNER', 'finance.tax_mapping.read'),
	('TENANT_OWNER', 'finance.tax_mapping.manage'),
	('FINANCE_MANAGER', 'finance.tax_mapping.read'),
	('FINANCE_MANAGER', 'finance.tax_mapping.manage'),
	('ACCOUNTANT', 'finance.tax_mapping.read'),
	('ACCOUNTANT', 'finance.tax_mapping.manage'),
	('TENANT_OWNER', 'finance.tax_enforcement.manage'),
	('FINANCE_MANAGER', 'finance.tax_enforcement.manage'),
	('TENANT_OWNER', 'finance.assets.read'),
	('TENANT_OWNER', 'finance.assets.manage'),
	('FINANCE_MANAGER', 'finance.assets.read'),
	('FINANCE_MANAGER', 'finance.assets.manage'),
	('ACCOUNTANT', 'finance.assets.read'),
	('ACCOUNTANT', 'finance.assets.manage'),
	('PROPERTY_MANAGER', 'finance.assets.read'),
	('AUDITOR', 'finance.assets.read'),
	('TENANT_OWNER', 'finance.fx.read'),
	('TENANT_OWNER', 'finance.fx.manage'),
	('FINANCE_MANAGER', 'finance.fx.read'),
	('FINANCE_MANAGER', 'finance.fx.manage'),
	('ACCOUNTANT', 'finance.fx.read'),
	('ACCOUNTANT', 'finance.fx.manage'),
	('AUDITOR', 'finance.fx.read'),
	('CASHIER', 'finance.fx.read'),
	('TENANT_OWNER', 'finance.dunning.read'),
	('TENANT_OWNER', 'finance.dunning.manage'),
	('FINANCE_MANAGER', 'finance.dunning.read'),
	('FINANCE_MANAGER', 'finance.dunning.manage'),
	('ACCOUNTANT', 'finance.dunning.read'),
	('COLLECTOR', 'finance.dunning.read'),
	('COLLECTOR', 'finance.dunning.manage'),
	('AUDITOR', 'finance.dunning.read');

--
-- The single global role, appended by hand.
--
-- pg_dump cannot row-filter, and public.roles holds 6,889 rows of which 6,888
-- are per-tenant clones created at onboarding by clone_tenant_role_templates().
-- Dumping the table wholesale would put every tenant's roles into the baseline.
-- Only the row with organization_id IS NULL belongs here.
--
-- Verified: exactly one such row exists in production, and it is
-- PLATFORM_SUPER_ADMIN. Four integration suites assert this role exists.
--
INSERT INTO public.roles (id, organization_id, key, name_ar, name_en, is_system, created_at)
VALUES ('d7212d4b-8899-4a52-af9a-60be2e6ea79e', NULL, 'PLATFORM_SUPER_ADMIN', 'مدير المنصة العام', 'Platform Super Admin', 't', '2026-08-10 12:17:44.80389+00');

--
-- ASSERTIONS -- inside the transaction, so a failure rolls the seed back
-- entirely rather than leaving the database partly populated.
--
DO $$
DECLARE
  v_total int;
  v_roles int;
  v_tenant int;
  v_bad text;
BEGIN
  SELECT (SELECT count(*) FROM public.permissions)
       + (SELECT count(*) FROM public.role_templates)
       + (SELECT count(*) FROM public.role_template_permissions)
       + (SELECT count(*) FROM public.coa_templates)
       + (SELECT count(*) FROM public.coa_template_accounts)
       + (SELECT count(*) FROM public.revenue_natures)
       + (SELECT count(*) FROM public.plans)
       + (SELECT count(*) FROM public.plan_entitlements)
    INTO v_total;
  IF v_total <> 456 THEN
    RAISE EXCEPTION 'SEED_FAILED: reference rows = %, expected 456.', v_total;
  END IF;

  SELECT count(*) INTO v_roles FROM public.roles;
  IF v_roles <> 1 THEN
    RAISE EXCEPTION 'SEED_FAILED: public.roles holds % rows, expected exactly 1.', v_roles;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.roles
                 WHERE organization_id IS NULL AND key = 'PLATFORM_SUPER_ADMIN') THEN
    RAISE EXCEPTION 'SEED_FAILED: the single role is not the global PLATFORM_SUPER_ADMIN.';
  END IF;

  -- Checked directly, not trusted from the exclusion list: the first seed
  -- attempt leaked 22 auth tables while its exclusion list looked correct.
  SELECT count(*), string_agg(t, ', ' ORDER BY t) INTO v_tenant, v_bad
  FROM (
    SELECT c.relname AS t
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname NOT IN ('permissions','role_templates','role_template_permissions',
                            'coa_templates','coa_template_accounts','revenue_natures',
                            'plans','plan_entitlements','roles')
      AND (xpath('/row/c/text()',
             query_to_xml(format('SELECT count(*) AS c FROM public.%I', c.relname),
                          false, true, '')))[1]::text::int > 0
  ) q;
  IF v_tenant > 0 THEN
    RAISE EXCEPTION 'SEED_FAILED: % tenant table(s) contain rows: %', v_tenant, left(v_bad, 400);
  END IF;
END
$$;

COMMIT;
