# AqarBooks — تدقيق مسارات البيانات والمكتبات (قراءة فقط)

التاريخ: 2026-10-09. تقرير تقني أولي موثق، وليس إقرار Data safety معتمدًا. لم تُقرأ بيانات عملاء أو كلمات مرور أو قيم مفاتيح؛ لم تُجر أي استعلامات قاعدة بيانات أو تغييرات تشغيلية أو إعادة بناء. لا يوجد AGENTS.md متداخل داخل mobile أو supabase بحسب البحث المحلي.

## حدود الإثبات

بصمة AAB الذي جرى فحصه: SHA256 `DB5FD519CFFA5A0A045255C5DAD9C5E5989C667BD55297E556AB17942315418A`. جرد الملحق يسرد 126 عنصرًا من lockfile و150 عنصر artifact Android محليًا، شاملًا Flutter وإضافات دعم وتكرارات نسخ مميزة. ليس فحصًا ديناميكيًا لكل مكتبة.

- المصدر الحالي وpubspec.lock وملفات Android الناتجة محليًا فُحصت. لا يثبت ذلك تطابق كل سطر Dart مع AAB التاريخي؛ النسخة المطلوب نشرها ستحتاج تدقيقًا متكررًا بعد التعديلات وإعادة البناء المعتمدة.
- فُحص ZIP وDEX داخل AAB الحالي مباشرة دون تشغيله أو تفكيك كامل. فحص أسماء أصناف محددة دليل وجود أو غياب محدد، وليس إثبات غياب جميع السلوكيات المحتملة. لا توجد جلسة التقاط حركة شبكة على نسخة Play موقعة.
- لم يُتحقق من قواعد الاستضافة الحية أو إعدادات Supabase Auth/SMTP أو الاحتفاظ بالسجلات أو عقد أي مزوّد. أحكام المشاركة القانونية وتطبيق استثناء Service Provider تحتاج مراجعة مستقلة؛ وجود عقد عام على الإنترنت لا يثبت انطباقه على حساب FlowTech.
- Fawry موجود في الكود وAAB الحالي ولم يُعطل بعد. المستخدم أكد عدم وجود اتفاق تجاري مفعّل. لا يجوز اعتبار نسخة V1 المقترحة بعد التعطيل هي النسخة المرفوعة الآن.

## المكتبات

من pubspec.yaml وpubspec.lock: supabase_flutter **2.18.0** (القيد في YAML ^2.10.3 ليس الإصدار المحلول)، supabase2.16.2، gotrue2.27.2، postgrest2.9.1، storage_client2.8.1، functions_client2.7.1، realtime_client2.13.0، http1.6.0. مسارات الشبكة الأساسية Auth/DB/Storage/Functions إلى Supabase وHTTP تفعيل إلى موقع AqarBooks.

الواجهات المحلية: mobile_scanner7.4.2، local_auth3.0.2، flutter_secure_storage11.2.0، file_picker13.1.0، shared_preferences2.5.5، url_launcher6.3.3، app_links7.2.1، qr_flutter4.1.0، crypto3.0.7، flutter_riverpod2.6.1، Flutter/localizations/icons. باقي lockfile أدوات قياسية للنقل والتنسيق والتشفير والمنصات والاختبارات؛ ليست كل تبعيات منصات iOS/Linux/Windows مدمجة في Android.

Android plugins في `.flutter-plugins-dependencies`: android_file_picker2.0.0، app_links7.2.1، flutter_plugin_android_lifecycle2.0.35، flutter_secure_storage11.2.0، jni1.1.0، jni_flutter1.0.3، local_auth_android2.2.0، mobile_scanner7.4.2، path_provider_android2.3.1، shared_preferences_android2.4.28، url_launcher_android6.3.33.

دليل native المحلول: `mobile/build/app/intermediates/incremental/lintVitalAnalyzeRelease/release-artifact-dependencies.xml:159` قائمة جذر الاعتمادات، :197–216 ML Kit، :248–258 CameraX، :422–438 DataTransport/Firebase components. أهمها:

- ML Kit barcode-scanning17.3.0؛ play-services-mlkit-barcode-scanning18.3.1؛ barcode-scanning-common17.0.0؛ vision-common17.3.0؛ common18.11.0؛ vision-interfaces16.3.0؛ Play Services base18.5.0/tasks18.2.0/basement18.4.0.
- CameraX1.6.1، androidx.biometric1.1.0، Android browser1.9.0، datastore1.1.7، crypto Tink1.23.0، Flutter embedding، AndroidX/Kotlin/Okio/serialization/support libraries.
- Google DataTransport runtime2.2.6/backend-cct2.3.3/api2.2.1، Firebase components16.1.0 وencoders-json17.1.0/encoders16.1.0/annotations16.0.0. وجودها لخدمة ML Kit لا يعني أن التطبيق يستخدم Firebase Analytics أو Crashlytics.
- مكتبة mobile_scanner المحلية `C:/Users/Lenovo/AppData/Local/Pub/Cache/hosted/pub.dev/mobile_scanner-7.4.2/android/build.gradle.kts` تختار bundled17.3.0 افتراضيًا وunbundled18.3.1 عند خاصية اختيارية؛ لا نعتمد إعدادًا افتراضيًا وحده بدل ناتج البناء.

داخل AAB، DEX يحتوي MLKit وDataTransport. البحث عن بادئات FirebaseAnalytics وCrashlytics وGoogleAds وSentry لم يجدها. بحث المصدر وlockfile عن analytics/crash/ad SDKs المعروفة لم يعثر على SDK مستقل لهذه الوظائف. **لا يبرر ذلك إعلان عدم وجود أي تحليلات: ML Kit لديه telemetry.**

داخل AAB لكل arm64-v8a/armeabi-v7a/x86_64: libapp.so، libflutter.so، libbarhopper_v3.so، libdartjni.so، libdatastore_shared_counter.so، libimage_processing_util_jni.so، libsurface_util_jni.so. لم يُنفذ تحليل native كامل لكل رمز.

## الأذونات

الـmanifest المندمج ونسخة AAB التي راجعها المنسق: INTERNET، ACCESS_NETWORK_STATE، CAMERA، USE_BIOMETRIC، USE_FINGERPRINT، صلاحية receiver خاصة بالحزمة. لا AD_ID ولا location ولا contacts ولا microphone ولا صلاحيات media واسعة ولا POST_NOTIFICATIONS. استخدام system picker لا يمنع إرسال ملف يختاره المستخدم. غياب location permission لا يمنع احتواء صورة على EXIF أو وصول IP إلى الخادم.

## مصفوفة البيانات المقترحة

"جمع" هنا نقل خارج الجهاز كما يظهر في الكود؛ إلزامي/اختياري بالنسبة للميزة أو الدور، وليس لجميع مستخدمي التطبيق. جميع أسطر المشاركة إلى مزوّد خارجي **معلّقة** حتى حسم الاستثناء والعلاقة القانونية. القراءة من بيانات محفوظة مسبقًا لا تعني أن الجهاز أنشأها، لكن الطلب المعرّف بالمستخدم وسياق عرضه يظل معالجة بيانات.

| نوع البيانات / تصنيف Play المرشح | جمع / الجهة | الغرض | إلزامية / ارتباط بالمستخدم | الدليل والثقة | المشاركة المقترحة |
|---|---|---|---|---|---|
| البريد الإلكتروني ومعرّف العميل/المستخدم | نعم: Flutter يرسل بريد تسجيل الدخول وكلمة المرور إلى Supabase Auth، ومعرّفات الحساب في طلبات DB؛ الموقع يتلقى بيانات التفعيل | حساب وتفعيل ووصول للأدوار | مطلوب لمسار الحساب؛ البريد قد يكون alias في مسار client ID؛ مرتبطة | mobile/lib/data/repository.dart:454–478,547–625؛ mobile/lib/data/portal_access.dart:237–250. عالية لمسار الإرسال | معلّقة للمزوّدين؛ وإدارة العقار جهة مختلفة تحتاج تحديد العلاقة |
| اسم صاحب الحساب أو العضو | Flutter يقرأ أسماء موجودة مسبقًا؛ لا دليل من هذه القراءة وحدها أنه يرسل اسم صاحب الحساب من إدخال جديد. Backend يرسل الاسم الموجود في DB إلى Resend عند رسالة التفعيل | عرض الحساب ورسالة تفعيل مخصصة | مرتبط بالحساب؛ الإرسال إلى Resend مشروط بإعداد الرسائل | mobile/lib/data/portal_access.dart:134–158؛ lib/portal-access/orchestrate.ts:107–116؛ lib/portal-access/server.ts:13–25. عالية للفصل بين القراءة والإرسال؛ إعداد التشغيل غير محقق | نقل Backend إلى Resend يحتاج حكم المشاركة؛ لا نستنتج جمعًا جديدًا للاسم من مجرد عرض موجود مسبقًا |
| كلمة المرور، access/refresh tokens، activation token | نعم: Auth؛ الموقع لاستكمال التفعيل | إدارة الحساب وأمنه | مطلوبة للمسار؛ مرتبطة | repository.dart:455,467؛ portal_access.dart:208–223,249–251. عالية | لا يُعرض أي سر بالتقرير؛ تصنيف Play تحت account/other personal info بحسب النموذج، مع تعليق الاستثناء |
| رقم الهاتف / personal info | نعم: Supabase | استكمال أول دخول وتواصل | first login يرسله؛ اختياري للزائر؛ مرتبطة | repository.dart:471–474,912. عالية؛ قواعد إلزام الهاتفUI/الحسابات الحالية تحتاج اختبار | معلّقة |
| وحدات/ملكية/أسماء عقارات وعضوية وأدوار وIDs؛ عنوان مرشح | قراءة ومعالجة عبرSupabase | تحديد النطاق وتقديم الخدمات | مطلوب لنطاق الحساب؛ مرتبطة | repository.dart:547–684,688–721. عالية للIDs/الوحدات؛ لا إثبات حقل عنوان المستخدم الصريح | لا تصنّف location تلقائيًا لأن الوحدة معروفة؛ حسم address/other personal info مع سياسة البيانات |
| سجل مستحقات ومدفوعات وأرصدة موجود مسبقًا | Flutter يقرأ من Supabase؛ ليس مجرد عرض التاريخ دليلًا على أن Flutter يجمع مبلغًا جديدًا أو يرسل التاريخ كاملًا | عرض الحساب والمستحقات والسجل | مطلوب لنطاق الخدمة؛ طلب القراءة مرتبط بالحساب والوحدة | mobile/lib/data/repository.dart:723–802. عالية للقراءة، لا لإرسال إدخال مالي جديد | معالجة بيانات مالية قائمة؛ المشاركة عبر جهات العقار والمزوّد تبقى معلّقة |
| إدخال تحصيل: مبلغ وطريقة وتاريخ وتوزيعات due IDs وmember/unit IDs | نعم: Flutter يرسل إلى Supabase RPC record_payment | تسجيل تحصيل وإثبات العملية | مطلوب عند استخدام المحصّل لوظيفة التسجيل؛ مرتبط بالعضو والوحدة والمحصل؛ ليس مطلوبًا من دور الساكن للعرض | mobile/lib/data/repository.dart:1632–1699، خصوصًا :1679–1696. عالية لمسار إرسال جديد؛ other financial info / purchase history تصنيفان مرشحان | معلّقة للمزوّد ولعلاقة مشغّل العقار؛ تختلف عن مجرد قراءة التاريخ |
| بيانات بطاقة أو حساب مصرفي للمستخدم | غير موجودة فيpayload Flutter المفحوص | لا يوجد مسار بطاقة داخلFlutter | غير محدد للخارج/Backend | متوسط؛ معرّفgl/deposit account هو دفتر داخلي وليس رقم بطاقة مستخدم | لا تختَر عدم الجمع لجميع خدمات الدفع اعتمادًا على هذا وحده |
| اسم الزائر وهاتفه وملاحظاته وفترة السماح وQR IDs | نعم: Supabase | دعوة زائر وإدارة السماح | إنشاء الدعوة اختياري؛ الاسم مطلوب للميزة؛ phone/noteاختياريان؛ مرتبطة بالمضيف وبالزائر | repository.dart:894–920. عالية | بيانات شخص ثالث ليست Contacts permission أو دفتر عناوين؛ مشاركة معلّقة مع الجهات / المزوّد |
| لوحة مركبة، الدولة/المنطقة،make/model/color/year/notes | نعم: Supabase | إدارة مركبات الوحدة | إضافة مركبة اختيارية؛ plate/country/unitمطلوبة؛ مرتبطة | repository.dart:959–983. عالية | other personal info مرشح، معلّقة |
| نصوص طلب الصيانة، تفاصيل، أولوية، notes/summary وتحديثات عمل | نعم: Supabase | صيانة وتنسيق الموظفين | إنشاء/تحديث اختياري؛ حقول مطلوبة للميزة؛ مرتبطة بطالب وفني ووحدة | repository.dart:1077–1102,1198–1245. عالية | other user-generated content مرشح؛ لا يمكن نفي معلومات حساسة يكتبها المستخدم داخلنصحر |
| الصور وPDF واسم الملف وMIME وحجم | نعم: Supabase Storage/DB | مرفقات صيانة وإثبات إنجاز | الاختيارية تختلف بحسب الدور والسياسة؛ مرفق طلب الساكن اختياري، لكن خطة اختبار الفني تشترط صورة AFTER لإكمال المهمة. هذا الشرط غير مثبت في كود Flutter الحالي؛ لا نختَر optional لجميع المستخدمين قبل حسم التعارض. مرتبطة بالطلب والمستخدم ومحفوظة | mobile/lib/screens/feature_screens.dart:723–741؛ mobile/lib/data/repository.dart:1104–1146؛ mobile/docs/DEVICE_TEST_PLAN.md:89؛ mobile/lib/screens/technician_screens.dart:533–544,700–761. عالية للرفع، إلزام الفني غير محسوم | Photos وFiles/docs مرشحان؛ extensions لا تشمل فيديو أو صوت؛ لا حذف EXIF ظاهر قبل رفع bytes |
| بيانات biometric الخام أوtemplate | لم يظهر نقلها؛ OSauthenticate يردbool | قفل محلي اختياري | اختياري؛ flagمخزنمحليًا لكلuserID | biometric_lock.dart:15–40,65–81. عالية لواجهةالكود، دون تدقيق OS | لا تصنيف health/biometricجمع لمجرد USE_BIOMETRIC؛ لا نموذجبيومتري مرسل ظاهر |
| framesالكاميرا لQR | معالجة محلية عبرMobileScanner/MLKit؛ لا رفعimagesظاهر فيمسارscan | قراءةQR | اختيارية/يمكنالادخالاليدوي؛ مرتبطجلسةالبوابة | gate scanينقلpayload لا frame، repository.dart:1955–1972. متوسطة لمسارالكاميرا دونtrafficcapture | لا تساوي CAMERA تلقائيًا جمعصور؛ MLKittelemetryصف منفصل |
| جهازالبوابة/installationhash/credentialhash/credential/scanID/اتجاه/بوابة/أحداثدخول وخروج | نعم: Supabase | مصادقةجهاز وأمن/منعاحتيال والسجل | إلزامي للدور؛IDsمرتبطةبجهاز/حساب/زائر؛ غيرADID | gate_screens.dart:128–144؛ repository.dart:1929–1972,1990–1997؛ gate_device_store.dart:80–112. عالية | Device or other IDs + appactivity/otheractions مرشحان؛ ليستGPS؛ صلاحيات أمنتشغيلية تمنع استخدامبوابةحقيقية للمراجعين |
| Notification IDs/read state وإجراءاتالتطبيق | نعم: Supabase | إشعاراتداخلية ووظائفالمنتج | markreadمرتبطالحساب؛ لاpushSDKظاهر | repository.dart:991–1020. عالية | Appactivity مرشح؛ لا تعتبر notificationsمخزنة محليًا فقط |
| رسالةالتفعيل:اسم/بريد/رابطحساس وانتهاء، وملخصتنبيهاتالعقار | Backend→Resend إذاconfigured | رسائلحساب وتنبيهات | يعتمدالمسار والإعداد؛ مرتبط | portal-access/server.ts:13–25؛ orchestrate.ts:110–116؛ alerts/digest.ts:73–135,137–170. عالية لpayload، التشغيلالحاليغيرمحقق | لا يخرجمنالمصفوفة لمجردأنهBackend؛ لا دليلأنكلرسالةSupabaseAuthتستخدمResend |
| Fawry fields/references/paymentrequests | Flutter يرسل طلب RPC إلى Supabase فقط؛ مسار Web ينفذ الطلب الخارجي إلى Fawry. تفاصيل الطبقات في تقرير Fawry | دفعإلكتروني مؤجّل | اختياري حاليًا؛يرتبطبالعضو/الوحدة | mobile/lib/data/repository.dart:1378–1399: due IDs وprovider وenvironment وsettings ID وclient request ID؛ لا استدعاء charge مباشر من Flutter. عالية للكود، لا إثبات تفعيل حي | لا يجوزحذف منإقرارAABالحالي قبلالتعطيل والتحقق؛ التصنيف النهائي معلق |
| WhatsApp:مرجعدفع، receipt/unit/amount، QR invitation | app يكوّنwa.me URL ثميفتحexternalApplication؛ نقلللخارج يتوقففتح/اختيار المستخدم | مشاركةيطلبهاالمستخدم | اختياري؛ قديرتبطبوحدة/معاملة/زائر | resident_screens.dart:1205–1213,2051–2052؛ collector_screens.dart:1214–1227. عالية | user-initiated disclosure exception يحتاجسياقوصياغةواضحة؛ لا تلقائيًاNo؛ صفحةWhatsAppتجمعأيضًا بياناتها المستقلة |
| MLKit device/appdetails،per-installIDs،performance/latency،configuration،input/outputsize،eventtypes/errorcodes | جمعGoogle مرجح وفقوثيقةMLKit الرسمية؛مدمجAAB | diagnostics وusageanalytics | SDKmanaged؛mandatory/opt-out يحتاجverification؛IDيرتبطبالتثبيت دوندليلربطباسمحساب | https://developers.google.com/ml-kit/android-data-disclosure ؛ AABDEXtrue وdependencies197–216/422–438. متوسطة:وثيقةlatestversions دون17.3.0specific/traffic | DeviceIDs,diagnostics,otherappperformancedata/appinteractions مرشحة؛لا تعتبرServiceProviderconfirmed؛ Google"لا مشاركةلطرفثالث" لا يحسمFlowTech→Google |
| IP/useragent/requestlogs،قدتشملtokensinURL | يصلنقلالشبكة إلىSupabase/host/Google ومشغليالبنية | توصيل/أمن/سجلات | ملازمشبكة؛الاحتفاظ غيرمحقق؛يمكنربطIP/session | الاستضافةونقلHTTP دليل وصولشبكي، سياسةالlogsغيرمحسومة | لا نؤكد جمعlocation منIP؛يحتاجProvider/logretentionreview وتصنيفIP المناسبة |

## توضيح مصطلحات ومراجع المصفوفة

اختصارات الملفات في الجدول تعني: `repository.dart` هو `mobile/lib/data/repository.dart`؛ `portal_access.dart` هو `mobile/lib/data/portal_access.dart`؛ `biometric_lock.dart` هو `mobile/lib/data/biometric_lock.dart`؛ `gate_device_store.dart` هو `mobile/lib/data/gate_device_store.dart`. ملفات الشاشات تقع في `mobile/lib/screens/`. `orchestrate.ts` هو `lib/portal-access/orchestrate.ts`، و`portal-access/server.ts` هو `lib/portal-access/server.ts`، و`alerts/digest.ts` هو `lib/alerts/digest.ts`.

بعض مسميات الحقول في الجدول تُكتب كما تظهر في الكود. المقصود بارتفاع الثقة هو قوة الدليل على وجود مسار الكود، وليس اعتماد إقرار قانوني أو إثبات تشغيل البيئة الحية. تشفير النقل ما زال يحتاج تحققًا في النسخة النهائية وفي كل خدمة خارجية.

## إجابات تقنية أولية لا تُحفظ

- Collects data: **Yes** بثقة عالية (الحساب/الهاتف/الطلبات/الصور/الأجهزة والتحصيل).
- Shared data: **غير محسوم**. لا تُدخل No تلقائيًا. تتطلب شروط Supabase/Resend/Google ومشغلي الاستضافة وعلاقة الجهات العقارية والمشاركة الاختيارية.
- Encryption in transit: المسارات الظاهرة Supabase/config تتطلب HTTPS والموقع الافتراضيHTTPS وMLKitوثيقةHTTPS؛ لا تكفي لإقرار نهائي لجميع إعداداتURL/SDK/backend الحالي؛ تحقق مننسخةAAB الجديدة والتشغيل.
- Account creation: email/password وclientID alias/password وتفعيلروابط؛ biometric قفلإضافي وليسإنشاءحساب. لا دليلOAuth/socialsignup مستخدم فيUI؛ وجودcapabilitySupabase لا يعنيإتاحتها.
- Ads/ADID: لا AD_ID وSDK إعلانات معروف أو وظائفإعلانات ظاهرة؛ موافقةالمستخدمتدعمNo. Health: صيانة عقارية / قفل بيومتري ليست وظيفة صحية؛ لا SDK صحي ظاهر. غياب هذه المكتبات لا ينفي تحليلات ML Kit.
- Delete/requestdeletion: لا نؤكد مسار حذف حساب فعّال؛ يحتاجرابطإزالةمعلن وتجربة وسياسة احتفاظ بالسجلات المالية وسجلات الزوار.
- Required/optional وlinked: لا اختيار واحد للجميع؛استعمل تفصيل المصفوفة وراجعصفةالدور/جميعالمستخدمينوفقنموذجConsole. طلبات/صورومركبات اختياريةللخدمة لكنبعضالحقولإلزامية داخلها.

## ما يلزم قبل الاعتماد

1. موافقة وتنفيذ تعطيل Fawry على الخادم والعميل ثمAABجديد؛ تدقيق مسودة المتجر والصور والسياسة بما يناسب V1.
2. مراجعة قانونية لمزودي الخدمة، أين تحفظ البيانات، subprocessor،الأغراض المستقلة. تحديد هل FlowTech ومشغلو العقارات نفس الجهة أم جهات مستقلة ومتى ينطبق استثناء المشاركة التي يبدأها المستخدم.
3. تحقق من ML Kit 17.3.0 وGoogle Play Services telemetry وقياس حركة نسخة Play؛لا وصف بعدم وجود تحليلات قبل الحسم.
4. تحقق من Supabase Auth SMTP ورسائل Resend الفعلية والسجلات والاحتفاظ وطلبات الحذف دون تعريض بيانات عملاء.
5. تجربة أدوار QA المعزولة للتحقق من الحقول الإلزامية والصلاحيات والحذف؛ دون بوابة فعلية.

Graft: 191,695 tokens saved across 12 successful calls (plus 4 no-definition calls); no dollar estimate provided. لا يوجد مبلغمالي محسوب.

## ملحق جرد pubspec.lock الكامل (يشمل منصات أخرى وتبعيات اختبار)

android_file_picker "2.0.0"
app_links "7.2.1"
app_links_linux "1.0.3"
app_links_platform_interface "2.0.4"
app_links_web "1.0.4"
args "2.7.0"
async "2.13.1"
boolean_selector "2.1.2"
characters "1.4.1"
clock "1.1.3"
code_assets "1.2.1"
collection "1.19.1"
convert "3.1.2"
cross_file "0.3.5+5"
crypto "3.0.7"
cupertino_icons "1.0.9"
dart_jsonwebtoken "3.4.1"
dbus "0.8.0"
fake_async "1.3.3"
ffi "2.2.0"
ffi_leak_tracker "0.1.2"
file "7.0.1"
file_picker "13.1.0"
file_picker_darwin "2.1.2"
file_picker_linux "2.0.1"
file_picker_platform_interface "4.0.0"
file_picker_web "4.0.0"
flutter "0.0.0"
flutter_lints "6.0.0"
flutter_localizations "0.0.0"
flutter_plugin_android_lifecycle "2.0.35"
flutter_riverpod "2.6.1"
flutter_secure_storage "11.2.0"
flutter_secure_storage_darwin "0.4.3"
flutter_secure_storage_linux "3.0.3"
flutter_secure_storage_platform_interface "2.1.1"
flutter_secure_storage_web "2.1.1"
flutter_secure_storage_windows "4.2.2"
flutter_test "0.0.0"
flutter_web_plugins "0.0.0"
functions_client "2.7.1"
gotrue "2.27.2"
gtk "2.2.0"
hooks "2.0.2"
http "1.6.0"
http_parser "4.1.2"
intl "0.20.3"
jni "1.1.0"
jni_flutter "1.0.3"
jni_util "1.0.0"
json_annotation "4.12.0"
leak_tracker "11.0.2"
leak_tracker_flutter_testing "3.0.10"
leak_tracker_testing "3.0.2"
lints "6.1.0"
local_auth "3.0.2"
local_auth_android "2.2.0"
local_auth_darwin "2.0.4"
local_auth_platform_interface "1.1.0"
local_auth_windows "2.0.2"
logging "1.3.0"
matcher "0.12.20"
material_color_utilities "0.13.0"
meta "1.18.3"
mime "2.1.0"
mobile_scanner "7.4.2"
objective_c "9.5.0"
package_config "3.0.0"
passkeys_platform_interface "2.10.0"
path "1.9.1"
path_provider "2.1.6"
path_provider_android "2.3.1"
path_provider_foundation "2.6.0"
path_provider_linux "2.2.2"
path_provider_platform_interface "2.1.3"
path_provider_windows "2.3.0"
petitparser "7.0.2"
platform "3.2.0"
plugin_platform_interface "2.1.8"
pointycastle "4.0.0"
postgrest "2.9.1"
pub_semver "2.2.1"
qr "3.0.2"
qr_flutter "4.1.0"
realtime_client "2.13.0"
record_use "0.6.0"
riverpod "2.6.1"
shared_preferences "2.5.5"
shared_preferences_android "2.4.28"
shared_preferences_foundation "2.5.7"
shared_preferences_linux "2.4.1"
shared_preferences_platform_interface "2.4.2"
shared_preferences_web "2.4.3"
shared_preferences_windows "2.4.1"
sky_engine "0.0.0"
source_span "1.10.2"
stack_trace "1.12.2"
state_notifier "1.0.0"
storage_client "2.8.1"
stream_channel "2.1.4"
string_scanner "1.4.1"
supabase "2.16.2"
supabase_common "0.1.2"
supabase_flutter "2.18.0"
term_glyph "1.2.2"
test_api "0.7.12"
typed_data "1.4.0"
url_launcher "6.3.3"
url_launcher_android "6.3.33"
url_launcher_ios "6.4.2"
url_launcher_linux "3.2.3"
url_launcher_macos "3.2.6"
url_launcher_platform_interface "2.3.2"
url_launcher_web "2.4.3"
url_launcher_windows "3.1.6"
vector_math "2.4.0"
vm_service "15.3.0"
web "1.1.1"
web_socket "1.0.1"
web_socket_channel "3.0.3"
win32 "6.4.0"
windows_file_picker "2.0.0"
xdg_directories "1.1.0"
xml "7.0.1"
yaml "3.1.4"
yet_another_json_isolate "2.1.1"

## ملحق جرد Android release artifacts المحلي الكامل

:@@:android_file_picker::release
:@@:app_links::release
:@@:flutter_plugin_android_lifecycle::release
:@@:flutter_secure_storage::release
:@@:jni_flutter::release
:@@:jni::release
:@@:local_auth_android::release
:@@:mobile_scanner::release
:@@:shared_preferences_android::release
:@@:url_launcher_android::release
androidx.activity:activity-ktx:1.9.0@aar
androidx.activity:activity:1.8.1@aar
androidx.activity:activity:1.9.0@aar
androidx.annotation:annotation-experimental:1.4.1@aar
androidx.annotation:annotation-jvm:1.10.0@jar
androidx.annotation:annotation-jvm:1.8.1@jar
androidx.appcompat:appcompat-resources:1.6.1@aar
androidx.appcompat:appcompat:1.6.1@aar
androidx.arch.core:core-common:2.2.0@jar
androidx.arch.core:core-runtime:2.2.0@aar
androidx.asynclayoutinflater:asynclayoutinflater:1.0.0@aar
androidx.biometric:biometric:1.1.0@aar
androidx.browser:browser:1.9.0@aar
androidx.camera:camera-camera2-pipe:1.6.1@aar
androidx.camera:camera-camera2:1.6.1@aar
androidx.camera:camera-core:1.6.1@aar
androidx.camera:camera-lifecycle:1.6.1@aar
androidx.camera.featurecombinationquery:featurecombinationquery:1.6.1@aar
androidx.collection:collection-jvm:1.4.2@jar
androidx.collection:collection-ktx:1.4.2@jar
androidx.collection:collection:1.1.0@jar
androidx.concurrent:concurrent-futures-ktx:1.1.0@jar
androidx.concurrent:concurrent-futures:1.1.0@jar
androidx.coordinatorlayout:coordinatorlayout:1.0.0@aar
androidx.core:core-backported-fixes:1.0.0@aar
androidx.core:core-ktx:1.18.0@aar
androidx.core:core-ktx:1.2.0@aar
androidx.core:core-viewtree:1.0.0@aar
androidx.core:core:1.18.0@aar
androidx.cursoradapter:cursoradapter:1.0.0@aar
androidx.customview:customview:1.0.0@aar
androidx.customview:customview:1.1.0@aar
androidx.datastore:datastore-android:1.1.7@aar
androidx.datastore:datastore-core-android:1.1.7@aar
androidx.datastore:datastore-core-okio-jvm:1.1.7@jar
androidx.datastore:datastore-preferences-android:1.1.7@aar
androidx.datastore:datastore-preferences-core-android:1.1.7@aar
androidx.datastore:datastore-preferences-external-protobuf:1.1.7@jar
androidx.datastore:datastore-preferences-proto:1.1.7@jar
androidx.documentfile:documentfile:1.0.0@aar
androidx.drawerlayout:drawerlayout:1.0.0@aar
androidx.emoji2:emoji2-views-helper:1.2.0@aar
androidx.emoji2:emoji2:1.2.0@aar
androidx.exifinterface:exifinterface:1.4.1@aar
androidx.exifinterface:exifinterface:1.4.2@aar
androidx.fragment:fragment-ktx:1.8.9@aar
androidx.fragment:fragment:1.8.9@aar
androidx.interpolator:interpolator:1.0.0@aar
androidx.legacy:legacy-support-core-ui:1.0.0@aar
androidx.legacy:legacy-support-core-utils:1.0.0@aar
androidx.lifecycle:lifecycle-common-java8:2.10.0@jar
androidx.lifecycle:lifecycle-common-java8:2.7.0@jar
androidx.lifecycle:lifecycle-common-jvm:2.10.0@jar
androidx.lifecycle:lifecycle-common:2.7.0@jar
androidx.lifecycle:lifecycle-livedata-core-ktx:2.10.0@aar
androidx.lifecycle:lifecycle-livedata-core-ktx:2.7.0@aar
androidx.lifecycle:lifecycle-livedata-core:2.10.0@aar
androidx.lifecycle:lifecycle-livedata-core:2.7.0@aar
androidx.lifecycle:lifecycle-livedata:2.10.0@aar
androidx.lifecycle:lifecycle-livedata:2.7.0@aar
androidx.lifecycle:lifecycle-process:2.10.0@aar
androidx.lifecycle:lifecycle-process:2.7.0@aar
androidx.lifecycle:lifecycle-runtime-android:2.10.0@aar
androidx.lifecycle:lifecycle-runtime-ktx-android:2.10.0@aar
androidx.lifecycle:lifecycle-runtime:2.7.0@aar
androidx.lifecycle:lifecycle-viewmodel-android:2.10.0@aar
androidx.lifecycle:lifecycle-viewmodel-ktx:2.10.0@aar
androidx.lifecycle:lifecycle-viewmodel-savedstate-android:2.10.0@aar
androidx.lifecycle:lifecycle-viewmodel-savedstate:2.7.0@aar
androidx.lifecycle:lifecycle-viewmodel:2.10.0@aar
androidx.lifecycle:lifecycle-viewmodel:2.7.0@aar
androidx.loader:loader:1.0.0@aar
androidx.localbroadcastmanager:localbroadcastmanager:1.0.0@aar
androidx.preference:preference:1.2.1@aar
androidx.print:print:1.0.0@aar
androidx.profileinstaller:profileinstaller:1.4.0@aar
androidx.recyclerview:recyclerview:1.0.0@aar
androidx.resourceinspection:resourceinspection-annotation:1.0.1@jar
androidx.savedstate:savedstate-android:1.4.0@aar
androidx.savedstate:savedstate-ktx:1.4.0@aar
androidx.savedstate:savedstate:1.2.1@aar
androidx.slidingpanelayout:slidingpanelayout:1.2.0@aar
androidx.startup:startup-runtime:1.1.1@aar
androidx.swiperefreshlayout:swiperefreshlayout:1.0.0@aar
androidx.tracing:tracing-android:1.3.0@aar
androidx.tracing:tracing-ktx:1.3.0@aar
androidx.tracing:tracing:1.2.0@aar
androidx.transition:transition:1.4.1@aar
androidx.vectordrawable:vectordrawable-animated:1.1.0@aar
androidx.vectordrawable:vectordrawable:1.1.0@aar
androidx.versionedparcelable:versionedparcelable:1.1.1@aar
androidx.viewpager:viewpager:1.0.0@aar
androidx.window:window-java:1.2.0@aar
androidx.window:window:1.2.0@aar
androidx.window.extensions.core:core:1.0.0@aar
com.getkeepsafe.relinker:relinker:1.4.5@aar
com.google.android.datatransport:transport-api:2.2.1@aar
com.google.android.datatransport:transport-backend-cct:2.3.3@aar
com.google.android.datatransport:transport-runtime:2.2.6@aar
com.google.android.gms:play-services-base:18.5.0@aar
com.google.android.gms:play-services-basement:18.4.0@aar
com.google.android.gms:play-services-mlkit-barcode-scanning:18.3.1@aar
com.google.android.gms:play-services-tasks:18.2.0@aar
com.google.android.odml:image:1.0.0-beta1@aar
com.google.auto.value:auto-value-annotations:1.6.3@jar
com.google.code.findbugs:jsr305:3.0.2@jar
com.google.code.gson:gson:2.13.2@jar
com.google.crypto.tink:tink-android:1.23.0@jar
com.google.dagger:dagger:2.59@jar
com.google.errorprone:error_prone_annotations:2.41.0@jar
com.google.firebase:firebase-annotations:16.0.0@jar
com.google.firebase:firebase-components:16.1.0@aar
com.google.firebase:firebase-encoders-json:17.1.0@aar
com.google.firebase:firebase-encoders:16.1.0@jar
com.google.guava:listenablefuture:1.0@jar
com.google.mlkit:barcode-scanning-common:17.0.0@aar
com.google.mlkit:barcode-scanning:17.3.0@aar
com.google.mlkit:common:18.11.0@aar
com.google.mlkit:vision-common:17.3.0@aar
com.google.mlkit:vision-interfaces:16.3.0@aar
com.squareup.okio:okio-jvm:3.4.0@jar
io.flutter:arm64_v8a_release:1.0.0-af7e796e161ae0bb1ff0758c71a7105418bd9ded@jar
io.flutter:armeabi_v7a_release:1.0.0-af7e796e161ae0bb1ff0758c71a7105418bd9ded@jar
io.flutter:flutter_embedding_release:1.0.0-af7e796e161ae0bb1ff0758c71a7105418bd9ded@jar
io.flutter:x86_64_release:1.0.0-af7e796e161ae0bb1ff0758c71a7105418bd9ded@jar
jakarta.inject:jakarta.inject-api:2.0.1@jar
javax.inject:javax.inject:1@jar
org.jetbrains:annotations:23.0.0@jar
org.jetbrains.kotlin:kotlin-android-extensions-runtime:1.9.22@jar
org.jetbrains.kotlin:kotlin-parcelize-runtime:1.9.22@jar
org.jetbrains.kotlin:kotlin-stdlib-jdk7:1.8.0@jar
org.jetbrains.kotlin:kotlin-stdlib-jdk8:1.8.0@jar
org.jetbrains.kotlin:kotlin-stdlib:2.4.0@jar
org.jetbrains.kotlinx:atomicfu-jvm:0.28.0@jar
org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0@jar
org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0@jar
org.jetbrains.kotlinx:kotlinx-coroutines-core-jvm:1.11.0@jar
org.jetbrains.kotlinx:kotlinx-coroutines-core-jvm:1.9.0@jar
org.jetbrains.kotlinx:kotlinx-serialization-core-jvm:1.7.3@jar
org.jspecify:jspecify:1.0.0@jar


