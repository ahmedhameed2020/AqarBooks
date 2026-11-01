from __future__ import annotations

import hashlib
import json
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PROGRESS = ROOT / "docs" / "progress"
EVIDENCE = PROGRESS / "evidence-r6-run5"
BUNDLE = PROGRESS / "review-bundle-r6-200000"
ZIP_PATH = PROGRESS / "review-bundle-r6-200000.zip"
VERIFY_DIR = ROOT / "working files" / "verification" / "review-bundle-r6-200000"
VERIFY_REPORT = PROGRESS / "review-bundle-r6-200000.verify.txt"
SHA_PATH = PROGRESS / "review-bundle-r6-200000.zip.sha256"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


for relative in ("sql", "scripts", "results", "diffs", "status"):
    (BUNDLE / relative).mkdir(parents=True, exist_ok=True)
VERIFY_DIR.mkdir(parents=True, exist_ok=True)

shutil.copy2(
    PROGRESS / "proposals" / "20261029200000_project_wip_summary_cancelled_drafts.sql",
    BUNDLE / "sql" / "20261029200000_project_wip_summary_cancelled_drafts.sql",
)
for source_dir, target_dir in (("scripts", "scripts"), ("results", "results"), ("diffs", "diffs")):
    for source in sorted((EVIDENCE / source_dir).iterdir()):
        if source.is_file():
            shutil.copy2(source, BUNDLE / target_dir / source.name)
shutil.copy2(PROGRESS / "status.json", BUNDLE / "status" / "status.json")

payload = sorted(
    (path for path in BUNDLE.rglob("*") if path.is_file() and path.name != "manifest.txt"),
    key=lambda path: path.relative_to(BUNDLE).as_posix(),
)
manifest_lines = [f"{sha256(path)}  {path.relative_to(BUNDLE).as_posix()}" for path in payload]
with (BUNDLE / "manifest.txt").open("w", encoding="utf-8", newline="\n") as manifest:
    manifest.write("\n".join(manifest_lines) + "\n")

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
    actual = sha256(extracted)
    if actual != expected:
        raise RuntimeError(f"SHA-256 mismatch after extraction: {relative}")
    verified += 1

expected_members = {path.relative_to(BUNDLE).as_posix() for path in BUNDLE.rglob("*") if path.is_file()}
extracted_members = {path.relative_to(VERIFY_DIR).as_posix() for path in VERIFY_DIR.rglob("*") if path.is_file()}
if extracted_members != expected_members:
    raise RuntimeError("Extracted file set differs from the bundle file set")

zip_hash = sha256(ZIP_PATH)
with SHA_PATH.open("w", encoding="utf-8", newline="\n") as handle:
    handle.write(f"{zip_hash}  {ZIP_PATH.name}\n")
with VERIFY_REPORT.open("w", encoding="utf-8", newline="\n") as handle:
    handle.write(
        "ZIP CRC: PASS\n"
        f"Manifest payload hashes verified after extraction: {verified}/{len(payload)}\n"
        f"Extracted file set matches bundle (including manifest.txt): {len(extracted_members)} files\n"
        f"ZIP SHA-256: {zip_hash}\n"
    )
print(json.dumps({
    "zip": str(ZIP_PATH),
    "sha256": zip_hash,
    "payload_hashes_verified": verified,
    "files_including_manifest": len(extracted_members),
    "verification_report": str(VERIFY_REPORT),
}, ensure_ascii=False, indent=2))
