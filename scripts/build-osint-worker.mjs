import { build } from 'esbuild';

await build({
  entryPoints: ['src/workers/osint.worker.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'dist/osint-worker.cjs',
  alias: { '@': './src' },
  logLevel: 'warning',
});
