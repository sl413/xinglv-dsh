# XingLv headless screenshot harness (acceptance only; ASCII-only on purpose:
# Windows PowerShell 5.1 reads .ps1 as ANSI, so non-ASCII here would break parsing).
param(
  [string]$Name = "shot",
  [string]$Drive = "sample",
  [int]$Hold = 90000,
  [int]$W = 1600,
  [int]$H = 900,
  [string]$Q = "high",
  [string]$Path = "/",
  [int]$Port = 5276,
  [switch]$NoBanner
)

$nb = if ($NoBanner) { "&nb=1" } else { "" }

$ErrorActionPreference = "Continue"
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$shots = Join-Path $root ".shots"
New-Item -ItemType Directory -Force -Path $shots | Out-Null
$out = Join-Path $shots "$Name.png"
$profile = Join-Path $shots "cp-$Name"
if (Test-Path $profile) { Remove-Item -Recurse -Force $profile -ErrorAction SilentlyContinue }
if (Test-Path $out) { Remove-Item -Force $out }

$url = "http://127.0.0.1:$Port$Path`?qa=1&q=$Q&hold=$Hold&drive=$Drive$nb"
& $chrome --headless=new --no-sandbox --disable-gpu --disable-breakpad --disable-crash-reporter `
  --enable-unsafe-swiftshader --hide-scrollbars --no-first-run --no-default-browser-check `
  --disable-dev-shm-usage "--user-data-dir=$profile" "--window-size=$W,$H" `
  "--screenshot=$out" $url 2>&1 | Select-String -Pattern "written|FATAL" | Select-Object -First 2

if (Test-Path $out) { Write-Output "OK $Name $((Get-Item $out).Length) bytes" } else { Write-Output "FAILED $Name" }
