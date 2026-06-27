param(
    [string]$RepositoryUrl = "https://github.com/V-tal/vtal-architecture-playbook.git",
    [string]$Branch = "main",
    [string]$RemoteAdrsPath = "docs/04-decisions",
    [string]$WorkingDirectory = ".tmp/vtal-architecture-playbook",
    [ValidateSet("table", "json")]
    [string]$OutputFormat = "table",
    [switch]$KeepClone,
    [string]$ExportPath
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "[fetch-remote-adrs] $Message"
}

function Ensure-Git {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw "Git não encontrado no PATH. Instale o Git para continuar."
    }
}

function Resolve-WorkspacePath {
    param([string]$Path)
    if ([System.IO.Path]::IsPathRooted($Path)) {
        return $Path
    }
    return (Join-Path (Get-Location) $Path)
}

Ensure-Git

$clonePath = Resolve-WorkspacePath -Path $WorkingDirectory

if (Test-Path $clonePath) {
    Write-Step "Removendo diretório temporário existente: $clonePath"
    Remove-Item -Path $clonePath -Recurse -Force
}

Write-Step "Clonando repositório remoto de ADRs (shallow + sparse)"
git clone --depth 1 --branch $Branch --filter=blob:none --sparse $RepositoryUrl $clonePath | Out-Null

Push-Location $clonePath
try {
    Write-Step "Aplicando sparse-checkout para '$RemoteAdrsPath'"
    git sparse-checkout set $RemoteAdrsPath

    $resolvedAdrsPath = Join-Path $clonePath $RemoteAdrsPath
    if (-not (Test-Path $resolvedAdrsPath)) {
        throw "Caminho remoto '$RemoteAdrsPath' não encontrado no repositório clonado."
    }

    Write-Step "Coletando arquivos Markdown recursivamente"
    $adrs = Get-ChildItem -Path $resolvedAdrsPath -Recurse -File -Filter *.md |
        Sort-Object FullName |
        ForEach-Object {
            [PSCustomObject]@{
                Name = $_.Name
                FullPath = $_.FullName
                RelativePath = $_.FullName.Substring($clonePath.Length + 1).Replace("\", "/")
                Url = ("https://github.com/V-tal/vtal-architecture-playbook/blob/{0}/{1}" -f $Branch, $_.FullName.Substring($clonePath.Length + 1).Replace("\", "/"))
            }
        }

    if ($adrs.Count -eq 0) {
        Write-Step "Nenhum arquivo .md encontrado em '$RemoteAdrsPath'."
    }

    if ($ExportPath) {
        $exportAbsolute = Resolve-WorkspacePath -Path $ExportPath
        $exportDir = Split-Path -Path $exportAbsolute -Parent
        if ($exportDir -and -not (Test-Path $exportDir)) {
            New-Item -ItemType Directory -Path $exportDir -Force | Out-Null
        }
        $adrs | ConvertTo-Json -Depth 4 | Set-Content -Path $exportAbsolute -Encoding UTF8
        Write-Step "Manifest exportado em: $exportAbsolute"
    }

    switch ($OutputFormat) {
        "json" { $adrs | ConvertTo-Json -Depth 4 }
        default { $adrs | Format-Table Name, RelativePath, Url -AutoSize }
    }
}
finally {
    Pop-Location
    if (-not $KeepClone -and (Test-Path $clonePath)) {
        Write-Step "Limpando diretório temporário: $clonePath"
        Remove-Item -Path $clonePath -Recurse -Force
    }
}
