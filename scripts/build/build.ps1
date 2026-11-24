$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $projectRoot
$toolPaths = @("$env:USERPROFILE\.cargo\bin", "$projectRoot\.tools\winlibs\mingw64\bin") | Where-Object { Test-Path $_ }
$env:Path = ($toolPaths -join ';') + ';' + $env:Path
$offlineConfig = Join-Path $projectRoot 'src-tauri\tauri.offline.conf.json'
& "$PSScriptRoot\prepare-tex.ps1"
if ($LASTEXITCODE -ne 0) {exit $LASTEXITCODE}
if (@($args | Where-Object { $_ -in @('--debug','-d','--no-bundle','--bundles','-b','--target','-t','--config','-c') }).Count -gt 0) {
  & npm.cmd run tauri -- build --config $offlineConfig @args
  exit $LASTEXITCODE
}
& npm.cmd run tauri -- build --config $offlineConfig --no-bundle @args
if ($LASTEXITCODE -ne 0) {exit $LASTEXITCODE}
& (Join-Path $projectRoot "scripts\release\bundle.ps1")
exit $LASTEXITCODE
