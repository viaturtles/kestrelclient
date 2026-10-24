# Builds kestrel-core.jar (the in-game mod) from src/ and res/.
# Needs a JDK (javac/jar) and Minecraft 1.8.9 installed once by Kestrel (it compiles against the game jar).
#   powershell -ExecutionPolicy Bypass -File build.ps1 [-Jdk C:\path\to\jdk\bin]
param([string]$Jdk = "")
$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
if (-not $Jdk) { $Jdk = Split-Path (Get-Command javac).Source }
$lib = "$env:APPDATA\Kestrel\libraries"
$cp = @(
  "$env:APPDATA\Kestrel\versions\1.8.9\1.8.9.jar",
  "$lib\org\lwjgl\lwjgl\lwjgl\2.9.4-nightly-20150209\lwjgl-2.9.4-nightly-20150209.jar",
  "$lib\com\mojang\authlib\1.5.21\authlib-1.5.21.jar",
  "$lib\com\google\guava\guava\17.0\guava-17.0.jar",
  "$lib\com\google\code\gson\gson\2.2.4\gson-2.2.4.jar",
  "$lib\org\lwjgl\lwjgl\lwjgl_util\2.9.4-nightly-20150209\lwjgl_util-2.9.4-nightly-20150209.jar",
  "$here\lib\asm-5.2.jar"
)
foreach ($p in $cp) { if (-not (Test-Path $p)) { throw "Missing $p (install Minecraft 1.8.9 in Kestrel first)" } }

$out = "$here\out"
if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory $out | Out-Null
$sources = Get-ChildItem "$here\src" -Recurse -Filter *.java | ForEach-Object { $_.FullName }
& "$Jdk\javac.exe" --release 8 -nowarn -encoding UTF-8 -cp ($cp -join ";") -d $out @sources
if ($LASTEXITCODE -ne 0) { throw "javac failed" }

Copy-Item -Recurse -Force "$here\res\kestrel\*" "$out\kestrel"
# ASM goes inside the jar (BSD licence); LaunchWrapper's own copy is used when present.
Push-Location $out
& "$Jdk\jar.exe" xf "$here\lib\asm-5.2.jar" org
Pop-Location

Set-Content -Path "$here\MANIFEST.MF" -Encoding ASCII -Value "Premain-Class: kestrel.core.Agent`r`n"
& "$Jdk\jar.exe" cfm "$here\kestrel-core.jar" "$here\MANIFEST.MF" -C $out .
if ($LASTEXITCODE -ne 0) { throw "jar failed" }
Remove-Item -Recurse -Force $out
Write-Host ("kestrel-core.jar: {0:N0} KB" -f ((Get-Item "$here\kestrel-core.jar").Length / 1KB))
