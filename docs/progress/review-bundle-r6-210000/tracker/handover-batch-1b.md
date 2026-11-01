# تسليم Batch 1B (للوكيل الجديد)

تاريخ التسليم: 2026-10-29 · الفرع: `fix/phase1-financial-report-authz` · المستودع: `D:\Web\AqarBooks`

## 0. القواعد الثابتة (لا تُكسر)
- **r6 فقط.** لا تطوير، لا إنتاج، لا اتصال بقاعدة غير r6. لا تقرأ أسرار من مجلد `C:\Users\Lenovo\AppData\Local\Temp\g0-r6` ولا تطبعها.
- **لا** commit، ولا push، ولا نشر، ولا Batch 2، ولا بيان "جاهزية الإنتاج".
- **لا تطبّق** أي ترحيل خارج r6. كل الترحيلات المقترحة ملفات مراجعة في `docs/progress/proposals/` وقد طُبّقت على r6 فقط.
- **الاعتماد يحتاج نصًا صريحًا من المستخدم.** التوصية ليست اعتمادًا.
- **التأجيل ≠ النجاح.** الاختبار المؤجل يُعلَّم `test.fixme` ويظهر مُتخطّى.
- لا تُخفّف تأكيدًا ولا ترفع مهلة ولا تحذف دليلًا ولا قاعدة بيانات.
- لا تعِد اختبارات غير متأثرة. أعد المتأثر فقط.
- Migrations immutable: لا تعدّل ملفات `supabase/migrations/` القديمة، والترحيل الجديد ملف forward-only.

## 1. الحالة الحالية باختصار
- **Batch 1B مفتوحة (`in_progress`)** في `docs/progress/status.json`؛ القرارات الخارجية لا توقف العمل المستقل، ولا تُغلق الدفعة قبل استكمال البنود في `ROADMAP.md`.
- الترحيلات 120000–210000 مطبّقة على r6، ورُوجعت محليًا. أُصلح تفاعل تصنيف المسودة مع صافي الحارس بالترحيل 210000. **المراجعة البشرية ما زالت مطلوبة** ولم يُطبّق شيء خارج r6.
- **التسليم للمراجعة: الحزمة النهائية `docs/progress/review-bundle-r6-210000.zip`.** تضم الترحيلات 120000–210000 والأدلة ونتائج الحالتين الأخيرتين والوقت الفعلي؛ بصمتها محفوظة بجانبها في ملف `.sha256`.

## 2. ما الذي طُبّق على r6 (بالترتيب)
| الملف | الوظيفة | الحالة |
|---|---|---|
| `proposals/20261029120000_project_posting_lock_guard.sql` | حارس حقول المشروع، قفل `FOR UPDATE`، تدقيق `PROJECT_UPDATED`، وسحب DELETE/TRUNCATE من anon/authenticated | مطبّق على r6، تراجع مُختبر؛ ينتظر المراجعة البشرية |
| `proposals/20261029130000_project_line_lock_and_wip_floor.sql` | قفل سطر المشروع وأرضية WIP لكل صف | مطبّق ثم مُستبدل |
| `proposals/20261029140000_project_wip_summary_reversals.sql` | تصنيف العكس حسب القيد الأصلي | مطبّق ثم استُكمل بـ200000 |
| `proposals/20261029150000_manual_journal_no_project_tag.sql` | منع وسم القيد اليدوي بمشروع | مطبّق على r6، اختبارات A1–A7 ناجحة |
| `proposals/20261029160000_project_wip_floor_at_commit.sql` | فحص صافي الأرضية عند الالتزام | مطبّق ثم مُستبدل |
| `proposals/20261029170000_wip_floor_on_line_update.sql` | تغطية التحديث والنقل بين المشاريع | مطبّق ثم مُستبدل |
| `proposals/20261029180000_wip_floor_baseline_and_delete.sql` | تغطية الحذف وخط أساس الرصيد السالب | مطبّق على r6؛ السياسة تحتاج تأكيد المالك |
| `proposals/20261029190000_project_wip_negative_message.sql` | توضيح أن الرقم الثاني صافٍ متوقع بعد الحركة المرفوضة | مطبّق على r6، تغيير لفظي فقط |
| `proposals/20261029200000_project_wip_summary_cancelled_drafts.sql` | استبعاد المسودة الملغاة بالحالة فقط من تصنيف WIP، مع إبقاء العكس الحقيقي | مطبّق على r6؛ الواجهة 8/8 |
| `proposals/20261029210000_project_wip_net_status_neutral.sql` | إبقاء صافي الحارس محايدًا لتغيير حالة القيد بعد استبعاد المسودة من التقرير | **الأحدث، مطبّق على r6؛ اختبار قبل/بعد ناجح** |

**تراجع:** ملف `concurrency/rollback_to_pre_migration.sql` للترحيل 120000. للترحيلات الأخرى: التراجع موثّق في رأس كل ملف. قيد `check_audit_action` الموسّع **يبقى** بعد التراجع لأن صفوف `PROJECT_UPDATED` مُجزّأة ولا تُحذف؛ هذا الأثر ينتظر قبول المراجع.

## 3. الكود المعدَّل في التطبيق (على شجرة العمل، غير ملتزم)
- `lib/actions/projects.ts`: `saveProject` (upsert) استُبدل بـ`createProject` (insert يرفض الكود المكرر بـ`PROJECT_CODE_EXISTS`) و`updateProject` (تعديل صريح، صلاحية `finance.accounts.manage`، قفل الحقول بعد الحركات بـ`PROJECT_HAS_POSTINGS`).
- `app/[locale]/(app)/finance/projects/project-forms.tsx`: وضع إنشاء/تعديل، حسابات WIP والتكلفة اختيارية عند الإنشاء، رسائل عربية/إنجليزية للأخطاء الجديدة.
- `projects-client.tsx` و`projects/page.tsx`: زر تعديل لمن يملك الصلاحية، وإرفاق الحقول المخزّنة (`property_id`, `wip_account_id`, `cost_of_sales_account_id`).
- `assets/asset-forms.tsx` و`assets-client.tsx` و`page.tsx`: `organizationId` مخفي في نموذج التسجيل والإهلاك، وحقل `proceedsAccountId` (حساب حصيلة الاستبعاد) في نموذج الاستبعاد.
- `app/[locale]/(app)/finance/reports/lease-expirations/page.tsx`: الاستعلام يتبع العلاقة الصحيحة `units.property_id → properties` والهاتف من `member_phones`. (الفرق: `docs/progress/evidence-r6-run3/lease-page.diff`.)
- `reports-hub-client.tsx` و`layout.tsx`: حُذفت روابط تقرير الأصول وCAM وCAPEX/OPEX.
- `lib/auth`: لم يُعدَّل.

## 4. القرارات والاعتمادات (مع المرجع)
- **تأجيل تقارير الأصول وCAM وCAPEX/OPEX:** معتمد بنص صريح؛ الروابط مخفية، والاختبارات `test.fixme` باسم DEFERRED. انظر `docs/progress/decisions/2026-10-29-report-deferrals.md`.
- **الخيار A (منع وسم القيد اليدوي بمشروع):** معتمد بنص صريح. انظر `docs/progress/decisions/2026-10-29-manual-journal-project-tag.md`.
- **تصنيف العكس والمسودة الملغاة:** مكتمل. المسودة التي لم تُرحّل لا تظهر كإطلاق، والقيد المرحّل المعكوس يحتفظ بتصنيفه وأثر عكسه.
- **غير معتمد بعد (مفتوح):** فئات حساب حصيلة الاستبعاد، قاعدة الرصيد السالب الموجود «التحسين فقط»، والمراجعة البشرية للترحيلات قبل أي بيئة أخرى. هذه القرارات لا توقف العمل المحلي المستقل.

## 5. حالة الاختبارات (r6)
| الملف | النتيجة | ملاحظات |
|---|---|---|
| `projects-wip.spec.ts` | **8/8 ناجح** في `evidence-r6-run5/results/projects-wip-ui-after.txt` | يشمل المسودة الملغاة بالحالة فقط |
| `cancelled_draft_floor_regression.sql` | قبل: الصافي 100 ثم -200؛ بعد 210000: **100 ثم 100** والقيود 100 | اختبار التفاعل المتأثر فقط |
| `cancelled_draft_regression.sql` بعد 210000 | ناجح: 1000 مرسمل، 600 مُطلق، 400 WIP والقيود 400 | لم يتغير تصنيف المسودة بعد إصلاح الحارس |
| `two_project_multiline_update_ordering.sql` | **الترتيبان ناجحان**؛ الصافي النهائي 400/400 رغم سالب مؤقت في كل اتجاه | أُغلق البند المحلي المتبقي |
| `cancelled_debit_release_regression.sql` | رُفض إطلاق 1500 على رصيد مرحّل 1000 دون كتابة؛ نجح إطلاق 600 وانتهى WIP إلى 400 | لم يظهر خلل منتج |
| `reports-suite-flow.spec.ts` | ناجح (1) + مُتخطّى (1: الأصول، مؤجل) | التخطي ليس نجاحًا |
| `reports-unbuilt-sections.spec.ts` | مُتخطّى (2: CAM, CAPEX، مؤجلة) | اسم الملف قديم، محتواه مؤجل |
| `reports-lease-expirations.spec.ts` | 1/1 ناجح | عزل المؤسسات |
| `reports-lease-read-failure.spec.ts` | 1/1 ناجح | يحقن فشل قراءة ويستعيد المنحة |
| `accounting-journey.spec.ts` | 15/15 ناجح | نتيجة محفوظة |
| `asset-disposal.spec.ts` و`fixed-assets.spec.ts` | نتائج سابقة ناجحة | لم تُعَد لأن تغييرات WIP لا تمسها |
| `owner-portal-online-payment-fawry.spec.ts` | **غير مُشغَّل** (مفاتيح Fawry غائبة) | عائق خارجي لا يوقف العمل المستقل |
| Vitest (20 ملفًا) | 4 أُعيد تشغيلها ناجحة، و15 بنتيجة الجولة الأولى، و`sandbox-pilot.manual` 3/9 | 6 تأكيدات ضريبية غير متحققة لغياب قواعد معتمدة |

قاعدة الحارس: `concurrency/` يحتوي نتائج T1–T5 وR1/R2 وQ والحذف والنقل والرصيد السالب. إعادة المحاولة تحت تنازع متزامن أُثبتت في `evidence-r6-run4/results/retry_valid_missing_attempt.txt`: انتظرت 3.907 ثوانٍ ثم التزمت، والقيدان POSTED والقيود غير المتوازنة صفر.

**التحقق من TypeScript:** `tsc --noEmit` نجح بعد آخر تغييرات كود (`tsc-final.txt`). لم يتغير كود التطبيق في إصلاحي 200000 و210000.

## 6. ما لم يُختبر أو مفتوح
- **تحديث كشف الدفتر متعدد الأسطر:** اكتمل بالترتيبين، ولا يبقى بند اختبار محلي يمنع التسليم للمراجعة.
- **الحذف والتحديث:** مُغطّيان للأدوار المتجاوزة لـRLS فقط (المالك وservice_role). `authenticated` و`anon` لا يملكان سياسة UPDATE/DELETE على `journal_entry_lines`؛ توسيعهما يحتاج قرار أمن/منتج.
- **السلوك القائم:** `release_project_wip` بلا فحص حالة المشروع موثق للمراجعة، وليس عيبًا جديدًا من ترحيلات WIP الحالية.
- **Fawry والضرائب:** عائقان خارجيان لا يوقفان العمل المستقل.
- **بيئة r6 نفسها:** بيانات اختبار متراكمة ولم تُنظَّف عمدًا. لا حذف للبيانات القديمة.

## 7. تشغيل r6 (مرجع سريع)
- **الحاويات:** `g0r6-db` (Postgres)، `g0r6-kong` (API)، `g0r6-auth`، `g0r6-rest`، `g0r6-storage`. الـAPI على `127.0.0.1:58461`.
- **تطبيق Next:** يُبنى ويُشغّل بسكربت `C:/Users/Lenovo/AppData/Local/Temp/g0-r6-run/app-r6.mjs` (أوضاع: `build`، `start`، `pwo <spec> <outdir>`، `pw`). يحقن متغيرات r6 فقط ويفرّغ `.env.local`.
- **بعد أي تغيير في واجهة التطبيق يجب إعادة البناء** (`build` ثم `start`). الخادم القديم يخدم بناءً قديمًا.
- **Playwright:** المتغير `LOCAL_SUPABASE_API_PORTS=58461` ضروري، وإلا يرفض الحارس التشغيل.
- **Kong:** تعديل `proxy_buffer_size` داخل الحاوية فقط، ويضيع عند إعادة إنشاء الحاوية. التفاصيل في `docs/progress/b1b-r6-run3-gateway-and-pilot.md`.
- **الإيقاف:** أوقف عملية التطبيق على المنفذ 3100 بـ`taskkill //PID <pid> //F` (الشرطتان المزدوجتان مهمّتان في Git Bash).

## 8. مآخذ تشغيلية تعلّمناها (لا تكررها)
- في Git Bash: `docker exec ... sh -c "..."` مع اقتباسات متداخلة يفشل بصمت. استعمل ملف SQL مؤقتًا (`docker cp` ثم `psql -f`).
- معرّفات UUID تُكتب سداسية عشرية فقط. حرف مثل `g` يفشل التنفيذ كله.
- لا تشغّل `find /` (بطيء جدًا). ابحث داخل المستودع فقط.
- Playwright يمسح `test-results` في كل تشغيل. استعمل `--output` لحفظ الأدلة خارجه.
- ملفات `.tsx` داخل `docs/` تُجمَّع من `tsc` إن كانت صالحة. انقل النسخ الأساسية إلى `.txt`.
- تعديل ملف يتطلب قراءته أولًا بأداة `Read`.
- `sed -i` على ملفات CRLF يحافظ على الأسطر، لكن `node -e` مع backticks داخل الاقتباس يفشل. اكتب النص في ملف مؤقت.
- الحقول المعروضة في الواجهة قد تكون غير مطابقة للاختبار القديم؛ تحقّق من الكود قبل تعديل توقع الاختبار، واكتب سبب التعديل.
- يجب أن يكون الاختبار المُصلَح يثبت المعنى نفسه، لا أن يجعل الاختبار ينجح بأي شكل.

## 9. ماذا يفعل الوكيل الجديد أولًا
1. اقرأ جدول Batch 1B في `docs/progress/ROADMAP.md` ثم `docs/progress/status.json`؛ هما المتتبع الحالي.
2. راجع `review-bundle-r6-210000` ومانيفسته؛ يضم الترحيلات والأدلة النهائية، بما فيها 200000 و210000.
3. لا تبدأ جولة جديدة إلا لعيب مثبت أو لبند محلي محدد في الجدول، ولا تتصل بالتطوير أو الإنتاج.
4. عند أي تحديث لاحق، حدّث المتتبع القائم وأرفق الفرق والنتائج؛ لا تنشئ نظام تتبع جديدًا.

## 10. مراجع أساسية
- المتتبع: `docs/progress/ROADMAP.md` و`docs/progress/status.json`.
- الخطط والتحقيقات: `docs/progress/b1b-r6-run3-gateway-and-pilot.md`، و`docs/progress/proposals/project-posting-lock-guard-review.md`، و`docs/progress/proposals/manual-journal-project-tagging-design.md`.
- القرارات: `docs/progress/decisions/`.
- الأدلة: `docs/progress/evidence-r6-run3/`، و`evidence-r6-run4/`، و`evidence-r6-run5/`، و`evidence-r6-run6/`.
- حزمة التسليم: `docs/progress/review-bundle-r6-210000.zip`.
