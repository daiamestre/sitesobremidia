// SOBRE MÍDIA — "Trabalhar com IA" (F-223): regras puras do agente (sem banco), usadas pela função agente-ia e pelos
// testes. O agente só fala com o sistema por estas ferramentas; os dados vêm sempre do banco, com o login de quem pergunta.

/** Provedores GRÁTIS, todos no formato da OpenAI; o primeiro com chave configurada que responder é usado. */
export const PROVEDORES = [
  { nome: 'Groq', chave: 'GROQ_API_KEY', url: 'https://api.groq.com/openai/v1/chat/completions', modeloEnv: 'GROQ_MODELO_AGENTE', modelo: 'openai/gpt-oss-120b' },
  { nome: 'Google AI Studio', chave: 'GEMINI_API_KEY', url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', modeloEnv: 'GEMINI_MODELO_AGENTE', modelo: 'gemini-flash-lite-latest' },
  { nome: 'OpenRouter', chave: 'OPENROUTER_API_KEY', url: 'https://openrouter.ai/api/v1/chat/completions', modeloEnv: 'OPENROUTER_MODELO_AGENTE', modelo: 'nvidia/nemotron-3-ultra-550b-a55b:free' },
] as const;

/** Tela no ar = aparelho pareado e sinal nos últimos 3 minutos (a mesma regra da página Telas). */
export function situacaoDaTela(t: { last_ping_at: string | null; bound_device_id: string | null }, agora = Date.now()) {
  if (!t.bound_device_id) return { situacao: 'sem aparelho' as const, minutos: null };
  if (!t.last_ping_at) return { situacao: 'fora do ar' as const, minutos: null };
  const minutos = Math.max(0, Math.round((agora - new Date(t.last_ping_at).getTime()) / 60000));
  return { situacao: (minutos < 3 ? 'no ar' : 'fora do ar') as 'no ar' | 'fora do ar', minutos };
}

export const tempoDesde = (minutos: number | null) =>
  minutos === null ? 'nunca enviou sinal' : minutos < 60 ? `há ${minutos} min` : minutos < 2880 ? `há ${Math.round(minutos / 60)} h` : `há ${Math.round(minutos / 1440)} dias`;

/** Data de hoje no horário de Brasília (AAAA-MM-DD). */
export const hojeSP = (agora = new Date()) => new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 10);

export type Situacao = 'paga' | 'cancelada' | 'vencida' | 'aberta';
/** Situação real da cobrança (o banco usa PAGO/PAGA, CANCELADO/CANCELADA, ATRASADO, PENDENTE). */
export function situacaoDaCobranca(status: string, vencimento: string, hoje: string): Situacao {
  const s = (status ?? '').toUpperCase();
  if (s.startsWith('PAG') || s === 'RECEBIDO') return 'paga';
  if (s.startsWith('CANCEL')) return 'cancelada';
  if (s === 'ATRASADO' || vencimento < hoje) return 'vencida';
  return 'aberta';
}

/** Confere o pedido de cobrança antes de propor (o agente pode errar; o banco e o "Confirmar" são a última palavra). */
export function validarCobranca(p: { valor: unknown; vencimento: unknown; descricao?: unknown }, hoje: string): string[] {
  const erros: string[] = [];
  const valor = Number(p.valor);
  if (!Number.isFinite(valor) || valor <= 0) erros.push('Valor inválido: informe um valor maior que zero.');
  if (valor > 100000) erros.push('Valor acima de R$ 100.000: crie essa cobrança pela Central de Cobranças.');
  const v = String(p.vencimento ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v + 'T12:00:00Z'))) erros.push('Vencimento inválido: use AAAA-MM-DD.');
  else if (v < hoje) erros.push('O vencimento não pode ser no passado.');
  if (p.descricao !== undefined && String(p.descricao).length > 300) erros.push('Descrição longa demais (até 300 caracteres).');
  return erros;
}

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const dataBR = (iso: string) => iso.split('-').reverse().join('/');

type Ferramenta = { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } };
const f = (name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = []): Ferramenta =>
  ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });

/** Ferramentas oferecidas ao modelo; criar cobrança só para quem já pode cobrar no sistema. */
export function ferramentas(podeCobrar: boolean): Ferramenta[] {
  const lista = [
    f('relatorio_telas', 'Relatório das telas (painéis) da SOBRE MÍDIA: quais estão no ar, fora do ar ou sem aparelho, último sinal, local e playlist.',
      { filtro: { type: 'string', enum: ['todas', 'no_ar', 'fora_do_ar', 'sem_aparelho'], description: 'quais telas listar' } }),
    f('resumo_financeiro', 'Totais das cobranças de um mês (por vencimento): emitido, recebido, em aberto, vencido e quantidade.',
      { mes: { type: 'string', description: 'AAAA-MM; vazio = mês atual' } }),
    f('listar_cobrancas', 'Lista cobranças com cliente, valor, vencimento e situação.',
      { situacao: { type: 'string', enum: ['abertas', 'vencidas', 'pagas', 'todas'] }, cliente_id: { type: 'string', description: 'opcional, de buscar_cliente' }, limite: { type: 'number' } }),
    f('buscar_cliente', 'Procura clientes/empresas pelo nome, nome fantasia ou CNPJ e devolve o cliente_id.', { texto: { type: 'string' } }, ['texto']),
    f('oportunidades', 'Dados internos para achar oportunidades: segmentos com mais clientes, clientes que pararam de pagar/anunciar, maiores devedores, telas paradas e sem playlist, prospects.'),
  ];
  if (podeCobrar) lista.push(f('propor_cobranca',
    'PROPÕE uma cobrança avulsa (PIX/boleto). NÃO cria: o usuário precisa clicar em Confirmar. Use buscar_cliente antes para ter o cliente_id.',
    { cliente_id: { type: 'string' }, valor: { type: 'number', description: 'em reais' }, vencimento: { type: 'string', description: 'AAAA-MM-DD' }, descricao: { type: 'string' } },
    ['cliente_id', 'valor', 'vencimento']));
  return lista;
}

export function instrucoes(o: { hoje: string; papel: string; podeCobrar: boolean; nome: string }) {
  return `Você é o assistente "Trabalhar com IA" da SOBRE MÍDIA (mídia em telas digitais). Hoje é ${dataBR(o.hoje)} (horário de Brasília). Quem pergunta: ${o.nome || 'usuário'} (perfil ${o.papel || 'não informado'}).
Regras:
- Responda SEMPRE em português do Brasil, direto e organizado (títulos curtos, listas e tabelas em Markdown).
- Todo número, nome ou situação vem das ferramentas. Nunca invente dados; se a ferramenta não trouxe, diga que não há informação.
- Você só vê o que o login desta pessoa pode ver no sistema.
- ${o.podeCobrar ? 'Para cobrar: use buscar_cliente, depois propor_cobranca. A cobrança só existe depois que a pessoa clicar em "Confirmar" no cartão que aparece; diga isso e nunca afirme que já foi criada. Se houver mais de um cliente com o nome, pergunte qual antes de propor.' : 'Esta pessoa não tem permissão para criar cobranças; se pedir, explique que só owner, ADM e financeiro podem.'}
- Datas no formato dd/mm/aaaa e valores em R$.
- Para análise de mercado use a ferramenta oportunidades e dê sugestões práticas e priorizadas, dizendo que se baseiam nos dados internos.`;
}
