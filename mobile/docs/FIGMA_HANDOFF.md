# AqarBooks Mobile — Figma Design Handoff

مهمة الجلسة: بناء **Final Figma Product Design** لتطبيق AqarBooks Mobile Egypt V1، حرفيًا من الـBlueprint — بدون إعادة Audit، بدون features جديدة، بدون تغيير navigation.

## Source of Truth
- **UX Blueprint (ملزم حرفيًا):** `mobile/docs/UX_BLUEPRINT_EGYPT_V1.md`
- اللوجو الرسمي: `mobile/assets/images/logo.png` (AB monogram — B كحلي بداخله A أبيض وأعمدة مبانٍ بنفسجية)

## Design System (مقفول)
- Deep Navy primary `#07425D` (داكن `#042434`) · Petrol Blue `#1B60B9`
- Royal Purple accent `#7E1898` (باعتدال — حالات نشطة وتمييز)
- Gold hairline `#C5A880` · Ink `#0F172A` · Secondary grey `#64748B`
- خلفية Soft Cloud `#F4F6F9` · بطاقات بيضاء بحدود `#E2E8F0` · radius 16
- أسلوب: executive, restrained, premium — بلا gradients ثقيلة أو glassmorphism
- عربي RTL أولًا، خط عربي premium (طراز IBM Plex Sans Arabic)، أرقام بفواصل آلاف + `ج.م`
- أيقونات vector موحدة duotone (خط كحلي + لمسة بنفسجية)

## قاعدة براند إلزامية
اسم البراند يُكتب دائمًا **AqarBooks** باللاتينية — يُمنع «عقاربوكس» في أي شاشة عربية أو إنجليزية.

## قيود مطابقة الـbackend (من الـBlueprint)
- bottom navigation مختلف لكل persona (5 تبويبات حدًا أقصى) — لا dashboards عامة ولا بطاقات مكررة
- لا raw permissions ولا وعود push notifications
- لا خيار شيك في التحصيل إلا بصلاحية `banking.cheques.manage` (الافتراضي: نقدي/تحويل بنكي/أخرى فقط)
- البوابة تبدأ بشاشة **تفعيل جهاز موثوق** قبل أي مسح
- أزرار أوامر الشغل تطابق انتقالات الـDB حرفيًا (لا إلغاء على IN_PROGRESS؛ بدء/تعليق = `.manage`، إكمال = `.complete` بملخص إلزامي)
- لا وعود للمستأجر غير المالك في الصيانة/الزوار/المركبات

## الشاشات المطلوبة (16 شاشة، 5 personas)
**ساكن/مالك:** 1) تسجيل الدخول 2) الرئيسية 3) المدفوعات (عليّ/دفعت) 4) كود فوري المرجعي 5) طلب صيانة جديد (شاشة واحدة) 6) تصريح زائر QR (مع تحذير «احفظ الآن»)
**مدير تشغيل:** 7) الرئيسية «يحتاج انتباهك» + شريط 4 أرقام 8) الصيانة — bottom sheet إسناد أمر شغل
**محصّل/خزينة:** 9) اليوم (بطاقة الجلسة + إجمالي اليوم) 10) خطوة التحصيل (مستحقات + طريقة دفع) 11) إيصال النجاح
**فني صيانة:** 12) اليوم (المهمة الجارية + مهام مرتبة) 13) تفاصيل أمر شغل (تعليق مؤقت + إكمال فقط)
**بوابة:** 14) تفعيل الجهاز (كود 6 خانات، صالح 15 دقيقة) 15) المسح (داكن، دخول/خروج) 16) نتيجة خضراء «مسموح بالدخول» ملء الشاشة

## مرجع بصري معتمد (4 شاشات مولّدة بالهوية)
- Login: https://d8j0ntlcm91z4.cloudfront.net/user_3DovZyI5jwkftC6KUopAtH34T1V/hf_20261003_202236_56f08a3f-11a4-4f7c-a4ec-d13ad1143b46.png
- Fawry code: https://d8j0ntlcm91z4.cloudfront.net/user_3DovZyI5jwkftC6KUopAtH34T1V/hf_20261003_202516_628ee2a7-23aa-4086-bebd-eb2d3d195933.png
- Visitor QR: https://d8j0ntlcm91z4.cloudfront.net/user_3DovZyI5jwkftC6KUopAtH34T1V/hf_20261003_202515_65810079-87bd-4c2e-a0bb-de6d303a1273.png
- Receipt: https://d8j0ntlcm91z4.cloudfront.net/user_3DovZyI5jwkftC6KUopAtH34T1V/hf_20261003_202515_93a2122a-dda3-44fe-987d-9f882b7a626d.png
(ملحوظة: الصورتان Login وReceipt تحملان «عقاربوكس» بالعربي — تُستبدل بـAqarBooks في Figma.)

## التسليم
ملف Figma جاهز لمراجعة التنفيذ. الختام المطلوب بعد اكتمال الملف فعليًا فقط:
`AQARBOOKS MOBILE FIGMA FINAL READY`
