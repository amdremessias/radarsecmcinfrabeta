#!/usr/bin/env bash
# ============================================================
# MCinfraTI Radar Security - fix-update.sh
#
# Atualiza a stack de PRODUCAO na VPS a partir de um artefato
# .tar.gz (gerado por scripts/build-artifact.ps1), aplicando as
# novas funcoes:
#   - OSINT / Domain Recon (theHarvester)
#   - Integracao de API (fontes keyed) - ficam DESLIGADAS
#   - Export CSV e PDF do Domain Recon
#
# Uso:
#   bash scripts/fix-update.sh /tmp/radar-security-<ver>-<rev>-<data>.tar.gz
#
# Variaveis (opcionais, via ambiente):
#   DEPLOY_DIR=/opt/radar-security    diretorio de instalacao
#   APP_PORT=8775                     porta do app (em 127.0.0.1)
#   VERSION=<tag>                     tag da imagem (padrao: package.json)
#   COMPOSE_FILE=docker-compose.prod.yml
#
# Seguranca / garantias:
#   * Backup do banco + .env + compose antes de qualquer alteracao
#   * NUNCA sobrescreve o .env existente (segredos ficam na VPS)
#   * Migracao de schema ADITIVA e idempotente (CREATE ... IF NOT EXISTS)
#   * Integracao de API fica DESLIGADA por padrao (HARVESTER_API_ENABLED=false)
#   * Reexecutavel: rodar de novo nao quebra nada
# ============================================================
set -euo pipefail

ARTIFACT="${1:-}"
: "${DEPLOY_DIR:=/opt/radar-security}"
: "${APP_PORT:=8775}"
: "${VERSION:=}"
: "${COMPOSE_FILE:=docker-compose.prod.yml}"

die()  { echo "[ERRO] $*" >&2; exit 1; }
warn() { echo "[AVISO] $*" >&2; }
info() { echo "==> $*"; }

usage() {
  cat <<'EOF'
Uso: bash scripts/fix-update.sh <artefato.tar.gz>

Opcoes (via ambiente):
  DEPLOY_DIR    diretorio de instalacao   (padrao: /opt/radar-security)
  APP_PORT      porta do app na VPS       (padrao: 8775)
  VERSION       tag da imagem             (padrao: versao do package.json)
  COMPOSE_FILE  arquivo compose           (padrao: docker-compose.prod.yml)
EOF
}

case "${ARTIFACT}" in
  -h|--help) usage; exit 0 ;;
esac
[ -n "${ARTIFACT}" ] || { usage; exit 1; }

[ -f "${ARTIFACT}" ] || die "Artefato nao encontrado: ${ARTIFACT}"

command -v docker >/dev/null 2>&1 || die "docker nao instalado na VPS."
docker compose version >/dev/null 2>&1 || die "docker compose v2 indisponivel."
command -v tar >/dev/null 2>&1 || die "tar indisponivel."
command -v curl >/dev/null 2>&1 || die "curl indisponivel."

TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT
tar -xzf "${ARTIFACT}" -C "${TMP}"

info "Validando artefato..."
for f in package.json Dockerfile docker-compose.prod.yml .env.example sql scripts; do
  [ -e "${TMP}/${f}" ] || die "Artefato incompleto (faltou ${f})."
done

if [ -z "${VERSION}" ]; then
  VERSION="$(sed -n 's/.*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "${TMP}/package.json" | head -n1)"
fi
[ -n "${VERSION}" ] || VERSION="latest"

STAMP="$(date +%Y%m%d-%H%M%S)"

echo "============================================================="
echo " Radar Security - fix-update (VERSION=${VERSION})"
echo " Diretorio : ${DEPLOY_DIR}"
echo " Compose   : ${COMPOSE_FILE}"
echo " Porta     : ${APP_PORT}"
echo "============================================================="
echo ""

mkdir -p "${DEPLOY_DIR}/backups"
BACKUP_DIR="${DEPLOY_DIR}/backups/update-${STAMP}"
mkdir -p "${BACKUP_DIR}"

# comando do compose (o arquivo passa a existir apos o extract / ja instalado)
COMPOSE=(docker compose -f "${COMPOSE_FILE}")

# ---- 1) Backup (configs + banco) ----
info "[1/6] Backup de configs e banco..."
for f in .env .env.local "${COMPOSE_FILE}"; do
  if [ -f "${DEPLOY_DIR}/${f}" ]; then
    cp "${DEPLOY_DIR}/${f}" "${BACKUP_DIR}/"
    echo "      ${f} -> backup"
  fi
done

PG_USER="$(grep -E '^POSTGRES_USER=' "${DEPLOY_DIR}/.env" 2>/dev/null | tail -n1 | cut -d= -f2- || true)"
PG_DB="$(grep -E '^POSTGRES_DB=' "${DEPLOY_DIR}/.env" 2>/dev/null | tail -n1 | cut -d= -f2- || true)"
PG_USER="${PG_USER:-radar}"
PG_DB="${PG_DB:-radar}"

cd "${DEPLOY_DIR}"

if [ -n "$("${COMPOSE[@]}" ps -q db 2>/dev/null || true)" ]; then
  if "${COMPOSE[@]}" exec -T db pg_dump -U "${PG_USER}" -d "${PG_DB}" 2>/dev/null | gzip > "${BACKUP_DIR}/radar-db.sql.gz"; then
    echo "      banco exportado -> ${BACKUP_DIR}/radar-db.sql.gz"
  else
    warn "pg_dump falhou; seguindo (o volume do banco permanece intacto)."
  fi
else
  echo "      banco ainda nao iniciado; backup de banco ignorado."
fi

# ---- 2) Aplicar artefato (preserva .env / node_modules) ----
info "[2/6] Aplicando artefato sobre ${DEPLOY_DIR}..."
cp -r "${TMP}"/. "${DEPLOY_DIR}"/
echo "      arquivos de codigo atualizados."

ENV_FILE="${DEPLOY_DIR}/.env"
if [ -f "${ENV_FILE}" ]; then
  echo "      .env preservado (segredos nao viajam no artefato)."
else
  cp "${DEPLOY_DIR}/.env.example" "${ENV_FILE}"
  warn "Nao havia .env; criei a partir do .env.example. Revise os segredos e rode novamente."
  exit 2
fi

# ---- 3) Garantir variaveis novas no .env (sem sobrescrever) ----
info "[3/6] Conferindo variaveis de ambiente (integracao de API)..."
ensure_env_var() {
  local key="$1" val="$2" comment="$3"
  if grep -qE "^${key}=" "${ENV_FILE}"; then
    echo "      = ${key} ja definido (preservado)"
  else
    if [ -n "${comment}" ]; then echo "${comment}" >> "${ENV_FILE}"; fi
    echo "${key}=${val}" >> "${ENV_FILE}"
    echo "      + ${key} adicionado ao .env"
  fi
}
ensure_env_var "HARVESTER_API_ENABLED" "false" \
  "# theHarvester: integracao de API (fontes keyed). true para habilitar."
ensure_env_var "HARVESTER_KEYS_SECRET" "" \
  "# theHarvester: segredo p/ cifrar as chaves de API (igual em radar e osint-worker). Vazio = usa NEXTAUTH_SECRET."

# ---- 4) Migracao aditiva do schema (v2.8 harvest + v2.9 chaves) ----
info "[4/6] Migracao de schema (aditiva e idempotente)..."
"${COMPOSE[@]}" up -d db >/dev/null 2>&1 || true
for i in $(seq 1 30); do
  if "${COMPOSE[@]}" exec -T db pg_isready -U "${PG_USER}" -d "${PG_DB}" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if "${COMPOSE[@]}" exec -T db psql -U "${PG_USER}" -d "${PG_DB}" >/dev/null 2>&1 <<'SQL'
CREATE TABLE IF NOT EXISTS harvest_scans (
    id SERIAL PRIMARY KEY,
    target TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    sources TEXT,
    options JSONB,
    result_count INTEGER NOT NULL DEFAULT 0,
    counts JSONB,
    evidence_status TEXT,
    source_status JSONB,
    execution_time_ms INTEGER,
    raw_stdout TEXT,
    raw_stderr TEXT,
    raw_jsonl TEXT,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_harvest_scans_target ON harvest_scans(target);
CREATE INDEX IF NOT EXISTS idx_harvest_scans_status ON harvest_scans(status);
CREATE INDEX IF NOT EXISTS idx_harvest_scans_created ON harvest_scans(created_at DESC);
CREATE TABLE IF NOT EXISTS harvest_results (
    id SERIAL PRIMARY KEY,
    scan_id INTEGER NOT NULL REFERENCES harvest_scans(id) ON DELETE CASCADE,
    result_type TEXT NOT NULL,
    value TEXT NOT NULL,
    sources TEXT[],
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_harvest_results_scan ON harvest_results(scan_id);
CREATE INDEX IF NOT EXISTS idx_harvest_results_type ON harvest_results(scan_id, result_type);
CREATE TABLE IF NOT EXISTS harvest_api_keys (
    id SERIAL PRIMARY KEY,
    provider TEXT NOT NULL UNIQUE,
    secret TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_harvest_api_keys_provider ON harvest_api_keys(provider);
SQL
then
  echo "      tabelas harvest_scans / harvest_results / harvest_api_keys garantidas."
else
  warn "Migracao via 'db' falhou. O app aplica sql/schema.sql no start (seed),"
  warn "entao as tabelas devem ser criadas mesmo assim. Confira com:"
  warn "  ${COMPOSE[*]} exec -T db psql -U ${PG_USER} -d ${PG_DB} -c '\\dt harvest*'"
fi

# ---- 5) Pre-pull da imagem do theHarvester (opcional) ----
info "[5/6] Preparando imagem do theHarvester..."
HARVESTER_IMAGE="$(grep -E '^HARVESTER_IMAGE=' "${ENV_FILE}" 2>/dev/null | tail -n1 | cut -d= -f2- || true)"
HARVESTER_IMAGE="${HARVESTER_IMAGE:-ghcr.io/laramies/theharvester:latest}"
if docker pull "${HARVESTER_IMAGE}" >/dev/null 2>&1; then
  echo "      imagem pronta: ${HARVESTER_IMAGE}"
else
  warn "Nao foi possivel baixar ${HARVESTER_IMAGE} agora; o worker baixa no primeiro scan."
fi

# ---- 6) Build, restart e healthcheck ----
info "[6/6] Rebuild das imagens e restart (pode levar alguns minutos)..."
if ! VERSION="${VERSION}" APP_PORT="${APP_PORT}" "${COMPOSE[@]}" up -d --build --remove-orphans; then
  warn "Build/restart falhou. Veja os logs acima."
  echo "Dica: a imagem e construida no container (npm ci / next build)."
  exit 1
fi

echo ""
info "Aguardando o app responder em http://127.0.0.1:${APP_PORT} (ate 3 min)..."
OK=0
for i in $(seq 1 90); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${APP_PORT}/api/auth/csrf" || true)"
  if [ "${code}" = "200" ]; then OK=1; break; fi
  sleep 2
done
if [ "${OK}" = "1" ]; then
  echo "      app OK (HTTP 200)."
else
  warn "App ainda nao respondeu. Acompanhe com: ${COMPOSE[*]} logs -f radar"
fi

echo ""
echo "-------------------------------------------------------------"
echo " Update concluido (VERSION=${VERSION})"
echo ""
echo " Containers:"
"${COMPOSE[@]}" ps
echo ""
echo " Novidades desta versao:"
echo "   - OSINT / Domain Recon (theHarvester)"
echo "   - Integracao de API (fontes keyed) - DESLIGADA por padrao"
echo "   - Export CSV e PDF do Domain Recon"
echo ""
echo " Para habilitar a integracao de API depois:"
echo "   1) Edite ${ENV_FILE} e defina:"
echo "        HARVESTER_API_ENABLED=true"
echo "        HARVESTER_KEYS_SECRET=<saida de: openssl rand -base64 32>"
echo "   2) ${COMPOSE[*]} up -d radar osint-worker"
echo "   3) Na UI: Domain Recon -> Integracao de API -> cadastre a chave"
echo ""
echo " Backup desta atualizacao: ${BACKUP_DIR}"
echo " Reverter banco (se necessario):"
echo "   zcat ${BACKUP_DIR}/radar-db.sql.gz | ${COMPOSE[*]} exec -T db psql -U ${PG_USER} -d ${PG_DB}"
echo "-------------------------------------------------------------"
