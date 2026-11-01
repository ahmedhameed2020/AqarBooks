# Capture the eight Google Play phone screenshots from a running Android device
# (in practice: the Medium_Phone_API_36.1 emulator at 1080x2400 - these captures
# are emulator captures, not a physical phone).
#
# The screens come from `lib/preview_main.dart` in store-capture mode: one
# genuine production screen per capture, rendered full-screen by the real app on
# that Android device, against the synthetic PreviewRepository (no Supabase, no
# backend, no camera). One install drives all eight - the harness advances on a
# timer and announces each screen on stdout, which is what this script waits
# for, so nothing is captured while the app is loading or mid-transition.
#
# Usage (from mobile/):
#   powershell -NoProfile -ExecutionPolicy Bypass -File store-assets/capture_play_screenshots.ps1
#   ... -Device emulator-5554 -DwellSeconds 9
#
# Output: store-assets/screenshots/ar/01-resident-home.png ... 08-manager-dashboard.png
# (this file is kept ASCII-only so Windows PowerShell 5.1 parses it the same way
#  as PowerShell 7)

[CmdletBinding()]
param(
  [string]$Device = "emulator-5554",
  [string]$Adb = "C:\Users\Lenovo\AppData\Local\Android\Sdk\platform-tools\adb.exe",
  [int]$DwellSeconds = 9,
  [int]$StartupTimeoutSeconds = 600,
  [int]$PerScreenTimeoutSeconds = 90,
  [switch]$KeepEmulatorUi
)

$ErrorActionPreference = "Stop"
$mobileRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$outDir = Join-Path $mobileRoot "store-assets\screenshots\ar"
$logDir = Join-Path $outDir "_logs"
$logPath = Join-Path $logDir "capture-run.log"

# The expected set; a run that does not produce exactly these is a failure.
$expected = [ordered]@{
  "01-resident-home"        = "resident-home"
  "02-payments-dues"        = "payments-dues"
  "03-fawry-payment"        = "fawry-payment"
  "04-visitor-qr-pass"      = "visitor-qr-pass"
  "05-maintenance-request"  = "maintenance-request"
  "06-technician-dashboard" = "technician-dashboard"
  "07-gate-scanner"         = "gate-scanner"
  "08-manager-dashboard"    = "manager-dashboard"
}

if (-not (Test-Path $Adb)) { throw "adb not found at $Adb" }
New-Item -ItemType Directory -Force -Path $outDir, $logDir | Out-Null
Get-ChildItem -Path $outDir -Filter "*.png" | Remove-Item -Force

function Invoke-Adb {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  & $Adb -s $Device @Args 2>&1
}

function Save-Screenshot {
  param([string]$Path)
  # `exec-out` keeps the PNG byte-exact. cmd's redirection writes the raw
  # stream straight to the file; assigning the output to a PowerShell variable
  # would decode the bytes as text and corrupt the PNG.
  cmd.exe /c "`"$Adb`" -s $Device exec-out screencap -p > `"$Path`""
  if (-not (Test-Path $Path)) { throw "screencap produced no file at $Path" }
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $head = New-Object byte[] 26
    $read = $stream.Read($head, 0, 26)
  } finally { $stream.Dispose() }
  if ($read -lt 26 -or $head[0] -ne 0x89 -or $head[1] -ne 0x50 -or $head[2] -ne 0x4E -or $head[3] -ne 0x47) {
    throw "screencap output at $Path is not a PNG"
  }
  $width = [int]$head[16] * 16777216 + [int]$head[17] * 65536 + [int]$head[18] * 256 + [int]$head[19]
  $height = [int]$head[20] * 16777216 + [int]$head[21] * 65536 + [int]$head[22] * 256 + [int]$head[23]
  if ($width -ne 1080 -or $height -ne 2400) {
    throw "capture at $Path is ${width}x${height}, expected 1080x2400"
  }
}

Write-Host "== device =="
Invoke-Adb wait-for-device | Out-Null
$size = (Invoke-Adb shell wm size) -join " "
$density = (Invoke-Adb shell wm density) -join " "
Write-Host "  $Device  $size  $density"

# Portrait only: a rotated capture would fail the 1080x2400 validator.
Invoke-Adb shell settings put system accelerometer_rotation 0 | Out-Null
Invoke-Adb shell settings put system user_rotation 0 | Out-Null

if (-not $KeepEmulatorUi) {
  Write-Host "== immersive system UI =="
  Invoke-Adb shell settings put global policy_control 'immersive.full=*' | Out-Null
  Start-Sleep -Seconds 2
}

Write-Host "== flutter run -t lib/preview_main.dart (STORE_SCREEN=cycle) =="
$runArgs = @(
  "run", "-t", "lib/preview_main.dart", "-d", $Device,
  "--dart-define=STORE_SCREEN=cycle",
  "--dart-define=STORE_DWELL_SECONDS=$DwellSeconds"
)
$proc = Start-Process -FilePath "flutter" -ArgumentList $runArgs -WorkingDirectory $mobileRoot `
  -RedirectStandardOutput $logPath -RedirectStandardError "$logPath.err" -PassThru -NoNewWindow

try {
  $captured = @{}
  $cursor = 0
  $deadline = (Get-Date).AddSeconds($PerScreenTimeoutSeconds * $expected.Count + $StartupTimeoutSeconds)

  # Each `STORE_CYCLE <shot> <key> <stem>` line means the harness has the screen
  # mounted; the shot is taken only then. The harness itself waits for the first
  # frame to be rasterised, so the very first capture is real content too.
  while ($captured.Count -lt $expected.Count) {
    if ((Get-Date) -gt $deadline) { throw "timed out waiting for the harness" }
    if ($proc.HasExited) { throw "flutter run exited early ($($proc.ExitCode))" }

    $lines = @(Get-Content -Path $logPath -ErrorAction SilentlyContinue)
    if ($lines.Count -le $cursor) { Start-Sleep -Milliseconds 200; continue }

    foreach ($line in $lines[$cursor..($lines.Count - 1)]) {
      if ($line -match "STORE_CYCLE\s+(\d+)\s+(\S+)\s+(\S+)") {
        $key = $Matches[2]; $stem = $Matches[3]
        if ($expected.Contains($stem) -and -not $captured.ContainsKey($stem)) {
          # One extra beat so the freshly-built screen is fully composited.
          Start-Sleep -Milliseconds 1400
          Save-Screenshot -Path (Join-Path $outDir "$stem.png")
          $captured[$stem] = $key
          Write-Host ("  captured {0}.png  ({1})" -f $stem, $key)
        }
      }
    }
    $cursor = $lines.Count
  }

  $missing = @($expected.Keys | Where-Object { -not $captured.ContainsKey($_) })
  if ($missing.Count -gt 0) { throw "missing captures: $($missing -join ', ')" }
  Write-Host "captured $($captured.Count)/$($expected.Count) screenshots in $outDir"
}
finally {
  if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
  & $Adb -s $Device shell am force-stop com.aqarbooks.app 2>&1 | Out-Null
  if (-not $KeepEmulatorUi) {
    Write-Host "== restoring system UI =="
    Invoke-Adb shell settings put global policy_control 'null' | Out-Null
  }
}
