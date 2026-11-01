from __future__ import annotations

import hashlib
import json
import shutil
import time
import zipfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PROGRESS = ROOT / "docs" / "progress"
RUN6 = PROGRESS / "evidence-r6-run6"
BUNDLE = PROGRESS / "review-bundle-r6-210000"
ZIP_PATH = PROGRESS / "review-bundle-r6-210000.zip"
VERIFY_DIR = ROOT / "working files" / "verification" / "review-bundle-r6-210000"
VERIFY_REPORT = PROGRESS / "review-bundle-r6-210000.verify.txt"
SHA_PATH = PROGRESS / "review-bundle-r6-210000.zip.sha256"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def copy_files(source_dir: Path, target_dir: Path) -> None:
    target_dir.mkdir(parents=True, exist_ok=True)
    for source in sorted(source_dir.iterdir()):
        if source.is_file():
            shutil.copy2(source, target_dir / source.name)


def write_lf(path: Path, text: str) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)


started_epoch = int((RUN6 / "results" / "started_epoch.txt").read_text(encoding="utf-8").strip())
started_at = (RUN6 / "results" / "started_at.txt").read_text(encoding="utf-8").strip()
finished_epoch = int(time.time())
finished_at = datetime.now().astimezone().isoformat(timespec="seconds")
elapsed_seconds = finished_epoch - started_epoch
if elapsed_seconds < 0:
    raise RuntimeError("Measured elapsed time is negative")
hours, remainder = divmod(elapsed_seconds, 3600)
minutes, seconds = divmod(remainder, 60)
if hours:
    elapsed_ar = f"{hours} ساعة و{minutes} دقيقة و{seconds} ثانية"
elif minutes:
    elapsed_ar = f"{minutes} دقيقة و{seconds} ثانية"
else:
    elapsed_ar = f"{seconds} ثانية"

write_lf(RUN6 / "results" / "finished_at.txt", finished_at + "\n")
write_lf(
    RUN6 / "results" / "elapsed_time.txt",
    f"started_at={started_at}\nfinished_at={finished_at}\nelapsed_seconds={elapsed_seconds}\nelapsed={elapsed_ar}\n",
)

BUNDLE.mkdir(parents=True, exist_ok=True)
VERIFY_DIR.mkdir(parents=True, exist_ok=True)

migration_names = [
    "20261029120000_project_posting_lock_guard.sql",
    "20261029130000_project_line_lock_and_wip_floor.sql",
    "20261029140000_project_wip_summary_reversals.sql",
    "20261029150000_manual_journal_no_project_tag.sql",
    "20261029160000_project_wip_floor_at_commit.sql",
    "20261029170000_wip_floor_on_line_update.sql",
    "20261029180000_wip_floor_baseline_and_delete.sql",
    "20261029190000_project_wip_negative_message.sql",
    "20261029200000_project_wip_summary_cancelled_drafts.sql",
    "20261029210000_project_wip_net_status_neutral.sql",
]
for name in migration_names:
    source = PROGRESS / "proposals" / name
    if not source.is_file():
        raise FileNotFoundError(source)
    target = BUNDLE / "sql" / name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)

for name in ("status.json", "ROADMAP.md", "handover-batch-1b.md"):
    target = BUNDLE / "tracker" / name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(PROGRESS / name, target)

legacy = PROGRESS / "review-bundle-r6-180000"
for directory in ("scripts", "results"):
    copy_files(legacy / directory, BUNDLE / "evidence" / "legacy" / directory)
for name in ("README.md", "fingerprints-live.txt"):
    shutil.copy2(legacy / name, BUNDLE / "evidence" / "legacy" / name)

for run in ("evidence-r6-run4", "evidence-r6-run5"):
    run_name = run.rsplit("-", 1)[-1]
    for directory in ("scripts", "results", "diffs"):
        copy_files(PROGRESS / run / directory, BUNDLE / "evidence" / run_name / directory)
for directory in ("scripts", "results"):
    copy_files(RUN6 / directory, BUNDLE / "evidence" / "run6" / directory)

for name in ("project_wip_summary_live.diff", "project_wip_net_live.diff"):
    target = BUNDLE / "diffs" / name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(PROGRESS / "evidence-r6-run5" / "diffs" / name, target)

readme = f"""# حزمة مراجعة Batch 1B — r6 / 120000–210000

## النطاق والتسليم

- هذه هي الحزمة النهائية للمراجعة المحلية على r6 فقط؛ لا تمثل اعتمادًا للإنتاج.
- تضم الترحيلات العشرة 120000–210000 بالترتيب، بما فيها 200000 و210000، والأدلة والفروق ومتتبع التقدم القائم.
- لم يظهر خلل منتج في اختبري run6 الأخيرين؛ لذلك لا يوجد ترحيل بعد 210000، ولم تُعد اختبارات غير متأثرة.
- بدأ قياس هذه الجولة في `{started_at}` وانتهى إعداد الحزمة في `{finished_at}`. **الوقت الفعلي المقاس: {elapsed_ar} ({elapsed_seconds} ثانية).** لا تُنسب هذه المدة إلى كل اختبار منفرد.

## جدول النتائج

| البند | الحالة | النتيجة أو سبب التصنيف | الدليل داخل الحزمة |
|---|---|---|---|
| الترحيلات 120000–210000 | ناجح | طُبّقت ورُوجعت محليًا على r6؛ ما زالت المراجعة البشرية مطلوبة، وليست جاهزية إنتاج | `sql/` و`evidence/` |
| تصنيف مسودة أُلغيت بالحالة بعد 200000 و210000 | ناجح | المرسمل 1000، المُطلق 600، WIP 400، وصافي القيود 400؛ لا تظهر المسودة كإطلاق تكلفة | `evidence/run5/results/cancelled_draft_after_210000.txt` |
| قيد مرحّل ثم معكوس | ناجح | عكس الإطلاق: 1000/0/1000؛ ثم عكس الرسملة: 0/0/0، مع اتساق القيود | `evidence/run5/results/posted_reversal_after.txt` |
| حارس الصافي بعد 210000 | ناجح | إلغاء مسودة مدينة بالحالة أبقى الصافي والقيود 100 قبل الإلغاء وبعده | `evidence/run5/results/cancelled_draft_floor_after.txt` |
| تحديث أسطر بين مشروعين بالترتيبين | ناجح | الناتج النهائي A=400 وB=400 رغم سالب مؤقت -600 في كل اتجاه؛ انتهى الاختبار بـROLLBACK ونُظفت بيانات الإعداد | `evidence/run6/results/two_project_multiline_update_ordering.txt` |
| مسودة WIP مدينة ملغاة ثم إطلاق تكلفة | ناجح | بقي الرصيد المستخدم للإطلاق 1000؛ رُفض إطلاق 1500 بـ`PROJECT_RELEASE_EXCEEDS_WIP` دون قيد، ونجح إطلاق 600 فصار WIP والقيود 400 | `evidence/run6/results/cancelled_debit_release_regression.txt` |
| واجهة المشاريع وWIP بعد 200000 | ناجح | 8/8؛ مدة السجل 2.3 دقيقة؛ لم تُعد بعد 210000 لأن الواجهة لم تتغير | `evidence/run5/results/projects-wip-ui-after.txt` |
| سلامة متتبع التقدم | ناجح | 7/7؛ مدة السجل 4.18 ثانية | `evidence/run6/results/progress-status-final.txt` |
| حارس الصافي قبل 210000 | فاشل | فشل ضابط متوقع أثبت العيب: تغير الصافي 100 إلى -200 بينما القيود 100؛ أصلحه 210000 ثم نجح الاختبار نفسه | `evidence/run5/results/cancelled_draft_floor_before.txt` |
| أول محاولة لاختبار الإطلاق في run6 | فاشل | فشل إعداد/صلاحية الاختبار: `permission denied for function project_wip_summary`؛ فُصل تنفيذ RPC عن التحقق ثم نجح الاختبار النهائي دون حذف تأكيد | `evidence/run6/results/cancelled_debit_release_setup_failure.txt` |
| إعداد اختبار إعادة المحاولة في run4 | فاشل | تعارض UUID ثابت مع بيانات r6 المتراكمة، لا عيب منتج؛ استُبدل بإعداد ذري بمعرفات عشوائية ونجح التشغيل اللاحق | `evidence/run4/results/retry_seed.txt` و`retry_valid_missing_attempt.txt` |
| الطيار الضريبي | مؤجل | 3/9 متحققة و6 تأكيدات بانتظار قواعد ضريبية معتمدة؛ ليس نجاحًا | `tracker/status.json` |
| اختبار Fawry | مؤجل | لم يُشغّل لغياب المفاتيح | `tracker/status.json` |
| تقارير الأصول وCAM وCAPEX/OPEX | مؤجل | تأجيل صريح؛ الاختبارات المتخطاة ليست ناجحة | `tracker/ROADMAP.md` و`tracker/status.json` |
| اعتماد الترحيلات والسياسات المفتوحة | مؤجل | مراجعة بشرية وقرارات خارجية لا توقف العمل المحلي المستقل ولا تُعد نجاح اختبار | `tracker/ROADMAP.md` |

## الفروق والإصلاحان الأخيران

- `diffs/project_wip_summary_live.diff`: يقبل POSTED، ويقبل REVERSED فقط عند وجود قيد تابع يحمل `reversed_entry_id` للأصل؛ بهذا يتميز العكس الحقيقي عن إلغاء المسودة بالحالة.
- `diffs/project_wip_net_live.diff`: يحسب `project_wip_net` مجموع أسطر WIP مباشرة، فيبقى محايدًا لتغيير حالة القيد ومتسقًا مع الدفتر.
- بقية فروق الحالة والاختبار والدوال الحية محفوظة تحت `evidence/run4/diffs/` و`evidence/run5/diffs/`.

## محتويات الحزمة والتحقق

- `sql/`: الترحيلات العشرة، بما فيها الملفات المستبدلة لأنها جزء من تسلسل المراجعة.
- `tracker/`: `status.json` و`ROADMAP.md` و`handover-batch-1b.md` دون إنشاء نظام تتبع جديد.
- `evidence/legacy/`: أدلة الحارس السابقة؛ `evidence/run4/` و`run5/` و`run6/`: السكربتات والنتائج والفروق المتأثرة، دون مجلدات traces.
- `manifest.txt`: SHA-256 لكل ملفات الحمولة، بأسطر LF. ملف البصمة المجاور للأرشيف يخص الأرشيف نفسه.
- جميع معاملات اختبارات SQL النهائية المذكورة انتهت بـROLLBACK؛ اختبار ترتيب التحديث نظف بيانات إعداده الملتزمة.

لم يُطبّق شيء خارج r6، ولم يُنفّذ commit أو push أو نشر، ولم تبدأ Batch 2.
"""
write_lf(BUNDLE / "README.md", readme)

payload = sorted(
    (path for path in BUNDLE.rglob("*") if path.is_file() and path.name != "manifest.txt"),
    key=lambda path: path.relative_to(BUNDLE).as_posix(),
)
manifest_lines = [f"{sha256(path)}  {path.relative_to(BUNDLE).as_posix()}" for path in payload]
write_lf(BUNDLE / "manifest.txt", "\n".join(manifest_lines) + "\n")
manifest_bytes = (BUNDLE / "manifest.txt").read_bytes()
if b"\r" in manifest_bytes:
    raise RuntimeError("manifest.txt contains CR; LF-only output required")

with zipfile.ZipFile(ZIP_PATH, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for path in sorted(BUNDLE.rglob("*"), key=lambda item: item.relative_to(BUNDLE).as_posix()):
        if path.is_file():
            archive.write(path, path.relative_to(BUNDLE).as_posix())

with zipfile.ZipFile(ZIP_PATH, "r") as archive:
    bad_member = archive.testzip()
    if bad_member is not None:
        raise RuntimeError(f"ZIP CRC failure: {bad_member}")
    archive.extractall(VERIFY_DIR)

verified = 0
for line in (BUNDLE / "manifest.txt").read_text(encoding="utf-8").splitlines():
    expected, relative = line.split("  ", 1)
    extracted = VERIFY_DIR / relative
    if not extracted.is_file():
        raise RuntimeError(f"Missing extracted file: {relative}")
    if sha256(extracted) != expected:
        raise RuntimeError(f"SHA-256 mismatch after extraction: {relative}")
    verified += 1

expected_members = {path.relative_to(BUNDLE).as_posix() for path in BUNDLE.rglob("*") if path.is_file()}
extracted_members = {path.relative_to(VERIFY_DIR).as_posix() for path in VERIFY_DIR.rglob("*") if path.is_file()}
if extracted_members != expected_members:
    raise RuntimeError("Extracted file set differs from the bundle file set")

zip_hash = sha256(ZIP_PATH)
write_lf(SHA_PATH, f"{zip_hash}  {ZIP_PATH.name}\n")
write_lf(
    VERIFY_REPORT,
    "ZIP CRC: PASS\n"
    "Manifest line endings: LF only\n"
    f"Manifest payload hashes verified after extraction: {verified}/{len(payload)}\n"
    f"Extracted file set matches bundle (including manifest.txt): {len(extracted_members)} files\n"
    f"Elapsed seconds: {elapsed_seconds}\n"
    f"ZIP SHA-256: {zip_hash}\n",
)
print(json.dumps({
    "zip": str(ZIP_PATH),
    "sha256": zip_hash,
    "payload_hashes_verified": verified,
    "files_including_manifest": len(extracted_members),
    "elapsed_seconds": elapsed_seconds,
    "verification_report": str(VERIFY_REPORT),
}, ensure_ascii=False, indent=2))
