import { Vulnerability, Severity } from '../types/scanner';

export class SarifParser {
    public static parse(sarifContent: string, toolName: string = 'CodeQL'): Vulnerability[] {
        if (!sarifContent || !sarifContent.trim()) {
            return [];
        }

        const sarif = JSON.parse(sarifContent);
        const vulnerabilities: Vulnerability[] = [];
        const runs = sarif.runs || [];

        for (const run of runs) {
            const rulesMap = new Map<string, any>();
            const rules = run.tool?.driver?.rules || [];

            for (const rule of rules) {
                rulesMap.set(rule.id, rule);
            }

            const results = run.results || [];

            for (const result of results) {
                const ruleId = result.ruleId || 'UNKNOWN_RULE';
                const rule = rulesMap.get(ruleId) || {};
                const location = result.locations?.[0]?.physicalLocation;
                const filePath = location?.artifactLocation?.uri;
                const lineNumber = location?.region?.startLine;

                const sarifLevel = result.level || rule.defaultConfiguration?.level || 'warning';
                const severity = SarifParser.mapSeverity(sarifLevel, rule.properties?.['problem.severity']);
                const cveId = SarifParser.extractCve(rule);

                vulnerabilities.push({
                    id: ruleId,
                    title: rule.shortDescription?.text || rule.name || ruleId,
                    description: result.message?.text || rule.fullDescription?.text || 'Sem descrição.',
                    severity,
                    cveId,
                    filePath,
                    lineNumber,
                    remediation: rule.help?.text || undefined,
                    toolName,
                    rawDetails: {
                        ruleProperties: rule.properties,
                        codeqlTags: rule.properties?.tags,
                    },
                });
            }
        }

        return vulnerabilities;
    }

    private static mapSeverity(level: string, problemSeverity?: string): Severity {
        if (problemSeverity) {
            const prob = problemSeverity.toLowerCase();
            if (prob === 'recommendation') return 'LOW';
            if (prob === 'warning') return 'MEDIUM';
            if (prob === 'error') return 'HIGH';
            if (prob === 'critical') return 'CRITICAL';
        }

        switch (level.toLowerCase()) {
            case 'error':
                return 'HIGH';
            case 'warning':
                return 'MEDIUM';
            case 'note':
            case 'none':
            default:
                return 'LOW';
        }
    }

    private static extractCve(rule: any): string | undefined {
        const tags: string[] = rule.properties?.tags || [];
        for (const tag of tags) {
            if (tag.toLowerCase().startsWith('external/cwe/cwe-')) continue;
            if (tag.toUpperCase().includes('CVE-')) {
                const match = tag.match(/CVE-\d{4}-\d+/i);
                if (match) return match[0].toUpperCase();
            }
        }
        return undefined;
    }
}