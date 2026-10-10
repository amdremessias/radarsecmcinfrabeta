import path from 'path';
import fs from 'fs';
import type { DeepStack } from '@/types/deepAnalysis';
import type { WalkedFile } from './extract';

const EXT_LANGUAGE: Record<string, string> = {
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript',
    '.js': 'JavaScript',
    '.jsx': 'JavaScript',
    '.mjs': 'JavaScript',
    '.cjs': 'JavaScript',
    '.vue': 'Vue.js',
    '.py': 'Python',
    '.go': 'Go',
    '.php': 'PHP',
    '.rb': 'Ruby',
    '.java': 'Java',
    '.cs': 'C#',
    '.kt': 'Kotlin',
    '.swift': 'Swift',
    '.rs': 'Rust',
};

const MANIFEST_NAMES = [
    'package.json',
    'requirements.txt',
    'Pipfile',
    'poetry.lock',
    'pyproject.toml',
    'go.mod',
    'pom.xml',
    'build.gradle',
    'composer.json',
    'Gemfile',
    'Cargo.toml',
];

async function readManifest(absPath: string, maxBytes = 512 * 1024): Promise<string | null> {
    try {
        const info = await fs.promises.stat(absPath);
        if (!info.isFile() || info.size > maxBytes) return null;
        return fs.promises.readFile(absPath, 'utf8');
    } catch {
        return null;
    }
}

function parsePackageDeps(content: string): { deps: Set<string>; devDeps: Set<string> } {
    try {
        const pkg = JSON.parse(content);
        const deps = new Set<string>(Object.keys(pkg.dependencies || {}));
        const devDeps = new Set<string>(Object.keys(pkg.devDependencies || {}));
        return { deps, devDeps };
    } catch {
        return { deps: new Set(), devDeps: new Set() };
    }
}

export interface DeepStackResult {
    stack: DeepStack;
    manifest?: { fileName: string; content: string };
}

export async function detectStack(rootDir: string, files: WalkedFile[]): Promise<DeepStackResult> {
    const histogram = new Map<string, number>();
    const relSet = new Set(files.map((f) => f.relPath));

    for (const file of files) {
        const ext = path.extname(file.relPath).toLowerCase();
        histogram.set(ext, (histogram.get(ext) || 0) + 1);
    }

    const dominantExt = [...histogram.entries()]
        .sort((a, b) => b[1] - a[1])
        .find(([ext]) => EXT_LANGUAGE[ext])?.[0];
    const language = dominantExt ? EXT_LANGUAGE[dominantExt] : 'Indeterminada';

    const deploy: string[] = [];
    if (relSet.has('Dockerfile')) deploy.push('Dockerfile');
    if (relSet.has('docker-compose.yml') || relSet.has('docker-compose.yaml') || relSet.has('compose.yaml')) {
        deploy.push('Docker Compose');
    }
    if (relSet.has('.github/workflows')) deploy.push('GitHub Actions');
    if (relSet.has('vercel.json') || relSet.has('.vercel')) deploy.push('Vercel');
    if (relSet.has('netlify.toml')) deploy.push('Netlify');
    if (relSet.has('render.yaml')) deploy.push('Render');
    if (relSet.has('fly.toml')) deploy.push('Fly.io');
    if (relSet.has('serverless.yml') || relSet.has('serverless.yaml')) deploy.push('Serverless');
    if (relSet.has('.gitlab-ci.yml')) deploy.push('GitLab CI');
    if (relSet.has('app.yaml')) deploy.push('Google App Engine');
    if (relSet.has('cloudbuild.yaml')) deploy.push('Google Cloud Build');
    if (deploy.length === 0) deploy.push('Sem manifestos de deploy');

    let framework: string | undefined;
    let orm: string | undefined;
    let database: string | undefined;
    let auth: string | undefined;
    let manifestFile: string | undefined;
    let manifestContent: string | undefined;

    for (const name of MANIFEST_NAMES) {
        const match = files.find((f) => f.relPath === name || f.relPath.endsWith('/' + name));
        if (match) {
            manifestFile = match.relPath;
            manifestContent = (await readManifest(match.absPath)) || undefined;
            break;
        }
    }

    const has = (t: string) => manifestContent !== undefined && manifestContent.includes(t);

    if (manifestFile === 'package.json' && manifestContent !== undefined) {
        const { deps, devDeps } = parsePackageDeps(manifestContent);
        const all = new Set([...deps, ...devDeps]);
        if (all.has('next') || relSet.has('next.config.js') || relSet.has('next.config.mjs') || relSet.has('next.config.ts')) {
            framework = 'Next.js';
        } else if (all.has('@nestjs/core')) {
            framework = 'NestJS';
        } else if (all.has('astro')) {
            framework = 'Astro';
        } else if (all.has('@sveltejs/kit')) {
            framework = 'SvelteKit';
        } else if (all.has('@remix-run/react')) {
            framework = 'Remix';
        } else if (all.has('fastify')) {
            framework = 'Fastify';
        } else if (all.has('express')) {
            framework = 'Express';
        }
        if (all.has('react') && !framework) framework = 'React';

        if (all.has('@prisma/client') || all.has('prisma') || files.some((f) => f.relPath.endsWith('schema.prisma'))) {
            orm = 'Prisma';
        } else if (all.has('drizzle-orm')) {
            orm = 'Drizzle ORM';
        } else if (all.has('sequelize')) {
            orm = 'Sequelize';
        } else if (all.has('typeorm') || all.has('@nestjs/typeorm')) {
            orm = 'TypeORM';
        } else if (all.has('knex')) {
            orm = 'Knex';
        } else if (all.has('mongoose')) {
            orm = 'Mongoose';
        } else if (all.has('@mikro-orm/core')) {
            orm = 'MikroORM';
        }

        if (all.has('pg') || all.has('@neondatabase/serverless')) database = 'PostgreSQL';
        if (all.has('mysql2') || all.has('mysql')) database = 'MySQL';
        if (all.has('mongodb') || all.has('mongoose')) database = 'MongoDB';
        if (all.has('ioredis') || all.has('redis')) database = 'Redis';
        if (all.has('better-sqlite3') || all.has('sqlite3')) database = 'SQLite';

        if (all.has('next-auth')) auth = 'NextAuth';
        if (all.has('passport')) auth = 'Passport';
        if (all.has('firebase-admin')) auth = 'Firebase Admin';
        if (all.has('@supabase/supabase-js')) auth = 'Supabase Auth';
        if (all.has('jsonwebtoken')) auth = 'JWT';
        if (all.has('express-session')) auth = 'Sessão + Cookie';
    } else if (manifestFile === 'requirements.txt' && manifestContent !== undefined) {
        if (/fastapi/i.test(manifestContent)) framework = 'FastAPI';
        if (/django/i.test(manifestContent) || files.some((f) => f.relPath === 'manage.py')) framework = 'Django';
        if (/flask/i.test(manifestContent)) framework = 'Flask';
        if (/sqlalchemy/i.test(manifestContent)) {
            orm = 'SQLAlchemy';
        }
        if (/psycopg/i.test(manifestContent) || /asyncpg/i.test(manifestContent)) database = 'PostgreSQL';
        if (/pymysql|mysqlclient/i.test(manifestContent)) database = 'MySQL';
        if (/pymongo/i.test(manifestContent)) database = 'MongoDB';
        if (/redis/i.test(manifestContent)) database = 'Redis';
        if (/PyJWT|pyjwt/i.test(manifestContent)) auth = 'JWT';
        if (/django-allauth/i.test(manifestContent)) auth = 'allauth';
    } else if (manifestFile === 'go.mod' && manifestContent !== undefined) {
        if (/gin-gonic/i.test(manifestContent)) framework = 'Gin';
        if (/echo/i.test(manifestContent)) framework = 'Echo';
        if (/gorm/i.test(manifestContent)) orm = 'GORM';
        if (/lib\/pq|jackc\/pgx/i.test(manifestContent)) database = 'PostgreSQL';
    } else if (manifestFile === 'composer.json' && manifestContent !== undefined) {
        if (/laravel/i.test(manifestContent) || files.some((f) => f.relPath === 'artisan')) framework = 'Laravel';
        if (/symfony/i.test(manifestContent)) framework = 'Symfony';
        if (/doctrine/i.test(manifestContent)) orm = 'Doctrine';
    } else if (manifestFile?.startsWith('pom.xml')) {
        framework = 'Spring Boot';
        if (has('spring-boot-starter-data-jpa')) orm = 'Hibernate/JPA';
    }

    if (!database) {
        if (manifestContent !== undefined && /postgres|psycopg|pg`/i.test(manifestContent)) database = 'PostgreSQL';
    }

    const label = language === 'JavaScript' || language === 'TypeScript' ? `Node.js (${language})` : language;

    const stack: DeepStack = {
        language: label,
        framework,
        orm,
        database: database || undefined,
        auth,
        deploy,
        fileCount: files.length,
        manifestFile,
    };

    return {
        stack,
        manifest: manifestContent !== undefined && manifestFile ? { fileName: manifestFile, content: manifestContent } : undefined,
    };
}