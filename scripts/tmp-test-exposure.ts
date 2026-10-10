import { runExposureScan } from '../src/lib/scanner/passiveScanner';

async function main() {
    const domain = process.argv[2] || 'google.com';
    const t0 = Date.now();
    const res = await runExposureScan(domain);
    console.log(`domain=${res.domain} subs=${res.subdomains.length} source=${res.subdomains_source} exposed=${res.exposed_files.length} penalty=${res.metrics.calculated_penalty} elapsed=${Date.now() - t0}ms`);
    console.log('sample subs:', res.subdomains.slice(0, 8));
}

main().catch((e) => { console.error(e); process.exit(1); });