param([string]$Binary='src-tauri\target\release\simplelexeditor.exe',[switch]$UseDist,[string]$Script='native-compiler-fixes.mjs')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location -LiteralPath $projectRoot
$binaryPath=(Resolve-Path -LiteralPath $Binary).Path
if (-not $binaryPath.StartsWith($projectRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) {throw 'The test binary must be inside the SimpleLexEditor workspace.'}
$client=[Net.Sockets.TcpClient]::new()
try {if ($client.ConnectAsync('127.0.0.1',9237).Wait(300) -and $client.Connected) {throw 'Port 9237 is already in use.'}} catch [AggregateException] {} finally {$client.Dispose()}
$runRoot=Join-Path $projectRoot ('.tools\compiler-fixes-session\'+[guid]::NewGuid().ToString('N'))
$bootstrap=Join-Path $runRoot 'Bootstrap'
New-Item -ItemType Directory -Path $bootstrap -Force | Out-Null
[IO.File]::WriteAllText((Join-Path $bootstrap 'main.tex'),"\documentclass{article}`n\begin{document}`nCompiler repair verification.`n\end{document}`n",[Text.UTF8Encoding]::new($false))
$oldProfile=$env:WEBVIEW2_USER_DATA_FOLDER
$oldArguments=$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
$oldPort=$env:SIMPLELEXEDITOR_TEST_PORT
$oldDist=$env:SIMPLELEXEDITOR_TEST_DIST
$testProcess=$null
try {
  $env:WEBVIEW2_USER_DATA_FOLDER=Join-Path $runRoot 'WebView'
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9237'
  $env:SIMPLELEXEDITOR_TEST_PORT='9237'
  $env:SIMPLELEXEDITOR_TEST_DIST=if($UseDist){'1'}else{$null}
  $testProcess=Start-Process -FilePath $binaryPath -WorkingDirectory (Split-Path -Parent $binaryPath) -ArgumentList @('--project',('"{0}"' -f $bootstrap)) -WindowStyle Hidden -PassThru
  $ready=$false
  for($attempt=0;$attempt -lt 60;$attempt++) {
    try {$tabs=Invoke-RestMethod -Uri 'http://127.0.0.1:9237/json/list' -TimeoutSec 1;if($tabs | Where-Object url -Like '*tauri.localhost*') {$ready=$true;break}} catch {}
    Start-Sleep -Milliseconds 500
  }
  if(-not $ready) {throw 'Native test window did not start.'}
  & node (Join-Path $PSScriptRoot $Script)
  if($LASTEXITCODE -ne 0) {throw 'Native compiler-fix check failed.'}
} finally {
  if($testProcess) {
    $remaining=Get-Process -Id $testProcess.Id -ErrorAction SilentlyContinue
    if($remaining -and $remaining.Path -eq $binaryPath) {
      $remaining.CloseMainWindow() | Out-Null
      if(-not $remaining.WaitForExit(5000)){Stop-Process -Id $testProcess.Id -ErrorAction SilentlyContinue}
    }
  }
  $env:WEBVIEW2_USER_DATA_FOLDER=$oldProfile
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=$oldArguments
  $env:SIMPLELEXEDITOR_TEST_PORT=$oldPort
  $env:SIMPLELEXEDITOR_TEST_DIST=$oldDist
}
