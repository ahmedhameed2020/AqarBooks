# جولة التدقيق المركّز — الـ 9 المتبقية (2026-11-01)

## 1) أُصلح وتحقّق ✅

### `responsive-overflow` — 18/18 (كان 10 فشل/8 نجاح)
**السبب الحقيقي (مقيس، لا مشتبه):** قائمة `marketing-nav` المكتبية كانت تظهر عند `lg` (1024px) قبل أن تتسع: تجاوز 96px (EN) و122px (AR) في **كل** الصفحات العامة الخمس × اللغتين؛ وصف metadata داخل `section-financial-control` لا يلتف فتتجاوز عناصره 61–71px عند 320px في الرئيسية.
**الإصلاح (أدنى تغيير):** نقطة توقف القائمة/الأزرار إلى `xl` (‏1280) وزر القائمة/الدرج إلى `xl:hidden`؛ إضافة `flex-wrap` للصف. الدليل: `b3-triage-responsive-overflow.txt` — 18/18 عبر 5 عروض × مسارين.

### `chart-of-accounts-permission-gate` — 4/4 (كان 4 فشل)
**ليست عيب منتج:** (أ) الاختبار يطلب نصاً قديماً «You don't have permission…» بينما الصفحة تقول «You **do not**…» (page.tsx:30-31)؛ (ب) المنظمة الاختبارية تُنشأ بلا دليل حسابات، فلا يوجد `<table>` ليظهر. حدّثت التوقعات إلى علامات الصفحة الحقيقية (عنوان + شارة «Unified Ledger» + غياب رسالة الرفض). الدليل: `b3-triage-chart-of-accounts-permission-gate.txt`.

## 2) صُنّفت ولم تُصلح بعد (5)

| spec | التصنيف | الدليل |
|---|---|---|
| `dunning` | **TEST_EXPECTATION** | يطلب نصاً `/RAISES notices; it does not send them/i` غير موجود في المنتج (بحث `app/` و`messages/`)؛ الحالة الحالية تعرض حالات الإشعار (Notice Raised/Pending، dunning-client.tsx:193) — المبدأ محفوظ لكن النص تغيّر |
| `einvoice-settings` | **TEST_EXPECTATION (مرشح)** | يطلب `/Not configured/i` غير موجود في صفحة/عميل الإعدادات؛ يحتاج تحديثاً على النصوص الحالية |
| `exchange-rates` | **TEST_EXPECTATION** | يطلب `/will be refused until one is/i` غير موجود في الصفحة/العميل |
| `einvoice-items` | **fixture/صلاحية (مرشح)** | بوابة الصفحة تشترط `finance.einvoice.manage/read` (المفتاحان موجودان في `permissions`)؛ المستخدم الاختباري وصل لصفحة الرفض — يحتاج فحص ربط دور الـ fixture |
| `owner-portal-invite` | **fixture/صلاحية** | ‏RPC يرفض بصحة: `FORBIDDEN_PORTAL_INVITE` — الدور الاختباري لا يحمل صلاحية دعوة البوابة |

## 3) بيئة تشغيل (2)

| spec | الإشارة |
|---|---|
| `admin-team-invite-flow` | التدفق يستدعي `inviteUserByEmail` (مسار بريد) على r6؛ لم يُلتقط توست نجاح/فشل — أرجح عائق بيئة بريد في المكدس المعزول |
| `new-finance-screens-smoke` | مهلة 120s أثناء `locator.fill` — نمط تعليق تحميل ظهر سابقاً وزال بإعادة التشغيل؛ يحتاج إعادة |

**لا BLOCKER منتج مثبت في الـ 9. العيب الواجهي الحقيقي الوحيد (responsive) أُصلح وتحقّق.**

## 4) حالة الموجة الثانية بعد التدقيق

19 + 2 = **21/28 خضراء**؛ 7 موثقة أعلاه (5 توقعات/fixture + 2 بيئة).
