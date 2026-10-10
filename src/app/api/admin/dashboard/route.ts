import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { staffSession, adminUnauthorized } from '@/lib/adminAuth';

export const runtime = 'nodejs';

export async function GET() {
    const session = await staffSession();
    if (!session) return adminUnauthorized();

    const [totals, scoreByGrade, topClientes, recent] = await Promise.all([
        query(
            `SELECT
                COUNT(*)::int AS total_scans,
                COUNT(DISTINCT domain)::int AS total_domains,
                COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_scans,
                COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_scans,
                ROUND(AVG(score) FILTER (WHERE score IS NOT NULL))::int AS avg_score,
                COUNT(*) FILTER (WHERE status = 'completed' AND score < 40)::int AS critical_scans,
                COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days')::int AS week_scans,
                COALESCE(SUM(jsonb_array_length(COALESCE(vulnerabilities, '[]'::jsonb))), 0)::int AS vulnerability_count,
                ROUND(AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL))::int AS avg_duration_ms
             FROM scans`
        ),
        query(
            `SELECT COALESCE(grade, '—') AS grade,
                    COUNT(*)::int AS count
             FROM scans
             WHERE score IS NOT NULL
             GROUP BY grade
             ORDER BY grade`
        ),
        query(
            `SELECT c.name, c.domain,
                    COALESCE(latest.score, 0) AS "score",
                    COALESCE(latest.grade, '—') AS "grade"
             FROM clientes c
             LEFT JOIN LATERAL (
                 SELECT s.score, s.grade, s.created_at
                 FROM scans s
                 WHERE s.cliente_id = c.id
                 ORDER BY s.created_at DESC
                 LIMIT 1
             ) latest ON true
             WHERE latest.score IS NOT NULL
             ORDER BY latest.created_at DESC
             LIMIT 10`
        ),
        query(
            `SELECT s.id, s.target_url AS "targetUrl", s.domain, s.score, s.grade,
                    s.created_at AS "createdAt",
                    COALESCE(l.name, c.name, '—') AS "ownerName"
             FROM scans s
             LEFT JOIN leads l ON l.id = s.lead_id
             LEFT JOIN clientes c ON c.id = s.cliente_id
             ORDER BY s.created_at DESC
             LIMIT 15`
        ),
    ]);

    const t = totals[0];
    const successRate = t.total_scans > 0 ? Math.round((t.completed_scans / t.total_scans) * 100) : 0;

    return NextResponse.json({
        totals: {
            totalScans: t.total_scans,
            totalDomains: t.total_domains,
            failedScans: t.failed_scans,
            completedScans: t.completed_scans,
            avgScore: t.avg_score,
            criticalScans: t.critical_scans,
            weekScans: t.week_scans,
            vulnerabilityCount: t.vulnerability_count,
            avgDurationMs: t.avg_duration_ms,
            successRate,
        },
        byGrade: scoreByGrade,
        topClientes,
        recent,
    });
}