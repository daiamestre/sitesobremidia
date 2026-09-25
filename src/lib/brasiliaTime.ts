import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hora oficial dos widgets: SEMPRE Horário de Brasília (America/Sao_Paulo), a partir de um instante UTC corrigido pela
 * hora do servidor (fn_server_now). Nunca o fuso do navegador/aparelho nem o relógio local sem correção.
 */
export const BRASILIA_TZ = 'America/Sao_Paulo';

const partes = (d: Date, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: BRASILIA_TZ, ...opts }).formatToParts(d);
const parte = (ps: Intl.DateTimeFormatPart[], t: Intl.DateTimeFormatPartTypes) => ps.find((p) => p.type === t)?.value ?? '';

/** "14:37:52" / "14:37" em Brasília. */
export function brasiliaTime(d: Date, showSeconds: boolean): string {
  const ps = partes(d, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const hm = `${parte(ps, 'hour')}:${parte(ps, 'minute')}`;
  return showSeconds ? `${hm}:${parte(ps, 'second')}` : hm;
}

/** "SEXTA-FEIRA · 25 DE SETEMBRO DE 2026" em Brasília. */
export function brasiliaDateLong(d: Date): string {
  const ps = partes(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `${parte(ps, 'weekday')} · ${parte(ps, 'day')} de ${parte(ps, 'month')} de ${parte(ps, 'year')}`.toUpperCase();
}

/** "25/09/2026" em Brasília. */
export function brasiliaDateShort(d: Date): string {
  const ps = partes(d, { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${parte(ps, 'day')}/${parte(ps, 'month')}/${parte(ps, 'year')}`;
}

export function brasiliaHour(d: Date): number {
  return Number(parte(partes(d, { hour: '2-digit', hourCycle: 'h23' }), 'hour'));
}

/** Milissegundos até a próxima virada de segundo/minuto (o texto muda exatamente na virada, sem deriva). */
export function msUntilNextTick(epochMs: number, showSeconds: boolean): number {
  const step = showSeconds ? 1000 : 60000;
  const rem = ((epochMs % step) + step) % step;
  return Math.max(1, step - rem);
}

// ------------------------------------------------------------------ relógio corrigido pelo servidor

let offsetMs = 0;
let sincronizado: Promise<void> | null = null;

/** Diferença entre o relógio do servidor e o local (compensando metade da ida-e-volta). Uma vez por sessão. */
export function sincronizarHora(): Promise<void> {
  if (!sincronizado) {
    sincronizado = (async () => {
      try {
        const t0 = Date.now();
        const { data, error } = await supabase.rpc('fn_server_now' as never);
        const t1 = Date.now();
        if (error || !data) return;
        const servidor = new Date(data as unknown as string).getTime();
        if (Number.isFinite(servidor)) offsetMs = servidor - (t0 + (t1 - t0) / 2);
      } catch {
        // sem rede: segue com o relógio local (o fuso continua sendo o de Brasília)
      }
    })();
  }
  return sincronizado;
}

export const agoraCorrigido = () => Date.now() + offsetMs;

/** Instante atual corrigido, atualizado na virada exata de cada segundo (ou minuto). */
export function useBrasiliaClock(showSeconds: boolean): Date {
  const [agora, setAgora] = useState(() => new Date(agoraCorrigido()));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let vivo = true;
    const tick = () => {
      if (!vivo) return;
      const now = agoraCorrigido();
      setAgora(new Date(now));
      timer = setTimeout(tick, msUntilNextTick(now, showSeconds));
    };
    sincronizarHora().then(tick);
    tick();
    return () => { vivo = false; clearTimeout(timer); };
  }, [showSeconds]);
  return agora;
}
