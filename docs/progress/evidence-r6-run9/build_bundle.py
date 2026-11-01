from __future__ import annotations

import hashlib
import json
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PROGRESS = ROOT / "docs" / "progress"
BUNDLE = PROGRESS / "review-bundle-r6-230000"
ZIP_PATH = PROGRESS / "review-bundle-r6-230000.zip"
VERIFY_DIR = ROOT / "working files" / "verification" / "review-bundle-r6-230000"
VERIFY_REPORT = PROGRESS / "review-bundle-r6-230000.verify.txt"
SHA_PATH = PROGRESS / "review-bundle-r6-230000.zip.sha256"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def copy_files(source_dir: Path, target_dir: Path) -> None:
    if not source_dir.is_dir():
        return
    target_dir.mkdir(parents=True, exist_ok=True)
    for source in sorted(source_dir.iterdir()):
        if source.is_file():
            shutil.copy2(source, target_dir / source.name)


def write_lf(path: Path, text: str) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)


migrations = [
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
    "20261029220000_project_wip_floor_ignore_cancelled_drafts.sql",
    "20261029230000_project_status_cancellation_floor.sql",
]
for name in migrations:
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

previous = PROGRESS / "review-bundle-r6-210000"
for run in ("legacy", "run4", "run5", "run6"):
    for directory in ("scripts", "results", "diffs"):
        copy_files(previous / "evidence" / run / directory, BUNDLE / "evidence" / run / directory)
for name in ("README.md", "fingerprints-live.txt"):
    source = previous / "evidence" / "legacy" / name
    if source.is_file():
        target = BUNDLE / "evidence" / "legacy" / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
copy_files(previous / "diffs", BUNDLE / "diffs")

for run in ("run7", "run8", "run9"):
    evidence = PROGRESS / f"evidence-r6-{run}"
    for directory in ("scripts", "results", "diffs"):
        copy_files(evidence / directory, BUNDLE / "evidence" / run / directory)

readme = """# حزمة مراجعة Batch 1B — r6 / 120000–230000

## النطاق

- الحزمة النهائية للمراجعة البشرية على r6 فقط، وليست اعتمادًا أو جاهزية للإنتاج.
- تضم الترحيلات الاثني عشر 120000–230000، ومتتبع التقدم القائم، والفروق والأدلة المتأثرة.
- لم تُعد مجموعة الواجهة في 220000 أو 230000، ولم يُطبّق شيء خارج r6، ولم تبدأ Batch 2.

## النتائج النهائية

| المسار | الحالة | النتيجة | الدليل |
|---|---|---|---|
| تصنيف المسودة الملغاة والإطلاق | ناجح | المسودة لا تصبح إطلاق تكلفة؛ الإطلاق الصحيح 600 يعطي WIP=400 والقيود=400 | `evidence/run9/results/cancelled_credit_release_after_230000.txt` |
| فصل صافي الحارس 220000 | ناجح | المسودة الدائنة الملغاة لا تسبب رفضًا زائفًا؛ `SET CONSTRAINTS ALL IMMEDIATE` ناجح | `evidence/run7/results/cancelled_credit_release_immediate_after.txt` |
| منع إنشاء رصيد سالب | ناجح | 1000 إلى -500 مرفوض دون كتابة، ويبقى الرصيد 1000 | `evidence/run8/results/negative_and_improvement.txt` |
| تحسين رصيد سالب قديم | ناجح | -500 إلى -400 مقبول | `evidence/run8/results/negative_and_improvement.txt` |
| إلغاء مسودة مدينة يجعل الحارس سالبًا | ناجح بعد 230000 | قبل الإصلاح floor_net من 100 إلى -200 ومرور القيود؛ بعد الإصلاح رفض عند القيود المؤجلة، وبعد ROLLBACK يبقى net=100 وfloor_net=100 وledger=100 والحالة DRAFT | `evidence/run9/results/cancelled_debit_status_before.txt` و`cancelled_debit_status_after.txt` |
| العكس الحقيقي | ناجح | عكس الإطلاق 1000/0/1000 ثم عكس الرسملة 0/0/0، دون تشغيل حارس إلغاء المسودة | `evidence/run9/results/posted_reversal_after_230000.txt` |
| سباق الإطلاق ثم العكس | ناجح | الإطلاق يلتزم والعكس المسبب للسالب مرفوض؛ 1000/600/400 وغير المتوازنة=0 | `evidence/run9/results/race1_verify_after_230000.txt` |
| سباق العكس ثم الإطلاق | ناجح | العكس يلتزم والإطلاق اللاحق مرفوض دون كتابة؛ 0/0/0 وغير المتوازنة=0 | `evidence/run9/results/race2_verify_after_230000.txt` |
| سلامة متتبع التقدم | ناجح | 7/7 | `evidence/run9/results/progress-status-final.txt` |
| الضرائب وFawry وتقارير الأصول وCAM وCAPEX/OPEX | مؤجل | أسبابها الخارجية والتأجيلات كما في المتتبع؛ ليست نجاحًا | `tracker/status.json` |

## SQL والفروق

- `sql/20261029220000_project_wip_floor_ignore_cancelled_drafts.sql`: صافي مستقل للحارس يستبعد المسودات الملغاة من خط الأساس والفحص النهائي.
- `sql/20261029230000_project_status_cancellation_floor.sql`: قفل وخط أساس قبل إلغاء المسودة بالحالة وفحص مؤجل بعده؛ العكس من POSTED مستثنى.
- `diffs/floor_live_220000.diff`: فرق الدوال الحية لـ220000. ملف 230000 الجديد هو فرق مسار الحالة المضاف.

## التحقق

`manifest.txt` يحمل SHA-256 لكل ملفات الحمولة بأسطر LF. بجانب الأرشيف ملف `.sha256` وتقرير `.verify.txt` مستقلان. جميع بيانات السباق والاختبارات الملتزمة المؤقتة نُظفت، ومعاملات الاختبار المؤقتة انتهت بـROLLBACK.
"""
write_lf(BUNDLE / "README.md", readme)

payload = sorted(
    (path for path in BUNDLE.rglob("*") if path.is_file() and path.name != "manifest.txt"),
    key=lambda path: path.relative_to(BUNDLE).as_posix(),
)
manifest = "".join(f"{sha256(path)}  {path.relative_to(BUNDLE).as_posix()}\n" for path in payload)
write_lf(BUNDLE / "manifest.txt", manifest)
if b"\r" in (BUNDLE / "manifest.txt").read_bytes():
    raise RuntimeError("manifest.txt must contain LF only")

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
    if not extracted.is_file() or sha256(extracted) != expected:
        raise RuntimeError(f"Extracted hash mismatch: {relative}")
    verified += 1

expected_members = {path.relative_to(BUNDLE).as_posix() for path in BUNDLE.rglob("*") if path.is_file()}
extracted_members = {path.relative_to(VERIFY_DIR).as_posix() for path in VERIFY_DIR.rglob("*") if path.is_file()}
if extracted_members != expected_members:
    raise RuntimeError("Extracted file set differs from bundle")

zip_hash = sha256(ZIP_PATH)
write_lf(SHA_PATH, f"{zip_hash}  {ZIP_PATH.name}\n")
write_lf(
    VERIFY_REPORT,
    "ZIP CRC: PASS\n"
    "Manifest line endings: LF only\n"
    f"Manifest payload hashes verified after extraction: {verified}/{len(payload)}\n"
    f"Extracted file set matches bundle (including manifest.txt): {len(extracted_members)} files\n"
    f"ZIP SHA-256: {zip_hash}\n",
)
print(json.dumps({
    "zip": str(ZIP_PATH),
    "sha256": zip_hash,
    "payload_hashes_verified": verified,
    "files_including_manifest": len(extracted_members),
    "verification_report": str(VERIFY_REPORT),
}, ensure_ascii=False, indent=2))
