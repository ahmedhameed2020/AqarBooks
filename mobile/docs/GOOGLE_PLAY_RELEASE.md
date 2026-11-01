# AqarBooks Mobile — حزمة النشر على Google Play

مسودة تجهيز إصدار V1 أندرويد؛ تحديث محلي 2026-10-09: تأجيل Fawry. الـAAB الحالي يحتاج استبدالًا بعد الاختبارات وموافقة البناء، ولا يجوز إرسال وصفه أو لقطته القديمة للمراجعة.  مبنية على الحالة الفعلية للمشروع — آخر تحقق ميداني بتاريخ **2026-10-08** (فحص `android/app/build.gradle.kts` والـManifest، وAAB موقّع مبني، وفحص حيّ لـ`assetlinks.json` وروابط سياسة الخصوصية).

---

## 0. حالة المشروع الآن — ما الجاهز وما الناقص

| البند | الحالة |
|---|---|
| `applicationId` | ✅ **محسوم ومنفَّذ (2026-10-06):** `com.aqarbooks.app` — الـnamespace الداخلي بقي كما هو عمدًا |
| الإصدار | `1.0.0+1` من pubspec — جاهز |
| `compileSdk 36` / target | يفي بمتطلبات Play الحالية — جاهز |
| **توقيع الإصدار** | ✅ **منفَّذ (2026-10-08):** الـupload keystore و`android/key.properties` مولَّدان محليًا (خارج المستودع)، وكلاهما مُستثنى في `mobile/android/.gitignore` (`key.properties`, `**/*.jks`, `**/*.keystore`). build.gradle.kts يقرأ `android/key.properties` ويسقط إلى debug عند غيابه |
| **بناء AAB موقّع** | ✅ **منفَّذ:** `mobile/build/app/outputs/bundle/release/app-release.aab` (≈68 MB، 2026-10-08) موقّع بشهادة upload `CN=AqarBooks, O=AqarBooks, C=EG` |
| الأصول البصرية للمتجر | ✅ **الأيقونة والـFeature graphic جاهزتان** في [store-assets](../store-assets/README.md) وتجتازان `validate_store_assets.py` (`PASS: 2/2 assets valid`). ✅ **لقطات الشاشة جاهزة (2026-10-11):** ثماني لقطات فعلية 1080×2400 من تطبيق Android على المحاكي في [screenshots/ar](../store-assets/screenshots/ar/) تجتاز `validate_play_screenshots.py` (`PASS: 8/8`) — التفاصيل والبصمات في [GOOGLE_PLAY_SCREENSHOTS_VALIDATION.md](GOOGLE_PLAY_SCREENSHOTS_VALIDATION.md) |
| Deep links | 🟡 `assetlinks.json` منشور على `aqarbooks.com` ويُرجع `com.aqarbooks.app` ببصمة **upload** فقط، وبصمة Play App Signing معلَّقة (القسم 6). `app.aqarbooks.com` نطاق بلا DNS وقد **حُذف فلتر App Link العام غير المستخدم** من الـManifest (2026-10-08)، فلم يعد هناك حاجب DNS — والمتبقي الوحيد بصمة Play App Signing |
| الصلاحيات | ✅ **محسومة ومنفَّذة (2026-10-06):** حُذفت `READ_MEDIA_IMAGES` (الاختيار عبر system picker/Photo Picker بلا صلاحية) و`POST_NOTIFICATIONS` (لا push في V1). المتبقي: INTERNET وCAMERA وUSE_BIOMETRIC فقط |
| سياسة الخصوصية | ✅ **منشورة (2026-10-08):** https://aqarbooks.com/ar/privacy وhttps://aqarbooks.com/en/privacy (‏200)، و`https://aqarbooks.com/privacy` يعيد 307 إلى `/ar/privacy` (الأساس المنشور من [PRIVACY_POLICY_DRAFT.md](PRIVACY_POLICY_DRAFT.md)). 🟡 المتبقي: لصق الرابط في الـConsole |
| **جهة التواصل وحالة البريد** | 🟡 **التوجيه جاهز تقنيًا (2026-10-08):** Cloudflare Email Routing مفعّل وحالته `ready`، والوجهة موثّقة، وقاعدة `support@aqarbooks.com` مفعّلة. أكد Cloudflare DoH وGoogle DoH ظهور سجلات MX الثلاثة. **المتبقي:** اختبار رسالة end-to-end من حساب مختلف والتأكد من وصولها. |
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
> • تابع سجل مدفوعات وحدتك والتحصيلات المسجّلة
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

**الوصف الكامل (إنجليزي، ≤4,000 حرف):**

AqarBooks is a property-community management app for compounds and residential communities in Egypt — built for owners, residents, and operations teams.

**For owners and residents:**
• Track your unit balance and dues at a glance
• View your unit's payment history and recorded collections
• Submit maintenance requests with photos or documents and follow each update
• Issue QR visitor passes and share them through WhatsApp

**For operations teams:**
• Collector: search quickly, record collections in fewer steps, and issue receipts
• Maintenance technician: see today’s priority tasks and document completed work
• Gate security: scan visitor passes and verify access instantly — approved or denied clearly
• Manager: see what needs attention — overdue balances, cheques, and critical maintenance in one view

The app requires an account issued by your compound or organisation using AqarBooks.

> ملاحظة السطر الأخير مهمة: تطبيق يتطلب حسابًا مُدارًا قد يطلب فريق مراجعة Play **بيانات دخول تجريبية** — جهّز حساب `qa.owner` من [DEVICE_TEST_PLAN.md](DEVICE_TEST_PLAN.md) وضعه في App access بالـConsole.

**الأصول البصرية المطلوبة:**

| الأصل | المواصفات | المصدر / الحالة |
|---|---|---|
| أيقونة المتجر | 512×512 PNG (بلا شفافية) | ✅ **جاهزة:** [google-play-icon-512.png](../store-assets/google-play-icon-512.png) — اللوجو الرسمي على خلفية بيضاء، 0 بكسل شفاف |
| Feature graphic | 1024×500 PNG | ✅ **جاهزة:** [google-play-feature-graphic-1024x500.png](../store-assets/google-play-feature-graphic-1024x500.png) — اللوجو + «AqarBooks» على Navy `#07425D` |
| لقطات شاشة هاتف | 2–8 لقطات، يفضل 1080×2400 | ⚠️ **مجموعة سابقة تحتاج تحديث V1:** [screenshots/ar](../store-assets/screenshots/ar/) تضم ثماني لقطات فعلية 1080×2400 **ملتقطة من محاكي Android** (`Medium_Phone_API_36.1`)، لا من جهاز بيع فعلي: الرئيسية (ساكن)، المدفوعات، كود فوري، تصريح الزائر، تفاصيل طلب صيانة، اليوم (فني)، المسح (بوابة)، الرئيسية (مدير). بيانات تجريبية بالكامل — **لا بيانات حقيقية ولا اعتماد زائر صالح**. التحقق: [GOOGLE_PLAY_SCREENSHOTS_VALIDATION.md](GOOGLE_PLAY_SCREENSHOTS_VALIDATION.md) |

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

## 7. استمارة Data safety — مسودة معلّقة، لا إقرار نهائي

التدقيق الجديد حلّ محل المصفوفة السابقة. راجع [مسودة V1](GOOGLE_PLAY_DATA_SAFETY_DRAFT_V1_2026-10-09.md)، و[تدقيق الكود والمكتبات](GOOGLE_PLAY_DATA_CODE_AUDIT_2026-10-09.md)، و[مراجعة المزوّدين](GOOGLE_PLAY_DATA_PROVIDER_REVIEW_2026-10-09.md).

- الجمع: نعم للمسارات المثبتة. المشاركة لكل نوع معلّقة حتى حسم العقود والمستلمين؛ لا استثناء تلقائي لمزوّد خدمة.
- ML Kit في مسح QR يتضمن بيانات قياس تشخيص واستخدام؛ نفي التحليلات السابق غير معتمد.
- التشفير الشامل، مسار طلب الحذف، اختيارية البيانات لكل الأدوار، وبيانات القياس الخاصة بإصدار SDK تحتاج تحققًا تشغيليًا قبل الحفظ.
- المصدر المحلي المقترح لـV1 يحظر بدء Fawry؛ الـAAB المرفوع والـBackend لم يُستبدلا بهذه التعديلات. لا تفترض زوال مساراته من النسخة المنشورة.
- Financial features تبقى مفتوحة بسبب إدارة المستحقات والتحصيلات والسجل، حتى بعد تأجيل الدفع الإلكتروني.
- لا حفظ لاستمارة Data safety أو اعتماد نهائي قبل موافقة المستخدم.

## 8. Content rating — معلّق

شروط IARC لم تُقبل والاستبيان لم يُرسل. لا يُعتمد تصنيف عمري متوقع أو إجابات تتعلق بالمشاركة قبل مراجعة الأسئلة والأدلة وموافقة المستخدم.

## 9. مسار النشر

الهدف Production وفق المتطلبات الفعلية لحساب المؤسسة في Console. الاختبار المغلق اختياري ما لم يفرضه Console. يلزم اختبار نسخة V1 الجديدة المثبتة من Play بعد الموافقة على البناء والرفع؛ لا نشر أو إرسال للمراجعة دون موافقة صريحة.

**ملاحظات الإصدار (جاهزة):**

> **عربي:** الإصدار الأول من AqarBooks: متابعة مستحقات وحدتك وسجل المدفوعات، طلبات الصيانة بالصور، تصاريح زوار بكود QR، وأدوات فرق التشغيل (التحصيل، الصيانة، البوابة).
>
> **English:** First release of AqarBooks: track your unit dues and payment history, submit maintenance requests with photos, issue QR visitor passes, and operations tools for collection, maintenance, and gate teams.

## 10. Checklist نهائي قبل الضغط على Publish

- [x] قرار `applicationId` النهائي: `com.aqarbooks.app` ✅ منفَّذ
- [x] signingConfig في Gradle ✅ منفَّذ (يقرأ `android/key.properties`)
- [x] توليد upload keystore + كتابة `android/key.properties` ✅ منفَّذ محليًا — الملفان خارج git ومُستثنيان في `mobile/android/.gitignore`
- [x] بناء AAB موقّع ✅ منفَّذ: `mobile/build/app/outputs/bundle/release/app-release.aab` موقّع بشهادة upload
- [x] حذف `POST_NOTIFICATIONS` و`READ_MEDIA_IMAGES` ✅ منفَّذ
- [x] سياسة الخصوصية منشورة: https://aqarbooks.com/ar/privacy وhttps://aqarbooks.com/en/privacy (و`/privacy` → 307 → `/ar/privacy`) ✅ منفَّذ
- [x] أيقونة المتجر 512×512 + Feature graphic 1024×500 في `mobile/store-assets/` ✅ منفَّذة ومُتحقَّقة (`PASS: 2/2 assets valid`)
- [x] `assetlinks.json` على `aqarbooks.com` يُرجع `package_name: com.aqarbooks.app` ✅ منفَّذ (ببصمة upload فقط)
- [ ] **اختبار بريد الدعم end-to-end:** Cloudflare Email Routing وMX والوجهة وقاعدة `support@aqarbooks.com` جاهزة ومتحقّقة عبر API وDNS العام؛ أرسل رسالة من حساب مختلف وتأكد من وصولها إلى صندوق الاستقبال الموثّق
- [ ] **رفع الـAAB على Play Console (Internal testing)** — لم يُنفَّذ بعد. لا تُعلَم أي مهمة يدوية في الـConsole كمكتملة قبل وجود دليل منها
- [ ] إضافة **بصمة Play App Signing** إلى `assetlinks.json` بجانب بصمة upload بعد أول رفع (قسم 6)
- [x] حسم **`app.aqarbooks.com`** ✅ منفَّذ (2026-10-08): حُذف فلتر App Link العام غير المستخدم من الـManifest، ولم يبقَ أي حاجب DNS — `assetlinks.json` مطلوب لفلتر التنشيط وحده (قسم 6)
- [x] لقطات شاشة (2–8 لقطات، 1080×2400) ✅ منفَّذة (2026-10-11): ثماني لقطات **ملتقطة من محاكي Android** (`Medium_Phone_API_36.1` بدقة 1080×2400) لتطبيقنا الفعلي في [screenshots/ar](../store-assets/screenshots/ar/) — **ليست من جهاز بيع فعلي** — التفاصيل والبصمات في [GOOGLE_PLAY_SCREENSHOTS_VALIDATION.md](GOOGLE_PLAY_SCREENSHOTS_VALIDATION.md) (المتبقي داخل هذا البند: استكمال بيانات المتجر — قسم 4)
- [ ] لصق رابط سياسة الخصوصية في حقل الـConsole
- [ ] حساب المراجع التجريبي (`qa.owner`) في App access (قسم 4)
- [ ] Data safety (قسم 7): المحتوى مُعدّ، لكن إدخال Console والتحقق التعاقدي مع مزوّدي الخدمة ما زالا معلّقين + Content rating (قسم 8)
- [ ] إضافة المختبرين (Internal ثم Closed) — قسم 9
- [ ] تنفيذ كل بوابات [DEVICE_TEST_PLAN.md](DEVICE_TEST_PLAN.md) على نسخة مثبتة **من Play** — لم يُنفَّذ بعد
