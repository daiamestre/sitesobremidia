/**
 * Cartaz Digital (F-179) — o modelo de um cartaz e tudo que se calcula a partir dele.
 * É a única fonte de verdade: o editor, a lista "Meus cartazes", a impressão em lote e o portal desenham o cartaz
 * a partir daqui (`propsDasPaginas`), então a prévia e a imagem final nunca divergem.
 */
import type { TabloideCanvasProps } from '@/components/tabloide/TabloideCanvas';
import { montarPaginas, type AjusteDeMedidas } from './grade';
import { formatarPreco, type ProdutoTabloide } from './parseProdutos';
import { logosDoCabecalho, resolverImagem, type ElementoLivre, type Selo } from './selos';
import { formatoPorId, segmentoPorId, temaPorId, type Tema } from './temas';

export type CampoEmpresa = 'telefone' | 'whatsapp' | 'legenda' | 'nome' | 'slogan' | 'pagamento' | 'obsPagamento' | 'endereco' | 'instagram' | 'facebook' | 'website';

export const CAMPOS_EMPRESA: Array<{ id: CampoEmpresa; rotulo: string; exemplo: string }> = [
  { id: 'telefone', rotulo: 'Mostrar telefone', exemplo: '(11) 3333-4444' },
  { id: 'whatsapp', rotulo: 'Mostrar WhatsApp', exemplo: '(11) 99999-0000' },
  { id: 'legenda', rotulo: 'Legenda dos telefones', exemplo: 'Peça pelo telefone' },
  { id: 'nome', rotulo: 'Mostrar nome da empresa', exemplo: 'Mercado Bom Preço' },
  { id: 'slogan', rotulo: 'Mostrar slogan', exemplo: 'O melhor preço do bairro' },
  { id: 'pagamento', rotulo: 'Mostrar formas de pagamento', exemplo: 'Pix, cartão e dinheiro' },
  { id: 'obsPagamento', rotulo: 'Mostrar observação de pagamento', exemplo: 'Parcelamos em até 3x' },
  { id: 'endereco', rotulo: 'Mostrar endereço', exemplo: 'Rua das Flores, 100 — Centro' },
  { id: 'instagram', rotulo: 'Mostrar Instagram', exemplo: '@mercadobompreco' },
  { id: 'facebook', rotulo: 'Mostrar Facebook', exemplo: 'facebook.com/mercadobompreco' },
  { id: 'website', rotulo: 'Mostrar site', exemplo: 'www.mercadobompreco.com.br' },
];

export type DadosEmpresa = Record<CampoEmpresa, string>;
export type MostrarEmpresa = Record<CampoEmpresa, boolean>;

export interface RegrasOferta {
  /** datas no formato AAAA-MM-DD (vazio = sem data) */
  inicio: string;
  fim: string;
  mostrarDatas: boolean;
  enquantoDurarem: boolean;
  imagensIlustrativas: boolean;
  advertenciaMedicamento: boolean;
  mostrarFrase: boolean;
  frase: string;
}

export interface FontesCartaz { produto: string; preco: string; frase: string; rodape: string }
export type ParteDaFonte = keyof FontesCartaz;
export const PARTES_DA_FONTE: Array<{ id: ParteDaFonte; rotulo: string }> = [
  { id: 'produto', rotulo: 'Título do produto' },
  { id: 'preco', rotulo: 'Etiqueta de preço' },
  { id: 'frase', rotulo: 'Mensagem promocional' },
  { id: 'rodape', rotulo: 'Textos do rodapé' },
];

export type FundoLogo = 'branco' | 'sem' | 'escuro';

/** Como cada produto é desenhado: nome em cima/foto/preço embaixo, faixa com o nome, ou foto ao lado do preço. */
export type EstiloBox = 'inteligente' | 'coluna' | 'faixa' | 'lado';
export const ESTILOS_DE_BOX: Array<{ id: EstiloBox; nome: string; dica: string }> = [
  { id: 'inteligente', nome: 'Inteligente', dica: 'Escolhe o melhor desenho para o espaço de cada produto' },
  { id: 'coluna', nome: 'Em coluna', dica: 'Nome em cima, foto no meio e preço embaixo' },
  { id: 'faixa', nome: 'Com faixa', dica: 'Faixa colorida com o nome, foto e preço no canto' },
  { id: 'lado', nome: 'Lado a lado', dica: 'Foto de um lado, nome e preço do outro' },
];

export type TamanhoTexto = 'pequeno' | 'medio' | 'grande';
export const TAMANHOS_DE_TEXTO: Array<{ id: TamanhoTexto; nome: string; escala: number }> = [
  { id: 'pequeno', nome: 'Texto pequeno', escala: 0.82 },
  { id: 'medio', nome: 'Texto médio', escala: 1 },
  { id: 'grande', nome: 'Texto grande', escala: 1.2 },
];

export type CoresCartaz = 'inteligente' | 'claro' | 'amarelo' | 'escuro' | 'tema';
export const CORES_DO_BOX: Array<{ id: CoresCartaz; nome: string }> = [
  { id: 'inteligente', nome: 'Inteligente' },
  { id: 'claro', nome: 'Box branco' },
  { id: 'amarelo', nome: 'Box amarelo' },
  { id: 'escuro', nome: 'Box escuro' },
  { id: 'tema', nome: 'Cor do tema' },
];

export type EstiloRodape = 'faixa' | 'redondo' | 'grande' | 'sem';
export const ESTILOS_DE_RODAPE: Array<{ id: EstiloRodape; nome: string }> = [
  { id: 'faixa', nome: 'Faixa reta' },
  { id: 'redondo', nome: 'Redondo' },
  { id: 'grande', nome: 'Redondo grande' },
  { id: 'sem', nome: 'Sem rodapé' },
];

/** Onde a foto do tema entra: só na faixa do cabeçalho (como nos encartes) ou cobrindo o cartaz inteiro. */
export type ModoTema = 'cabecalho' | 'fundo';

/** Aplica a escolha de "Cores" sobre as cores do estilo (o selo de preço e o rodapé seguem o estilo). */
export function temaComCores(tema: Tema, cores: CoresCartaz): Tema {
  if (cores === 'claro') return { ...tema, cartao: '#ffffff', nomeCor: '#111827' };
  if (cores === 'amarelo') return { ...tema, cartao: '#ffd21f', cartaoBorda: '#ffb300', nomeCor: '#111827' };
  if (cores === 'escuro') return { ...tema, cartao: '#18181b', cartaoBorda: tema.preco, nomeCor: '#fafafa' };
  if (cores === 'tema') return { ...tema, cartao: tema.faixa, cartaoBorda: tema.cartaoBorda, nomeCor: tema.tituloCor };
  return tema;
}

/** Proporção boa do box para a grade automática, conforme o estilo escolhido. */
export const boxIdeal = (estilo: EstiloBox): [number, number] => (estilo === 'coluna' ? [0.42, 1] : estilo === 'lado' ? [1.3, 2.8] : estilo === 'faixa' ? [0.8, 1.7] : [0.5, 1.9]);

export interface ConfigCartaz {
  titulo: string;
  empresa: DadosEmpresa;
  mostrar: MostrarEmpresa;
  regras: RegrasOferta;
  fontes: FontesCartaz;
  logoMarcaUrl: string | null;
  mostrarLogo: boolean;
  fundoLogo: FundoLogo;
  /** logo 3D escolhida para o cabeçalho (identificador da biblioteca) */
  logoCabecalhoId: string | null;
  /** selo avulso de rascunhos antigos */
  seloUrl: string | null;
  /** o usuário preferiu o título em texto no lugar de uma logo */
  cabecalhoEmTexto: boolean;
  /** foto de tema (fundo) escolhida na biblioteca */
  temaFotoId: string | null;
  /** onde a foto do tema entra */
  temaModo: ModoTema;
  boxes: EstiloBox;
  tamanhoTexto: TamanhoTexto;
  cores: CoresCartaz;
  rodapeEstilo: EstiloRodape;
  /** primeira página só com a arte, o título, a validade e a loja */
  capa: boolean;
  destaques: 0 | 1 | 2;
  texto: string;
  elementos: ElementoLivre[];
  observacoes: string;
}

const vazio = <T extends string>(chaves: readonly T[], valor: string | boolean) => Object.fromEntries(chaves.map((c) => [c, valor]));
const CHAVES = CAMPOS_EMPRESA.map((c) => c.id);

export function configPadrao(): ConfigCartaz {
  return {
    titulo: '',
    empresa: vazio(CHAVES, '') as DadosEmpresa,
    mostrar: vazio(CHAVES, false) as MostrarEmpresa,
    regras: { inicio: '', fim: '', mostrarDatas: true, enquantoDurarem: false, imagensIlustrativas: true, advertenciaMedicamento: false, mostrarFrase: true, frase: '' },
    fontes: { produto: 'padrao', preco: 'padrao', frase: 'padrao', rodape: 'padrao' },
    logoMarcaUrl: null, mostrarLogo: true, fundoLogo: 'branco',
    logoCabecalhoId: null, seloUrl: null, cabecalhoEmTexto: false, temaFotoId: null,
    temaModo: 'cabecalho', boxes: 'inteligente', tamanhoTexto: 'medio', cores: 'inteligente', rodapeEstilo: 'faixa', capa: false,
    destaques: 0, texto: '', elementos: [], observacoes: '',
  };
}

const texto = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
const sim = (v: unknown, padrao: boolean) => (typeof v === 'boolean' ? v : padrao);
const data = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');

/** Lê o que está salvo (inclusive rascunhos antigos, que tinham "subtitulo", "validade" e "empresa" como texto) sem quebrar. */
export function normalizarConfig(bruto: unknown): ConfigCartaz {
  const b = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, any>;
  const p = configPadrao();
  const antigoNome = typeof b.empresa === 'string' ? b.empresa : '';
  const emp = (b.empresa && typeof b.empresa === 'object' ? b.empresa : {}) as Record<string, unknown>;
  const mos = (b.mostrar && typeof b.mostrar === 'object' ? b.mostrar : {}) as Record<string, unknown>;
  for (const c of CHAVES) { p.empresa[c] = texto(emp[c]); p.mostrar[c] = sim(mos[c], false); }
  if (antigoNome) { p.empresa.nome = texto(antigoNome); p.mostrar.nome = true; }
  const r = (b.regras && typeof b.regras === 'object' ? b.regras : {}) as Record<string, unknown>;
  p.regras = {
    inicio: data(r.inicio), fim: data(r.fim), mostrarDatas: sim(r.mostrarDatas, true), enquantoDurarem: sim(r.enquantoDurarem, false),
    imagensIlustrativas: sim(r.imagensIlustrativas, true), advertenciaMedicamento: sim(r.advertenciaMedicamento, false),
    mostrarFrase: sim(r.mostrarFrase, true), frase: texto(r.frase ?? b.subtitulo, 90),
  };
  const f = (b.fontes && typeof b.fontes === 'object' ? b.fontes : {}) as Record<string, unknown>;
  p.fontes = { produto: texto(f.produto, 40) || 'padrao', preco: texto(f.preco, 40) || 'padrao', frase: texto(f.frase, 40) || 'padrao', rodape: texto(f.rodape, 40) || 'padrao' };
  p.titulo = texto(b.titulo, 60);
  p.logoMarcaUrl = typeof b.logoMarcaUrl === 'string' && b.logoMarcaUrl.startsWith('https://') ? b.logoMarcaUrl : null;
  p.mostrarLogo = sim(b.mostrarLogo, true);
  p.fundoLogo = b.fundoLogo === 'sem' || b.fundoLogo === 'escuro' ? b.fundoLogo : 'branco';
  p.logoCabecalhoId = typeof b.logoCabecalhoId === 'string' ? b.logoCabecalhoId : null;
  p.seloUrl = typeof b.seloUrl === 'string' && b.seloUrl.startsWith('https://') ? b.seloUrl : null;
  p.cabecalhoEmTexto = sim(b.cabecalhoEmTexto, false);
  p.temaFotoId = typeof b.temaFotoId === 'string' ? b.temaFotoId : null;
  const um = <T extends string>(v: unknown, lista: Array<{ id: T }>, padrao: T): T => (lista.some((x) => x.id === v) ? (v as T) : padrao);
  // cartaz salvo antes da faixa de tema (F-179) usava a foto no cartaz inteiro: continua igual
  p.temaModo = b.temaModo === 'cabecalho' || (b.temaModo !== 'fundo' && !p.temaFotoId) ? 'cabecalho' : 'fundo';
  p.boxes = um(b.boxes, ESTILOS_DE_BOX, b.boxes === undefined && Object.keys(b).length ? 'faixa' : 'inteligente');
  p.tamanhoTexto = um(b.tamanhoTexto, TAMANHOS_DE_TEXTO, 'medio');
  p.cores = um(b.cores, CORES_DO_BOX, 'inteligente');
  p.rodapeEstilo = um(b.rodapeEstilo, ESTILOS_DE_RODAPE, 'faixa');
  p.capa = sim(b.capa, false);
  p.destaques = b.destaques === 1 || b.destaques === 2 ? b.destaques : 0;
  p.texto = texto(b.texto, 20000);
  p.elementos = Array.isArray(b.elementos) ? (b.elementos as ElementoLivre[]).filter((e) => e && typeof e.url === 'string') : [];
  p.observacoes = texto(b.observacoes, 2000) || (typeof b.validade === 'string' && b.validade ? `Validade anotada no rascunho antigo: ${texto(b.validade, 90)}` : '');
  return p;
}

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const dma = (iso: string) => `${dm(iso)}/${iso.slice(0, 4)}`;

/** "Ofertas válidas de 10/10 a 15/10/2026 ou enquanto durarem os estoques" (vazio se nada foi marcado). */
export function textoDaValidade(r: RegrasOferta): string {
  const temDatas = r.mostrarDatas && (r.inicio || r.fim);
  let t = '';
  if (temDatas) t = r.inicio && r.fim ? `Ofertas válidas de ${dm(r.inicio)} a ${dma(r.fim)}` : r.fim ? `Ofertas válidas até ${dma(r.fim)}` : `Ofertas válidas a partir de ${dma(r.inicio)}`;
  if (r.enquantoDurarem) t = t ? `${t} ou enquanto durarem os estoques` : 'Ofertas válidas enquanto durarem os estoques';
  return t;
}

const ADVERTENCIA_MEDICAMENTO = 'Medicamentos podem causar efeitos indesejados. Leia a bula. Se persistirem os sintomas, procure um médico.';

export interface LinhasDoRodape {
  /** nome, slogan e validade */
  principal: string;
  /** telefones, endereço, redes e pagamento (2ª linha) */
  contato: string;
  /** aviso curto, à direita da 1ª linha */
  avisos: string;
  /** advertência de medicamento (texto longo: ganha uma linha só dela para ficar legível) */
  advertencia: string;
}

/** O que vai escrito no rodapé: só os campos que o dono mandou mostrar e que estão preenchidos. */
export function linhasDoRodape(cfg: Pick<ConfigCartaz, 'empresa' | 'mostrar' | 'regras'>): LinhasDoRodape {
  const v = (c: CampoEmpresa) => (cfg.mostrar[c] ? cfg.empresa[c].trim() : '');
  const telefones = [v('telefone'), v('whatsapp') && `WhatsApp ${v('whatsapp')}`].filter(Boolean).join(' · ');
  const contato = [
    telefones && (v('legenda') ? `${v('legenda')}: ${telefones}` : telefones),
    v('endereco'), v('instagram'), v('facebook'), v('website'),
    [v('pagamento'), v('obsPagamento')].filter(Boolean).join(' — '),
  ].filter(Boolean).join('   •   ');
  const principal = [v('nome'), v('slogan'), textoDaValidade(cfg.regras)].filter(Boolean).join('   •   ');
  return { principal, contato, avisos: cfg.regras.imagensIlustrativas ? '*Imagens meramente ilustrativas' : '', advertencia: cfg.regras.advertenciaMedicamento ? ADVERTENCIA_MEDICAMENTO : '' };
}

/** Quantas linhas o rodapé ocupa: a principal, mais uma para o contato e outra para a advertência. */
export const linhasDoRodapeUsadas = (r: LinhasDoRodape): number => 1 + (r.contato ? 1 : 0) + (r.advertencia ? 1 : 0);

const reais = (n: number) => { const p = formatarPreco(n); return `R$ ${p.inteiro},${p.centavos}`; };

/** Texto pronto para colar nas redes sociais, descrevendo as ofertas (serve também a quem usa leitor de tela). */
export function textoParaPostar(cfg: ConfigCartaz, produtos: ProdutoTabloide[], tituloPadrao: string): string {
  const titulo = (cfg.titulo || tituloPadrao || 'Ofertas').trim();
  const linhas = produtos.map((p) => {
    const preco = p.preco == null ? 'consulte o preço' : `${p.precoDe != null && p.precoDe > p.preco ? `de ${reais(p.precoDe)} por ` : ''}${reais(p.preco)}${p.unidade ? ` (${p.unidade.toLowerCase()})` : ''}`;
    return `• ${p.nome}: ${preco}`;
  });
  const rodape = linhasDoRodape(cfg);
  const loja = cfg.mostrar.nome && cfg.empresa.nome.trim() ? cfg.empresa.nome.trim() : '';
  const marca = loja ? `#${loja.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '')}` : '';
  return [
    `🎉 ${titulo} 🎉`,
    cfg.regras.mostrarFrase && cfg.regras.frase.trim() ? cfg.regras.frase.trim() : '',
    '',
    linhas.length ? `Confira${loja ? ` no ${loja}` : ''}:` : 'Adicione produtos ao cartaz para gerar a lista de ofertas.',
    ...linhas,
    '',
    textoDaValidade(cfg.regras),
    rodape.contato.replace(/\s+•\s+/g, ' | '),
    '',
    `Descrição da imagem: cartaz de ofertas "${titulo}"${linhas.length ? ` com ${linhas.length} produto${linhas.length > 1 ? 's' : ''} e seus preços` : ''}.`,
    ['#Ofertas', '#Promoção', '#PraCegoVer', marca].filter(Boolean).join(' '),
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim();
}

/** O que identifica um cartaz salvo ou em edição. */
export interface CartazParaDesenhar {
  formatoId: string;
  temaId: string;
  segmentoId: string;
  grade: string;
  produtos: ProdutoTabloide[];
  config: ConfigCartaz;
}

/**
 * Qual imagem vai no cabeçalho, nesta ordem: logo 3D escolhida → selo avulso antigo → (título em texto, se o usuário pediu)
 * → sem nada quando há foto de tema (a arte do tema já tem o título) → a primeira logo 3D da empresa → título em texto.
 */
export function resolverCabecalho(cfg: ConfigCartaz, selos: Selo[] | null): { seloUrl: string | null; semTitulo: boolean } {
  const escolhida = resolverImagem(selos, cfg.logoCabecalhoId, 'LOGO_CABECALHO');
  if (escolhida) return { seloUrl: escolhida.imagem_url, semTitulo: false };
  if (cfg.seloUrl) return { seloUrl: cfg.seloUrl, semTitulo: false };
  if (cfg.cabecalhoEmTexto) return { seloUrl: null, semTitulo: false };
  if (resolverImagem(selos, cfg.temaFotoId, 'TEMA')) return { seloUrl: null, semTitulo: true };
  const padrao = logosDoCabecalho(selos).find((l) => !l.dono_id);
  return { seloUrl: padrao ? padrao.imagem_url : null, semTitulo: false };
}

/** Medidas que dependem das escolhas do cartaz (faixa do tema, rodapé e estilo do box). */
export function ajusteDoCartaz(c: CartazParaDesenhar, selos: Selo[] | null): AjusteDeMedidas {
  const cfg = c.config;
  const formato = formatoPorId(c.formatoId);
  const foto = resolverImagem(selos, cfg.temaFotoId, 'TEMA');
  // a faixa do tema entra inteira na largura do cartaz; a altura acompanha a proporção da arte
  const cabecalho = foto && cfg.temaModo === 'cabecalho' && foto.largura > 0 ? formato.largura * (foto.altura / foto.largura) : undefined;
  return { cabecalho, rodape: cfg.rodapeEstilo, boxIdeal: boxIdeal(cfg.boxes) };
}

/** As páginas do cartaz prontas para desenhar (mesmo resultado na prévia, no download, na impressão e no portal). */
export function propsDasPaginas(c: CartazParaDesenhar, selos: Selo[] | null): TabloideCanvasProps[] {
  const formato = formatoPorId(c.formatoId);
  const cfg = c.config;
  const tema = temaComCores(temaPorId(c.temaId), cfg.cores);
  const segmento = segmentoPorId(c.segmentoId);
  const rodape = linhasDoRodape(cfg);
  const linhas = linhasDoRodapeUsadas(rodape);
  const ajuste = ajusteDoCartaz(c, selos);
  const paginas = montarPaginas(c.produtos, formato, c.grade, cfg.destaques, linhas, ajuste);
  const cab = resolverCabecalho(cfg, selos);
  const foto = resolverImagem(selos, cfg.temaFotoId, 'TEMA');
  const naFaixa = !!foto && cfg.temaModo === 'cabecalho';
  const comum = {
    formato, tema, segmento, titulo: cfg.titulo, subtitulo: cfg.regras.mostrarFrase ? cfg.regras.frase : '', validade: '', empresa: '',
    rodape, linhasRodape: linhas, fontes: cfg.fontes,
    logoUrl: cfg.mostrarLogo ? cfg.logoMarcaUrl : null, fundoLogo: cfg.fundoLogo,
    seloUrl: cab.seloUrl, semTitulo: cab.semTitulo,
    fundoUrl: foto && !naFaixa ? foto.imagem_url : null, faixaUrl: naFaixa ? foto.imagem_url : null,
    ajuste, boxes: cfg.boxes, tamanhoTexto: cfg.tamanhoTexto, rodapeEstilo: cfg.rodapeEstilo,
    elementos: cfg.elementos,
  };
  const capa = cfg.capa && c.produtos.length > 0 ? 1 : 0;
  const total = paginas.length + capa;
  const lista: TabloideCanvasProps[] = paginas.map((pagina, i) => ({ ...comum, pagina, numeroPagina: i + 1 + capa, totalPaginas: total }));
  // a capa leva a arte do tema, o título, a validade e a loja; as logos soltas ficam só nas páginas de produtos
  if (capa) lista.unshift({ ...comum, capa: true, elementos: [], pagina: { celulas: [], cols: 1, rows: 1 }, numeroPagina: 1, totalPaginas: total });
  return lista;
}

/** Fontes usadas num cartaz (para carregar antes de desenhar a imagem final). */
export const fontesUsadas = (cfg: ConfigCartaz): string[] => [...new Set(Object.values(cfg.fontes))];
