# AqarBooks Mobile — حزمة النشر على Google Play

كل ما يلزم لإصدار V1 أندرويد. مبنية على الحالة الفعلية للمشروع — آخر تحقق ميداني بتاريخ **2026-10-08** (فحص `android/app/build.gradle.kts` والـManifest، وAAB موقّع مبني، وفحص حيّ لـ`assetlinks.json` وروابط سياسة الخصوصية).

---

## 0. حالة المشروع الآن — ما الجاهز وما الناقص

| البند | الحالة |
|---|---|
| `applicationId` | ✅ **محسوم ومنفَّذ (2026-10-06):** `com.aqarbooks.app` — الـnamespace الداخلي بقي كما هو عمدًا |
| الإصدار | `1.0.0+1` من pubspec — جاهز |
| `compileSdk 36` / target | يفي بمتطلبات Play الحالية — جاهز |
| **توقيع الإصدار** | ✅ **منفَّذ (2026-10-08):** الـupload keystore و`android/key.properties` مولَّدان محليًا (خارج المستودع)، وكلاهما مُستثنى في `mobile/android/.gitignore` (`key.properties`, `**/*.jks`, `**/*.keystore`). build.gradle.kts يقرأ `android/key.properties` ويسقط إلى debug عند غيابه |
| **بناء AAB موقّع** | ✅ **منفَّذ:** `mobile/build/app/outputs/bundle/release/app-release.aab` (≈68 MB، 2026-10-08) موقّع بشهادة upload `CN=AqarBooks, O=AqarBooks, C=EG` |
| الأصول البصرية للمتجر | ✅ **الأيقونة والـFeature graphic جاهزتان** في [store-assets](../store-assets/README.md) وتجتازان `validate_store_assets.py` (`PASS: 2/2 assets valid`). 🟡 **المتبقي:** لقطات شاشة من جهاز حقيقي |
| Deep links | 🟡 `assetlinks.json` منشور على `aqarbooks.com` ويُرجع `com.aqarbooks.app` ببصمة **upload** فقط، وبصمة Play App Signing معلَّقة (القسم 6). `app.aqarbooks.com` نطاق بلا DNS وقد **حُذف فلتر App Link العام غير المستخدم** من الـManifest (2026-10-08)، فلم يعد هناك حاجب DNS — والمتبقي الوحيد بصمة Play App Signing |
| الصلاحيات | ✅ **محسومة ومنفَّذة (2026-10-06):** حُذفت `READ_MEDIA_IMAGES` (الاختيار عبر system picker/Photo Picker بلا صلاحية) و`POST_NOTIFICATIONS` (لا push في V1). المتبقي: INTERNET وCAMERA وUSE_BIOMETRIC فقط |
| سياسة الخصوصية | ✅ **منشورة (2026-10-08):** https://aqarbooks.com/ar/privacy وhttps://aqarbooks.com/en/privacy (‏200)، و`https://aqarbooks.com/privacy` يعيد 307 إلى `/ar/privacy` (الأساس المنشور من [PRIVACY_POLICY_DRAFT.md](PRIVACY_POLICY_DRAFT.md)). 🟡 المتبقي: لصق الرابط في الـConsole |
| **Play App Signing** | 🟡 **معلَّق:** بصمة SHA-256 الخاصة بـPlay App Signing لا تظهر إلا بعد أول رفع في الـConsole، ويجب إضافتها إلى `assetlinks.json` **بجانب** بصمة upload (القسم 6) |
| مهام Play Console اليدوية | 🔴 **كلها معلَّقة:** رفع الـAAB على Internal testing، Data safety، Content rating، حساب المراجع في App access، إضافة المختبرين، وتنفيذ بوابات الإصدار على جهاز حقيقي. لا تُعلَم أي منها كمكتملة قبل وجود دليل من الـConsole |

---

## 1. حساب Play Console

- حساب **مؤسسة** (Organization) باسم AqarBooks وليس حسابًا شخصيًا — رسوم 25$ مرة واحدة، ويتطلب D-U-N-S للمؤسسات.
- **لماذا مؤسسة تحديدًا:** الحسابات الشخصية الجديدة ملزمة باختبار مغلق بـ12 مختبِرًا لمدة 14 يومًا قبل الإنتاج؛ حسابات المؤسسات معفاة.
- فعّل **Play App Signing** (الافتراضي): Google تحتفظ بمفتاح التوقيع النهائي وأنت تحتفظ بـupload key فقط — لو ضاع upload key يمكن استبداله.

## 2. توقيع الإصدار — ✅ منفَّذ (2026-10-08)

**الحالة:** الـkeystore و`key.properties` مولَّدان محليًا، والـAAB خرج موقّعًا ونجح بناؤه. الأوامر أدناه محفوظة كمرجع لأي جهاز جديد أو أي إعادة توليد.

**أ. توليد upload keystore (مرة واحدة، على جهاز آمن):**

```bash
keytool -genkey -v -keystore aqarbooks-upload.jks -keyalg RSA -keysize 4096 -validity 10950 -alias upload -dname "CN=AqarBooks, O=AqarBooks, C=EG"
```

احفظ الملف وكلمتي المرور في مدير كلمات مرور الشركة. **لا يُرفع الملف إلى git أبدًا.** ✅ منفَّذ: الملف محفوظ خارج المستودع (مجلد secrets محلي على جهاز البناء)، وكلمتا المرور في `key.properties` المحلي.

**ب. `android/key.properties`** — ✅ منشأ محليًا ومُستثنى من git في `mobile/android/.gitignore`. الشكل:

```properties
storePassword=***
keyPassword=***
keyAlias=upload
storeFile=C:/secure/aqarbooks-upload.jks
```

**ج. تعديل `build.gradle.kts`: ✅ منفَّذ بالفعل** — الملف يقرأ `android/key.properties` تلقائيًا ويوقّع release به، ويسقط إلى مفتاح debug عند غيابه (حتى يظل `flutter run --release` يعمل على أي جهاز تطوير). `key.properties` و`*.jks` ضمن `.gitignore` أصلًا (ولا يوجد أي منها في `git ls-files`).

**د. التحقق من أن التوقيع يعمل فعلًا:** بناء `flutter build appbundle --release` نجح وأنتج AAB موقّعًا بشهادة upload، والبصمة المطبوعة بـ`keytool -printcert -jarfile` هي نفسها البصمة المنشورة في `assetlinks.json` (القسم 6) — أي أن الـkeystore المحلي والاستضافة متطابقان.

## 3. بناء الـAAB

Play يقبل **App Bundle فقط**. الـdart-defines إلزامية في أمر البناء نفسه وإلا خرج التطبيق بلا إعدادات (ConfigScreen):

```bash
flutter build appbundle --release --dart-define=SUPABASE_URL=https://<project>.supabase.co --dart-define=SUPABASE_ANON_KEY=<publishable-key>
```

الناتج: `build/app/outputs/bundle/release/app-release.aab`. المفتاح publishable/anon فقط — لا service key في التطبيق إطلاقًا (القاعدة قائمة أصلًا).

✅ **مبني فعلًا (2026-10-08):** `mobile/build/app/outputs/bundle/release/app-release.aab` موجود وموقّع بشهادة upload (مجلد `build/` مُستثنى من git). **لم يُرفع بعد إلى Play Console.**

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

| الأصل | المواصفات | المصدر / الحالة |
|---|---|---|
| أيقونة المتجر | 512×512 PNG (بلا شفافية) | ✅ **جاهزة:** [google-play-icon-512.png](../store-assets/google-play-icon-512.png) — اللوجو الرسمي على خلفية بيضاء، 0 بكسل شفاف |
| Feature graphic | 1024×500 PNG | ✅ **جاهزة:** [google-play-feature-graphic-1024x500.png](../store-assets/google-play-feature-graphic-1024x500.png) — اللوجو + «AqarBooks» على Navy `#07425D` |
| لقطات شاشة هاتف | 2–8 لقطات، يفضل 1080×2400 | 🔴 **متبقية:** تُلتقط من الجهاز الحقيقي أثناء تنفيذ خطة الاختبار (بيانات QA الوهمية — **لا بيانات حقيقية في اللقطات**)؛ المقترح: الرئيسية، المدفوعات، كود فوري، تصريح الزائر، مهام الفني، نتيجة البوابة الخضراء |

تُعاد الأصول وتُتحقق حتميًا بالأمرين `python mobile/store-assets/generate_store_assets.py` ثم `python mobile/store-assets/validate_store_assets.py` (يفحص PNG والأبعاد وانعدام الشفافية وحضور لونَي العلامة، وينتهي بـ`PASS: 2/2 assets valid`). التفاصيل في [store-assets/README.md](../store-assets/README.md).

## 5. الصلاحيات — ✅ محسومة ومطبَّقة

✅ **محسوم ومنفَّذ (2026-10-06):** الـManifest الآن يعلن `INTERNET` + `CAMERA` (بميزات `required=false`) + `USE_BIOMETRIC` فقط.
- `READ_MEDIA_IMAGES` **حُذفت**: اختيار المرفقات كان أصلًا عبر الـsystem picker (SAF / Android Photo Picker) الذي لا يحتاج أي صلاحية — فسياسة Photo and Video Permissions لم تعد تنطبق ولا يلزم Declaration form.
- `POST_NOTIFICATIONS` **حُذفت**: لا push في V1 (الإشعارات in-app)؛ تعود مع ميزة الـpush مستقبلًا.

## 6. App Links (autoVerify)

الـManifest يعلن فلتر App Link واحد بـ`autoVerify="true"` على `aqarbooks.com` بمسار `/activate` (روابط تنشيط المالك)، إضافة إلى فلتر المخطط المخصص `aqarbooks://activate` الذي لا يحتاج `assetlinks.json`. يتحقق أندرويد من فلتر الـhttps فقط إذا وُجد `assetlinks.json` على النطاق المقابل بمحتوى يضم `package_name` وبصمات SHA-256 للشهادات التي وُقّع بها التطبيق المثبَّت فعلًا. بدونها تعمل الروابط كاختيار متصفح عادي فقط.

**الحالة الفعلية (تحقق حيّ 2026-10-08):**

- ✅ `https://aqarbooks.com/.well-known/assetlinks.json` يعمل ويُرجع `package_name: com.aqarbooks.app` مع بصمة SHA-256 واحدة هي بصمة **upload key** (تم إعدادها في Cloudflare).
- ⚠️ لأن الملف يضم بصمة upload فقط، فهو يطابق البناء الموقّع محليًا بمفتاح upload فقط. نسخ Play تُوقّعها Google بمفتاح **Play App Signing**، فلن تتحقق الروابط عليها حتى تُضاف البصمة الثانية.
- 🟡 **بصمة Play App Signing معلَّقة:** لا تُعرض إلا في Play Console → Setup → App integrity بعد أول رفع. عندها **أضِفها إلى `sha256_cert_fingerprints` بجانب بصمة upload** (الاثنتان معًا، لا استبدال).
- ✅ **حُذف فلتر App Link العام غير المستخدم (2026-10-08):** كان الـManifest يعلن `autoVerify="true"` على النطاق `app.aqarbooks.com` أيضًا، وهذا النطاق **لا يُترجم DNS**، كما أن تحليل الروابط في التطبيق لا يتعامل إلا مع `aqarbooks.com/activate/<token>`، فكان الفلتر غير قابل للتحقق وغير معالَج في الوقت نفسه. حُذف الفلتر وحده، وبقيا كما هما: فلتر التنشيط `aqarbooks.com/activate` والمخطط المخصص.
- ✅ رابط منفذ المستحقات صار يُبنى على النطاق الحيّ: `https://aqarbooks.com/ar/portal/dues` و`https://aqarbooks.com/en/portal/dues` (كان `paymentPortalHost` يشير إلى النطاق الميت). المنفذ صفحة ويب عادية — لا يحتاج `assetlinks.json`، والقائمة المسموح بها في التطبيق تقبل النطاق الحيّ وترفض `app.aqarbooks.com` صراحةً.

**الخلاصة:** لم يبقَ أي حاجب DNS. `assetlinks.json` مطلوب لفلتر واحد فقط هو **App Link التنشيط** (`aqarbooks.com/activate`)، والمتبقي الوحيد عليه إضافة بصمة **Play App Signing** بعد أول رفع.

## 7. استمارة Data safety (الإجابات الجاهزة — لم تُدخل في الـConsole بعد)

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

## 8. Content rating (الاستبيان جاهز — لم يُرسل بعد)

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
- [x] signingConfig في Gradle ✅ منفَّذ (يقرأ `android/key.properties`)
- [x] توليد upload keystore + كتابة `android/key.properties` ✅ منفَّذ محليًا — الملفان خارج git ومُستثنيان في `mobile/android/.gitignore`
- [x] بناء AAB موقّع ✅ منفَّذ: `mobile/build/app/outputs/bundle/release/app-release.aab` موقّع بشهادة upload
- [x] حذف `POST_NOTIFICATIONS` و`READ_MEDIA_IMAGES` ✅ منفَّذ
- [x] سياسة الخصوصية منشورة: https://aqarbooks.com/ar/privacy وhttps://aqarbooks.com/en/privacy (و`/privacy` → 307 → `/ar/privacy`) ✅ منفَّذ
- [x] أيقونة المتجر 512×512 + Feature graphic 1024×500 في `mobile/store-assets/` ✅ منفَّذة ومُتحقَّقة (`PASS: 2/2 assets valid`)
- [x] `assetlinks.json` على `aqarbooks.com` يُرجع `package_name: com.aqarbooks.app` ✅ منفَّذ (ببصمة upload فقط)
- [ ] **رفع الـAAB على Play Console (Internal testing)** — لم يُنفَّذ بعد. لا تُعلَم أي مهمة يدوية في الـConsole كمكتملة قبل وجود دليل منها
- [ ] إضافة **بصمة Play App Signing** إلى `assetlinks.json` بجانب بصمة upload بعد أول رفع (قسم 6)
- [x] حسم **`app.aqarbooks.com`** ✅ منفَّذ (2026-10-08): حُذف فلتر App Link العام غير المستخدم من الـManifest، ولم يبقَ أي حاجب DNS — `assetlinks.json` مطلوب لفلتر التنشيط وحده (قسم 6)
- [ ] لقطات شاشة من جهاز حقيقي (2–8 لقطات، 1080×2400) + استكمال بيانات المتجر (قسم 4)
- [ ] لصق رابط سياسة الخصوصية في حقل الـConsole
- [ ] حساب المراجع التجريبي (`qa.owner`) في App access (قسم 4)
- [ ] Data safety (قسم 7) + Content rating (قسم 8)
- [ ] إضافة المختبرين (Internal ثم Closed) — قسم 9
- [ ] تنفيذ كل بوابات [DEVICE_TEST_PLAN.md](DEVICE_TEST_PLAN.md) على نسخة مثبتة **من Play** — لم يُنفَّذ بعد
