// SOBRE MÍDIA CREATIVE CORE — a inteligência central do Studio (MG-STUDIO-03).
// Uma criação passa SEMPRE por: Briefing → Especialista de Segmento → Diretor Criativo → Roteamento (imagem / composição
// determinística / fotografia de produto / motion / vídeo IA) → Engenheiro de Prompts (um prompt por provedor) →
// Qualidade. Tudo funciona SEM API externa (modo "local"); com um modelo disponível, o Diretor Criativo é refinado por
// ele ("ia") e o resultado passa pela MESMA conferência — o modelo nunca define a identidade sozinho.
// Os agentes já existentes (agentes.ts: produtos, diretor, roteirista, fotografia, prompts) recebem o contexto daqui
// (contextoParaAgente / estiloDoPedido).
import { DIRETRIZ, estiloDa, VERSAO_BIBLIA } from '../biblia.ts';
import { CAMERAS, type PedidoStudio } from '../contrato.ts';
import type { Direcao, Fotografia, Prompts, Roteiro } from '../agentes.ts';
import { MANUAL, PROIBIDO, REGRAS, ROTEIROS, VERSAO_DNA, textoDoDna, type Modalidade } from './dna.ts';
import { reconhecerSegmento, taxonomia, type Categoria, type Segmento } from './segmentos.ts';

/** Executor de modelo (mesmo contrato do agentes.ts: devolve a resposta bruta do provedor). */
export type Executar = (modelo: string, entrada: Record<string, unknown>) => Promise<Record<string, unknown>>;

export interface ProdutoCore { id: string; nome: string; marca?: string | null; preco_centavos?: number | null; preco_promo_centavos?: number | null; tem_foto: boolean }
export interface PedidoCore {
  /** o que o usuário escreveu */
  texto: string;
  tipo?: 'imagem' | 'video' | 'auto';
  formato?: string;
  duracao_s?: number;
  /** categoria/segmento escolhido no formulário (ajuda o reconhecimento) */
  dica_segmento?: string | null;
  estabelecimento?: string | null;
  marca?: string | null;
  produtos?: ProdutoCore[];
  referencias?: number;
  transparente?: boolean;
}

export type ModoDeProducao = 'composicao' | 'fotografia_produto' | 'imagem_ia' | 'motion' | 'video_ia';
export const ROTULO_DO_MODO: Record<ModoDeProducao, string> = {
  composicao: 'Composição determinística (modelo + dados reais desenhados por código, sem IA de imagem)',
  fotografia_produto: 'Fotografia de produto (foto real recortada + cenário gerado por IA)',
  imagem_ia: 'Imagem gerada por IA a partir da direção de arte',
  motion: 'Anúncio animado (motion graphics determinístico, sem IA de vídeo)',
  video_ia: 'Vídeo gerado por IA',
};

export interface BriefingCore {
  o_que: string;
  objetivo: string;
  publico: string;
  produto_principal: string | null;
  identidade: string;
  tipo_saida: 'imagem' | 'video';
  formato: string;
  duracao_s: number | null;
  dados_reais: { produtos: { id: string; nome: string; marca: string | null; tem_preco: boolean; tem_foto: boolean }[]; estabelecimento: string | null; marca: string | null };
  faltando: string[];
  inconsistencias: string[];
}
export interface DirecaoCore {
  conceito: string; estilo: string; ambiente: string;
  /** cenário em inglês para os geradores (o provedor recebe inglês; o cliente lê o ambiente em português) */
  ambiente_en: string | null;
  iluminacao: string; composicao: string[];
  paleta: string[]; hierarquia: string[]; tipografia: string; acabamento: string;
  deterministico: string[]; fonte: 'local' | 'ia';
}
export interface Roteamento { modo: ModoDeProducao; rotulo: string; motivo: string; provedor: string; disponivel: boolean; bloqueio: string | null; alternativa: ModoDeProducao | null }
export interface CenaRoteiro { de: number; ate: number; papel: string; animacao: string }
export interface Qualidade { aprovado: boolean; problemas: string[]; evidencias: string[] }
export interface EtapaCore { agente: string; modo: 'local' | 'ia'; provedor: string | null; versao: string; ms: number }
export interface ResultadoCore {
  versao: { dna: string; biblia: string };
  briefing: BriefingCore;
  segmento: { id: string; nome: string; categoria: string | null; confianca: number };
  direcao: DirecaoCore;
  roteamento: Roteamento;
  prompts: Record<string, string>;
  roteiro: CenaRoteiro[] | null;
  qualidade: Qualidade;
  etapas: EtapaCore[];
}

const sem = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const tem = (t: string, ...termos: string[]) => termos.some((x) => sem(t).includes(sem(x)));

// ---------------------------------------------------------------- 1. Briefing Agent (estrutura + o que falta)

export function estruturarBriefing(p: PedidoCore, seg: Segmento, cat: Categoria | null): BriefingCore {
  const texto = p.texto.trim();
  const video = p.tipo === 'video' || (p.tipo !== 'imagem' && tem(texto, 'video', 'vídeo', 'animad', 'animação', 'anima', 'motion', 'reels', '15s', '15 s', '20s', '20 s', '15 segundos', '20 segundos'));
  const duracao = video ? (p.duracao_s ?? (tem(texto, '20s', '20 s', '20 segundos') ? 20 : 15)) : null;
  const produtos = (p.produtos ?? []).map((x) => ({ id: x.id, nome: x.nome, marca: x.marca ?? null, tem_preco: x.preco_centavos != null, tem_foto: x.tem_foto }));
  const oferta = tem(texto, 'oferta', 'promoção', 'promocao', 'desconto', 'preço', 'preco', 'liquidação', 'liquidacao', 'por apenas', 'r$');
  const objetivo = oferta ? 'divulgar oferta/preço'
    : tem(texto, 'matrícula', 'matricula', 'inscri') ? 'matrículas/inscrições'
      : tem(texto, 'agend', 'consulta', 'marque') ? 'agendamentos'
        : tem(texto, 'lançamento', 'lancamento', 'novidade', 'chegou') ? 'lançamento'
          : seg.objetivos[0] ?? 'divulgar';
  const faltando: string[] = [];
  const inconsistencias: string[] = [];
  if (oferta && !produtos.some((x) => x.tem_preco)) faltando.push('preço (oferta sem preço informado: o Core não inventa — informe o valor ou o preço fica fora da arte)');
  if (/r\$\s*\d/i.test(texto) && !produtos.some((x) => x.tem_preco)) inconsistencias.push('há preço escrito no texto livre, mas nenhum produto com preço cadastrado: o preço só entra pelos dados do produto (confirmar o valor)');
  if (!p.estabelecimento && !p.marca) faltando.push('nome da loja/marca (opcional; sem ele a peça não leva marca)');
  if (video && duracao && ![15, 20].includes(duracao)) inconsistencias.push(`duração de ${duracao} s: o Studio prioriza 15 s ou 20 s`);
  if (tem(texto, 'personagem', 'mascote', 'apresentador') && !p.referencias) faltando.push('imagem de referência do personagem (para manter a mesma aparência nas cenas)');
  return {
    o_que: texto.slice(0, 240),
    objetivo,
    publico: seg.publico.join(', '),
    produto_principal: produtos[0]?.nome ?? cat?.subcategorias.find((s) => tem(texto, s)) ?? cat?.nome ?? null,
    identidade: p.marca || p.estabelecimento ? `marca/loja do cliente: ${p.marca ?? p.estabelecimento}` : `padrão do segmento ${seg.nome}`,
    tipo_saida: video ? 'video' : 'imagem',
    formato: p.formato ?? '16:9',
    duracao_s: duracao,
    dados_reais: { produtos, estabelecimento: p.estabelecimento ?? null, marca: p.marca ?? null },
    faltando,
    inconsistencias,
  };
}

// ---------------------------------------------------------------- 3. Creative Director (local, a partir do DNA + segmento)

function direcaoLocal(b: BriefingCore, seg: Segmento, cat: Categoria | null): DirecaoCore {
  const premium = tem(b.o_que, 'premium', 'luxo', 'sofistic');
  const estilo = (premium && seg.estilos.find((e) => tem(e, 'premium', 'luxo'))) || seg.estilos[0];
  const paleta = seg.paletas[premium && seg.paletas[1] ? 1 : 0];
  return {
    conceito: `${cat?.nome ?? seg.nome}: ${b.produto_principal ?? 'o serviço'} como herói, com foco em ${b.objetivo}.`,
    estilo,
    ambiente: seg.ambientes[0],
    ambiente_en: null,
    iluminacao: tem(seg.id, 'saude', 'educacao') ? MANUAL.iluminacao[2] : tem(seg.id, 'alimentacao', 'esportes', 'automotivo', 'beleza') ? MANUAL.iluminacao[1] : MANUAL.iluminacao[0],
    composicao: [...MANUAL.composicao],
    paleta,
    hierarquia: [...MANUAL.hierarquia],
    tipografia: seg.id === 'beleza' ? 'serifada elegante + sem serifa leve' : seg.id === 'varejo' ? 'condensada, caixa alta, preço gigante' : 'sem serifa forte, títulos curtos',
    acabamento: MANUAL.acabamento[0],
    deterministico: ['preço', 'desconto', 'nome do produto', 'marca/loja', 'validade', 'telefone/endereço', 'logotipo'],
    fonte: 'local',
  };
}

// ---------------------------------------------------------------- 4. Roteamento (o que produzir e com quem)

export function decidirModo(p: PedidoCore, b: BriefingCore, disponiveis: Set<string>): Roteamento {
  const texto = p.texto;
  const comFoto = (p.produtos ?? []).some((x) => x.tem_foto);
  const r = (modo: ModoDeProducao, motivo: string, provedor: string, alternativa: ModoDeProducao | null = null): Roteamento => {
    const disponivel = provedor === 'interno' || disponiveis.has(provedor);
    return { modo, rotulo: ROTULO_DO_MODO[modo], motivo, provedor, disponivel, bloqueio: disponivel ? null : `provedor "${provedor}" indisponível ou bloqueado (sem chave, sem cota ou sem autorização de gasto)`, alternativa: disponivel ? null : alternativa };
  };
  if (b.tipo_saida === 'video') {
    const natural = tem(texto, 'falando', 'apresentando', 'apresentador', 'andando', 'caminhando', 'girando naturalmente', 'personagem', 'mascote', 'pessoa', 'interagindo', 'movimento real');
    if (natural) return r('video_ia', 'o pedido exige movimento natural (pessoa/personagem/câmera realista) que a animação determinística não faz', 'video-ia', 'motion');
    return r('motion', 'anúncio curto com produto, texto, preço e transições: motion graphics determinístico resolve sem IA de vídeo (mais barato e fiel aos dados)', 'interno');
  }
  if (p.transparente || tem(texto, 'png transparente', 'fundo transparente', 'título 3d', 'titulo 3d', 'selo 3d', 'letras douradas', 'texto metálico', 'texto metalico'))
    return r('imagem_ia', 'elemento gráfico com transparência real/material 3D exige gerador com canal alfa', 'openai-gpt-image', 'composicao');
  if (comFoto && tem(texto, 'foto profissional', 'fotografia', 'estúdio', 'estudio', 'cenário', 'cenario', 'fundo novo', 'trocar o fundo', 'catálogo', 'catalogo', 'e-commerce'))
    return r('fotografia_produto', 'há foto real do produto: ela fica intocada (recorte) e só o cenário é gerado', 'cf-flux-schnell', 'composicao');
  if (comFoto || (p.produtos ?? []).some((x) => x.preco_centavos != null))
    return r('composicao', 'produto/preço reais fornecidos: modelo pronto + dados desenhados por código (nenhuma IA escreve preço ou marca)', 'interno');
  return r('imagem_ia', 'não há foto nem dados de produto: a cena precisa ser criada; preço/marca (se houver) entram depois por composição', 'cf-flux-schnell', 'composicao');
}

// ---------------------------------------------------------------- 5. Prompt Engineer (um prompt próprio por provedor)

const SEM_TEXTO = 'no text, no letters, no numbers, no logos, no labels, no brand names, no watermark';
export function promptsPorProvedor(b: BriefingCore, d: DirecaoCore, seg: Segmento, r: Roteamento): Record<string, string> {
  const espaco = b.formato === '9:16' ? 'empty space in the lower-middle for the product and texts' : 'empty space on the right third for the product and the left third for texts';
  const pessoas = r.modo === 'video_ia' || tem(b.o_que, 'personagem', 'mascote', 'apresentador') ? '' : ', no people, no hands, no faces';
  const base = `${seg.promptsBase.imagem}${d.ambiente_en ? `, ${d.ambiente_en}` : ''}`;
  const out: Record<string, string> = {};
  // FLUX schnell (grátis): inglês, curto (até ~60 palavras), sem texto
  out['cf-flux-schnell'] = `${base}, advertising photography, ${espaco}, high detail, ${SEM_TEXTO}${pessoas}`.split(' ').slice(0, 70).join(' ');
  // GPT Image (pago, só com autorização): pode receber regras completas e transparência
  out['openai-gpt-image'] = `Advertising visual for "${b.produto_principal ?? seg.nome}" (${seg.nome}). Style: ${d.estilo}. Scene: ${d.ambiente_en ?? seg.promptsBase.imagem}. Lighting: ${d.iluminacao}. Palette: ${d.paleta.join(', ')}. ${espaco}. ${SEM_TEXTO}${pessoas}.${tem(b.o_que, 'transparente', '3d') ? ' Transparent background (real alpha channel), no checkerboard.' : ''}`;
  // vídeo IA (image-to-video): descreve só o MOVIMENTO
  out['video-ia'] = `Image-to-video: ${seg.promptsBase.video}. Keep the product identical (shape, label, colors). ${SEM_TEXTO}. Duration ${b.duracao_s ?? 15}s.`;
  // motion interno: não é prompt, é a receita para o editor (registrada para auditoria)
  out.interno = `editor SOBRE MÍDIA: modelo do segmento ${seg.id} + dados reais por código${b.tipo_saida === 'video' ? ` + roteiro de ${b.duracao_s} s` : ''}`;
  return out;
}

// ---------------------------------------------------------------- roteiro curto (15/20 s) para o motion

const ANIMACAO_DO_PAPEL = (papel: string) => tem(papel, 'abertura') ? 'zoom' : tem(papel, 'produto') ? 'panoramica' : tem(papel, 'oferta', 'benefício', 'informação') ? 'subir' : tem(papel, 'chamada', 'encerramento') ? 'pulsar' : 'surgir';
export function roteiroCurto(duracao: number): CenaRoteiro[] {
  const base = ROTEIROS[(duracao >= 18 ? 20 : 15) as 15 | 20];
  const k = duracao / base[base.length - 1].ate;
  return base.map((c) => ({ de: Math.round(c.de * k * 10) / 10, ate: Math.round(c.ate * k * 10) / 10, papel: c.papel, animacao: ANIMACAO_DO_PAPEL(c.papel) }));
}

// ---------------------------------------------------------------- 6. Quality Assurance (do PLANO; sem certeza absoluta)

/** termos que denunciam peça do segmento ERRADO (ex.: clínica → roupa/cosmético) */
const FORA_DO_SEGMENTO: Record<string, string[]> = {
  saude: ['clothing', 'fashion', 'dress', 'lipstick', 'makeup', 'perfume', 'roupa', 'vestido', 'batom', 'maquiagem', 'burger', 'pizza'],
  fitness: ['lipstick', 'perfume', 'pizza', 'burger', 'dress'],
  alimentacao: ['gym', 'dumbbell', 'clinic', 'lipstick', 'car '],
  educacao: ['beer', 'alcohol', 'lingerie', 'cigarette'],
  varejo: ['clinic', 'surgery'],
  beleza: ['burger', 'pizza', 'engine', 'tire'],
};
const PRECO = /r\$|\$\s*\d|\d+[.,]\d{2}\b|\d+\s*%/i;

export function conferir(p: PedidoCore, b: BriefingCore, seg: Segmento, d: DirecaoCore, prompts: Record<string, string>, roteiro: CenaRoteiro[] | null): Qualidade {
  const problemas: string[] = [];
  const evidencias: string[] = [];
  const tudo = `${d.conceito} ${d.estilo} ${d.ambiente} ${d.ambiente_en ?? ''} ${Object.values(prompts).join(' ')}`;
  const proibidos = (FORA_DO_SEGMENTO[seg.id] ?? []).filter((t) => tem(tudo, t));
  if (proibidos.length) problemas.push(`direção/prompts com termos de outro segmento: ${proibidos.join(', ')}`);
  else evidencias.push(`nenhum termo de outro segmento na direção e nos prompts (lista de ${seg.id})`);
  const ambienteOk = seg.ambientes.some((a) => a === d.ambiente) || tem(d.ambiente, ...seg.palavras);
  evidencias.push(`ambiente do segmento: "${d.ambiente}" (${ambienteOk ? 'confere' : 'NÃO confere'})`);
  if (!ambienteOk) problemas.push('ambiente fora da taxonomia do segmento');
  for (const [prov, txt] of Object.entries(prompts)) if (prov !== 'interno' && PRECO.test(txt)) problemas.push(`prompt de ${prov} contém preço/percentual — preço só por composição`);
  if (!problemas.some((x) => x.includes('preço'))) evidencias.push('nenhum preço/percentual nos prompts (preço só por código)');
  if (!/no logos/.test(prompts['cf-flux-schnell'] ?? '')) problemas.push('prompt do gerador sem a proibição de logos/texto');
  else evidencias.push('prompt do gerador proíbe texto, logos e marcas');
  if (!p.marca && !p.estabelecimento && /\b(nike|adidas|coca|pepsi|samsung|apple|natura|boticario)\b/i.test(tudo)) problemas.push('marca de terceiro citada sem ter sido informada');
  if (roteiro) {
    const fim = roteiro[roteiro.length - 1]?.ate ?? 0;
    if (Math.abs(fim - (b.duracao_s ?? fim)) > 0.05) problemas.push(`roteiro soma ${fim}s, pedido ${b.duracao_s}s`);
    else evidencias.push(`roteiro soma exatamente ${fim}s`);
  }
  if (seg.id === 'saude' && PRECO.test(d.conceito)) problemas.push('saúde: conceito com número/percentual (risco de alegação)');
  if (seg.id === 'saude') evidencias.push('saúde: regras de segurança aplicadas (sem promessa de cura/resultado)');
  if (b.faltando.some((f) => f.startsWith('preço'))) evidencias.push('pendência: oferta sem preço — a arte sai sem preço até o cliente informar');
  return { aprovado: problemas.length === 0, problemas, evidencias };
}

// ---------------------------------------------------------------- refinamento opcional por IA (Diretor Criativo)

const SCHEMA_DIRECAO = {
  type: 'object', required: ['conceito', 'estilo', 'ambiente_en'],
  properties: { conceito: { type: 'string' }, estilo: { type: 'string' }, ambiente_en: { type: 'string' } },
};

function lerJson(resp: Record<string, unknown>): Record<string, unknown> | null {
  const r = (resp.result ?? resp) as Record<string, unknown>;
  const choices = r.choices as Array<{ message?: { content?: unknown } }> | undefined;
  let bruto: unknown = choices?.[0]?.message?.content ?? r.response;
  if (typeof bruto === 'string') {
    try { bruto = JSON.parse(bruto.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim()); } catch { return null; }
  }
  return bruto && typeof bruto === 'object' ? (bruto as Record<string, unknown>) : null;
}

async function refinarComIA(exec: Executar, modelo: string, b: BriefingCore, seg: Segmento, d: DirecaoCore): Promise<DirecaoCore | null> {
  const sistema = `${textoDoDna()}\n\n${DIRETRIZ.diretor}\nSegmento: ${seg.nome}. Estilos permitidos: ${seg.estilos.join(', ')}. Ambientes do segmento: ${seg.ambientes.join(' | ')}. Regras de segurança do segmento: ${seg.regrasSeguranca.join(' ')}\nResponda SÓ em JSON: conceito (pt-BR, 1 frase, sem preço/marca), estilo (um dos permitidos), ambiente_en (cenário em inglês, sem texto/logos/pessoas, até 25 palavras).`;
  const resp = await exec(modelo, { messages: [{ role: 'system', content: sistema }, { role: 'user', content: JSON.stringify({ briefing: b, direcao_base: d }) }], max_tokens: 500, temperature: 0.4, response_format: { type: 'json_schema', json_schema: SCHEMA_DIRECAO } });
  const v = lerJson(resp);
  if (!v || typeof v.conceito !== 'string' || typeof v.ambiente_en !== 'string') return null;
  // o modelo é ferramenta: só entra o que passa nas regras do Core
  if (PRECO.test(String(v.conceito)) || (FORA_DO_SEGMENTO[seg.id] ?? []).some((t) => tem(`${v.conceito} ${v.ambiente_en}`, t))) return null;
  const estilo = seg.estilos.find((e) => sem(e) === sem(String(v.estilo ?? ''))) ?? d.estilo;
  return { ...d, conceito: String(v.conceito).slice(0, 240), estilo, ambiente_en: String(v.ambiente_en).slice(0, 200), fonte: 'ia' };
}

// ---------------------------------------------------------------- orquestração

export interface OpcoesCore {
  /** segmentos extras/editados no banco (studio_conhecimento) */
  segmentos?: Segmento[];
  /** provedores disponíveis agora (ids do cadastro provedores.ts + 'interno') */
  disponiveis?: Set<string>;
  /** modelo de texto para refinar a direção (opcional: sem ele, tudo local) */
  ia?: { exec: Executar; modelo: string; provedor: string } | null;
}

export async function planejarComCore(p: PedidoCore, o: OpcoesCore = {}): Promise<ResultadoCore> {
  const etapas: EtapaCore[] = [];
  const marcar = (agente: string, modo: 'local' | 'ia', provedor: string | null, t0: number) => etapas.push({ agente, modo, provedor, versao: VERSAO_DNA, ms: Date.now() - t0 });
  let t = Date.now();
  const rec = reconhecerSegmento(`${p.texto} ${(p.produtos ?? []).map((x) => x.nome).join(' ')}`, taxonomia(o.segmentos), p.dica_segmento);
  marcar('segmento', 'local', null, t);
  t = Date.now();
  const briefing = estruturarBriefing(p, rec.segmento, rec.categoria);
  marcar('briefing', 'local', null, t);
  t = Date.now();
  let direcao = direcaoLocal(briefing, rec.segmento, rec.categoria);
  marcar('diretor', 'local', null, t);
  if (o.ia) {
    t = Date.now();
    try {
      const r = await refinarComIA(o.ia.exec, o.ia.modelo, briefing, rec.segmento, direcao);
      if (r) { direcao = r; marcar('diretor', 'ia', o.ia.provedor, t); }
      else marcar('diretor:ia-recusada-pelas-regras', 'local', o.ia.provedor, t);
    } catch { marcar('diretor:ia-indisponivel', 'local', o.ia.provedor, t); }
  }
  t = Date.now();
  const roteamento = decidirModo(p, briefing, o.disponiveis ?? new Set(['interno', 'cf-flux-schnell']));
  marcar('roteamento', 'local', null, t);
  t = Date.now();
  const prompts = promptsPorProvedor(briefing, direcao, rec.segmento, roteamento);
  const roteiro = briefing.tipo_saida === 'video' ? roteiroCurto(briefing.duracao_s ?? 15) : null;
  marcar('prompts', 'local', null, t);
  t = Date.now();
  const qualidade = conferir(p, briefing, rec.segmento, direcao, prompts, roteiro);
  marcar('qualidade', 'local', null, t);
  return {
    versao: { dna: VERSAO_DNA, biblia: VERSAO_BIBLIA },
    briefing,
    segmento: { id: rec.segmento.id, nome: rec.segmento.nome, categoria: rec.categoria?.nome ?? null, confianca: rec.confianca },
    direcao, roteamento, prompts, roteiro, qualidade, etapas,
  };
}

// ---------------------------------------------------------------- contexto para os agentes JÁ EXISTENTES (agentes.ts)

type AgenteExistente = keyof typeof DIRETRIZ;
const MODALIDADE_DO_AGENTE: Record<AgenteExistente, Modalidade[]> = {
  produtos: ['fotografia_produto'], diretor: ['imagem', 'arte_comercial'], roteirista: ['motion'], fotografia: ['fotografia_produto', 'motion'], prompts: ['imagem'],
};

/** Reconhece o segmento de um pedido do Studio por agentes (contrato.ts). */
export function segmentoDoPedido(p: PedidoStudio, segs?: Segmento[]) {
  const b = p.briefing;
  return reconhecerSegmento([b.titulo, b.ideia, b.categoria, b.segmento, b.texto_publicitario, ...p.produtos.map((x) => x.nome)].filter(Boolean).join(' '), taxonomia(segs), b.categoria);
}

/** Sistema do agente = diretriz própria + DNA + regras do segmento e da modalidade (o agente passa a "conhecer" o Core). */
export function contextoParaAgente(agente: AgenteExistente, p: PedidoStudio, segs?: Segmento[]): string {
  const { segmento, categoria } = segmentoDoPedido(p, segs);
  const regras = MODALIDADE_DO_AGENTE[agente].flatMap((m) => REGRAS[m]);
  return [
    DIRETRIZ[agente],
    textoDoDna(),
    `Segmento (${VERSAO_DNA}): ${segmento.nome}${categoria ? ` / ${categoria.nome}` : ''}. Estilos: ${segmento.estilos.join(', ')}. Ambientes: ${segmento.ambientes.join(' | ')}. Qualidade: ${segmento.regrasQualidade.join(' ')} Segurança: ${segmento.regrasSeguranca.join(' ')}`,
    `Regras da modalidade: ${regras.join(' ')}`,
    `Nunca: ${PROIBIDO[0]} ${PROIBIDO[1]}`,
  ].join('\n\n');
}

/** Estilo de referência para os agentes existentes: Bíblia v1 da categoria + ambientes/paleta do segmento do Core. */
export function estiloDoPedido(p: PedidoStudio, segs?: Segmento[]) {
  const { segmento } = segmentoDoPedido(p, segs);
  const biblia = estiloDa(p.briefing.categoria);
  return { ...biblia, segmento: segmento.nome, ambientes_do_segmento: segmento.ambientes, paleta_do_segmento: segmento.paletas[0], estilos_do_segmento: segmento.estilos, versao: VERSAO_DNA };
}

// ---------------------------------------------------------------- produção do Studio por agentes (contrato.ts) ↔ Core

/** O pedido do Studio por agentes visto pelo Core (só dados reais; preço só como "tem preço"). */
export function pedidoCoreDoPedido(p: PedidoStudio): PedidoCore {
  const b = p.briefing;
  return {
    texto: [b.titulo, b.ideia, b.texto_publicitario].filter(Boolean).join('. '),
    tipo: p.tipo === 'video_montado' || p.tipo === 'video_ia' ? 'video' : 'imagem',
    formato: p.formato, duracao_s: p.duracao_s, dica_segmento: b.categoria, estabelecimento: b.estabelecimento ?? null, marca: b.marca ?? null,
    produtos: p.produtos.map((x) => ({ id: x.id, nome: x.nome, marca: x.marca ?? null, preco_centavos: x.preco_centavos, preco_promo_centavos: x.preco_promo_centavos ?? null, tem_foto: x.fotos.length > 0 })),
  };
}

const palavras = (t: string | null | undefined, n: number) => (t ?? '').replace(/[0-9%$]/g, '').split(/\s+/).filter(Boolean).slice(0, n).join(' ');

/**
 * Plano SEM IA (modo local do Core): quando nenhum modelo de texto responde, o Core monta direção, roteiro, fotografia e
 * prompts a partir do DNA + segmento + roteiro curto. Títulos SÓ com textos que o cliente escreveu (nada inventado).
 */
export function planoLocal(p: PedidoStudio, r: ResultadoCore): { direcao: Direcao; roteiro: Roteiro; fotografia: Fotografia; prompts: Prompts } {
  const papeis = roteiroCurto(p.duracao_s);
  const n = p.cenas;
  const camera = ['aproximar', 'deslizar_esquerda', 'subir', 'afastar', 'deslizar_direita', 'estatica'].filter((c) => CAMERAS.some((k) => k.id === c));
  const produtos = p.produtos.map((x) => x.id);
  const cenas = Array.from({ length: n }, (_, i) => {
    const papel = papeis[Math.min(papeis.length - 1, Math.floor((i * papeis.length) / n))].papel;
    const produto = produtos.length && i > 0 && i < n - 1 ? produtos[(i - 1) % produtos.length] : (n === 1 ? produtos[0] ?? null : null);
    const nome = produto ? p.produtos.find((x) => x.id === produto)!.nome : null;
    const titulo = i === 0 ? palavras(p.briefing.titulo, 5) : i === n - 1 ? palavras(p.briefing.estabelecimento || p.briefing.marca || p.briefing.titulo, 5) : palavras(nome || p.briefing.titulo, 5);
    const subtitulo = i === n - 1 ? palavras(p.briefing.texto_publicitario || p.briefing.condicoes || '', 8) : palavras(papel, 8);
    return { numero: i + 1, duracao_s: p.duracao_s / n, produto_id: produto, objetivo: papel, titulo: titulo || r.segmento.nome, subtitulo };
  });
  const prompt = r.prompts['cf-flux-schnell'];
  return {
    direcao: { conceito: r.direcao.conceito, estilo_visual: r.direcao.estilo, linguagem: p.briefing.tom, paleta: r.direcao.paleta, duracao_recomendada_s: p.duracao_s, cenas_recomendadas: n },
    roteiro: { roteiro: `Roteiro local do Creative Core (${VERSAO_DNA}): ${papeis.map((x) => x.papel).join(' → ')}.`, cenas },
    fotografia: { cenas: cenas.map((c, i) => ({ numero: c.numero, enquadramento: i === 0 ? 'plano aberto' : 'plano médio no produto', iluminacao: r.direcao.iluminacao.slice(0, 120), lente: i === 0 ? '24mm' : '50mm', camera: camera[i % camera.length] as Fotografia['cenas'][number]['camera'] })) },
    prompts: { cenas: cenas.map((c, i) => ({ numero: c.numero, prompt_cenario: i === 0 ? prompt : `${prompt}, variation ${i + 1}, different angle`, negativo: 'text, letters, numbers, logos, labels, watermark, people, hands' })) },
  };
}
