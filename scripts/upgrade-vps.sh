#!/usr/bin/env bash
# =============================================================
# MCinfraTI Radar Security - Upgrade da stack na VPS
# Versão alvo: V 12.11.0-Build-PANDORA
#
# Uso:
#   bash scripts/upgrade-vps.sh [caminho/do/bundle.zip]
#
# Bundle padrão esperado na raiz do projeto:
#   radar-security-V12.11.0-Build-PANDORA.zip
#
# Fluxo:
#   1) valida pré-requisitos (docker, compose, unzip, curl)
#   2) backup do banco (pg_dump via container) + configs
#   3) aplica o bundle sobre o diretório do projeto
#   4) aplica migrações aditivas (psql idempotente)
#   5) rebuild das imagens e restart (docker compose up -d --build)
#   6) healthcheck e resumo final
#
# O banco (volume radar_data) NÃO é apagado; o backup é somente
# precaução. Para reverter o banco, ver instrução no final da saída.
# =============================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_BUNDLE="${APP_DIR}/radar-security-V12.11.0-Build-PANDORA.zip"
BUNDLE="${1:-${DEFAULT_BUNDLE}}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${APP_DIR}/backups/upgrade-${STAMP}"
APP_VERSION="V 12.11.0-Build-PANDORA"
PORT="${PORT:-3000}"

echo "============================================================="
echo " Radar Security - Upgrade (${APP_VERSION})"
echo " Diretório : ${APP_DIR}"
echo " Bundle    : ${BUNDLE}"
echo " Backup    : ${BACKUP_DIR}"
echo "============================================================="

die()  { echo "[ERRO] $*" >&2; exit 1; }
warn() { echo "[AVISO] $*" >&2; }

# ------------- 1) Pré-requisitos -------------
command -v docker >/dev/null 2>&1  || die "'docker' não encontrado no PATH."
command -v unzip  >/dev/null 2>&1  || die "'unzip' não encontrado (instale com: apt install -y unzip)."
command -v curl   >/dev/null 2>&1  || die "'curl' não encontrado."
docker compose version >/dev/null 2>&1 || docker-compose version >/dev/null 2>&1 \
  || die "Plug-in 'docker compose' indisponível."

[ -f "${BUNDLE}" ] || die "Bundle não encontrado: ${BUNDLE}"
mkdir -p "${BACKUP_DIR}"

# ------------- 2) Backup -------------
echo ""
echo "[1/6] Backup do banco e configurações..."
DB_OK=0
if docker compose ps --services >/dev/null 2>&1; then
  if docker compose exec -T db pg_dump -U radar radar 2>/dev/null | gzip > "${BACKUP_DIR}/radar-db.sql.gz"; then
    DB_OK=1
    echo "      Banco exportado: ${BACKUP_DIR}/radar-db.sql.gz"
  else
    warn "Falha no pg_dump via container 'db'. Continuando (banco intacto)."
  fi
fi
for f in .env .env.local docker-compose.yml docker-compose.prod.yml; do
  [ -f "${APP_DIR}/${f}" ] && cp "${APP_DIR}/${f}" "${BACKUP_DIR}/" && echo "      ${f} -> backup"
done
[ -f "${BACKUP_DIR}/docker-compose.yml" ] && echo "      (docker-compose.yml já versionado no bundle, removendo duplicidade)" \
  && rm -f "${BACKUP_DIR}/docker-compose.yml"

# ------------- 3) Aplicar bundle -------------
echo ""
echo "[2/6] Aplicando bundle ${APP_VERSION}..."
cd "${APP_DIR}"
unzip -o -q "${BUNDLE}" \
  -x 'node_modules/*' '.next/*' 'dist/*' 'backups/*' 'releases/*' '*.log' '.git/*' '.env' '.env.*' \
  || die "Falha ao extrair o bundle."
echo "      Bundle extraído em ${APP_DIR}"

# ------------- 4) Migração aditiva do schema (LGPD + arquivar) -------------
echo ""
echo "[3/6] Aplicando migrações aditivas (scans.lgpd, scans.archived_at, scans.archived_by)..."
if docker compose ps --services >/dev/null 2>&1 && docker compose exec -T db psql -U radar radar >/dev/null 2>&1 <<'SQL'
ALTER TABLE scans ADD COLUMN IF NOT EXISTS lgpd JSONB;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS archived_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_scans_archived ON scans(archived_at) WHERE archived_at IS NOT NULL;
SQL
then
  echo "      Migrações aplicadas (idempotentes)."
else
  warn "Não foi possível aplicar migrações via 'db'. Será necessário rodar manualmente:"
  warn "  ALTER TABLE scans ADD COLUMN IF NOT EXISTS lgpd JSONB;"
  warn "  ALTER TABLE scans ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;"
  warn "  ALTER TABLE scans ADD COLUMN IF NOT EXISTS archived_by INTEGER REFERENCES users(id) ON DELETE SET NULL;"
fi

# ------------- 5) Build & restart -------------
echo ""
echo "[4/6] Rebuild das imagens e restart (isso pode levar alguns minutos)..."
docker compose up -d --build --remove-orphans || {
  warn "Build falhou. Verifique os logs acima."
  echo "Dica: a imagem é construída dentro do container (npm ci / next build)."
  exit 1
}

# ------------- 6) Healthcheck / resumo -------------
echo ""
echo "[5/6] Aguardando serviço responder (até 3 min)..."
OK=0
for i in $(seq 1 90); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${PORT}/api/auth/csrf" || true)"
  if [ "${code}" = "200" ]; then OK=1; break; fi
  sleep 2
done
[ "${OK}" = "1" ] || warn "Serviço ainda não respondeu em http://localhost:${PORT} — acompanhe com 'docker compose logs -f radar'."

echo ""
echo "[6/6] Status dos containers:"
docker compose ps --format "table {{.Service}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "-------------------------------------------------------------"
echo " Upgrade aplicado: ${APP_VERSION}"
echo " Versão no código : $(grep -m1 APP_VERSION "${APP_DIR}/src/lib/version.ts" 2>/dev/null | sed 's/.*= *//; s/;//' || echo 'n/a')"
echo " Banco            : ${BACKUP_DIR}/radar-db.sql.gz (backup preventivo)"
echo ""
echo " Para reverter o banco (use somente se necessário):"
echo "   zcat ${BACKUP_DIR}/radar-db.sql.gz | docker compose exec -T db psql -U radar radar"
echo "-------------------------------------------------------------"