/**
 * Cartaz Digital (F-177) — calendário de datas comemorativas do comércio.
 * Cada data aponta para um tema próprio e já sugere título e frase; o painel "Temas" tem uma seção para cada uma, na ordem em que chegam.
 */

export interface DataComemorativa {
  id: string;
  nome: string;
  temaId: string;
  titulo: string;
  subtitulo: string;
  /** Data no ano informado. */
  em: (ano: number) => Date;
}

const dia = (ano: number, mes: number, d: number) => new Date(ano, mes - 1, d);

/** n-ésimo domingo de um mês (1 = primeiro). */
function enesimoDomingo(ano: number, mes: number, n: number): Date {
  const primeiro = new Date(ano, mes - 1, 1);
  const desloc = (7 - primeiro.getDay()) % 7;
  return new Date(ano, mes - 1, 1 + desloc + (n - 1) * 7);
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const d2 = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, d2);
}

const somar = (d: Date, dias: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + dias);

/** Black Friday: a sexta-feira depois do 4º feriado de Ação de Graças (4ª quinta de novembro). */
function blackFriday(ano: number): Date {
  const primeiro = new Date(ano, 10, 1);
  const quintas = 1 + ((4 - primeiro.getDay() + 7) % 7) + 21;
  return new Date(ano, 10, quintas + 1);
}

export const DATAS: DataComemorativa[] = [
  { id: 'ano-novo', nome: 'Ano Novo', temaId: 'data-anonovo', titulo: 'Ofertas de Ano Novo', subtitulo: 'Comece o ano economizando', em: (a) => dia(a, 12, 31) },
  { id: 'carnaval', nome: 'Carnaval', temaId: 'data-carnaval', titulo: 'Ofertas de Carnaval', subtitulo: 'Folia com preço de festa', em: (a) => somar(pascoa(a), -47) },
  { id: 'mulher', nome: 'Dia da Mulher', temaId: 'data-mulher', titulo: 'Dia da Mulher', subtitulo: 'Ofertas para quem faz a diferença', em: (a) => dia(a, 3, 8) },
  { id: 'consumidor', nome: 'Dia do Consumidor', temaId: 'ofertao', titulo: 'Dia do Consumidor', subtitulo: 'Descontos o dia inteiro', em: (a) => dia(a, 3, 15) },
  { id: 'pascoa', nome: 'Páscoa', temaId: 'data-pascoa', titulo: 'Ofertas de Páscoa', subtitulo: 'Chocolates e delícias', em: pascoa },
  { id: 'trabalhador', nome: 'Dia do Trabalhador', temaId: 'show', titulo: 'Dia do Trabalhador', subtitulo: 'Ofertas para comemorar', em: (a) => dia(a, 5, 1) },
  { id: 'maes', nome: 'Dia das Mães', temaId: 'data-maes', titulo: 'Dia das Mães', subtitulo: 'Presentes com carinho e preço bom', em: (a) => enesimoDomingo(a, 5, 2) },
  { id: 'namorados', nome: 'Dia dos Namorados', temaId: 'data-namorados', titulo: 'Dia dos Namorados', subtitulo: 'Surpreenda quem você ama', em: (a) => dia(a, 6, 12) },
  { id: 'junina', nome: 'Festa Junina', temaId: 'data-junina', titulo: 'Festa Junina', subtitulo: 'Arraiá de ofertas', em: (a) => dia(a, 6, 24) },
  { id: 'avos', nome: 'Dia dos Avós', temaId: 'show', titulo: 'Dia dos Avós', subtitulo: 'Ofertas para quem a gente ama', em: (a) => dia(a, 7, 26) },
  { id: 'pais', nome: 'Dia dos Pais', temaId: 'data-pais', titulo: 'Dia dos Pais', subtitulo: 'O presente ideal com preço justo', em: (a) => enesimoDomingo(a, 8, 2) },
  { id: 'independencia', nome: 'Independência do Brasil', temaId: 'data-independencia', titulo: 'Ofertas da Independência', subtitulo: 'Preços que libertam o bolso', em: (a) => dia(a, 9, 7) },
  { id: 'dia-cliente', nome: 'Dia do Cliente', temaId: 'data-cliente', titulo: 'Dia do Cliente', subtitulo: 'Você merece o melhor preço', em: (a) => dia(a, 9, 15) },
  { id: 'nordestino', nome: 'Dia do Nordestino', temaId: 'data-nordestino', titulo: 'Dia do Nordestino', subtitulo: 'Sabores e preços de arrasar', em: (a) => dia(a, 10, 8) },
  { id: 'criancas', nome: 'Dia das Crianças', temaId: 'data-criancas', titulo: 'Dia das Crianças', subtitulo: 'Diversão com preço de criança', em: (a) => dia(a, 10, 12) },
  { id: 'professor', nome: 'Dia do Professor', temaId: 'data-professor', titulo: 'Dia do Professor', subtitulo: 'Ofertas para quem ensina', em: (a) => dia(a, 10, 15) },
  { id: 'pao', nome: 'Dia Mundial do Pão', temaId: 'data-pao', titulo: 'Dia do Pão', subtitulo: 'Quentinho e com preço bom', em: (a) => dia(a, 10, 16) },
  { id: 'halloween', nome: 'Halloween', temaId: 'data-halloween', titulo: 'Ofertas Assustadoras', subtitulo: 'Doces, travessuras e preços de arrepiar', em: (a) => dia(a, 10, 31) },
  { id: 'blackfriday', nome: 'Black Friday', temaId: 'data-blackfriday', titulo: 'Black Friday', subtitulo: 'Os maiores descontos do ano', em: blackFriday },
  { id: 'natal', nome: 'Natal', temaId: 'data-natal', titulo: 'Ofertas de Natal', subtitulo: 'Ceia, presentes e muito mais', em: (a) => dia(a, 12, 25) },
];

export interface ProximaData {
  item: DataComemorativa;
  data: Date;
  /** dias até a data (0 = hoje) */
  dias: number;
}

const inicioDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Todas as datas na ordem em que acontecem a partir de `hoje` (a que já passou este ano vale para o ano seguinte). */
export function proximasDatas(hoje: Date = new Date()): ProximaData[] {
  const h = inicioDoDia(hoje);
  return DATAS.map((item) => {
    let data = item.em(h.getFullYear());
    if (inicioDoDia(data) < h) data = item.em(h.getFullYear() + 1);
    return { item, data, dias: Math.round((inicioDoDia(data).getTime() - h.getTime()) / 86400000) };
  }).sort((a, b) => a.dias - b.dias);
}

export function rotuloDaData(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}
