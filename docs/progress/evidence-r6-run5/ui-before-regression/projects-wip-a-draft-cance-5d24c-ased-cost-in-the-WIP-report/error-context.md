# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: projects-wip.spec.ts >> a draft cancelled by status alone does not appear as released cost in the WIP report
- Location: tests\e2e\projects-wip.spec.ts:521:5

# Error details

```
Error: a cancelled draft is not a cost release

expect(locator).toHaveText(expected) failed

Locator:  getByRole('row').filter({ hasText: 'TWR-C323863' }).locator('td').nth(4)
Expected: "600.00"
Received: "900.00"
Timeout:  5000ms

Call log:
  - a cancelled draft is not a cost release with timeout 5000ms
  - waiting for getByRole('row').filter({ hasText: 'TWR-C323863' }).locator('td').nth(4)
    13 × locator resolved to <td class="whitespace-nowrap px-4 py-3 font-mono font-semibold text-purple-700">900.00</td>
       - unexpected value "900.00"

```

```yaml
- cell "900.00"
```

# Test source

```ts
  478 | });
  479 | 
  480 | test("a member without the accounts permission sees no edit control and cannot change a project", async ({
  481 |   browser,
  482 | }) => {
  483 |   test.setTimeout(180_000);
  484 |   const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  485 |   const f = await setUp(admin);
  486 |   try {
  487 |     const { data: wip } = await admin.from("chart_of_accounts")
  488 |       .select("id").eq("organization_id", f.orgId).eq("code", "1300").single();
  489 |     const { data: cos } = await admin.from("chart_of_accounts")
  490 |       .select("id").eq("organization_id", f.orgId).eq("code", "5600").single();
  491 |     const code = `TWR-R${String(Date.now()).slice(-6)}`;
  492 |     const { data: prj, error: prjErr } = await admin.from("projects").insert({
  493 |       organization_id: f.orgId, code, name_ar: "محمي", name_en: "Protected Tower",
  494 |       wip_account_id: wip!.id, cost_of_sales_account_id: cos!.id,
  495 |     }).select("id").single();
  496 |     expect(prjErr, `project insert failed: ${prjErr?.message}`).toBeNull();
  497 | 
  498 |     const cashier = await makeUser(admin, f, "CASHIER", "cashier");
  499 |     const ctx = await browser.newContext();
  500 |     const page = await ctx.newPage();
  501 |     await signIn(page, cashier);
  502 |     await page.goto("/en/finance/projects");
  503 |     await expect(page.getByText("Protected Tower")).toBeVisible({ timeout: 40_000 });
  504 |     await expect(page.getByRole("button", { name: /^Edit$/ }), "no edit control without the permission").toHaveCount(0);
  505 | 
  506 |     // The database refuses the write too: an update on the caller's session reaches no row.
  507 |     const cashierClient = createClient(url, anonKey, { auth: { persistSession: false } });
  508 |     const { error: signErr } = await cashierClient.auth.signInWithPassword({ email: cashier, password: STAFF_PASSWORD });
  509 |     expect(signErr, `cashier sign-in failed: ${signErr?.message}`).toBeNull();
  510 |     const { data: changed } = await cashierClient.from("projects")
  511 |       .update({ name_en: "Hijacked" }).eq("id", prj!.id as string).select("id");
  512 |     expect(changed ?? [], "a member without the permission must update no row").toHaveLength(0);
  513 |     const { data: still } = await admin.from("projects").select("name_en").eq("id", prj!.id as string).single();
  514 |     expect(still!.name_en).toBe("Protected Tower");
  515 |     await ctx.close();
  516 |   } finally {
  517 |     await cleanUp(admin, f);
  518 |   }
  519 | });
  520 | 
  521 | test("a draft cancelled by status alone does not appear as released cost in the WIP report", async ({ browser }) => {
  522 |   test.setTimeout(220_000);
  523 |   const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  524 |   const f = await setUp(admin);
  525 |   try {
  526 |     const { data: wip } = await admin.from("chart_of_accounts")
  527 |       .select("id").eq("organization_id", f.orgId).eq("code", "1300").single();
  528 |     const { data: cos } = await admin.from("chart_of_accounts")
  529 |       .select("id").eq("organization_id", f.orgId).eq("code", "5600").single();
  530 |     const { data: credit } = await admin.from("chart_of_accounts")
  531 |       .select("id").eq("organization_id", f.orgId).eq("code", "2100").single();
  532 |     const { data: period, error: periodErr } = await admin.from("fiscal_periods")
  533 |       .select("id").eq("organization_id", f.orgId)
  534 |       .lte("start_date", "2026-03-08").gte("end_date", "2026-03-08").single();
  535 |     expect(periodErr, `period lookup failed: ${periodErr?.message}`).toBeNull();
  536 |     const code = `TWR-C${String(Date.now()).slice(-6)}`;
  537 |     const { data: prj, error: prjErr } = await admin.from("projects").insert({
  538 |       organization_id: f.orgId, code, name_ar: "مسودة ملغاة", name_en: "Cancelled Draft Tower",
  539 |       wip_account_id: wip!.id, cost_of_sales_account_id: cos!.id,
  540 |     }).select("id").single();
  541 |     expect(prjErr, `project insert failed: ${prjErr?.message}`).toBeNull();
  542 | 
  543 |     const ownerClient = createClient(url, anonKey, { auth: { persistSession: false } });
  544 |     const { error: signErr } = await ownerClient.auth.signInWithPassword({ email: f.email, password: STAFF_PASSWORD });
  545 |     expect(signErr, `owner sign-in failed: ${signErr?.message}`).toBeNull();
  546 |     const { error: capErr } = await ownerClient.rpc("capitalise_project_cost", {
  547 |       p_project_id: prj!.id as string, p_amount: 1000, p_credit_account_id: credit!.id as string,
  548 |       p_entry_date: "2026-03-01", p_description: "base capitalisation",
  549 |     });
  550 |     expect(capErr, `capitalise failed: ${capErr?.message}`).toBeNull();
  551 |     const { error: relErr } = await ownerClient.rpc("release_project_wip", {
  552 |       p_project_id: prj!.id as string, p_amount: 600, p_entry_date: "2026-03-10",
  553 |       p_description: "base release",
  554 |     });
  555 |     expect(relErr, `release failed: ${relErr?.message}`).toBeNull();
  556 | 
  557 |     const { data: draft, error: draftErr } = await admin.from("journal_entries").insert({
  558 |       organization_id: f.orgId, fiscal_period_id: period!.id as string, entry_date: "2026-03-08",
  559 |       description: "draft cancelled by status alone", source_type: "JOURNAL_VOUCHER", status: "DRAFT",
  560 |     }).select("id").single();
  561 |     expect(draftErr, `draft insert failed: ${draftErr?.message}`).toBeNull();
  562 |     const { error: linesErr } = await admin.from("journal_entry_lines").insert([
  563 |       { journal_entry_id: draft!.id, line_number: 1, account_id: wip!.id, debit: 0, credit: 300, project_id: prj!.id },
  564 |       { journal_entry_id: draft!.id, line_number: 2, account_id: credit!.id, debit: 300, credit: 0, project_id: null },
  565 |     ]);
  566 |     expect(linesErr, `draft lines insert failed: ${linesErr?.message}`).toBeNull();
  567 |     const { error: cancelErr } = await admin.from("journal_entries")
  568 |       .update({ status: "REVERSED" }).eq("id", draft!.id as string);
  569 |     expect(cancelErr, `status-only cancellation failed: ${cancelErr?.message}`).toBeNull();
  570 | 
  571 |     const ctx = await browser.newContext();
  572 |     const page = await ctx.newPage();
  573 |     await signIn(page, f.email);
  574 |     await page.goto("/en/finance/projects");
  575 |     const row = page.getByRole("row").filter({ hasText: code });
  576 |     await expect(row).toBeVisible({ timeout: 40_000 });
  577 |     await expect(row.locator("td").nth(3)).toHaveText("1,000.00");
> 578 |     await expect(row.locator("td").nth(4), "a cancelled draft is not a cost release").toHaveText("600.00");
      |                                                                                       ^ Error: a cancelled draft is not a cost release
  579 |     await expect(row.locator("td").nth(5), "the cancelled draft must not reduce WIP").toContainText("400.00");
  580 |     await ctx.close();
  581 |   } finally {
  582 |     await cleanUp(admin, f);
  583 |   }
  584 | });
  585 | 
```