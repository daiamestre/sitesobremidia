/**
 * F-300 (pedido do dono, 11/11/2026) — LOCUÇÃO no vídeo do palco, como no concorrente (e melhor):
 * - a pessoa escolhe SE quer áudio (interruptor), escreve o NOME DA LOJA e escolhe uma das 5 VOZES (ouve antes, de graça);
 * - o AGENTE LOCUTOR monta o roteiro com o que já está no sistema (loja + produtos e preços por extenso) — dá para
 *   reescrever qualquer frase; "Gerar áudio" fala tudo (só as frases novas gastam crédito; as já faladas voltam guardadas);
 * - pronto: as falas entram na linha do tempo, cada produto fica no ar o tempo da fala dele, e saem no MP4.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Mic, Pause, Play, RotateCcw, Store, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { VOZES_DO_LOCUTOR, letrasDoRoteiro, roteiroDaLocucao, vozPadraoDo, type IdDaVoz, type ProdutoDaLocucao } from '@/lib/studio/locucao';
import type { FalaGravada, LocucaoDoVideo, SegmentoDoStudio } from '@/lib/studio/palco';

interface Estado {
  ativa: boolean; voz: IdDaVoz; textos: Record<string, string>;
  /** o que já foi falado: por chave, com a voz e o texto daquele áudio (mudou o texto → precisa falar de novo) */
  falas: Record<string, FalaGravada & { voz: IdDaVoz; texto: string }>;
}
const CHAVE_LOJA = 'studio-locucao-loja';
const ler = <T,>(k: string, padrao: T): T => { try { const v = localStorage.getItem(k); return v ? { ...padrao, ...JSON.parse(v) } : padrao; } catch { return padrao; } };

function duracaoDo(url: string): Promise<number> {
  return new Promise((ok) => {
    const a = new Audio();
    a.preload = 'metadata'; a.crossOrigin = 'anonymous';
    const fim = (d: number) => { a.onloadedmetadata = null; a.onerror = null; ok(d); };
    a.onloadedmetadata = () => fim(Number.isFinite(a.duration) ? a.duration : 3);
    a.onerror = () => fim(3);
    a.src = url;
  });
}

export function PainelDeLocucao({ segmento, produtos, aoMudar }: { segmento: SegmentoDoStudio; produtos: ProdutoDaLocucao[]; aoMudar: (l: LocucaoDoVideo | null) => void }) {
  const chave = `studio-locucao-${segmento}`;
  const [loja, setLoja] = useState(() => { try { return localStorage.getItem(CHAVE_LOJA) ?? ''; } catch { return ''; } });
  const [e, setE] = useState<Estado>(() => ler(chave, { ativa: false, voz: vozPadraoDo(segmento), textos: {}, falas: {} }));
  const [gerando, setGerando] = useState(false);
  const [tocando, setTocando] = useState<string | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  useEffect(() => { try { localStorage.setItem(chave, JSON.stringify(e)); } catch { /* sem armazenamento */ } }, [chave, e]);
  useEffect(() => { try { localStorage.setItem(CHAVE_LOJA, loja); } catch { /* sem armazenamento */ } }, [loja]);
  useEffect(() => () => player.current?.pause(), []);

  const roteiro = useMemo(() => roteiroDaLocucao({ segmento, loja, produtos, textos: e.textos }), [segmento, loja, produtos, e.textos]);
  const pronta = (k: string, texto: string) => { const f = e.falas[k]; return f && f.voz === e.voz && f.texto === texto ? f : null; };
  const faltam = roteiro.filter((f) => !pronta(f.chave, f.texto));
  const letras = letrasDoRoteiro(faltam);

  // o que vai para o vídeo: só as falas prontas com a voz e o texto de agora
  useEffect(() => {
    if (!e.ativa) { aoMudar(null); return; }
    const ofertas: LocucaoDoVideo['ofertas'] = {};
    let abertura: FalaGravada | null = null, fechamento: FalaGravada | null = null;
    for (const f of roteiro) {
      const g = pronta(f.chave, f.texto);
      if (!g) continue;
      if (f.tipo === 'abertura') abertura = { url: g.url, dur: g.dur };
      else if (f.tipo === 'fechamento') fechamento = { url: g.url, dur: g.dur };
      else ofertas[f.chave] = { url: g.url, dur: g.dur };
    }
    aoMudar(abertura || fechamento || Object.keys(ofertas).length ? { abertura, fechamento, ofertas } : null);
  }, [e.ativa, e.voz, e.falas, roteiro]); // eslint-disable-line react-hooks/exhaustive-deps

  const ouvir = (id: string, url: string) => {
    player.current?.pause();
    if (tocando === id) { setTocando(null); return; }
    const a = new Audio(url);
    player.current = a; setTocando(id);
    a.onended = () => setTocando(null);
    void a.play().catch(() => setTocando(null));
  };
  /** ouve a locução inteira, na ordem do roteiro */
  const ouvirTudo = async () => {
    if (tocando === 'tudo') { player.current?.pause(); setTocando(null); return; }
    setTocando('tudo');
    for (const f of roteiro) {
      const g = pronta(f.chave, f.texto);
      if (!g) continue;
      const a = new Audio(g.url);
      player.current = a;
      const acabou = new Promise<void>((ok) => { a.onended = () => ok(); a.onpause = () => ok(); });
      await a.play().catch(() => undefined);
      await acabou;
      if (player.current !== a || a.currentTime < a.duration - 0.05) break;
    }
    setTocando(null);
  };

  const gerar = async () => {
    if (!produtos.length) { toast.error('Coloque produtos com preço no palco.'); return; }
    if (!faltam.length) { toast.success('A locução já está pronta.'); return; }
    setGerando(true);
    try {
      const { data, error } = await supabase.functions.invoke('studio-locucao', { body: { acao: 'falar', voz: e.voz, frases: faltam.map((f) => ({ chave: f.chave, texto: f.texto })) } });
      const resp = data as { frases?: Array<{ chave: string; url: string; nova: boolean }>; error?: string } | null;
      if (error || !resp?.frases) {
        let msg = resp?.error ?? 'Não foi possível gerar a locução.';
        try { const ctx = (error as { context?: Response } | null)?.context; if (ctx) msg = (await ctx.json()).error ?? msg; } catch { /* sem detalhe */ }
        throw new Error(msg);
      }
      const novas: Estado['falas'] = {};
      await Promise.all(resp.frases.map(async (r) => {
        const f = faltam.find((x) => x.chave === r.chave);
        if (f) novas[r.chave] = { url: r.url, dur: await duracaoDo(r.url), voz: e.voz, texto: f.texto };
      }));
      setE((x) => ({ ...x, falas: { ...x.falas, ...novas } }));
      const quantasNovas = resp.frases.filter((r) => r.nova).length;
      toast.success(`Locução pronta: ${resp.frases.length} frase(s)${quantasNovas < resp.frases.length ? ` · ${resp.frases.length - quantasNovas} já estavam guardadas` : ''}. Toque em Tocar para ver o vídeo com voz.`);
    } catch (err) { toast.error((err as Error).message); } finally { setGerando(false); }
  };

  return (
    <section className="min-w-0 space-y-2.5 rounded-xl border border-white/10 bg-[#1a0838] p-2.5 sm:p-3" data-testid="palco-locucao">
      <div className="flex items-center gap-2">
        <Mic className="h-4 w-4 shrink-0 text-[#B04DFF]" />
        <h2 className="min-w-0 flex-1 text-[13px] font-bold leading-tight text-white sm:text-sm">Locução no vídeo</h2>
        <button type="button" role="switch" aria-checked={e.ativa} onClick={() => setE((x) => ({ ...x, ativa: !x.ativa }))} aria-label="Adicionar locução ao vídeo"
          className={cn('relative h-6 w-11 shrink-0 rounded-full transition', e.ativa ? 'bg-[#25D366]' : 'bg-white/15')} data-testid="locucao-ativa">
          <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all', e.ativa ? 'left-[22px]' : 'left-0.5')} />
        </button>
      </div>
      {!e.ativa ? <p className="text-[11px] leading-snug text-slate-400">Ligue para um locutor falar a sua loja, os produtos e os preços no vídeo.</p> : (
        <>
          <label className="block text-xs text-slate-300">
            <span className="flex items-center gap-1"><Store className="h-3.5 w-3.5" />Nome da loja</span>
            <input value={loja} onChange={(ev) => setLoja(ev.target.value.slice(0, 60))} placeholder="Ex.: Mercadinho Economia" data-testid="locucao-loja"
              className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-2 text-sm text-white focus:border-[#B04DFF] focus:outline-none" />
          </label>

          <div className="space-y-1.5" role="radiogroup" aria-label="Voz do locutor">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Voz</p>
            {VOZES_DO_LOCUTOR.map((v) => (
              <div key={v.id} className={cn('flex items-center gap-2 rounded-lg border p-1.5', e.voz === v.id ? 'border-[#FFD400] bg-[#FFD400]/10' : 'border-white/10')}>
                <button type="button" onClick={() => ouvir(v.id, v.amostra)} aria-label={`Ouvir a voz ${v.nome}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
                  {tocando === v.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <button type="button" role="radio" aria-checked={e.voz === v.id} onClick={() => setE((x) => ({ ...x, voz: v.id }))} className="min-w-0 flex-1 text-left" data-testid={`locucao-voz-${v.id}`}>
                  <span className="block truncate text-xs font-bold text-white">{v.nome}</span>
                  <span className="block truncate text-[10px] text-slate-400">{v.descricao}</span>
                </button>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400"><Wand2 className="h-3.5 w-3.5" />O que o locutor vai falar</p>
            {roteiro.map((f) => {
              const ok = !!pronta(f.chave, f.texto);
              return (
                <div key={f.chave} className="relative">
                  <textarea value={f.texto} rows={2} onChange={(ev) => setE((x) => ({ ...x, textos: { ...x.textos, [f.chave]: ev.target.value.slice(0, 300) } }))}
                    aria-label={f.tipo === 'oferta' ? `Frase de ${f.produto}` : f.tipo === 'abertura' ? 'Abertura' : 'Fechamento'}
                    className={cn('w-full resize-none rounded-lg border bg-black/30 px-2 py-1.5 pr-7 text-xs leading-snug text-white focus:border-[#B04DFF] focus:outline-none', ok ? 'border-[#25D366]/40' : 'border-white/10')} />
                  {e.textos[f.chave] && <button type="button" onClick={() => setE((x) => { const t = { ...x.textos }; delete t[f.chave]; return { ...x, textos: t }; })} title="Voltar ao texto automático" aria-label="Voltar ao texto automático" className="absolute right-1 top-1 rounded p-1 text-slate-400 hover:text-white"><RotateCcw className="h-3.5 w-3.5" /></button>}
                </div>
              );
            })}
          </div>

          <button type="button" onClick={() => void gerar()} disabled={gerando || !produtos.length} data-testid="locucao-gerar"
            className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-[#FFD400] px-2 py-2 text-sm font-black text-[#22004A] transition hover:brightness-105 disabled:opacity-60">
            {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
            {gerando ? 'Gerando a voz…' : faltam.length ? 'Gerar áudio' : 'Locução pronta'}
          </button>
          <p className="text-center text-[10px] leading-snug text-slate-500">{faltam.length ? `${faltam.length} frase(s) para falar · ${letras} letras` : 'Todas as frases estão faladas e guardadas.'}</p>
          {roteiro.some((f) => pronta(f.chave, f.texto)) && (
            <button type="button" onClick={() => void ouvirTudo()} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-white/15 text-xs font-semibold text-white hover:bg-white/5" data-testid="locucao-ouvir-tudo">
              {tocando === 'tudo' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{tocando === 'tudo' ? 'Parar' : 'Ouvir a locução'}
            </button>
          )}
        </>
      )}
    </section>
  );
}
