import type { Metadata } from 'next';
import PolicyShell from '@/components/PolicyShell';

export const metadata: Metadata = {
    title: 'Política de Cookies | MCinfraTI Radar Security',
    description: 'Quais cookies a plataforma Radar Security utiliza e como você controla o seu consentimento.',
};

export default function CookiesPage() {
    return (
        <PolicyShell
            title="Política de Cookies"
            subtitle="Como a plataforma utiliza cookies e como você gerencia suas preferências."
            updatedAt="06 de setembro de 2026"
        >
            <Section title="1. O que são cookies">
                <p>
                    Cookies são pequenos arquivos armazenados no seu dispositivo para permitir o funcionamento de
                    funcionalidades da plataforma e registrar preferências.
                </p>
            </Section>

            <Section title="2. Cookies utilizados">
                <p>No Radar Security utilizamos exclusivamente cookies essenciais:</p>
                <ul>
                    <li>
                        <strong>Cookie de sessão (NextAuth)</strong> — mantém você autenticado nos painéis (equipe e clientes).
                    </li>
                    <li>
                        <strong>Preferência de consentimento</strong> — registra a sua escolha nesta página para não exibir o
                        aviso repetidamente.
                    </li>
                    <li>
                        <strong>CSRF da plataforma</strong> — proteção contra requisições fraudulentas nos formulários.
                    </li>
                </ul>
                <p>
                    Não utilizamos cookies de publicidade ou de terceiros, e não rastreamos você entre sites.
                </p>
            </Section>

            <Section title="3. Consentimento">
                <p>
                    Ao primeiro acesso, você escolhe entre <em>aceitar todos</em> ou <em>apenas essenciais</em>.
                    Em qualquer cenário, apenas os cookies essenciais são ativados; a escolha é armazenada localmente
                    e pode ser alterada limpando os dados de navegação do seu navegador.
                </p>
            </Section>

            <Section title="4. Gerenciamento no navegador">
                <p>
                    Você pode desabilitar ou excluir cookies pelas configurações do seu navegador. Lembre-se de que,
                    sem os cookies essenciais, o acesso aos painéis de login pode ser comprometido.
                </p>
            </Section>

            <Section title="5. Contato">
                <p>
                    Dúvidas sobre esta política: <strong className="text-cyan-300">privacidade@mcinfrati.com.br</strong>.
                </p>
            </Section>
        </PolicyShell>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section>
            <h2 className="text-xl font-semibold mb-3">{title}</h2>
            <div className="space-y-3 text-sm text-gray-400 leading-relaxed [&_ul]:space-y-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:text-gray-400 [&_strong]:text-gray-200">
                {children}
            </div>
        </section>
    );
}