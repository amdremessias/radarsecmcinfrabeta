#!/usr/bin/env bash
# ============================================================
# MCinfraTI Radar Security - deploy-vps.sh
# Descompacta um artefato gerado por scripts/build-artifact.ps1
# (Windows) e faz o deploy de producao na VPS.
#
# Uso:
#   bash deploy-vps.sh /tmp/radar-security-<versao>-<rev>-<data>.tar.gz
#
# Variaveis (opcionais):
#   DEPLOY_DIR=/opt/radar-security      diretorio de instalacao (padrao /opt/radar-security)
#   APP_PORT=8775                       porta que o app escuta (padrao 8775)
#   VERSION=1.1.0                       tag da imagem (padrao: versao do package.json)
#
# Comportamento seguro:
#   * Faz backup do banco antes de qualquer upgrade (se o stack estiver no ar)
#   * Cria o .env a partir do .env.example apenas no primeiro deploy
#   * Nunca sobrescreve o .env existente
#   * Aborta se POSTGRES_PASSWORD estiver vazio
# ============================================================
set -euo pipefail

ARTIFACT="${1:-}"
: "${DEPLOY_DIR:=/opt/radar-security}"
: "${APP_PORT:=8775}"
: "${VERSION:=}"

usage() {
    echo "Uso: bash deploy-vps.sh <artefato.tar.gz>"
    echo "Opcoes: DEPLOY_DIR (padrao /opt/radar-security), APP_PORT (padrao 8775), VERSION (padrao: package.json)"
}

if [[ -z "$ARTIFACT" ]]; then
    usage
    exit 1
fi

[[ -f "$ARTIFACT" ]] || { echo "ERRO: artefato '$ARTIFACT' nao encontrado."; exit 1; }

command -v docker >/dev/null 2>&1 || { echo "ERRO: docker nao instalado na VPS."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "ERRO: docker compose v2 nao disponivel."; exit 1; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
tar -xzf "$ARTIFACT" -C "$TMP"

echo "==> Validando artefato..."
for f in package.json Dockerfile docker-compose.prod.yml .env.example sql scripts; do
    [[ -e "$TMP/$f" ]] || { echo "ERRO: artefato incompleto (faltou $f)."; exit 1; }
done

mkdir -p "$DEPLOY_DIR"
cp -r "$TMP"/. "$DEPLOY_DIR"/
cd "$DEPLOY_DIR"

if [[ ! -f .env ]]; then
    cp .env.example .env
    echo "==> Primeiro deploy detectado."
    echo "    Criei: $DEPLOY_DIR/.env (a partir de .env.example)."
    echo "    EDITE o arquivo preenchendo NEXTAUTH_URL, NEXTAUTH_SECRET, ADMIN_EMAIL,"
    echo "    ADMIN_PASSWORD e POSTGRES_PASSWORD, e rode este script novamente."
    exit 2
fi

# .env existente sempre vence (segredos nao viajam no artefato)
echo "==> .env preservado em $DEPLOY_DIR/.env"

if [[ -z "$VERSION" ]]; then
    VERSION=$(sed -n 's/.*"version":[[:space:]]*"\([^"]*\)".*/\1/p' package.json | head -n1)
fi
if [[ -z "$VERSION" ]]; then VERSION="latest"; fi

_PG_USER=$(grep -E '^POSTGRES_USER=' .env | tail -n1 | cut -d= -f2- || true)
_PG_DB=$(grep -E '^POSTGRES_DB=' .env | tail -n1 | cut -d= -f2- || true)
_PG_USER=${_PG_USER:-radar}
_PG_DB=${_PG_DB:-radar}

mkdir -p backups
if docker compose -f docker-compose.prod.yml ps -q db >/dev/null 2>&1; then
    echo "==> Backup do banco antes do deploy..."
    _BACKUP="backups/radar-pre-deploy-$(date +%Y%m%d-%H%M%S).sql.gz"
    if docker compose -f docker-compose.prod.yml exec -T db \
        pg_dump -U "$_PG_USER" -d "$_PG_DB" | gzip > "$_BACKUP"; then
        echo "    Backup criado: $DEPLOY_DIR/$_BACKUP"
    else
        echo "    AVISO: backup falhou. Garanta um backup recente antes de continuar."
    fi
fi

if [[ ! "$(grep -E '^POSTGRES_PASSWORD=' .env | tail -n1 | cut -d= -f2-)" ]]; then
    echo "ERRO: POSTGRES_PASSWORD vazio em .env. Preencha e rode novamente."
    exit 1
fi

if ss -ltn 2>/dev/null | grep -q ":$APP_PORT " ; then
    echo "AVISO: a porta $APP_PORT ja esta em uso na VPS."
    echo "Troque APP_PORT no .env (ex.: APP_PORT=9900) ou libere a porta."
fi

echo "==> Deploy VERSION=$VERSION na porta $APP_PORT"
VERSION="$VERSION" APP_PORT="$APP_PORT" docker compose -f docker-compose.prod.yml up -d --build

echo "==> Estado dos containers:"
docker compose -f docker-compose.prod.yml ps

echo "==> Smoke test em http://127.0.0.1:$APP_PORT/ ..."
sleep 4
_CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$APP_PORT/" || true)
echo "    HTTP $CODE"
if [[ "$CODE" != "200" ]]; then
    echo "ATENCAO: resposta inesperada. Diagnostico:"
    docker compose -f docker-compose.prod.yml logs radar --tail=50
    exit 3
fi

echo "==> Deploy concluido: http://127.0.0.1:$APP_PORT"
echo "    Certifique-se de apontar o proxy reverso (nginx/caddy) para essa porta."