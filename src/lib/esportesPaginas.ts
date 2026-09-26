/**
 * Widget Esportes v2 (F-86) — regra de exibição pedida pelo proprietário, igual no painel, no Player web e no Android
 * (native-android-player/.../widget/EsportesPaginas.kt):
 *  - separado por campeonato, na ordem do cadastro (Brasileirão, Premier League, La Liga, Champions);
 *  - resultados dos 3 dias anteriores (D-3..D-1) e próximos jogos de hoje até D+2, horário de Brasília;
 *  - cada página: até 3 resultados + até 3 próximos jogos daquele campeonato, em ordem de data e horário;
 *  - cada exibição do widget mostra 3 páginas de 8 s; a próxima exibição continua de onde parou (no mesmo dia), até
 *    passar por todos os jogos, e então recomeça.
 */
export interface JogoJanela {
  competicao: string;
  codigo: string;
  slug: string;
  ordemCompeticao?: number;
  rodada?: string | null;
  mandante: string;
  visitante: string;
  placarMandante: number | null;
  placarVisitante: number | null;
  status: string;
  data: string;               // YYYY-MM-DD (Brasília)
  hora: string | null;        // HH:MM (Brasília) ou null = a definir
  kickoffUtc: string | null;
  escudoMandante?: string | null;
  escudoVisitante?: string | null;
}

export interface CompeticaoJanela { slug: string; nome: string; ordem?: number }

export interface PaginaEsportes {
  slug: string;
  competicao: string;
  resultados: JogoJanela[];
  proximos: JogoJanela[];
  parte: number;   // 1..partes dentro do campeonato
  partes: number;
}

export interface CursorEsportes { dia: string; proxima: number }

export const JOGOS_POR_BLOCO = 3;
export const SEGUNDOS_POR_PAGINA = 8;
export const PAGINAS_POR_EXIBICAO = 3;
/** Duração do item na playlist: 3 páginas x 8 s. */
export const DURACAO_WIDGET_ESPORTES = SEGUNDOS_POR_PAGINA * PAGINAS_POR_EXIBICAO;

const TRES_HORAS_MS = 3 * 3600 * 1000; // Brasília = UTC-3 o ano todo (sem horário de verão desde 2019)

export function diaEmBrasilia(ms: number): string {
  return new Date((Number.isFinite(ms) ? ms : Date.now()) - TRES_HORAS_MS).toISOString().slice(0, 10);
}

/** Nunca lança erro (um widget não pode derrubar a tela): data inválida volta como veio. */
export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return dia;
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function instante(j: JogoJanela): number {
  const k = j.kickoffUtc ? Date.parse(j.kickoffUtc) : NaN;
  return Number.isNaN(k) ? Date.parse(`${j.data}T23:59:00-03:00`) : k;
}

const INATIVO = new Set(['CANCELLED', 'POSTPONED']);

/** Resultados (D-3..D-1, com placar) e próximos jogos (hoje..D+2, ainda não começados) de cada campeonato, em páginas. */
export function montarPaginas(janela: JogoJanela[], competicoes: CompeticaoJanela[], agoraMs: number): PaginaEsportes[] {
  const hoje = diaEmBrasilia(agoraMs);
  const inicio = somarDias(hoje, -3);
  const ontem = somarDias(hoje, -1);
  const fim = somarDias(hoje, 2);

  const resultados = janela
    .filter((j) => j.status === 'FINISHED' && j.placarMandante !== null && j.placarVisitante !== null && j.data >= inicio && j.data <= ontem)
    .sort((a, b) => instante(a) - instante(b));
  const proximos = janela
    .filter((j) => !INATIVO.has(j.status) && j.data >= hoje && j.data <= fim
      && (j.kickoffUtc ? Date.parse(j.kickoffUtc) > agoraMs : j.status === 'SCHEDULED'))
    .sort((a, b) => instante(a) - instante(b));

  // Ordem dos campeonatos: a do cadastro; campeonato que só aparece nos jogos vai para o fim.
  const ordem = [...competicoes].sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99)).map((c) => c.slug);
  for (const j of [...resultados, ...proximos]) if (!ordem.includes(j.slug)) ordem.push(j.slug);
  const nomeDe = (slug: string) => competicoes.find((c) => c.slug === slug)?.nome
    ?? [...resultados, ...proximos].find((j) => j.slug === slug)?.competicao ?? slug;

  const paginas: PaginaEsportes[] = [];
  for (const slug of ordem) {
    const r = resultados.filter((j) => j.slug === slug);
    const p = proximos.filter((j) => j.slug === slug);
    const partes = Math.max(Math.ceil(r.length / JOGOS_POR_BLOCO), Math.ceil(p.length / JOGOS_POR_BLOCO));
    for (let k = 0; k < partes; k++) {
      paginas.push({
        slug, competicao: nomeDe(slug), parte: k + 1, partes,
        resultados: r.slice(k * JOGOS_POR_BLOCO, (k + 1) * JOGOS_POR_BLOCO),
        proximos: p.slice(k * JOGOS_POR_BLOCO, (k + 1) * JOGOS_POR_BLOCO),
      });
    }
  }
  return paginas;
}

/** Páginas desta exibição: continua do cursor (mesmo dia) e dá a volta no fim; sem páginas, nada. */
export function paginasDaExibicao(total: number, cursor: CursorEsportes | null, hoje: string, quantas = PAGINAS_POR_EXIBICAO): number[] {
  if (total <= 0) return [];
  const inicio = cursor && cursor.dia === hoje && cursor.proxima >= 0 && cursor.proxima < total ? cursor.proxima : 0;
  return Array.from({ length: quantas }, (_, i) => (inicio + i) % total);
}

/** Cursor depois de mostrar a página `indice`: a próxima exibição começa na seguinte. */
export function cursorDepois(indice: number, total: number, hoje: string): CursorEsportes {
  return { dia: hoje, proxima: total > 0 ? (indice + 1) % total : 0 };
}

const DIAS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

/** "QUA 23/09" (a data já está em Brasília). */
export function diaDaSemana(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? dia : `${DIAS[d.getUTCDay()]} ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

/** "HOJE", "AMANHÃ", "ONTEM" ou "QUA 23/09". */
export function rotuloDia(dia: string, hoje: string): string {
  if (dia === hoje) return 'HOJE';
  if (dia === somarDias(hoje, 1)) return 'AMANHÃ';
  if (dia === somarDias(hoje, -1)) return 'ONTEM';
  return diaDaSemana(dia);
}

/** Iniciais para o selo de reserva quando o time ainda não tem escudo conferido (nunca um escudo de outro time). */
export function iniciaisDoTime(nome: string): string {
  const partes = nome.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  if (partes.length === 1) return partes[0].slice(0, 3).toUpperCase();
  return partes.slice(0, 3).map((p) => p[0]).join('').toUpperCase();
}
