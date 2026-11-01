from pathlib import Path

base = Path(__file__).resolve().parent
results = base / "results"
files = [
    "negative_and_improvement.txt",
    "race1_release_hold.txt",
    "race1_reverse_wait.txt",
    "race1_verify.txt",
    "race2_reverse_hold.txt",
    "race2_release_wait.txt",
    "race2_verify.txt",
    "cancelled_draft_floor_after_220000.txt",
    "race_cleanup.txt",
]
parts = [
    "R6 FOCUSED GUARD REGRESSION AFTER 220000\n"
    "Scope: negative floor, negative improvement, release/reversal race orders, cancelled debit draft.\n"
    "No UI suite. Final successful logs only; corrected test setup/query attempts remain as separate files.\n"
]
for name in files:
    parts.append(f"\n===== {name} =====\n" + (results / name).read_text(encoding="utf-8"))
output = results / "guard_tests_after_220000.log"
with output.open("w", encoding="utf-8", newline="\n") as handle:
    handle.write("".join(parts))
print(output)
