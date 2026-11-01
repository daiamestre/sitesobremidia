/**
 * Cartaz Digital (F-172) — foto automática do produto.
 * Ordem: 1) catálogo COMPARTILHADO da empresa (toda foto já achada ou escolhida por qualquer usuário, chave canônica do nome)
 * → 2) busca externa, só para produto que o sistema nunca viu → 3) imagem criada por IA. O cliente sempre pode trocar a foto.
 */
import { supabase } from '@/integrations/supabase/client';
import { rpcTabloide, tabelaTabloide } from './db';
import { chaveCanonica } from './chave';
import { cortarMargens, pngSemSobras, recortarImagem } from './recorte';
import { uploadToR2 } from '@/lib/r2Upload';
import { chaveDoProduto, ehNomeDoCodigo, type FonteImagem, type ImagemProduto, type ProdutoTabloide } from './parseProdutos';

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

export interface ImagemCatalogada extends ImagemProduto {
  /** O recorte de fundo já foi tentado nesta foto (com ou sem sucesso): não tenta de novo. */
  recorteTentado?: boolean;
  /** nome guardado (no código de barras é o nome certo do produto) */
  nome?: string;
}

/** F-231: chave do código de barras no catálogo da empresa (a linha guarda o nome certo e a foto do produto). */
export const chaveDoCodigo = (codigo: string) => chaveCanonica(`codigo ${codigo}`);

/** Produto achado pelo código de barras na base aberta (Open Food Facts e família) ou na Cosmos. */
export interface ProdutoPorCodigo { codigo: string; nome: string; marca: string; quantidade: string; imagem: string | null; miniatura: string | null; fonte: 'OPENFOODFACTS' | 'COSMOS'; credito: string }
export async function buscarPorCodigo(codigo: string): Promise<ProdutoPorCodigo | null> {
  const { data, error } = await supabase.functions.invoke('produto-imagem', { body: { acao: 'codigo', codigo } });
  if (error) return null;
  return (data?.produto ?? null) as ProdutoPorCodigo | null;
}

/** Uma consulta só ao catálogo da empresa: devolve, por chave canônica, a foto já guardada (a preferência do anunciante vale mais). */
export async function buscarNoCatalogo(nomes: string[]): Promise<Map<string, ImagemCatalogada>> {
  const chaves = [...new Set(nomes.map(chaveCanonica).filter(Boolean))];
  const mapa = new Map<string, ImagemCatalogada>();
  if (!chaves.length) return mapa;
  const { data, error } = await tabelaTabloide('tabloide_catalogo')
    .select('nome_norm, nome, imagem_url, fonte, credito, cliente_id, recortada, recorte_tentado')
    .in('nome_norm', chaves);
  if (error || !data) return mapa;
  const linhas = [...(data as any[])].sort((a, b) => (a.cliente_id ? 0 : 1) - (b.cliente_id ? 0 : 1));
  for (const l of linhas) {
    if (!mapa.has(l.nome_norm)) mapa.set(l.nome_norm, { url: l.imagem_url, fonte: l.fonte, credito: l.credito ?? undefined, recortada: !!l.recortada, recorteTentado: !!l.recorte_tentado, nome: l.nome ?? undefined });
  }
  return mapa;
}

/**
 * Guarda a foto de um produto para a empresa toda (regras no banco: tabloide_catalogo_salvar).
 * AUTO = achada pelo sistema · ESCOLHA = o usuário escolheu entre as opções · UPLOAD = foto enviada (fica só do anunciante).
 */
export async function salvarNoCatalogo(nome: string, imagem: ImagemProduto, origem: 'AUTO' | 'ESCOLHA' | 'UPLOAD' = 'AUTO', recorteTentado = false, chaveFixa?: string): Promise<void> {
  const chave = chaveFixa ?? chaveCanonica(nome);
  if (chave.length < 2) return;
  // a base (check de fonte) ainda não aceita fotos da Cosmos: elas valem no cartaz, mas não entram no catálogo
  if (imagem.fonte === 'COSMOS') return;
  await rpcTabloide('tabloide_catalogo_salvar', {
    p_nome: nome.slice(0, 160), p_nome_norm: chave, p_url: imagem.url, p_fonte: imagem.fonte, p_credito: imagem.credito ?? null,
    p_recortada: !!imagem.recortada, p_origem: imagem.fonte === 'UPLOAD' ? 'UPLOAD' : origem, p_recorte_tentado: recorteTentado || !!imagem.recortada,
  });
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

/** F-252: a foto sem fundo, feita na Cloudflare e cortada no produto; null se não saiu fundo nenhum ou o serviço não respondeu. */
async function recortarNaNuvem(url: string): Promise<Blob | null> {
  if (!/^https:\/\//.test(url)) return null;
  const { data } = await supabase.functions.invoke('produto-imagem', { body: { acao: 'recortar', url } });
  if (!data?.imagem) return null;
  const local = URL.createObjectURL(new Blob([Uint8Array.from(atob(String(data.imagem)), (c) => c.charCodeAt(0))], { type: 'image/png' }));
  try {
    return await pngSemSobras(local, 1400, true);
  } finally {
    URL.revokeObjectURL(local);
  }
}

/**
 * F-252 — REGRA DO DONO: a foto que o cliente põe no produto entra sempre SEM FUNDO, com o produto inteiro. O sistema identifica:
 * 1) já é PNG sem fundo: só corta as sobras; 2) tem fundo: recorte profissional na Cloudflare (produto inteiro, sem cortar);
 * 3) se a nuvem não responder, recorte do fundo liso, aqui no navegador. Se nada der certo, devolve a foto como veio
 * (recortada falso) e quem chamou não a torna a foto oficial do produto.
 */
export async function prepararFotoDoProduto(imagem: ImagemProduto): Promise<ImagemProduto> {
  if (imagem.recortada) return imagem;
  const guardar = async (png: Blob) => {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return imagem;
    const { publicUrl } = await uploadToR2(png, `${uid}/tabloide/recorte-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.png`, 'image/png', uid);
    return { ...imagem, url: publicUrl, recortada: true };
  };
  try {
    const semFundo = await pngSemSobras(imagem.url);
    if (semFundo) return await guardar(semFundo);
    const naNuvem = await recortarNaNuvem(imagem.url);
    if (naNuvem) return await guardar(naNuvem);
    return await prepararImagem(imagem);
  } catch {
    return imagem;
  }
}

/**
 * Grava a foto como a foto do produto, pelo nome que o cliente deu: enviada por alguém, vira a oficial se o produto ainda não
 * tem foto (regra no banco: tabloide_catalogo_salvar). Foto enviada que ficou com fundo não vira oficial.
 */
export async function guardarFotoDoProduto(nome: string, pronta: ImagemProduto, codigo?: string | null): Promise<boolean> {
  if (pronta.fonte === 'UPLOAD' && !pronta.recortada) return false;
  await salvarNoCatalogo(nome, pronta, 'ESCOLHA', true);
  if (codigo) await salvarNoCatalogo(nome, pronta, 'ESCOLHA', true, chaveDoCodigo(codigo));
  return true;
}

/**
 * Dá foto a todos os produtos que ainda não têm.
 * 1) Catálogo compartilhado: UMA consulta, resposta imediata, sem nenhuma busca externa — produto já visto por qualquer usuário aparece na hora.
 * 2) Só o que o sistema nunca viu vai para a busca externa (`aoSaberNovos` avisa quais, para o editor mostrar "procurando" só neles).
 * 3) Foto do catálogo que ainda não foi recortada é melhorada em segundo plano, uma única vez, e a versão melhor passa a valer para todos.
 * Devolve os nomes que ficaram sem foto.
 */
export async function completarImagens(
  produtos: ProdutoTabloide[],
  aoAchar: (id: string, imagem: ImagemProduto | null) => void,
  aoSaberNovos?: (nomes: string[]) => void,
  /** F-231: o código de barras trouxe o nome certo do produto (marca e medida) */
  aoNomear?: (id: string, nome: string, codigo: string) => void,
): Promise<string[]> {
  const pendentes = produtos.filter((p) => !p.imagem);
  if (!pendentes.length) { aoSaberNovos?.([]); return []; }
  const semFoto = new Set<string>();
  const resolver = (id: string, imagem: ImagemProduto | null) => { if (imagem) semFoto.delete(id); else semFoto.add(id); aoAchar(id, imagem); };

  // F-231: código de barras primeiro — o produto EXATO (nome, marca, medida e foto da embalagem).
  // 1) catálogo da empresa (código já bipado por alguém: instantâneo); 2) base aberta / Cosmos; a foto é recortada e guardada
  // no catálogo pelo código e pelo nome, para valer para todos.
  const comCodigo = pendentes.filter((p) => p.codigo);
  const naBase = new Map<string, { nome: string; imagem: ImagemProduto }>();
  if (comCodigo.length) {
    const { data } = await tabelaTabloide('tabloide_catalogo').select('nome_norm, nome, imagem_url, fonte, credito, recortada').in('nome_norm', comCodigo.map((p) => chaveDoCodigo(p.codigo!)));
    for (const l of (data ?? []) as any[]) naBase.set(l.nome_norm, { nome: String(l.nome ?? ''), imagem: { url: l.imagem_url, fonte: l.fonte, credito: l.credito ?? undefined, recortada: !!l.recortada } });
  }
  const naoAchados: ProdutoTabloide[] = [];
  await Promise.all(comCodigo.map(async (p) => {
    const codigo = p.codigo!;
    const guardado = naBase.get(chaveDoCodigo(codigo));
    if (guardado) {
      if (ehNomeDoCodigo(p) && guardado.nome) aoNomear?.(p.id, guardado.nome, codigo);
      resolver(p.id, guardado.imagem);
      return;
    }
    const achado = await buscarPorCodigo(codigo).catch(() => null);
    if (!achado) { naoAchados.push(p); return; }
    if (ehNomeDoCodigo(p)) aoNomear?.(p.id, achado.nome, codigo);
    if (!achado.imagem || !(await fotoCarrega(achado.miniatura || achado.imagem))) { naoAchados.push({ ...p, nome: achado.nome, codigo: null }); return; }
    const bruta: ImagemProduto = { url: achado.imagem, fonte: achado.fonte, credito: achado.credito };
    resolver(p.id, bruta);
    const pronta = await prepararImagem(bruta);
    resolver(p.id, pronta);
    void salvarNoCatalogo(achado.nome, pronta, 'AUTO', true, chaveDoCodigo(codigo));
    void salvarNoCatalogo(achado.nome, pronta, 'AUTO', true);
  }));
  // código sem cadastro nas bases: segue pela busca por nome (se o cliente escreveu o nome) — senão avisa
  const faltam = [...pendentes.filter((p) => !p.codigo), ...naoAchados.filter((p) => !ehNomeDoCodigo(p))];
  naoAchados.filter((p) => ehNomeDoCodigo(p)).forEach((p) => resolver(p.id, null));
  if (!faltam.length) { aoSaberNovos?.([]); return pendentes.filter((p) => semFoto.has(p.id)).map((p) => p.nome); }
  const catalogo = await buscarNoCatalogo(faltam.map((p) => p.nome));
  const buscar: ProdutoTabloide[] = [];
  const melhorar: Array<{ p: ProdutoTabloide; achada: ImagemCatalogada }> = [];
  for (const p of faltam) {
    const achada = catalogo.get(chaveCanonica(p.nome));
    if (achada) {
      resolver(p.id, achada);
      if (!achada.recortada && !achada.recorteTentado) melhorar.push({ p, achada });
    } else buscar.push(p);
  }
  aoSaberNovos?.(buscar.map((p) => p.nome));
  let i = 0;
  const trabalhador = async () => {
    while (i < buscar.length) {
      const p = buscar[i++];
      try {
        const cands = await buscarCandidatos(p.nome);
        // só entra foto real que a IA de visão confirmou ser o produto; embalagem de marca vem do catálogo de produtos
        const lista = fotosAceitas(p.nome, cands).slice(0, 4);
        const paraImagem = (c: CandidatoImagem): ImagemProduto => ({ url: c.url, fonte: c.fonte, credito: c.credito });
        // só vale foto que carrega de verdade; a que falha cai fora e vale a próxima
        const vivas: CandidatoImagem[] = [];
        for (const c of lista) { if (await fotoCarrega(c.miniatura || c.url)) vivas.push(c); }
        if (!vivas.length) {
          resolver(p.id, null); // sem foto real confirmada: a IA cria a imagem do produto
          const criada = await gerarImagemIA(p.nome);
          if (criada.imagem) { resolver(p.id, criada.imagem); void salvarNoCatalogo(p.nome, criada.imagem, 'AUTO', true); }
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
        void salvarNoCatalogo(p.nome, final, 'AUTO', true);
      } catch {
        resolver(p.id, null);
      }
    }
  };
  await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
  // melhoria em segundo plano (não segura a tela): recorta uma vez a foto já guardada e passa a valer para todos
  void (async () => {
    for (const { p, achada } of melhorar) {
      const pronta = await prepararImagem(achada);
      if (pronta.recortada) aoAchar(p.id, pronta);
      await salvarNoCatalogo(p.nome, pronta, 'AUTO', true).catch(() => undefined);
    }
  })();
  return pendentes.filter((p) => semFoto.has(p.id)).map((p) => p.nome);
}
