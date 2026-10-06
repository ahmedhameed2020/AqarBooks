# AqarBooks Mobile — حزمة النشر على Google Play

كل ما يلزم لإصدار V1 أندرويد. مبنية على الحالة الفعلية للمشروع (فحص `android/app/build.gradle.kts` والـManifest بتاريخ 2026-10-06).

---

## 0. حالة المشروع الآن — ما الجاهز وما الناقص

| البند | الحالة |
|---|---|
| `applicationId` | ✅ **محسوم ومنفَّذ (2026-10-06):** `com.aqarbooks.app` — الـnamespace الداخلي بقي كما هو عمدًا |
| الإصدار | `1.0.0+1` من pubspec — جاهز |
| `compileSdk 36` / target | يفي بمتطلبات Play الحالية — جاهز |
| **توقيع الإصدار** | 🟡 **الكود جاهز:** build.gradle.kts يقرأ `android/key.properties` ويسقط إلى debug عند غيابه. **المتبقي عليك فقط:** توليد الـkeystore وكتابة key.properties (القسم 2-أ و2-ب) |
| الأيقونة | موجودة (اللوجو الرسمي) — يلزم فقط نسخة 512×512 للمتجر |
| Deep links | `app.aqarbooks.com` و`aqarbooks.com/activate` بـautoVerify — 🟡 يتطلب استضافة `assetlinks.json` (القسم 6) |
| الصلاحيات | ✅ **محسومة ومنفَّذة (2026-10-06):** حُذفت `READ_MEDIA_IMAGES` (الاختيار عبر system picker/Photo Picker بلا صلاحية) و`POST_NOTIFICATIONS` (لا push في V1). المتبقي: INTERNET وCAMERA وUSE_BIOMETRIC فقط |
| سياسة الخصوصية | 🔴 مطلوبة برابط عام — مسودة جاهزة في [PRIVACY_POLICY_DRAFT.md](PRIVACY_POLICY_DRAFT.md) تُستضاف على `aqarbooks.com/privacy` |

---

## 1. حساب Play Console

- حساب **مؤسسة** (Organization) باسم AqarBooks وليس حسابًا شخصيًا — رسوم 25$ مرة واحدة، ويتطلب D-U-N-S للمؤسسات.
- **لماذا مؤسسة تحديدًا:** الحسابات الشخصية الجديدة ملزمة باختبار مغلق بـ12 مختبِرًا لمدة 14 يومًا قبل الإنتاج؛ حسابات المؤسسات معفاة.
- فعّل **Play App Signing** (الافتراضي): Google تحتفظ بمفتاح التوقيع النهائي وأنت تحتفظ بـupload key فقط — لو ضاع upload key يمكن استبداله.

## 2. توقيع الإصدار (Blocker — نفّذه أولًا)

**أ. توليد upload keystore (مرة واحدة، على جهاز آمن):**

```bash
keytool -genkey -v -keystore aqarbooks-upload.jks -keyalg RSA -keysize 4096 -validity 10950 -alias upload -dname "CN=AqarBooks, O=AqarBooks, C=EG"
```

احفظ الملف وكلمتي المرور في مدير كلمات مرور الشركة. **لا يُرفع الملف إلى git أبدًا.**

**ب. أنشئ `android/key.properties`** (وأضفه إلى `.gitignore`):

```properties
storePassword=***
keyPassword=***
keyAlias=upload
storeFile=C:/secure/aqarbooks-upload.jks
```

**ج. تعديل `build.gradle.kts`: ✅ منفَّذ بالفعل** — الملف يقرأ `android/key.properties` تلقائيًا ويوقّع release به، ويسقط إلى مفتاح debug عند غيابه (حتى يظل `flutter run --release` يعمل على أي جهاز تطوير). `key.properties` و`*.jks` ضمن `.gitignore` أصلًا.

## 3. بناء الـAAB

Play يقبل **App Bundle فقط**. الـdart-defines إلزامية في أمر البناء نفسه وإلا خرج التطبيق بلا إعدادات (ConfigScreen):

```bash
flutter build appbundle --release --dart-define=SUPABASE_URL=https://<project>.supabase.co --dart-define=SUPABASE_ANON_KEY=<publishable-key>
```

الناتج: `build/app/outputs/bundle/release/app-release.aab`. المفتاح publishable/anon فقط — لا service key في التطبيق إطلاقًا (القاعدة قائمة أصلًا).

لكل إصدار تالٍ: ارفع `version` في `pubspec.yaml` (مثلًا `1.0.1+2`) — الـ`versionCode` (بعد `+`) يجب أن يزيد دائمًا.

## 4. بيانات المتجر (نصوص جاهزة)

**اللغة الأساسية:** العربية `ar`، مع ترجمة إنجليزية `en-US`.

| الحقل | القيمة |
|---|---|
| اسم التطبيق (≤30) | `AqarBooks — إدارة أملاكك` / en: `AqarBooks` |
| وصف قصير (≤80) | `مستحقاتك، صيانتك، زوارك — كل ما يخص وحدتك في مكان واحد.` |
| التصنيف | Business |
| بريد التواصل | دعم فني رسمي (مثل support@aqarbooks.com) — إلزامي |
| الدول | مصر أولًا (التوسع لاحقًا بقرار) |

**الوصف الكامل (عربي):**

> AqarBooks هو تطبيق إدارة المجتمعات العقارية والكمبوندات في مصر — للملاك والسكان وفرق التشغيل.
>
> **للمالك والساكن:**
> • تابع رصيد وحدتك ومستحقاتك أولًا بأول
> • ادفع عبر فوري بكود مرجعي من داخل التطبيق
> • اطلب الصيانة بالصور وتابع حالة الطلب خطوة بخطوة
> • أصدر تصاريح زوار بكود QR وشاركها واتساب
>
> **لفرق التشغيل:**
> • المحصّل: بحث سريع، تحصيل بأقل خطوات، وإيصال فوري
> • فني الصيانة: مهام اليوم مرتبة بالأولوية مع إثبات الإنجاز بالصور
> • أمن البوابة: مسح تصاريح الزوار والتحقق الفوري — مسموح أو مرفوض بوضوح
> • المدير: «يحتاج انتباهك» — المتأخرات والشيكات والصيانة الحرجة في شاشة واحدة
>
> يتطلب التطبيق حسابًا صادرًا من إدارة الكمبوند أو المؤسسة المشتركة في AqarBooks.

**الوصف الكامل (إنجليزي):** ترجمة مباشرة للنص أعلاه (متوفر عند الطلب).

> ملاحظة السطر الأخير مهمة: تطبيق يتطلب حسابًا مُدارًا قد يطلب فريق مراجعة Play **بيانات دخول تجريبية** — جهّز حساب `qa.owner` من [DEVICE_TEST_PLAN.md](DEVICE_TEST_PLAN.md) وضعه في App access بالـConsole.

**الأصول البصرية المطلوبة:**

| الأصل | المواصفات | المصدر |
|---|---|---|
| أيقونة المتجر | 512×512 PNG (بلا شفافية) | اللوجو الرسمي على خلفية بيضاء أو Navy `#07425D` |
| Feature graphic | 1024×500 PNG | اللوجو + «AqarBooks» على Navy — يمكن توليده من ملف Figma |
| لقطات شاشة هاتف | 2–8 لقطات، يفضل 1080×2400 | من الجهاز الحقيقي أثناء تنفيذ خطة الاختبار (بيانات QA الوهمية — **لا بيانات حقيقية في اللقطات**)؛ المقترح: الرئيسية، المدفوعات، كود فوري، تصريح الزائر، مهام الفني، نتيجة البوابة الخضراء |

## 5. الصلاحيات — قراران قبل الإرسال

✅ **محسوم ومنفَّذ (2026-10-06):** الـManifest الآن يعلن `INTERNET` + `CAMERA` (بميزات `required=false`) + `USE_BIOMETRIC` فقط.
- `READ_MEDIA_IMAGES` **حُذفت**: اختيار المرفقات كان أصلًا عبر الـsystem picker (SAF / Android Photo Picker) الذي لا يحتاج أي صلاحية — فسياسة Photo and Video Permissions لم تعد تنطبق ولا يلزم Declaration form.
- `POST_NOTIFICATIONS` **حُذفت**: لا push في V1 (الإشعارات in-app)؛ تعود مع ميزة الـpush مستقبلًا.

## 6. App Links (autoVerify)

الـManifest يعلن روابط `app.aqarbooks.com` و`aqarbooks.com/activate`. حتى يتحقق أندرويد منها يجب استضافة:

- `https://app.aqarbooks.com/.well-known/assetlinks.json`
- `https://aqarbooks.com/.well-known/assetlinks.json`

بمحتوى يضم `package_name` وبصمة SHA-256 لشهادة **App Signing** (تؤخذ من Play Console → Setup → App integrity بعد أول رفع، وليست بصمة upload key). بدونها تعمل الروابط كاختيار متصفح عادي فقط.

## 7. استمارة Data safety (الإجابات الجاهزة)

| سؤال | الإجابة |
|---|---|
| هل يجمع التطبيق بيانات؟ | نعم |
| Personal info → Email + User IDs | يُجمع، مرتبط بالمستخدم، **لا يُشارك**، الغرض: App functionality (تسجيل الدخول وإدارة الحساب)، الجمع إلزامي |
| Financial info → Purchase history | يُجمع (مستحقات ومدفوعات الوحدة)، لا يُشارك، الغرض: App functionality |
| Photos | تُجمع (مرفقات الصيانة)، لا تُشارك، الغرض: App functionality، اختيارية |
| Messages / Location / Contacts / Health… | لا يُجمع |
| هل البيانات مشفّرة أثناء النقل؟ | نعم (HTTPS/TLS إلى Supabase) |
| هل يستطيع المستخدم طلب حذف بياناته؟ | نعم — عبر إدارة المؤسسة/قناة الدعم (يجب أن تذكره سياسة الخصوصية) |
| مشاركة مع أطراف ثالثة | لا — المعالجة لدى مزوّد الاستضافة (Supabase) كـprocessor ضمن تشغيل الخدمة |

> ملاحظة اتساق: بيانات الدفع عبر فوري تتم عند منافذ فوري وليست داخل التطبيق (التطبيق يعرض كودًا مرجعيًا فقط) — لا تُعلن «بيانات بطاقات».

## 8. Content rating

استبيان IARC: فئة Utility/Business، لا عنف، لا محتوى مستخدمين عام (المحتوى داخل مؤسسة مغلقة)، لا مقامرة، لا بيانات موقع تُشارك → النتيجة المتوقعة: **Everyone / 3+**.

## 9. مسار النشر

1. **Internal testing** أولًا: ارفع الـAAB، أضف بريد الفريق، ونفّذ [DEVICE_TEST_PLAN.md](DEVICE_TEST_PLAN.md) على النسخة المثبتة **من Play** (تختلف عن sideload في التوقيع والتحسين).
2. **Closed testing**: 10–20 مستخدمًا حقيقيًا من كمبوند تجريبي أسبوعًا.
3. **Production** بطرح تدريجي: 10% ← 50% ← 100% مع مراقبة ANR/Crash في Android Vitals.

**ملاحظات الإصدار (جاهزة):**

> **عربي:** الإصدار الأول من AqarBooks: متابعة مستحقات وحدتك والدفع عبر فوري، طلبات الصيانة بالصور، تصاريح زوار بكود QR، وأدوات فرق التشغيل (التحصيل، الصيانة، البوابة).
>
> **English:** First release of AqarBooks: track your unit dues and pay via Fawry, submit maintenance requests with photos, issue QR visitor passes, and operations tools for collection, maintenance, and gate teams.

## 10. Checklist نهائي قبل الضغط على Publish

- [x] قرار `applicationId` النهائي: `com.aqarbooks.app` ✅ منفَّذ
- [x] signingConfig في Gradle ✅ منفَّذ — **المتبقي:** توليد keystore + كتابة `key.properties` + بناء AAB ناجح
- [x] حذف `POST_NOTIFICATIONS` و`READ_MEDIA_IMAGES` ✅ منفَّذ
- [ ] سياسة الخصوصية منشورة على `aqarbooks.com/privacy` والرابط في الـConsole
- [ ] `assetlinks.json` على النطاقين (قسم 6)
- [ ] بيانات المتجر + الأصول البصرية + حساب المراجعة التجريبي (قسم 4)
- [ ] Data safety + Content rating (قسما 7–8)
- [ ] كل Blockers خطة اختبار الجهاز ✅ على نسخة Internal testing
