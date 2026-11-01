# AqarBooks V1 — proposed store changes

**Current status:** The user subsequently approved limited local execution on 9 October 2026. See GOOGLE_PLAY_FAWRY_V1_IMPLEMENTATION_2026-10-09.md for implemented changes, verification, the live-test incident, and remaining approval gates. The original planning text below is historical; no backend deployment, production migration, AAB build or Play replacement is authorized.

For review before execution. Existing Console listing and release notes still contain Fawry claims. They must not be submitted as V1. No image or listing was replaced in this planning step; no AAB was rebuilt.

User requested plan revision before implementation. All changes below remain proposed. No Console text/image save or file upload is authorized by this plan revision. Local source/documentation changes start only after approval; final capture, AAB build, uploads and production deployment require distinct approval.

## Risks and rollback

Keep existing assets and their manifest as an archived reference; create proposed replacements separately after approval, without deleting the originals. A receipt caption must match the actual tested V1 screen. No working QA account/receipt is yet verified. Remove Fawry claims across all eight captures if present, not only image 03. Review the final contact sheet before upload.

If a replacement is rejected, revise the local proposal or restore the previous local draft while keeping release blocked. Do not restore misleading Fawry claims to a submitted listing. Console is still unsubmitted; preserve evidence and perform any approved correction as a draft. No public rollback or upload is executed now.

## Exact text replacements

- Arabic full description (`GOOGLE_PLAY_RELEASE.md:89`): replace «ادفع عبر فوري بكود مرجعي من داخل التطبيق» with «تابع سجل مدفوعات وحدتك والتحصيلات المسجّلة».
- English full description (`:107`): replace “Start a Fawry payment with a reference code from the app” with “View your unit's payment history and recorded collections”.
- Arabic release note (`:191`): «الإصدار الأول من AqarBooks: متابعة مستحقات وحدتك وسجل المدفوعات، طلبات الصيانة بالصور، تصاريح زوار بكود QR، وأدوات فرق التشغيل (التحصيل، الصيانة، البوابة).»
- English release note (`:193`): “First release of AqarBooks: track your unit dues and payment history, submit maintenance requests with photos, issue QR visitor passes, and use operations tools for collection, maintenance, and gate teams.”
- Short descriptions contain no Fawry claim; keep unless final V1 verification reveals a mismatch.

## Screenshots

Replace `03-fawry-marketing.png`, currently uploaded, with a genuine capture of the collector receipt/payment detail feature using isolated fictional data, if confirmed available in final V1. Proposed caption: «إيصالات التحصيل — تفاصيل واضحة لكل عملية مسجّلة». Source collection path is `mobile/lib/data/repository.dart:1628–1699`; WhatsApp receipt handling is `mobile/lib/screens/collector_screens.dart:1214–1227`. These code paths do not prove a working Play feature or an existing QA receipt/account. Capture the actual final V1 UI only after approval to build and verify the final artifact. Do not invent a receipt screen or modify screenshots to imply unavailable functionality.

Re-capture home/dues screenshots if Fawry buttons or wording appear anywhere inside their real app captures. Inspect all eight final images, their generator captions, feature graphic and icon, then re-run asset checks and manifest hashes. Keep eight images, preserve branding, use only fictional QA data, and save a new contact sheet for human review before upload. Existing image provenance approval applies to existing verified files; verify provenance of replacements too.

## Release documentation and privacy alignment

`GOOGLE_PLAY_RELEASE.md` is user-modified and contains provisional data answers. Reconcile it rather than overwriting unrelated content. Its row declaring no analytics/crash data (`:171`) is unsupported for ML Kit telemetry. The published privacy policy's SDK/analytics and Fawry wording needs reconciliation with the approved V1 and provider matrix. Website policy changes/deployment require approval; no such deployment occurred.

## Approval sequence

1. Review and approve the revised minimal scope, web impact gate, database proposal and rollback. Only then authorize local implementation/tests and text/layout preparation. This approval does not authorize production DB/config changes, migration execution, push, deployment, rebuild, uploads, review submission or public publication.
2. Implement and verify locally, prepare captions/layout proposals and show the resulting diff. No rebuild is included in this approval. Any previews are clearly labelled proposals, not final release evidence.
3. Obtain distinct approval for the concrete backend deployment/migration and AAB rebuild/replacement after production prerequisites and prior transactions are understood.
4. Verify final artifact and Play-installed reviewer roles; capture genuine replacement assets from that artifact with fictional data, show the contact sheet and validate dimensions/provenance. Reconcile the data matrix. Obtain final declarations/terms approvals as applicable.
5. Obtain explicit permission before sending for review or publishing publicly.
