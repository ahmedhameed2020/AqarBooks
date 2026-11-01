# المرفقات للمراجعة (2026-10-17) — خطة وحزمة **مرشحتان للمراجعة**؛ الاعتماد غير موثَّق بعد

**التجميد قائم:** لا اتصال بالإنتاج، ولا commit ولا push ولا نشر، حتى مراجعة هذه المرفقات وتوثيق الاعتماد. الحزمة لم تتغير منذ بنائها (`ec1b669a…`)؛ ملفات هذه المجموعة الإضافية (الخطة، الفرق، شروط الأثر، الاستعلامات) وُضعت بجانب المانيفست وليست داخل الحزمة.

* **الـcommit الأساسي:** `5d2804f3ac2979872e8f657da645ad5ef4c8852a` على الفرع `fix/phase1-financial-report-authz` (`fix(marketing): remove placeholder support phone`، 8 أكتوبر 2026). 117 ملفًا متتبَّعًا معدَّلًا، 903 غير متتبَّعة، **لا حذف ولا إعادة تسمية ولا تغيير على أي ترحيل قائم**.
* **الترحيل الأخير:** `20261018100000_deposit_account_cash_or_bank.sql`، 12,701 بايت، `add8a244a189b58f548db0d9a6ed6061556504f4326f1b8276349f7b443c1b99`.
* **الفرق عن `65d74182…`:** إصلاح 6e (ثلاثة استعلامات بسبعة أسباب رفض) وما يتبعه؛ التفاصيل في `DIFF-FROM-65d74182.md` (مع قيد أن الحزمة السابقة استُبدلت على المسار نفسه فلا مقارنة بايتية ممكنة الآن).

| المرفق | المسار | البايتات | SHA-256 |
|---|---|---|---|
| الحزمة (مرشحة للمراجعة) | `docs/audits/release-final-bundle-2026-10-17.zip` | 2,814,996 | `ec1b669ade030d8047f409f44aaf19fb65cc601297432cfcb1587ba6043a780e` |
| المانيفست | `docs/audits/release-final-bundle-manifest/MANIFEST.md` | 2,118 | `29c28d46a92687e323cba72e7cd0c0142f3c1c3c5032657ea6d348cae83a52af` |
| قائمة البصمات (356 مدخلًا) | `docs/audits/release-final-bundle-manifest/SHA256SUMS.txt` | 45,976 | `27d0d5ddc28346d6d5a268af4e78b550c3dbe9464a58c76b820649238aade5ec` |
| الـcommit الأساسي | `docs/audits/release-final-bundle-manifest/BASE-COMMIT.txt` | 445 | `9ce469325690c8e17127e03395719934baffa4ae50dc78d09ebce3364a5a644a` |
| بيان الحذف وإعادة التسمية | `docs/audits/release-final-bundle-manifest/CHANGES-DELETIONS-RENAMES.txt` | 565 | `938a7493d4c003fd4dc95d6a0e064eadac3063cea3006c4a03e50b35551e9357` |
| الخطة (مرشحة للمراجعة) | `docs/audits/release-final-bundle-manifest/FINAL-RELEASE-PLAN.md` | 17,750 | `fa30ad4d244b392ff5c5b1cdbec7643f213fb6acb521cbe23d54a3b8a7703e84` |
| الفرق عن الحزمة 65d74182… | `docs/audits/release-final-bundle-manifest/DIFF-FROM-65d74182.md` | 3,818 | `b49ea30317eae7d3518b1e1ede350cdb36121bdd32f9ec94d9d9c5c8e9a001f9` |
| شروط فحص أثر الترحيلات على كل المؤسسات | `docs/audits/release-final-bundle-manifest/ALL-ORGS-IMPACT-CONDITIONS.md` | 6,744 | `d9d0775012021fa8fea279a4dda187e07665031bf832e6a602991f55072e359d` |
| استعلامات الأثر على كل المؤسسات (لم تُشغَّل على الإنتاج) | `docs/audits/release-final-bundle-manifest/ALL-ORGS-IMPACT-QUERIES.sql` | 6,831 | `a53dfdfbac511c802346479d41b22b9c75e326e09fe58fa341ac3244d3ba9d62` |

للتحقق: `sha256sum` لكل ملف يطابق الجدول؛ وبصمة كل مدخل داخل الحزمة في `SHA256SUMS.txt`؛ و`ec1b…` هو بصمة الملف المضغوط نفسه.
