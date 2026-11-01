# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: einvoice-flow.spec.ts >> E-Invoicing & Statutory Tax Compliance E2E Flow >> Verify E-Invoice Creation Modal, Tax Calculation, and Stamped Register
- Location: tests\e2e\einvoice-flow.spec.ts:14:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=إنشاء فاتورة إلكترونية جديدة')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('text=إنشاء فاتورة إلكترونية جديدة')

```

```yaml
- banner:
  - link "AqarBooks ERP محاسبة عقارية بذكاء":
    - /url: /ar
  - text: سحابي مباشر
  - button "بحث سريع في الحسابات، الوحدات، والتقارير... ⌘K"
  - button "إجراء سريع"
  - button "الإشعارات والتنبيهات"
  - link "English":
    - /url: /en/finance/einvoice
- complementary:
  - button "تصغير السايدبار (Mini)"
  - textbox "بحث في النظام..."
  - text: ⌘K
  - navigation:
    - link "الرئيسية والداشبورد":
      - /url: /ar/dashboard
    - button "تثبيت في الأعلى"
    - button "العقارات والمشاريع"
    - link "الكيانات والمشاريع":
      - /url: /ar/admin/resorts
    - button "تثبيت في الأعلى"
    - link "الوحدات السكنية والتجارية":
      - /url: /ar/property
    - button "تثبيت في الأعلى"
    - button "توسيع"
    - link "كافة الوحدات":
      - /url: /ar/property
    - link "جدول الإيجارات (Rent Roll)":
      - /url: /ar/finance/reports/rent-roll
    - link "جداول انتهاء العقود":
      - /url: /ar/finance/reports/lease-expirations
    - link "استيراد وحدات":
      - /url: /ar/import
    - link "الأعضاء والملاك":
      - /url: /ar/members
    - button "تثبيت في الأعلى"
    - button "توسيع"
    - link "دليل الملاك والمستأجرين":
      - /url: /ar/members
    - link "كشف حساب الملاك وتوزيعاتهم":
      - /url: /ar/finance/reports/owner-statement
    - link "عمليات الصيانة":
      - /url: /ar/operations/maintenance
    - button "تثبيت في الأعلى"
    - button "توسيع"
    - link "طلبات الصيانة":
      - /url: /ar/operations/maintenance
    - link "أوامر العمل":
      - /url: /ar/operations/maintenance/work-orders
    - link "لوحة العمليات":
      - /url: /ar/operations
    - button "تثبيت في الأعلى"
    - link "تصاريح الزوار":
      - /url: /ar/operations/visitors
    - button "تثبيت في الأعلى"
    - button "توسيع"
    - link "تصاريح الزوار":
      - /url: /ar/operations/visitors
    - link "ماسح البوابة":
      - /url: /ar/operations/gate
    - link "إدارة البوابات":
      - /url: /ar/operations/gates
    - link "سجل الدخول والخروج":
      - /url: /ar/operations/access-events
    - link "الزوار الموجودون حالياً":
      - /url: /ar/operations/gate/occupancy
    - button "تثبيت في الأعلى"
    - link "سجل المركبات":
      - /url: /ar/operations/vehicles
    - button "تثبيت في الأعلى"
    - link "المرافق والحجوزات":
      - /url: /ar/operations/amenities
    - button "تثبيت في الأعلى"
    - button "المحاسبة والمالية"
    - link "دليل الحسابات والقيود":
      - /url: /ar/finance/accounts
    - button "تثبيت في الأعلى"
    - button "توسيع"
    - link "شجرة الحسابات":
      - /url: /ar/finance/accounts
    - link "قيود اليومية المحاسبية":
      - /url: /ar/finance/journals
    - link "الفترات والسنوات المالية":
      - /url: /ar/admin/finance/periods
    - link "الموازنات التقديرية":
      - /url: /ar/finance/budgets
    - link "الأصول الثابتة والإهلاك":
      - /url: /ar/finance/assets
    - link "المشاريع والأعمال تحت التنفيذ":
      - /url: /ar/finance/projects
    - link "أسعار الصرف":
      - /url: /ar/finance/exchange-rates
    - link "الحسابات المعيَّنة":
      - /url: /ar/admin/finance/accounting-accounts
    - link "دفتر الأستاذ العام":
      - /url: /ar/finance/reports/general-ledger
    - link "الاستحقاقات والمقبوضات":
      - /url: /ar/finance/dues
    - button "تثبيت في الأعلى"
    - button "توسيع"
    - link "المطالبات والاستحقاقات":
      - /url: /ar/finance/dues
    - link "سندات القبض والتحصيل":
      - /url: /ar/finance/payments
    - link "رسوم الخدمات والصيانة":
      - /url: /ar/finance/service-charges
    - link "التحصيل والمتأخرات":
      - /url: /ar/finance/dunning
    - link "توزيع تكاليف الخدمات (CAM)":
      - /url: /ar/finance/reports/cam-allocation
    - link "أعمار ديون العملاء (AR)":
      - /url: /ar/finance/reports/aging
    - link "الخزينة والسيولة والشيكات":
      - /url: /ar/finance/cashier
    - button "تثبيت في الأعلى"
    - button "توسيع"
    - link "الخزينة والمقبوضات الفورية":
      - /url: /ar/finance/cashier
    - link "الحسابات البنكية":
      - /url: /ar/finance/banks
    - link "سجل الشيكات الآجلة (PDC)":
      - /url: /ar/finance/reports/pdc
    - link "توقعات السيولة (90 يوم)":
      - /url: /ar/finance/reports/cash-flow-forecast
    - link "المطابقة والتسوية البنكية":
      - /url: /ar/finance/banks/reconciliation
    - link "المشتريات والمصروفات":
      - /url: /ar/finance/suppliers
    - button "تثبيت في الأعلى"
    - button "توسيع"
    - link "الموردون والمقاولون":
      - /url: /ar/finance/suppliers
    - link "سندات الصرف والمصروفات":
      - /url: /ar/finance/expenses
    - link "أعمار ديون الموردين (AP)":
      - /url: /ar/finance/reports/ap-aging
    - link "مصاريف CAPEX / OPEX":
      - /url: /ar/finance/reports/capex-opex
    - link "عمولات الوسطاء والمسوقين":
      - /url: /ar/finance/commissions
    - button "التقارير والقوائم المالية"
    - link "مركز التقارير المالية":
      - /url: /ar/finance/reports
    - button "تثبيت في الأعلى"
    - button "توسيع"
    - link "ميزان المراجعة بالمجاميع":
      - /url: /ar/finance/reports/trial-balance
    - link "قائمة الدخل والأرباح (P&L)":
      - /url: /ar/finance/reports/income-statement
    - link "الميزانية والمركز المالي":
      - /url: /ar/finance/reports/balance-sheet
    - link "قائمة التدفقات النقدية":
      - /url: /ar/finance/reports/cash-flow
    - link "أرباح وخسائر المشاريع":
      - /url: /ar/finance/reports/property-pnl
    - link "الأصول الثابتة والإهلاك":
      - /url: /ar/finance/reports/fixed-assets
    - link "الموازنة مقابل الفعلي":
      - /url: /ar/finance/reports/budget-vs-actual
    - link "سجل التدقيق والحوكمة":
      - /url: /ar/finance/reports/audit-trail
    - button "الضرائب والامتثال"
    - link "الفوترة الإلكترونية والإقرارات":
      - /url: /ar/finance/einvoice
    - button "تثبيت في الأعلى"
    - button "طي"
    - link "القرارات وسجل الفواتير":
      - /url: /ar/finance/einvoice
    - link "إقرار القيمة المضافة (VAT)":
      - /url: /ar/finance/reports/vat-return
    - link "التصنيف والوعاء الضريبي":
      - /url: /ar/finance/tax-mapping
    - link "تكويد أصناف السلع والخدمات":
      - /url: /ar/finance/einvoice-items
    - button "الإعدادات والحساب"
    - link "حسابي والأمان الشخصي":
      - /url: /ar/account
    - button "تثبيت في الأعلى"
    - button "توسيع"
    - link "الملف الشخصي وكلمة المرور":
      - /url: /ar/account
    - link "مركز الإشعارات والتنبيهات":
      - /url: /ar/notifications
    - link "إعدادات المنشأة والبراند":
      - /url: /ar/admin
    - link "المستخدمون وفريق العمل":
      - /url: /ar/admin/users
    - link "الصلاحيات والمصفوفة":
      - /url: /ar/admin/roles
    - link "حوكمة الذكاء الاصطناعي (Shadow Pilot)":
      - /url: /ar/admin/ai-governance
    - link "بوابات الدفع الإلكتروني":
      - /url: /ar/finance/payment-providers
  - link "ا المدير المالي والضريبي einvoice-owner-1793220771216@aqarbooks-test.local مالك المنظمة • منشأة الفوترة والامتثال الضريبي":
    - /url: /ar/account
    - text: ا
    - paragraph: المدير المالي والضريبي
    - paragraph: einvoice-owner-1793220771216@aqarbooks-test.local
    - text: مالك المنظمة • منشأة الفوترة والامتثال الضريبي
  - link "حسابي والأمان":
    - /url: /ar/account
  - button "تسجيل الخروج"
- main:
  - text: الإدارة المالية والضريبية / منظومة الفوترة الإلكترونية والإقرارات 🇪🇬 جمهورية مصر العربية • 14% VAT
  - heading "الفوترة والإقرارات الضريبية الإلكترونية" [level=1]
  - paragraph: إصدار الفواتير الضريبية المعتمدة للوحدات العقارية، احتساب الوعاء والضريبة آلياً، والتكامل اللحظي مع منظومة الفاتورة والإيصال الإلكتروني (ETA بمصر) وهيئة الزكاة والضريبة والجمارك (ZATCA بالسعودية).
  - button "إصدار فاتورة ضريبية جديدة"
  - link "كتالوج وتكويد الأصناف (GS1)":
    - /url: /ar/finance/einvoice-items
    - button "كتالوج وتكويد الأصناف (GS1)"
  - link "إعدادات بوابات الربط":
    - /url: /ar/admin
    - button "إعدادات بوابات الربط"
  - button "إكسل"
  - button "PDF"
  - text: إجمالي الوعاء الخاضع
  - paragraph: 0ج.م
  - text: صافي إيرادات الخدمات والمطالبات ضريبة القيمة المضافة الصادرة
  - paragraph: 0ج.م
  - text: مختومة ضريبياً بنسبة 14% الفواتير والقرارات المعتمدة
  - paragraph: "0"
  - text: سجلات محاسبية مدققة 100% حالة الامتثال والربط الضريبي
  - paragraph: 🇪🇬 EG_ETA
  - text: ✓ الإرسال اللحظي مفعّل
  - button "سجل الفواتير والمطالبات الضريبية 0"
  - button "دليل تصنيفات الإيراد والقواعد الضريبية 37"
  - button "دورة حياة الفاتورة والإرشادات"
  - button "الكل"
  - button "خاضع للضريبة"
  - button "معفى 0%"
  - button "الأحدث"
  - textbox "بحث برقم الفاتورة أو كود الوحدة..."
  - table:
    - rowgroup:
      - row "رقم الفاتورة / الوحدة نوع الإيراد الضريبي تاريخ القرار الوعاء الخاضع (الصافي) النسبة ضريبة القيمة المضافة الإجمالي بالضريبة الحالة إجراءات الفاتورة":
        - columnheader "رقم الفاتورة / الوحدة"
        - columnheader "نوع الإيراد الضريبي"
        - columnheader "تاريخ القرار"
        - columnheader "الوعاء الخاضع (الصافي)"
        - columnheader "النسبة"
        - columnheader "ضريبة القيمة المضافة"
        - columnheader "الإجمالي بالضريبة"
        - columnheader "الحالة"
        - columnheader "إجراءات الفاتورة"
    - rowgroup:
      - row "لا توجد فواتير أو قرارات ضريبية مسجلة بعد يمكنك إصدار أول فاتورة ضريبية مختومة ومعتمدة بالضغط على زر الإنشاء أدناه. إنشاء أول فاتورة إلكترونية الآن":
        - cell "لا توجد فواتير أو قرارات ضريبية مسجلة بعد يمكنك إصدار أول فاتورة ضريبية مختومة ومعتمدة بالضغط على زر الإنشاء أدناه. إنشاء أول فاتورة إلكترونية الآن":
          - heading "لا توجد فواتير أو قرارات ضريبية مسجلة بعد" [level=4]
          - paragraph: يمكنك إصدار أول فاتورة ضريبية مختومة ومعتمدة بالضغط على زر الإنشاء أدناه.
          - button "إنشاء أول فاتورة إلكترونية الآن"
- alert
- region "Notifications"
```

# Test source

```ts
  73  |       .eq("organization_id", orgId)
  74  |       .eq("key", "TENANT_OWNER")
  75  |       .single();
  76  | 
  77  |     await admin.from("user_role_assignments").insert({
  78  |       organization_id: orgId,
  79  |       user_id: ownerId,
  80  |       role_id: ownerRole!.id,
  81  |     });
  82  | 
  83  |     // 4. Create Fiscal Year & Periods through the product RPCs as the owner (the guard refuses direct writes).
  84  |     //    The year creates its monthly periods and all of them are opened, so January is open as before.
  85  |     const ownerClient = createClient(url, anonKey, { auth: { persistSession: false } });
  86  |     const { error: ownerSignErr } = await ownerClient.auth.signInWithPassword({ email: ownerEmail, password: STAFF_PASSWORD });
  87  |     expect(ownerSignErr, `owner sign-in failed: ${ownerSignErr?.message}`).toBeNull();
  88  |     await createOpenFiscalYear(admin, ownerClient, {
  89  |       orgId, name: "2026", startDate: "2026-01-01", endDate: "2026-12-31",
  90  |     });
  91  | 
  92  |     // 5. Create Resort, Unit, Due Type, and Receivable Account
  93  |     const { data: resort, error: resErr } = await admin
  94  |       .from("resorts")
  95  |       .insert({
  96  |         organization_id: orgId,
  97  |         name: "منتجع ساندز بلازا",
  98  |         code: "SANDS",
  99  |         timezone: "Africa/Cairo",
  100 |       })
  101 |       .select("id")
  102 |       .single();
  103 |     expect(resErr).toBeNull();
  104 | 
  105 |     const { data: unit, error: unitErr } = await admin
  106 |       .from("units")
  107 |       .insert({
  108 |         organization_id: orgId,
  109 |         property_id: resort!.id,
  110 |         code: "U-101",
  111 |         unit_type: "VILLA",
  112 |       })
  113 |       .select("id")
  114 |       .single();
  115 |     expect(unitErr).toBeNull();
  116 | 
  117 |     const { data: recAccount } = await admin
  118 |       .from("chart_of_accounts")
  119 |       .insert({
  120 |         organization_id: orgId,
  121 |         code: "1201",
  122 |         name_ar: "ذمم الملاك والعملاء",
  123 |         name_en: "Accounts Receivable",
  124 |         category: "ASSET",
  125 |         normal_balance: "DEBIT",
  126 |         is_group: false,
  127 |         is_active: true,
  128 |       })
  129 |       .select("id")
  130 |       .single();
  131 | 
  132 |     const { data: revAccount } = await admin
  133 |       .from("chart_of_accounts")
  134 |       .insert({
  135 |         organization_id: orgId,
  136 |         code: "4101",
  137 |         name_ar: "إيرادات خدمات وصيانة",
  138 |         name_en: "Maintenance Revenue",
  139 |         category: "REVENUE",
  140 |         normal_balance: "CREDIT",
  141 |         is_group: false,
  142 |         is_active: true,
  143 |       })
  144 |       .select("id")
  145 |       .single();
  146 | 
  147 |     const { data: dueType } = await admin
  148 |       .from("due_types")
  149 |       .insert({
  150 |         organization_id: orgId,
  151 |         name_ar: "رسوم خدمات صيانة دورية",
  152 |         name_en: "Periodic Maintenance Levy",
  153 |         default_revenue_account_id: revAccount!.id,
  154 |       })
  155 |       .select("id")
  156 |       .single();
  157 | 
  158 |     // 6. Sign in through UI
  159 |     page.on("console", (msg) => console.log("PAGE CONSOLE:", msg.text()));
  160 |     page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));
  161 | 
  162 |     await page.goto(`${baseURL}/ar/login`);
  163 |     await page.waitForLoadState("domcontentloaded");
  164 |     await page.fill('input[type="email"]', ownerEmail);
  165 |     await page.fill('input[type="password"]', STAFF_PASSWORD);
  166 |     await page.click('button[type="submit"]');
  167 |     await page.waitForURL("**/dashboard**", { timeout: 30000 });
  168 | 
  169 |     // 7. Go to /finance/einvoice
  170 |     await page.goto(`${baseURL}/ar/finance/einvoice`);
  171 |     await page.waitForLoadState("domcontentloaded");
  172 |     await expect(page.locator("h1")).toContainText("الفوترة والإقرارات الضريبية الإلكترونية");
> 173 |     await expect(page.locator("text=إنشاء فاتورة إلكترونية جديدة")).toBeVisible();
      |                                                                     ^ Error: expect(locator).toBeVisible() failed
  174 | 
  175 |     // 8. Open Create E-Invoice Modal
  176 |     await page.click("text=إنشاء فاتورة إلكترونية جديدة");
  177 |     await expect(page.locator("text=إنشاء وإصدار فاتورة ضريبية إلكترونية")).toBeVisible();
  178 | 
  179 |     // Fill amount and check real-time calculation
  180 |     await page.fill('input[type="number"]', "10000");
  181 |     await expect(page.getByText("11,400")).toBeVisible(); // Gross total (10,000 + 14% VAT)
  182 | 
  183 |     // Submit invoice
  184 |     await page.click('button[type="submit"]:has-text("إصدار وختم الفاتورة فوراً")');
  185 |     await expect(page.locator("text=تم إصدار الفاتورة الضريبية الإلكترونية بنجاح")).toBeVisible({ timeout: 15000 });
  186 | 
  187 |     // Clean up
  188 |     await admin.from("organizations").delete().eq("id", orgId);
  189 |     await admin.auth.admin.deleteUser(ownerId);
  190 |   });
  191 | });
  192 | 
```