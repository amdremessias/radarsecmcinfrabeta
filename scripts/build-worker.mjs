import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const banner = readFileSync(new URL('./set-polyfill.cjs', import.meta.url), 'utf8');
await build({
  entryPoints: ['src/workers/scan.worker.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'dist/worker.cjs',
  alias: { '@': './src' },
  banner: { js: banner },
  logLevel: 'warning',
});