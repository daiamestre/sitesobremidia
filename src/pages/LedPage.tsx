/**
 * P-31 / F-281 — MODO LED (Fase 1): o SOBRE MÍDIA num COMPUTADOR ligado ao processador de vídeo de um telão de LED
 * (Novastar, Colorlight, Linsn, Huidu… — controladora síncrona: a placa lê um pedaço da saída HDMI/DVI do PC).
 * Cada PAINEL é o player da tela (o mesmo de /player/:screenId) desenhado no tamanho e na posição EXATOS, em pixels, que a
 * placa lê; o resto da saída fica preto. Vários painéis na mesma página (um PC com várias saídas ou um videowall) e a mesma
 * tela em vários painéis = a mesma mídia em vários telões.
 * Uso: abrir /led no Chrome do PC (de preferência em modo quiosque: chrome --kiosk https://…/led), configurar e "Iniciar".
 * Atalho: /led?paineis=CODIGO@0,0,448,256;CODIGO2@448,0,448,256 já inicia.
 * Não mexe no Player Android nem no contrato do Player 5.7.10: cada painel usa o player web de sempre.
 */
import { useEffect, useMemo, useState } from 'react';
import { MonitorPlay, Plus, Trash2, Maximize } from 'lucide-react';

export interface PainelLed { tela: string; x: number; y: number; w: number; h: number }
const CHAVE = 'sobremidia-led-paineis';

/** "CODIGO@x,y,w,h;CODIGO2@x,y,w,h" → painéis (inválidos ficam de fora). */
export function lerPaineis(texto: string): PainelLed[] {
  return texto.split(';').map((p) => p.trim()).filter(Boolean).map((p) => {
    const [tela, caixa = ''] = p.split('@');
    const [x, y, w, h] = caixa.split(',').map((n) => Math.round(Number(n)));
    return { tela: (tela ?? '').trim(), x, y, w, h };
  }).filter((p) => p.tela && [p.x, p.y, p.w, p.h].every((n) => Number.isFinite(n) && n >= 0) && p.w >= 16 && p.h >= 16);
}
export const escreverPaineis = (ps: PainelLed[]) => ps.map((p) => `${p.tela}@${p.x},${p.y},${p.w},${p.h}`).join(';');

const lerGuardados = (): PainelLed[] => { try { return lerPaineis(localStorage.getItem(CHAVE) ?? ''); } catch { return []; } };

export default function LedPage() {
  const doLink = useMemo(() => lerPaineis(new URLSearchParams(window.location.search).get('paineis') ?? ''), []);
  const [paineis, setPaineis] = useState<PainelLed[]>(() => (doLink.length ? doLink : lerGuardados().length ? lerGuardados() : [{ tela: '', x: 0, y: 0, w: 448, h: 256 }]));
  const [tocando, setTocando] = useState(doLink.length > 0);
  useEffect(() => { try { localStorage.setItem(CHAVE, escreverPaineis(paineis)); } catch { /* sem armazenamento */ } }, [paineis]);
  useEffect(() => {
    if (!tocando) return;
    document.body.style.background = '#000';
    document.body.style.cursor = 'none';
    return () => { document.body.style.cursor = ''; };
  }, [tocando]);

  if (tocando) {
    return (
      <div className="fixed inset-0 overflow-hidden bg-black" data-testid="led-tocando" onDoubleClick={() => setTocando(false)}>
        {paineis.map((p, i) => (
          <iframe key={`${i}-${p.tela}`} title={`Painel ${i + 1}`} src={`/player/${encodeURIComponent(p.tela)}`} allow="autoplay; fullscreen"
            style={{ position: 'absolute', left: p.x, top: p.y, width: p.w, height: p.h, border: 0, background: '#000' }} />
        ))}
      </div>
    );
  }

  const mudar = (i: number, x: Partial<PainelLed>) => setPaineis((a) => a.map((p, k) => (k === i ? { ...p, ...x } : p)));
  const validos = paineis.filter((p) => p.tela.trim() && p.w >= 16 && p.h >= 16);
  const campo = 'h-9 w-full rounded-md border border-white/15 bg-black/30 px-2 text-sm text-white';
  return (
    <div className="min-h-dvh bg-[#0b0420] p-4 text-white" data-testid="led-config">
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="flex items-center gap-2 text-xl font-black"><MonitorPlay className="h-6 w-6 text-[#FFD400]" />SOBRE MÍDIA – Telão de LED</h1>
        <p className="text-sm text-slate-300">
          Ligue a saída HDMI/DVI deste computador no processador de vídeo do telão (Novastar, Colorlight, Linsn, Huidu…). Para cada painel,
          informe o código da tela (o mesmo do painel SOBRE MÍDIA) e a área, em pixels, que a placa lê da saída do computador. A mesma tela pode
          ir para vários painéis: a mesma mídia em vários telões.
        </p>
        <div className="space-y-2">
          {paineis.map((p, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-white/5 p-2 sm:grid-cols-[2fr_repeat(4,1fr)_auto]" data-testid="led-painel">
              <label className="col-span-2 text-[11px] font-semibold text-slate-300 sm:col-span-1">Código da tela<input className={campo} value={p.tela} onChange={(e) => mudar(i, { tela: e.target.value.trim() })} placeholder="ex.: TELA-1234" /></label>
              {(['x', 'y', 'w', 'h'] as const).map((k) => (
                <label key={k} className="text-[11px] font-semibold text-slate-300">{{ x: 'Posição X', y: 'Posição Y', w: 'Largura', h: 'Altura' }[k]}
                  <input className={campo} inputMode="numeric" value={p[k]} onChange={(e) => mudar(i, { [k]: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                </label>
              ))}
              <button type="button" onClick={() => setPaineis((a) => a.filter((_, k) => k !== i))} disabled={paineis.length === 1} className="self-end rounded-md p-2 text-rose-300 hover:bg-rose-500/15 disabled:opacity-30" aria-label="Tirar painel"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setPaineis((a) => [...a, { ...a[a.length - 1], x: a[a.length - 1].x + a[a.length - 1].w }])} className="flex items-center gap-1 rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/5"><Plus className="h-4 w-4" />Outro painel</button>
          <button type="button" disabled={!validos.length} onClick={() => { setPaineis(validos); setTocando(true); void document.documentElement.requestFullscreen?.().catch(() => undefined); }}
            className="flex items-center gap-1 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-bold text-[#0b2a17] disabled:opacity-40" data-testid="led-iniciar"><Maximize className="h-4 w-4" />Iniciar em tela cheia</button>
        </div>
        <p className="text-xs text-slate-400">
          Dica: deixe o Chrome abrindo sozinho com <code className="rounded bg-black/40 px-1">chrome --kiosk {window.location.origin}/led?paineis={escreverPaineis(validos) || 'CODIGO@0,0,448,256'}</code>.
          Dois cliques na tela voltam para esta configuração.
        </p>
      </div>
    </div>
  );
}
