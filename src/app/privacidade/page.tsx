import type { Metadata } from 'next';
import PolicyShell from '@/components/PolicyShell';

export const metadata: Metadata = {
    title: 'Política de Privacidade | MCinfraTI Radar Security',
    description: 'Como a MCinfraTI trata seus dados pessoais em conformidade com a LGPD.',
};

export default function PrivacidadePage() {
    return (
        <PolicyShell
            title="Política de Privacidade"
            subtitle="Transparência no tratamento de dados pessoais dos visitantes e clientes da plataforma."
            updatedAt="06 de setembro de 2026"
        >
            <Section title="1. Controlador dos dados">
                <p>
                    A <strong>MCinfraTI</strong>, por meio da plataforma <strong>Radar Security</strong>,
                    é a controladora dos dados pessoais tratados nesta página, na forma do art. 5º, inciso VI,
                    da Lei nº 13.709/2018 (LGPD).
                </p>
            </Section>

            <Section title="2. Dados coletados">
                <p>Na análise gratuita de domínio, coletamos os dados fornecidos voluntariamente por você:</p>
                <ul>
                    <li>Nome e e-mail;</li>
                    <li>Telefone e empresa (opcionais);</li>
                    <li>URL do domínio analisado;</li>
                    <li>Endereço IP e data/hora do consentimento (registro do consentimento).</li>
                </ul>
                <p>
                    Também registramos, de forma agregada e anônima, dados técnicos da navegação para o funcionamento
                    da plataforma (cookies essenciais).
                </p>
            </Section>

            <Section title="3. Finalidades e base legal">
                <p>Os dados são tratados exclusivamente para:</p>
                <ul>
                    <li>Executar a análise de segurança solicitada (art. 7º, V — execução do contrato);</li>
                    <li>Contato comercial após o consentimento (art. 7º, I — consentimento);</li>
                    <li>Comunicação sobre a solicitação de consultoria e correção (art. 7º, I).</li>
                </ul>
                <p>
                    Não utilizamos seus dados para publicidade direcionada e não os vendemos ou compartilhamos com
                    terceiros fora das finalidades descritas.
                </p>
            </Section>

            <Section title="4. Compartilhamento">
                <p>
                    Os dados podem ser acessados pela equipe autorizada da MCinfraTI e processados por prestadores de
                    infraestrutura contratados (hospedagem e banco de dados), sempre sob obrigações de confidencialidade.
                </p>
            </Section>

            <Section title="5. Armazenamento e segurança">
                <p>
                    Os dados são armazenados em servidores protegidos, com criptografia em trânsito e controles de
                    acesso por nível de permissão. Os resultados das análises ficam vinculados ao cadastro do cliente
                    e são acessíveis somente aos perfis autorizados.
                </p>
            </Section>

            <Section title="6. Direitos do titular (art. 18 da LGPD)">
                <p>Você pode, a qualquer momento, solicitar à MCinfraTI:</p>
                <ul>
                    <li>Confirmação da existência de tratamento;</li>
                    <li>Acesso aos dados tratados;</li>
                    <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
                    <li>Anonimização, bloqueio ou eliminação de dados desnecessários;</li>
                    <li>Portabilidade dos dados;</li>
                    <li>Revogação do consentimento.</li>
                </ul>
                <p>
                    Para exercer seus direitos, envie um e-mail para <strong className="text-cyan-300">privacidade@mcinfrati.com.br</strong>.
                    Responderemos dentro do prazo legal de 15 dias.
                </p>
            </Section>

            <Section title="7. Encarregado de dados (DPO)">
                <p>
                    O Encarregado de Proteção de Dados é o contato institucional da MCinfraTI para assuntos de privacidade,
                    acessível pelo mesmo e-mail <strong className="text-cyan-300">privacidade@mcinfrati.com.br</strong>.
                </p>
            </Section>

            <Section title="8. Alterações desta política">
                <p>
                    Esta política pode ser atualizada para adequação legal ou operacional. A data de atualização será sempre
                    indicada no topo desta página.
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