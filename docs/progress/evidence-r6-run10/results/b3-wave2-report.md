# الموجة الثانية — 28 spec على r6: الحصيلة والتصنيف (2026-11-01)

**المنهج:** تشغيل تسلسلي/متوازٍ عبر `run-r6-e2e-managed.mjs`، سجل لكل spec في `b3-wave2-<name>.txt`، والتجميع في `b3-wave2-summary.txt`. المعاملة: قراءة فقط من المنتج (إلا إصلاحين في أداة التشغيل، أسفله).

## إصلاحات أداة التشغيل (اكتشفتها الموجة)

1. **`R6_ANON_KEY` ناقص من بيئة المُشغّل** — `tests/helpers/gate-release.ts:18` يشترطه صراحة. أُضيف `R6_ANON_KEY: kv.ANON_KEY` إلى `run-r6-e2e-managed.mjs` و`app-r6.mjs`. **أعاد 6 specs من فشل بيئي إلى خضراء كاملة (31 اختبارًا).**
2. **حد المُشغّل** رُفع 600s → 1200s لأن بعض specs الطويلة (10 اختبارات × دقيقة) تتجاوزه.

## خضراء (18 spec — 63 اختبارًا)

| spec | النتيجة |
|---|---|
| aging-report-permission-gate | 2/2 |
| customer-advances-ui-screens | 6/6 |
| lease-renewal-ui | 3/3 |
| owner-portal-isolation | 1/1 |
| page-error-states | 2/2 |
| portal-statement | 8/8 |
| re-prior-year-boundary | 4/4 (+1 skipped معلن) |
| reports-lease-expirations | 1/1 |
| reports-lease-read-failure | 1/1 |
| responsive-touch-targets | 4/4 |
| supplier-invoice-vat-wht | 1/1 |
| treasury-account-filter | 3/3 |
| gate-device-enrollment (بعد الإصلاح) | 4/4 |
| gate-scanner-field (بعد الإصلاح) | 6/6 |
| gate-supervision (بعد الإصلاح) | 3/3 |
| portal-journey (بعد الإصلاح) | 6/6 |
| portal-refusals (بعد الإصلاح) | 5/5 |
| portal-visitor-gate-journey (بعد الإصلاح) | 7/7 |

## قيد التصنيف — تحتاج تدقيقًا مركّزًا (9)

| spec | الفشل | الإشارة حتى الآن |
|---|---|---|
| customer-advances | ✅ **10/10** بعد رفع الحد — كان harness محضًا | `b3-wave2c-customer-advances.txt` |
| responsive-overflow | 10/18: «overflow at /ar, /ar/contact, /ar/demo, /ar/privacy» | **مرشح عيب واجهة فعلي** (تجاوز أفقي في صفحات عربية عامة)، سابق لنطاق الدفعات |
| owner-portal-invite | `FORBIDDEN_PORTAL_INVITE` — RPC يرفض بصحة | انحراف fixture/صلاحية المستخدم الاختباري، لا عيب منتج |
| admin-team-invite-flow | اسم العضو غير ظاهر بعد الإرسال؛ اللقطة تُظهر الحوار مفتوحًا | تدفق/محدد قديم أو فشل إرسال — تدقيق |
| chart-of-accounts-permission-gate | 4/4: عنوان الصفحة غير ظاهر | تدقيق (بوابة صلاحية/عنوان) |
| dunning | رسالة «must not let an operator assume» غير موجودة | تدقيق توقعات UI |
| einvoice-items | locator غير موجود | تدقيق توقعات UI |
| einvoice-settings | 3/7: نص حالة لا يطابق | تدقيق توقعات UI |
| exchange-rates | 2 failed: locator غير موجود | تدقيق توقعات UI |
| new-finance-screens-smoke | مهلة 120s أثناء fill | أرجح تعليق تحميل بيئي كالسابق؛ إعادة |

**لا BLOCKER منتج مثبت في هذه الموجة.** لا شيء من تغييرات Batch 1B/2/3 لمس الشاشات المذكورة، لكن ذلك لا يكفي لنفي العيوب — التصنيف النهائي يتطلب جولة تدقيق موجهة لكل spec أعلاه.

**النتيجة النهائية للموجة الثانية:** 19 خضراء + 9 قيد تدقيق مركّز (لا BLOCKER مثبت). إصلاحان في أداة التشغيل فقط: R6_ANON_KEY وحد 1200s.
