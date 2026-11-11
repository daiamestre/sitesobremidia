/**
 * P-33 / F-300 — LOCUTOR do SOBRE MÍDIA (vozes da ElevenLabs).
 * O "agente locutor" monta o ROTEIRO a partir do que a pessoa já escreveu no sistema (nome da loja + produtos e preços),
 * no jeito de falar dos locutores de oferta (referência: o concorrente e as ofertas do dono):
 *   abertura  → "Vem conferir as ofertas do Mercadinho Economia!"
 *   uma frase por produto → "Arroz Tio João, cinco quilos, por apenas vinte e quatro e noventa e nove!"
 *   fechamento → "Vem pra cá economizar!"
 * Preço, peso e unidade saem POR EXTENSO (a voz fala certo, sem ler "R$" nem "kg"). A voz é gerada no servidor
 * (função studio-locucao), cada frase uma vez só (fica guardada) — o navegador nunca vê a chave da ElevenLabs.
 */
import type { SegmentoDoStudio } from './palco';

export type IdDaVoz = 'dono' | 'leonardo' | 'carlos' | 'aline' | 'diego';

export interface VozDoLocutor {
  id: IdDaVoz; nome: string; descricao: string; genero: 'masculina' | 'feminina';
  /** frase de exemplo já gravada (para "Ouvir" sem gastar crédito) */
  amostra: string;
  /** segmento em que ela é a voz padrão */
  segmento: SegmentoDoStudio;
}

export const VOZES_DO_LOCUTOR: VozDoLocutor[] = [
  { id: 'dono', nome: 'Sérgio Vaz', descricao: 'Locutor da casa · animado, de supermercado', genero: 'masculina', amostra: '/studio/locucao/dono-mercado.mp3', segmento: 'mercado' },
  { id: 'aline', nome: 'Aline', descricao: 'Locutora firme e confiável', genero: 'feminina', amostra: '/studio/locucao/aline-farmacia.mp3', segmento: 'farmacia' },
  { id: 'carlos', nome: 'Carlos', descricao: 'Locutor de ofertas · forte', genero: 'masculina', amostra: '/studio/locucao/carlos-acougue.mp3', segmento: 'acougue' },
  { id: 'leonardo', nome: 'Leonardo', descricao: 'Locutor de varejo · voz quente', genero: 'masculina', amostra: '/studio/locucao/leonardo-hortifruti.mp3', segmento: 'hortifruti' },
  { id: 'diego', nome: 'Diego', descricao: 'Locutor confiante de comercial', genero: 'masculina', amostra: '/studio/locucao/diego-adega.mp3', segmento: 'adega' },
];
export const vozPadraoDo = (s: SegmentoDoStudio): IdDaVoz => VOZES_DO_LOCUTOR.find((v) => v.segmento === s)?.id ?? 'dono';

// ---------------------------------------------------------------------------------------------------------------------
// números por extenso (pt-BR)
// ---------------------------------------------------------------------------------------------------------------------
const UNI = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CEN = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function ate999(n: number): string {
  if (n < 20) return UNI[n];
  if (n < 100) return DEZ[Math.floor(n / 10)] + (n % 10 ? ` e ${UNI[n % 10]}` : '');
  if (n === 100) return 'cem';
  return CEN[Math.floor(n / 100)] + (n % 100 ? ` e ${ate999(n % 100)}` : '');
}
/** 0 a 999.999.999 por extenso: 1899 → "mil oitocentos e noventa e nove". */
export function porExtenso(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n < 1000) return ate999(n);
  if (n < 1_000_000) {
    const mil = Math.floor(n / 1000), resto = n % 1000;
    const cab = mil === 1 ? 'mil' : `${ate999(mil)} mil`;
    return resto ? `${cab}${resto < 100 || resto % 100 === 0 ? ' e ' : ' '}${ate999(resto)}` : cab;
  }
  const mi = Math.floor(n / 1_000_000), resto = n % 1_000_000;
  const cab = mi === 1 ? 'um milhão' : `${ate999(mi)} milhões`;
  return resto ? `${cab}${resto < 100 ? ' e ' : ' '}${porExtenso(resto)}` : cab;
}

/** Preço como o locutor fala: 4,75 → "quatro e setenta e cinco"; 5 → "cinco reais"; 0,99 → "noventa e nove centavos". */
export function precoFalado(valor: number): string {
  const centavos = Math.round(valor * 100);
  const r = Math.floor(centavos / 100), c = centavos % 100;
  if (r > 0 && c > 0) return `${porExtenso(r)} e ${porExtenso(c)}`;
  if (r > 0) return `${porExtenso(r)} ${r === 1 ? 'real' : 'reais'}`;
  return `${porExtenso(c)} ${c === 1 ? 'centavo' : 'centavos'}`;
}

/** A unidade do preço: KG → " o quilo"; LITRO → " o litro"; 100 G → " cada cem gramas"; UN → "" (não fala). */
export function unidadeFalada(u: string | null | undefined): string {
  const m: Record<string, string> = { KG: ' o quilo', LITRO: ' o litro', '100 G': ' cada cem gramas', 'DÚZIA': ' a dúzia', PACOTE: ' o pacote', CAIXA: ' a caixa', BANDEJA: ' a bandeja', FATIA: ' a fatia', 'PORÇÃO': ' a porção', PAR: ' o par' };
  return u ? m[u.toUpperCase()] ?? '' : '';
}

/** Nome do produto como se FALA: "Arroz Tio João 5kg" → "Arroz Tio João, cinco quilos"; "Coca-Cola 2L" → "Coca-Cola, dois litros". */
export function nomeFalado(nome: string): string {
  const medida = (n: string, u: string) => {
    const [int, dec] = n.replace('.', ',').split(',');
    const inteiro = porExtenso(Number(int));
    const plural = (sing: string, pl: string) => (Number(int) === 1 && !dec ? sing : pl);
    const un: Record<string, [string, string]> = { kg: ['quilo', 'quilos'], g: ['grama', 'gramas'], gr: ['grama', 'gramas'], mg: ['miligrama', 'miligramas'], l: ['litro', 'litros'], lt: ['litro', 'litros'], ml: ['mililitro', 'mililitros'], un: ['unidade', 'unidades'], und: ['unidade', 'unidades'], cm: ['centímetro', 'centímetros'], m: ['metro', 'metros'] };
    const [s, p] = un[u.toLowerCase()] ?? [u, u];
    if (dec) {
      if (dec === '5' || dec === '50') return `${inteiro} ${s} e meio`.replace(/^um quilo e meio/, 'um quilo e meio');
      return `${inteiro} vírgula ${dec.split('').map((d) => UNI[Number(d)]).join(' ')} ${p}`;
    }
    return `${inteiro} ${plural(s, p)}`;
  };
  let t = ` ${nome} `
    .replace(/\bc\/\s*/gi, 'com ')
    .replace(/(\d+(?:[.,]\d+)?)\s?(kg|mg|gr|g|ml|lt|l|un|und|cm|m)\b\.?/gi, (_, n, u) => `, ${medida(n, u)},`)
    .replace(/(\d+)\s?%/g, (_, n) => `${porExtenso(Number(n))} por cento`)
    .replace(/\b(\d+)\s?x\b/gi, (_, n) => `${porExtenso(Number(n))} vezes`)
    .replace(/\d+/g, (n) => porExtenso(Number(n)));
  t = t.replace(/\s*,\s*,/g, ',').replace(/\s+,/g, ',').replace(/,(\s*[!.?]|\s*$)/, '$1').replace(/\s+/g, ' ').trim();
  return t.replace(/^,\s*/, '').replace(/,$/, '');
}

export interface ProdutoDaLocucao { nome: string; preco: number | null; precoDe?: number | null; unidade?: string | null }

/** A frase de UM produto, no jeito dos locutores de oferta. */
export function fraseDaOferta(p: ProdutoDaLocucao): string {
  if (p.preco == null) return `${nomeFalado(p.nome)}!`;
  const de = p.precoDe != null && p.precoDe > p.preco ? `, de ${precoFalado(p.precoDe)}` : '';
  return `${nomeFalado(p.nome)}${de}, por apenas ${precoFalado(p.preco)}${unidadeFalada(p.unidade)}!`;
}

const LOJA_FEMININA = /^(farm[aá]cia|drogaria|padaria|adega|loja|mercearia|casa|distribuidora|quitanda|a[cç]ougue?ria|perfumaria|boutique|confeitaria|peixaria|rede|barraca|feira|cantina|doceria|sorveteria|pizzaria|lanchonete|panificadora|empresa)\b/i;
/** "do Mercadinho Economia" / "da Farmácia São João" (a pessoa pode reescrever a abertura se a regra errar). */
export const doDa = (loja: string) => (LOJA_FEMININA.test(loja.trim()) ? 'da' : 'do');

const LOJA_DO_SEGMENTO: Partial<Record<SegmentoDoStudio, string>> = {
  mercado: 'seu supermercado', farmacia: 'sua farmácia', acougue: 'seu açougue', hortifruti: 'seu hortifrúti', adega: 'sua adega', padaria: 'sua padaria',
  suplementos: 'sua loja de suplementos', pet: 'seu pet shop', beleza: 'sua perfumaria', eletronicos: 'sua loja', moda: 'sua loja',
};
/** Abertura padrão: com o nome da loja, se a pessoa escreveu; senão "do seu supermercado". */
export function aberturaPadrao(segmento: SegmentoDoStudio, loja: string): string {
  const l = loja.trim();
  return l ? `Vem conferir as ofertas ${doDa(l)} ${l}!` : `Vem conferir as ofertas ${LOJA_DO_SEGMENTO[segmento]?.startsWith('sua') ? 'da' : 'do'} ${LOJA_DO_SEGMENTO[segmento] ?? 'sua loja'}!`;
}
/** Fechamento padrão; farmácia e adega levam o aviso obrigatório. */
export function fechamentoPadrao(segmento: SegmentoDoStudio, loja: string): string {
  const l = loja.trim();
  const base = l ? `Vem pra cá economizar! ${l}!` : 'Vem pra cá economizar!';
  if (segmento === 'farmacia') return `Cuide da sua saúde e economize! ${l ? `${l}! ` : ''}A persistirem os sintomas, o médico deverá ser consultado.`;
  if (segmento === 'adega') return `${base} Beba com moderação. Venda proibida para menores de dezoito anos.`;
  return base;
}

export interface FraseDoRoteiro { chave: string; tipo: 'abertura' | 'oferta' | 'fechamento'; texto: string; produto?: string }

/**
 * O ROTEIRO completo: abertura, uma frase por produto (na ordem do palco) e fechamento.
 * `textos` guarda o que a pessoa reescreveu (pela chave): o agente nunca troca em silêncio o que ela escreveu.
 */
export function roteiroDaLocucao(o: { segmento: SegmentoDoStudio; loja: string; produtos: ProdutoDaLocucao[]; textos?: Record<string, string>; abertura?: boolean; fechamento?: boolean }): FraseDoRoteiro[] {
  const t = o.textos ?? {};
  const r: FraseDoRoteiro[] = [];
  if (o.abertura !== false) r.push({ chave: 'abertura', tipo: 'abertura', texto: t.abertura?.trim() || aberturaPadrao(o.segmento, o.loja) });
  for (const p of o.produtos) {
    const chave = `oferta:${p.nome.trim().toLowerCase()}`;
    r.push({ chave, tipo: 'oferta', produto: p.nome, texto: t[chave]?.trim() || fraseDaOferta(p) });
  }
  if (o.fechamento !== false) r.push({ chave: 'fechamento', tipo: 'fechamento', texto: t.fechamento?.trim() || fechamentoPadrao(o.segmento, o.loja) });
  return r;
}

/** Quantas letras o roteiro gasta (a ElevenLabs cobra por letra). */
export const letrasDoRoteiro = (r: FraseDoRoteiro[]) => r.reduce((s, f) => s + f.texto.length, 0);
