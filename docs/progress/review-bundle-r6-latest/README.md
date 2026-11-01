# Review bundle (r6 only; nothing applied outside r6)
- sql/: final project guard migration (proposal), exact rollback, fingerprints before/after/rollback.
- code/: lease page diff (content only) and the full new page text.
- tests/: specs used in the latest runs.
- logs/: run status files and concurrency/direct-write/audit-failure results.
- Review documents: project-posting-lock-guard-review.md, manual-journal-project-tagging-design.md.
Caveats: the audit constraint keeps PROJECT_UPDATED after rollback (hash-chained rows cannot be removed). Two posting paths remain open (see the review, sections 10-11).
