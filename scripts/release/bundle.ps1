param([switch]$PreserveBinary)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location -LiteralPath $projectRoot
$toolPaths=@("$env:USERPROFILE\.cargo\bin", "$projectRoot\.tools\winlibs\mingw64\bin")|Where-Object {Test-Path -LiteralPath $_}
$env:Path=($toolPaths -join ';')+';'+$env:Path
& (Join-Path $projectRoot "scripts\build\prepare-tex.ps1")
if($LASTEXITCODE -ne 0){throw 'Die vollständige TeX-Umgebung fehlt.'}
$config=Get-Content -LiteralPath 'src-tauri\tauri.conf.json' -Raw|ConvertFrom-Json
$version=$config.version
$binary=Join-Path $projectRoot 'src-tauri\target\release\simplelexeditor.exe'
if(-not(Test-Path -LiteralPath $binary) -or (Get-Item -LiteralPath $binary).VersionInfo.ProductVersion -ne $version){throw 'Passende Release-Programmdatei fehlt. Zuerst build.ps1 ausführen.'}
$binaryHash=(Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash
$minimum=$config.bundle.windows.minimumWebview2Version
$runRoot=Join-Path $projectRoot ('.tools\installer-build\'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $runRoot -Force|Out-Null
# Also populate the legacy NSIS key: the installed CLI renders its NSIS
# minimum-version macro from this field, even with the Windows key set.
$override=Join-Path $runRoot 'packaging.json'
@{bundle=@{windows=@{nsis=@{minimumWebview2Version=$minimum}}}}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $override -Encoding utf8
$offlineConfig=Join-Path $projectRoot 'src-tauri\tauri.offline.conf.json'
$bundleArgs=@('run','tauri','--','bundle','--bundles','nsis','--config',$offlineConfig,'--config',$override)
if($PreserveBinary){$bundleArgs+='--no-binary-patching'}
$previousPreference=$ErrorActionPreference
try {
  # Windows PowerShell wraps redirected native stderr as ErrorRecords, even
  # for warnings. Check the real process exit code instead.
  $ErrorActionPreference='Continue'
  $bundleOutput=& npm.cmd @bundleArgs 2>&1
  $bundleExit=$LASTEXITCODE
} finally {$ErrorActionPreference=$previousPreference}
$bundleOutput|ForEach-Object {Write-Output $_.ToString()}
$working=Join-Path $projectRoot 'src-tauri\target\release\nsis\x64'
$generated=Join-Path $working 'installer.nsi'
if(-not(Test-Path -LiteralPath $generated)){throw 'Die NSIS-Vorlage wurde nicht erzeugt.'}
$script=[IO.File]::ReadAllText($generated)
if($minimum -and -not $script.Contains(('!define MINIMUMWEBVIEW2VERSION "'+$minimum+'"'))){throw 'Die WebView2-Mindestversion fehlt in der erzeugten Installer-Vorlage.'}
$installer=Join-Path $projectRoot "src-tauri\target\release\bundle\nsis\SimpleLexEditor_${version}_x64-setup.exe"
if($bundleExit -ne 0){
  if(-not(($bundleOutput|Out-String).Contains("Can't open output file"))){throw 'Die Installer-Erstellung ist fehlgeschlagen; kein alternativer Ausgabename wurde versucht.'}
  # A fixed temporary output can remain inaccessible on Windows. Use a fresh
  # output and the generated Tauri script without changing system protection.
  $suffix=[guid]::NewGuid().ToString('N')
  $outputName="SimpleLexEditor-installer-$suffix.exe"
  $compileScript=Join-Path $working "installer-$suffix.nsi"
  $temporary=Join-Path $working $outputName
  foreach($path in @($working,$compileScript,$temporary,$installer)){
    if(-not [IO.Path]::GetFullPath($path).StartsWith($projectRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Installer-Pfad außerhalb des Arbeitsordners.'}
  }
  $pattern='(?m)^!define OUTFILE "[^"]+"'
  if(-not[regex]::IsMatch($script,$pattern)){throw 'Unbekanntes NSIS-Ausgabeformat.'}
  $rewritten=[regex]::Replace($script,$pattern,('!define OUTFILE "'+$outputName+'"'))
  [IO.File]::WriteAllText($compileScript,$rewritten,[Text.UTF8Encoding]::new($false))
  $compiler=Join-Path $env:LOCALAPPDATA 'tauri\NSIS\makensis.exe'
  if(-not(Test-Path -LiteralPath $compiler)){throw 'Der zuvor verwendete NSIS-Compiler wurde nicht gefunden.'}
  Write-Output 'NSIS verwendet einen eindeutigen temporaeren Ausgabenamen.'
  Push-Location -LiteralPath $working
  try {& $compiler '-INPUTCHARSET' 'UTF8' '-OUTPUTCHARSET' 'UTF8' '-V2' $compileScript;$compileExit=$LASTEXITCODE} finally {Pop-Location}
  if($compileExit -ne 0 -or -not(Test-Path -LiteralPath $temporary)){throw 'Auch die Installer-Erstellung mit eigenem temporären Namen ist fehlgeschlagen.'}
  New-Item -ItemType Directory -Path (Split-Path -Parent $installer) -Force|Out-Null
  Copy-Item -LiteralPath $temporary -Destination $installer -Force
}
if(-not(Test-Path -LiteralPath $installer) -or (Get-Item -LiteralPath $installer).Length -lt 1024){throw 'Installer-Datei fehlt oder ist unvollständig.'}
if($PreserveBinary -and (Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash -ne $binaryHash){throw 'Die geprüfte Programmdatei wurde beim Verpacken verändert.'}
@{version=$version;minimumWebview2Version=$minimum;sha256=(Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant();scriptSha256=(Get-FileHash -LiteralPath $generated -Algorithm SHA256).Hash.ToLowerInvariant()}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $projectRoot '.tools\installer-verification.json') -Encoding utf8
Write-Output "PASS Windows-Installer: $installer"
