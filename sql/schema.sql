-- Radar Security v1.0.0.1 - Full Platform Schema
-- All migrations are idempotent

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user', -- user | admin | superadmin
    active BOOLEAN NOT NULL DEFAULT TRUE,
    stripe_customer_id TEXT,
    subscription_tier TEXT DEFAULT 'free', -- free | pro | enterprise
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Scan Targets (multi-domain management)
CREATE TABLE IF NOT EXISTS scan_targets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    subdomains TEXT[],
    tags TEXT[],
    monitored BOOLEAN NOT NULL DEFAULT FALSE,
    scan_frequency TEXT DEFAULT 'manual', -- manual | daily | weekly | monthly
    last_scanned_at TIMESTAMPTZ,
    next_scan_at TIMESTAMPTZ,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_targets_user ON scan_targets(user_id);
CREATE INDEX IF NOT EXISTS idx_targets_domain ON scan_targets(domain);

-- Scans (individual scan results)
CREATE TABLE IF NOT EXISTS scans (
    id SERIAL PRIMARY KEY,
    target_id INTEGER REFERENCES scan_targets(id) ON DELETE SET NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    target_url TEXT NOT NULL,
    domain TEXT,
    scan_type TEXT NOT NULL DEFAULT 'full', -- full | headers | tls | dns | vuln
    status TEXT NOT NULL DEFAULT 'pending', -- pending | running | completed | failed | timeout
    score INTEGER,
    grade TEXT,
    headers JSONB DEFAULT '[]',
    cookies JSONB DEFAULT '[]',
    tls JSONB DEFAULT '{}',
    dns JSONB DEFAULT '{}',
    technology JSONB DEFAULT '{}',
    vulnerabilities JSONB DEFAULT '[]',
    info_disclosure JSONB DEFAULT '{}',
    subdomains_found TEXT[],
    ports_found INTEGER[],
    cve_matches TEXT[],
    error TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_scans_user ON scans(user_id);
CREATE INDEX IF NOT EXISTS idx_scans_target ON scans(target_id);
CREATE INDEX IF NOT EXISTS idx_scans_created ON scans(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scans_status ON scans(status);
CREATE INDEX IF NOT EXISTS idx_scans_score ON scans(score);

-- Scheduled Scans
CREATE TABLE IF NOT EXISTS scheduled_scans (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_id INTEGER REFERENCES scan_targets(id) ON DELETE SET NULL,
    frequency TEXT NOT NULL, -- daily | weekly | monthly
    scan_type TEXT NOT NULL DEFAULT 'full',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Alert Rules
CREATE TABLE IF NOT EXISTS alert_rules (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_id INTEGER REFERENCES scan_targets(id) ON DELETE SET NULL,
    condition TEXT NOT NULL, -- score_lt | header_missing | cert_expiring | vuln_found
    threshold INTEGER,
    notification_type TEXT NOT NULL, -- email | webhook | slack
    notification_target TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Alert History
CREATE TABLE IF NOT EXISTS alert_history (
    id SERIAL PRIMARY KEY,
    rule_id INTEGER NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
    scan_id INTEGER REFERENCES scans(id) ON DELETE SET NULL,
    message TEXT NOT NULL,
    severity TEXT NOT NULL, -- info | warning | critical
    notified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- API Keys (for external integrations)
CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_hash TEXT NOT NULL,
    label TEXT,
    permissions TEXT[],
    last_used_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Scan Comparisons (diff between scans)
CREATE TABLE IF NOT EXISTS scan_comparisons (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    baseline_scan_id INTEGER NOT NULL REFERENCES scans(id),
    compare_scan_id INTEGER NOT NULL REFERENCES scans(id),
    score_diff INTEGER,
    header_diffs JSONB DEFAULT '[]',
    tls_diffs JSONB DEFAULT '[]',
    vuln_diffs JSONB DEFAULT '[]',
    summary JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Usage tracking (for billing/limits)
CREATE TABLE IF NOT EXISTS usage_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action TEXT NOT NULL, -- scan | export | api_call | scheduled
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_logs(user_id, created_at);

-- =====================================================
-- v2 - Leads, Clientes e plano de contingência
-- =====================================================

CREATE TABLE IF NOT EXISTS clientes (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    company TEXT,
    domain TEXT,
    plan TEXT NOT NULL DEFAULT 'essencial', -- essencial | pro | enterprise
    status TEXT NOT NULL DEFAULT 'ativo',   -- ativo | inativo
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clientes_name ON clientes(name);

CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    company TEXT,
    target_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'novo', -- novo | contato | negocio | cliente | descartado
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);

ALTER TABLE scan_targets ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL;
ALTER TABLE scan_targets ADD COLUMN IF NOT EXISTS contingency_plan JSONB;
CREATE INDEX IF NOT EXISTS idx_targets_cliente ON scan_targets(cliente_id);

ALTER TABLE scans ADD COLUMN IF NOT EXISTS lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS contingency_plan JSONB;
CREATE INDEX IF NOT EXISTS idx_scans_lead ON scans(lead_id);
CREATE INDEX IF NOT EXISTS idx_scans_cliente ON scans(cliente_id);

-- v2.5 - Automação: descoberta passiva de subdomínios (CT logs) + arquivos sensíveis expostos
ALTER TABLE scans ADD COLUMN IF NOT EXISTS exposure JSONB;

-- v2.1 - Níveis de acesso (admin | gestor | cliente) e consultoria
ALTER TABLE users ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_users_cliente ON users(cliente_id);

ALTER TABLE leads ADD COLUMN IF NOT EXISTS consulting_requested_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_leads_consulting ON leads(consulting_requested_at);

-- v2.2 - LGPD: registro de consentimento do titular
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lgpd_consent_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lgpd_consent_ip TEXT;

-- v2.5 - Análise de conformidade LGPD (Lei 13.709/2018)
ALTER TABLE scans ADD COLUMN IF NOT EXISTS lgpd JSONB;

-- v2.5 - Arquivar/limpar análises
ALTER TABLE scans ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS archived_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_scans_archived ON scans(archived_at) WHERE archived_at IS NOT NULL;

-- v2.4 - Análise Profunda de Código (SAST)
CREATE TABLE IF NOT EXISTS deep_analysis (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    project_name TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'zip', -- zip | git
    repository_url TEXT,
    branch TEXT,
    stack JSONB DEFAULT '{}',
    findings JSONB DEFAULT '[]',
    strengths JSONB DEFAULT '[]',
    summary JSONB DEFAULT '{}',
    file_count INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'completed', -- completed | failed
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deep_analysis_user ON deep_analysis(user_id);
CREATE INDEX IF NOT EXISTS idx_deep_analysis_created ON deep_analysis(created_at DESC);


-- =====================================================
-- v2.6 - OSINT / Username Tracker (Sherlock)
-- =====================================================

CREATE TABLE IF NOT EXISTS osint_scans (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending | running | completed | failed | timeout
    sites_total INTEGER NOT NULL DEFAULT 0,
    sites_found INTEGER NOT NULL DEFAULT 0,
    success_rate NUMERIC(5,2) DEFAULT 0.00,
    execution_time_ms INTEGER,
    raw_stdout TEXT,
    raw_stderr TEXT,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    options JSONB
);

CREATE INDEX IF NOT EXISTS idx_osint_scans_username ON osint_scans(username);
CREATE INDEX IF NOT EXISTS idx_osint_scans_status ON osint_scans(status);
CREATE INDEX IF NOT EXISTS idx_osint_scans_created ON osint_scans(created_at DESC);

CREATE TABLE IF NOT EXISTS osint_scan_results (
    id SERIAL PRIMARY KEY,
    scan_id INTEGER NOT NULL REFERENCES osint_scans(id) ON DELETE CASCADE,
    site_name TEXT NOT NULL,
    url TEXT,
    found BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT, -- found | not_found | error | unknown
    message TEXT,
    matched_username TEXT,
    data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_osint_results_scan ON osint_scan_results(scan_id);
CREATE INDEX IF NOT EXISTS idx_osint_results_found ON osint_scan_results(found);
CREATE INDEX IF NOT EXISTS idx_osint_results_site ON osint_scan_results(site_name);

-- v2.7 - OSINT: opções avançadas de busca (idempotente p/ bancos já existentes)
ALTER TABLE osint_scans ADD COLUMN IF NOT EXISTS options JSONB;
ALTER TABLE osint_scan_results ADD COLUMN IF NOT EXISTS matched_username TEXT;
ALTER TABLE osint_scan_results ADD COLUMN IF NOT EXISTS data JSONB;

-- =====================================================
-- v2.8 - OSINT / Domain Recon (theHarvester)
-- =====================================================

CREATE TABLE IF NOT EXISTS harvest_scans (
    id SERIAL PRIMARY KEY,
    target TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending | running | completed | failed | timeout
    sources TEXT,
    options JSONB,
    result_count INTEGER NOT NULL DEFAULT 0,
    counts JSONB,                            -- { hostname: n, email: n, ip: n, ... }
    evidence_status TEXT,                    -- complete | partial | failed
    source_status JSONB,                     -- source_executions[] resumido
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
    result_type TEXT NOT NULL, -- hostname | email | ip | asn | url | person | breach | ...
    value TEXT NOT NULL,
    sources TEXT[],
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_harvest_results_scan ON harvest_results(scan_id);
CREATE INDEX IF NOT EXISTS idx_harvest_results_type ON harvest_results(scan_id, result_type);

-- v2.9 - Chaves de API do theHarvester (fontes keyed / "com API")
-- O segredo (JSON de campos) é guardado cifrado com AES-256-GCM pelo app;
-- o worker decifra em tempo de execução e injeta o api-keys.yaml no container.
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
