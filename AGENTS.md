<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- trail:start -->
## Trail — repo context graph

This repo is indexed in `.trail/cache/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `trail map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `trail ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `trail grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `trail skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `trail callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `.trail/cache/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `trail ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

After big code changes, refresh the graph with `trail build` (deterministic,
no API key, $0).
<!-- trail:end -->

<!-- delegation:start -->
## AqarBooks Operating Contract — نظام التفويض

عقد تشغيل ملزم للمنسق والوكلاء. الدليل قبل الثقة؛ الفحص غير المنفَّذ = NOT RUN.

### المنتج
AqarBooks: محاسبة عقارية متعددة المستأجرين. السير الحرج: قيود يدوية → ترحيل → فترات مالية → إقفال سنة (`close_fiscal_year`). عزل المستأجرين عبر RLS + `proveTenantPermission` (منع صريح لـ `PLATFORM_SUPER_ADMIN`).

### أوامر مثبتة
- Typecheck: `node node_modules/typescript/bin/tsc --noEmit`
- Unit/عقد: `npx vitest run <file>` (Vitest 4)
- تكامل: `npx vitest run tests/<name>.integration.test.ts`
- E2E على r6: `node "working files/r6-runners/run-r6-e2e-managed.mjs" tests/e2e/<spec>.ts <label>`
- Build على r6: `node "working files/r6-runners/app-r6.mjs" build` (Webpack؛ Turbopack معطل بعطل CSS Node worker)
- SQL محلي: `npm run test:sql-local`

### مناطق محمية (لا تُمس إلا بمهمة مصرح بها صراحة)
- `lib/auth/` — الصلاحيات والجلسات
- `supabase/migrations/` — ترحيلات RLS والحراسات المقبولة (Batch 1B حتى 240000، Batch 2 حتى 250000)
- محرك الإقفال `lib/accounting/fiscal-year-closing.ts` وRPCs الترحيل والإقفال
- الأسرار: `.env*` ومفاتيح r6 — لا تُطبع ولا تُنقل
- تكاملات الضرائب/Fawry — محجوبة بقرارات خارجية

### قواعد
- لا إضعاف اختبار ولا تغيير سلوك مقبول (Batch 1B/2) دون موافقة المالك الصريحة
- بيئة العمل الوحيدة: حاويات `g0r6-*` المحلية. لا اتصال بتطوير/إنتاج، لا commit/push/n除非 موافقة صريحة
- عقد سلوكي جديد: RED أولًا ثم GREEN
- الأدلة تُحفظ في `docs/progress/evidence-r6-runNN/results/` وتُذكر مساراتها في التقرير
- `docs/progress/status.json` و`ROADMAP.md`: حالات الدفعات لا تُغيّرها الجلسات؛ القبول للمالك وحده

### تعريف «تم»
1. السلوك المطلوب منفذ بأقل تغيير مكتمل
2. كل معيار قبول مفحوص بدليل مساره
3. الاختبارات المتأثرة أُعيدت وناجحة: focused → integration → typecheck → build → E2E عند الحاجة
4. التقرير الختامي: أوامر دقيقة + نتائج + ملفات + مراجعة معادية + مخاطر متبقية

### دورة المنسق (Understand → Recon → Plan → Todo → Delegate → Implement → Verify → Challenge → Fix → Close)
- Task contract: الهدف، معايير القبول، غير الأهداف، الأسطح الحساسة
- Recon قبل أي تعديل: `git status`، نقاط الدخول، الأنماط، الاختبارات، العقود
- Plan مرتين: خطة + تحديها (افتراضات خاطئة؟ تجريد موجود؟ مخاطر عقد؟ نطاق أصغر؟)
- Implementation بدفعات متماسكة صغيرة مع تحقق ضيق بعد كل دفعة
- Failure protocol: كل فشل يُصنف بدليل PRODUCTION_BUG / TEST_EXPECTATION_BUG / ENVIRONMENT_OR_HARNESS / FLAKY / AMBIGUOUS قبل الإصلاح
- Closure gate: لا إغلاق مع todo مفتوح أو معيار غير مفحوص أو وجود BLOCKER

### خريطة الأدوار (بيئة Kimi Code — `.kilo` غير مقروء هنا)
| الدور | الوكيل | متى يُستدعى |
|---|---|---|
| repo-explorer | explore (read-only) | استكشاف غير تافه |
| architecture-reviewer | plan (read-only) | تغيير متوسط/عالٍ عبر وحدات |
| implementer | coder | تنفيذ مهمة محددة النطاق |
| test-engineer | coder | تصميم/تحديث اختبارات السلوك |
| failure-triage | explore | تصنيف فشل قبل أي إصلاح |
| db-security-reviewer | plan (read-only) | إلزامي لأي مساس بالصلاحيات/RLS/ترحيلات/أسرار/فوترة |
| performance-reviewer | plan (read-only) | مسارات ساخنة أو استعلامات جديدة |
| final-reviewer | plan (read-only) | إلزامي لغير التافه: يحاول إثبات عدم الاكتمال |

الوكلاء يبدؤون بلا سياق: بريف كل بعثة بالهدف والمعرفات والمسارات الدقيقة، ولا تفوض فهمًا يمكن تضمينه في البريف.
<!-- delegation:end -->
