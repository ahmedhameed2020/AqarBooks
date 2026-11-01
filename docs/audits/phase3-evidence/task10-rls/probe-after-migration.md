# Time of `select count(*)` per relation under RLS (ms), isolated stack, 839 organizations

| relation | total rows | staff ms (min-max) / sees | owner ms / sees | stranger ms / sees |
|---|---|---|---|---|
| chart_of_accounts | 14517 | 1162-2903 / 26 | 1359-2864 / 0 | 1457-2518 / 0 |
| fiscal_periods | 13614 | 1718-2901 / 24 | 1494-1752 / 0 | 1265-1763 / 0 |
| dues | 1173 | 1655-4674 / 13 | 5067-6864 / 12 | 5434-7859 / 0 |
