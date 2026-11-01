# حزمة مراجعة Batch 1B — r6 / 120000–240000

## النطاق

- حزمة جاهزة للتوقيع البشري على r6 فقط، وليست قبولًا تلقائيًا أو اعتمادًا أو جاهزية للإنتاج.
- تضم الترحيلات الثلاثة عشر 120000–240000، ومتتبع التقدم القائم، والفروق والأدلة المتأثرة.
- قبول REL-02 للترحيلات 120000–230000 محفوظ ولا يُعاد فتحه؛ الجديد المطلوب حسمه هو REL-03 وترحيل 240000 وخطة تراجعه.
- لم يُطبّق شيء خارج r6، ولم تبدأ Batch 2. لا نشر أو `commit` أو `push` ضمن هذه الحزمة.

## النتائج النهائية

| المسار | الحالة | النتيجة | الدليل |
|---|---|---|---|
| تصنيف المسودة الملغاة والإطلاق | ناجح | المسودة لا تصبح إطلاق تكلفة؛ الإطلاق الصحيح 600 يعطي WIP=400 والقيود=400 | `evidence/run9/results/cancelled_credit_release_after_230000.txt` |
| فصل صافي الحارس 220000 | ناجح | المسودة الدائنة الملغاة لا تسبب رفضًا زائفًا؛ `SET CONSTRAINTS ALL IMMEDIATE` ناجح | `evidence/run7/results/cancelled_credit_release_immediate_after.txt` |
| منع إنشاء رصيد سالب | ناجح | 1000 إلى -500 مرفوض دون كتابة، ويبقى الرصيد 1000 | `evidence/run8/results/negative_and_improvement.txt` |
| تحسين رصيد سالب قديم | ناجح | -500 إلى -400 مقبول | `evidence/run8/results/negative_and_improvement.txt` |
| إلغاء مسودة مدينة يجعل الحارس سالبًا | ناجح بعد 230000 | قبل الإصلاح floor_net من 100 إلى -200 ومرور القيود؛ بعد الإصلاح رفض عند القيود المؤجلة، وبعد ROLLBACK يبقى net=100 وfloor_net=100 وledger=100 والحالة DRAFT | `evidence/run9/results/cancelled_debit_status_before.txt` و`cancelled_debit_status_after.txt` |
| العكس الحقيقي | ناجح | عكس الإطلاق 1000/0/1000 ثم عكس الرسملة 0/0/0، دون تشغيل حارس إلغاء المسودة | `evidence/run9/results/posted_reversal_after_230000.txt` |
| سباق الإطلاق ثم العكس | ناجح | الإطلاق يلتزم والعكس المسبب للسالب مرفوض؛ 1000/600/400 وغير المتوازنة=0 | `evidence/run9/results/race1_verify_after_230000.txt` |
| سباق العكس ثم الإطلاق | ناجح | العكس يلتزم والإطلاق اللاحق مرفوض دون كتابة؛ 0/0/0 وغير المتوازنة=0 | `evidence/run9/results/race2_verify_after_230000.txt` |
| قصر حصيلة الاستبعاد على النقدية/البنك | ناجح بعد 240000 | رُفض حساب ASSET غير النقدي المستقل 1230 بلا قيد وبقي الأصل ACTIVE؛ الحساب النقدي الصالح مقبول | `evidence/run10/results/rel03-review-integration.txt` |
| تكامل الاستبعاد بعد مراجعة REL-03 | ناجح | 8/8 في 16.152 ثانية، exit 0 | `evidence/run10/results/rel03-review-integration.txt` |
| متصفح الاستبعاد بعد مراجعة REL-03 | ناجح | 1/1 في 62.277 ثانية؛ الحساب غير النقدي غير ظاهر والاستبعاد النقدي متوازن | `evidence/run10/results/rel03-review-e2e-optimized.txt` |
| TypeScript بعد تصحيح الاختبار | ناجح | exit 0 | `evidence/run10/results/tsc-rel03-review-status.txt` |
| سلامة متتبع التقدم | ناجح | 7/7، exit 0؛ زمن المشغّل 10.861 ثانية | `evidence/run10/results/batch1b-240000-progress-status.txt` |
| الضرائب وFawry | محجوب خارجيًا | قواعد الضرائب ومفاتيح Fawry غير متاحة؛ لم تُسجل نجاحًا ولا تدخل في هذا التوقيع | `tracker/status.json` |
| تقارير الأصول وCAM وCAPEX/OPEX | مؤجل بقرار | الروابط مخفية والاختبارات متخطاة وليست ناجحة | `tracker/status.json` |

محاولة المتصفح الأولى في مراجعة REL-03 انتهت بمهلة أثناء `browserContext.close` بعد نجاح تحققاتها؛ لم تُحسب نتيجة ناجحة مستقلة، وأثرها محفوظ في `evidence/run10/results/rel03-review-e2e.txt` و`rel03-review-trace/test.trace`.

## SQL والفروق والمراجعة

- `sql/20261029220000_project_wip_floor_ignore_cancelled_drafts.sql`: صافي مستقل للحارس يستبعد المسودات الملغاة من خط الأساس والفحص النهائي.
- `sql/20261029230000_project_status_cancellation_floor.sql`: قفل وخط أساس قبل إلغاء المسودة بالحالة وفحص مؤجل بعده؛ العكس من POSTED مستثنى.
- `sql/20261029240000_disposal_proceeds_cash_only.sql`: يقصر الحصيلة الموجبة على حساب نقدية/بنك صالح داخل المؤسسة، ويرفض حساب الأصل ومجمع الإهلاك وطالب مركز التكلفة.
- `sql/20261029240000_disposal_proceeds_cash_only_rollback.sql`: يعيد التعريف السابق ويزيل قيد REL-03؛ لم يُطبّق، وتطابقه مع التعريف السابق موثق في `evidence/run10/results/rollback-match.txt`.
- `diffs/floor_live_220000.diff` و`diffs/dispose-fixed-asset-live.diff`: فروق الدوال الحية. ملف 230000 الجديد هو فرق مسار الحالة المضاف.
- `diffs/rel03-code.diff`: فرق شجرة عمل للملفات الستة، وقد يتضمن تعديلات سابقة؛ ليس فرق REL-03 المعزول.
- المراجعة المحلية `reviews/review-240000-sql.md` مقبولة محليًا بلا Critical أو Required مفتوحة، وليست توقيع DBA بشريًا.
- نقطة التوقيع البشرية المعلقة: `reviews/review-signoff-batch-1b.md`، ومرجعها الخارجي `review-signoff-batch-1b.md`.

## التحقق

`manifest.txt` يحمل SHA-256 لكل ملفات الحمولة بأسطر LF. بجانب الأرشيف ملف `.sha256` وتقرير `.verify.txt` مستقلان. جميع بيانات السباق والاختبارات الملتزمة المؤقتة نُظفت، ومعاملات الاختبار المؤقتة انتهت بـROLLBACK. تبقى Batch 1B بحالة `in_progress` حتى قبول بشري صريح.
