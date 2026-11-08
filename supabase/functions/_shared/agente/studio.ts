// SOBRE MÍDIA — CENTRAL DE COMANDO → STUDIO (MG-AUT-07, F-266). Regras PURAS (sem banco) que a função agente-ia usa para
// transformar um pedido em conversa numa produção REAL do Studio (studio_criar_producao, com o login de quem pediu) e para
// mostrar o estado real. Nada aqui inventa dado: produto e preço só entram se a PESSOA os escreveu na conversa.
import {
  CATEGORIAS, FORMATOS, OBJETIVOS, TONS, LIMITES, precoEmCentavos, validarPedido,
  type Formato, type PedidoStudio, type ProdutoPedido, type TipoProducao,
} from '../studio/contrato.ts';

export interface ArgsCriarProducao {
  titulo?: string; ideia?: string; categoria?: string; objetivo?: string; tom?: string; formato?: string;
  tipo?: string; duracao_s?: number; cenas?: number; estabelecimento?: string; publico?: string;
  produtos?: Array<{ nome?: string; marca?: string; preco?: string | number; preco_promocional?: string | number; unidade?: string }>;
}

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const igual = (a: string, b: string) => a.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() === b.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const escolher = <T extends string>(lista: readonly T[], v: unknown, padrao: T): T => lista.find((x) => igual(x, String(v ?? ''))) ?? padrao;

/** Formas como um preço em centavos pode aparecer escrito pela pessoa: 1990 → "19,90", "19.90", "19,9", "1.990,00"… */
export function formasDoPreco(centavos: number): string[] {
  const reais = Math.floor(centavos / 100), cent = centavos % 100;
  const milhar = reais.toLocaleString('pt-BR');
  const c2 = String(cent).padStart(2, '0');
  const formas = [`${reais},${c2}`, `${reais}.${c2}`, `${milhar},${c2}`];
  if (cent === 0) formas.push(`${reais}`, `${milhar}`, `${reais},0`, `${reais}.0`);
  else if (cent % 10 === 0) formas.push(`${reais},${cent / 10}`, `${reais}.${cent / 10}`);
  return [...new Set(formas)];
}

/** O preço foi ESCRITO pela pessoa na conversa? (trava contra preço inventado pelo modelo de IA) */
export function precoFoiInformado(centavos: number, falasDaPessoa: string): boolean {
  const t = ` ${falasDaPessoa.replace(/\s+/g, ' ')} `;
  return formasDoPreco(centavos).some((f) => new RegExp(`(^|[^0-9.,])${f.replace(/[.]/g, '\\.')}(?![0-9]|[.,][0-9])`).test(t));
}

/**
 * Monta o pedido do Studio a partir dos argumentos que o modelo de IA extraiu da conversa. Devolve os ERROS (o agente
 * pergunta à pessoa) em vez de completar com dados inventados. Preço só vale se aparecer escrito nas falas da pessoa.
 */
export function pedidoDaConversa(a: ArgsCriarProducao, falasDaPessoa: string): { pedido: PedidoStudio | null; erros: string[]; perguntar: string[] } {
  const erros: string[] = [], perguntar: string[] = [];
  const titulo = texto(a.titulo, 80), ideia = texto(a.ideia, LIMITES.ideia);
  if (!titulo) perguntar.push('um nome curto para a campanha');
  if (ideia.length < 10) perguntar.push('o que o anúncio deve comunicar (a ideia)');
  const categoria = CATEGORIAS.find((c) => igual(c, String(a.categoria ?? ''))) ?? '';
  if (!categoria) perguntar.push(`o segmento (${CATEGORIAS.join(', ')})`);
  const tipo: TipoProducao = a.tipo === 'imagens' ? 'imagens' : 'video_montado';
  const formato = (FORMATOS.find((f) => f.id === a.formato)?.id ?? '16:9') as Formato;
  const duracao = tipo === 'imagens' ? 15 : Math.min(LIMITES.duracaoMax, Math.max(LIMITES.duracaoMin, Math.round(Number(a.duracao_s) || 15)));
  const cenas = Math.min(LIMITES.cenasMax, Math.max(1, Math.round(Number(a.cenas) || (duracao >= 30 ? 6 : 4)), 1));
  const produtos: ProdutoPedido[] = [];
  for (const [i, p] of (a.produtos ?? []).slice(0, LIMITES.produtos).entries()) {
    const nome = texto(p?.nome, 60);
    if (!nome) continue;
    const preco = p?.preco != null && p.preco !== '' ? precoEmCentavos(String(p.preco)) : null;
    const promo = p?.preco_promocional != null && p.preco_promocional !== '' ? precoEmCentavos(String(p.preco_promocional)) : null;
    if (preco != null && !precoFoiInformado(preco, falasDaPessoa)) erros.push(`O preço de "${nome}" não foi escrito por você — informe o preço exato.`);
    if (promo != null && !precoFoiInformado(promo, falasDaPessoa)) erros.push(`O preço promocional de "${nome}" não foi escrito por você — informe o valor exato.`);
    produtos.push({ id: `p${i + 1}`, nome, marca: texto(p?.marca, 60) || null, preco_centavos: promo != null && preco == null ? promo : preco,
      preco_promo_centavos: promo != null && preco != null ? promo : null, unidade: texto(p?.unidade, 20) || null, fotos: [] });
  }
  if (perguntar.length) return { pedido: null, erros, perguntar };
  const pedido: PedidoStudio = {
    briefing: {
      titulo, ideia, categoria, objetivo: escolher(OBJETIVOS, a.objetivo, produtos.length ? 'Divulgar ofertas' : 'Fortalecer a marca'),
      tom: escolher(TONS, a.tom, TONS[0]), estabelecimento: texto(a.estabelecimento, 120) || null, publico: texto(a.publico, 120) || null,
      segmento: null, marca: null, condicoes: null, periodo: null, texto_publicitario: null,
    },
    produtos, formato, duracao_s: duracao, cenas: Math.max(1, Math.min(cenas, Math.floor(duracao / 2))), tipo,
  };
  erros.push(...validarPedido(pedido));
  return { pedido: erros.length ? null : pedido, erros, perguntar };
}

/** Estado REAL da produção em linguagem simples + o que a pessoa precisa fazer (aprovações são no Studio: nível 2). */
const SITUACAO: Record<string, { texto: string; acao: string | null }> = {
  recebido: { texto: 'na fila, os agentes vão começar', acao: null },
  planejando: { texto: 'os agentes estão planejando', acao: null },
  aguardando_aprovacao_plano: { texto: 'plano pronto, esperando a sua aprovação', acao: 'aprovar o plano' },
  gerando_imagens: { texto: 'gerando os cenários', acao: null },
  aguardando_aprovacao_imagens: { texto: 'cenários prontos, esperando a sua aprovação', acao: 'aprovar as imagens e pedir a montagem' },
  montando: { texto: 'montando o vídeo', acao: null },
  conferindo: { texto: 'conferindo a qualidade', acao: null },
  pronto: { texto: 'pronto, conferido e aprovado pelo controle de qualidade', acao: 'enviar para as mídias' },
  entregue: { texto: 'entregue nas mídias', acao: null },
  reprovado: { texto: 'reprovado no controle de qualidade', acao: 'ver o motivo e pedir ajuste' },
  erro: { texto: 'parou com erro', acao: 'ver o motivo e tentar de novo' },
  cancelado: { texto: 'cancelada', acao: null },
};
export function situacaoDaProducao(p: { id: string; titulo?: string | null; estado: string; erro?: string | null; tipo?: string; formato?: string; resultado?: Record<string, unknown> | null }) {
  const s = SITUACAO[p.estado] ?? { texto: p.estado, acao: null };
  return {
    id: p.id, titulo: p.titulo ?? '', estado: p.estado, situacao: s.texto, o_que_fazer: s.acao, erro: p.erro ?? null,
    tipo: p.tipo, formato: p.formato, abrir_no_studio: `/studio/agentes/${p.id}`,
    video: (p.resultado?.video_url as string | undefined) ?? null,
  };
}

// ---------------------------------------------------------------- MG-AUT-08 (F-267): encarte oficial e "arte → vídeo"
// O encarte e o palco OFICIAIS são compostos pelo próprio Studio (balões de ESTILOS_DE_BALAO, fotos oficiais do catálogo,
// edição completa). A Central não desenha um segundo encarte: ela entrega o link da pasta oficial com a lista de produtos
// e preços ESCRITOS pela pessoa; a pasta abre já montada e a pessoa confere, ajusta e exporta/salva (nível 2).
export const PASTAS_DO_STUDIO = {
  encarte: { mercado: 'encartes-de-mercado', farmacia: 'encartes-de-farmacia' },
  palco: { mercado: 'palco-de-ofertas', farmacia: 'palco-de-ofertas-farmacia' },
} as const;
export const LIMITE_PRODUTOS_ENCARTE = 20;

const reais = (c: number) => `${Math.floor(c / 100)},${String(c % 100).padStart(2, '0')}`;

export interface ArgsEncarte {
  tipo?: string; segmento?: string;
  produtos?: Array<{ nome?: string; preco?: string | number; preco_promocional?: string | number }>;
}

/** Linhas no formato que o Studio já lê (lerLinha): "Nome 12,90" ou "Nome de 29,90 por 24,90". */
export function encarteDaConversa(a: ArgsEncarte, falasDaPessoa: string): { link: string | null; linhas: string[]; erros: string[]; perguntar: string[] } {
  const erros: string[] = [], perguntar: string[] = [], linhas: string[] = [];
  const tipo = a.tipo === 'palco' ? 'palco' : 'encarte';
  const segmento = /farm/i.test(String(a.segmento ?? '')) ? 'farmacia' : 'mercado';
  const lista = (a.produtos ?? []).filter((p) => texto(p?.nome, 60));
  if (!lista.length) perguntar.push('os produtos e os preços (ex.: "Arroz Tio João 5kg 24,90")');
  for (const p of lista.slice(0, LIMITE_PRODUTOS_ENCARTE)) {
    const nome = texto(p.nome, 60).replace(/\s*\d+[.,]\d{2}\s*$/, '');
    const preco = p.preco != null && p.preco !== '' ? precoEmCentavos(String(p.preco)) : null;
    const promo = p.preco_promocional != null && p.preco_promocional !== '' ? precoEmCentavos(String(p.preco_promocional)) : null;
    if (preco == null && promo == null) { perguntar.push(`o preço de "${nome}"`); continue; }
    for (const [v, rotulo] of [[preco, 'preço'], [promo, 'preço promocional']] as const) {
      if (v != null && !precoFoiInformado(v, falasDaPessoa)) erros.push(`O ${rotulo} de "${nome}" não foi escrito por você — informe o valor exato.`);
    }
    if (preco != null && promo != null) {
      if (promo >= preco) erros.push(`"${nome}": o preço promocional precisa ser menor que o normal.`);
      linhas.push(`${nome} de ${reais(preco)} por ${reais(promo)}`);
    } else linhas.push(`${nome} ${reais((preco ?? promo)!)}`);
  }
  if (lista.length > LIMITE_PRODUTOS_ENCARTE) erros.push(`O encarte comporta até ${LIMITE_PRODUTOS_ENCARTE} produtos.`);
  const ok = !erros.length && !perguntar.length && linhas.length > 0;
  const pasta = PASTAS_DO_STUDIO[tipo][segmento];
  return { link: ok ? `/studio/pasta/${pasta}?produtos=${encodeURIComponent(linhas.join('\n'))}` : null, linhas, erros, perguntar };
}

/** "Transforme esta arte em vídeo": abre o editor de vídeo do Studio com a arte (mídia da própria pessoa) e o movimento. */
export function linkArteParaVideo(midiaId: string, duracao: unknown): { link: string | null; erro: string | null; duracao_s: number } {
  const d = Math.min(LIMITES.duracaoMax, Math.max(LIMITES.duracaoMin, Math.round(Number(duracao) || 15)));
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(midiaId)) return { link: null, erro: 'Escolha a arte (use listar_minhas_artes).', duracao_s: d };
  return { link: `/studio/video?midia=${midiaId}&duracao=${d}`, erro: null, duracao_s: d };
}
