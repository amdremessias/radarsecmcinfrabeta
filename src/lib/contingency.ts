import type { PassiveScanResult } from '@/lib/scanner/passiveScanner';

export interface PlanoAcao {
    id: string;
    titulo: string;
    prioridade: 'alta' | 'media' | 'baixa';
    categoria: 'headers' | 'tls' | 'dns' | 'infra' | 'lgpd' | 'processo';
    acoes: string[];
    status: 'pendente' | 'em_andamento' | 'concluida';
}

export interface PlanoContingencia {
    dominio: string;
    score: number;
    nota: string;
    gerado_em: string;
    resumo: string;
    plano: PlanoAcao[];
}

type ScanLike = {
    target_url?: string;
    domain?: string;
    score?: number;
    grade?: string;
    headers?: any[];
    vulnerabilities?: string[];
    tls?: any;
    dns?: any;
    technology?: any[];
    info_disclosure?: Record<string, any>;
    exposure?: Partial<PassiveScanResult>;
    lgpd?: {
        checks?: Array<{ id: string; passed: boolean; severity: string; title: string; recommendation: string }>;
        metrics?: { critical_failures?: number; high_failures?: number; compliance_score?: number };
    };
};

const NOTA_LABEL: Record<string, string> = {
    A: 'Excelente',
    B: 'Bom',
    C: 'Regular',
    D: 'Atenção',
    E: 'Crítico',
    F: 'Crítico',
};

export function generateContingencyPlan(scan: ScanLike): PlanoContingencia {
    const dominio = scan.domain || (scan.target_url ? new URL(scan.target_url).hostname : '—');
    const score = scan.score ?? 0;
    const nota = scan.grade || (score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : score >= 40 ? 'E' : 'F');

    const plano: PlanoAcao[] = [];
    const headers: any[] = Array.isArray(scan.headers) ? scan.headers : [];
    const vulns: string[] = Array.isArray(scan.vulnerabilities) ? scan.vulnerabilities : [];
    const dns: any = scan.dns || {};

    const missingHeaders = headers.filter((h) => !h?.present);
    if (missingHeaders.length > 0) {
        plano.push({
            id: 'headers',
            titulo: 'Cabeçalhos de segurança ausentes',
            prioridade: 'alta',
            categoria: 'headers',
            status: 'pendente',
            acoes: missingHeaders.map((h) => h?.recommendation || `Implementar ${h?.header}`),
        });
    }

    const tlsIssues: string[] = Array.isArray(scan.tls?.issues) ? scan.tls.issues : [];
    const tlsUnavailable = tlsIssues.includes('TLS scan failed');
    if (!tlsUnavailable && (tlsIssues.length > 0 || scan.tls?.daysRemaining != null && scan.tls.daysRemaining < 30)) {
        plano.push({
            id: 'tls',
            titulo: 'TLS / certificado',
            prioridade: scan.tls?.score < 80 ? 'alta' : 'media',
            categoria: 'tls',
            status: 'pendente',
            acoes: tlsIssues.length > 0 ? tlsIssues : ['Renovar certificado e manter TLS 1.2+'],
        });
    }

    if (dns.score !== undefined && dns.score < 90) {
        const acoes: string[] = [];
        const txt: string[] = Array.isArray(dns.txt) ? dns.txt : [];
        if (!txt.some((t) => /v=spf1/i.test(t))) acoes.push('Publicar registro SPF (proteção de e-mail)');
        if (!txt.some((t) => /dmarc/i.test(t))) acoes.push('Publicar política DMARC');
        if (!txt.some((t) => /dkim/i.test(t))) acoes.push('Configurar assinatura DKIM');
        if (!dns.mta_sts_policy) acoes.push('Habilitar política MTA-STS para e-mail');

        if (acoes.length > 0) {
            plano.push({
                id: 'dns',
                titulo: 'Segurança de DNS / e-mail',
                prioridade: 'media',
                categoria: 'dns',
                status: 'pendente',
                acoes,
            });
        }
    }

    if (vulns.length > 0) {
        plano.push({
            id: 'vulns',
            titulo: 'Corrigir pontos de exposição',
            prioridade: 'alta',
            categoria: 'infra',
            status: 'pendente',
            acoes: vulns,
        });
    }

    const exposedFiles: any[] = Array.isArray(scan.exposure?.exposed_files) ? scan.exposure.exposed_files : [];
    if (exposedFiles.length > 0) {
        const hasCritical = exposedFiles.some((f) => f?.severity === 'CRITICAL' || f?.severity === 'HIGH');
        const capped = exposedFiles.slice(0, 6);
        plano.push({
            id: 'exposicao',
            titulo: 'Arquivos e configurações sensíveis expostos',
            prioridade: hasCritical ? 'alta' : 'media',
            categoria: 'infra',
            status: 'pendente',
            acoes: capped.map((f) => `Remover/ocultar acesso a ${f?.type || 'arquivo'} em ${f?.path || '?'} (severidade ${f?.severity || 'INFO'})`),
        });
    }

    // LGPD (Lei 13.709/2018): itens críticos/altos viram plano de ação
    const lgpdChecks: any[] = Array.isArray(scan.lgpd?.checks) ? scan.lgpd!.checks! : [];
    const lgpdFailures = lgpdChecks.filter((c) => !c?.passed && (c?.severity === 'critical' || c?.severity === 'high'));
    if (lgpdFailures.length > 0) {
        plano.push({
            id: 'lgpd',
            titulo: 'Conformidade LGPD (Lei 13.709/2018)',
            prioridade: 'alta',
            categoria: 'lgpd',
            status: 'pendente',
            acoes: lgpdFailures.slice(0, 6).map((c) => c.recommendation || c.title),
        });
    } else {
        const lgpdMedium = lgpdChecks.filter((c) => !c?.passed && c?.severity === 'medium');
        if (lgpdMedium.length > 0) {
            plano.push({
                id: 'lgpd',
                titulo: 'Aprimorar conformidade LGPD',
                prioridade: 'media',
                categoria: 'lgpd',
                status: 'pendente',
                acoes: lgpdMedium.slice(0, 4).map((c) => c.recommendation || c.title),
            });
        }
    }

    if (plano.length === 0) {
        plano.push({
            id: 'monitorar',
            titulo: 'Manter monitoramento contínuo',
            prioridade: 'baixa',
            categoria: 'processo',
            status: 'pendente',
            acoes: [
                'Agendar scans recorrentes (semanal / mensal)',
                'Acompanhar evolução da nota no dashboard',
                'Estabelecer alerta de variação de score',
            ],
        });
    }

    const resumo =
        score >= 80
            ? `Postura de segurança ${NOTA_LABEL[nota]?.toLowerCase() || 'robusta'} (${score}/100). Manter o monitoramento recorrente.`
            : score >= 60
              ? `Existem pontos de melhoria relevantes (${score}/100). Priorize a correção dos cabeçalhos e infraestrutura exposta.`
              : `Nível de segurança crítico (${score}/100). Recomenda-se ação imediata nos itens de prioridade alta.`;

    return {
        dominio,
        score,
        nota,
        gerado_em: new Date().toISOString(),
        resumo,
        plano,
    };
}