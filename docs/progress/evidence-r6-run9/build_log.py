from pathlib import Path

base = Path(__file__).resolve().parent
results = base / "results"
files = [
    "cancelled_debit_status_after.txt",
    "cancelled_credit_release_after_230000.txt",
    "posted_reversal_after_230000.txt",
    "race1_release_hold_after_230000.txt",
    "race1_reverse_wait_after_230000.txt",
    "race1_verify_after_230000.txt",
    "race2_reverse_hold_after_230000.txt",
    "race2_release_wait_after_230000.txt",
    "race2_verify_after_230000.txt",
    "race_cleanup_after_230000.txt",
]
parts = [
    "R6 STATUS-CANCELLATION AND REVERSAL REGRESSION AFTER 230000\n"
    "Only affected cancellation, release, genuine reversal and race paths were rerun. No UI suite.\n"
]
for name in files:
    parts.append(f"\n===== {name} =====\n" + (results / name).read_text(encoding="utf-8"))
output = results / "status_guard_regression_after_230000.log"
with output.open("w", encoding="utf-8", newline="\n") as handle:
    handle.write("".join(parts))
print(output)
