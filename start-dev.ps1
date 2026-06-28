$ErrorActionPreference = 'Stop'

Set-Location $PSScriptRoot
npm run build
npm run dev:sqlite
