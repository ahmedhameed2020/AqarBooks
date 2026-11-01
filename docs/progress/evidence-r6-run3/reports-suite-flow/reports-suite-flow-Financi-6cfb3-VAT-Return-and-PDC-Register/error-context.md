# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: reports-suite-flow.spec.ts >> Financial & Real Estate Reports Suite E2E Flow >> Verify Reports Hub, Rent Roll, Owner Statements, VAT Return, and PDC Register
- Location: tests\e2e\reports-suite-flow.spec.ts:15:7

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('h1')
Expected substring: "سجل الأصول الثابتة والإهلاك المحاسبي"
Received string:    "سجل الأصول الثابتة"
Timeout: 5000ms

Call log:
  - Expect "toContainText" with timeout 5000ms
  - waiting for locator('h1')
    12 × locator resolved to <h1 class="text-lg font-bold">سجل الأصول الثابتة</h1>
       - unexpected value "سجل الأصول الثابتة"

```

```yaml
- heading "سجل الأصول الثابتة" [level=1]
```

# Test source

```ts
  48  |     const userId = authUser.user!.id;
  49  | 
  50  |     await admin.from("profiles").upsert({
  51  |       id: userId,
  52  |       full_name: "مدير التقارير المالية",
  53  |       locale: "ar",
  54  |     });
  55  | 
  56  |     await admin.from("organization_memberships").insert({
  57  |       organization_id: orgId,
  58  |       user_id: userId,
  59  |       status: "active",
  60  |     });
  61  | 
  62  |     const { data: ownerRole } = await admin
  63  |       .from("roles")
  64  |       .select("id")
  65  |       .eq("organization_id", orgId)
  66  |       .eq("key", "TENANT_OWNER")
  67  |       .single();
  68  | 
  69  |     await admin.from("user_role_assignments").insert({
  70  |       user_id: userId,
  71  |       organization_id: orgId,
  72  |       role_id: ownerRole!.id,
  73  |     });
  74  | 
  75  |     // 4. Create Resort
  76  |     await admin.from("resorts").insert({
  77  |       organization_id: orgId,
  78  |       name: "منتجع ساندز بلازا",
  79  |       slug: `resort-${Date.now()}`,
  80  |       status: "ACTIVE",
  81  |     });
  82  | 
  83  |     // 5. Create Fiscal Year & Periods through the product RPCs as the owner (the guard refuses direct writes).
  84  |     //    The year creates its monthly periods and all of them are opened, so January is open as before.
  85  |     const ownerClient = createClient(url, anonKey, { auth: { persistSession: false } });
  86  |     const { error: ownerSignErr } = await ownerClient.auth.signInWithPassword({ email: ownerEmail, password: STAFF_PASSWORD });
  87  |     expect(ownerSignErr, `owner sign-in failed: ${ownerSignErr?.message}`).toBeNull();
  88  |     await createOpenFiscalYear(admin, ownerClient, {
  89  |       orgId, name: "2026", startDate: "2026-01-01", endDate: "2026-12-31",
  90  |     });
  91  | 
  92  |     // 4. Sign in through UI
  93  |     await page.goto(`${baseURL}/ar/login`);
  94  |     await page.waitForLoadState("domcontentloaded");
  95  |     await page.fill('input[type="email"]', ownerEmail);
  96  |     await page.fill('input[type="password"]', STAFF_PASSWORD);
  97  |     await page.click('button[type="submit"]');
  98  |     await page.waitForURL("**/dashboard**", { timeout: 30000 });
  99  | 
  100 |     // 5. Navigate to /finance/reports Hub
  101 |     await page.goto(`${baseURL}/ar/finance/reports`);
  102 |     await page.waitForLoadState("domcontentloaded");
  103 |     await expect(page.locator("h1")).toContainText("مركز التقارير والقوائم المالية");
  104 |     await expect(page.locator("text=جدول الإيجارات وحصر العقود (Rent Roll)").first()).toBeVisible();
  105 |     await expect(page.locator("text=كشف حساب وتوزيعات أرباح الملاك").first()).toBeVisible();
  106 |     await expect(page.locator("text=إقرار ضريبة القيمة المضافة ومطابقة الضرائب").first()).toBeVisible();
  107 |     await expect(page.locator("text=سجل الشيكات الآجلة وأوراق القبض (PDC)").first()).toBeVisible();
  108 | 
  109 |     // 6. Test Rent Roll Page
  110 |     await page.goto(`${baseURL}/ar/finance/reports/rent-roll`);
  111 |     await page.waitForLoadState("domcontentloaded");
  112 |     await expect(page.locator("h1")).toContainText("جدول الإيجارات وحصر العقود (Rent Roll)");
  113 |     await expect(page.locator("text=نسبة الإشغال الإجمالية")).toBeVisible();
  114 | 
  115 |     // 7. Test Owner Statement Page
  116 |     await page.goto(`${baseURL}/ar/finance/reports/owner-statement`);
  117 |     await page.waitForLoadState("domcontentloaded");
  118 |     await expect(page.locator("h1")).toContainText("كشف حساب وتوزيعات أرباح الملاك");
  119 |     await expect(page.locator("text=صافي الربح المستحق للمالك")).toBeVisible();
  120 | 
  121 |     // 8. Test VAT Return Page
  122 |     await page.goto(`${baseURL}/ar/finance/reports/vat-return`);
  123 |     await page.waitForLoadState("domcontentloaded");
  124 |     await expect(page.locator("h1")).toContainText("كشف إقرار ضريبة القيمة المضافة");
  125 |     await expect(page.locator("text=نموذج احتساب وتوزيع الإقرار الضريبي المعتمد")).toBeVisible();
  126 | 
  127 |     // 9. Test PDC Cheques Register Page
  128 |     await page.goto(`${baseURL}/ar/finance/reports/pdc`);
  129 |     await page.waitForLoadState("domcontentloaded");
  130 |     await expect(page.locator("h1")).toContainText("سجل الشيكات الآجلة وأوراق القبض (PDC)");
  131 |     await expect(page.locator("text=شيكات مقبوضة (واردة)")).toBeVisible();
  132 | 
  133 |     // 10. Test Property P&L Page
  134 |     await page.goto(`${baseURL}/ar/finance/reports/property-pnl`);
  135 |     await page.waitForLoadState("domcontentloaded");
  136 |     await expect(page.locator("h1")).toContainText("قائمة أرباح وخسائر العقارات والمنتجعات (Property P&L)");
  137 |     await expect(page.locator("text=صافي الدخل التشغيلي (NOI)").first()).toBeVisible();
  138 | 
  139 |     // 11. Test AP Aging Page
  140 |     await page.goto(`${baseURL}/ar/finance/reports/ap-aging`);
  141 |     await page.waitForLoadState("domcontentloaded");
  142 |     await expect(page.locator("h1")).toContainText("تقرير أعمار ديون الموردين والالتزامات (AP Aging)");
  143 |     await expect(page.locator("text=إجمالي ديون الموردين").first()).toBeVisible();
  144 | 
  145 |     // 12. Test Fixed Assets Page
  146 |     await page.goto(`${baseURL}/ar/finance/reports/fixed-assets`);
  147 |     await page.waitForLoadState("domcontentloaded");
> 148 |     await expect(page.locator("h1")).toContainText("سجل الأصول الثابتة والإهلاك المحاسبي");
      |                                      ^ Error: expect(locator).toContainText(expected) failed
  149 |     await expect(page.locator("text=صافي القيمة الدفترية (NBV)").first()).toBeVisible();
  150 | 
  151 |     // 13. Test Audit Trail Page
  152 |     await page.goto(`${baseURL}/ar/finance/reports/audit-trail`);
  153 |     await page.waitForLoadState("domcontentloaded");
  154 |     await expect(page.locator("h1")).toContainText("سجل التدقيق والحركات الملغاة ومكافحة التلاعب");
  155 |     await expect(page.locator("text=إجمالي الحركات الموثقة").first()).toBeVisible();
  156 | 
  157 |     // 14. Test CAM Allocation Page
  158 |     await page.goto(`${baseURL}/ar/finance/reports/cam-allocation`);
  159 |     await page.waitForLoadState("domcontentloaded");
  160 |     await expect(page.locator("h1")).toContainText("تقرير توزيع تكاليف الخدمات المشتركة والصيانة (CAM)");
  161 |     await expect(page.locator("text=معدل تكلفة المتر المربع").first()).toBeVisible();
  162 | 
  163 |     // 15. Test Cash Flow Forecast Page
  164 |     await page.goto(`${baseURL}/ar/finance/reports/cash-flow-forecast`);
  165 |     await page.waitForLoadState("domcontentloaded");
  166 |     await expect(page.locator("h1")).toContainText("تقرير توقعات التدفق النقدي والسيولة المستقبلية");
  167 |     await expect(page.locator("text=الرصيد النقدي الفعلي الحالي").first()).toBeVisible();
  168 | 
  169 |     // 16. Test CAPEX vs OPEX Page
  170 |     await page.goto(`${baseURL}/ar/finance/reports/capex-opex`);
  171 |     await page.waitForLoadState("domcontentloaded");
  172 |     await expect(page.locator("h1")).toContainText("تقرير مصاريف الصيانة الرأسمالية والتشغيلية (CAPEX vs OPEX)");
  173 |     await expect(page.locator("text=إنفاق رأسمالي (CAPEX)").first()).toBeVisible();
  174 | 
  175 |     // 17. Test Lease Expirations Page
  176 |     await page.goto(`${baseURL}/ar/finance/reports/lease-expirations`);
  177 |     await page.waitForLoadState("domcontentloaded");
  178 |     await expect(page.locator("h1")).toContainText("تقرير جداول انتهاء العقود ومعدل دوران الإشغال");
  179 |     await expect(page.locator("text=إجمالي العقود النشطة").first()).toBeVisible();
  180 | 
  181 |     // 18. Test User Account & Security Settings Page
  182 |     await page.goto(`${baseURL}/ar/account`);
  183 |     await page.waitForLoadState("domcontentloaded");
  184 |     await expect(page.locator("text=الملف الشخصي").first()).toBeVisible();
  185 |     await expect(page.locator("text=الأمان وكلمات المرور").first()).toBeVisible();
  186 |     await expect(page.locator("text=تفضيلات الإشعارات").first()).toBeVisible();
  187 | 
  188 |     // 19. Test AI Smart Data Importer Page
  189 |     await page.goto(`${baseURL}/ar/import`);
  190 |     await page.waitForLoadState("domcontentloaded");
  191 |     await expect(page.locator("h1")).toContainText("استيراد ومعالجة البيانات العقارية بالذكاء الاصطناعي");
  192 |     await expect(page.locator("text=الوحدات والعقارات").first()).toBeVisible();
  193 | 
  194 |     // 20. Test Payment Providers Hub Page
  195 |     await page.goto(`${baseURL}/ar/finance/payment-providers`);
  196 |     await page.waitForLoadState("domcontentloaded");
  197 |     await expect(page.locator("h1")).toContainText("بوابات الدفع الإلكتروني والتحصيل الرقمي");
  198 |     await expect(page.locator("text=Fawry Pay (فوري باي)").first()).toBeVisible();
  199 | 
  200 |     // 21. Test Notifications & Alerts Center Page
  201 |     await page.goto(`${baseURL}/ar/notifications`);
  202 |     await page.waitForLoadState("domcontentloaded");
  203 |     await expect(page.locator("h1")).toContainText("إدارة التنبيهات، الشيكات، وقنوات المراسلة");
  204 |     await expect(page.locator("text=سجل الإشعارات والتنبيهات").first()).toBeVisible();
  205 | 
  206 |     // 22. Test Members & Owners Directory Page
  207 |     await page.goto(`${baseURL}/ar/members`);
  208 |     await page.waitForLoadState("domcontentloaded");
  209 |     await expect(page.locator("h1")).toContainText("سجل الأعضاء والملاك وإدارة الحسابات");
  210 |     await expect(page.locator("text=إجمالي الأعضاء والملاك").first()).toBeVisible();
  211 | 
  212 |     // Clean up
  213 |     await admin.from("organizations").delete().eq("id", orgId);
  214 |   });
  215 | });
  216 | 
```