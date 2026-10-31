// SOBRE MÍDIA Studio — agentes de IA (componentes lógicos coordenados pelo orquestrador).
// Cada agente: diretriz versionada (biblia.ts), entrada, saída em JSON com esquema, validação e registro (neurons, tentativas).
// Os agentes NUNCA recebem os valores dos preços: não há como escrevê-los. Preço, loja e condições entram por código (layout.ts).
import { DIRETRIZ, VERSAO_BIBLIA } from './biblia.ts';
// MG-STUDIO-03: os agentes recebem o contexto do SOBRE MÍDIA CREATIVE CORE (DNA visual + segmento + modalidade)
import { contextoParaAgente, estiloDoPedido } from './core/core.ts';
import { VERSAO_DNA } from './core/dna.ts';
import {
  CAMERAS, type CenaPlano, type PedidoStudio, type PlanoCriativo, neuronsDoTexto, validarPlano,
} from './contrato.ts';

export const MODELO_TEXTO = '@cf/meta/llama-4-scout-17b-16e-instruct';

/** Executor de modelo (adaptador do provedor). Devolve a resposta bruta do provedor. */
export type Executar = (modelo: string, entrada: Record<string, unknown>) => Promise<Record<string, unknown>>;

export interface RegistroAgente<T> {
  agente: 'produtos' | 'diretor' | 'roteirista' | 'fotografia' | 'prompts' | 'core' | 'core-local';
  modelo: string;
  versao: string;
  entrada: unknown;
  saida: T;
  neurons: number;
  tentativas: number;
}

export class FalhaDoAgente extends Error {
  agente: string;
  tentativas: number;
  neurons: number;
  constructor(agente: string, msg: string, tentativas: number, neurons: number) {
    super(`${agente}: ${msg}`);
    this.agente = agente;
    this.tentativas = tentativas;
    this.neurons = neurons;
  }
}

function lerJSON(resp: Record<string, unknown>): { valor: unknown; entrada: number; saida: number } {
  const r = (resp.result ?? resp) as Record<string, unknown>;
  const choices = r.choices as Array<{ message?: { content?: unknown } }> | undefined;
  let bruto: unknown = choices?.[0]?.message?.content ?? r.response;
  if (typeof bruto === 'string') {
    const t = bruto.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
    bruto = JSON.parse(t);
  }
  const u = (r.usage ?? {}) as { prompt_tokens?: number; completion_tokens?: number };
  return { valor: bruto, entrada: u.prompt_tokens ?? 0, saida: u.completion_tokens ?? 0 };
}

/** Uma chamada JSON com até `tentativas` tentativas GRATUITAS, devolvendo os erros de validação ao modelo. */
async function chamar<T>(exec: Executar, agente: RegistroAgente<T>['agente'], sistema: string, usuario: unknown[] | string, schema: Record<string, unknown>,
  validar: (v: T) => string[], maxTokens = 1400, tentativas = 3): Promise<RegistroAgente<T>> {
  let neurons = 0;
  let ultimo = '';
  const mensagens: Array<{ role: string; content: unknown }> = [{ role: 'system', content: sistema }, { role: 'user', content: usuario }];
  for (let t = 1; t <= tentativas; t++) {
    let valor: T;
    try {
      const resp = await exec(MODELO_TEXTO, { messages: mensagens, max_tokens: maxTokens, temperature: 0.4, response_format: { type: 'json_schema', json_schema: schema } });
      const lido = lerJSON(resp);
      neurons += neuronsDoTexto(lido.entrada, lido.saida);
      valor = lido.valor as T;
    } catch (e) {
      ultimo = `resposta inválida (${String((e as Error)?.message ?? e).slice(0, 160)})`;
      if (/quota|limit|neurons|429/i.test(ultimo)) throw new FalhaDoAgente(agente, 'cota diária da IA esgotada', t, neurons);
      continue;
    }
    const erros = validar(valor);
    if (!erros.length) return { agente, modelo: MODELO_TEXTO, versao: `${VERSAO_BIBLIA}+${VERSAO_DNA}`, entrada: usuario, saida: valor, neurons, tentativas: t };
    ultimo = erros.join(' ');
    mensagens.push({ role: 'assistant', content: JSON.stringify(valor) }, { role: 'user', content: `Corrija e responda de novo o JSON completo. Problemas: ${ultimo}` });
  }
  throw new FalhaDoAgente(agente, ultimo || 'sem resposta válida', tentativas, neurons);
}

const produtosParaIA = (p: PedidoStudio) => p.produtos.map((x) => ({ id: x.id, nome: x.nome, marca: x.marca || null, em_oferta: x.preco_promo_centavos != null, tem_preco: x.preco_centavos != null }));
const briefingParaIA = (p: PedidoStudio) => {
  const b = p.briefing;
  return {
    campanha: b.titulo, objetivo: b.objetivo, categoria: b.categoria, segmento: b.segmento || null, marca: b.marca || null,
    texto_do_cliente: b.texto_publicitario || null, publico: b.publico || null, tom: b.tom, ideia: b.ideia,
    formato: p.formato, duracao_total_s: p.duracao_s, quantidade_de_cenas: p.cenas,
    observacao: 'Preços, nome da loja, condições e validade são inseridos depois por código. Não os escreva.',
  };
};

// ---------------------------------------------------------------- 1. Especialista em Produtos (visão)

export interface AnaliseProduto { descricao: string; tipo_embalagem: string; cores: string[]; tem_rotulo: boolean; cuidados: string }
const SCHEMA_PRODUTO = {
  type: 'object', required: ['descricao', 'tipo_embalagem', 'cores', 'tem_rotulo', 'cuidados'],
  properties: { descricao: { type: 'string' }, tipo_embalagem: { type: 'string' }, cores: { type: 'array', items: { type: 'string' } }, tem_rotulo: { type: 'boolean' }, cuidados: { type: 'string' } },
};
export function analisarProduto(exec: Executar, nome: string, imagemDataUrl: string) {
  return chamar<AnaliseProduto>(exec, 'produtos', DIRETRIZ.produtos,
    [{ type: 'text', text: `Produto informado pelo cliente: "${nome}". Responda em português, em JSON: descricao (1 frase do que se vê), tipo_embalagem, cores (até 4, em português), tem_rotulo, cuidados (o que preservar ao fotografar).` },
      { type: 'image_url', image_url: { url: imagemDataUrl } }],
    SCHEMA_PRODUTO, (v) => (typeof v?.descricao === 'string' && Array.isArray(v?.cores) ? [] : ['JSON incompleto.']), 400);
}

// ---------------------------------------------------------------- 2. Diretor Criativo

export interface Direcao { conceito: string; estilo_visual: string; linguagem: string; paleta: string[]; duracao_recomendada_s: number; cenas_recomendadas: number }
const SCHEMA_DIRECAO = {
  type: 'object', required: ['conceito', 'estilo_visual', 'linguagem', 'paleta', 'duracao_recomendada_s', 'cenas_recomendadas'],
  properties: { conceito: { type: 'string' }, estilo_visual: { type: 'string' }, linguagem: { type: 'string' }, paleta: { type: 'array', items: { type: 'string' } }, duracao_recomendada_s: { type: 'integer' }, cenas_recomendadas: { type: 'integer' } },
};
export function diretorCriativo(exec: Executar, p: PedidoStudio, analises: Record<string, AnaliseProduto>) {
  const estilo = estiloDoPedido(p);
  return chamar<Direcao>(exec, 'diretor', contextoParaAgente('diretor', p),
    `Briefing: ${JSON.stringify(briefingParaIA(p))}\nProdutos: ${JSON.stringify(produtosParaIA(p))}\nAnálise visual dos produtos: ${JSON.stringify(analises)}\nEstilo de referência do segmento: ${JSON.stringify(estilo)}\nResponda em português (paleta em códigos hexadecimais #RRGGBB).`,
    SCHEMA_DIRECAO, (v) => {
      const e: string[] = [];
      if (!v?.conceito || !v?.estilo_visual) e.push('Faltam conceito ou estilo.');
      if (!Array.isArray(v?.paleta) || !v.paleta.every((c) => /^#[0-9a-fA-F]{6}$/.test(c))) e.push('Paleta deve ser uma lista de cores #RRGGBB.');
      if (/r\$|\d+[.,]\d{2}/i.test(`${v?.conceito} ${v?.linguagem}`)) e.push('Não escreva preços.');
      return e;
    }, 700);
}

// ---------------------------------------------------------------- 3. Roteirista

export interface Roteiro { roteiro: string; cenas: Array<Pick<CenaPlano, 'numero' | 'duracao_s' | 'produto_id' | 'objetivo' | 'titulo' | 'subtitulo'>> }
const schemaRoteiro = (n: number) => ({
  type: 'object', required: ['roteiro', 'cenas'],
  properties: {
    roteiro: { type: 'string' },
    cenas: { type: 'array', minItems: n, maxItems: n, items: { type: 'object', required: ['numero', 'duracao_s', 'produto_id', 'objetivo', 'titulo', 'subtitulo'],
      properties: { numero: { type: 'integer' }, duracao_s: { type: 'number' }, produto_id: { type: ['string', 'null'] }, objetivo: { type: 'string' }, titulo: { type: 'string' }, subtitulo: { type: 'string' } } } },
  },
});

/** Ajusta as durações para somarem exatamente o pedido (aritmética é do código, não da IA). */
export function normalizarDuracoes<T extends { duracao_s: number }>(cenas: T[], total: number): T[] {
  const soma = cenas.reduce((s, c) => s + Math.max(2, Number(c.duracao_s) || 2), 0);
  let acumulado = 0;
  return cenas.map((c, i) => {
    let d = i === cenas.length - 1 ? total - acumulado : Math.max(2, Math.round((Math.max(2, Number(c.duracao_s) || 2) / soma) * total * 2) / 2);
    d = Math.max(2, Math.round(d * 2) / 2);
    acumulado += d;
    return { ...c, duracao_s: d };
  });
}

export function roteirista(exec: Executar, p: PedidoStudio, direcao: Direcao) {
  return chamar<Roteiro>(exec, 'roteirista', contextoParaAgente('roteirista', p),
    `Briefing: ${JSON.stringify(briefingParaIA(p))}\nProdutos (use o id em produto_id; null para abertura/fechamento): ${JSON.stringify(produtosParaIA(p))}\nDireção criativa: ${JSON.stringify(direcao)}\nCrie exatamente ${p.cenas} cenas numeradas de 1 a ${p.cenas}, somando ${p.duracao_s} segundos, cada uma com pelo menos 2 segundos. Todos os produtos devem aparecer em ao menos uma cena se couber.`,
    schemaRoteiro(p.cenas), (v) => {
      if (!Array.isArray(v?.cenas)) return ['Faltam as cenas.'];
      const cenas = normalizarDuracoes(v.cenas.map((c, i) => ({ ...c, numero: i + 1 })), p.duracao_s);
      const parcial: PlanoCriativo = { conceito: direcao.conceito, estilo_visual: '', linguagem: '', paleta: [], roteiro: v.roteiro,
        cenas: cenas.map((c) => ({ ...c, produto_id: c.produto_id || null, enquadramento: '-', iluminacao: '-', lente: '-', camera: 'estatica', prompt_cenario: 'placeholder scene description ok', negativo: null })) };
      return validarPlano(parcial, p).filter((e) => !/prompt|câmera/i.test(e));
    }, 1500);
}

// ---------------------------------------------------------------- 4. Diretor de Fotografia

export interface Fotografia { cenas: Array<Pick<CenaPlano, 'numero' | 'enquadramento' | 'iluminacao' | 'lente' | 'camera'>> }
const schemaFotografia = (n: number) => ({
  type: 'object', required: ['cenas'],
  properties: { cenas: { type: 'array', minItems: n, maxItems: n, items: { type: 'object', required: ['numero', 'enquadramento', 'iluminacao', 'lente', 'camera'],
    properties: { numero: { type: 'integer' }, enquadramento: { type: 'string' }, iluminacao: { type: 'string' }, lente: { type: 'string' }, camera: { type: 'string', enum: CAMERAS.map((c) => c.id) } } } } },
});
export function diretorFotografia(exec: Executar, p: PedidoStudio, direcao: Direcao, roteiro: Roteiro) {
  const estilo = estiloDoPedido(p);
  return chamar<Fotografia>(exec, 'fotografia', contextoParaAgente('fotografia', p),
    `Formato da tela: ${p.formato}. Direção: ${JSON.stringify(direcao)}\nEstilo do segmento: ${JSON.stringify(estilo)}\nCenas: ${JSON.stringify(roteiro.cenas)}\nResponda em português (camera com um dos valores permitidos).`,
    schemaFotografia(p.cenas), (v) => (Array.isArray(v?.cenas) && v.cenas.length === p.cenas && v.cenas.every((c) => CAMERAS.some((k) => k.id === c.camera)) ? [] : ['Cenas incompletas ou câmera inválida.']), 1200);
}

// ---------------------------------------------------------------- 5. Especialista em Prompts

export interface Prompts { cenas: Array<{ numero: number; prompt_cenario: string; negativo: string }> }
const schemaPrompts = (n: number) => ({
  type: 'object', required: ['cenas'],
  properties: { cenas: { type: 'array', minItems: n, maxItems: n, items: { type: 'object', required: ['numero', 'prompt_cenario', 'negativo'],
    properties: { numero: { type: 'integer' }, prompt_cenario: { type: 'string' }, negativo: { type: 'string' } } } } },
});
export function especialistaPrompts(exec: Executar, p: PedidoStudio, direcao: Direcao, roteiro: Roteiro, foto: Fotografia, analises: Record<string, AnaliseProduto>) {
  const estilo = estiloDoPedido(p);
  const onde = p.formato === '9:16' ? 'empty space in the lower-middle for the product' : 'empty space on the right third for the product';
  return chamar<Prompts>(exec, 'prompts', contextoParaAgente('prompts', p),
    `Formato: ${p.formato} (${onde}). Estilo do segmento: ${JSON.stringify(estilo)}\nDireção: ${JSON.stringify(direcao)}\nCenas do roteiro: ${JSON.stringify(roteiro.cenas)}\nFotografia: ${JSON.stringify(foto.cenas)}\nProdutos (só para combinar cores do cenário, NÃO desenhar): ${JSON.stringify(analises)}`,
    schemaPrompts(p.cenas), (v) => {
      if (!Array.isArray(v?.cenas) || v.cenas.length !== p.cenas) return ['Cenas incompletas.'];
      const e: string[] = [];
      v.cenas.forEach((c, i) => {
        const s = String(c.prompt_cenario ?? '').toLowerCase();
        if (s.length < 20) e.push(`Cena ${i + 1}: prompt curto.`);
        if (/\b(text|logo|label|lettering|typography|words?|sign)\b/.test(s.replace(/\bno (text|logos?|labels?|lettering|typography|words?|signs?)\b/g, ''))) e.push(`Cena ${i + 1}: o prompt pede texto/logo; o cenário não pode ter texto.`);
      });
      return e;
    }, 1500);
}

/** Especialista em Prompts: reescreve o prompt de UM cenário com o ajuste pedido pelo cliente (português → inglês). */
export function ajustarPrompt(exec: Executar, prompt: string, instrucao: string) {
  return chamar<{ prompt_cenario: string }>(exec, 'prompts', DIRETRIZ.prompts,
    `Prompt atual do cenário: ${JSON.stringify(prompt)}\nAjuste pedido pelo cliente (em português): ${JSON.stringify(instrucao.slice(0, 300))}\nReescreva o prompt em inglês aplicando o ajuste, mantendo as regras (sem produto, sem pessoas, sem texto, sem logos).`,
    { type: 'object', required: ['prompt_cenario'], properties: { prompt_cenario: { type: 'string' } } },
    (v) => {
      const s = String(v?.prompt_cenario ?? '').toLowerCase();
      if (s.length < 20) return ['Prompt curto.'];
      return /\b(text|logo|label|lettering|typography|words?|sign)\b/.test(s.replace(/\bno (text|logos?|labels?|lettering|typography|words?|signs?)\b/g, '')) ? ['O cenário não pode ter texto/logo.'] : [];
    }, 400);
}

/** Junta as saídas dos agentes no plano final e valida tudo de novo (defesa em profundidade). */
export function montarPlano(p: PedidoStudio, direcao: Direcao, roteiro: Roteiro, foto: Fotografia, prompts: Prompts, analises: Record<string, AnaliseProduto>): { plano: PlanoCriativo; erros: string[] } {
  const cenas = normalizarDuracoes(roteiro.cenas.map((c, i) => ({ ...c, numero: i + 1 })), p.duracao_s).map((c, i) => {
    const f = foto.cenas[i];
    const pr = prompts.cenas[i];
    const sufixo = ' Empty scene, no product, no people, no hands, no text, no letters, no numbers, no logos, no labels, photorealistic advertising photography.';
    return {
      numero: i + 1, duracao_s: c.duracao_s, produto_id: c.produto_id || null, objetivo: c.objetivo, titulo: c.titulo.trim(), subtitulo: (c.subtitulo ?? '').trim() || null,
      enquadramento: f.enquadramento, iluminacao: f.iluminacao, lente: f.lente, camera: f.camera,
      prompt_cenario: (pr.prompt_cenario.trim() + sufixo).slice(0, 1900), negativo: pr.negativo || null,
    } satisfies CenaPlano;
  });
  const plano: PlanoCriativo = {
    conceito: direcao.conceito, estilo_visual: direcao.estilo_visual, linguagem: direcao.linguagem, paleta: direcao.paleta,
    roteiro: roteiro.roteiro, cenas,
    produtos_analise: Object.fromEntries(Object.entries(analises).map(([k, a]) => [k, { descricao: a.descricao, cores: a.cores, tem_rotulo: a.tem_rotulo }])),
  };
  return { plano, erros: validarPlano(plano, p) };
}
