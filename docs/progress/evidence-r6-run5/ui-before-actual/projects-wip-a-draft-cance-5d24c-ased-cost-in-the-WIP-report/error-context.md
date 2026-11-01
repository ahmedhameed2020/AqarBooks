# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: projects-wip.spec.ts >> a draft cancelled by status alone does not appear as released cost in the WIP report
- Location: tests\e2e\projects-wip.spec.ts:521:5

# Error details

```
TypeError: Cannot read properties of null (reading 'id')
```

# Test source

```ts
  456 |     await expect(page.getByRole("dialog").getByRole("alert")).toContainText(/already has posted entries/i, {
  457 |       timeout: 40_000,
  458 |     });
  459 |     const { data: afterLock } = await admin.from("projects").select("code").eq("id", prj!.id as string).single();
  460 |     expect(afterLock!.code, "a refused edit must leave the code unchanged").toBe(code);
  461 | 
  462 |     // Permitted: the name still changes after postings.
  463 |     await page.locator("#prj-code").fill(code);
  464 |     await page.locator("#prj-en").fill("Renamed After Posting");
  465 |     await page.getByRole("button", { name: /Save project/i }).click();
  466 |     await expect.poll(async () => {
  467 |       const { data } = await admin.from("projects").select("name_en").eq("id", prj!.id as string).single();
  468 |       return data?.name_en;
  469 |     }, { timeout: 40_000 }).toBe("Renamed After Posting");
  470 | 
  471 |     const { count: entriesAfter } = await admin
  472 |       .from("journal_entries").select("id", { count: "exact", head: true }).eq("organization_id", f.orgId);
  473 |     expect(entriesAfter, "editing a project must not change its postings").toBe(entriesBefore);
  474 |     await ctx.close();
  475 |   } finally {
  476 |     await cleanUp(admin, f);
  477 |   }
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
  532 |     const { data: period } = await admin.from("fiscal_periods")
  533 |       .select("id").eq("organization_id", f.orgId).eq("status", "OPEN").single();
  534 |     const code = `TWR-C${String(Date.now()).slice(-6)}`;
  535 |     const { data: prj, error: prjErr } = await admin.from("projects").insert({
  536 |       organization_id: f.orgId, code, name_ar: "مسودة ملغاة", name_en: "Cancelled Draft Tower",
  537 |       wip_account_id: wip!.id, cost_of_sales_account_id: cos!.id,
  538 |     }).select("id").single();
  539 |     expect(prjErr, `project insert failed: ${prjErr?.message}`).toBeNull();
  540 | 
  541 |     const ownerClient = createClient(url, anonKey, { auth: { persistSession: false } });
  542 |     const { error: signErr } = await ownerClient.auth.signInWithPassword({ email: f.email, password: STAFF_PASSWORD });
  543 |     expect(signErr, `owner sign-in failed: ${signErr?.message}`).toBeNull();
  544 |     const { error: capErr } = await ownerClient.rpc("capitalise_project_cost", {
  545 |       p_project_id: prj!.id as string, p_amount: 1000, p_credit_account_id: credit!.id as string,
  546 |       p_entry_date: "2026-03-01", p_description: "base capitalisation",
  547 |     });
  548 |     expect(capErr, `capitalise failed: ${capErr?.message}`).toBeNull();
  549 |     const { error: relErr } = await ownerClient.rpc("release_project_wip", {
  550 |       p_project_id: prj!.id as string, p_amount: 600, p_entry_date: "2026-03-10",
  551 |       p_description: "base release",
  552 |     });
  553 |     expect(relErr, `release failed: ${relErr?.message}`).toBeNull();
  554 | 
  555 |     const { data: draft, error: draftErr } = await admin.from("journal_entries").insert({
> 556 |       organization_id: f.orgId, fiscal_period_id: period!.id as string, entry_date: "2026-03-08",
      |                                                           ^ TypeError: Cannot read properties of null (reading 'id')
  557 |       description: "draft cancelled by status alone", source_type: "JOURNAL_VOUCHER", status: "DRAFT",
  558 |     }).select("id").single();
  559 |     expect(draftErr, `draft insert failed: ${draftErr?.message}`).toBeNull();
  560 |     const { error: linesErr } = await admin.from("journal_entry_lines").insert([
  561 |       { journal_entry_id: draft!.id, line_number: 1, account_id: wip!.id, debit: 0, credit: 300, project_id: prj!.id },
  562 |       { journal_entry_id: draft!.id, line_number: 2, account_id: credit!.id, debit: 300, credit: 0, project_id: null },
  563 |     ]);
  564 |     expect(linesErr, `draft lines insert failed: ${linesErr?.message}`).toBeNull();
  565 |     const { error: cancelErr } = await admin.from("journal_entries")
  566 |       .update({ status: "REVERSED" }).eq("id", draft!.id as string);
  567 |     expect(cancelErr, `status-only cancellation failed: ${cancelErr?.message}`).toBeNull();
  568 | 
  569 |     const ctx = await browser.newContext();
  570 |     const page = await ctx.newPage();
  571 |     await signIn(page, f.email);
  572 |     await page.goto("/en/finance/projects");
  573 |     const row = page.getByRole("row").filter({ hasText: code });
  574 |     await expect(row).toBeVisible({ timeout: 40_000 });
  575 |     await expect(row.locator("td").nth(3)).toHaveText("1,000.00");
  576 |     await expect(row.locator("td").nth(4), "a cancelled draft is not a cost release").toHaveText("600.00");
  577 |     await expect(row.locator("td").nth(5), "the cancelled draft must not reduce WIP").toContainText("400.00");
  578 |     await ctx.close();
  579 |   } finally {
  580 |     await cleanUp(admin, f);
  581 |   }
  582 | });
  583 | 
```