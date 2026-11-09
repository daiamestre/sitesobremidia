/**
 * Cartaz Digital (F-172) — foto automática do produto.
 * Ordem: 1) catálogo COMPARTILHADO da empresa (toda foto já achada ou escolhida por qualquer usuário, chave canônica do nome)
 * → 2) busca externa, só para produto que o sistema nunca viu → 3) imagem criada por IA. O cliente sempre pode trocar a foto.
 */
import { supabase } from '@/integrations/supabase/client';
import { rpcTabloide, tabelaTabloide } from './db';
import { chaveCanonica } from './chave';
import { lerBusca, melhorOficial, palavrasFortes, produtoExato, relacionadosDaMarca, type ProdutoOficial } from './buscaProduto';
import { ehPedidoDeHortifruti, nomeTradicionalDoHortifruti } from './hortifruti';
import { chegouSemFundo, cortarMargens, finalizarRecorte, fotoParaInspecao, pngSemSobras, semFundoNoNavegador } from './recorte';
import { MENSAGEM_DO_DEFEITO } from './qualidadeRecorte';
import { uploadToR2 } from '@/lib/r2Upload';
import { removerFundoProfissional } from './removedorDeFundo';
import { caixaDoLink, fotoSemFundoPorLink, linkSemTransformacao, pedeSemFundo } from './fotoPorLink';
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
  // F-283 (regra do dono: nada de foto aleatória — estátua, campo, prato de restaurante): produto EMBALADO só recebe foto de embalagem
  // (base aberta de produtos pelo código/nome); banco de imagens (Wikimedia, Openverse, Pexels, Pixabay) só para fruta, verdura e
  // carne, e SÓ quando a IA de visão confirmou que a foto é o produto.
  const fresco = ehFresco(nome);
  const aceita = (c: CandidatoImagem) => c.conferido !== false && (c.fonte === 'OPENFOODFACTS' || c.fonte === 'COSMOS' || (fresco && c.conferido === true));
  const peso = (c: CandidatoImagem) => ordem.indexOf(c.fonte) * 2 + (c.conferido === true ? 0 : 1);
  return cands
    .filter(aceita)
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
  /** escolha do próprio anunciante: vale mais que qualquer outra foto */
  doCliente?: boolean;
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
  // F-291: fruta/legume/verdura/ovos sem marca: o nome curto também procura a variedade tradicional ("Uva" → Uva Vitória)
  const tradicional = new Map<string, string>();
  const horti = new Set<string>();
  for (const n of nomes) {
    if (!ehPedidoDeHortifruti(n)) continue;
    horti.add(chaveCanonica(n));
    const t = nomeTradicionalDoHortifruti(n);
    if (t) tradicional.set(chaveCanonica(n), chaveCanonica(t));
  }
  const chaves = [...new Set([...nomes.map(chaveCanonica), ...tradicional.values()].filter(Boolean))];
  const mapa = new Map<string, ImagemCatalogada>();
  if (!chaves.length) return mapa;
  const { data, error } = await tabelaTabloide('tabloide_catalogo')
    .select('nome_norm, nome, imagem_url, fonte, credito, cliente_id, recortada, recorte_tentado, segmento')
    .in('nome_norm', chaves);
  if (error || !data) return mapa;
  const linhas = [...(data as any[])].sort((a, b) => (a.cliente_id ? 0 : 1) - (b.cliente_id ? 0 : 1));
  const segmento = new Map<string, string | null>();
  for (const l of linhas) {
    if (!mapa.has(l.nome_norm)) {
      mapa.set(l.nome_norm, { url: l.imagem_url, fonte: l.fonte, credito: l.credito ?? undefined, recortada: !!l.recortada, recorteTentado: !!l.recorte_tentado, doCliente: !!l.cliente_id, nome: l.nome ?? undefined });
      segmento.set(l.nome_norm, l.cliente_id ? 'cliente' : l.segmento ?? null);
    }
  }
  // F-291: pedido de hortifrúti só fica com foto do HORTIFRÚTI (ou a que o próprio cliente escolheu); nunca a de um industrializado
  for (const k of horti) {
    const seg = segmento.get(k);
    if (seg === 'cliente' || seg === 'hortifruti') continue;
    const t = tradicional.get(k);
    if (t && segmento.get(t) === 'hortifruti') mapa.set(k, mapa.get(t)!);
    else mapa.delete(k);
  }
  return mapa;
}

/** F-256: imagens oficiais das marcas que batem com o que o cliente escreveu, da mais exata à menos exata. */
export async function buscarProdutosDaMarca(nome: string): Promise<ProdutoOficial[]> {
  const fortes = palavrasFortes(lerBusca(nome));
  if (!fortes.length) return [];
  try {
    const consulta = () => tabelaTabloide('tabloide_catalogo').select('nome, nome_norm, imagem_url, credito, segmento').eq('fonte', 'MARCA').is('cliente_id', null).limit(400);
    // F-283: traz o que tem alguma das palavras (a marca entra aqui) e devolve os exatos e, depois, só os RELACIONADOS: a mesma marca e
    // o mesmo tipo de produto (outro peso ou sabor). Feijão nunca aparece para quem pediu arroz.
    // F-287: primeiro os que têm TODAS as palavras (o exato nunca fica de fora do limite), junto com os que têm alguma (relacionados)
    let todas = consulta();
    for (const p of fortes) todas = todas.like('nome_norm', `%${p}%`);
    const [{ data: exatos }, { data: alguma }] = await Promise.all([todas, consulta().or(fortes.map((p) => `nome_norm.like.*${p}*`).join(','))]);
    const vistos = new Set<string>();
    const linhas = [...(exatos ?? []), ...(alguma ?? [])].filter((l) => !vistos.has((l as ProdutoOficial).imagem_url + (l as ProdutoOficial).nome_norm) && vistos.add((l as ProdutoOficial).imagem_url + (l as ProdutoOficial).nome_norm));
    return relacionadosDaMarca(nome, linhas as ProdutoOficial[]);
  } catch {
    return [];
  }
}

export const imagemDaMarca = (l: ProdutoOficial): ImagemProduto => ({ url: l.imagem_url, fonte: 'MARCA', credito: l.credito ?? undefined, recortada: true });

/** F-256: a imagem oficial do produto descrito, só quando não há dúvida de qual é; `parecidos` conta as opções quando há. */
export async function produtoDaMarca(nome: string): Promise<{ imagem: ImagemProduto | null; parecidos: number }> {
  // F-291: fruta/legume/verdura/ovos sem marca: só produtos do HORTIFRÚTI (nunca refrigerante de uva, cachaça de caju, farinha de mandioca)
  const horti = ehPedidoDeHortifruti(nome);
  const alvo = horti ? nomeTradicionalDoHortifruti(nome) ?? nome : nome;
  const lista = (await buscarProdutosDaMarca(alvo)).filter((l) => !horti || (l as ProdutoOficial & { segmento?: string | null }).segmento === 'hortifruti');
  const l = produtoExato(alvo, lista);
  // F-279/F-282: o sabor é opcional — com vários parecidos vale o mais provável SÓ se for confiável (mesmo tipo, mesma medida, tradicional)
  const melhor = l ?? melhorOficial(alvo, lista);
  return { imagem: melhor ? imagemDaMarca(melhor) : null, parecidos: l ? 0 : lista.length };
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
    const envio = (arquivo: Blob, ext: string, tipo: string) => uploadToR2(arquivo, `${uid}/tabloide/ia-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`, tipo, uid);
    const imagem: ImagemProduto = { url: (await envio(original, 'jpg', 'image/jpeg')).publicUrl, fonte: 'IA', credito: 'Imagem criada por IA' };
    // 1) tira o fundo com a inspeção de qualidade; 2) se não deu, ao menos aproxima o produto cortando a margem vazia
    const pronta = await prepararImagem(imagem, nome);
    if (pronta.recortada) return { imagem: pronta };
    const aproximada = await cortarMargens(imagem.url);
    return { imagem: aproximada ? { ...imagem, url: (await envio(aproximada, 'png', 'image/png')).publicUrl } : imagem };
  } catch {
    return { motivo: 'Não foi possível guardar a imagem criada.' };
  }
}

/** F-253: o Open Food Facts guarda a foto original: é ela que recorta melhor e sai nítida, e não a miniatura de 400 pontos. */
export function fotoEmTamanhoReal(url: string): string {
  return /openfoodfacts\.org\/images\/products\//.test(url) ? url.replace(/\.\d+\.(jpg|jpeg|png)$/i, '.full.$1') : url;
}

/**
 * A IA de visão olha o recorte pronto e devolve o motivo da reprovação; '' se aprovou ou não respondeu (aí vale a inspeção dos pixels).
 * Foto enviada pelo cliente é a escolha dele: ali só importa o contorno. Na busca automática, ela também confere se é o produto e se está em pé.
 */
async function reprovadoPelaIA(png: Blob, imagemDe: ImagemProduto, nome?: string): Promise<string> {
  const imagem = await fotoParaInspecao(png).catch(() => '');
  if (!imagem) return '';
  const { data } = await supabase.functions.invoke('produto-imagem', { body: { acao: 'inspecionar', imagem, termo: nome ?? '' } }).catch(() => ({ data: null }));
  if (data?.completo === false) return MENSAGEM_DO_DEFEITO['contorno-irregular'];
  if (imagemDe.fonte === 'UPLOAD') return '';
  if (data?.eh_o_produto === false) return 'esta foto não mostra a embalagem do produto';
  if (data?.em_pe === false) return 'o produto está deitado ou de cabeça para baixo na foto';
  return '';
}

/**
 * F-252/F-253: tira o fundo na Cloudflare, com a foto no maior tamanho que existe, e só devolve o PNG que passou na inspeção.
 * `motivo`: a inspeção reprovou. Sem motivo e sem PNG: o serviço não respondeu.
 */
async function recortarNaNuvem(imagem: ImagemProduto, nome?: string): Promise<{ png: Blob | null; motivo?: string }> {
  const { url } = imagem;
  if (!/^https:\/\//.test(url)) return { png: null };
  const real = fotoEmTamanhoReal(url);
  const origem = real !== url && (await fotoCarrega(real)) ? real : url;
  const { data } = await supabase.functions.invoke('produto-imagem', { body: { acao: 'recortar', url: origem } });
  if (!data?.imagem) return { png: null };
  const recorte = new Blob([Uint8Array.from(atob(String(data.imagem)), (c) => c.charCodeAt(0))], { type: 'image/png' });
  const { png, inspecao } = await finalizarRecorte(origem, recorte);
  if (!png) return { png: null, motivo: MENSAGEM_DO_DEFEITO[inspecao?.defeitos[0] ?? 'nao-tirou-fundo'] };
  const reprovado = await reprovadoPelaIA(png, imagem, nome);
  return reprovado ? { png: null, motivo: reprovado } : { png };
}

/**
 * F-275/F-276: tira o fundo no próprio navegador, sem a cota da Cloudflare (fundo liso na hora; outro fundo pela IA da SOBRE MÍDIA), com a MESMA inspeção do recorte da nuvem
 * (finalizarRecorte + IA de visão). Vale quando a nuvem não respondeu ou a cota do mês acabou. null = não deu.
 */
async function recortarNoNavegador(url: string, imagem: ImagemProduto, nome?: string): Promise<Blob | null> {
  // 1) fundo liso (foto de loja/embalagem): instantâneo; 2) qualquer outro fundo: o Removedor de Fundo SOBRE MÍDIA (IA, F-276)
  const tentativas = [() => semFundoNoNavegador(url, 1400, caixaDoLink(imagem.url)), () => removerFundoProfissional(url, 1400, caixaDoLink(imagem.url))];
  for (const tentar of tentativas) {
    const bruto = await tentar();
    if (!bruto) continue;
    const { png } = await finalizarRecorte(url, bruto);
    if (png && !(await reprovadoPelaIA(png, imagem, nome))) return png;
  }
  return null;
}

/**
 * F-252/F-253 — REGRA DO DONO: a foto de produto entra sempre SEM FUNDO, com o produto inteiro, no padrão profissional. O sistema
 * identifica: 1) já é PNG sem fundo: só corta as sobras; 2) tem fundo: recorte na Cloudflare, que só é entregue se passar na inspeção.
 * Recorte reprovado NUNCA é entregue: volta a foto como veio, com `recusa` dizendo o motivo, e ela não vira a foto do produto.
 */
/** F-289: o recorte feito no navegador fica lembrado neste aparelho (a mesma foto não é recortada de novo a cada abertura) */
const CHAVE_RECORTES = 'sm-recortes-v1';
function recorteLembrado(url: string): string | null {
  try { return (JSON.parse(localStorage.getItem(CHAVE_RECORTES) ?? '{}') as Record<string, string>)[url] ?? null; } catch { return null; }
}
function lembrarRecorte(url: string, pronta: string) {
  try {
    const m = JSON.parse(localStorage.getItem(CHAVE_RECORTES) ?? '{}') as Record<string, string>;
    m[url] = pronta;
    const chaves = Object.keys(m);
    for (const k of chaves.slice(0, Math.max(0, chaves.length - 400))) delete m[k];
    localStorage.setItem(CHAVE_RECORTES, JSON.stringify(m));
  } catch { /* sem armazenamento */ }
}

export async function prepararImagem(imagem: ImagemProduto, nome?: string): Promise<ImagemProduto> {
  const guardar = async (png: Blob) => {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return imagem;
    const { publicUrl } = await uploadToR2(png, `${uid}/tabloide/recorte-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.png`, 'image/png', uid);
    return { ...imagem, url: publicUrl, recortada: true };
  };
  try {
    // F-289: vale para TODA foto que pede "sem fundo" (s=1), marcada como recortada ou não (ex.: Bolo Seven Boys com fundo branco no palco)
    if (imagem.recortada || pedeSemFundo(imagem.url)) {
      // F-275: link que pede a foto sem fundo (s=1) e chegou COM fundo (cota da Cloudflare acabou): o navegador tira o fundo
      if (!pedeSemFundo(imagem.url)) return imagem;
      const lembrado = recorteLembrado(imagem.url);
      if (lembrado) return { ...imagem, url: lembrado, recortada: true };
      if (await chegouSemFundo(imagem.url).catch(() => true)) return imagem;
      const png = await recortarNoNavegador(linkSemTransformacao(imagem.url), imagem, nome);
      if (!png) return { ...imagem, recortada: false };
      const pronta = await guardar(png);
      if (pronta.url !== imagem.url) lembrarRecorte(imagem.url, pronta.url);
      return pronta;
    }
    // F-272: foto de fora (site da marca, banco de imagens) que já vem sem fundo: entra só o LINK, nada é guardado
    if (imagem.fonte !== 'UPLOAD' && imagem.fonte !== 'IA') {
      const link = await fotoSemFundoPorLink(imagem.url, (u) => fotoCarrega(u));
      if (link) return { ...imagem, url: link, recortada: true };
    }
    const semFundo = await pngSemSobras(imagem.url);
    if (semFundo) return await guardar(semFundo);
    const { png, motivo } = await recortarNaNuvem(imagem, nome);
    if (png) return await guardar(png);
    // F-275: a nuvem não deu (cota do mês ou reprovado): o fundo liso sai no navegador, com a mesma inspeção
    const local = await recortarNoNavegador(imagem.url, imagem, nome);
    if (local) return await guardar(local);
    return motivo ? { ...imagem, recusa: motivo } : imagem;
  } catch {
    return imagem;
  }
}

export const prepararFotoDoProduto = prepararImagem;

/**
 * F-284 (ordem do dono): produto que ficou SEM foto no encarte vira um PEDIDO para os agentes da SOBRE MÍDIA, que procuram na hora a
 * foto oficial da marca e, sem ela, a mesma foto nas lojas que vendem a marca (scripts/ops/pedidos-de-foto.mjs, no ciclo contínuo).
 * Nunca atrapalha o encarte: erro aqui é ignorado.
 */
export async function pedirFotos(nomes: string[]): Promise<void> {
  const lista = [...new Set(nomes.map((n) => n.trim()).filter((n) => n.length >= 2))].slice(0, 40);
  if (!lista.length) return;
  try { await rpcTabloide('tabloide_pedir_fotos', { p_nomes: lista, p_normas: lista.map(chaveCanonica) }); } catch { /* sem a fila: os agentes também varrem os encartes salvos */ }
}

/**
 * Grava a foto como a foto do produto, pelo nome que o cliente deu: enviada por alguém, vira a oficial se o produto ainda não
 * tem foto (regra no banco: tabloide_catalogo_salvar). Foto que ficou com fundo ou foi reprovada na inspeção não vira a do produto.
 */
export async function guardarFotoDoProduto(nome: string, pronta: ImagemProduto, codigo?: string | null): Promise<boolean> {
  if (!pronta.recortada) return false;
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
  /** F-256: há produtos oficiais parecidos e o que foi escrito não diz qual é: o cliente escolhe */
  aoDuvidar?: (nome: string, parecidos: number) => void,
): Promise<string[]> {
  const pendentes = produtos.filter((p) => !p.imagem);
  if (!pendentes.length) { aoSaberNovos?.([]); return []; }
  const semFoto = new Set<string>();
  const resolver = (id: string, imagem: ImagemProduto | null) => { if (imagem) semFoto.delete(id); else semFoto.add(id); aoAchar(id, imagem); };
  // F-275: foto por link que pede o fundo tirado na hora: se chegou com fundo (cota da Cloudflare), o navegador tira
  const conferirFundo = (p: ProdutoTabloide, imagem: ImagemProduto) => {
    if (!pedeSemFundo(imagem.url)) return;
    void prepararImagem(imagem, p.nome).then((pronta) => { if (pronta.url !== imagem.url) resolver(p.id, pronta); }).catch(() => undefined);
  };

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
      conferirFundo(p, guardado.imagem); // F-289: toda foto que pede "sem fundo" é conferida (a marca de recortada não basta)
      return;
    }
    const achado = await buscarPorCodigo(codigo).catch(() => null);
    if (!achado) { naoAchados.push(p); return; }
    if (ehNomeDoCodigo(p)) aoNomear?.(p.id, achado.nome, codigo);
    if (!achado.imagem || !(await fotoCarrega(achado.miniatura || achado.imagem))) { naoAchados.push({ ...p, nome: achado.nome, codigo: null }); return; }
    const bruta: ImagemProduto = { url: achado.imagem, fonte: achado.fonte, credito: achado.credito };
    resolver(p.id, bruta);
    const pronta = await prepararImagem(bruta, achado.nome);
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
  // F-256: a imagem oficial da marca vem primeiro; só a escolha do próprio anunciante vale mais
  const oficiais = new Map<string, ImagemProduto>();
  const emDuvida = new Set<string>();
  await Promise.all(faltam.map(async (p) => {
    const achada = catalogo.get(chaveCanonica(p.nome));
    if (achada?.doCliente || achada?.fonte === 'MARCA') return;
    const { imagem, parecidos } = await produtoDaMarca(p.nome);
    // F-285 (regra do dono): quem decide se a foto é a certa é o SISTEMA — com foto confiável ela entra sem aviso; sem confiável, segue
    // para as outras fontes e, sem foto, vira pedido para os agentes (o aviso só aparece para o que falta de verdade)
    if (imagem) oficiais.set(p.id, imagem);
    else if (parecidos) emDuvida.add(p.id);
  }));
  for (const p of faltam) {
    const oficial = oficiais.get(p.id);
    if (oficial) { resolver(p.id, oficial); conferirFundo(p, oficial); continue; }
    // F-282: sem um oficial confiável o produto NÃO fica sem foto nem recebe um aleatório da marca: segue para o catálogo e a busca
    const achada = catalogo.get(chaveCanonica(p.nome));
    if (achada) {
      resolver(p.id, achada);
      conferirFundo(p, achada);
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
          const pronta = await prepararImagem(paraImagem(c), p.nome);
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
      const pronta = await prepararImagem(achada, p.nome);
      if (pronta.recortada) aoAchar(p.id, pronta);
      await salvarNoCatalogo(p.nome, pronta, 'AUTO', true).catch(() => undefined);
    }
  })();
  return pendentes.filter((p) => semFoto.has(p.id)).map((p) => p.nome);
}
