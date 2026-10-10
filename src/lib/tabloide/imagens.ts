/**
 * Tabloide Digital (F-172) — foto automática do produto.
 * Ordem: 1) catálogo próprio (o que o anunciante/empresa já escolheu antes) → 2) busca (Open Food Facts, Pexels, Pixabay)
 * → 3) desenho com emoji do produto, quando nada serve. O cliente sempre pode trocar a foto.
 */
import { supabase } from '@/integrations/supabase/client';
import { tabelaTabloide } from './db';
import { cortarMargens, recortarImagem } from './recorte';
import { uploadToR2 } from '@/lib/r2Upload';
import { chaveDoProduto, type FonteImagem, type ImagemProduto, type ProdutoTabloide } from './parseProdutos';

export interface CandidatoImagem extends ImagemProduto {
  miniatura: string;
  legenda: string;
  /** Veredicto da IA de visão: a foto é mesmo o produto? (ausente = a conferência não rodou) */
  conferido?: boolean;
}

/** Itens frescos/preparados: a foto de embalagem do Open Food Facts não serve, vale mais uma foto de banco de imagens. */
const FRESCO = /\b(picanha|carne|bife|patinho|alcatra|contrafile|file|costela|coxa|frango|peixe|tilapia|camarao|linguica|salsicha|tomate|cebola|batata|alface|banana|maca|laranja|limao|uva|mamao|melancia|abacaxi|manga|cenoura|pepino|pimentao|verdura|fruta|legume|ovo|ovos|pao|bolo|salgado|coxinha|pizza|hamburguer|lanche|prato|marmita|feijoada|churrasco|sorvete|acai|suco|doce|torta|sushi|lasanha|queijo|presunto|mortadela|cerveja|chopp|caipirinha|vinho)\b/;

export function ehFresco(nome: string): boolean {
  return FRESCO.test(chaveDoProduto(nome));
}

/** Ordem de preferência entre fotos reais: embalagem/produto de catálogo primeiro; para frescos, foto de banco de imagens primeiro. */
export function ordemDeFontes(nome: string): FonteImagem[] {
  return ehFresco(nome)
    ? ['WIKIMEDIA', 'PEXELS', 'PIXABAY', 'OPENVERSE', 'OPENFOODFACTS']
    : ['OPENFOODFACTS', 'WIKIMEDIA', 'OPENVERSE', 'PEXELS', 'PIXABAY'];
}

/**
 * Fotos reais aceitas, da melhor para a pior.
 * Embalagem de catálogo e Wikimedia passam pelo filtro de nome; Openverse e bancos de imagens só entram se a IA de visão
 * confirmou que a foto é o produto; foto que a IA reprovou sai. A ordem segue a fonte mais adequada ao produto
 * e, dentro da mesma fonte, a confirmada vem na frente.
 */
export function fotosAceitas(nome: string, cands: CandidatoImagem[]): CandidatoImagem[] {
  const ordem = ordemDeFontes(nome);
  const passaNoFiltro = (c: CandidatoImagem) => c.fonte === 'OPENFOODFACTS' || c.fonte === 'WIKIMEDIA' || (ehFresco(nome) && (c.fonte === 'PEXELS' || c.fonte === 'PIXABAY'));
  const peso = (c: CandidatoImagem) => ordem.indexOf(c.fonte) * 2 + (c.conferido === true ? 0 : 1);
  return cands
    .filter((c) => c.conferido !== false && (c.conferido === true || passaNoFiltro(c)))
    .sort((x, y) => peso(x) - peso(y));
}
/** Escolhe a melhor entre as fotos encontradas (null = nenhuma serve). */
export function escolherMelhor(nome: string, cands: CandidatoImagem[]): CandidatoImagem | null {
  return fotosAceitas(nome, cands)[0] ?? null;
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

/** A foto carrega de verdade no navegador (com CORS liberado, que a exportação em PNG exige)? */
export function fotoCarrega(url: string, limiteMs = 9000): Promise<boolean> {
  return new Promise((ok) => {
    const img = new Image();
    const fim = (v: boolean) => { img.onload = null; img.onerror = null; ok(v); };
    const timer = setTimeout(() => fim(false), limiteMs);
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => { clearTimeout(timer); fim(img.naturalWidth > 20 && img.naturalHeight > 20); };
    img.onerror = () => { clearTimeout(timer); fim(false); };
    img.src = url;
  });
}

/**
 * F-174: cria a imagem do produto por IA (produto genérico, sem marca, fundo branco), recorta e guarda no nosso armazenamento.
 * Devolve o motivo quando não dá (limite diário, cota da IA, falha).
 */
export async function gerarImagemIA(nome: string): Promise<{ imagem?: ImagemProduto; motivo?: string }> {
  let data: { imagem?: string; motivo?: string } | null = null;
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const r = await supabase.functions.invoke('produto-imagem', { body: { termo: nome, acao: 'gerar' } });
    data = r.data ?? null;
    if (data?.imagem) break;
    // limite diário e cota acabada não melhoram tentando de novo
    if (/limite|cota|amanhã/i.test(String(data?.motivo ?? ''))) break;
    await new Promise((ok) => setTimeout(ok, 1500));
  }
  if (!data?.imagem) return { motivo: data?.motivo ?? 'A IA não conseguiu criar a imagem agora.' };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return { motivo: 'Sessão expirada. Entre novamente.' };
    const bytes = Uint8Array.from(atob(String(data.imagem)), (c) => c.charCodeAt(0));
    const original = new Blob([bytes], { type: 'image/jpeg' });
    const temporaria = URL.createObjectURL(original);
    // 1) tira o fundo; 2) se não deu, ao menos aproxima o produto cortando a margem vazia; 3) senão fica como veio
    const recortada = await recortarImagem(temporaria);
    const aproximada = recortada ? null : await cortarMargens(temporaria);
    URL.revokeObjectURL(temporaria);
    const arquivo = recortada ?? aproximada ?? original;
    const eJpeg = arquivo === original;
    const { publicUrl } = await uploadToR2(arquivo, `${uid}/tabloide/ia-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${eJpeg ? 'jpg' : 'png'}`, eJpeg ? 'image/jpeg' : 'image/png', uid);
    return { imagem: { url: publicUrl, fonte: 'IA', credito: 'Imagem criada por IA', recortada: !!recortada } };
  } catch {
    return { motivo: 'Não foi possível guardar a imagem criada.' };
  }
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
): Promise<string[]> {
  const faltam = produtos.filter((p) => !p.imagem);
  if (!faltam.length) return [];
  const semFoto = new Set<string>();
  const resolver = (id: string, imagem: ImagemProduto | null) => { if (imagem) semFoto.delete(id); else semFoto.add(id); aoAchar(id, imagem); };
  const catalogo = await buscarNoCatalogo(faltam.map((p) => p.nome));
  const buscar: ProdutoTabloide[] = [];
  for (const p of faltam) {
    const achada = catalogo.get(chaveDoProduto(p.nome));
    if (achada) resolver(p.id, achada); else buscar.push(p);
  }
  let i = 0;
  const trabalhador = async () => {
    while (i < buscar.length) {
      const p = buscar[i++];
      try {
        const cands = await buscarCandidatos(p.nome);
        const fresco = ehFresco(p.nome);
        // só entra foto real que a IA de visão confirmou ser o produto; embalagem de marca vem do catálogo de produtos
        const lista = fotosAceitas(p.nome, cands).slice(0, 4);
        if (!lista.length) {
          resolver(p.id, null); // sem foto real confirmada: a IA cria a imagem do produto
          const criada = await gerarImagemIA(p.nome);
          if (criada.imagem) { resolver(p.id, criada.imagem); void salvarNoCatalogo(p.nome, criada.imagem, clienteId); }
          continue;
        }
        const paraImagem = (c: CandidatoImagem): ImagemProduto => ({ url: c.url, fonte: c.fonte, credito: c.credito });
        // só vale foto que carrega de verdade; a que falha cai fora e vale a próxima
        const vivas: CandidatoImagem[] = [];
        for (const c of lista) { if (await fotoCarrega(c.miniatura || c.url)) vivas.push(c); }
        if (!vivas.length) {
          const criada = await gerarImagemIA(p.nome);
          if (criada.imagem) { resolver(p.id, criada.imagem); void salvarNoCatalogo(p.nome, criada.imagem, clienteId); } else resolver(p.id, null);
          continue;
        }
        resolver(p.id, paraImagem(vivas[0])); // aparece na hora; o recorte troca em seguida
        let final = paraImagem(vivas[0]);
        // entre as fotos reais, fica a primeira que dá para recortar (fundo liso = foto de embalagem bem feita)
        for (const c of vivas) {
          const pronta = await prepararImagem(paraImagem(c));
          if (pronta.recortada) { final = pronta; break; }
        }
        resolver(p.id, final);
        void salvarNoCatalogo(p.nome, final, clienteId);
      } catch {
        resolver(p.id, null);
      }
    }
  };
  await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
  return faltam.filter((p) => semFoto.has(p.id)).map((p) => p.nome);
}
