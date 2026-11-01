from __future__ import annotations

import argparse
import hashlib
import shutil
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROGRESS = ROOT / "docs" / "progress"
OLD_BUNDLE = PROGRESS / "review-bundle-r6-230000"
NEW_BUNDLE = PROGRESS / "review-bundle-r6-240000"
ZIP_PATH = PROGRESS / "review-bundle-r6-240000.zip"
SHA_PATH = PROGRESS / "review-bundle-r6-240000.zip.sha256"
VERIFY_PATH = PROGRESS / "review-bundle-r6-240000.verify.txt"

COPIES = [
    ("docs/progress/proposals/20261029240000_disposal_proceeds_cash_only.sql", "sql/20261029240000_disposal_proceeds_cash_only.sql"),
    ("docs/progress/proposals/20261029240000_disposal_proceeds_cash_only_rollback.sql", "sql/20261029240000_disposal_proceeds_cash_only_rollback.sql"),
    ("docs/progress/review-230000-sql.md", "reviews/review-230000-sql.md"),
    ("docs/progress/review-240000-sql.md", "reviews/review-240000-sql.md"),
    ("docs/progress/review-signoff-120000-230000.md", "reviews/review-signoff-120000-230000.md"),
    ("docs/progress/review-signoff-batch-1b.md", "reviews/review-signoff-batch-1b.md"),
    ("docs/progress/disposal-proceeds-account-recommendation.md", "reviews/disposal-proceeds-account-recommendation.md"),
    ("docs/progress/rel03-r6-result.md", "reviews/rel03-r6-result.md"),
    ("docs/progress/evidence-r6-run10/results/dispose-fixed-asset-live.diff", "diffs/dispose-fixed-asset-live.diff"),
    ("docs/progress/evidence-r6-run10/results/rel03-code.diff", "diffs/rel03-code.diff"),
    ("docs/progress/ROADMAP.md", "tracker/ROADMAP.md"),
    ("docs/progress/status.json", "tracker/status.json"),
    ("docs/progress/handover-batch-1b.md", "tracker/handover-batch-1b.md"),
]

RESULT_FILES = [
    "apply-240000.txt",
    "rollback-match.txt",
    "dispose-fixed-asset-before.sql",
    "dispose-fixed-asset-after.sql",
    "rel03-red-integration.txt",
    "rel03-red-e2e.txt",
    "rel03-green-integration.txt",
    "rel03-green-e2e.txt",
    "rel03-green-build.txt",
    "rel03-review-integration.txt",
    "rel03-review-e2e.txt",
    "rel03-review-e2e-optimized.txt",
    "tsc-rel03-review-status.txt",
    "rel03-review-progress-status-final.txt",
    "batch1b-240000-progress-status.txt",
    "batch1b-240000-progress-status.json",
]
COPIES.extend(
    (
        f"docs/progress/evidence-r6-run10/results/{name}",
        f"evidence/run10/results/{name}",
    )
    for name in RESULT_FILES
)
COPIES.append(
    (
        "docs/progress/evidence-r6-run10/results/rel03-review-trace/test.trace",
        "evidence/run10/results/rel03-review-trace/test.trace",
    )
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stage() -> None:
    outputs = [NEW_BUNDLE, ZIP_PATH, SHA_PATH, VERIFY_PATH]
    existing = [str(path) for path in outputs if path.exists()]
    if existing:
        raise SystemExit("Refusing to overwrite existing outputs: " + ", ".join(existing))
    if not OLD_BUNDLE.is_dir():
        raise SystemExit(f"Missing source bundle: {OLD_BUNDLE}")

    shutil.copytree(
        OLD_BUNDLE,
        NEW_BUNDLE,
        ignore=shutil.ignore_patterns("manifest.txt"),
    )
    for source_name, destination_name in COPIES:
        source = ROOT / source_name
        if not source.is_file():
            raise SystemExit(f"Missing required source: {source}")
        destination = NEW_BUNDLE / destination_name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
    print(f"Staged {NEW_BUNDLE}")
    print(f"Copied {len(COPIES)} REL-03, tracker, SQL, review, diff, and evidence files")


def pack() -> None:
    if not NEW_BUNDLE.is_dir():
        raise SystemExit(f"Missing staged bundle: {NEW_BUNDLE}")
    outputs = [NEW_BUNDLE / "manifest.txt", ZIP_PATH, SHA_PATH, VERIFY_PATH]
    existing = [str(path) for path in outputs if path.exists()]
    if existing:
        raise SystemExit("Refusing to overwrite existing package outputs: " + ", ".join(existing))

    readme = (NEW_BUNDLE / "README.md").read_text(encoding="utf-8")
    if "120000–240000" not in readme or "review-signoff-batch-1b.md" not in readme:
        raise SystemExit("README has not been updated for the 240000 sign-off bundle")

    payload = sorted(
        (path for path in NEW_BUNDLE.rglob("*") if path.is_file()),
        key=lambda path: path.relative_to(NEW_BUNDLE).as_posix(),
    )
    manifest_lines = [
        f"{sha256(path)}  {path.relative_to(NEW_BUNDLE).as_posix()}\n"
        for path in payload
    ]
    manifest_bytes = "".join(manifest_lines).encode("utf-8")
    if b"\r" in manifest_bytes:
        raise SystemExit("Manifest must be LF-only")
    (NEW_BUNDLE / "manifest.txt").write_bytes(manifest_bytes)

    with zipfile.ZipFile(ZIP_PATH, "x", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in [*payload, NEW_BUNDLE / "manifest.txt"]:
            archive.write(path, path.relative_to(NEW_BUNDLE).as_posix())

    archive_sha = sha256(ZIP_PATH)
    SHA_PATH.write_bytes(f"{archive_sha}  {ZIP_PATH.name}\n".encode("ascii"))

    with zipfile.ZipFile(ZIP_PATH) as archive:
        bad_member = archive.testzip()
        if bad_member is not None:
            raise SystemExit(f"CRC verification failed: {bad_member}")
        expected_names = {
            path.relative_to(NEW_BUNDLE).as_posix() for path in payload
        } | {"manifest.txt"}
        actual_names = set(archive.namelist())
        if actual_names != expected_names:
            raise SystemExit("Archive file set does not match the staged payload")
        if archive.read("manifest.txt") != manifest_bytes:
            raise SystemExit("Archived manifest differs from the staged manifest")

        with tempfile.TemporaryDirectory(dir=ROOT / "working files") as temporary:
            extracted = Path(temporary)
            archive.extractall(extracted)
            extracted_files = {
                path.relative_to(extracted).as_posix()
                for path in extracted.rglob("*")
                if path.is_file()
            }
            if extracted_files != expected_names:
                raise SystemExit("Extracted file set does not match the archive")
            for line in manifest_lines:
                expected_hash, relative_name = line.rstrip("\n").split("  ", 1)
                if sha256(extracted / relative_name) != expected_hash:
                    raise SystemExit(f"Extracted hash mismatch: {relative_name}")

    verification = "\n".join(
        [
            "Batch 1B r6 240000 review bundle verification",
            f"verified_utc={datetime.now(timezone.utc).isoformat()}",
            f"archive={ZIP_PATH.name}",
            f"sha256={archive_sha}",
            f"payload_files={len(payload)}",
            f"archive_entries={len(payload) + 1}",
            "crc=PASS",
            "archive_file_set=PASS",
            "manifest_sha256_after_extract=PASS",
            "manifest_lf_only=PASS",
            "human_signoff=PENDING",
            "production_approval=NOT_GRANTED",
            "",
        ]
    )
    VERIFY_PATH.write_bytes(verification.encode("utf-8"))
    print(f"Archive: {ZIP_PATH}")
    print(f"SHA-256: {archive_sha}")
    print(f"Payload files: {len(payload)}; archive entries: {len(payload) + 1}")
    print("CRC, extracted file set, extracted SHA-256 hashes, and LF manifest: PASS")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["stage", "pack"])
    args = parser.parse_args()
    if args.action == "stage":
        stage()
    else:
        pack()


if __name__ == "__main__":
    main()
