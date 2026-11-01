# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fixed-assets.spec.ts >> a reader sees the register without the controls, and someone with neither permission is told so
- Location: tests\e2e\fixed-assets.spec.ts:189:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/don't have permission to view the fixed asset register/i)
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText(/don't have permission to view the fixed asset register/i)

```

```yaml
- banner:
  - link "AqarBooks ERP Smart Real Estate Accounting":
    - /url: /en
  - text: Live Cloud Sync
  - button "Search accounts, units, reports... ⌘K"
  - button "Quick Action"
  - button "Notifications"
  - link "العربية":
    - /url: /ar/finance/assets
- complementary:
  - button "Collapse Sidebar"
  - textbox "Search..."
  - text: ⌘K
  - navigation:
    - link "Dashboard":
      - /url: /en/dashboard
    - button "Pin to top"
    - button "Settings & Account"
    - link "My Account & Security":
      - /url: /en/account
    - button "Pin to top"
    - button "Expand"
    - link "Profile & Password":
      - /url: /en/account
    - link "Notification Center":
      - /url: /en/notifications
  - link "E E2E FA UI 1793221013533 e2e-fa-store-1793221051024@aqarbooks-test.local Storekeeper • E2E FA UI 1793221013533":
    - /url: /en/account
    - text: E
    - paragraph: E2E FA UI 1793221013533
    - paragraph: e2e-fa-store-1793221051024@aqarbooks-test.local
    - text: Storekeeper • E2E FA UI 1793221013533
  - link "Account":
    - /url: /en/account
  - button "Sign Out"
- main:
  - heading "Fixed Assets & Depreciation" [level=1]
  - paragraph: You do not have permission to view the fixed asset register.
- alert
- region "Notifications"
```

# Test source

```ts
  120 |     const ctx = await browser.newContext();
  121 |     const page = await ctx.newPage();
  122 |     await signIn(page, f.email);
  123 |     await page.goto("/en/finance/assets");
  124 | 
  125 |     await expect(page.getByRole("heading", { name: /Fixed Assets/i })).toBeVisible();
  126 | 
  127 |     // 12,000 over 12 months with no salvage: a deliberately clean 1,000/month,
  128 |     // because the rounding edge is the integration test's job, not this one's.
  129 |     const code = `FA-${String(Date.now()).slice(-8)}`;
  130 |     await page.locator("#asset-code").fill(code);
  131 |     await page.locator("#asset-ar").fill("مبنى الاختبار");
  132 |     await page.locator("#asset-en").fill("Test Building");
  133 |     await page.locator("#asset-cost").fill("12000");
  134 |     await page.locator("#asset-salvage").fill("0");
  135 |     await page.locator("#asset-life").fill("12");
  136 |     await page.locator("#asset-date").fill("2026-01-01");
  137 |     await page.locator("#asset-account").selectOption({ label: "1210 — Buildings" });
  138 |     await page.locator("#asset-accum").selectOption({ label: "1220 — Accumulated Depreciation" });
  139 |     await page.locator("#asset-expense").selectOption({ label: "5500 — Depreciation Expense" });
  140 |     await page.getByRole("button", { name: /Register asset/i }).click();
  141 | 
  142 |     const row = page.locator(`[data-asset="${code}"]`);
  143 |     await expect(row).toBeVisible({ timeout: 40_000 });
  144 |     await expect(row, "a new asset carries its full cost").toHaveAttribute("data-nbv", "12000");
  145 |     await expect(row).toHaveAttribute("data-status", "ACTIVE");
  146 | 
  147 |     // Post one period. The book value must fall by exactly one instalment.
  148 |     await page.getByRole("button", { name: /Run depreciation/i }).click();
  149 |     await expect(page.locator("[data-run-result]")).toHaveAttribute("data-run-result", "1", {
  150 |       timeout: 40_000,
  151 |     });
  152 |     await expect(page.locator(`[data-asset="${code}"]`)).toHaveAttribute("data-nbv", "11000", {
  153 |       timeout: 40_000,
  154 |     });
  155 | 
  156 |     // Re-running the SAME period must say plainly that it posted nothing --
  157 |     // closing a month twice is normal, and an operator needs to see that the
  158 |     // second pass was a no-op rather than guess.
  159 |     await page.getByRole("button", { name: /Run depreciation/i }).click();
  160 |     await expect(page.locator("[data-run-result]")).toHaveAttribute("data-run-result", "0", {
  161 |       timeout: 40_000,
  162 |     });
  163 |     await expect(page.getByText(/already done/i)).toBeVisible();
  164 |     await expect(page.locator(`[data-asset="${code}"]`)).toHaveAttribute("data-nbv", "11000");
  165 | 
  166 |     // And the ledger agrees with the screen: exactly one balanced entry.
  167 |     const { data: deps } = await admin
  168 |       .from("fixed_asset_depreciation")
  169 |       .select("amount, journal_entry_id")
  170 |       .eq("organization_id", f.orgId);
  171 |     expect(deps, "exactly one instalment, not two").toHaveLength(1);
  172 |     expect(Number(deps![0].amount)).toBe(1000);
  173 | 
  174 |     const { data: lines } = await admin
  175 |       .from("journal_entry_lines")
  176 |       .select("debit, credit")
  177 |       .eq("journal_entry_id", deps![0].journal_entry_id!);
  178 |     const debit = lines!.reduce((s, l) => s + Number(l.debit), 0);
  179 |     const credit = lines!.reduce((s, l) => s + Number(l.credit), 0);
  180 |     expect(debit).toBe(1000);
  181 |     expect(credit).toBe(1000);
  182 | 
  183 |     await ctx.close();
  184 |   } finally {
  185 |     await cleanUp(admin, f);
  186 |   }
  187 | });
  188 | 
  189 | test("a reader sees the register without the controls, and someone with neither permission is told so", async ({
  190 |   browser,
  191 | }) => {
  192 |   test.setTimeout(180_000);
  193 |   const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  194 |   const f = await setUp(admin);
  195 | 
  196 |   try {
  197 |     // AUDITOR reads assets but cannot manage them: the register is visible,
  198 |     // the controls are not. Offering a button the RPC would refuse is worse
  199 |     // than not offering it.
  200 |     const auditor = await makeUser(admin, f, "AUDITOR", "auditor");
  201 |     const readCtx = await browser.newContext();
  202 |     const readPage = await readCtx.newPage();
  203 |     await signIn(readPage, auditor);
  204 |     await readPage.goto("/en/finance/assets");
  205 | 
  206 |     await expect(readPage.getByRole("heading", { name: /Fixed Assets/i })).toBeVisible();
  207 |     await expect(readPage.getByRole("button", { name: /Register asset/i })).toHaveCount(0);
  208 |     await expect(readPage.getByRole("button", { name: /Run depreciation/i })).toHaveCount(0);
  209 |     await readCtx.close();
  210 | 
  211 |     // STOREKEEPER holds neither permission: the refusal is stated.
  212 |     const storekeeper = await makeUser(admin, f, "STOREKEEPER", "store");
  213 |     const denyCtx = await browser.newContext();
  214 |     const denyPage = await denyCtx.newPage();
  215 |     await signIn(denyPage, storekeeper);
  216 |     await denyPage.goto("/en/finance/assets");
  217 | 
  218 |     await expect(
  219 |       denyPage.getByText(/don't have permission to view the fixed asset register/i),
> 220 |     ).toBeVisible();
      |       ^ Error: expect(locator).toBeVisible() failed
  221 |     await expect(denyPage.locator("[data-asset]")).toHaveCount(0);
  222 |     await denyCtx.close();
  223 |   } finally {
  224 |     await cleanUp(admin, f);
  225 |   }
  226 | });
  227 | 
```