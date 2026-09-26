import type { ConfrontoWiki, JogoOpenfootball, JogoWikiBox, Placar, TabelaWiki } from './tipos.ts';

// ------------------------------------------------------------------ openfootball (JSON, CC0)

/**
 * football.json: { name, matches: [{ round, date, time?, team1, team2, score? }] }.
 * ATENÇÃO (auditoria Gate 1): jogo ainda sem resultado aparece como `score: [0,0]` — NÃO é 0x0.
 * Só há placar quando existe `score.ft`.
 */
export function parseOpenfootball(json: unknown): JogoOpenfootball[] {
  const matches = (json as { matches?: unknown[] })?.matches;
  if (!Array.isArray(matches)) throw new Error('openfootball_formato_invalido');
  const out: JogoOpenfootball[] = [];
  for (const m of matches as Array<Record<string, unknown>>) {
    const data = typeof m.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m.date) ? m.date : null;
    const mandante = typeof m.team1 === 'string' ? m.team1.trim() : '';
    const visitante = typeof m.team2 === 'string' ? m.team2.trim() : '';
    if (!data || !mandante || !visitante) continue;
    const hora = typeof m.time === 'string' && /^\d{1,2}:\d{2}$/.test(m.time) ? m.time.padStart(5, '0') : null;
    const ft = (m.score as { ft?: unknown } | undefined)?.ft;
    const placar = Array.isArray(ft) && ft.length === 2 && ft.every((n) => Number.isInteger(n) && (n as number) >= 0)
      ? [ft[0] as number, ft[1] as number] as Placar : null;
    out.push({ rodada: typeof m.round === 'string' ? m.round : null, data, hora, mandante, visitante, placar });
  }
  return out;
}

// ------------------------------------------------------------------ Wikipédia (wikitext)

/** Texto visível de um wikilink: [[Artigo|Rótulo]] -> Rótulo; [[Artigo]] -> Artigo. */
export function textoDeLink(s: string): string {
  return s.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2').replace(/\[\[([^\]]*)\]\]/g, '$1');
}

/** Primeiro artigo linkado ([[Artigo|...]] -> Artigo). */
function artigoDeLink(s: string): string | null {
  const m = /\[\[([^\]|]+)/.exec(s);
  return m ? m[1].trim() : null;
}

function limpar(s: string): string {
  return textoDeLink(s)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref[\s\S]*?(<\/ref>|\/>)/g, '')
    .replace(/\{\{\s*fbaicon\s*\|[^}]*\}\}/gi, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "2–1", "2-1", "[[Clássico|2–1]]" -> [2,1]. "a", vazio, ou qualquer outra coisa -> null (não disputado ou ilegível). */
export function lerPlacar(valor: string): Placar | null {
  const m = /^(\d{1,2})\s*[–—-]\s*(\d{1,2})$/.exec(limpar(valor));
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** Tabela de confrontos (Module:Sports results / Sports table): name_XXX e match_XXX_YYY. */
export function parseTabelaWiki(wikitext: string): TabelaWiki {
  const times: TabelaWiki['times'] = {};
  for (const m of wikitext.matchAll(/\|\s*name_([A-Z0-9]{2,4})\s*=\s*([^\n]*)/g)) {
    const bruto = m[2].trim();
    const tpl = /\{\{\s*Futebol\s+([^}|]+)\}\}/i.exec(bruto); // pt.wikipedia: {{Futebol Flamengo}}
    const rotulo = tpl ? tpl[1].trim() : limpar(bruto);
    if (rotulo) times[m[1]] = { rotulo, artigo: tpl ? null : artigoDeLink(bruto) };
  }
  const confrontos: ConfrontoWiki[] = [];
  for (const m of wikitext.matchAll(/\|\s*match_([A-Z0-9]{2,4})_([A-Z0-9]{2,4})\s*=([^\n]*)/g)) {
    // O valor termina no fim da linha; um "|" fora de [[...]] começa outro parâmetro.
    const valor = m[3].replace(/\[\[[^\]]*\]\]/g, (l) => l.replace(/\|/g, '\u0001')).split('|')[0].replace(/\u0001/g, '|').trim();
    if (!times[m[1]] || !times[m[2]] || m[1] === m[2]) continue;
    confrontos.push({ mandante: m[1], visitante: m[2], placar: lerPlacar(valor), bruto: valor });
  }
  return { times, confrontos };
}

/** Blocos {{#invoke:Football box|main ...}} (Champions): data, hora (CET/CEST), times, placar, estádio. */
export function parseFootballBoxes(wikitext: string): JogoWikiBox[] {
  const blocos = wikitext.split(/\{\{\s*#invoke:\s*Football box\s*\|\s*main/i).slice(1);
  const out: JogoWikiBox[] = [];
  for (const b of blocos) {
    const campo = (k: string) => { const m = new RegExp('\\n\\s*\\|\\s*' + k + '\\s*=([^\\n]*)').exec(b); return m ? m[1].trim() : ''; };
    const d = /\{\{\s*Start date\s*\|\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})/i.exec(campo('date'));
    if (!d) continue;
    const data = `${d[1]}-${d[2].padStart(2, '0')}-${d[3].padStart(2, '0')}`;
    const h = /^(\d{1,2}):(\d{2})/.exec(limpar(campo('time')));
    const mandante = limpar(campo('team1'));
    const visitante = limpar(campo('team2'));
    if (!mandante || !visitante) continue;
    out.push({ data, hora: h ? `${h[1].padStart(2, '0')}:${h[2]}` : null, mandante, visitante, placar: lerPlacar(campo('score')), estadio: limpar(campo('stadium')).split(',')[0] || null });
  }
  return out;
}
