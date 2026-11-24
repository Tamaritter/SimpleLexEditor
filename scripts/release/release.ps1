param([switch]$SkipBuild,[switch]$Production)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location -LiteralPath $projectRoot
if (-not $SkipBuild) {
  & (Join-Path $projectRoot "scripts\build\build.ps1")
  if ($LASTEXITCODE -ne 0) {exit $LASTEXITCODE}
}
$binary=Join-Path $projectRoot 'src-tauri\target\release\simplelexeditor.exe'
$loader=Join-Path $projectRoot 'src-tauri\resources\WebView2Loader.dll'
$license=Join-Path $projectRoot 'LICENSE'
$notices=Join-Path $projectRoot 'THIRD_PARTY_NOTICES.txt'
$tex=Join-Path $projectRoot 'src-tauri\resources\tex-runtime.exe'
& (Join-Path $projectRoot "scripts\build\prepare-tex.ps1")
if($LASTEXITCODE -ne 0){throw 'TeX-Umgebung konnte nicht vorbereitet werden.'}
$version=(Get-Content -LiteralPath (Join-Path $projectRoot 'src-tauri\tauri.conf.json') -Raw|ConvertFrom-Json).version
$installer=Join-Path $projectRoot "src-tauri\target\release\bundle\nsis\SimpleLexEditor_${version}_x64-setup.exe"
$installerTemplate=Join-Path $projectRoot 'src-tauri\target\release\nsis\x64\installer.nsi'
foreach($file in @($binary,$loader,$installer,$installerTemplate,$license,$notices,$tex)){if(-not(Test-Path -LiteralPath $file)){throw "Release-Datei fehlt: $file"}}
if(-not ([IO.File]::ReadAllText($installerTemplate)).Contains('"/oname=LICENSE"')){throw 'Der Installer muss mit der Projektlizenz neu gebaut werden.'}
if((Get-Item -LiteralPath $binary).VersionInfo.ProductVersion -ne $version){throw 'Die Programmversion stimmt nicht mit der Release-Konfiguration überein.'}
$binarySignature=Get-AuthenticodeSignature -LiteralPath $binary
$installerSignature=Get-AuthenticodeSignature -LiteralPath $installer
$hash=(Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLowerInvariant()
$verificationPath=Join-Path $projectRoot '.tools\release-verification.json'
$verified=$false
if(Test-Path -LiteralPath $verificationPath){$verification=Get-Content -LiteralPath $verificationPath -Raw|ConvertFrom-Json;$verified=$verification.passed -and $verification.sha256 -eq $hash -and $verification.version -eq $version -and $verification.scientific -and $verification.bundledTeX}
if($Production){
  if($binarySignature.Status -ne 'Valid' -or $installerSignature.Status -ne 'Valid'){throw 'Öffentliche Freigabe gestoppt: Programm und Installer benötigen eine gültige Authenticode-Signatur des Herausgebers. Der unsignierte Kandidat kann ohne -Production lokal geprüft werden.'}
  if(-not $verified){throw 'Öffentliche Freigabe gestoppt: Die aktuelle Programmdatei wurde noch nicht mit native-check.ps1 -IncludeScientific geprüft.'}
  & npm.cmd audit
  if($LASTEXITCODE -ne 0){throw 'npm-Sicherheitsprüfung fehlgeschlagen.'}
  & node (Join-Path $projectRoot 'scripts\checks\audit-rust.mjs')
  if($LASTEXITCODE -ne 0){throw 'Rust-Sicherheitsprüfung fehlgeschlagen.'}
}
$releaseRoot=Join-Path $projectRoot 'release'
$portableRoot=Join-Path $releaseRoot 'SimpleLexEditor-portable'
$stageRoot=Join-Path $projectRoot ('.tools\release-stage\'+[guid]::NewGuid().ToString('N'))
$stagePortable=Join-Path $stageRoot 'SimpleLexEditor-portable'
New-Item -ItemType Directory -Path $stagePortable -Force|Out-Null
New-Item -ItemType Directory -Path $portableRoot -Force|Out-Null
Copy-Item -LiteralPath $binary -Destination (Join-Path $stagePortable 'simplelexeditor.exe')
Copy-Item -LiteralPath $loader -Destination (Join-Path $stagePortable 'WebView2Loader.dll')
Copy-Item -LiteralPath $license -Destination (Join-Path $stagePortable 'LICENSE')
Copy-Item -LiteralPath $notices -Destination (Join-Path $stagePortable 'THIRD_PARTY_NOTICES.txt')
Copy-Item -LiteralPath $tex -Destination (Join-Path $stagePortable 'tex-runtime.exe')
@"
SimpleLexEditor $version

Start: simplelexeditor.exe doppelklicken. WebView2Loader.dll muss daneben liegen.
Unterstuetzt: Windows 10/11 x64 mit Microsoft Edge WebView2 Runtime.
LaTeX, BibTeX, Biber, Schriften und die volle TeX-Live-Paketsammlung sind dabei.
Die portable Ausgabe entpackt tex-runtime.exe automatisch beim ersten
Start in den SimpleLexEditor-Benutzerdatenordner. Kein TeX-Download erforderlich.
Fuer die vollstaendige Offline-Installation inklusive WebView2 verwende
SimpleLexEditor-Setup.exe. Der Installer richtet alles automatisch ein.

Projektdateien bleiben lokal. Entwuerfe, Versionsverlauf und Compilerdateien
liegen im Projektordner .roxena. Eine zusaetzliche externe Datensicherung
bleibt sinnvoll. ZIP-Projektarchive enthalten die Dokumente und Ressourcen,
keine lokalen Sicherungen oder Compilerdateien.

Updates: SimpleLexEditor schliessen und den neueren Installer aus derselben
vertrauenswuerdigen Bezugsquelle starten. Dokumente werden nicht deinstalliert.
Automatische Online-Updates sind in dieser Version nicht eingerichtet.

Lizenz und Drittanbieterhinweise stehen in LICENSE und THIRD_PARTY_NOTICES.txt.

Strg+Enter: kompilieren | Strg+S: speichern | Strg+K: Befehle
Strg+P: Datei oeffnen | Strg+J: Probleme und Protokoll
"@ | Set-Content -LiteralPath (Join-Path $stagePortable 'LIESMICH.txt') -Encoding utf8
# Package only the allowlisted files. Existing portable folders can contain a
# user's own documents and must never become inputs to a downloadable archive.
$portableFiles=@('simplelexeditor.exe','WebView2Loader.dll','LICENSE','THIRD_PARTY_NOTICES.txt','LIESMICH.txt','tex-runtime.exe')
foreach($name in $portableFiles){Copy-Item -LiteralPath (Join-Path $stagePortable $name) -Destination (Join-Path $portableRoot $name) -Force}
$stagedZip=Join-Path $stageRoot 'SimpleLexEditor-portable.zip'
Add-Type -AssemblyName System.IO.Compression
$zipStream=[IO.File]::Open($stagedZip,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
$archive=$null
try {
  $archive=[IO.Compression.ZipArchive]::new($zipStream,[IO.Compression.ZipArchiveMode]::Create,$false)
  foreach($name in $portableFiles){
    # ZIP paths use forward slashes even when packaged by Windows PowerShell.
    $compression=if($name -eq 'tex-runtime.exe'){[IO.Compression.CompressionLevel]::NoCompression}else{[IO.Compression.CompressionLevel]::Optimal}
    $entry=$archive.CreateEntry(('SimpleLexEditor-portable/'+$name),$compression)
    $entryStream=$entry.Open()
    $sourceStream=$null
    try {$sourceStream=[IO.File]::OpenRead((Join-Path $stagePortable $name));$sourceStream.CopyTo($entryStream)}
    finally {if($sourceStream){$sourceStream.Dispose()};$entryStream.Dispose()}
  }
} finally {if($archive){$archive.Dispose()};$zipStream.Dispose()}
Copy-Item -LiteralPath $stagedZip -Destination (Join-Path $releaseRoot 'SimpleLexEditor-portable.zip') -Force
Copy-Item -LiteralPath $installer -Destination (Join-Path $releaseRoot 'SimpleLexEditor-Setup.exe') -Force
$checksums=@('SimpleLexEditor-Setup.exe','SimpleLexEditor-portable.zip')|ForEach-Object{$digest=Get-FileHash -LiteralPath (Join-Path $releaseRoot $_) -Algorithm SHA256;"$($digest.Hash.ToLowerInvariant())  $_"}
$checksums|Set-Content -LiteralPath (Join-Path $releaseRoot 'SHA256SUMS.txt') -Encoding ascii
@{version=$version;createdAt=[DateTime]::UtcNow.ToString('o');channel=$(if($Production){'production'}else{'candidate'});platform='windows-x64';binarySha256=$hash;nativeVerification=[bool]$verified;binarySignature=$binarySignature.Status.ToString();installerSignature=$installerSignature.Status.ToString();automaticUpdates=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $releaseRoot 'release-manifest.json') -Encoding utf8
Write-Output "Release bereit: $releaseRoot (Version $version, Produktionsfreigabe: $Production)"
