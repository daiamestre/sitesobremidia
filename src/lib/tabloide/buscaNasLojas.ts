/**
 * F-295 — O PRÓPRIO SISTEMA PROCURA O PRODUTO (pedido do dono, 10/11/2026): o cliente escreve o produto do jeito que fala
 * ("polpa de acerola marca Caruaru pacote com 10 de 400g") e, quando o catálogo da SOBRE MÍDIA não tem a foto, o site procura NA HORA
 * a foto oficial da embalagem nas lojas que vendem a marca (catálogo aberto VTEX, robots.txt conferido), sem o PC ligado e sem o Claude.
 *   1) o Worker da SOBRE MÍDIA na Cloudflare consulta as lojas da lista (rota /procurar, só essas lojas: não é um repasse aberto);
 *   2) aqui, no navegador, valem as MESMAS regras dos agentes (F-282): mesmo tipo, mesma marca, mesma medida, o tradicional primeiro;
 *      carne/fruta/legume só da seção de açougue/hortifrúti; nada de kit, combo ou fardo;
 *   3) a foto vem por link (passa-foto, sem guardar arquivo), o fundo sai (Cloudflare ou o próprio navegador) e ela vira a foto do
 *      produto no catálogo: o próximo cliente que escrever o mesmo produto recebe na hora.
 * Sem foto exata nas lojas: o produto vira PEDIDO para os agentes (fila tabloide_pedidos_de_foto), que também rodam na nuvem.
 */
import { chaveCanonica } from './chave';
import { diferenca, lerBusca, naoEhProduto } from './buscaProduto';
import { ehPedidoDeHortifruti } from './hortifruti';
import { PASSA_FOTO, linkDaFoto } from './fotoPorLink';
import type { ImagemProduto } from './parseProdutos';

export const PROCURAR = PASSA_FOTO.replace(/\/foto$/, '/procurar');

export interface ItemDaLoja {
  titulo: string;
  marca: string;
  foto: string;
  loja: string;
  pagina: string;
  codigo: string | null;
  secao: string;
}

const sem = (t: string) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** sabores comuns: quem não escreve o sabor aceita o mais vendido da marca (igual aos agentes) */
const SABORES = new Set(['chocolate', 'morango', 'baunilha', 'coco', 'limao', 'laranja', 'uva', 'maracuja', 'abacaxi', 'goiaba', 'tradicional', 'original', 'leite', 'creme', 'mel']);
/** sabores/frutas de mistura: quem pediu "acerola" não recebe "acerola com mamão" */
const SABORES_DE_MISTURA = new Set([...SABORES, 'mamao', 'manga', 'caju', 'cenoura', 'hortela', 'gengibre', 'acerola', 'cupuacu', 'acai', 'graviola', 'caja', 'seriguela',
  'pitanga', 'tamarindo', 'cereja', 'framboesa', 'mirtilo', 'vermelhas', 'menta', 'canela', 'ameixa', 'pessego', 'melancia', 'melao', 'kiwi', 'pera', 'maca', 'banana',
  'cacau', 'amendoim', 'avela', 'baunilha', 'couve', 'beterraba', 'mel', 'limao', 'tangerina', 'mexerica', 'jabuticaba', 'pinha', 'umbu', 'mangaba']);
/** carne, peixe, fruta, legume, ovo: só vale item da seção de açougue/hortifrúti (nada de Pringles para "batata") */
const FRESCO = /(picanha|alcatra|patinho|acem|musculo|contrafile|costela|cupim|maminha|fraldinha|lagarto|coxao|bisteca|pernil|lombo|linguica|frango|sobrecoxa|moela|carne|charque|peixe|tilapia|batata|tomate|cebola|alho|cenoura|alface|banana|laranja|limao|abacaxi|mamao|melancia|melao|manga|morango|chuchu|abobrinha|abobora|pimentao|pepino|repolho|couve|brocolis|beterraba|mandioca|ovos?)\b/;
const SECAO_FRESCA = /horti|frut|legum|verdur|acougue|carne|aves|frango|bovin|suin|peix|ovos|frios|congelad/;
const SECAO_ERRADA = /pet|limpez|bebida|refriger|snack|salgad|biscoit|higien|perfum|farmac|medicament/;
/** kits, combos, fardos e brindes: a foto não é a de UMA embalagem */
const KIT = /\b(kit|combo|leve\s*\d|pague\s*\d|ganhe|brinde|gratis|estojo|fardo|display com|presente|copo|taca|camiseta|bone)\b/;

/**
 * O que DESCREVE a embalagem mas não é o nome do produto: "marca", "pacote com 10 de", "c/ 12", "10 unidades".
 * "Polpa de acerola marca Caruaru pacote com 10 de 400g" → "polpa de acerola caruaru 400g".
 */
export function nomeParaBusca(nome: string): string {
  return sem(nome)
    .replace(/\bmarca\s*:?\s+/g, ' ')
    .replace(/\b(pacote|pct|caixa|cx|embalagem|saco|fardo|bandeja|pote|frasco)\s+(com|c\/)\s*\d+\s*(unidades?|un|und|unid)?\s*(de)?\b/g, ' ')
    .replace(/\b(com|c\/|contendo)\s*\d+\s*(unidades?|un|und|unid|sach[eê]s?|capsulas?|comprimidos?|rolos?|latas?|garrafas?)?\s*(de)?(?=\s|$)/g, ' ')
    .replace(/\b\d+\s*(unidades?|unid|und)\b/g, ' ')
    .replace(/\b(pacote|pct|embalagem)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** quantas unidades a embalagem tem ("46 unidades", "c/ 12", "10 comprimidos", "com 8 rolos"); null se não diz */
export function contagemDe(texto: string): number | null {
  const s = sem(texto);
  const m = /\b(\d{1,4})\s*(?:unidades?|un|und|unid|comprimidos?|capsulas?|rolos?|saches?|sachês?|fraldas?|tiras?|lencos?|envelopes?)\b/.exec(s)
    ?? /\b(?:com|c\/|contendo|leve)\s*(\d{1,4})\b(?!\s*(?:kg|g|gr|ml|l|lt|mg)\b)/.exec(s);
  return m ? Number(m[1]) : null;
}

/** o texto que vai para a busca das lojas: sem medida (o título da loja escreve de vários jeitos) e sem palavras de ligação */
export function termoDaLoja(nome: string): string {
  return nomeParaBusca(nome)
    .replace(/\d+([.,]\d+)?\s*(kg|g|gr|gramas?|ml|l|lt|litros?)\b/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((p) => p && !['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'sem', 'tipo', 'a', 'o'].includes(p))
    .slice(0, 7)
    .join(' ');
}

/** lê a resposta do Worker ([{ l: loja, d: [produtos VTEX] }]) em itens simples */
export function itensDaResposta(resposta: unknown): ItemDaLoja[] {
  const out: ItemDaLoja[] = [];
  for (const parte of Array.isArray(resposta) ? resposta : []) {
    const loja = String((parte as { l?: string })?.l ?? '');
    for (const p of Array.isArray((parte as { d?: unknown[] })?.d) ? (parte as { d: any[] }).d : []) {
      for (const it of (Array.isArray(p?.items) ? p.items : []).slice(0, 3)) {
        const foto = it?.images?.[0]?.imageUrl;
        if (!foto) continue;
        out.push({
          titulo: String(it.nameComplete || it.name || p.productName || '').replace(/\s+/g, ' ').trim(),
          marca: String(p.brand ?? '').trim(),
          foto: String(foto).replace(/^http:/, 'https:').replace(/\?.*$/, ''),
          loja,
          pagina: String(p.link ?? ''),
          codigo: /^\d{8,14}$/.test(String(it.ean ?? '')) ? String(it.ean) : null,
          secao: sem((Array.isArray(p.categories) ? p.categories : []).join(' ')),
        });
      }
    }
  }
  return out;
}

/** os itens das lojas que são o produto EXATO que o cliente escreveu (regras dos agentes, F-282/F-284), do melhor ao pior, sem foto repetida */
export function opcoesDaLoja(nome: string, itens: ItemDaLoja[]): ItemDaLoja[] {
  const limpo = nomeParaBusca(nome);
  const b = lerBusca(limpo);
  if (!b.palavras.length) return [];
  const fresco = FRESCO.test(sem(limpo));
  const contagem = contagemDe(nome);
  const notas: Array<{ it: ItemDaLoja; d: number }> = [];
  for (const it of itens) {
    const titulo = sem(it.titulo);
    if (!titulo || naoEhProduto(it.titulo) || (KIT.test(titulo) && !KIT.test(sem(limpo)))) continue;
    if (fresco && (!SECAO_FRESCA.test(it.secao) || SECAO_ERRADA.test(it.secao))) continue;
    // a quantidade de unidades tem de bater quando os dois dizem (fralda com 46 ≠ fralda com 92)
    const daLoja = contagemDe(it.titulo);
    if (contagem !== null && daLoja !== null && daLoja !== contagem) continue;
    const chave = chaveCanonica(it.titulo);
    const d = diferenca(b, chave);
    if (d === null) continue;
    // até 2,5 = o produto exato/tradicional; até 5,5 só quando o que sobra é SABOR (vale o mais vendido)
    const sobra = chave.split(' ').filter((t) => !b.palavras.includes(t));
    // pediu um sabor e veio outro junto (acerola → acerola com mamão): é outro produto
    if (b.palavras.some((p) => SABORES_DE_MISTURA.has(p)) && sobra.some((t) => SABORES_DE_MISTURA.has(t))) continue;
    const soSabor = sobra.some((t) => SABORES.has(t));
    if (d > (soSabor ? 5.5 : 2.5)) continue;
    notas.push({ it, d });
  }
  // a ordem das lojas já vem pelos MAIS VENDIDOS: no empate fica a primeira
  notas.sort((a, z) => a.d - z.d);
  const vistas = new Set<string>();
  return notas.map((n) => n.it).filter((it) => !vistas.has(it.foto) && vistas.add(it.foto));
}

/** o melhor item exato, ou null */
export const escolherDaLoja = (nome: string, itens: ItemDaLoja[]): ItemDaLoja | null => opcoesDaLoja(nome, itens)[0] ?? null;

export interface AchadoNaLoja { imagem: ImagemProduto; titulo: string; codigo: string | null; loja: string }

/**
 * Procura o produto nas lojas, pelo Worker da SOBRE MÍDIA. Fruta/legume/verdura sem marca NÃO passa por aqui
 * (só recebe foto do hortifrúti conferido, F-291). Falha de rede = null (o encarte segue pelas outras fontes).
 */
export async function procurarNasLojas(nome: string, limiteMs = 12000, maximo = 4): Promise<AchadoNaLoja[]> {
  if (ehPedidoDeHortifruti(nome)) return [];
  const termo = termoDaLoja(nome);
  if (termo.replace(/\s/g, '').length < 3) return [];
  try {
    const r = await fetch(`${PROCURAR}?q=${encodeURIComponent(termo)}`, { signal: AbortSignal.timeout(limiteMs) });
    if (!r.ok) return [];
    return opcoesDaLoja(nome, itensDaResposta(await r.json())).slice(0, maximo).map((it) => ({
      imagem: { url: linkDaFoto(it.foto, null, true), fonte: 'MARCA' as const, credito: `Imagem oficial${it.marca ? ` ${it.marca}` : ''} (via ${it.loja})` },
      titulo: it.titulo,
      codigo: it.codigo,
      loja: it.loja,
    }));
  } catch {
    return [];
  }
}
