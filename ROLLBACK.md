# Deploy & Rollback — MCinfraTI Radar Security (VPS)

Runbook operacional para publicar versões novas e reverter rapidamente em caso de
regressão. Todo deploy usa **imagens versionadas** e **backup do banco antes de subir**,
para que o rollback seja determinístico.

---

## 1. Estrutura do projeto

| Arquivo | Papel |
| --- | --- |
| `docker-compose.yml` | Stack de desenvolvimento (local/smoke), exposta na porta 3000 |
| `docker-compose.prod.yml` | Stack de produção (standalone): `:?` obriga secrets no `.env`, banco sem porta pública, app em `127.0.0.1:8775` |
| `.env.example` | Modelo do `.env` (nunca commit o `.env`) |
| `sql/schema.sql` | Schema idempotente — aplicado automaticamente no boot (`npm run setup`) |
| `scripts/seed.ts` | Aplica schema + cria admin (idempotente, executa no boot) |
| `scripts/build-artifact.ps1` | Windows/PowerShell: gera o `.tar.gz` de deploy (nunca inclui `.env`) |
| `scripts/deploy-vps.sh` | VPS/Linux: descompacta o artefato, faz backup do banco, valida secrets e sobe a stack |
| `ROLLBACK.md` | Este runbook — **deploy automatizado: seções 3, 4, 5 e 6 valem p/ os scripts também** |

> **Fluxo rápido (recomendado):** execute `build-artifact.ps1` no Windows, envie o
> `.tar.gz` + `deploy-vps.sh` para a VPS e rode `bash deploy-vps.sh <arquivo>`. O script
> cuida de backup, `.env` (primeira vez) e smoke test. As seções 3 a 6 descrevem o mesmo
> processo manualmente, passo a passo.

```bash
# Produção (VPS):
docker compose -f docker-compose.prod.yml <comando>

# Desenvolvimento local:
docker compose <comando>
```

---

## 2. Pré-requisitos na VPS

- Docker Engine + Compose v2 (`docker compose version`)
- DNS apontando para a VPS (se houver HTTPS/domínio)
- Porta **8775** livre na VPS (o app liga em `127.0.0.1:8775`; troque via `APP_PORT` no `.env`)

---

## 3. Primeiro deploy

```bash
cd /opt/radar-security          # ou diretório de instalação
git pull origin main

cp .env.example .env
# Preencha TODOS os campos obrigatórios:
#   NEXTAUTH_URL (https://...)
#   NEXTAUTH_SECRET (openssl rand -base64 32)
#   ADMIN_EMAIL / ADMIN_PASSWORD
#   POSTGRES_PASSWORD
#   APP_PORT (opcional — padrão 8775; use outro valor se a porta já estiver ocupada)

# Build com tag explícita e subir
VERSION=1.1.0 docker compose -f docker-compose.prod.yml up -d --build

# Verificar saúde
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f radar

# Smoke test na porta da aplicação
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8775/
```

A imagem fica rotulada como `radar-security-radar:1.1.0` (o campo `image:` no arquivo de
produção garante que cada build com `VERSION=X` gera uma tag única e reutilizável).

---

## 4. Deploy de uma nova versão (upgrade)

Sempre: **1) backup → 2) tag → 3) build/subir → 4) validar**.

```bash
# 4.1 — Backup do banco (consulte a seção 5)
./scripts/backup-db.sh

# 4.2 — Nova versão
git pull origin main
VERSION=1.2.0 docker compose -f docker-compose.prod.yml up -d --build

# 4.3 — Validar
docker compose -f docker-compose.prod.yml ps
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8775/
# Login admin + uma análise de teste (cria scan com status completed)
```

Se algo quebrar aqui, vá direto para a seção 6 (rollback) — o banco está intacto no
backup e a imagem anterior ainda existe.

---

## 5. Backup e restauração do banco

Script de backup (criar na VPS e disparar por cron ou manualmente):

```bash
# scripts/backup-db.sh
mkdir -p backups
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U radar -d radar | gzip > "backups/radar-$(date +%Y%m%d-%H%M%S).sql.gz"
ls -lh backups
```

Restaurar um backup:

```bash
# PARE o app antes para evitar escrita concorrente
docker compose -f docker-compose.prod.yml stop radar

gunzip -c backups/radar-20260906-120000.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T db \
  psql -U radar -d radar

docker compose -f docker-compose.prod.yml start radar
```

> ⚠️ Restaurar substitui o estado atual. Confirme a data do arquivo escolhido.

---

## 6. Rollback

### 6.A — Rollback rápido de código (imagem anterior)

Se a versão nova regrediu (500, tela branca, scan quebrado), volte a tag anterior.
As tags são criadas por cada `VERSION=` no build:

```bash
# Exemplo: 1.2.0 quebrou, 1.1.0 era estável
VERSION=1.1.0 docker compose -f docker-compose.prod.yml up -d --no-build

curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8775/
```

### 6.B — Rollback via git (código-fonte)

```bash
git log --oneline -10
git checkout <hash-do-commit-estável>
VERSION=1.1.0 docker compose -f docker-compose.prod.yml up -d --build
```

### 6.C — Rollback do banco (dados corrompidos / migração ruim)

Siga a seção 5 (restaurar backup). Migrações são **idempotentes** (`IF NOT EXISTS`),
portanto reverter código antes de restaurar o banco não deixa objetos órfãos.

### 6.D — Rollback total (app + banco)

```bash
docker compose -f docker-compose.prod.yml down      # preserva o volume radar_data
# restaurar banco (seção 5), depois:
VERSION=1.1.0 docker compose -f docker-compose.prod.yml up -d --no-build
```

> O volume `radar_data` **não é removido** por `down`. Apenas `down -v` apaga os dados —
> evite `-v` em produção.

### 6.E — Fila assíncrona (BullMQ / Redis / worker)

A fila é **opcional** (`SCAN_ASYNC=false` por padrão). Para voltar ao modo 100% síncrono
(sem Redis/worker), basta:

```bash
# 1. Desliga a fila no .env
sed -i 's/^SCAN_ASYNC=.*/SCAN_ASYNC=false/' .env

# 2. Remove os serviços worker e redis (app + banco ficam de pé)
docker compose -f docker-compose.prod.yml up -d --no-deps radar db
docker compose -f docker-compose.prod.yml stop worker redis

# 3. Valida
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8775/
```

Se o worker ficou desalinhado (jobs presos no Redis), drene manualmente antes de desligar:

```bash
docker exec -it radar-security-redis redis-cli LLEN bull:security-scans:wait   # fila
docker exec -it radar-security-redis redis-cli DEL bull:security-scans:wait
```

---

## 7. Checklist pós-deploy / pós-rollback

- [ ] `docker compose -f docker-compose.prod.yml ps` — containers `Up` / `(healthy)`? (`worker` e `redis` quando `SCAN_ASYNC=true`)
- [ ] `curl http://127.0.0.1:8775/` retorna `200`?
- [ ] `docker compose -f docker-compose.prod.yml logs radar` sem tracebacks/promises rejeitadas?
- [ ] Com `SCAN_ASYNC=true`: `logs worker` mostra `Scan worker online`; uma análise enfileirada (`status: queued`) finaliza como `completed`?
- [ ] Login admin (`/login`) + `GET /api/admin/dashboard` retorna JSON com `totals`?
- [ ] Uma análise de domínio finaliza com `status = completed`?
- [ ] Proxy reverso (nginx/caddy) encaminha HTTPS → `127.0.0.1:8775`?

---

## 8. Notas de segurança

- O app escuta apenas em `127.0.0.1:8775` em produção; coloque nginx/caddy na frente com TLS.
- Banco PostgreSQL não expõe porta na rede pública (sem `ports` no arquivo de produção).
- Redis segue o mesmo princípio: apenas interno (sem `ports` em produção).
- `SCAN_ASYNC` só deve ser `true` com a stack `worker`+`redis` de pé; caso contrário a fila acerta o DB como `queued`/`running` sem quem a processe.
- `NEXTAUTH_SECRET` e `ADMIN_PASSWORD` são obrigatórios (`:?`) — o serviço não sobe sem eles.
- Sempre gere `NEXTAUTH_SECRET` com `openssl rand -base64 32`.