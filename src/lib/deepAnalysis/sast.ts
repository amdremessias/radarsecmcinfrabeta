import type {
    DeepFinding,
    DeepPillarId,
    DeepSeverity,
    DeepStrength,
} from '@/types/deepAnalysis';
import { DEEP_PILLAR_LABEL } from '@/types/deepAnalysis';
import type { WalkedFile } from './extract';
import { readSourceFile } from './extract';
import { LINE_RULES, STRENGTH_SIGNALS, fileRuleFindings } from './rules';
import type { StrengthSignal } from './rules';

const MAX_FINDINGS = 320;
const SNIPPET_RADIUS = 2;

export interface SastOutcome {
    findings: DeepFinding[];
    strengths: DeepStrength[];
    filesScanned: number;
}

function buildGithubMd(input: {
    title: string;
    severity: DeepSeverity;
    pillar: DeepPillarId;
    filePath: string;
    line: number;
    code: string;
    why: string;
    fix: string;
}): string {
    const sevLabel: Record<DeepSeverity, string> = {
        CRITICA: 'Crítica',
        ALTA: 'Alta',
        MEDIA: 'Média',
        BAIXA: 'Baixa',
        PONTO_FORTE: 'Ponto forte',
    };
    return [
        `## ${input.title}`,
        '',
        `**Severidade:** ${sevLabel[input.severity]}`,
        `**Pilar:** ${DEEP_PILLAR_LABEL[input.pillar]}`,
        `**Arquivo:** \`${input.filePath}:${input.line}\``,
        '',
        '```',
        input.code,
        '```',
        '',
        `**Por que é explorável:** ${input.why}`,
        '',
        `**Correção sugerida:** ${input.fix}`,
        '',
        '_Gerado pelo Motor SAST-Radar (análise estática). Revise antes de aplicar._',
    ].join('\n');
}

function makeFinding(input: {
    title: string;
    severity: DeepSeverity;
    pillar: DeepPillarId;
    filePath: string;
    line: number;
    code: string;
    snippet: string[];
    why: string;
    fix: string;
    stack?: string;
}): DeepFinding {
    return {
        id: `${input.pillar}:${input.title}~${input.filePath}:${input.line}`,
        ...input,
        githubMd: buildGithubMd(input),
    };
}

function localSnippet(lines: string[], idx: number): string[] {
    return lines
        .slice(Math.max(0, idx - SNIPPET_RADIUS), idx + SNIPPET_RADIUS + 1)
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 6);
}

export async function runSast(
    files: WalkedFile[],
    stackLabel: string,
    sourceType: 'zip' | 'git'
): Promise<SastOutcome> {
    const findings: DeepFinding[] = [];
    const strengths: DeepStrength[] = [];
    let filesScanned = 0;

    const perFileHits = new Set<string>();
    const strengthState = new Map<
        string,
        { hits: number; files: Set<string>; filePath: string; line: number; code: string }
    >();

    function bumpStrength(signal: StrengthSignal, filePath: string, line: number, code: string) {
        let st = strengthState.get(signal.id);
        if (!st) {
            st = { hits: 0, files: new Set(), filePath, line, code };
            strengthState.set(signal.id, st);
        }
        if (st.files.has(filePath)) return;
        st.files.add(filePath);
        st.hits += 1;
        if (st.filePath === filePath || st.code === code) {
            // mantém a primeira ocorrência como representativa
        }
    }

    for (const file of files) {
        const content = await readSourceFile(file);
        if (content === null) continue;
        filesScanned += 1;
        const lines = content.split(/\r?\n/);

        for (const rule of LINE_RULES) {
            if (rule.include && !rule.include.test(file.relPath)) continue;
            if (rule.exclude && rule.exclude.test(file.relPath)) continue;
            let hits = 0;
            for (let i = 0; i < lines.length; i++) {
                if (rule.maxPerFile !== undefined && hits >= rule.maxPerFile) break;
                const line = lines[i];
                const matched = rule.patterns.some((p) => {
                    p.lastIndex = 0;
                    return p.test(line);
                });
                if (!matched) continue;
                const code = line.trim().slice(0, 200);
                if (rule.skip && rule.skip(code)) {
                    perFileHits.add(`${rule.id}:${file.relPath}`);
                    continue;
                }
                const key = `${rule.id}:${file.relPath}:${i}`;
                if (perFileHits.has(key)) continue;
                perFileHits.add(key);
                hits += 1;
                if (findings.length >= MAX_FINDINGS) break;
                findings.push(
                    makeFinding({
                        title: rule.title,
                        severity: rule.severity,
                        pillar: rule.pillar,
                        filePath: file.relPath,
                        line: i + 1,
                        code,
                        snippet: localSnippet(lines, i),
                        why: rule.why,
                        fix: rule.fix,
                        stack: stackLabel,
                    })
                );
            }
            if (findings.length >= MAX_FINDINGS) break;
        }
        if (findings.length >= MAX_FINDINGS) break;

        for (const fr of fileRuleFindings(file, lines, { sourceType })) {
            if (findings.length >= MAX_FINDINGS) break;
            const code = fr.code || file.relPath.split('/').pop() || file.relPath;
            findings.push(
                makeFinding({
                    title: fr.title,
                    severity: fr.severity,
                    pillar: fr.pillar ?? ('chaves' as DeepPillarId),
                    filePath: file.relPath,
                    line: fr.line ?? 1,
                    code,
                    snippet: localSnippet(lines, (fr.line ?? 1) - 1),
                    why: fr.why,
                    fix: fr.fix,
                    stack: stackLabel,
                })
            );
        }

        for (const signal of STRENGTH_SIGNALS) {
            if (signal.exclude && signal.exclude.test(file.relPath)) continue;
            if (signal.include && !signal.include.test(file.relPath)) continue;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const matched = signal.patterns.some((p) => {
                    p.lastIndex = 0;
                    return p.test(line);
                });
                if (matched) {
                    bumpStrength(signal, file.relPath, i + 1, line.trim().slice(0, 180));
                    break;
                }
            }
        }
    }

    for (const signal of STRENGTH_SIGNALS) {
        const st = strengthState.get(signal.id);
        if (!st || st.hits < signal.minHits) continue;
        strengths.push({
            id: `${signal.id}~${st.filePath}:${st.line}`,
            severity: 'PONTO_FORTE',
            pillar: signal.pillar,
            title: signal.title,
            filePath: st.filePath,
            line: st.line,
            code: st.code,
            snippet: [],
            why: signal.why,
            fix: signal.fix,
            githubMd: buildGithubMd({
                title: signal.title,
                severity: 'PONTO_FORTE',
                pillar: signal.pillar,
                filePath: st.filePath,
                line: st.line,
                code: st.code,
                why: signal.why,
                fix: signal.fix,
            }),
            stack: stackLabel,
        });
    }

    return { findings, strengths, filesScanned };
}

export function buildSummary(
    findings: DeepFinding[],
    strengths: DeepStrength[],
    scannedFiles: number
) {
    const count = (severity: DeepSeverity) => findings.filter((f) => f.severity === severity).length;
    const pillarCount = (pillar: DeepPillarId) =>
        findings.filter((f) => f.pillar === pillar).length;
    return {
        total: findings.length,
        banco: pillarCount('banco'),
        permissoes: pillarCount('permissoes'),
        idor: pillarCount('idor'),
        chaves: pillarCount('chaves'),
        inputs: pillarCount('inputs'),
        strengths: strengths.length,
        critica: count('CRITICA'),
        alta: count('ALTA'),
        media: count('MEDIA'),
        baixa: count('BAIXA'),
        sastModel: 'Motor SAST-Radar v1.0 · análise estática de código-fonte',
        scannedFiles,
    };
}