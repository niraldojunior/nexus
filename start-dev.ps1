$ErrorActionPreference = 'Stop'

Set-Location $PSScriptRoot

# Sobe backend (Neon) e frontend (Vite) com um único comando, garantindo que
# qualquer sessão anterior seja encerrada antes — evita "EADDRINUSE" quando
# sobram processos node travados de execuções passadas.

$backendPort = 4001
$webPort = 5200

# Padrões de linha de comando que identificam nossos processos de dev.
$backendPattern = 'dist\\src\\main\.js|dev-neon\.mjs'
$webPattern = 'web:dev|web\\vite\.config\.mjs|vite\.js'

function Stop-DevProcesses {
  param(
    [string]$CommandLinePattern,
    [int[]]$Ports,
    [string]$Label
  )

  # 1) Processos node identificados pela linha de comando.
  $procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match $CommandLinePattern }
  foreach ($proc in $procs) {
    Write-Host "Encerrando $Label anterior (PID $($proc.ProcessId))"
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
  }

  # 2) Qualquer processo ainda escutando nas portas usadas.
  foreach ($port in $Ports) {
    $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($listenerPid in ($listeners.OwningProcess | Select-Object -Unique)) {
      Write-Host "Liberando porta $port (PID $listenerPid)"
      Stop-Process -Id $listenerPid -Force -ErrorAction SilentlyContinue
    }
  }

  # 3) Aguarda as portas ficarem livres (até ~10s).
  foreach ($port in $Ports) {
    for ($i = 0; $i -lt 20; $i++) {
      if (-not (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) { break }
      Start-Sleep -Milliseconds 500
    }
  }
}

Write-Host "== Encerrando sessoes anteriores (backend + web) =="
Stop-DevProcesses -CommandLinePattern $backendPattern -Ports @($backendPort) -Label 'backend'
Stop-DevProcesses -CommandLinePattern $webPattern -Ports @($webPort) -Label 'web'

Write-Host "== Build =="
npm run build

Write-Host "== Subindo backend (Neon) =="
$backend = Start-Process -WindowStyle Hidden `
  -FilePath npm.cmd `
  -ArgumentList 'run','start:neon' `
  -WorkingDirectory $PSScriptRoot `
  -RedirectStandardOutput "$PSScriptRoot\.tmp-dev-backend.log" `
  -RedirectStandardError "$PSScriptRoot\.tmp-dev-backend.err" `
  -PassThru

$backendReady = $false
$healthUrl = "http://127.0.0.1:$backendPort/health"

# A primeira request faz o seed do runtime (varias idas ao Neon), entao o timeout
# por tentativa e generoso e a janela total e de ~3min.
for ($attempt = 1; $attempt -le 60; $attempt++) {
  if ($backend.HasExited) {
    Write-Error "Backend saiu antes de ficar pronto. Veja .tmp-dev-backend.log e .tmp-dev-backend.err."
  }

  try {
    $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
      $backendReady = $true
      break
    }
  } catch {
    Start-Sleep -Seconds 1
  }
}

if (-not $backendReady) {
  if (-not $backend.HasExited) {
    Stop-Process -Id $backend.Id -Force
  }
  Write-Error "Backend nao ficou pronto em $healthUrl. Veja .tmp-dev-backend.log e .tmp-dev-backend.err."
}

Write-Host "Backend pronto em $healthUrl"

Write-Host "== Subindo web (Vite) =="
$web = Start-Process -WindowStyle Hidden `
  -FilePath npm.cmd `
  -ArgumentList 'run','web:dev','--','--host','127.0.0.1','--port',"$webPort",'--strictPort' `
  -WorkingDirectory $PSScriptRoot `
  -RedirectStandardOutput "$PSScriptRoot\.tmp-dev-web.log" `
  -RedirectStandardError "$PSScriptRoot\.tmp-dev-web.err" `
  -PassThru

Write-Host ""
Write-Host "Backend PID: $($backend.Id)  ->  http://127.0.0.1:$backendPort"
Write-Host "Web PID:     $($web.Id)  ->  http://127.0.0.1:$webPort"
Write-Host "(Ctrl+C encerra este script; os processos continuam ate serem encerrados na proxima execucao.)"

Wait-Process -Id $backend.Id, $web.Id
