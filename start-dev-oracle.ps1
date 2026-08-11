param(
  # Ambiente Oracle a subir (prefixo dos objetos no schema único). Padrão: DEV.
  [string]$Prefix = 'NEXUS_DEV_'
)

$ErrorActionPreference = 'Stop'

Set-Location $PSScriptRoot

# Sobe backend (Oracle) + frontend (Vite) com um comando, encerrando antes qualquer
# sessão de dev anterior — inclusive um backend Neon ativo, já que ambos escutam a
# mesma porta 4001 (derrubar por porta cobre os dois providers).
#
# Pré-requisito: a conexão Oracle (ORACLE_CONNECTION_STRING, ORACLE_USER,
# ORACLE_PASSWORD) precisa estar no .env (fora do git). O schema do prefixo já deve
# existir — criado por `npm run db:migrate` (por isso DATABASE_AUTO_SCHEMA=false aqui).

$backendPort = 4001
$webPort = 5200

# Padrões de linha de comando que identificam nossos processos de dev. O backend Oracle
# roda o mesmo entrypoint do Neon (dev-database.mjs / dist/src/main.js).
$backendPattern = 'dist\\src\\main\.js|dev-(neon|database)\.mjs'
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

  # 2) Qualquer processo ainda escutando nas portas usadas (cobre backend Neon OU Oracle).
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

# Lê um valor não-vazio do .env (fora do git). Retorna $null se ausente/vazio.
function Get-DotEnvValue {
  param([string]$Path, [string]$Key)
  if (-not (Test-Path $Path)) { return $null }
  $match = Select-String -Path $Path -Pattern "^\s*$Key\s*=" -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $match) { return $null }
  $value = ($match.Line -replace "^\s*$Key\s*=", '').Trim().Trim('"').Trim("'")
  if ([string]::IsNullOrWhiteSpace($value)) { return $null }
  return $value
}

# --- Pré-checagem: conexão Oracle configurada no .env ---
$envFile = Join-Path $PSScriptRoot '.env'
$connect = Get-DotEnvValue $envFile 'ORACLE_CONNECTION_STRING'
if (-not $connect) { $connect = Get-DotEnvValue $envFile 'ORACLE_CONNECT_STRING' }
$user = Get-DotEnvValue $envFile 'ORACLE_USER'
$password = Get-DotEnvValue $envFile 'ORACLE_PASSWORD'
if (-not $connect -or -not $user -or -not $password) {
  Write-Error @"
Conexão Oracle ausente no .env. Adicione (fora do git):
  ORACLE_CONNECTION_STRING=host:porta/servico
  ORACLE_USER=...
  ORACLE_PASSWORD=...
Depois rode novamente. Para criar o schema do prefixo: npm run db:migrate.
"@
}

Write-Host "== Encerrando sessoes anteriores (backend Neon/Oracle + web) =="
Stop-DevProcesses -CommandLinePattern $backendPattern -Ports @($backendPort) -Label 'backend'
Stop-DevProcesses -CommandLinePattern $webPattern -Ports @($webPort) -Label 'web'

# --- Força o provider Oracle e o ambiente para o processo do backend ---
# Definir na sessão faz o filho herdar; dotenv (loadEnv) não sobrescreve variáveis já
# presentes, então isto vence o DATABASE_PROVIDER do .env.
$env:DATABASE_PROVIDER = 'oracle'
$env:ORACLE_OBJECT_PREFIX = $Prefix
# Schema já criado por db:migrate — só valida no boot (mais rápido que reaplicar o DDL).
$env:DATABASE_AUTO_SCHEMA = 'false'

Write-Host "== Build =="
npm run build

Write-Host "== Subindo backend (Oracle, prefixo $Prefix) =="
$backend = Start-Process -WindowStyle Hidden `
  -FilePath npm.cmd `
  -ArgumentList 'run','start:db' `
  -WorkingDirectory $PSScriptRoot `
  -RedirectStandardOutput "$PSScriptRoot\.tmp-dev-backend.log" `
  -RedirectStandardError "$PSScriptRoot\.tmp-dev-backend.err" `
  -PassThru

$backendReady = $false
$healthUrl = "http://127.0.0.1:$backendPort/health"

# A primeira request faz o seed do runtime (varias idas ao Oracle), entao o timeout
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

Write-Host "Backend pronto em $healthUrl (Oracle · $Prefix)"

Write-Host "== Subindo web (Vite) =="
$web = Start-Process -WindowStyle Hidden `
  -FilePath npm.cmd `
  -ArgumentList 'run','web:dev','--','--host','127.0.0.1','--port',"$webPort",'--strictPort' `
  -WorkingDirectory $PSScriptRoot `
  -RedirectStandardOutput "$PSScriptRoot\.tmp-dev-web.log" `
  -RedirectStandardError "$PSScriptRoot\.tmp-dev-web.err" `
  -PassThru

Write-Host ""
Write-Host "Backend PID: $($backend.Id)  ->  http://127.0.0.1:$backendPort  (Oracle · $Prefix)"
Write-Host "Web PID:     $($web.Id)  ->  http://127.0.0.1:$webPort"
Write-Host "(Ctrl+C encerra este script; os processos continuam ate serem encerrados na proxima execucao.)"

Wait-Process -Id $backend.Id, $web.Id
