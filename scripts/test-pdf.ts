import { generatePdfReport, buildReportData } from '../src/lib/report/pdfReport';

async function testPdf() {
    const mockData = {
        id: 999,
        targetUrl: 'https://exemplo.com.br',
        domain: 'exemplo.com.br',
        score: 65,
        grade: 'D',
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: 3500,
        headers: [
            { header: 'strict-transport-security', present: false, value: null, score: 0, recommendation: 'Habilite o cabeçalho HSTS para forçar conexões seguras HTTPS' },
            { header: 'content-security-policy', present: false, value: null, score: 0, recommendation: 'Adicione o cabeçalho Content-Security-Policy para prevenir ataques de XSS' },
            { header: 'x-frame-options', present: true, value: 'DENY', score: 10, recommendation: null },
            { header: 'x-content-type-options', present: true, value: 'nosniff', score: 10, recommendation: null },
            { header: 'permissions-policy', present: false, value: null, score: 0, recommendation: 'Adicione Permissions-Policy' },
            { header: 'referrer-policy', present: false, value: null, score: 0, recommendation: 'Adicione Referrer-Policy' },
        ],
        cookies: [
            { name: 'session_id', httpOnly: true, secure: true, sameSite: 'lax', score: 15, recommendation: null },
            { name: 'tracking', httpOnly: false, secure: false, sameSite: null, score: 0, recommendation: 'Adicione flags HttpOnly e Secure' },
        ],
        tls: {
            protocol: 'TLSv1.2',
            cipher: 'ECDHE-RSA-AES128-GCM-SHA256',
            issuer: "Let's Encrypt",
            validFrom: '2024-01-01',
            validTo: '2024-12-31',
            daysRemaining: 45,
            issues: [],
            score: 80,
        },
        dns: {
            domain: 'exemplo.com.br',
            records: [
                { type: 'A', data: '192.0.2.1' },
                { type: 'MX', data: 'mail.exemplo.com.br' },
                { type: 'TXT', data: 'v=spf1 include:_spf.exemplo.com.br ~all' },
            ],
            mx: ['mail.exemplo.com.br'],
            txt: ['v=spf1 include:_spf.exemplo.com.br ~all', 'v=dmarc1; p=quarantine; rua=mailto:dmarc@exemplo.com.br'],
            mta_sts_policy: false,
            subdomains: [
                { subdomain: 'www.exemplo.com.br', ip: '192.0.2.1', alive: true },
                { subdomain: 'api.exemplo.com.br', ip: '192.0.2.2', alive: true },
                { subdomain: 'dev.exemplo.com.br', ip: '192.0.2.3', alive: false },
            ],
            score: 72,
        },
        technology: [
            { name: 'Nginx', category: 'Web Server', confidence: 95 },
            { name: 'WordPress', category: 'CMS', confidence: 90 },
            { name: 'PHP', category: 'Programming Language', confidence: 85 },
            { name: 'MySQL', category: 'Database', confidence: 80 },
        ],
        vulnerabilities: [
            'Cabeçalho HSTS ausente - vulnerável a ataques de downgrade de protocolo',
            'Cabeçalho Content-Security-Policy ausente - vulnerável a ataques XSS',
            'Cabeçalho Permissions-Policy ausente',
        ],
        cve_matches: [],
        info_disclosure: {
            server_exposed: false,
            poweredBy_exposed: false,
        },
        subdomains_found: [],
        ports_found: [],
        exposure: {
            domain: 'exemplo.com.br',
            metrics: { subdomains_found_count: 3, exposed_files_count: 3, calculated_penalty: 45 },
            subdomains: ['api.exemplo.com.br', 'dev.exemplo.com.br', 'staging.exemplo.com.br'],
            exposed_files: [
                { path: '/.env', url: 'https://exemplo.com.br/.env', status: 'EXPOSED', type: 'Credenciais / Configuração', severity: 'CRITICAL', size_bytes: 380 },
                { path: '/backup.sql', url: 'https://exemplo.com.br/backup.sql', status: 'EXPOSED', type: 'Dump de Banco de Dados', severity: 'CRITICAL', size_bytes: 512000 },
                { path: '/config.json', url: 'https://exemplo.com.br/config.json', status: 'EXPOSED', type: 'Arquivo de Configuração', severity: 'MEDIUM', size_bytes: 2048 },
            ],
        },
        error: null,
        status: 'completed',
    };

    const reportData = buildReportData(mockData as any);
    console.log('Report data built. Severity counts:', reportData.severityCounts);
    console.log('Grade:', reportData.grade);
    console.log('Headers passed:', reportData.headersPassed);

    const pdfBuffer = await generatePdfReport(reportData);
    const fs = await import('fs');
    fs.writeFileSync('test-report.pdf', pdfBuffer);
    console.log(`PDF gerado com sucesso: test-report.pdf (${pdfBuffer.length} bytes)`);
}

testPdf().catch(console.error);
