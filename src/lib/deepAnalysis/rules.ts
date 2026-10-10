import type { DeepPillarId, DeepSeverity } from '@/types/deepAnalysis';
import type { WalkedFile } from './extract';

export interface LineRule {
    id: string;
    pillar: DeepPillarId;
    severity: DeepSeverity;
    title: string;
    why: string;
    fix: string;
    patterns: RegExp[];
    include?: RegExp;
    exclude?: RegExp;
    maxPerFile?: number;
    skip?: (code: string) => boolean;
}

export interface FileRuleCtx {
    sourceType: 'zip' | 'git';
}

export interface FileRuleResult {
    pillar: DeepPillarId;
    severity: DeepSeverity;
    title: string;
    why: string;
    fix: string;
    line?: number;
    code?: string;
}

export interface StrengthSignal {
    pillar: DeepPillarId;
    id: string;
    title: string;
    why: string;
    fix: string;
    patterns: RegExp[];
    minHits: number;
    include?: RegExp;
    exclude?: RegExp;
}

const CODE_EXCLUSIONS = /(your[_-]|example|changeme|lorem|dummy|placeholder|sample|demonstr|fox\.com|replace[_-]|fake[_-]|xxx|passw0rd|test[_-]?(?:key|pass|secret|token))/i;

export const LINE_RULES: LineRule[] = [
    // ---------- PILAR 1 · BANCO SEM TRANCA ----------
    {
        id: 'sql-dynamic',
        pillar: 'banco',
        severity: 'CRITICA',
        title: 'Consulta SQL montada por concatenação/interpolação',
        why: 'Parâmetros do usuário inseridos em SQL de forma dinâmica permitem SQL Injection: o input pode quebrar a string e executar comandos arbitrários no banco.',
        fix: 'Use prepared statements / binds (ex.: SELECT * FROM u WHERE id = $1, com o valor como parâmetro) ou um ORM que parametrize automaticamente.',
        patterns: [
            /(?:select\s+[^;]{0,160}|insert\s+into[^;]{0,160}|update[^;]{0,160}|delete\s+from[^;]{0,160})["'`]\s*\+/i,
            /(?:select\s+[^;]{0,160}|insert\s+into[^;]{0,160}|update[^;]{0,160}|delete\s+from[^;]{0,160})[^`]*\$\{/i,
            /(?:select|insert into|update|delete from)[^;]{0,120}(?:%s|\.format\(|%\([-_a-zA-Z0-9]+\b)/i,
        ],
        maxPerFile: 6,
    },
    {
        id: 'sql-user-input',
        pillar: 'banco',
        severity: 'CRITICA',
        title: 'Dado de entrada embutido diretamente em SQL',
        why: 'A consulta referencia diretamente um valor vindo da requisição (req/body/query/params) dentro do texto SQL sem parametrização, abrindo SQL Injection.',
        fix: 'Passe o valor como parâmetro/bind e somente use nomes de colunas via allowlist de valores permitidos.',
        patterns: [
            /(?:select|insert\s+into|update|delete\s+from)[^;]{0,120}["'`][^"'`]*(?:req|body|query|params)\.[a-zA-Z_][a-zA-Z0-9_]*/i,
            /(?:select|insert\s+into|update|delete\s+from)[^;]{0,80}(?:req|body|query|params)\.[a-zA-Z_]+\s*[;)]/i,
        ],
        maxPerFile: 6,
    },
    {
        id: 'sql-raw-orm',
        pillar: 'banco',
        severity: 'MEDIA',
        title: 'Execução de SQL cru em ORM/DAO',
        why: 'Uso de queryRaw/raw/execute()/knex.raw() com strings montadas em runtime; se houver interpolação sem binds, há risco de injeção.',
        fix: 'Sempre use parâmetros posicionais do próprio ORM (ex.: prisma.$queryRaw com template usando Prisma.sql/Prisma.join) e evite construir texto SQL manualmente.',
        patterns: [
            /(?:queryRaw|raw\s*\(|\.raw|sequelize\.query|knex\.raw|\.execute\s*\()[\s\S]{0,80}(?:select|insert|update|delete)/i,
            /(?:select|insert|update|delete)[^;]{0,80}(?:queryRaw|raw\s*\(|\.raw\s*\()/i,
        ],
        maxPerFile: 4,
    },

    // ---------- PILAR 2 · PERMISSÕES FROUXAS ----------
    {
        id: 'auth-hardcoded',
        pillar: 'permissoes',
        severity: 'ALTA',
        title: 'Verificação de permissão com valor fixo/codificado',
        why: 'Checagens como isAdmin = true, role = "admin" ou authorize() com valor chumbado podem ser contornadas ou conferir privilégio sem validação real do token/perfil.',
        fix: 'Derive o papel da sessão/token autenticado (ex.: getServerSession + role do banco) e valide permissões por middleware centralizado.',
        patterns: [
            /(?:isAdmin|isOwner|canAccess|authorize|requireAdmin|role)\s*[=:!]\s*(?:true|false|\[?["'][a-z]+["']|\$\{[^}]+\})/i,
            /(?:verify|check|hasRole)\s*\(\s*(?:true|1|0\s*\))\s*,?/i,
        ],
        maxPerFile: 4,
        skip: (code) => /example|mock|test|fixture/i.test(code),
    },
    {
        id: 'weak-password-check',
        pillar: 'permissoes',
        severity: 'ALTA',
        title: 'Comparação de senha em texto plano / sem hash',
        why: 'Comparar senha diretamente ==/=== armazena ou valida credencial sem hash e permite roubo de credenciais se o banco vazar.',
        fix: 'Armazene apenas hashes (bcrypt/argon2) e use a função de verificação própria da biblioteca.',
        patterns: [
            /password\s*(?:===|==|!==|!=)\s*[^;\n]/i,
            /(?:password|senha)\s*[=:]\s*["'][^"']{4,}["']/i,
        ],
        maxPerFile: 4,
        skip: (code) =>
            CODE_EXCLUSIONS.test(code) ||
            /\.env\b|\bgrep\b|\bawk\b|\bsed\b|process\.env|os\.environ|getenv|environ/i.test(code),
    },
    {
        id: 'public-without-auth',
        pillar: 'permissoes',
        severity: 'MEDIA',
        title: 'Decorador/flag de rota pública sem exposição clara do porquê',
        why: 'Anotações como @Public, noAuth/allowAnon liberam endpoints sem autenticação; sem auditoria podem expor rotas administrativas.',
        fix: 'Só libere rotas genuinamente públicas (login, healthcheck) e registre em testes de autenticação por rota.',
        patterns: [
            /@public|@allowanonymous|noauth\s*[:=]\s*true|allowanon\s*[:=]\s*true|public\s*:\s*true/i,
        ],
        maxPerFile: 3,
    },

    // ---------- PILAR 3 · IDOR À VISTA ----------
    {
        id: 'idor-direct-id',
        pillar: 'idor',
        severity: 'ALTA',
        title: 'ID fornecido pelo usuário usado direto na consulta',
        why: 'Acessar o registro usando apenas o ID vindo da URL/body sem filtrar por dono (usuario/cliente) permite trocar o ID e ler/alterar dados de terceiros (IDOR).',
        fix: 'Escopar a consulta pelo dono autenticado: WHERE id = $1 AND usuario_id = $2 (o $2 vem da sessão, nunca do request).',
        patterns: [
            /\b(?:findById|getById|deleteById|delete\(|update\(|findUnique|findFirst|findOne|firstOrThrow|take\(|destroy|findByPk)\s*\([^)]{0,60}(?:req\.(?:params|query|body)|body\.id|params\.id|ctx\.params|\$\{[^}]*id)/i,
            /\bwhere\s+["']?id["']?\s*=\s*(?:req|body|params)\.|\bwhere\s+id\s*=\s*\$1\b/i,
            /\b\.eq\(\s*["']id["']\s*,\s*(?:req|body|params|input)\b/i,
            /\bObjectId\s*\(\s*(?:req|params|body)\b/i,
        ],
        maxPerFile: 5,
        include: /\.(?:ts|tsx|js|jsx|py|go|php|rb|java|cs)$/i,
    },
    {
        id: 'idor-unsafe-params',
        pillar: 'idor',
        severity: 'MEDIA',
        title: 'Parâmetros de rota repassados sem validação de posse',
        why: 'O valor de params/query chega direto no serviço/repositório; sem scope por tenant qualquer cliente consegue acessar recursos de outro.',
        fix: 'Controle de acesso por camada: valide o dono do recurso antes da consulta e adicione tenant_id nos filtros.',
        patterns: [
            /\b(?:params|ctx\.params|body|req\.body)\.[a-zA-Z_]*id\b.*(?:find|get|delete|update|remove|select)/i,
            /(?:execute|run)\s*\(\s*(?:params|body|req)\.[a-zA-Z_]*id\b/i,
        ],
        maxPerFile: 4,
        include: /\.(?:ts|tsx|js|jsx|py|go|php|rb|java|cs)$/i,
    },

    // ---------- PILAR 4 · CHAVE NO CÓDIGO ----------
    {
        id: 'secret-hardcoded',
        pillar: 'chaves',
        severity: 'CRITICA',
        title: 'Segredo/apikey/token fixo no código-fonte',
        why: 'Credenciais versionadas ficam disponíveis para qualquer pessoa com acesso ao repositório, histórico, backup ou fornecedor de CI.',
        fix: 'Mova para variáveis de ambiente/segredos (Vault, credenciais da plataforma). Rotacione a credencial comprometida imediatamente.',
        patterns: [
            /\b(?:api[_-]?key|apikey|secret(?:[_-]?key)?|client[_-]?secret|access[_-]?token|auth[_-]?token|private[_-]?key|password|passwd)\b\s*[:=]\s*["'][^"'\s]{6,}["']/i,
            /\b(?:bearer|token|apikey)\s*[:=][\s]*["'][A-Za-z0-9._=-]{16,}["']/i,
        ],
        maxPerFile: 6,
        skip: (code) => CODE_EXCLUSIONS.test(code) || /process\.env|os\.environ|getenv|\.env\b/i.test(code),
    },
    {
        id: 'atm-key',
        pillar: 'chaves',
        severity: 'CRITICA',
        title: 'Chave de acesso AWS no repositório',
        why: 'Chaves AKIA/ASIA expostas permitem faturamento e acesso indevido à conta AWS de quem as possui.',
        fix: 'Rote a chave (revogue), remova do histórico (git filter-repo) e use IAM roles / secrets manager.',
        patterns: [/\b(?:AKIA|ASIA|AGPA)[0-9A-Z]{16}\b/i],
        maxPerFile: 3,
    },
    {
        id: 'token-pattern',
        pillar: 'chaves',
        severity: 'CRITICA',
        title: 'Token de serviço/SCM identificável no código',
        why: 'Padrões de token (GitHub, GitLab, Slack, OpenAI) confirmam segredo real exposto em texto.',
        fix: 'Rote o token e gerencie por secret/cofre. Nunca coloque tokens de integração em variáveis do repositório.',
        patterns: [
            /\b(?:github_pat_[A-Za-z0-9_]{22,}|ghp_[A-Za-z0-9]{20,}|ghs_[A-Za-z0-9]{20,}|glpat-[A-Za-z0-9_-]{16,}|xox[baprs]-[A-Za-z0-9-]{10,}|sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,})\b/,
        ],
        maxPerFile: 3,
    },
    {
        id: 'pem-inline',
        pillar: 'chaves',
        severity: 'CRITICA',
        title: 'Chave privada PEM embutida no código',
        why: 'Uma chave privada vazada permite forjar identidade/sessões/TLS da aplicação.',
        fix: 'Revogue e gere nova chave; armazene em cofre com acesso restrito por deploy.',
        patterns: [/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
        maxPerFile: 2,
    },
    {
        id: 'db-conn-creds',
        pillar: 'chaves',
        severity: 'ALTA',
        title: 'Connection string com credenciais no código',
        why: 'Usuário/senha embutidos em URLs de banco/services caem no versionamento e permitem acesso ao dado mesmo sem rede interna.',
        fix: 'Use apenas variáveis de ambiente (DATABASE_URL) e credenciais efêmeras por ambiente.',
        patterns: [
            /(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|rediss):\/\/[^:/\s]+:[^@/\s]+@/i,
        ],
        maxPerFile: 4,
        skip: (code) => /env/i.test(code),
    },
    {
        id: 'config-secret-value',
        pillar: 'chaves',
        severity: 'ALTA',
        title: 'Segredo com valor considerável em arquivo de configuração',
        why: 'Arquivos de config com campos secret/key/token com valores concretos costumam ser copiados para o repositório por engano.',
        fix: 'Externalize para variáveis de ambiente e adicione o arquivo ao .gitignore; gire o valor vazado.',
        patterns: [
            /"(?:secret|api[_-]?key|apikey|token)["']?\s*:\s*["'][^"']{12,}["']/i,
        ],
        maxPerFile: 4,
        include: /\.(?:json|yaml|yml|toml|env)$/i,
        skip: (code) => CODE_EXCLUSIONS.test(code),
    },

    // ---------- PILAR 5 · INPUTS SEM FILTRO ----------
    {
        id: 'xss-innerhtml',
        pillar: 'inputs',
        severity: 'ALTA',
        title: 'Injeção de HTML/JS no DOM com dado dinâmico',
        why: 'innerHTML/dangerouslySetInnerHTML/v-html com dado de usuário sem sanitização executa script no navegador da vítima (XSS).',
        fix: 'Use React/escape automático, texto por textContent e sanitize (DOMPurify) apenas se o HTML for realmente necessário.',
        patterns: [
            /\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write)\s*[+=]?\s*.*(?:req|body|params|user|input|query|data|result|item|\.value)\w*/i,
            /\bdangerouslySetInnerHTML\s*=/i,
            /\bv-html\s*=[^"']/i,
            /\$\{\s*(?:req|body|params|user|input)\b/i,
        ],
        maxPerFile: 5,
        include: /\.(?:tsx|jsx|vue|ts|js|html)$/i,
    },
    {
        id: 'xss-template-sink',
        pillar: 'inputs',
        severity: 'MEDIA',
        title: 'Motor de template renderizando entrada do usuário',
        why: 'render() com dados vindos da requisição e sem escape pode abrir Server-Side Template Injection ou XSS.',
        fix: 'Sempre escape no motor (tpl.autoescape) e nunca confie no input para nome de template.',
        patterns: [
            /(?:nunjucks|ejs|pug|mustache|handlebars|jinja2)\s*\.?\s*render\s*\([\s\S]{0,120}(?:req|input|body|params|user|json|data)\b/i,
            /template(?:\s*string)?\s*(?:Multi)?`[^`]*\$\{\s*(?:req|body|params|user|input)\b/i,
        ],
        maxPerFile: 3,
    },
    {
        id: 'eval-code',
        pillar: 'inputs',
        severity: 'CRITICA',
        title: 'eval/Function dinâmico com dado da requisição',
        why: 'Executar código arbitrário a partir de entrada do usuário é a porta direta para RCE.',
        fix: 'Remova eval/new Function. Reescreva com parser seguro/allowlist e jamais passe input do usuário para execução.',
        patterns: [
            /\beval\s*\(\s*(?:req|body|params|input|user|data|payload)\b/i,
            /\bnew\s+Function\s*\(\s*(?:req|body|params|input|user|data|payload|`)/i,
        ],
        maxPerFile: 4,
    },
    {
        id: 'command-injection',
        pillar: 'inputs',
        severity: 'CRITICA',
        title: 'Comando de sistema montado com entrada do usuário',
        why: 'exec/spawn com entrada concatenada permite executar comandos no servidor (RCE).',
        fix: 'Evite shell; use execFile com array de args, ou rejeite input por allowlist.',
        patterns: [
            /(?:exec|spawn|execSync|execa)\s*\(\s*["'`][^"'`]*?["'`]\s*\+/i,
            /(?:exec|spawn|execSync)\s*\(\s*(?:req|input|body|params|user|payload|`[^`]*\$)/i,
        ],
        maxPerFile: 4,
        include: /\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rb|php)$/i,
    },
    {
        id: 'open-redirect',
        pillar: 'inputs',
        severity: 'MEDIA',
        title: 'Redirecionamento controlado por parâmetro externo',
        why: 'redirect(payload) com URL vinda do request permite phishing/redirecionamento aberto.',
        fix: 'Valide contra allowlist de domínios relativos (so comece com "/") e nunca aceite URL absoluta arbitrária.',
        patterns: [
            /\b(?:redirect|res\.redirect|router\.push|window\.location)\s*\([\s\S]{0,60}(?:req|input|params|next|url|payload|query|body)\b/i,
        ],
        maxPerFile: 3,
    },
];

export function fileRuleFindings(spec: WalkedFile, lines: string[], ctx: FileRuleCtx): FileRuleResult[] {
    const results: FileRuleResult[] = [];
    const base = spec.relPath.split('/').pop() || spec.relPath;

    if (base.toLowerCase() === '.env' || /^\.env\.[a-z0-9]+$/i.test(base)) {
        results.push({
            pillar: 'chaves',
            severity: ctx.sourceType === 'git' ? 'CRITICA' : 'MEDIA',
            title: 'Arquivo .env versionado no repositório',
            why: 'O arquivo de ambiente com credenciais reais está no projeto/código; qualquer pessoa com acesso vê senhas, tokens e chaves.',
            fix: 'Remova de vez do histórico (git filter-repo/bfg), adicione ao .gitignore e crie apenas .env.example com placeholders.',
            line: 1,
            code: base,
        });
    }

    if (base === 'google-services.json' || base === 'GoogleService-Info.plist' || /^(serviceAccount|firebase-adminsdk)/i.test(base)) {
        results.push({
            pillar: 'chaves',
            severity: 'CRITICA',
            title: 'Credencial de serviço de conta (service account) exposta',
            why: 'Arquivo de credencial de serviço (Firebase/Google) vazado permite autenticar como a aplicação e acessar recursos do projeto.',
            fix: 'Remova do repositório, revogue no console e use Application Default Credentials / service account por deploy.',
            line: 1,
            code: base,
        });
    }

    const hasRoutes = lines.some((l) => /(?:app|router)\.(?:get|post|put|delete|patch)\s*\(/i.test(l));
    const touchesData = lines.some((l) => /(?:query|execute|find|create|update|delete|insert|select|save|client)\b[\s\S]{0,40}/i.test(l));
    const hasGuard = lines.some((l) =>
        /(?:requireAuth|requireAdmin|requireRole|isAuthenticated|authorize|getServerSession|verifyToken|validateToken|checkAuth|middleware|@Public|protected=true)/i.test(l)
    );
    const isRouteFile = /\.(?:ts|tsx|js|jsx|py|go|rb|php)$/i.test(spec.relPath);

    if (isRouteFile && hasRoutes && touchesData && !hasGuard) {
        results.push({
            pillar: 'permissoes',
            severity: 'MEDIA',
            title: 'Rotas de API sem checagem de autenticação/permissão no arquivo',
            why: 'Há rotas manipulando dados sem nenhuma referência de guard no mesmo arquivo; se o controle estiver ausente na cadeia, qualquer pessoa acessa.',
            fix: 'Centralize middleware de autenticação/RBAC nas rotas e adicione teste por endpoint validando requisição não autenticada (401).',
            line: 1,
            code: 'rotas detectadas sem guard de acesso próximo',
        });
    }

    return results;
}

export const STRENGTH_SIGNALS: StrengthSignal[] = [
    {
        pillar: 'banco',
        id: 'strength-param-sql',
        title: 'SQL parametrizado / binds em uso',
        why: 'O projeto usa placeholders (? , $1, :param) ou prepared statements, o que reduz muito o risco de SQL Injection.',
        fix: 'Mantenha a política: nenhuma SQL por concatenação; binds obrigatórios.',
        patterns: [
            /(?:select|insert|update|delete)[^;]{0,140}(?:\?|\$1|:\w+|\.params[:=]|\bprepare\b)/i,
        ],
        minHits: 2,
    },
    {
        pillar: 'inputs',
        id: 'strength-validators',
        title: 'Camadas de validação de entrada presentes',
        why: 'Schemas/validadores (zod, yup, joi, express-validator) indicam entradas checadas antes de uso.',
        fix: 'Estenda a validação para todas as entradas de API e formulários.',
        patterns: [
            /\b(?:zod|yup|joi|superstruct|express[-_]?(?:validator|validation)|cerberus|pydantic)\b/i,
            /\bvalidate\s*\(|\.parse\(|schema\.validate/i,
        ],
        minHits: 2,
        exclude: /node_modules|\.test\.|\.spec\./i,
    },
    {
        pillar: 'idor',
        id: 'strength-tenant-scope',
        title: 'Consultas com escopo por dono/tenant',
        why: 'Filtros por usuário/tenant (AND user_id, .eq("user_id")) bloqueiam troca de ID entre clientes.',
        fix: 'Padronize: todo acesso por ID precisa do filtro do dono autenticado.',
        patterns: [
            /\b(?:and|,)?\s*(?:user_id|userId|userID|tenant_id|cliente_id|owner_id)\s*[=:]\s*/i,
            /\.eq\(\s*["'](?:user_id|userId|tenant_id|owner_id)["']\s*,/i,
            /whereExists|belongsTo|scopeBy/i,
        ],
        minHits: 2,
        exclude: /\.test\.|\.spec\./i,
    },
    {
        pillar: 'chaves',
        id: 'strength-secrets-env',
        title: 'Segredos lidos de variáveis de ambiente',
        why: 'O projeto carrega chaves/tokens/senhas por process.env/os.environ, e não por literais no código.',
        fix: 'Mantenha e audite a lista de variáveis exigidas nos manifestos de deploy.',
        patterns: [
            /\b(?:process\.env\.[A-Z0-9_]{4,}|os\.environ\[["'][A-Z0-9_]{4,}|getenv\(["'][A-Z0-9_]{4,})/i,
        ],
        minHits: 3,
    },
    {
        pillar: 'permissoes',
        id: 'strength-auth-guard',
        title: 'Rotas protegidas por guarda de autenticação',
        why: 'Middleware/helpers de sessão e RBAC estão presentes no código, reduzindo rotas expostas.',
        fix: 'Confirme cobertura por testes de autorização em cada rota.',
        patterns: [
            /\b(?:requireAuth|requireAdmin|requireRole|isAuthenticated|getServerSession|verifyToken|authorize|ensureAuthenticated|middleware)\b/i,
        ],
        minHits: 2,
        exclude: /\.test\.|\.spec\./i,
    },
];