export type DeepSourceType = 'zip' | 'git';

export type DeepPillarId = 'banco' | 'permissoes' | 'idor' | 'chaves' | 'inputs';

export type DeepSeverity = 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAIXA' | 'PONTO_FORTE';

export interface DeepFinding {
    id: string;
    severity: DeepSeverity;
    pillar: DeepPillarId;
    title: string;
    filePath: string;
    line: number;
    code: string;
    snippet: string[];
    why: string;
    fix: string;
    githubMd: string;
    stack?: string;
}

export type DeepStrength = DeepFinding;

export interface DeepStack {
    language: string;
    framework?: string;
    orm?: string;
    database?: string;
    auth?: string;
    deploy: string[];
    fileCount: number;
    manifestFile?: string;
}

export interface DeepSummary {
    total: number;
    banco: number;
    permissoes: number;
    idor: number;
    chaves: number;
    inputs: number;
    strengths: number;
    critica: number;
    alta: number;
    media: number;
    baixa: number;
    sastModel: string;
    scannedFiles?: number;
}

export interface DeepAnalysisInput {
    projectName: string;
    sourceType: DeepSourceType;
    repositoryUrl?: string;
    branch?: string;
    apiToken?: string;
    zipBuffer?: Buffer;
    zipFileName?: string;
}

export interface DeepAnalysisResult {
    id?: number;
    projectName: string;
    sourceType: DeepSourceType;
    repositoryUrl?: string;
    branch?: string;
    stack: DeepStack;
    findings: DeepFinding[];
    strengths: DeepStrength[];
    summary: DeepSummary;
    fileCount: number;
    durationMs: number;
    createdAt?: string;
    status: 'completed' | 'failed';
    error?: string;
}

export const DEEP_PILLAR_LABEL: Record<DeepPillarId, string> = {
    banco: 'Banco Sem Tranca',
    permissoes: 'Permissões Frouxas',
    idor: 'IDOR à Vista',
    chaves: 'Chave no Código',
    inputs: 'Inputs Sem Filtro',
};

export const DEEP_PILLAR_LEGEND: Record<DeepPillarId, string> = {
    banco: 'SQL dinâmico, concatenação de consultas e ausência de binds',
    permissoes: 'Endpoints e rotas sem checagem de perfil/role',
    idor: 'Acesso direto a recursos por ID sem escopo por tenant/cliente',
    chaves: 'Segredos, tokens e credenciais versionados no código',
    inputs: 'Injeção de HTML/JS, XSS, eval e dados de usuário sem validação',
};