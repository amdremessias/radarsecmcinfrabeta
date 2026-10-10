import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getPool, query } from '../src/lib/db';
import bcrypt from 'bcryptjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
    const schema = readFileSync(join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');
    const pool = getPool();

    console.log('→ Applying schema...');
    await pool.query(schema);

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@radar.local';
    const adminPassword = process.env.ADMIN_PASSWORD || 'radar123';
    const adminName = process.env.ADMIN_NAME || 'Admin Radar';

    const existing = await query('SELECT id FROM users WHERE email = $1', [adminEmail]);
    if (existing.length === 0) {
        const hash = await bcrypt.hash(adminPassword, 10);
        await query(
            'INSERT INTO users (email, name, password_hash, role, subscription_tier) VALUES ($1, $2, $3, $4, $5)',
            [adminEmail, adminName, hash, 'admin', 'enterprise']
        );
        console.log(`→ Admin criado: ${adminEmail} (senha: ${adminPassword})`);
    } else {
        console.log('→ Admin ja existe, nada a fazer.');
    }

    console.log('✅ Setup completo.');
    await pool.end();
}

main().catch((err) => {
    console.error('❌ Setup falhou:', err.message);
    process.exit(1);
});