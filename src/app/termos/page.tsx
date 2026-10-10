import type { Metadata } from 'next';
import PolicyShell from '@/components/PolicyShell';

export const metadata: Metadata = {
    title: 'Termos de Uso | MCinfraTI Radar Security',
    description: 'Condições de uso da plataforma MCinfraTI Radar Security.',
};

export default function TermosPage() {
    return (
        <PolicyShell
            title="Termos de Uso"
            subtitle="Condições gerais de utilização da plataforma Radar Security da MCinfraTI."
            updatedAt="06 de setembro de 2026"
        >
            <Section title="1. Aceitação dos termos">
                <p>
                    Ao utilizar a plataforma, incluindo a análise gratuita de domínio e o acesso aos painéis de
                    administração e do cliente, você declara estar ciente e concordar com estes Termos de Uso e com a
                    Política de Privacidade.
                </p>
            </Section>

            <Section title="2. Serviço de análise de segurança">
                <ul>
                    <li>A análise verifica cabeçalhos de segurança, TLS, DNS, tecnologias e exposição de informações de domínios públicos.</li>
                    <li>Os resultados são indicativos e não substituem auditorias profissionais de segurança.</li>
                    <li>Você declara possuir autoridade para solicitar a análise do domínio informado.</li>
                </ul>
            </Section>

            <Section title="3. Uso autorizado">
                <p>
                    As credenciais criadas são de uso individual e intransferível. Usuários com perfil <strong>Cliente</strong> têm
                    acesso somente aos resultados vinculados ao próprio cadastro; perfis <strong>Gestor</strong> e
                    <strong> Administrativo</strong> possuem escopos definidos pela MCinfraTI.
                </p>
            </Section>

            <Section title="4. Restrições">
                <ul>
                    <li>Não é permitido utilizar a plataforma para violar leis ou direitos de terceiros.</li>
                    <li>Não é permitido tentar acessar painéis ou dados fora do escopo do seu perfil.</li>
                    <li>O uso abusivo pode levar à suspensão do acesso.</li>
                </ul>
            </Section>

            <Section title="5. Serviços de consultoria e correção">
                <p>
                    A solicitação de consultoria, feita na landing page, gera um contato comercial da equipe para
                    apresentação de escopo e orçamento. A execução de correções é contratada em documento próprio.
                </p>
            </Section>

            <Section title="6. Disponibilidade">
                <p>
                    A plataforma é fornecida conforme disponibilidade. A MCinfraTI poderá interromper o serviço para
                    manutenção programada ou por motivos de segurança, sem prejuízo dos dados armazenados.
                </p>
            </Section>

            <Section title="7. Alterações">
                <p>
                    Estes termos podem ser atualizados; a versão vigente estará sempre disponível nesta página.
                </p>
            </Section>

            <Section title="8. Contato">
                <p>
                    Dúvidas sobre estes termos: <strong className="text-cyan-300">contato@mcinfrati.com.br</strong>.
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