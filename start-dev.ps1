param(
  # Ambiente Oracle a subir (prefixo dos objetos no schema único). Sem parâmetros, usa NEXUS_DEV_.
  # Exemplo: .\start-dev.ps1 -Prefix NX_DEV1_
  [string]$Prefix = 'NEXUS_DEV_',
  # Numerador da instância, para subir vários ambientes ao mesmo tempo. Soma às portas base:
  # backend 4001+N, web 5200+N. Sem o numerador (0), comportamento original (4001/5200).
  # Exemplo: .\start-dev.ps1 NX_DEMO_ 2  ->  backend 4003, web 5202
  [ValidateRange(0, 99)]
  [int]$Instance = 0,
  # Aplica o schema (db:migrate) no prefixo antes de subir. Use quando o schema mudou
  # (ex.: colunas/tabelas novas). Sem o flag, o boot só valida a versão — mais rápido.
  [switch]$Migrate
)

$ErrorActionPreference = 'Stop'

Set-Location $PSScriptRoot

# Identificadores Oracle não são parametrizáveis; validar antes de parar processos ou iniciar build.
$Prefix = $Prefix.Trim().ToUpperInvariant()
if ($Prefix -notmatch '^[A-Za-z][A-Za-z0-9_]*_$') {
  Write-Error 'Prefixo Oracle inválido. Use letras, números ou _, começando por letra e terminando em _ (ex.: NX_DEV1_).'
}

# Sobe backend Oracle e frontend Vite com um comando, encerrando antes a sessão anterior da
# MESMA instância (mesmo numerador). Instâncias com numeradores diferentes convivem: cada uma
# tem suas portas, seus logs e seu arquivo de PIDs (.tmp-dev-<N>.pids).
#
# Pré-requisito: a conexão Oracle (ORACLE_CONNECTION_STRING, ORACLE_USER,
# ORACLE_PASSWORD) precisa estar no .env (fora do git). O schema do prefixo já deve
# existir — criado por `npm run db:migrate` (por isso DATABASE_AUTO_SCHEMA=false aqui).
# Passe -Migrate para aplicar o schema automaticamente antes de subir (ver abaixo).

$backendPort = 4001 + $Instance
$webPort = 5200 + $Instance

# Instância 0 mantém os nomes de log históricos; as demais ganham sufixo.
$logSuffix = if ($Instance -eq 0) { '' } else { "-$Instance" }
$backendLog = "$PSScriptRoot\.tmp-dev-backend$logSuffix.log"
$backendErr = "$PSScriptRoot\.tmp-dev-backend$logSuffix.err"
$webLog = "$PSScriptRoot\.tmp-dev-web$logSuffix.log"
$webErr = "$PSScriptRoot\.tmp-dev-web$logSuffix.err"
$stateFile = "$PSScriptRoot\.tmp-dev-$Instance.pids"

# Padrões de linha de comando que identificam nossos processos de desenvolvimento.
$backendPattern = 'dist\\src\\main\.js|dev-database\.mjs'
$webPattern = 'web:dev|web\\vite\.config\.mjs|vite\.js'

# PIDs da árvore de processos (raiz + descendentes) a partir de um snapshot de Win32_Process.
function Get-ProcessTreeIds {
  param([int]$RootId, [object[]]$Processes)
  $ids = [System.Collections.Generic.List[int]]::new()
  $queue = [System.Collections.Generic.Queue[int]]::new()
  $queue.Enqueue($RootId)
  while ($queue.Count -gt 0) {
    $current = $queue.Dequeue()
    if ($ids.Contains($current)) { continue }
    $ids.Add($current)
    foreach ($child in ($Processes | Where-Object { $_.ParentProcessId -eq $current })) {
      $queue.Enqueue([int]$child.ProcessId)
    }
  }
  return $ids
}

# PIDs raiz registrados num arquivo de estado que ainda são os mesmos processos. O instante de
# criação protege contra reuso de PID pelo Windows depois que a sessão original morreu.
function Get-LiveStateRoots {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return @() }
  try {
    $state = Get-Content $Path -Raw | ConvertFrom-Json
  } catch {
    return @()
  }
  $roots = @()
  foreach ($entry in @($state.backend, $state.web)) {
    if (-not $entry) { continue }
    $proc = Get-Process -Id $entry.pid -ErrorAction SilentlyContinue
    if ($proc -and $proc.StartTime.ToUniversalTime().Ticks -eq [long]$entry.startTicks) {
      $roots += [int]$entry.pid
    }
  }
  return $roots
}

function Save-InstanceState {
  param([System.Diagnostics.Process]$Backend, [System.Diagnostics.Process]$Web)
  $toEntry = {
    param($proc)
    if (-not $proc) { return $null }
    @{ pid = $proc.Id; startTicks = $proc.StartTime.ToUniversalTime().Ticks }
  }
  @{
    instance = $Instance
    prefix = $Prefix
    backendPort = $backendPort
    webPort = $webPort
    backend = & $toEntry $Backend
    web = & $toEntry $Web
  } | ConvertTo-Json | Set-Content -Path $stateFile -Encoding utf8
}

function Stop-DevInstance {
  $processes = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
  $protected = [System.Collections.Generic.HashSet[int]]::new()
  $protected.Add($PID) | Out-Null

  # Árvores das outras instâncias registradas — nunca são encerradas por esta execução.
  $otherStates = Get-ChildItem -Path $PSScriptRoot -Filter '.tmp-dev-*.pids' -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -ne $stateFile }
  foreach ($file in $otherStates) {
    foreach ($root in (Get-LiveStateRoots $file.FullName)) {
      foreach ($id in (Get-ProcessTreeIds $root $processes)) { $protected.Add($id) | Out-Null }
    }
  }

  $targets = [System.Collections.Generic.HashSet[int]]::new()

  # 1) Árvore da sessão anterior desta instância (npm.cmd -> npm -> node).
  foreach ($root in (Get-LiveStateRoots $stateFile)) {
    foreach ($id in (Get-ProcessTreeIds $root $processes)) { $targets.Add($id) | Out-Null }
  }

  # 2) Instância 0: também varre por linha de comando, para pegar sessões sem arquivo de
  #    estado (anteriores a este suporte ou órfãs). Instâncias registradas ficam protegidas.
  if ($Instance -eq 0) {
    $processes |
      Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match "$backendPattern|$webPattern" } |
      ForEach-Object { $targets.Add([int]$_.ProcessId) | Out-Null }
  }

  # 3) Qualquer processo ainda escutando nas portas desta instância.
  foreach ($port in @($backendPort, $webPort)) {
    $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($listenerPid in ($listeners.OwningProcess | Select-Object -Unique)) {
      $targets.Add([int]$listenerPid) | Out-Null
    }
  }

  foreach ($id in $targets) {
    if ($protected.Contains($id)) { continue }
    if (-not (Get-Process -Id $id -ErrorAction SilentlyContinue)) { continue }
    Write-Host "Encerrando processo anterior da instancia $Instance (PID $id)"
    Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
  }

  # 4) Aguarda as portas ficarem livres (até ~10s).
  foreach ($port in @($backendPort, $webPort)) {
    for ($i = 0; $i -lt 20; $i++) {
      if (-not (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) { break }
      Start-Sleep -Milliseconds 500
    }
  }

  Remove-Item -Path $stateFile -Force -ErrorAction SilentlyContinue
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

Write-Host "== Encerrando sessao anterior da instancia $Instance (backend $backendPort + web $webPort) =="
Stop-DevInstance

# --- Define o namespace Oracle e as portas para os processos filhos ---
# Definir na sessão faz o filho herdar; dotenv não sobrescreve variáveis já presentes.
$env:ORACLE_OBJECT_PREFIX = $Prefix
# Schema já criado por db:migrate — só valida no boot (mais rápido que reaplicar o DDL).
$env:DATABASE_AUTO_SCHEMA = 'false'
# Porta do backend desta instância (sobrepõe PORT do .env) e alvo do proxy do Vite.
$env:PORT = "$backendPort"
$env:NEXUS_BACKEND_PORT = "$backendPort"

Write-Host "== Build =="
npm run build

# Com -Migrate, aplica o schema no prefixo antes de subir. Reaproveita o build acima
# (chama o script direto, sem o rebuild embutido em `npm run db:migrate`). O
# migrate-database força DATABASE_AUTO_SCHEMA=true internamente, então o 'false' da
# sessão não bloqueia a aplicação do DDL.
if ($Migrate) {
  Write-Host "== Migrando schema Oracle ($Prefix) =="
  node dist/src/scripts/migrate-database.js
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Falha ao migrar o schema Oracle ($Prefix). Abortando antes de subir o backend."
  }
}

$backend = $null
$web = $null
$backendLogs = "$(Split-Path $backendLog -Leaf) e $(Split-Path $backendErr -Leaf)"
$webLogs = "$(Split-Path $webLog -Leaf) e $(Split-Path $webErr -Leaf)"

try {
  Write-Host "== Subindo backend (Oracle, prefixo $Prefix, porta $backendPort) =="
  $backend = Start-Process -WindowStyle Hidden `
    -FilePath npm.cmd `
    -ArgumentList 'run','start:db' `
    -WorkingDirectory $PSScriptRoot `
    -RedirectStandardOutput $backendLog `
    -RedirectStandardError $backendErr `
    -PassThru
  Save-InstanceState -Backend $backend -Web $null

  $backendReady = $false
  $healthUrl = "http://127.0.0.1:$backendPort/health"

  # A primeira request faz o seed do runtime (varias idas ao Oracle), entao o timeout
  # por tentativa e generoso e a janela total e de ~3min.
  for ($attempt = 1; $attempt -le 60; $attempt++) {
    if ($backend.HasExited) {
      Write-Error "Backend saiu antes de ficar pronto. Veja $backendLogs."
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
    Write-Error "Backend nao ficou pronto em $healthUrl. Veja $backendLogs."
  }

  Write-Host "Backend pronto em $healthUrl (Oracle · $Prefix)"

  Write-Host "== Subindo web (Vite, porta $webPort) =="
  $web = Start-Process -WindowStyle Hidden `
    -FilePath npm.cmd `
    -ArgumentList 'run','web:dev','--','--host','127.0.0.1','--port',"$webPort",'--strictPort' `
    -WorkingDirectory $PSScriptRoot `
    -RedirectStandardOutput $webLog `
    -RedirectStandardError $webErr `
    -PassThru
  Save-InstanceState -Backend $backend -Web $web

  Write-Host ""
  Write-Host "Instancia $Instance"
  Write-Host "Backend PID: $($backend.Id)  ->  http://127.0.0.1:$backendPort  (Oracle · $Prefix)"
  Write-Host "Web PID:     $($web.Id)  ->  http://127.0.0.1:$webPort"
  Write-Host "(Ctrl+C encerra backend e web desta instancia.)"

  while (-not $backend.HasExited -and -not $web.HasExited) {
    Start-Sleep -Milliseconds 500
  }

  if ($backend.HasExited) {
    Write-Warning "Backend saiu. Veja $backendLogs."
  }
  if ($web.HasExited) {
    Write-Warning "Web saiu. Veja $webLogs."
  }
} finally {
  Write-Host "== Encerrando instancia $Instance =="
  Stop-DevInstance
}
