# ROLLBACK — Redesign Hitech do PDF de Segurança

> **Projeto:** MCinfraTI Radar Security
> **Arquivo afetado:** `src/lib/report/pdfReport.ts`
> **Data da mudança:** 2026-09-06
> **Este repositório NÃO é um repositório git.** O rollback deve ser feito manualmente, substituindo as regiões abaixo pelo código original (fornecido completo neste documento).

---

## 1. O que foi alterado

Foram feitas **duas categorias** de mudanças no `pdfReport.ts`:

### A. Mudanças de layout (redesign "hitech") — ver seções 3 a 7
1. Removidos os helpers `metricCard`, `stackedSeverityBar` e `categoryBar`.
2. Adicionados os novos helpers `panelDark`, `hudTitle`, `sevTile`, `gauge` e `kpiCard`.
3. O `donut` ganhou um parâmetro `dark` (modo escuro).
4. Todo o bloco de renderização das seções
   `Métricas da Auditoria` / `Distribuição de Achados` / `Pontuação Geral de Segurança` /
   `Resumo Executivo` / `Cobertura de Controles` foi substituído por um
   painel escuro com gauge, tiles de severidade, KPIs, donut escuro e barras de cobertura.

### B. Correções de layout (bug de cursor `doc.y`) — ver seções 8 e 9
1. **KPI cards do Resumo Executivo:** antes usavam `doc.y` dentro do `forEach`
   (o `doc.text()` interno move o cursor a cada iteração, fazendo os cards descerem
   na diagonal e cruzarem quebras de página — criando página quase vazia).
   Agora capturam uma posição fixa `r1y`/`r2y` por fileira.
2. **Painel de flags DNS (SPF/DMARC/DKIM/MTA-STS):** mesmo bug; agora usa `flagsY` fixo.
3. **Mini-KPIs do escopo do painel:** agora usam `dashY + 224` fixo.

> Para restaurar o comportamento **exato** anterior, aplique as duas categorias.
> Quem quiser apenas "desfazer o visual", pode pular as seções 8/9 (elas são correções,
> não fazem parte do tema).

---

## 2. Visão geral: o que existe HOJE no arquivo (para localizar os trechos)

```
... bullet() ...

type SeverityKey = keyof ReportData['severityCounts'];
function severityTotal(...)

// ---- (NOVO) helpers hitech: panelDark, hudTitle, sevTile, gauge, kpiCard  <-- REMOVER
// ---- (ORIGINAL) metrics/método antigo                                       <-- RESTAURAR

function donut(...)                    // <-- com parâmetro dark (restaurar versão original)
function stackedSeverityBar(...)       // foi REMOVIDO -> restaurar
function categoryBar(...)              // foi REMOVIDO -> restaurar
type Cell = ...
function rowHeight(...)
function drawTable(...)

... bloco de renderização "PAINEL HITECH ... COBERTURA DE CONTROLES"  <-- SUBSTITUIR pelo original
```

---

## 3. Passo A — Remover os helpers hitech recém-adicionados

Apague, no arquivo, **todo o bloco** que está logo depois de `function severityTotal(...)` e
antes da definição de `function donut(...)`. O bloco a remover começa no comentário
`// Painel escuro "hitech"` e termina no final da função `kpiCard`.

Trecho a ser **removido** (começo):

```ts
    // Painel escuro "hitech"
    function panelDark(...)
    // Titulo pequeno em caps + cor de destaque (estilo HUD)
    function hudTitle(...)
    // Tile de severidade (placar)
    function sevTile(...)
    // Medidor (ring/gauge) de pontuacao
    function gauge(...)
    // KPI card (pagina do resumo executivo)
    function kpiCard(...)
```

> Confirme que **não** resta nenhuma chamada a `panelDark`, `hudTitle`, `sevTile`, `gauge`
> ou `kpiCard` no corpo do relatório (seção 6). Se restar chamada, o `tsc` quebra.

---

## 4. Passo B — Restaurar `metricCard` (helper removido)

Cole novamente a função `metricCard` **antes** de `type SeverityKey` linha:

```ts
    type SeverityKey = keyof ReportData['severityCounts'];
    function severityTotal(data: ReportData): number {
        return Object.values(data.severityCounts).reduce((a: number, b) => a + b, 0);
    }
```

Ficando assim:

```ts
    function metricCard(x: number, y: number, w: number, label: string, value: string, valueColor: string = COLORS.ink) {
        box(x, y, w, 56);
        doc.fillColor(COLORS.mute).font('Helvetica').fontSize(6.5);
        doc.text(label.toUpperCase(), x + 10, y + 9, { width: w - 20 });
        doc.fillColor(valueColor).font('Helvetica-Bold').fontSize(16);
        doc.text(value, x + 10, y + 23, { width: w - 20 });
    }

    type SeverityKey = keyof ReportData['severityCounts'];
    function severityTotal(data: ReportData): number {
        return Object.values(data.severityCounts).reduce((a: number, b) => a + b, 0);
    }
```

---

## 5. Passo C — Restaurar o `donut` original (sem o parâmetro `dark`)

Substitua a versão atual de `function donut(...)` (a que contém `dark: boolean = false`)
pela versão original abaixo (mantenha a posição dela no arquivo):

```ts
    function donut(cx: number, cy: number, r: number, segments: { value: number; color: string }[], total: number) {
        const ring = 0.58;
        if (total <= 0) {
            doc.save().circle(cx, cy, r).lineWidth(2.5).strokeColor(COLORS.line).stroke().restore();
            doc.save().circle(cx, cy, r * ring).fill(COLORS.white).restore();
            return;
        }
        let angle = -Math.PI / 2;
        for (const seg of segments) {
            if (seg.value <= 0) continue;
            const sweep = (seg.value / total) * Math.PI * 2;
            if (seg.value / total >= 0.9999) {
                doc.save().circle(cx, cy, r).fill(seg.color).restore();
                angle = angle + sweep;
                continue;
            }
            doc.save();
            doc.moveTo(cx, cy);
            doc.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
            (doc as any as { arc: (x: number, y: number, r: number, s: number, e: number, ccw?: boolean) => void }).arc(cx, cy, r, angle, angle + sweep, false);
            doc.closePath();
            doc.fillColor(seg.color).fill();
            doc.restore();
            angle += sweep;
        }
        doc.save().circle(cx, cy, r * ring).fill(COLORS.white).restore();
        doc.font('Helvetica-Bold').fontSize(15).fillColor(COLORS.ink);
        doc.text(String(total), cx, cy - 9, { width: 0, align: 'center' });
        doc.font('Helvetica').fontSize(6).fillColor(COLORS.mute);
        doc.text('ACHADOS', cx, cy + 7, { width: 0, align: 'center' });
    }
```

---

## 6. Passo D — Restaurar `stackedSeverityBar` e `categoryBar` (helpers removidos)

Após o fim do `donut` (restaurado na seção 5) e **antes** de `type Cell = ...`, cole:

```ts
    function stackedSeverityBar(x: number, y: number, w: number, data: ReportData) {
        const total = severityTotal(data);
        if (total <= 0) return;
        const keys: SeverityKey[] = ['critical', 'high', 'medium', 'low', 'info'];
        let acc = x;
        for (const k of keys) {
            const count = data.severityCounts[k] ?? 0;
            if (count <= 0) continue;
            const bw = Math.max(2, (count / total) * w);
            doc.save().rect(acc, y, bw, 14).fill(SEVERITY_PALETTE[k]);
            doc.restore();
            acc += bw;
        }
        doc.save().rect(x, y, w, 14).lineWidth(1).strokeColor(COLORS.line).stroke().restore();
    }
```

```ts
    function categoryBar(x: number, y: number, w: number, label: string, valuePct: number | null) {
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.inkSoft);
        doc.text(label.toUpperCase(), x, y, { width: 120 });
        const bw = 300;
        const bx = x + 128;
        if (valuePct === null) {
            doc.save().rect(bx, y, bw, 9).fill(COLORS.line).restore();
            doc.font('Helvetica').fontSize(7).fillColor(COLORS.mute).text('N/A', bx + 4, y - 0.5, { width: 40 });
        } else {
            const color = valuePct >= 80 ? COLORS.ok : valuePct >= 50 ? COLORS.alert : valuePct >= 25 ? '#EA580C' : COLORS.fail;
            doc.save().rect(bx, y, bw, 9).fill('#f1f5f9').restore();
            const fillW = Math.max(4, (Math.min(100, valuePct) / 100) * bw);
            doc.save().rect(bx, y, fillW, 9).fill(color).restore();
            doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.inkSoft);
            doc.text(`${Math.round(valuePct)}%`, bx + bw + 6, y - 1, { width: 40 });
        }
        doc.y = y + 17;
    }
```

---

## 7. Passo E — Substituir o bloco de renderização redesenhado pelo ORIGINAL

**Localize no arquivo atual** o comentário:

```ts
    // ================== PAINEL HITECH: PONTUAÇÃO GERAL + MÉTRICAS ==================
```

e o trecho que termina logo antes de:

```ts
    // ================== PONTOS FORTES E FRACOS ==================
```

O bloco atual termina com `doc.y = panoY + 236 + 18;` (fim da cobertura de controles).

**Apague TODO esse bloco atual** (do comentário `PAINEL HITECH` até `doc.y = panoY + 236 + 18;`)
e cole o bloco original abaixo no lugar:

<details>
<summary><strong>Bloco original completo (clique para expandir)</strong></summary>

```ts
    // PLACAR DE MÉTRICAS (GRAFI: Crítica/Alta/Média/Baixa/Forte)
    startSection('Métricas da Auditoria', 74);
    const sevKeys: SeverityKey[] = ['critical', 'high', 'medium', 'low', 'info'];
    const sevCards = [
        { key: 'critical' as SeverityKey, label: 'CRÍTICA', color: SEVERITY_PALETTE.critical },
        { key: 'high' as SeverityKey, label: 'ALTA', color: SEVERITY_PALETTE.high },
        { key: 'medium' as SeverityKey, label: 'MÉDIA', color: SEVERITY_PALETTE.medium },
        { key: 'low' as SeverityKey, label: 'BAIXA', color: SEVERITY_PALETTE.low },
        { key: 'info' as SeverityKey, label: 'INFO', color: SEVERITY_PALETTE.info },
    ];
    const cardGap = 6;
    const scW = (CONTENT_W - cardGap * 4) / 5;
    sevCards.forEach((c, i) => {
        const x = M + i * (scW + cardGap);
        box(x, doc.y, scW, 48, c.color);
        doc.fillColor('#ffffff').font('Helvetica').fontSize(6.5);
        doc.text(c.label, x + 6, doc.y + 9, { width: scW - 12, align: 'center' });
        doc.font('Helvetica-Bold').fontSize(18);
        doc.text(String(data.severityCounts[c.key]), x + 6, doc.y + 21, { width: scW - 12, align: 'center' });
    });
    doc.y += 60;

    doc.y = ensureSpace(30);
    const totalFindings = severityTotal(data);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.inkSoft);
    doc.text('DISTRIBUIÇÃO DE ACHADOS POR SEVERIDADE', M, doc.y);
    stackedSeverityBar(M, doc.y + 14, CONTENT_W, data);
    doc.y += totalFindings > 0 ? 40 : 26;

    // Score geral + grade
    doc.y = ensureSpace(104);
    box(M, doc.y, CONTENT_W, 100);
    doc.fillColor(COLORS.mute).font('Helvetica').fontSize(7.5);
    doc.text('PONTUAÇÃO GERAL DE SEGURANÇA', M + 22, doc.y + 18);
    doc.font('Helvetica-Bold').fontSize(38).fillColor(COLORS.ink);
    doc.text(String(data.score), M + 22, doc.y + 32);
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.mute).text('de 100 pontos', M + 92, doc.y + 52);
    const gradeColor = getGradeColor(data.grade);
    doc.save().roundedRect(W - M - 92, doc.y + 16, 72, 72, 14).lineWidth(7).strokeColor(gradeColor).restore();
    doc.fillColor(gradeColor).font('Helvetica-Bold').fontSize(38);
    doc.text(data.grade, W - M - 92, doc.y + 34, { width: 72, align: 'center' });
    doc.font('Helvetica').fontSize(6.5).fillColor(COLORS.mute);
    doc.text('GRAU ATRIBUÍDO', W - M - 92, doc.y + 76, { width: 72, align: 'center' });
    doc.y += 116;

    if (data.scanStatus && data.scanStatus !== 'completed') {
        box(M, doc.y, CONTENT_W, 42, '#fff7f7');
        doc.fillColor(COLORS.fail).font('Helvetica-Bold').fontSize(8.5);
        doc.text('SCAN NÃO CONCLUÍDO', M + 14, doc.y + 8);
        doc.font('Helvetica').fontSize(8).fillColor(COLORS.body);
        doc.text(clean(data.scanError || 'A varredura foi interrompida antes de coletar todos os dados.', 220), M + 14, doc.y + 22, {
            width: CONTENT_W - 28,
        });
        doc.y += 54;
    }

    // ================== SUMÁRIO EXECUTIVO ==================
    doc.y = ensureSpace(30);
    if (doc.y <= M + 4) {
        newPage();
        doc.y = M;
    } else if (doc.y > BOTTOM - 120 && severityTotal(data) > 0) {
        // deixa o sumário começar limpo
    }
    startSection('Resumo Executivo', 210);

    const mcW = (CONTENT_W - cardGap * 3) / 4;
    const cards: Array<{ label: string; value: string; color: string }> = [
        { label: 'Score Geral', value: `${data.score}/100`, color: getGradeColor(data.grade) },
        { label: 'Headers Seguros', value: `${data.headersPassed}/${data.headersTotal}`, color: COLORS.ink },
        { label: 'Cookies Seguros', value: `${data.cookiesSecure}/${data.cookiesTotal}`, color: COLORS.ink },
        {
            label: 'TLS / SSL',
            value: data.tls.status === 'ok' ? 'OK' : data.tls.status === 'alert' ? 'ALERTA' : 'FALHO',
            color: BADGE_COLORS[data.tls.status],
        },
    ];
    cards.forEach((c, i) => {
        metricCard(M + i * (mcW + cardGap), doc.y, mcW, c.label, c.value, c.color);
    });
    doc.y += 66;
    const cards2 = [
        { label: 'DNS Score', value: `${data.dns.score}/100`, color: data.dns.score >= 80 ? COLORS.ok : COLORS.ink },
        { label: 'Tecnologias', value: String(data.techCount), color: COLORS.ink },
        { label: 'Subdomínios', value: String(data.subdomainsCount), color: COLORS.ink },
        { label: 'Total de Achados', value: String(totalFindings), color: totalFindings >= 5 ? COLORS.fail : COLORS.ink },
    ];
    cards2.forEach((c, i) => {
        metricCard(M + i * (mcW + cardGap), doc.y, mcW, c.label, c.value, c.color);
    });
    doc.y += 66;

    // Donut + barras por categoria
    doc.y = ensureSpace(180);
    if (doc.y + 180 > BOTTOM) {
        newPage();
        doc.y = M;
    }
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.ink);
    doc.text('DISTRIBUIÇÃO DE ACHADOS POR SEVERIDADE', M, doc.y);
    const donutR = 52;
    const dcy = doc.y + 70;
    const dList = sevKeys.filter((k) => (data.severityCounts[k] ?? 0) > 0);
    donut(W / 2 - 40, dcy, donutR, dList.map((k) => ({ value: data.severityCounts[k] ?? 0, color: SEVERITY_PALETTE[k] })), totalFindings);
    // legenda
    const lx = W / 2 + 10;
    let ly = doc.y + 28;
    dList.forEach((k) => {
        const col = SEVERITY_PALETTE[k];
        doc.save().rect(lx, ly, 11, 11).fill(col).restore();
        doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.inkSoft);
        doc.text(SEVERITY_LABEL[k], lx + 16, ly - 1, { width: 90 });
        doc.font('Helvetica').fontSize(8).fillColor(COLORS.mute);
        doc.text(String(data.severityCounts[k]), lx + 110, ly - 1, { width: 30, align: 'right' });
        doc.font('Helvetica').fontSize(6.5).fillColor(COLORS.faint);
        doc.text(`${totalFindings ? Math.round(((data.severityCounts[k] ?? 0) / totalFindings) * 100) : 0}%`, lx + 140, ly, { width: 30 });
        ly += 16;
    });
    if (totalFindings === 0) {
        doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.faint).text('Nenhum achado registrado.', W / 2 + 10, doc.y + 34, { width: 160 });
    }
    doc.y = Math.max(dcy + donutR, ly + 4);

    // Barras por categoria
    doc.y = ensureSpace(130);
    const headerPct = data.headersTotal > 0 ? (data.headersPassed / data.headersTotal) * 100 : null;
    const cookiePct = data.cookiesTotal > 0 ? (data.cookiesSecure / data.cookiesTotal) * 100 : data.cookiesTotal === 0 ? 100 : null;
    const tlsPct = data.tls.status === 'ok' ? 100 : data.tls.status === 'alert' ? 60 : 20;
    const dnsPct = data.dns.score;

    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.ink);
    doc.text('COBERTURA DE CONTROLES POR CATEGORIA', M, doc.y);
    doc.y += 14;
    categoryBar(M, doc.y, 100, 'Headers HTTP', headerPct);
    categoryBar(M, doc.y, 100, 'TLS / Transporte', tlsPct);
    categoryBar(M, doc.y, 100, 'Cookies', cookiePct);
    categoryBar(M, doc.y, 100, 'DNS / E-mail', dnsPct);
    doc.y += 6;
```

</details>

> **Atenção:** o bloco original usa `sevKeys`, `cardGap`, `mcW`, `dList`, `gradeColor` etc.
> como variáveis próprias, então **remova** do bloco atual qualquer declaração dessas variáveis
> que tenha ficado dentro da região substituída (o conteúdo do bloco acima já as redeclara).

---

## 8. Passo F — Reverter a correção dos KPI cards (opcional, para byte a byte)

No bloco original (seção 7) a fileira usa `metricCard(..., doc.y, ...)` — isso está no
código restaurado, sem alterações adicionais. Nenhum passo extra é necessário para os KPIs.

---

## 9. Passo G — Reverter a correção do painel de flags DNS (opcional)

A correção do `flagsY` na seção `DNS & SUBDOMÍNIOS` pode ser revertida devolvendo o
`doc.y` dinâmico:

```ts
    // ANTES (original):
    const fw = (CONTENT_W - 18) / 4;
    flags.forEach((f, i) => {
        const fx = M + i * (fw + 6);
        box(fx, doc.y, fw, 42);
        doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.mute);
        doc.text(f[0], fx + 10, doc.y + 6, { width: fw - 20 });
        badge(fx + 10, doc.y + 20, f[2]);
    });
    doc.y += 54;
```

---

## 10. Validação pós-rollback

```bash
cd D:\AIDir\radar-security
npx tsc --noEmit
npx eslint src/lib/report/pdfReport.ts
docker compose up -d --build radar worker
curl.exe -s -o report.pdf "http://localhost:3000/api/scan/21/report/pdf"
```

Resultado esperado: **7 páginas** no PDF do scan 21 (o redesign gera 6 páginas).