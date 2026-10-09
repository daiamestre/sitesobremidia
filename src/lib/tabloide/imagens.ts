/**
 * Tabloide Digital (F-172) — foto automática do produto.
 * Ordem: 1) catálogo próprio (o que o anunciante/empresa já escolheu antes) → 2) busca (Open Food Facts, Pexels, Pixabay)
 * → 3) desenho com emoji do produto, quando nada serve. O cliente sempre pode trocar a foto.
 */
import { supabase } from '@/integrations/supabase/client';
import { tabelaTabloide } from './db';
import { recortarImagem } from './recorte';
import { uploadToR2 } from '@/lib/r2Upload';
import { chaveDoProduto, type FonteImagem, type ImagemProduto, type ProdutoTabloide } from './parseProdutos';

export interface CandidatoImagem extends ImagemProduto {
  miniatura: string;
  legenda: string;
}

/** Itens frescos/preparados: a foto de embalagem do Open Food Facts não serve, vale mais uma foto de banco de imagens. */
const FRESCO = /\b(picanha|carne|bife|patinho|alcatra|contrafile|file|costela|coxa|frango|peixe|tilapia|camarao|linguica|salsicha|tomate|cebola|batata|alface|banana|maca|laranja|limao|uva|mamao|melancia|abacaxi|manga|cenoura|pepino|pimentao|verdura|fruta|legume|ovo|ovos|pao|bolo|salgado|coxinha|pizza|hamburguer|lanche|prato|marmita|feijoada|churrasco|sorvete|acai|suco|doce|torta|sushi|lasanha|queijo|presunto|mortadela|cerveja|chopp|caipirinha|vinho)\b/;

const EMOJIS: Array<[RegExp, string]> = [
  [/picanha|carne|bife|patinho|alcatra|contrafile|costela/, '🥩'], [/frango|coxa|sobrecoxa/, '🍗'], [/linguica|salsicha|calabresa/, '🌭'],
  [/peixe|tilapia|sardinha|salmao|atum/, '🐟'], [/camarao/, '🍤'], [/tomate/, '🍅'], [/cebola/, '🧅'], [/batata/, '🥔'], [/cenoura/, '🥕'],
  [/alface|verdura|couve|repolho|brocolis/, '🥬'], [/banana/, '🍌'], [/maca\b/, '🍎'], [/laranja|tangerina|mexerica/, '🍊'], [/limao/, '🍋'],
  [/uva/, '🍇'], [/melancia/, '🍉'], [/abacaxi/, '🍍'], [/manga/, '🥭'], [/mamao/, '🥭'], [/morango/, '🍓'],
  [/pao|baguete|croissant/, '🥖'], [/bolo|torta/, '🍰'], [/doce|brigadeiro|chocolate/, '🍫'], [/sorvete|picole/, '🍦'], [/cafe/, '☕'],
  [/leite/, '🥛'], [/queijo/, '🧀'], [/ovo/, '🥚'], [/arroz/, '🍚'], [/feijao|feijoada/, '🫘'], [/macarrao|massa|lasanha/, '🍝'],
  [/pizza/, '🍕'], [/hamburguer|burger|x-/, '🍔'], [/batata frita|fritas/, '🍟'], [/sushi/, '🍣'], [/refrigerante|coca|guarana|suco|agua/, '🥤'],
  [/cerveja|chopp|long neck/, '🍺'], [/vinho/, '🍷'], [/caipirinha|drink/, '🍹'], [/dipirona|remedio|vitamina|capsula|comprimido|antibiotico|analgesico/, '💊'],
  [/protetor|creme|hidratante/, '🧴'], [/shampoo|condicionador|sabonete/, '🧼'], [/consulta|exame|clinica|dentista|limpeza dental/, '🩺'],
  [/racao|petisco|banho e tosa|pet/, '🐶'], [/areia/, '🐱'], [/cimento|tijolo|piso|porcelanato/, '🧱'], [/tinta/, '🎨'], [/torneira|ferramenta|furadeira/, '🔧'],
  [/camiseta|camisa|blusa/, '👕'], [/calca|jeans|bermuda/, '👖'], [/vestido/, '👗'], [/tenis|sapato|sandalia/, '👟'],
  [/corte|escova|manicure|pedicure|cabelo|massagem|estetica|pele/, '💇'], [/oleo|azeite/, '🫒'], [/acucar|sal\b|farinha/, '🧂'],
];

export function emojiDoProduto(nome: string, emojiPadrao = '🛒'): string {
  const k = chaveDoProduto(nome);
  for (const [re, e] of EMOJIS) if (re.test(k)) return e;
  return emojiPadrao;
}

export function ehFresco(nome: string): boolean {
  return FRESCO.test(chaveDoProduto(nome));
}

/** Escolhe a melhor entre as fotos encontradas. */
export function escolherMelhor(nome: string, cands: CandidatoImagem[]): CandidatoImagem | null {
  if (!cands.length) return null;
  const ordem: FonteImagem[] = ehFresco(nome) ? ['PEXELS', 'PIXABAY', 'OPENFOODFACTS'] : ['OPENFOODFACTS', 'PEXELS', 'PIXABAY'];
  for (const fonte of ordem) {
    const c = cands.find((x) => x.fonte === fonte);
    if (c) return c;
  }
  return cands[0];
}

export async function buscarCandidatos(termo: string): Promise<CandidatoImagem[]> {
  const { data, error } = await supabase.functions.invoke('produto-imagem', { body: { termo } });
  if (error) return [];
  return ((data?.candidatos ?? []) as Array<CandidatoImagem & { fonte: FonteImagem }>).filter((c) => c.url);
}

export async function buscarNoCatalogo(nomes: string[]): Promise<Map<string, ImagemProduto>> {
  const chaves = [...new Set(nomes.map(chaveDoProduto).filter(Boolean))];
  const mapa = new Map<string, ImagemProduto>();
  if (!chaves.length) return mapa;
  const { data, error } = await tabelaTabloide('tabloide_catalogo')
    .select('nome_norm, imagem_url, fonte, credito, cliente_id, recortada')
    .in('nome_norm', chaves);
  if (error || !data) return mapa;
  // a escolha do próprio anunciante vale mais que a da empresa
  const linhas = [...(data as any[])].sort((a, b) => (a.cliente_id ? 0 : 1) - (b.cliente_id ? 0 : 1));
  for (const l of linhas) if (!mapa.has(l.nome_norm)) mapa.set(l.nome_norm, { url: l.imagem_url, fonte: l.fonte, credito: l.credito ?? undefined, recortada: !!l.recortada });
  return mapa;
}

/** Guarda a foto escolhida: da próxima vez que alguém digitar o mesmo produto, ela já vem pronta. */
export async function salvarNoCatalogo(nome: string, imagem: ImagemProduto, clienteId: string | null): Promise<void> {
  const nome_norm = chaveDoProduto(nome);
  if (!nome_norm) return;
  const filtro = tabelaTabloide('tabloide_catalogo').update({ imagem_url: imagem.url, fonte: imagem.fonte, credito: imagem.credito ?? null, recortada: !!imagem.recortada } as never).eq('nome_norm', nome_norm);
  const { data } = await (clienteId ? filtro.eq('cliente_id', clienteId) : filtro.is('cliente_id', null)).select('id');
  if (data && data.length) return;
  await tabelaTabloide('tabloide_catalogo').insert({ nome_norm, nome, imagem_url: imagem.url, fonte: imagem.fonte, credito: imagem.credito ?? null, recortada: !!imagem.recortada, cliente_id: clienteId } as never);
}

/**
 * Deixa a foto pronta para o cartaz: tira o fundo liso, corta as sobras e guarda o PNG transparente no nosso armazenamento.
 * Se a foto tem cenário (não dá para recortar com segurança) ou algo falha, devolve a foto original.
 */
export async function prepararImagem(imagem: ImagemProduto): Promise<ImagemProduto> {
  if (imagem.recortada) return imagem;
  try {
    const png = await recortarImagem(imagem.url);
    if (!png) return imagem;
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return imagem;
    const { publicUrl } = await uploadToR2(png, `${uid}/tabloide/recorte-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.png`, 'image/png', uid);
    return { ...imagem, url: publicUrl, recortada: true };
  } catch {
    return imagem;
  }
}

/**
 * Procura a foto de todos os produtos que ainda não têm. Chama `aoAchar` a cada foto pronta
 * (o cartaz vai se completando na tela). Produtos sem foto boa ficam com o desenho de emoji.
 */
export async function completarImagens(
  produtos: ProdutoTabloide[],
  clienteId: string | null,
  aoAchar: (id: string, imagem: ImagemProduto | null) => void,
): Promise<void> {
  const faltam = produtos.filter((p) => !p.imagem);
  if (!faltam.length) return;
  const catalogo = await buscarNoCatalogo(faltam.map((p) => p.nome));
  const buscar: ProdutoTabloide[] = [];
  for (const p of faltam) {
    const achada = catalogo.get(chaveDoProduto(p.nome));
    if (achada) aoAchar(p.id, achada); else buscar.push(p);
  }
  let i = 0;
  const trabalhador = async () => {
    while (i < buscar.length) {
      const p = buscar[i++];
      try {
        const cands = await buscarCandidatos(p.nome);
        const fresco = ehFresco(p.nome);
        const reais = cands.filter((c) => c.fonte === 'OPENFOODFACTS');
        // produto de marca/embalagem só recebe foto real do produto; banco de imagens é só para frescos e pratos
        const lista = fresco ? [escolherMelhor(p.nome, cands)].filter((c): c is CandidatoImagem => !!c) : reais.slice(0, 4);
        if (!lista.length) { aoAchar(p.id, null); continue; }
        const paraImagem = (c: CandidatoImagem): ImagemProduto => ({ url: c.url, fonte: c.fonte, credito: c.credito });
        aoAchar(p.id, paraImagem(lista[0])); // aparece na hora; o recorte troca em seguida
        let final = paraImagem(lista[0]);
        // entre as fotos reais, fica a primeira que dá para recortar (fundo liso = foto de embalagem bem feita)
        for (const c of lista) {
          const pronta = await prepararImagem(paraImagem(c));
          if (pronta.recortada) { final = pronta; break; }
        }
        aoAchar(p.id, final);
        void salvarNoCatalogo(p.nome, final, clienteId);
      } catch {
        aoAchar(p.id, null);
      }
    }
  };
  await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
}
