# Plano de Implementação — Relatório PDF, Núcleo de Scanners e Fila Assíncrona

Base: 5 documentos (`Complemento-MCinfraTI Radar Security-P1.txt`, `EXPORT-RELATORIO.txt`,
`IMPLEMENT-SKILL-RADAR-P1.txt`, `IMPLEMENT-SKILL-RADAR-P2.txt`, `UPGRADE-RELATORIO.txt`)
mapeados à arquitetura real do monolito Next.js App Router (não Express).

## Gap entre os docs e o código atual

| Item | Docs assumem | Real | Impacto |
|---|---|---|---|
| Rotas de API | Express (`/api/scans/:id/report/pdf`) | App Router, API atual é `/api/scan/[id]` | Adaptar para `src/app/api/scan/[id]/report/pdf/route.ts` |
| PDF | Puppeteer (HTML→PDF) | `pdfkit` e `puppeteer` instalados, **mas nunca usados**; Dockerfile pula download do Chromium | pdfkit funciona no container slim; Puppeteer exigiria instalar Chromium (~300 MB) no runner |
| Scan de código | CodeQL/Trivy analisam repositório local (pasta) + SARIF | pipeline atual escaneia **URL pública** (headers/dns/tls/tech) | Fase 2 quebra um paradigma: exige alvo do tipo repo/artefato, não URL |
| Execução | Síncrona | `src/lib/runScan.ts` síncrono (Promise.all de 3 checks), pode ser enfileirado depois | BullMQ exige Redis + 2º processo (worker) no compose |
| process spawn | `execa` | não é dependência (usar `child_process` nativo ou adicionar `execa`) | decidir |

## Fase 1 — Relatório PDF (EXPORT-RELATORIO + UPGRADE-RELATORIO) — ✅ implementado

Nenhuma infra nova.

- `src/lib/report/pdfReport.ts`: monta `ReportData` a partir do scan (+ opcional `contingency_plan`).
- `src/app/api/scan/[id]/report/pdf/route.ts` (GET):
  - mesmo controle de acesso de `src/app/api/scan/[id]/route.ts` (staff total; `cliente` só scans próprios);
  - 404 se scan não achar; 400 se id inválido;
  - retorna `application/pdf` com `Content-Disposition: attachment; filename="MCinfraTI_Radar_<sanitizedUrl>_<scanId8>.pdf"`.
- `src/components/ExportPdfButton.tsx` (client, `Download` icon): `fetch` → `blob` → `URL.createObjectURL` → `<a download>`. Sem biblioteca de download extra.
- Integrar botão no header de `src/app/scan/[id]/page.tsx` e nas linhas/header de `src/app/admin/analises/page.tsx`.
- Layout do PDF (UPGRADE-RELATORIO), via pdfkit:
  1. Capa executiva (logo/faixa, alvo + domínio + data, score `27/100`, grade F);
  2. Sumário executivo com metric cards por categoria (headers `0/6`, cookies, TLS, DNS, tecnologias/CVEs);
  3. Matriz de severidade (contagens LOW/MEDIUM/HIGH/CRITICAL);
  4. Detalhamento técnico com badges Passou/Falhou/Alerta por header, cookie, TLS e DNS;
  5. Rodapé de compliance (data, documento, versão) + área de assinatura.

## Fase 2 — Núcleo de scanners (IMPLEMENT-SKILL P1 + P2) — ✅ implementado

Biblioteca pura, sem infra. Padrões do `src/lib/scanner/*` já existentes servem de base.

- `src/types/scanner.ts`: `Severity` (LOW/MEDIUM/HIGH/CRITICAL), `Vulnerability`, `UnifiedScanResult`,
  `ScanOptions`, interface `IScanner` (`{ metadata; scan(target, options): Promise<UnifiedScanResult> }`).
- `src/parsers/sarif.parser.ts`: converte SARIF (CodeQL) → `Vulnerability[]` (ruleId, severity, message, location).
- `src/scanners/codeql.scanner.ts`: roda `codeql database create/analyze` via `child_process`/`execa`, parseia SARIF.
- `src/scanners/trivy.scanner.ts` (FS `--format json`) e `src/scanners/nmap.scanner.ts` (`-sT -sV` JSON), conforme P2.
- `src/scanners/scanner.registry.ts`: mapa nome→IScanner + `listAvailable()` que detecta binário no PATH.
- Aplicação: rota admin opcional (`/api/admin/scanners`) listando disponíveis; execução real depende de ter as ferramentas instaladas onde o worker roda (VPS) — não roda em URL (ver Gap).

## Fase 3 — Fila assíncrona BullMQ/Redis/worker (Complemento-P1) — ✅ implementado & validado E2E local

Infra pesada. Alterar compose (dev `docker-compose.yml` e `docker-compose.prod.yml`).

- Adicionar serviço `redis:7-alpine` (volume `redis_data`).
- `src/queues/scan.queue.ts` (BullMQ Queue, REDIS_HOST/REDIS_URL; cliente `ioredis` passado como
  **instância** para não quebrar o load lazy sob bundlers) e `src/workers/scan.worker.ts`.
- Worker: bundle esbuild CJS (`npm run build:worker` → `dist/worker.cjs`), 2º processo no compose
  (`command: node dist/worker.cjs`), separado do `next start` (`api`). `tsx` direto falha em Node 24+ 
  por `ERR_PACKAGE_PATH_NOT_EXPORTED` (execa/unicorn-magic) e o bundle em `dist/` é o mesmo nos dois.
- Enfileirar no backend existente (rotas que hoje chamam `runScan`) e retornar jobId; UI passa a
  poll/search por status — mudança de UX relevante. Manter fallback síncrono configurável
  (env `SCAN_ASYNC=false`, padrão de produção).
- Image CodeQL (multi-stage) apenas se a Fase 2 rodar real na VPS.

## Ordem sugerida e rollback

1. **Fase 1** (alto valor, baixo risco, tudo em camada de apresentação).
   Rollback: remover botão + route; nada muda em banco/container.
2. **Fase 2** (código novo, sem tocar fluxo atual).
   Rollback: arquivos novos são auto-contidos.
3. **Fase 3** (mudança estrutural; requer teste na VPS pequena).
   Rollback: `SCAN_ASYNC=false` + voltar compose sem redis/worker (padrão atual).

## Decisões em aberto

1. Motor do PDF: pdfkit ✅ (zero Chromium; Puppeteer exigiria instalar Chromium no runner).
2. Escopo desta rodada: Fases 1+2+3 ✅ (todas implementadas e validadas).
3. Fase 3: manter fallback síncrono (`SCAN_ASYNC=false`) como padrão de produção ✅ — fila só ativa
   ao subir `worker`+`redis` explicitamente.