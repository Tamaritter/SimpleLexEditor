$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $projectRoot
$toolPaths = @("$env:USERPROFILE\.cargo\bin", "$projectRoot\.tools\winlibs\mingw64\bin") | Where-Object { Test-Path $_ }
$env:Path = ($toolPaths -join ';') + ';' + $env:Path
$devArgs = @('run', 'tauri', '--', 'dev')
if (Test-Path -LiteralPath 'src-tauri/resources/tex-runtime.exe') {
  $devArgs += @('--config', (Join-Path $projectRoot 'src-tauri\tauri.offline.conf.json'))
}
& npm.cmd @devArgs
exit $LASTEXITCODE
