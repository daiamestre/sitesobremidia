/**
 * P-34 (pedido do dono, 16/11/2026): o PAINEL DE IMPACTO do vídeo de ofertas — trilha sonora, efeitos sonoros (sirene,
 * whoosh, impacto), efeitos visuais (chamas, estrelas, câmera na mão, explosão no preço) e a abertura/fechamento com a logo.
 * Tudo já vem LIGADO (o vídeo sai pronto, como no concorrente que gera vídeos com IA); o cliente só desliga ou troca.
 */
import { useEffect, useRef, useState } from 'react';
import { Flame, Music2, Pause, Play, Sparkles, Volume2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SONS, TRILHAS, impactoResolvido, type ImpactoDoPalco, type SomDeImpacto } from '@/lib/studio/impacto';
import { CAMPANHAS_DE_IMPACTO, mesAtual } from '@/lib/studio/logo3d';
import type { SegmentoDoStudio } from '@/lib/studio/palco';

const VISUAIS: Array<{ k: 'chamas' | 'estrelas' | 'camera' | 'explosao'; nome: string }> = [
  { k: 'chamas', nome: 'Chamas' }, { k: 'estrelas', nome: 'Estrelas' }, { k: 'camera', nome: 'Câmera na mão' }, { k: 'explosao', nome: 'Explosão no preço' },
];

function Chave({ ligado, aoMudar, rotulo, testid }: { ligado: boolean; aoMudar: (v: boolean) => void; rotulo: string; testid: string }) {
  return (
    <button type="button" role="switch" aria-checked={ligado} aria-label={rotulo} onClick={() => aoMudar(!ligado)} data-testid={testid}
      className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', ligado ? 'bg-[#25D366]' : 'bg-white/20')}>
      <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all', ligado ? 'left-[22px]' : 'left-0.5')} />
    </button>
  );
}

export function PainelDeImpacto({ impacto, segmento, loja, aoMudar, compacto = false }: { impacto: ImpactoDoPalco | undefined; segmento: SegmentoDoStudio; loja: string; /** recebe só o que mudou (a tela soma ao que já está guardado: toques seguidos não se perdem) */ aoMudar: (mudou: Partial<ImpactoDoPalco>) => void; compacto?: boolean }) {
  const i = impactoResolvido(impacto, segmento, loja);
  const mudar = (p: Partial<ImpactoDoPalco>) => aoMudar(p);
  // ouvir uma trilha ou um efeito antes de escolher (um de cada vez)
  const tocador = useRef<HTMLAudioElement | null>(null);
  const [ouvindo, setOuvindo] = useState<string | null>(null);
  useEffect(() => () => { tocador.current?.pause(); }, []);
  const ouvir = (id: string, src: string) => {
    tocador.current?.pause();
    if (ouvindo === id) { setOuvindo(null); return; }
    const a = new Audio(src);
    a.volume = 0.8;
    a.onended = () => setOuvindo(null);
    tocador.current = a;
    void a.play().then(() => setOuvindo(id)).catch(() => setOuvindo(null));
  };

  return (
    <div className="space-y-3" data-testid="painel-impacto">
      <div className="flex items-center gap-3 rounded-xl border border-[#FFD400]/40 bg-[#FFD400]/10 p-2.5">
        <Zap className="h-5 w-5 shrink-0 text-[#FFD400]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white">Vídeo com impacto</p>
          <p className="text-[11px] leading-snug text-slate-300">Trilha, sirene, efeitos de fogo e estrelas, preço que estoura, abertura e fechamento com a sua logo.</p>
        </div>
        <Chave ligado={i.ligado} aoMudar={(v) => mudar({ desligado: !v })} rotulo="Vídeo com impacto" testid="impacto-ligado" />
      </div>

      {i.ligado && (
        <>
          {/* TRILHA SONORA */}
          <section className="space-y-2" aria-label="Trilha sonora">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#B04DFF]"><Music2 className="h-3.5 w-3.5" />Trilha sonora</p>
            <div className={cn('grid gap-1.5', compacto ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2')} role="radiogroup" aria-label="Escolha a trilha">
              {TRILHAS.map((t) => {
                const sel = i.trilha?.id === t.id;
                return (
                  <div key={t.id} className={cn('flex items-center gap-2 rounded-lg border p-1.5', sel ? 'border-[#25D366] bg-[#25D366]/10' : 'border-white/10')}>
                    <button type="button" onClick={() => ouvir(t.id, t.src)} aria-label={ouvindo === t.id ? `Parar ${t.nome}` : `Ouvir ${t.nome}`} data-testid={`impacto-ouvir-${t.id}`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
                      {ouvindo === t.id ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
                    </button>
                    <button type="button" role="radio" aria-checked={sel} onClick={() => mudar({ trilha: t.id })} className="min-w-0 flex-1 text-left" data-testid={`impacto-trilha-${t.id}`}>
                      <span className="block truncate text-xs font-bold text-white">{t.nome}</span>
                      <span className="block truncate text-[10px] text-slate-400">{t.estilo}</span>
                    </button>
                  </div>
                );
              })}
              <button type="button" role="radio" aria-checked={!i.trilha} onClick={() => mudar({ trilha: null })} data-testid="impacto-sem-trilha"
                className={cn('h-10 rounded-lg border px-2 text-xs font-semibold', !i.trilha ? 'border-[#25D366] bg-[#25D366]/10 text-[#7dffb0]' : 'border-white/10 text-slate-300')}>Sem trilha</button>
            </div>
            {i.trilha && (
              <label className="flex items-center gap-2 text-[11px] text-slate-300">
                <Volume2 className="h-4 w-4 shrink-0" />Volume
                <input type="range" min={0} max={100} value={Math.round(i.volumeTrilha * 100)} onChange={(e) => mudar({ volumeTrilha: Number(e.target.value) / 100 })} className="min-w-0 flex-1 accent-[#25D366]" data-testid="impacto-volume" />
                <span className="w-9 text-right">{Math.round(i.volumeTrilha * 100)}%</span>
              </label>
            )}
            <p className="text-[10px] text-slate-500">Com locução, a trilha abaixa sozinha enquanto o locutor fala.</p>
          </section>

          {/* EFEITOS SONOROS */}
          <section className="space-y-2" aria-label="Efeitos sonoros">
            <div className="flex items-center gap-2">
              <p className="flex flex-1 items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#B04DFF]"><Volume2 className="h-3.5 w-3.5" />Efeitos sonoros</p>
              <Chave ligado={i.sons} aoMudar={(v) => mudar({ sons: v })} rotulo="Efeitos sonoros" testid="impacto-sons" />
            </div>
            {i.sons && (
              <div className="flex flex-wrap gap-1.5">
                {(['sirene', 'whoosh', 'impacto', 'brilho', 'caixa'] as SomDeImpacto[]).map((k) => (
                  <button key={k} type="button" onClick={() => ouvir(k, SONS[k].src)} data-testid={`impacto-ouvir-som-${k}`}
                    className="flex h-8 items-center gap-1 rounded-lg border border-white/10 px-2 text-[11px] text-slate-200 hover:bg-white/5">
                    {ouvindo === k ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}{SONS[k].nome}
                  </button>
                ))}
                <label className="flex h-8 items-center gap-1.5 rounded-lg border border-white/10 px-2 text-[11px] text-slate-200">
                  <input type="checkbox" checked={i.sirene} onChange={(e) => mudar({ sirene: e.target.checked })} className="accent-[#25D366]" data-testid="impacto-sirene" />Sirene na abertura
                </label>
              </div>
            )}
          </section>

          {/* EFEITOS VISUAIS */}
          <section className="space-y-2" aria-label="Efeitos visuais">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#B04DFF]"><Flame className="h-3.5 w-3.5" />Efeitos visuais</p>
            <div className="flex flex-wrap gap-1.5">
              {VISUAIS.map((v) => (
                <button key={v.k} type="button" aria-pressed={i[v.k]} onClick={() => mudar({ [v.k]: !i[v.k] })} data-testid={`impacto-visual-${v.k}`}
                  className={cn('min-h-8 rounded-lg border px-2.5 py-1 text-xs font-semibold', i[v.k] ? 'border-[#FFD400] bg-[#FFD400]/15 text-[#FFD400]' : 'border-white/10 text-slate-300')}>{v.nome}</button>
              ))}
            </div>
          </section>

          {/* ABERTURA E FECHAMENTO */}
          <section className="space-y-2" aria-label="Abertura e fechamento">
            <div className="flex items-center gap-2">
              <p className="flex flex-1 items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#B04DFF]"><Sparkles className="h-3.5 w-3.5" />Abertura e fechamento</p>
              <Chave ligado={i.vinhetas} aoMudar={(v) => mudar({ vinhetas: v })} rotulo="Abertura e fechamento" testid="impacto-vinhetas" />
            </div>
            {/* F-317: a LOGO 3D DA CAMPANHA — cai do céu, bate no centro quebrando a parede e fica pegando fogo */}
            {i.vinhetas && (
              <div className="space-y-2 rounded-lg border border-[#FFD400]/30 bg-[#FFD400]/5 p-2" data-testid="impacto-campanha">
                <label className="block text-[11px] text-slate-300">Logo 3D da campanha
                  <select value={impacto?.campanha === null ? '' : (impacto?.campanha ?? 'fecha-mes')} onChange={(e) => mudar({ campanha: e.target.value || null })} data-testid="impacto-campanha-escolha"
                    className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#0f0428] px-2 text-sm font-semibold text-white focus:border-[#B04DFF] focus:outline-none">
                    {CAMPANHAS_DE_IMPACTO.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    <option value="">Sem logo de campanha</option>
                  </select>
                </label>
                {i.campanha && (
                  <>
                    <label className="block text-[11px] text-slate-300">{i.campanha.id === 'fecha-mes' ? 'Mês (vazio = o mês de agora)' : 'Complemento (opcional: data, "SÓ SÁBADO", "DIA 31")'}
                      <input value={impacto?.complemento ?? ''} maxLength={22} placeholder={i.campanha.id === 'fecha-mes' ? mesAtual() : 'SÓ NESTE SÁBADO'} onChange={(e) => mudar({ complemento: e.target.value })} data-testid="impacto-complemento"
                        className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-2 text-sm font-bold uppercase text-white placeholder:text-slate-500 focus:border-[#B04DFF] focus:outline-none" />
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {([['queda', 'Logo caindo e quebrando'], ['fogoNaLogo', 'Fogo na logo']] as const).map(([k, nome]) => (
                        <button key={k} type="button" aria-pressed={i[k]} onClick={() => mudar({ [k]: !i[k] })} data-testid={`impacto-${k}`}
                          className={cn('min-h-8 rounded-lg border px-2.5 py-1 text-xs font-semibold', i[k] ? 'border-[#FFD400] bg-[#FFD400]/15 text-[#FFD400]' : 'border-white/10 text-slate-300')}>{nome}</button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            {i.vinhetas && (
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-[11px] text-slate-300">Frase da abertura
                  <textarea rows={2} maxLength={60} value={impacto?.textoAbertura ?? ''} placeholder={i.textoAbertura} onChange={(e) => mudar({ textoAbertura: e.target.value })} data-testid="impacto-texto-abertura"
                    className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm font-bold uppercase text-white placeholder:text-slate-500 focus:border-[#B04DFF] focus:outline-none" />
                </label>
                <label className="block text-[11px] text-slate-300">Frase do fechamento
                  <textarea rows={2} maxLength={60} value={impacto?.textoFechamento ?? ''} placeholder={i.textoFechamento} onChange={(e) => mudar({ textoFechamento: e.target.value })} data-testid="impacto-texto-fechamento"
                    className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm font-bold uppercase text-white placeholder:text-slate-500 focus:border-[#B04DFF] focus:outline-none" />
                </label>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
