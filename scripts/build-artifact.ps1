# ============================================================
# MCinfraTI Radar Security - build-artifact.ps1
# Gera um artefato compactado (.tar.gz) pronto para transportar
# para a VPS e deployar com scripts/deploy-vps.sh.
#
# Uso (PowerShell, na raiz do projeto):
#   powershell -ExecutionPolicy Bypass -File scripts\build-artifact.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\build-artifact.ps1 -OutDir C:\tmp\radar
#
# IMPORTANTE (PowerShell / Windows):
#   * Este script usa apenas ASCII nas mensagens para evitar
#     problemas de encoding (BOM) do PowerShell 5.1.
#   * Usa tar.exe (libarchive), ja presente no Windows 10 1803+.
#   * Nunca inclui o arquivo .env (segredos ficam na VPS).
# ============================================================

[CmdletBinding()]
param(
    [string]$OutDir = 'deploy'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$tar = Get-Command tar.exe -ErrorAction SilentlyContinue
if (-not $tar) {
    throw 'tar.exe nao encontrado. Necessario Windows 10 1803+ (tar do libarchive).'
}

$pkg = Get-Content -Raw (Join-Path $root 'package.json') | ConvertFrom-Json
$ver = $pkg.version
if ([string]::IsNullOrWhiteSpace($ver)) { $ver = 'unknown' }

$rev = 'dirty'
if (Get-Command git.exe -ErrorAction SilentlyContinue) {
    # PS 5.1: redirecionar stderr de binario com EAP='Stop' aborta o script.
    # Isola a chamada com EAP='SilentlyContinue' e usa $LASTEXITCODE.
    $savedEap = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    $out = & git rev-parse --short HEAD 2>&1
    $ErrorActionPreference = $savedEap
    if ($LASTEXITCODE -eq 0 -and $out) {
        $rev = (($out | Out-String).Trim())
    }
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outFile = Join-Path $OutDir "radar-security-$ver-$rev-$stamp.tar.gz"

# Arquivos obrigatorios para o build do Docker na VPS (next + worker).
# Se faltar qualquer um, o deploy falha em 'npm run build:worker' ou na inicializacao.
$required = @(
    'Dockerfile'
    '.dockerignore'
    'docker-compose.prod.yml'
    'package.json'
    'package-lock.json'
    'next.config.ts'
    'tsconfig.json'
    '.env.example'
    'sql/schema.sql'
    'scripts/seed.ts'
    'scripts/deploy-vps.sh'
    'scripts/fix-update.sh'
    'scripts/build-worker.mjs'
    'scripts/set-polyfill.cjs'
    'src/workers/scan.worker.ts'
)

$missing = @()
foreach ($f in $required) {
    if (-not (Test-Path (Join-Path $root $f))) {
        $missing += $f
    }
}
if ($missing.Count -gt 0) {
    throw "Faltam arquivos obrigatorios no projeto: $($missing -join ', ')"
}

if (-not (Test-Path $OutDir)) {
    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
}

Write-Host "==> Artefato: $outFile"

$includes = @(
    'Dockerfile'
    '.dockerignore'
    'docker-compose.yml'
    'docker-compose.prod.yml'
    'package.json'
    'package-lock.json'
    'next.config.ts'
    'next.config.mjs'
    'tsconfig.json'
    'postcss.config.mjs'
    'postcss.config.js'
    'tailwind.config.mjs'
    'tailwind.config.js'
    'tailwind.config.ts'
    '.env.example'
    'ROLLBACK.md'
    'src'
    'public'
    'sql'
    'scripts'
)

# Filtra apenas os arquivos que existem (necessario para configs opcionais).
$existingIncludes = @()
foreach ($f in $includes) {
    if (Test-Path (Join-Path $root $f)) {
        $existingIncludes += $f
    }
}
$includes = $existingIncludes

$excludes = @(
    '--exclude=node_modules'
    '--exclude=.next'
    '--exclude=.git'
    '--exclude=deploy'
    '--exclude=backups'
    '--exclude=server.log'
    '--exclude=*.log'
    '--exclude=*.tar.gz'
    '--exclude=*.tsbuildinfo'
    '--exclude=lint-*.txt'
)

$tarArgs = @('-czf', $outFile) + $excludes + $includes

Write-Host "==> Compactando (exclui: .env, node_modules, .next, .git)..."
& tar.exe @tarArgs
if ($LASTEXITCODE -ne 0) {
    throw ("tar falhou com codigo {0}" -f $LASTEXITCODE)
}

Write-Host '==> Conferindo conteudo do artefato...'
$listing = & tar.exe -tzf $outFile 2>&1
if ($LASTEXITCODE -ne 0) {
    throw 'Falha ao listar o artefato gerado.'
}
$notPacked = @()
foreach ($f in $required) {
    if ($listing -notcontains $f) {
        $notPacked += $f
    }
}
if ($notPacked.Count -gt 0) {
    throw "Artefato gerado sem arquivos obrigatorios: $($notPacked -join ', ')"
}

$sizeMB = [math]::Round((Get-Item $outFile).Length / 1MB, 2)
Write-Host "OK - artefato criado: $outFile ($sizeMB MB)"
Write-Host ''
Write-Host '==> Transporte para a VPS:'
Write-Host "    scp $outFile usuario@vps:/tmp/"
Write-Host '    scp scripts\deploy-vps.sh usuario@vps:/tmp/'
Write-Host '    ssh usuario@vps'
Write-Host "    bash /tmp/deploy-vps.sh /tmp/$(Split-Path -Leaf $outFile)"
Write-Host ''
Write-Host '==> Atualizar uma instalacao EXISTENTE (preserva .env e banco):'
Write-Host '    scp scripts\fix-update.sh usuario@vps:/tmp/'
Write-Host "    bash /tmp/fix-update.sh /tmp/$(Split-Path -Leaf $outFile)"
Write-Host ''
Write-Host '==> Os scripts .sh sao BASH para Linux (nao use o powershell na VPS).'