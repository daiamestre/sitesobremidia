import { limpar, rotuloDoTime } from './fontes.ts';

/**
 * Escudos oficiais (F-86): nome do time gravado nos jogos -> artigo do clube na Wikipédia.
 * É o mesmo vínculo que o Sports Engine usa para reconciliar (nome exibido = `exibicao[código]` ou rótulo da tabela),
 * então o escudo sai do artigo do PRÓPRIO clube, nunca de uma busca por semelhança de nome.
 */
export interface TimeDaFonte {
  rotulo: string;              // nome exibido (igual a content_sports_fixtures.home/away_team_name)
  artigo: string | null;       // artigo do clube, quando o link está no próprio wikitext
  predefinicao: string | null; // pt.wikipedia: {{Futebol Flamengo}} -> expandir pela API para achar o artigo
}

/** Tabela de confrontos (name_XXX). `exibicao`: código -> nome exibido, quando o rótulo da Wikipédia não é o usual. */
export function timesDaTabela(wikitext: string, exibicao: Record<string, string> = {}): TimeDaFonte[] {
  const out: TimeDaFonte[] = [];
  for (const m of wikitext.matchAll(/\|\s*name_([A-Z0-9]{2,4})\s*=\s*([^\n]*)/g)) {
    const bruto = m[2].trim();
    const tpl = /\{\{\s*Futebol\s+([^}|]+)\}\}/i.exec(bruto);
    const rotulo = exibicao[m[1]] ?? (tpl ? tpl[1].trim() : limpar(bruto));
    if (!rotulo) continue;
    out.push({ rotulo, artigo: tpl ? null : primeiroLink(bruto), predefinicao: tpl ? tpl[0] : null });
  }
  return out;
}

/** Blocos Football box (Champions): team1/team2 = "[[Artigo|Rótulo]] {{fbaicon|PAÍS}}". */
export function timesDosBoxes(wikitext: string): TimeDaFonte[] {
  const vistos = new Map<string, TimeDaFonte>();
  for (const b of wikitext.split(/\{\{\s*#invoke:\s*Football box\s*\|\s*main/i).slice(1)) {
    for (const k of ['team1', 'team2']) {
      const m = new RegExp('\\n\\s*\\|\\s*' + k + '\\s*=([^\\n]*)').exec(b);
      if (!m) continue;
      const rotulo = limpar(m[1].trim());
      const artigo = primeiroLink(m[1]);
      if (rotulo && artigo && !vistos.has(rotulo)) vistos.set(rotulo, { rotulo, artigo, predefinicao: null });
    }
  }
  return [...vistos.values()];
}

/** Caixas clássicas (Copa do Brasil, en.wikipedia): team1/team2 = "'''[[Artigo|Rótulo]]'''"; rótulo -> nome de exibição. */
export function timesDasCaixasClassicas(wikitext: string, exibicao: Record<string, string> = {}): TimeDaFonte[] {
  const vistos = new Map<string, TimeDaFonte>();
  for (const b of wikitext.matchAll(/\{\{\s*football\s?box(?:\s+collapsible)?\s*\n([\s\S]*?)\n\}\}/gi)) {
    for (const k of ['team1', 'team2']) {
      const m = new RegExp('(?:^|\\n)\\s*\\|\\s*' + k + '\\s*=([^\\n]*)').exec(b[1]);
      if (!m) continue;
      const r = rotuloDoTime(m[1]);
      const rotulo = exibicao[r] ?? r;
      const artigo = primeiroLink(m[1]);
      if (rotulo && artigo && !vistos.has(rotulo)) vistos.set(rotulo, { rotulo, artigo, predefinicao: null });
    }
  }
  return [...vistos.values()];
}

function primeiroLink(s: string): string | null {
  const m = /\[\[([^\]|#]+)/.exec(s);
  return m ? m[1].trim() : null;
}

/** Caminho da cópia no Storage: nome legível + sha1 do arquivo de origem (troca de escudo = arquivo novo, sem cache velho). */
export function caminhoEscudo(nome: string, sha1: string): string {
  const base = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${base || 'time'}-${sha1.slice(0, 10)}.png`;
}
