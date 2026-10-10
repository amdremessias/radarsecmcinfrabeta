import { IScanner, ScannerMetadata } from '../types/scanner';
import { CodeQLScanner } from './codeql.scanner';
import { TrivyScanner } from './trivy.scanner';
import { NmapScanner } from './nmap.scanner';

export class ScannerRegistry {
    private scanners: Map<string, IScanner> = new Map();

    constructor() {
        this.register('codeql', new CodeQLScanner());
        this.register('trivy', new TrivyScanner());
        this.register('nmap', new NmapScanner());
    }

    public register(name: string, scanner: IScanner): void {
        this.scanners.set(name.toLowerCase(), scanner);
    }

    public get(name: string): IScanner {
        const scanner = this.scanners.get(name.toLowerCase());
        if (!scanner) {
            throw new Error(`Scanner '${name}' não foi registrado no MCinfraTI Radar Security.`);
        }
        return scanner;
    }

    public list(): ScannerMetadata[] {
        return Array.from(this.scanners.values()).map((s) => s.metadata);
    }

    public names(): string[] {
        return Array.from(this.scanners.keys());
    }
}