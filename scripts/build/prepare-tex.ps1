param([string]$Archive=$env:SIMPLELEXEDITOR_TEX_ARCHIVE)
$ErrorActionPreference='Stop'
if (-not $PSBoundParameters.ContainsKey('Archive') -and -not $Archive) {$Archive=$env:ROXENA_TEX_ARCHIVE}
$projectRoot=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$lock=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'tex-runtime.lock.json') -Raw|ConvertFrom-Json
$target=Join-Path $projectRoot 'src-tauri\resources\tex-runtime.exe'
function Test-Archive([string]$Path) {
  (Test-Path -LiteralPath $Path) -and (Get-Item -LiteralPath $Path).Length -eq $lock.size -and (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() -eq $lock.sha256
}
if(Test-Archive $target){Write-Output 'PASS mitgeliefertes TeX-System: SHA-256 stimmt.';exit 0}
New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force|Out-Null
if($Archive){
  if(-not(Test-Archive $Archive)){throw 'Das lokale TeX-Archiv stimmt nicht mit tex-runtime.lock.json überein.'}
  Copy-Item -LiteralPath $Archive -Destination $target -Force
} else {
  $download=Join-Path $projectRoot '.tools\tex-download\TinyTeX-2-windows.exe'
  New-Item -ItemType Directory -Path (Split-Path -Parent $download) -Force|Out-Null
  if(-not(Test-Archive $download)){
    Write-Output 'Lade die vollständige TeX-Umgebung für den Offline-Installer …'
    & node (Join-Path $PSScriptRoot 'download-tex.mjs')
    if($LASTEXITCODE -ne 0){throw 'Das festgeschriebene TeX-Archiv konnte nicht geladen werden. Setze SIMPLELEXEDITOR_TEX_ARCHIVE auf eine Kopie, die mit tex-runtime.lock.json übereinstimmt.'}
  }
  if(-not(Test-Archive $download)){throw 'TeX-Prüfsumme stimmt nicht. Der tägliche Upstream-Build hat sich möglicherweise geändert. tex-runtime.lock.json bewusst aktualisieren oder SIMPLELEXEDITOR_TEX_ARCHIVE auf das freigegebene Archiv setzen.'}
  Copy-Item -LiteralPath $download -Destination $target -Force
}
Write-Output 'PASS vollständige TeX-Umgebung vorbereitet; Nutzer benötigen keinen TeX-Download.'
exit 0
