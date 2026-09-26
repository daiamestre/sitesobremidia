/** Conversões de fuso com Intl (IANA). Nenhuma suposição de que o horário já está em Brasília. */

function partes(instante: Date, fuso: string) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p: Record<string, number> = {};
  for (const x of f.formatToParts(instante)) if (x.type !== 'literal') p[x.type] = Number(x.value);
  return p;
}

/** Diferença (ms) entre o relógio local do fuso e o UTC naquele instante. */
function deslocamento(instante: Date, fuso: string): number {
  const p = partes(instante, fuso);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - instante.getTime();
}

/** Data (YYYY-MM-DD) + hora (HH:MM) locais de um fuso -> ISO UTC. Retorna null se a data/hora for impossível. */
export function localParaUtc(data: string, hora: string, fuso: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  const h = /^(\d{1,2}):(\d{2})$/.exec(hora);
  if (!d || !h) return null;
  const [ano, mes, dia, hh, mm] = [+d[1], +d[2], +d[3], +h[1], +h[2]];
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || hh > 23 || mm > 59) return null;
  const ingenuo = Date.UTC(ano, mes - 1, dia, hh, mm);
  const conferir = new Date(ingenuo);
  if (conferir.getUTCDate() !== dia || conferir.getUTCMonth() !== mes - 1) return null; // 31/02 etc.
  // Duas iterações resolvem as transições de horário de verão.
  let utc = ingenuo - deslocamento(new Date(ingenuo), fuso);
  utc = ingenuo - deslocamento(new Date(utc), fuso);
  return new Date(utc).toISOString();
}

/** Data local (YYYY-MM-DD) de um instante num fuso. */
export function dataNoFuso(instante: Date, fuso: string): string {
  const p = partes(instante, fuso);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}
