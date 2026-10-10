import { Pool } from 'pg';

let pool: Pool | null = null;

export function getPool(): Pool {
    if (!pool) {
        pool = new Pool({
            connectionString:
                process.env.DATABASE_URL || 'postgresql://radar:radar@localhost:5435/radar',
        });
    }
    return pool;
}

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const result = await getPool().query(sql, params);
    return result.rows as T[];
}

export async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const rows = await query<T>(sql, params);
    return rows[0] || null;
}