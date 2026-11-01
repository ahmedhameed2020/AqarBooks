# Interleaved timing: policies as installed (A) vs admin check as InitPlan (B); scratch_rls, full copies with only the policy under test

| table | rows | principal | migration policies ms (median of 5) | refined ms (median of 5) |
|---|---|---|---|---|
| coa | 14517 | staff | 380 (348-490) | 10 (9-13) |
| coa | 14517 | owner | 497 (403-683) | 10 (8-14) |
| coa | 14517 | stranger | 401 (370-525) | 10 (7-11) |
| fp | 13614 | staff | 512 (409-671) | 10 (8-16) |
| fp | 13614 | owner | 398 (320-598) | 8 (7-14) |
| fp | 13614 | stranger | 397 (370-543) | 9 (9-16) |
| dues | 1173 | staff | 22 (19-27) | 6 (4-9) |
| dues | 1173 | owner | 24 (20-34) | 7 (4-12) |
| dues | 1173 | stranger | 17 (17-42) | 5 (4-5) |
