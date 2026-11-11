// SOBRE MÍDIA STUDIO — PALCO DE OFERTAS para mercado (F-234), no estilo do palco da Black Friday: um produto de cada vez
// em cima do pedestal, com o nome e o preço. Cada produto é uma arte de camadas (o mesmo editor do Studio) já animada:
// o pedestal sobe, o produto entra com zoom e fica flutuando, o nome sobe e o selo do preço entra com zoom e pulsa.
// O CARROSSEL vira um projeto do editor de vídeo: um clipe por produto, com transição deslizando — exporta MP4.
import { TAMANHO_DOC, forma, imagem, larguraDoTexto, selo, texto, type Camada, type Documento, type FormatoDoc } from './documento';
import { idNovo, inicios, novoClipe, projetoVazio, type FaixaDeAudio, type ProjetoDeVideo, type TipoDeTransicao } from './video/linha';
import type { TipoDeAnimacao } from './animacao';
import { LOGO_ALERTA_DE_OFERTA, LOGO_OFERTAS_DE_FARMACIA, logoOficialDoSegmento, type LogoDaPasta } from './logos';
import { SEGMENTOS_DE_OFERTA, idDaArte, pastaDoPalcoDe, type SegmentoNovo } from './segmentosDeOferta';
import { COMPOSICOES_DOS_PALCOS, type SeloDoPalco } from './composicoesDosSegmentos';
import { corDoDocumento, escurecer } from './corDaArte';
import { chaveCanonica } from '@/lib/tabloide/chave';
import { camadasDaLogoDoSegmento, ehSegmentoComLogoEditavel, type SegmentoComLogo } from './logoEditavel';
import { formatarPreco, type ProdutoTabloide } from '@/lib/tabloide/parseProdutos';

export interface OpcoesDoPalco {
  titulo?: string; logoUrl?: string | null; segundos?: number;
  /** F-235: logo 3D (PNG) no lugar do título escrito */ logoTitulo?: { url: string; largura: number; altura: number } | null;
  /** F-237: fundo OFICIAL do dono (arte pronta com título 3D e palco): o produto entra em cima do palco dele */
  fundo?: FundoDoPalco | null;
  /** texto do botão no lugar do "YOUR LOGO" do fundo oficial */
  textoBotao?: string;
  /** F-248: logo do palco escolhida na pasta Logos (padrão: a logo oficial do fundo) */
  logoDoPalco?: LogoDaPasta | null;
  /** F-249: o que o cliente editou em cada elemento, por formato: vale para todos os produtos do palco */
  ajustes?: AjustesDoPalco;
  /** F-242: de que lado cada elemento entra (escolha do cliente) e para que lado o carrossel passa de um produto ao outro */
  movimento?: MovimentoDoPalco;
  /** F-300: a LOCUÇÃO (voz do locutor): abertura, uma fala por produto (pelo nome) e fechamento, já gravadas */
  locucao?: LocucaoDoVideo | null;
}

/** F-300: uma fala gravada (mp3 no R2) e quanto ela dura */
export interface FalaGravada { url: string; dur: number }
export interface LocucaoDoVideo { abertura?: FalaGravada | null; fechamento?: FalaGravada | null; ofertas: Record<string, FalaGravada> }
export const chaveDaFala = (nomeDoProduto: string) => `oferta:${nomeDoProduto.trim().toLowerCase()}`;
const faixaDaFala = (nome: string, f: FalaGravada, em: number): FaixaDeAudio => ({
  // id fixo por frase (o arquivo): o motor reaproveita o áudio já carregado a cada atualização do palco
  id: `loc-${f.url.split('/').pop()?.replace(/\W/g, '') ?? idNovo('loc')}`, nome, src: f.url, duracaoArquivo: f.dur, em: Math.max(0, em), inicio: 0, fim: f.dur, volume: 1, somEntra: 0, somSai: 0.05, repetir: false,
});

export type AjustesDoPalco = Partial<Record<FormatoDoc, Record<string, Partial<Camada>>>>;
export interface MovimentoDoPalco { produto?: TipoDeAnimacao; nome?: TipoDeAnimacao; preco?: TipoDeAnimacao; transicao?: TipoDeTransicao; /** F-290: a troca de CADA produto para o próximo (pelo nome do produto); sem ela vale a padrão */ transicoes?: Record<string, TipoDeTransicao> }
/** F-290: a transição de um produto para o próximo: a dele, ou a padrão do palco */
export const transicaoDoProduto = (m: MovimentoDoPalco | undefined, nome: string): TipoDeTransicao => m?.transicoes?.[chaveCanonica(nome)] ?? m?.transicao ?? 'deslizar-esquerda';
/** F-290: chave do tamanho/posição próprio de um produto (o resto do palco vale para todos) */
export const chaveDoProdutoNoPalco = (nome: string) => `Produto|${chaveCanonica(nome)}`;
/** opções que o cliente escolhe na tela do palco */
export const ENTRADAS: Array<{ id: TipoDeAnimacao; nome: string }> = [
  { id: 'subir', nome: 'De baixo' }, { id: 'descer', nome: 'De cima' }, { id: 'esquerda', nome: 'Da esquerda' }, { id: 'direita', nome: 'Da direita' }, { id: 'zoom', nome: 'Zoom' }, { id: 'surgir', nome: 'Aparecer' },
];
export const TRANSICOES_DO_CARROSSEL: Array<{ id: TipoDeTransicao; nome: string }> = [
  { id: 'deslizar-esquerda', nome: 'Sai pela esquerda' }, { id: 'deslizar-direita', nome: 'Sai pela direita' }, { id: 'deslizar-cima', nome: 'Sai por cima' }, { id: 'zoom', nome: 'Zoom' }, { id: 'dissolver', nome: 'Fade (dissolver)' },
  // F-290: efeitos de troca de cena (como no CapCut)
  { id: 'flash', nome: 'Flash' }, { id: 'luz', nome: 'Luz' }, { id: 'brilho', nome: 'Brilho' }, { id: 'girar-tudo', nome: 'Girar a cena' }, { id: 'desfocar', nome: 'Desfocar' }, { id: 'preto', nome: 'Escurecer' }, { id: 'circulo', nome: 'Círculo' }, { id: 'cortina', nome: 'Cortina' },
];

/**
 * F-242: o balão de preço de TODO palco — amarelo forte, R$ e valor em BRANCO com contorno vermelho (lê bem no amarelo),
 * "DE x POR" em vermelho na promoção e "POR APENAS" em verde fora dela; tudo centralizado no balão.
 */
export function seloDoPreco(p: Pick<ProdutoTabloide, 'preco' | 'precoDe' | 'unidade'>, x: number, y: number, d: number, /** F-296: cores do balão de CADA palco */ estilo?: SeloDoPalco): Camada | null {
  if (p.preco == null) return null;
  const v = formatarPreco(p.preco);
  const de = p.precoDe != null && p.precoDe > p.preco ? formatarPreco(p.precoDe) : null;
  return {
    ...selo(x, y, d, {
      topo: de ? `DE ${de.inteiro},${de.centavos} POR` : 'POR APENAS', corTopo: de ? '#d90f1f' : '#0a8a3a',
      moeda: 'R$', valor: v.inteiro, sufixo: `,${v.centavos}`, base: p.unidade && p.unidade !== 'UN' ? p.unidade : '',
      cor: estilo?.cor ?? '#FFC400', corTexto: estilo?.corTexto ?? '#b3001b', corValor: estilo?.corValor ?? '#ffffff', contornoValor: { cor: estilo?.contorno ?? '#c4001d', largura: 9 }, borda: estilo?.borda ?? '#ffffff', realista: true,
      sombra: { cor: 'rgba(0,0,0,.45)', desfoque: 34, dx: 0, dy: 16 },
    }),
    nome: 'Preço',
  };
}

/** Caixa em frações da largura/altura da tela (0 a 1). */
export interface Caixa { x: number; y: number; w: number; h: number }
/**
 * F-237 — FUNDO OFICIAL do Palco de Ofertas (arte do dono, 16:9 e 9:16). Guarda, em frações da tela, onde fica o espaço do
 * produto (o pé dele encosta no tampo do palco), a faixa da frente do palco (nome do produto), o selo do preço e o lugar do
 * "YOUR LOGO" (vira o botão "OFERTAS"/"ALERTAS"). Fundo novo do dono = uma entrada nova aqui + as 2 imagens em
 * public/studio/palco/<id>-h.webp e <id>-v.webp.
 */
export interface FundoDoPalco {
  id: string; nome: string;
  /** espaço do produto: o pé encosta no tampo do palco (y + h = tampo) */
  produto: Record<FormatoDoc, Caixa>;
  /** F-238: área do NOME do produto (branco; em pé fica em cima do produto, deitado fica à esquerda, em cima) */
  nome_: Record<FormatoDoc, Caixa & { alinhamento: 'left' | 'center' | 'right' }>;
  /** F-239: balão AMARELO de preço na lateral (centro e diâmetro em frações; d = fração do lado menor), pulsando */
  preco: Record<FormatoDoc, { cx: number; cy: number; d: number }>;
  botao: Record<FormatoDoc, Caixa>;
  /** F-248: a logo é uma camada: o fundo não tem título gravado */
  titulo: Record<FormatoDoc, Caixa>; logoPadrao: LogoDaPasta;
  /** F-249: faixas com letreiro em loop: linha do centro de ponta a ponta, espessura e o texto */
  faixas?: { texto: string; cor: string; corTexto: string; linhas: Record<FormatoDoc, Array<{ de: [number, number]; ate: [number, number]; esp: number }>> };
  corBotao: string; bordaBotao: string;
  botoes: string[];
  /** F-259: de que pasta é o fundo (padrão: mercado) */
  segmento?: SegmentoDoStudio;
  /** F-259: aviso obrigatório no rodapé (remédios: Lei 9.294/1996, art. 7º) */
  aviso?: { texto: string; caixa: Record<FormatoDoc, Caixa> };
  /** F-296: cores do balão de preço DESTE palco (sem elas, o amarelo do Alerta de Oferta) */
  selo?: SeloDoPalco;
  /** F-296: a cor do palco (fundo do vídeo e cor do flash/luz/brilho nas trocas) */
  corTema: string;
}
/** F-259: as pastas de encarte e palco do Studio */
export type SegmentoDoStudio = 'mercado' | 'farmacia' | SegmentoNovo;
/** F-259: frase obrigatória em toda propaganda de remédio isento de prescrição (Lei 9.294/1996, art. 7º, § 5º) */
export const AVISO_DE_REMEDIO = 'A PERSISTIREM OS SINTOMAS, O MÉDICO DEVERÁ SER CONSULTADO. Imagens ilustrativas · Ofertas válidas enquanto durarem os estoques.';
export const srcDoFundo = (f: FundoDoPalco, formato: FormatoDoc) => `/studio/palco/${f.id}-${formato === '9:16' ? 'v' : 'h'}.webp`;

/** O fundo sem a logo gravada: só entra quando o cliente troca ou mexe na logo (por padrão fica a arte original do dono). */
export const srcSemLogo = (f: FundoDoPalco, formato: FormatoDoc) => `/studio/palco/${f.id}-${formato === '9:16' ? 'v' : 'h'}-st.webp`;

/** F-296: o palco COMPLEMENTAR de um segmento, montado da composição dele */
function palcoDaComposicao(seg: SegmentoComLogo, nome: string, logoPadrao: LogoDaPasta, corBotao: string, botoes: string[], aviso?: string): FundoDoPalco {
  const c = COMPOSICOES_DOS_PALCOS[seg];
  return {
    id: c.id, nome, segmento: seg, logoPadrao, corBotao, bordaBotao: '#ffd21f', botoes, selo: c.selo, corTema: c.corTema,
    titulo: { '9:16': c.v.titulo, '16:9': c.h.titulo },
    produto: { '9:16': c.v.produto, '16:9': c.h.produto },
    nome_: { '9:16': c.v.nome, '16:9': c.h.nome },
    preco: { '9:16': c.v.preco, '16:9': c.h.preco },
    botao: { '9:16': c.v.botao, '16:9': c.h.botao },
    ...(aviso ? { aviso: { texto: aviso, caixa: { '9:16': c.v.aviso ?? { x: 0.04, y: 0.95, w: 0.92, h: 0.04 }, '16:9': c.h.aviso ?? { x: 0.04, y: 0.945, w: 0.92, h: 0.045 } } } } : {}),
  };
}

export const FUNDOS_DO_PALCO: FundoDoPalco[] = [
  {
    id: 'alerta-de-oferta', nome: 'Alerta de Oferta (sirene)',
    // as 3 faixas da arte (medidas na imagem): em cima, embaixo à esquerda e embaixo à direita, por cima do texto gravado
    faixas: {
      texto: 'ALERTA DE OFERTA', cor: '#fde615', corTexto: '#111111',
      linhas: {
        '9:16': [{ de: [-60, 80], ate: [560, -56], esp: 84 }, { de: [-60, 1645.5], ate: [340, 1940.5], esp: 96 }, { de: [1140, 1655.4], ate: [680, 1961.6], esp: 92 }],
        '16:9': [{ de: [-60, 147.4], ate: [680, -33.1], esp: 94 }, { de: [-60, 883.2], ate: [520, 1136.9], esp: 97 }, { de: [1980, 878.6], ate: [1460, 1093.8], esp: 92 }],
      },
    },
    titulo: { '9:16': { x: 0.05, y: 0.012, w: 0.9, h: 0.325 }, '16:9': { x: 0.235, y: 0.012, w: 0.53, h: 0.49 } }, logoPadrao: LOGO_ALERTA_DE_OFERTA,
    produto: { '9:16': { x: 0.22, y: 0.445, w: 0.56, h: 0.3 }, '16:9': { x: 0.415, y: 0.475, w: 0.17, h: 0.27 } },
    nome_: { '9:16': { x: 0.07, y: 0.345, w: 0.86, h: 0.09, alinhamento: 'center' }, '16:9': { x: 0.19, y: 0.5, w: 0.215, h: 0.2, alinhamento: 'right' } },
    // F-240: balão amarelo de tamanho normal, proporcional ao produto; deitado: nome colado à esquerda do produto e balão à direita
    preco: { '9:16': { cx: 0.8, cy: 0.585, d: 0.24 }, '16:9': { cx: 0.66, cy: 0.6, d: 0.2 } },
    botao: { '9:16': { x: 0.272, y: 0.872, w: 0.468, h: 0.072 }, '16:9': { x: 0.366, y: 0.877, w: 0.266, h: 0.1 } },
    corBotao: '#d90f1f', bordaBotao: '#ffd21f', corTema: '#c40f24',
    botoes: ['OFERTAS', 'ALERTAS'],
  },
  {
    // F-259: palco da FARMÁCIA — produto e balão nos mesmos lugares do Alerta de Oferta, pedestal branco e verde
    id: 'saude-em-oferta', nome: 'Ofertas de Farmácia (verde)', segmento: 'farmacia',
    titulo: { '9:16': { x: 0.05, y: 0.012, w: 0.9, h: 0.325 }, '16:9': { x: 0.235, y: 0.012, w: 0.53, h: 0.49 } }, logoPadrao: LOGO_OFERTAS_DE_FARMACIA,
    produto: { '9:16': { x: 0.22, y: 0.445, w: 0.56, h: 0.3 }, '16:9': { x: 0.415, y: 0.475, w: 0.17, h: 0.27 } },
    nome_: { '9:16': { x: 0.07, y: 0.345, w: 0.86, h: 0.09, alinhamento: 'center' }, '16:9': { x: 0.19, y: 0.5, w: 0.215, h: 0.2, alinhamento: 'right' } },
    preco: { '9:16': { cx: 0.8, cy: 0.585, d: 0.24 }, '16:9': { cx: 0.66, cy: 0.6, d: 0.2 } },
    botao: { '9:16': { x: 0.272, y: 0.862, w: 0.456, h: 0.068 }, '16:9': { x: 0.366, y: 0.84, w: 0.268, h: 0.09 } },
    corBotao: '#0a9a50', bordaBotao: '#ffd21f', corTema: '#0a9a50',
    botoes: ['FARMÁCIA', 'OFERTAS', 'SAÚDE'],
    aviso: { texto: AVISO_DE_REMEDIO, caixa: { '9:16': { x: 0.04, y: 0.95, w: 0.92, h: 0.04 }, '16:9': { x: 0.04, y: 0.945, w: 0.92, h: 0.045 } } },
  },
  // F-277: um palco por segmento (padaria, adega, açougue...), com o pedestal e o balão nos mesmos lugares da farmácia
  ...SEGMENTOS_DE_OFERTA.map((sg): FundoDoPalco => ({
    id: idDaArte(sg.id), nome: `Ofertas – ${sg.nome}`, segmento: sg.id,
    titulo: { '9:16': { x: 0.05, y: 0.012, w: 0.9, h: 0.325 }, '16:9': { x: 0.235, y: 0.012, w: 0.53, h: 0.49 } }, logoPadrao: logoOficialDoSegmento(sg.id),
    produto: { '9:16': { x: 0.22, y: 0.445, w: 0.56, h: 0.3 }, '16:9': { x: 0.415, y: 0.475, w: 0.17, h: 0.27 } },
    nome_: { '9:16': { x: 0.07, y: 0.345, w: 0.86, h: 0.09, alinhamento: 'center' }, '16:9': { x: 0.19, y: 0.5, w: 0.215, h: 0.2, alinhamento: 'right' } },
    preco: { '9:16': { cx: 0.8, cy: 0.585, d: 0.24 }, '16:9': { cx: 0.66, cy: 0.6, d: 0.2 } },
    botao: { '9:16': { x: 0.272, y: 0.862, w: 0.456, h: 0.068 }, '16:9': { x: 0.366, y: 0.84, w: 0.268, h: 0.09 } },
    corBotao: sg.corBotao, bordaBotao: '#ffd21f', corTema: sg.corBotao,
    botoes: sg.botoes,
    ...(sg.aviso ? { aviso: { texto: sg.aviso, caixa: { '9:16': { x: 0.04, y: 0.95, w: 0.92, h: 0.04 }, '16:9': { x: 0.04, y: 0.945, w: 0.92, h: 0.045 } } } } : {}),
  })),
  // F-296 (pedido do dono): PALCOS COMPLEMENTARES — mais um palco por segmento, com cenário e pedestal próprios (os de cima ficam como eram)
  palcoDaComposicao('farmacia', 'Ofertas de Farmácia (vitrine)', LOGO_OFERTAS_DE_FARMACIA, '#0a9a50', ['FARMÁCIA', 'OFERTAS', 'SAÚDE'], AVISO_DE_REMEDIO),
  ...SEGMENTOS_DE_OFERTA.map((sg) => palcoDaComposicao(sg.id, `Ofertas – ${sg.nome} (modelo 2)`, logoOficialDoSegmento(sg.id), sg.corBotao, sg.botoes, sg.aviso)),
];
/** F-259: os fundos de uma pasta (mercado ou farmácia) */
export const fundosDoSegmento = (s: SegmentoDoStudio) => FUNDOS_DO_PALCO.filter((f) => (f.segmento ?? 'mercado') === s);

/** F-259: o aviso obrigatório numa linha (ou duas), no maior tamanho que cabe na caixa, em branco com sombra. */
export function avisoLegal(t: string, b: Caixa): Camada {
  const linhas = b.h > 60 ? 2 : 1;
  let tam = Math.round(b.h / (linhas * 1.25));
  while (larguraDoTexto(t.toUpperCase(), 'poppins', tam, 800) > b.w * linhas * 0.96 && tam > 10) tam -= 1;
  const c = texto('Aviso de remédio', t, b.x, b.y, b.w, { fonte: 'poppins', peso: 800, tamanho: tam, maiusculas: true, alinhamento: 'center', cor: '#ffffff', entrelinha: 1.1, sombra: { cor: 'rgba(0,30,10,.8)', desfoque: 6, dx: 0, dy: 2 } });
  return { ...c, y: b.y + (b.h - c.h) / 2 };
}
export const fundoDoPalcoPorId = (id: string | null | undefined) => FUNDOS_DO_PALCO.find((f) => f.id === id) ?? null;

/** Nome do produto em branco, no maior tamanho que cabe na área (até 3 linhas), com sombra para ler sobre o fundo. */
export function nomeDoProduto(nome: string, b: Caixa & { alinhamento: 'left' | 'center' | 'right' }): Camada {
  let tam = Math.round(b.h * 0.5);
  let t = texto('Nome do produto', nome, b.x, b.y, b.w, { fonte: 'poppins', peso: 800, tamanho: tam, maiusculas: true, alinhamento: b.alinhamento, cor: '#ffffff', entrelinha: 1.05, sombra: { cor: 'rgba(60,0,8,.65)', desfoque: 14, dx: 0, dy: 5 } });
  while ((t.h > b.h || Math.max(...nome.toUpperCase().split(/\s+/).map((p) => larguraDoTexto(p, 'poppins', tam, 800)), 0) > b.w) && tam > 18) {
    tam = Math.round(tam * 0.92);
    t = texto('Nome do produto', nome, b.x, b.y, b.w, { fonte: 'poppins', peso: 800, tamanho: tam, maiusculas: true, alinhamento: b.alinhamento, cor: '#ffffff', entrelinha: 1.05, sombra: { cor: 'rgba(60,0,8,.65)', desfoque: 14, dx: 0, dy: 5 } });
  }
  t.y = b.y + (b.h - t.h) / 2;
  return t;
}

/** F-245: estilo de um balão de preço: forma, cores e aro externo. */
export interface CoresDaEtiqueta { de: string; para: string; borda: string; valor: string; moeda: string; detalhe: string; formato?: 'placa' | 'oval'; aroFora?: string }
export const ETIQUETA_VERMELHA: CoresDaEtiqueta = { de: '#ff2d40', para: '#a3001a', borda: '#ffd21f', valor: '#ffffff', moeda: '#ffd21f', detalhe: '#ffe9a8' };
export const ETIQUETA_AMARELA: CoresDaEtiqueta = { de: '#ffe45c', para: '#f2a900', borda: '#ffffff', valor: '#c40f24', moeda: '#c40f24', detalhe: '#7a0010' };
export const BALAO_OVAL_VERMELHO: CoresDaEtiqueta = { formato: 'oval', de: '#ff3a2e', para: '#c40015', borda: '#ffd21f', aroFora: '#ffffff', valor: '#ffffff', moeda: '#ffd21f', detalhe: '#ffe9a8' };
/**
 * F-245 — CATÁLOGO DE BALÕES DE PREÇO: cada encarte escolhe o seu aqui (o do palco é o `seloDoPreco`, redondo).
 * Referência nova do dono = um estilo novo nesta lista.
 */
export const ESTILOS_DE_BALAO = {
  'placa-vermelha': ETIQUETA_VERMELHA, // Mega Oferta, lado azul
  'placa-amarela': ETIQUETA_AMARELA, // Mega Oferta, lado vermelho
  'oval-vermelho': BALAO_OVAL_VERMELHO, // Semana do Frango
  // F-296: cada encarte de segmento com o SEU balão (composicoesDosSegmentos.ts)
  'placa-verde': { de: '#2fd17f', para: '#0a7a3e', borda: '#ffffff', valor: '#ffffff', moeda: '#ffe45c', detalhe: '#d9ffe9' }, // farmácia
  'placa-caramelo': { de: '#f6c56a', para: '#c97a1e', borda: '#fff3d6', valor: '#5a2c06', moeda: '#7a3e0b', detalhe: '#5a2c06' }, // padaria
  'placa-dourada': { de: '#fff0b0', para: '#c9962e', borda: '#5a0820', valor: '#5a0820', moeda: '#7a0a2a', detalhe: '#3a0414' }, // adega
  'oval-laranja': { formato: 'oval', de: '#ff9233', para: '#d14a00', borda: '#111111', aroFora: '#ffffff', valor: '#ffffff', moeda: '#111111', detalhe: '#fff1e0' }, // suplementos
  'oval-verde': { formato: 'oval', de: '#55c94a', para: '#1f7a1b', borda: '#ffd21f', aroFora: '#ffffff', valor: '#ffffff', moeda: '#ffd21f', detalhe: '#eaffd9' }, // hortifrúti
  'oval-roxo': { formato: 'oval', de: '#9255f2', para: '#4a17a8', borda: '#2cc6e6', aroFora: '#ffffff', valor: '#ffffff', moeda: '#7fe6f8', detalhe: '#efe6ff' }, // pet
  'placa-rosa': { de: '#ff63a6', para: '#c0155f', borda: '#e8c068', valor: '#ffffff', moeda: '#ffe1ef', detalhe: '#fff0f6' }, // beleza
  'placa-neon': { de: '#36c8ff', para: '#1450d4', borda: '#9ae6ff', valor: '#ffffff', moeda: '#e6fbff', detalhe: '#cdf3ff' }, // eletrônicos
  'oval-preto': { formato: 'oval', de: '#2a2a2a', para: '#000000', borda: '#e3245a', aroFora: '#ffffff', valor: '#ffffff', moeda: '#ff5a82', detalhe: '#ffd1de' }, // moda
} as const satisfies Record<string, CoresDaEtiqueta>;

/**
 * Balão de preço retangular ou oval (estilos em ESTILOS_DE_BALAO): placa vermelha com borda amarela; "R$" pequeno, o valor grande e os centavos em cima,
 * à direita (como nos encartes). O "de" (preço antigo) vai pequeno, ao lado do R$, nunca por cima do valor.
 */
export function etiquetaDePreco(b: Caixa, p: Pick<ProdutoTabloide, 'preco' | 'precoDe' | 'unidade'>, cores: CoresDaEtiqueta = ETIQUETA_VERMELHA): Camada[] {
  if (p.preco == null) return [];
  const v = formatarPreco(p.preco);
  const de = p.precoDe != null && p.precoDe > p.preco ? formatarPreco(p.precoDe) : null;
  const un = p.unidade && p.unidade !== 'UN' ? p.unidade : '';
  // F-249: o balão é UM objeto (dá para mover, girar, mudar cor e texto), e o texto sai centralizado do desenho dele
  return [{
    ...selo(b.x, b.y, b.h, {
      formato: cores.formato === 'oval' ? 'oval' : 'placa', topo: de ? `DE ${de.inteiro},${de.centavos}` : '', moeda: 'R$', valor: v.inteiro, sufixo: `,${v.centavos}`, base: un,
      cor: cores.de, corFim: cores.para, borda: cores.borda, aroFora: cores.aroFora ?? null, corTexto: cores.detalhe, corTopo: cores.detalhe, corValor: cores.valor, corMoeda: cores.moeda,
      sombra: { cor: 'rgba(0,0,0,.35)', desfoque: 20, dx: 0, dy: 8 },
    }),
    w: b.w, h: b.h, nome: 'Preço', animacao: ani('zoom', 0.9, 0.5),
  }];
}

/** O produto em cima do palco do fundo oficial: nome em branco por cima, produto inteiro com o pé no tampo, etiqueta de preço. */
function palcoOficial(p: Pick<ProdutoTabloide, 'nome' | 'preco' | 'precoDe' | 'unidade' | 'imagem'>, formato: FormatoDoc, f: FundoDoPalco, o: OpcoesDoPalco): Documento {
  const { w: W, h: H } = TAMANHO_DOC[formato];
  const px = <T extends Caixa>(b: T): T => ({ ...b, x: b.x * W, y: b.y * H, w: b.w * W, h: b.h * H });
  const c: Camada[] = [];
  // F-251: regra do dono: o fundo é a arte dele, com a logo e a iluminação dela. A logo só vira camada visível sobre o fundo sem
  // logo quando o cliente troca ou mexe nela; até lá a camada fica invisível, só para o toque abrir as opções
  // F-286: nos segmentos (padaria, adega…) a logo é EDITÁVEL: fundo sem logo + a logo em camadas (textos e o círculo da logo do cliente)
  const logoEmCamadas = !o.logoDoPalco && ehSegmentoComLogoEditavel(f.segmento);
  const logoDaArte = !logoEmCamadas && !o.logoDoPalco && !o.ajustes?.[formato]?.['Logo do palco'];
  c.push({ ...imagem('Fundo oficial', logoDaArte ? srcDoFundo(f, formato) : srcSemLogo(f, formato), 0, 0, W, H), bloqueada: true });
  (f.faixas?.linhas[formato] ?? []).forEach((l, i) => {
    const comp = Math.hypot(l.ate[0] - l.de[0], l.ate[1] - l.de[1]);
    const cx = (l.de[0] + l.ate[0]) / 2, cy = (l.de[1] + l.ate[1]) / 2;
    const giro = (Math.atan2(l.ate[1] - l.de[1], l.ate[0] - l.de[0]) * 180) / Math.PI;
    const rot = giro > 90 ? giro - 180 : giro < -90 ? giro + 180 : giro; // o texto nunca fica de cabeça para baixo
    c.push({ ...texto(`Faixa ${i + 1}`, f.faixas!.texto, cx - comp / 2, cy - l.esp / 2, comp, { fonte: 'poppins', peso: 800, tamanho: Math.round(l.esp * 0.56), cor: f.faixas!.corTexto, alinhamento: 'left' }), h: l.esp, rot, letreiro: { velocidade: 110, fundo: f.faixas!.cor } });
  });
  const ti = px(f.titulo[formato]);
  if (logoEmCamadas) c.push(...camadasDaLogoDoSegmento(f.segmento as SegmentoComLogo, ti));
  else c.push({ ...imagem('Logo do palco', (o.logoDoPalco ?? f.logoPadrao).url, ti.x, ti.y, ti.w, ti.h, { ajuste: 'conter', opacidade: logoDaArte ? 0 : 1 }), animacao: ani('surgir', 0, 0.4) });
  // produto: 'conter' (inteiro, sem cortar) e focoY 100 = o pé encosta no tampo do palco
  const pr = px(f.produto[formato]);
  const mov = o.movimento ?? {};
  c.push({ ...imagem('Produto', p.imagem?.url ?? '', pr.x, pr.y, pr.w, pr.h, { ajuste: 'conter', focoX: 50, focoY: 100, sombra: null }), animacao: ani(mov.produto ?? 'subir', 0.25, 0.7, 'flutuar') });
  c.push({ ...nomeDoProduto(p.nome, px(f.nome_[formato])), animacao: ani(mov.nome ?? (formato === '9:16' ? 'descer' : 'esquerda'), 0.55, 0.55) });
  // F-239: balão AMARELO realista na lateral, pulsando — "POR"/"DE" em cima, R$ + valor + centavos no centro, unidade embaixo
  const s = f.preco[formato];
  const d = s.d * Math.min(W, H);
  const balao = seloDoPreco(p, s.cx * W - d / 2, s.cy * H - d / 2, d, f.selo);
  if (balao) c.push({ ...balao, animacao: ani(mov.preco ?? 'zoom', 0.9, 0.55, 'pulsar') });
  // F-249: botão de um objeto só no lugar do "YOUR LOGO": cobre desde o 1º quadro (sem entrada), pulsa e o texto é centralizado
  const bb = px(f.botao[formato]);
  const tamanhoBotao = Math.round(bb.h * 0.62);
  c.push({ ...texto('Botão', (o.textoBotao ?? f.botoes[0]).toUpperCase(), bb.x, bb.y, bb.w, { fonte: 'anton', tamanho: tamanhoBotao, maiusculas: true, alinhamento: 'center', cor: '#ffffff', entrelinha: 1, fundo: { cor: f.corBotao, raio: Math.round(bb.h * 0.32), margem: (bb.h - tamanhoBotao) / 1.1, cheio: true, borda: { cor: f.bordaBotao, largura: Math.max(6, Math.round(bb.h * 0.08)) } } }), animacao: ani('pulsar', 0, 1) });
  if (f.aviso) c.push({ ...avisoLegal(f.aviso.texto, px(f.aviso.caixa[formato])), animacao: ani('surgir', 0.2, 0.5) });
  // F-296: o fundo do documento é a cor DESTE palco (antes, o vermelho do Alerta de Oferta em todos)
  return { versao: 2, formato, fundo: f.corTema, corTema: f.corTema, camadas: c, video: { duracao: o.segundos ?? SEGUNDOS_POR_PRODUTO } };
}
/** F-242: regra do dono — cada produto fica 8 s no palco */
export const SEGUNDOS_POR_PRODUTO = 8;
export const PASTA_PALCO = 'palco-de-ofertas';
/** F-259: o mesmo palco, só para farmácia */
export const PASTA_PALCO_FARMACIA = 'palco-de-ofertas-farmacia';
/** F-277: a pasta do palco de cada segmento novo */
export const PASTAS_PALCO_DOS_SEGMENTOS: Record<string, SegmentoNovo> = Object.fromEntries(SEGMENTOS_DE_OFERTA.map((s) => [pastaDoPalcoDe(s.id), s.id]));

type Ani = NonNullable<Camada['animacao']>;
const ani = (tipo: Ani['tipo'], atraso: number, duracao = 0.6, depois: Ani['depois'] = null): Ani => ({ tipo, atraso, duracao, depois });

/**
 * F-249: cada elemento tem o nome como identidade (a seleção não se perde entre um produto e outro) e recebe o que o cliente
 * editou; o texto "DE x POR" da promoção é de cada produto, então não é trocado.
 */
function comAjustes(d: Documento, formato: FormatoDoc, o: OpcoesDoPalco, nomeDoProduto?: string): Documento {
  const a = o.ajustes?.[formato] ?? {};
  // F-290 (pedido do dono): o TAMANHO e a posição do produto são de CADA produto (um grande, outro pequeno, cada um no seu)
  const doProduto = nomeDoProduto ? a[chaveDoProdutoNoPalco(nomeDoProduto)] : undefined;
  const nomes = new Set(d.camadas.map((c) => c.nome));
  // F-288: textos que o cliente criou (na logo ou soltos) ficam guardados inteiros nos ajustes e entram por cima da arte
  const novas = Object.entries(a).filter(([n, v]) => !nomes.has(n) && v && typeof (v as Partial<Camada>).tipo === 'string').map(([n, v]) => ({ ...v, nome: n, id: n }) as Camada);
  return { ...d, camadas: [...d.camadas.map((c) => {
    const { topo, ...resto } = { ...(a[c.nome] ?? {}), ...(c.nome === 'Produto' && doProduto ? doProduto : {}) } as Partial<Camada> & { topo?: string };
    const promo = c.tipo === 'selo' && c.topo.startsWith('DE ');
    return { ...c, ...resto, ...(topo != null && !promo ? { topo } : {}), id: c.nome } as Camada;
  }), ...novas] };
}

/** A arte de UM produto no palco (16:9 ou 9:16), com as animações da coreografia do palco. */
export function palcoDoProduto(p: Pick<ProdutoTabloide, 'nome' | 'preco' | 'precoDe' | 'unidade' | 'imagem'>, formato: FormatoDoc, o: OpcoesDoPalco = {}): Documento {
  if (o.fundo) return comAjustes(palcoOficial(p, formato, o.fundo, o), formato, o, p.nome);
  const { w: W, h: H } = TAMANHO_DOC[formato];
  const em = formato === '9:16';
  const titulo = (o.titulo ?? 'SUPER OFERTAS').toUpperCase();
  const preco = p.preco != null ? formatarPreco(p.preco) : null;
  const c: Camada[] = [];

  // fundo vermelho de oferta com brilho no centro (parado) e halo de luz atrás do produto
  c.push({ ...forma('Fundo', 0, 0, W, H, { degrade: { de: '#ef1f35', meio: '#a00c1f', para: '#3a0209', angulo: 180 }, cor: '#a00c1f' }), bloqueada: true });
  const px = em ? W * 0.5 : W * 0.36; // meio do palco
  const halo = em ? W * 0.95 : H * 0.95;
  c.push({ ...forma('Brilho', px - halo / 2, (em ? H * 0.44 : H * 0.52) - halo / 2, halo, halo, { forma: 'elipse', cor: 'rgba(255,214,90,0.08)', degrade: { de: 'rgba(255,230,140,0.22)', para: 'rgba(255,214,90,0)', angulo: 90 } }), animacao: ani('surgir', 0, 0.8, 'pulsar') });

  // título e logo
  const tit = texto('Título', titulo, 0, 0, em ? W * 0.9 : W * 0.56, {
    fonte: 'anton', tamanho: em ? 168 : 150, maiusculas: true, alinhamento: 'center', cor: '#FFD21F', entrelinha: 0.95,
    contorno: { cor: '#6d0012', largura: 10 }, sombra: { cor: 'rgba(0,0,0,.45)', desfoque: 22, dx: 0, dy: 10 },
  });
  Object.assign(tit, em ? { x: (W - tit.w) / 2, y: 90 } : { x: W * 0.62 - tit.w * 0.08, y: 70 });
  if (o.logoTitulo) {
    // a logo 3D ocupa a caixa do título, inteira e na proporção dela
    const caixaW = em ? W * 0.9 : W * 0.56, caixaH = em ? H * 0.2 : H * 0.34;
    const r = Math.min(caixaW / o.logoTitulo.largura, caixaH / o.logoTitulo.altura);
    const lw = o.logoTitulo.largura * r, lh = o.logoTitulo.altura * r;
    const lx = em ? (W - lw) / 2 : W * 0.6 + (W * 0.38 - lw) / 2;
    c.push({ ...imagem('Título', o.logoTitulo.url, lx, em ? 60 : 50, lw, lh, { ajuste: 'conter' }), animacao: ani('zoom', 0.15, 0.7, 'flutuar') });
    tit.y = (em ? 60 : 50) + lh - tit.h; // a logo do mercado fica logo abaixo
  } else c.push({ ...tit, animacao: ani('descer', 0.15, 0.7) });
  const logoW = em ? W * 0.44 : W * 0.2, logoH = em ? 150 : 130;
  const logoX = em ? (W - logoW) / 2 : W - W * 0.04 - logoW, logoY = em ? tit.y + tit.h + 30 : H * 0.05;
  if (o.logoUrl) c.push({ ...imagem('Logo', o.logoUrl, logoX, logoY, logoW, logoH, { ajuste: 'conter' }), animacao: ani('zoom', 0.35, 0.5) });
  else {
    c.push({ ...forma('Logo', logoX, logoY, logoW, logoH, { cor: '#ffffff', raio: 26, borda: { cor: '#FFD21F', largura: 6 } }), animacao: ani('zoom', 0.35, 0.5) });
    const sl = texto('Sua logo', 'SUA LOGO AQUI', logoX, logoY, logoW, { fonte: 'anton', tamanho: em ? 54 : 44, alinhamento: 'center', cor: '#7a0010' });
    sl.y = logoY + (logoH - sl.h) / 2;
    c.push({ ...sl, animacao: ani('zoom', 0.35, 0.5) });
  }

  // pedestal: corpo vermelho, tampo dourado e a borda clara (sobe do chão)
  const pw = em ? W * 0.7 : W * 0.4, pAlt = em ? H * 0.11 : H * 0.17, py = em ? H * 0.69 : H * 0.72;
  const tampo = em ? H * 0.06 : H * 0.1;
  c.push({ ...forma('Palco — base', px - pw / 2, py + tampo / 2, pw, pAlt, { degrade: { de: '#d1142b', para: '#560513', angulo: 180 }, cor: '#a00c1f', raio: 18 }), animacao: ani('subir', 0.2, 0.6) });
  c.push({ ...forma('Palco — tampo', px - pw / 2, py, pw, tampo, { forma: 'elipse', degrade: { de: '#fff1b0', meio: '#f5c53a', para: '#c48a00', angulo: 90 }, cor: '#f5c53a' }), animacao: ani('subir', 0.2, 0.6) });
  c.push({ ...forma('Palco — centro', px - pw * 0.42, py + tampo * 0.15, pw * 0.84, tampo * 0.7, { forma: 'elipse', degrade: { de: '#ef1f35', para: '#8a0a1b', angulo: 90 }, cor: '#c40f24' }), animacao: ani('subir', 0.2, 0.6) });

  // o produto (foto inteira, recortada) em cima do pedestal: entra com zoom e fica flutuando
  const prodW = em ? W * 0.62 : W * 0.32, prodH = em ? H * 0.34 : H * 0.5;
  const fotoProduto = p.imagem?.url ?? '';
  c.push({ ...imagem('Produto', fotoProduto, px - prodW / 2, py - prodH + tampo * 0.35, prodW, prodH, { ajuste: 'conter', sombra: null }), animacao: ani('zoom', 0.45, 0.7, 'flutuar') });

  // nome do produto e preço
  const nome = texto('Nome do produto', p.nome, 0, 0, em ? W * 0.86 : W * 0.4, {
    fonte: 'poppins', peso: 800, tamanho: em ? 64 : 62, maiusculas: true, alinhamento: 'center', cor: '#ffffff', entrelinha: 1.05,
    fundo: { cor: 'rgba(60,0,10,.72)', raio: 22, margem: 18 },
  });
  Object.assign(nome, em ? { x: (W - nome.w) / 2, y: py + tampo + pAlt + 36 } : { x: W * 0.56, y: H * 0.42 });
  c.push({ ...nome, animacao: ani(em ? 'subir' : 'direita', 0.85, 0.6) });
  if (preco) {
    const d = em ? 330 : 300;
    const sx = em ? W - d - 40 : W * 0.56 + (W * 0.4 - d) / 2, sy = em ? py - d * 0.9 : nome.y + nome.h + 40;
    const balao = seloDoPreco(p, sx, sy, d);
    if (balao) c.push({ ...balao, animacao: ani(o.movimento?.preco ?? 'zoom', 1.15, 0.55, 'pulsar') });
  }
  const aviso = texto('Aviso', 'Ofertas válidas enquanto durarem os estoques · Imagens ilustrativas', 0, 0, W * 0.9, { tamanho: em ? 26 : 22, alinhamento: 'center', cor: 'rgba(255,255,255,.75)' });
  Object.assign(aviso, { x: (W - aviso.w) / 2, y: H - aviso.h - 26 });
  c.push({ ...aviso, animacao: ani('surgir', 1.3, 0.5) });

  return comAjustes({ versao: 2, formato, fundo: '#3a0209', camadas: c, video: { duracao: o.segundos ?? SEGUNDOS_POR_PRODUTO } }, formato, o);
}

/** O CARROSSEL: um clipe por produto (nome e preço de cada vez), deslizando de um para o outro. */
export function projetoDoCarrossel(produtos: Array<Pick<ProdutoTabloide, 'nome' | 'preco' | 'precoDe' | 'unidade' | 'imagem'>>, formato: FormatoDoc, o: OpcoesDoPalco = {}): ProjetoDeVideo {
  const seg = o.segundos ?? SEGUNDOS_POR_PRODUTO;
  return {
    ...projetoVazio(formato),
    // F-296: o fundo do vídeo (o que aparece por trás das trocas) é a cor DESTE palco, girada pelo tom escolhido — nunca o do mercado
    fundo: produtos[0] ? escurecer(corDoDocumento(palcoDoProduto(produtos[0], formato, o)), 0.45) : '#000000',
    ...comLocucao(produtos, formato, o, seg),
  };
}

/**
 * F-300: os clipes do carrossel e, com LOCUÇÃO, as falas na linha do tempo: o 1º produto começa com a abertura, cada
 * produto fica no ar o tempo da fala dele (nunca menos que `seg`) e o último termina com o fechamento.
 */
function comLocucao(produtos: Array<Pick<ProdutoTabloide, 'nome' | 'preco' | 'precoDe' | 'unidade' | 'imagem'>>, formato: FormatoDoc, o: OpcoesDoPalco, seg: number): Pick<ProjetoDeVideo, 'clipes' | 'audios'> {
  const l = o.locucao;
  const PAUSA = 0.35, FOLGA = 1.2;
  const falas = produtos.map((p) => l?.ofertas[chaveDaFala(p.nome)] ?? null);
  const duracoes = produtos.map((_, i) => {
    if (!l) return seg;
    const antes = i === 0 && l.abertura ? l.abertura.dur + PAUSA : 0;
    const depois = i === produtos.length - 1 && l.fechamento ? PAUSA + l.fechamento.dur : 0;
    return Math.max(seg, antes + (falas[i]?.dur ?? 0) + depois + FOLGA);
  });
  const clipes = produtos.map((p, i) => novoClipe('arte', '', p.nome, {
    documento: palcoDoProduto(p, formato, { ...o, segundos: duracoes[i] }), duracao: duracoes[i], zoomDe: 1, zoomPara: 1,
    transicao: { tipo: transicaoDoProduto(o.movimento, p.nome), duracao: 0.5 },
  }));
  if (!l) return { clipes, audios: [] };
  const ini = inicios(clipes);
  const audios: FaixaDeAudio[] = [];
  produtos.forEach((p, i) => {
    let t = ini[i] + 0.3;
    if (i === 0 && l.abertura) { audios.push(faixaDaFala('Locução · abertura', l.abertura, t)); t += l.abertura.dur + PAUSA; }
    if (falas[i]) { audios.push(faixaDaFala(`Locução · ${p.nome}`, falas[i]!, t)); t += falas[i]!.dur; }
    if (i === produtos.length - 1 && l.fechamento) audios.push(faixaDaFala('Locução · fechamento', l.fechamento, t + PAUSA));
  });
  return { clipes, audios };
}
