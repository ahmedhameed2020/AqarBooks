# لقطات Google Play — التحقق من لقطات شاشة الهاتف (AqarBooks Mobile V1)

سجل تحقق من **ثماني لقطات فعلية** التُقطت من تطبيق Android نفسه وهو يعمل على محاكي Android (`Medium_Phone_API_36.1`) — **ليست لقطات من جهاز بيع فعلي**، بترتيب المتجر العربي.
كل صورة هي واجهة إنتاج موجودة في `mobile/lib/screens/` — لا إعادة رسم ولا mockup ولا تعديل داخل الصورة.

**آخر تشغيل للالتقاط:** 2026-10-11 · **النتيجة:** `PASS: 8/8 phone screenshots valid`

---

## 1. طريقة الالتقاط والبيئة

| بند | القيمة |
|---|---|
| الجهاز | `emulator-5554` — AVD `Medium_Phone_API_36.1` (Android 16 / API 36، x86_64) |
| الدقة | `Physical size: 1080x2400`، `Physical density: 420`، `cur=1080x2400` |
| `adb` | `C:\Users\Lenovo\AppData\Local\Android\Sdk\platform-tools\adb.exe` (المسار الصريح — يوجد أكثر من adb على الجهاز) |
| المحاكي | `emulator.exe -avd Medium_Phone_API_36.1 -no-snapshot-load -no-boot-anim -gpu swiftshader_indirect` (انتُظر `sys.boot_completed = 1`) |
| وضع الشاشة | `navigation_mode = 2` (إيماءات)، وثُبّت الدوران: `accelerometer_rotation = 0`، `user_rotation = 0` |
| شاشة النظام | `settings put global policy_control immersive.full=*` قبل التشغيل ثم `policy_control null` بعده (شريط الحالة يظل ظاهرًا: ساعة + بطارية + LTE) |
| الهدف | `flutter run -t lib/preview_main.dart -d emulator-5554 --dart-define=STORE_SCREEN=cycle --dart-define=STORE_DWELL_SECONDS=9` |
| defines أخرى | **لا يوجد أي `SUPABASE_URL` أو `SUPABASE_ANON_KEY`** في أمر التشغيل |
| أمر اللقطة | `adb -s emulator-5554 exec-out screencap -p > <file>.png` (بايت خام عبر إعادة توجيه `cmd`) |
| المشغّل | `powershell -NoProfile -ExecutionPolicy Bypass -File mobile/store-assets/capture_play_screenshots.ps1` |
| سجل التشغيل | `mobile/store-assets/screenshots/ar/_logs/capture-run.log` |

**كيف ضُبط التوقيت:** التطبيق يطبع `STORE_CYCLE <shot> <key> <stem>` بعد تركيب الشاشة وبعد زوال وميض النافذة الفارغة (2.5 ثانية)، والمشغّل يلتقط الصورة بعد رؤية السطر فقط — فلا تظهر شاشة تحميل ولا إطار باهت. الجولة الواحدة (تثبيت واحد، **9 ثوانٍ لكل شاشة** — وهي قيمة `STORE_DWELL_SECONDS=9` المستخدمة في آخر جولة) أنتجت الثمانية في تشغيل واحد، **دون أي حوار إذن كاميرا**.

## 2. الملفات الثمانية — الأبعاد والبصمات

| # | الملف | الأبعاد | الحجم (بايت) | ألوان مميزة في كتل 8×8 | SHA-256 |
|---|---|---|---|---|---|
| 1 | [01-resident-home.png](../store-assets/screenshots/ar/01-resident-home.png) | 1080×2400 | 117,825 | 112 | `f81fd4d9b52ce7e3ff020695772dd33aeabd87e044643a08c59f747c25a12ecb` |
| 2 | [02-payments-dues.png](../store-assets/screenshots/ar/02-payments-dues.png) | 1080×2400 | 145,132 | 89 | `806d714f6f6cfda91f3efba6837161cd88be502aa04f0fa611479287143bb73c` |
| 3 | [03-fawry-payment.png](../store-assets/screenshots/ar/03-fawry-payment.png) | 1080×2400 | 104,909 | 102 | `370b9c1fbf96b87392ff73917a331a86eddece60d8e8a12a4846753265afeb76` |
| 4 | [04-visitor-qr-pass.png](../store-assets/screenshots/ar/04-visitor-qr-pass.png) | 1080×2400 | 89,060 | 103 | `2923da3072d8ac0d5363c1c95e252279a5b20cf0e94f9e2cb21850e0919018a9` |
| 5 | [05-maintenance-request.png](../store-assets/screenshots/ar/05-maintenance-request.png) | 1080×2400 | 127,705 | 77 | `56fac1d0f2d612dd535c7a98d40bf634796a0d709f9a958398cb53b5d67ee312` |
| 6 | [06-technician-dashboard.png](../store-assets/screenshots/ar/06-technician-dashboard.png) | 1080×2400 | 126,402 | 98 | `319d499aac19942fdf8db1e91848be7187d507ac1ee9b3fa051259aa7891415f` |
| 7 | [07-gate-scanner.png](../store-assets/screenshots/ar/07-gate-scanner.png) | 1080×2400 | 72,581 | 83 | `0840d831f2856fd796ee95ff823fcea16b84bf012a2d96c485a1b47126f960fd` |
| 8 | [08-manager-dashboard.png](../store-assets/screenshots/ar/08-manager-dashboard.png) | 1080×2400 | 190,621 | 97 | `803a07e472a4079f9a45aff014fe88c4b5a7c2f24aed5e6e3630dba90c26fa79` |

كل الملفات: PNG **مفكوك الترميز فعليًا** (توقيع + IHDR + IDAT يفكّه zlib إلى عدد الأسطر الصحيح)، 8 بت، عدد قنوات `truecolour+alpha` من `screencap` بمدى ألفا `255..255` — أي أن كل بكسل شفاف أو معتم **فُحص**، لا مجرد افتراض من نوع اللون. عمودية، وبصمات مختلفة (لا تكرار).

**اللوحة المجمعة (خارج المتجر):** [contact-sheet-ar.png](../store-assets/screenshots/ar/contact-sheet-ar.png) — 1942×2278، بُنيت من نفس الثمانية بـ`generate_screenshot_contact_sheet.py`.

## 3. أي شاشة إنتاج تُغذّي كل لقطة

| مفتاح `STORE_SCREEN` | الملف | الشاشة الفعلية (بلا أي تعديل) | الغلاف |
|---|---|---|---|
| `resident-home` | `01-resident-home.png` | `ResidentHomeScreen` | `AppShell` للشخصية `resident`، التبويب 0 |
| `payments-dues` | `02-payments-dues.png` | `PaymentsTabScreen` | `AppShell`، التبويب 2 |
| `fawry-payment` | `03-fawry-payment.png` | `FawryCodeScreen` | مسار مدفوع كما يفتحه زر «ادفع عبر فوري» |
| `visitor-qr-pass` | `04-visitor-qr-pass.png` | `VisitorPassScreen` | مسار مدفوع |
| `maintenance-request` | `05-maintenance-request.png` | `MaintenanceDetailScreen` | مسار مدفوع (`id: mr1`) |
| `technician-dashboard` | `06-technician-dashboard.png` | `TechnicianTodayScreen` | `AppShell` للشخصية `technician`، التبويب 0 |
| `gate-scanner` | `07-gate-scanner.png` | `GateScanScreen` | `AppShell` للشخصية `gate`، التبويب 0، والكاميرا الحية **مطفأة** (`gateCameraEnabledProvider = false`) فيظهر واجهة المسح الخاملة المعتمدة |
| `manager-dashboard` | `08-manager-dashboard.png` | `ManagerHomeScreen` | `AppShell` للشخصية `manager`، التبويب 0 |

الأغلفة تأتي من `AppShell` الإنتاجي نفسه، وتُختار الشخصية بمفاتيح الصلاحيات فعليًا (`resolvePersona`)، لا بكتابة يدوية.

## 4. دليل البيانات الاصطناعية — ولا إعدادات إنتاج

- `PreviewRepository extends AqarRepository` بـ`super(null)` (سطر 275 في [preview_main.dart](../lib/preview_main.dart#L275)) — أي **لا عميل Supabase إطلاقًا**، وكل استدعاء بيانات يُعاد تعريفه محليًا.
- `flutter analyze` نظيف، ولا `SUPABASE_URL`/`SUPABASE_ANON_KEY` في أي مسار تشغيل أو ملف preview.
- بلاغ `validate_play_screenshots.py` يفحص ملفات الـpreview ويفشل عند أي `*.supabase.co` أو كتلة تشبه JWT أو إسناد مفتاح؛ نتيجة آخر تشغيل:
  `OK repository is constructed with a null Supabase client · OK debug banner disabled · OK gate camera disabled for captures · OK Arabic locale, RTL`.
- `debugShowCheckedModeBanner: false` في وضع الالتقاط (لا شعار Debug).
- بيانات الشاشات: مجمع «مجموعة النخيل العقارية» و«كمبوند النخيل» ووحدات `A-12`/`B-07`/`C-11`/`M-01`/`T1` — كلها أسماء تجريبية متكررة في الـpreview ولوحات الاختبار.
- **لا اعتماد زائر صالح encoded:** حمولة الـQR في اللقطة 4 هي
  `AQP1.v1.NOT-A-REAL-PASS-STORE-SCREENSHOT-SAMPLE`
  ([preview_main.dart](../lib/preview_main.dart#L146)) — بصيغة يفهمها القارئ لكنها ليست تصريحًا أصدره أي سيرفر، ولا يمكن أن تنجح في أي مسح. اسم الضيف `ضيف تجريبي`
  ([preview_main.dart](../lib/preview_main.dart#L151)) بدل أي اسم حقيقي.
- **لا بيانات مالية حقيقية ولا إحداثيات دفع فعلية:** مرجع فوري في اللقطة 3 يأتي من `createFawryCheckout` المُعاد تعريفه في `PreviewRepository` (بيئة `TEST`، مرجع `928451736` ثابت) ولا يمس أي مزوّد.
- **لا صلاحيات كاميرا:** التقاط شاشة البوابة يتم مع `gateCameraEnabledProvider.overrideWithValue(false)`
  ([preview_main.dart](../lib/preview_main.dart#L786)) فأي شاشة مسح تعرض الواجهة الخاملة فقط، ولم يظهر أي حوار إذن كاميرا أثناء الالتقاط (لا تعطيل ولا منح صلاحية على المحاكي).
- لم تُلمس أي ملفات توقيع أو `applicationId` أو إعدادات Supabase.

## 5. الفحوص البصرية اليدوية (بفتح كل صورة)

فُتحت الثمانية فرديًا وفحصت في: RTL، القص/الطفح، عدم وجود تحميل/خطأ/شعار Debug، وضوح النص، والخصوصية.

| # | RTL | قص/طفح | لا تحميل/خطأ/Debug | النص واضح | الخصوصية | ملاحظة |
|---|---|---|---|---|---|---|
| 1 | ✅ | ✅ | ✅ | ✅ | ✅ | البطاقات والاتجاه صحيح؛ شارة «متأخر» حمراء على الرصيد |
| 2 | ✅ | ✅ | ✅ | ✅ | ✅ | شريط «عليّ/دفعت»، الأقساط بفواصل آلاف + `ج.م`، تحذير فوري أسفلها |
| 3 | ✅ | ✅ | ✅ | ✅ | ✅ | الكود المرجعي بفواصل (LTR داخل RTL) + المبلغ + بيئة TEST |
| 4 | ✅ | ✅ | ✅ | ✅ | ✅ | رمز QR يحمل الحمولة الاصطناعية؛ تحذير «احفظ التصريح الآن»؛ اسم الضيف تجريبي |
| 5 | ✅ | ✅ | ✅ | ✅ | ✅ | سجل زمني عربي بأربع حالات مترجمة (لا status codes خام) + المرفقات |
| 6 | ✅ | ✅ | ✅ | ✅ | ✅ | «جارية الآن» + بطاقة المهلة + ثلاث مهام مرتبة |
| 7 | ✅ | ✅ | ✅ | ✅ | ✅ | لوحة المسح الداكنة، الواجهة الخاملة، إدخال يدوي، بلا كاميرا |
| 8 | ✅ | ✅ | ✅ | ✅ | ✅ | «إجمالي المتأخرات» + ثلاثة أرقام + ستة بنود «يحتاج انتباهك» |

ملاحظات ظهرت في الفحص ولم تُصلح (لأنها **سلوك إنتاج**، وإصلاحها إعادة تصميم خارج نطاق هذه المهمة):

1. **رقم الجوال يظهر إنجليزيًا داخل الإطار العربي:** `مرحبًا، ahmed` و`hassan · فني صيانة` و`مرحبًا، karim` — الاسم مشتق من `userGreetingName(session.user.email)` فيُنقل كما هو. مقصود لبيانات الالتقاط؛ في الإنتاج يظهر الاسم اللاتيني للمستخدم.
2. **السهم (`chevron`) في `ListRowCard` يبتعد عن محتوى الصف:** يظهر في أقصى يسار البطاقة (مثل «آخر دفعة» في اللقطة 1 وبنود المتأخرات في اللقطة 8) بدل أن يلتصق بالحافة اليمنى للمحتوى. عرض إنتاجي مشترك عبر شخصيات عديدة — يُسجّل هنا ولا يُعاد تصميمه.
3. **اسم مرفق عربي + امتداد لاتيني داخل RTL:** «صورة-التسريب.jpg» تُرسم بترتيب يبدو غير معتاد بجانب النص العربي. تنسيق إنتاجي (`Text` بلا عزل LTR للاسم) — للعلم فقط.
4. **شريط الحالة** يحمل وقت الجهاز الفعلي (`3:47`–`4:03`) وشارة LTE ورمز الشحن؛ شرائح المسح الضوئي/الحالة على المحاكي. هذا جزء حقيقي من لقطة `screencap` وليس زخرفة مضافة.
5. **ملء الشاشة الفعلي:** تطبيقنا يرسم حتى أسفل الشاشة في اللقطة 5 (لا يوجد شريط تبويبات في مسار تفاصيل الطلب)، بينما 6 و7 و8 تُظهر شريط التبويبات — فرق مسار لا مشكلة عرض.

## 6. القيود الصادقة (ما لا يُثبته هذا الملف)

- **الالتقاط من محاكي Android (`Medium_Phone_API_36.1`) لا من جهاز بيع فعلي** — نفس الدقة 1080×2400 لكن بدون صلابة جهاز حقيقي (زمن الإطار، شرائح، إيماءات). إن طلب Play Console (أو مراجعة بشرية) جهازًا فعليًا بمواصفات مختلفة، تُعاد الجولة على الجهاز بتعديل `-Device` فقط.
- `validate_play_screenshots.py` **حتمي، بلا أي مكتبة خارجية (مكتبة Python القياسية فقط: `hashlib`/`re`/`struct`/`zlib`)**: يفكّ ترميز PNG بنفسه (التوقيع، IHDR، تجميع IDAT وفكّ ضغطه، ثم إعادة بناء الأسطر بفلاتر PNG الخمسة)، ويثبت العدد والأبعاد والدقة وعدم الشفافية **بفحص كل بكسل** وتباين البصمات وحجمًا معقولًا وعدد ألوان أدنى — **ولا يدّعي OCR** ولا يثبت غياب نص تحميل. ما يثبت ذلك هو الفحص البصري في القسم 5.
  تحقق من حساسيته بمجموعات صور مصنوعة خصيصًا: يمر على مجموعة سليمة (RGB و RGBA معتمة)، ويفشل على: بكسل ألفا 254 واحد، أبعاد 1080×2160، إطار بلون واحد، ملفين متطابقين بنفس البصمة، ملف ناقص، وملف زائد في المجلد.
  ملاحظة حدود: عتبة «محتوى غير فارغ» تخفق مع صورة رمادية منخفضة التباين (15 لونًا في كتل 8×8 مقابل عتبة 24) — وهي **ليست** من فئة الإطار الفارغ (لون واحد)، لكنها تسجّل هنا كنتيجة صريحة لا كادعاء.
- الشاشات الثمانية مختارة من مسار الساكن/الفني/البوابة/المدير فقط. لا تشمل شخصية **المحصّل** (نصاب Google Play 8 صور لقطات، وقد استُكملت الثمانية بدونها).
- اللوحة المجمعة `contact-sheet-ar.png` أداة مراجعة فقط، وفيها التسميات **خارج** الصور؛ هي ليست ملف المتجر. تُبنى بـ`generate_screenshot_contact_sheet.py` — وهو **بلا أي مكتبة خارجية** (يقرأ أبعاد PNG من ترويسة IHDR بـ`struct`)، وتُرسم نصوصه العربية بـheadless Chrome لأن Pillow على هذا الجهاز بلا libraqm ولا يشكّل العربية.
- الالتقاط تخطيط على نفس المحاكي لأي إعادة توليد: أرقام البصمات ستتغير (وقت/مدة الصلاحية داخل الصور يعتمد على لحظة التشغيل) وإن بقيت الأبعاد والبنية.

## 7. كيف تُعاد الجولة

```powershell
# 1) من mobile/ — التقاط فعلي (يحتاج محاكي Android يعمل ومتصل بـadb؛ النتيجة محاكي لا جهاز بيع)
powershell -NoProfile -ExecutionPolicy Bypass -File store-assets/capture_play_screenshots.ps1

# 2) تحقق حتمي (يخرج بغير صفر عند أي فشل)
python store-assets/validate_play_screenshots.py

# 3) لوحة المراجعة ثم إعادة التحقق
python store-assets/generate_screenshot_contact_sheet.py
python store-assets/validate_play_screenshots.py
```

ملاحظة بيئة: السكربتان يعتمدان **مكتبة Python القياسية فقط**، فتعمل الأوامر أعلاه بأي `python` 3.8+ على PATH. تم التحقق فعليًا من الأمرين مع `python` على PATH في هذا الجهاز
(`C:\Users\Lenovo\AppData\Local\hermes\hermes-agent\venv\Scripts\python.exe`، Python 3.12 بلا Pillow): كلاهما يخرج بصفر. اللوحة وحدها تحتاج Chrome/Edge — وهو مثبّت هنا (`chrome.exe`)، وإن غاب يخرج السكربت برسالة فشل واضحة.

## 8. الخلاصة

اللقطات الثمانية موجودة فعلية 1080×2400 من تطبيق Android على **محاكي Android** (لا جهاز بيع فعلي)، تحقق الآلي يمر (`8/8`) بأدوات بلا أي مكتبة خارجية، والفحص البصري اليدوي يمر للغة والتخطيط والنصوص والخصوصية — مع الملاحظات الإنتاجية في القسم 5 والقيود في القسم 6.
