param([string]$Binary='src-tauri\target\release\simplelexeditor.exe',[switch]$IncludeScientific,[int]$Port=9224)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location -LiteralPath $projectRoot
$binaryPath=(Resolve-Path -LiteralPath $Binary).Path
if (-not $binaryPath.StartsWith($projectRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) {throw 'Die Testdatei muss im SimpleLexEditor-Arbeitsordner liegen.'}
$client=[Net.Sockets.TcpClient]::new()
try {if ($client.ConnectAsync('127.0.0.1',$Port).Wait(300) -and $client.Connected) {throw "Port $Port ist bereits belegt. Die Testinstanz wurde nicht gestartet."}} catch [AggregateException] {} finally {$client.Dispose()}
$runRoot=Join-Path $projectRoot ('.tools\native-verification\'+[guid]::NewGuid().ToString('N'))
$bootstrap=Join-Path $runRoot 'Bootstrap'
New-Item -ItemType Directory -Path $bootstrap -Force | Out-Null
[IO.File]::WriteAllText((Join-Path $bootstrap 'main.tex'),"\documentclass{article}`n\begin{document}`nSimpleLexEditor verification.`n\end{document}`n",[Text.UTF8Encoding]::new($false))
$oldProfile=$env:WEBVIEW2_USER_DATA_FOLDER
$oldArguments=$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
$oldDist=$env:SIMPLELEXEDITOR_TEST_DIST
$oldPort=$env:SIMPLELEXEDITOR_TEST_PORT
$oldPath=$env:Path
$oldTeXConfig=$env:TEXMFCNF
$testProcess=$null
try {
  $env:WEBVIEW2_USER_DATA_FOLDER=Join-Path $runRoot 'WebView'
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=$Port"
  $env:SIMPLELEXEDITOR_TEST_DIST=$null
  $env:SIMPLELEXEDITOR_TEST_PORT="$Port"
  # The child cannot find a developer's TeX installation through PATH, and
  # must ignore a foreign TeX configuration for its bundled compiler processes.
  $env:Path="$env:SystemRoot\System32;$env:SystemRoot"
  $env:TEXMFCNF=Join-Path $runRoot 'foreign-tex-config-does-not-exist'
  $testProcess=Start-Process -FilePath $binaryPath -WorkingDirectory (Split-Path -Parent $binaryPath) -ArgumentList @('--project',('"{0}"' -f $bootstrap)) -WindowStyle Hidden -PassThru
  $env:Path=$oldPath
  $env:TEXMFCNF=$oldTeXConfig
  $ready=$false
  for ($attempt=0;$attempt -lt 60;$attempt++) {
    try {$tabs=Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/list" -TimeoutSec 1;if ($tabs | Where-Object url -Like '*tauri.localhost*') {$ready=$true;break}} catch {}
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready){throw 'Die native Testinstanz wurde nicht bereit.'}
  foreach ($script in @('native-bundled.mjs','native-workspace.mjs','native-production.mjs','native-compiler-fixes.mjs','native-automatic-repairs.mjs')) {
    & node (Join-Path $PSScriptRoot $script)
    if ($LASTEXITCODE -ne 0){throw "$script ist fehlgeschlagen."}
  }
  if ($IncludeScientific) {
    foreach ($script in @('native-project-files.mjs','native-science.mjs','native-research.mjs','native-engines.mjs')) {
      & node (Join-Path $PSScriptRoot $script)
      if ($LASTEXITCODE -ne 0){throw "$script ist fehlgeschlagen."}
    }
  }
  $report=@{version=(Get-Content -LiteralPath package.json -Raw|ConvertFrom-Json).version;binary=$binaryPath;sha256=(Get-FileHash -LiteralPath $binaryPath -Algorithm SHA256).Hash.ToLowerInvariant();verifiedAt=[DateTime]::UtcNow.ToString('o');passed=$true;scientific=[bool]$IncludeScientific;bundledTeX=$true}
  $report|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $projectRoot '.tools\release-verification.json') -Encoding utf8
  Write-Output 'PASS native application verification'
} finally {
  if ($testProcess) {$remaining=Get-Process -Id $testProcess.Id -ErrorAction SilentlyContinue;if ($remaining -and $remaining.Path -eq $binaryPath){Stop-Process -Id $testProcess.Id -ErrorAction SilentlyContinue}}
  $env:WEBVIEW2_USER_DATA_FOLDER=$oldProfile
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=$oldArguments
  $env:SIMPLELEXEDITOR_TEST_DIST=$oldDist
  $env:SIMPLELEXEDITOR_TEST_PORT=$oldPort
  $env:Path=$oldPath
  $env:TEXMFCNF=$oldTeXConfig
}
