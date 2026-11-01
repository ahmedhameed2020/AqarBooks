# SCAN OF THE EXPORT FOLDER before it leaves the production side. Reads files only; prints WHERE a pattern matched (file, line number, rule) and the first 4
# characters of the match, never the whole value. Exit code 1 if anything is found.
#   powershell -NoProfile -File scan-export.ps1 -Path C:\rehearsal\input
param([Parameter(Mandatory = $true)][string]$Path)
$rules = [ordered]@{
  'JWT'            = 'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.'
  'API-KEY'        = '\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{10,}'
  'AWS-KEY'        = 'AKIA[0-9A-Z]{16}'
  'PRIVATE-KEY'    = '-----BEGIN [A-Z ]*PRIVATE KEY'
  'DB-URL-PW'      = 'postgres(ql)?://[^:\s/]+:[^@\s]{4,}@'
  'BEARER'         = '[Bb]earer\s+[A-Za-z0-9._~+/-]{30,}'
  'LONG-HEX'       = '\b(?:[0-9a-fA-F]{40,63}|[0-9a-fA-F]{65,})\b'   # exactly 64 hex = SHA-256 digest (kept hash columns, 64-hex placeholders): counted below, not a finding
  'BCRYPT'         = '\$2[aby]\$\d{2}\$[./A-Za-z0-9]{50,}'
  'REAL-EMAIL'     = '[A-Za-z0-9._%+-]+@(?!example\.invalid)[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
}
$found = 0
$files = Get-ChildItem -LiteralPath $Path -Recurse -File -Include *.csv, *.psql, *.sql, *.txt -ErrorAction Stop
foreach ($f in $files) {
  foreach ($rule in $rules.Keys) {
    $hits = Select-String -LiteralPath $f.FullName -Pattern $rules[$rule] -AllMatches -ErrorAction SilentlyContinue
    foreach ($h in $hits) {
      $m = $h.Matches[0].Value
      Write-Output ("{0}:{1} [{2}] starts with '{3}...'" -f $f.Name, $h.LineNumber, $rule, $m.Substring(0, [Math]::Min(4, $m.Length)))
      $found++
    }
  }
}
# information only: how many 64-hex digests the files carry (hash columns the export keeps, and the 64-hex placeholders of credential-hash columns)
$digests = 0
foreach ($f in $files) { $digests += (Select-String -LiteralPath $f.FullName -Pattern '\b[0-9a-fA-F]{64}\b' -AllMatches -ErrorAction SilentlyContinue | ForEach-Object { $_.Matches.Count } | Measure-Object -Sum).Sum }
Write-Output ("info: {0} 64-hex digest token(s) in {1} files (SHA-256 columns / placeholders; review the rule report if this number is unexpected)" -f $digests, $files.Count)
# the auth users file must carry exactly id, created_at, email
$u = Join-Path $Path 'data\_auth_users.csv'
if (Test-Path -LiteralPath $u) {
  $header = (Get-Content -LiteralPath $u -TotalCount 1).Trim()
  if ($header -ne 'id,created_at,email') { Write-Output "data\_auth_users.csv header is '$header' (expected id,created_at,email)"; $found++ }
}
if ($found -gt 0) { Write-Output "FOUND $found issue(s): do NOT hand this folder over"; exit 1 }
Write-Output ("CLEAN: {0} files scanned, no pattern matched" -f $files.Count)
exit 0
