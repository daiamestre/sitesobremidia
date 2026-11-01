/**
 * F-235 — CRIADOR DE LOGOS 3D do SOBRE MÍDIA Studio (/studio/logos).
 * Escolhe um dos 12 estilos (composições de encarte de mercado), troca o texto, as cores, o volume, a inclinação, o arco,
 * o fundo e os enfeites; baixa o PNG transparente ou SALVA na galeria de logos 3D do cabeçalho — a logo passa a valer nos
 * encartes, no Cartaz Digital e no Palco de Ofertas.
 */
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Loader2, Plus, Save, Sparkles, Trash2, Type } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { meuSaldo } from '@/lib/studioai/api';
import { ehCentral, enviarParaBiblioteca } from '@/lib/tabloide/selos';
import { ESTILOS_DE_LOGO, FONTES_DO_LOGO, carregarFontesDoLogo, clonarConfig, desenharLogo3D, logoParaPng, type ConfigLogo3D, type Enfeite, type FundoDoLogo } from '@/lib/studio/logo3d';
import { cn } from '@/lib/utils';

/** a logo salva vai direto para os encartes e para o Palco (mesma aba do navegador) */
export { CHAVE_LOGO_DO_ENCARTE } from '@/lib/studio/logoDoStudio';
import { CHAVE_LOGO_DO_ENCARTE } from '@/lib/studio/logoDoStudio';

function Previa({ cfg, largura, altura, className }: { cfg: ConfigLogo3D; largura: number; altura: number; className?: string }) {
  const tela = useRef<HTMLCanvasElement>(null);
  const [fontes, setFontes] = useState(false);
  useEffect(() => { void carregarFontesDoLogo().then(() => setFontes(true)); }, []);
  useEffect(() => { const c = tela.current?.getContext('2d'); if (c) desenharLogo3D(c, largura, altura, cfg); }, [cfg, largura, altura, fontes]);
  return <canvas ref={tela} width={largura} height={altura} className={cn('block h-auto w-full', className)} />;
}

const ENFEITES: Array<{ id: Enfeite; nome: string }> = [
  { id: 'moedas', nome: 'Moedas $' }, { id: 'estrelas', nome: 'Estrelas' }, { id: 'sirene', nome: 'Sirene' }, { id: 'raios', nome: 'Raios de luz' }, { id: 'brilhos', nome: 'Brilhos' },
];
const FUNDOS: Array<{ id: FundoDoLogo; nome: string }> = [{ id: 'nenhum', nome: 'Sem fundo' }, { id: 'balao', nome: 'Balão' }, { id: 'circulo', nome: 'Selo redondo' }, { id: 'faixa', nome: 'Faixa' }];
const XADREZ = { backgroundImage: 'linear-gradient(45deg,#2a2a35 25%,transparent 25%),linear-gradient(-45deg,#2a2a35 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#2a2a35 75%),linear-gradient(-45deg,transparent 75%,#2a2a35 75%)', backgroundSize: '24px 24px', backgroundPosition: '0 0,0 12px,12px -12px,-12px 0', backgroundColor: '#1c1c24' };

export default function LogosPage() {
  const { user } = useAuth();
  const saldo = useQuery({ queryKey: ['studio-ai-saldo'], queryFn: meuSaldo, staleTime: 30_000 });
  const central = useQuery({ queryKey: ['tabloide-central'], queryFn: ehCentral, staleTime: 60_000 });
  const [cfg, setCfg] = useState<ConfigLogo3D>(() => clonarConfig(ESTILOS_DE_LOGO[0].config));
  const [fundoPrevia, setFundoPrevia] = useState<'xadrez' | 'vermelho' | 'amarelo' | 'azul' | 'verde'>('vermelho');
  const [paraTodos, setParaTodos] = useState(false);
  const [ocupado, setOcupado] = useState<null | 'baixar' | 'salvar'>(null);
  const mudar = (x: Partial<ConfigLogo3D>) => setCfg((c) => ({ ...c, ...x }));
  // o texto escrito pela pessoa continua quando ela troca de estilo; o texto de exemplo troca junto com o estilo
  const [textoProprio, setTextoProprio] = useState(false);
  const mudarLinha = (i: number, x: Partial<ConfigLogo3D['linhas'][number]>) => { if (x.texto !== undefined) setTextoProprio(true); setCfg((c) => ({ ...c, linhas: c.linhas.map((l, k) => (k === i ? { ...l, ...x } : l)) })); };
  const escolherEstilo = (id: string) => {
    const e = ESTILOS_DE_LOGO.find((x) => x.id === id)!;
    // troca o desenho e mantém o texto que a pessoa já escreveu (quando há o mesmo número de linhas)
    setCfg((atual) => { const novo = clonarConfig(e.config); if (textoProprio && atual.linhas.length === novo.linhas.length) novo.linhas = novo.linhas.map((l, i) => ({ ...l, texto: atual.linhas[i].texto })); return novo; });
  };
  const nomeDoArquivo = cfg.linhas.map((l) => `${l.pilula?.texto ?? ''} ${l.texto}`).join(' ').replace(/\s+/g, ' ').trim();

  const baixar = async () => {
    setOcupado('baixar');
    try {
      const png = await logoParaPng(cfg);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(png); a.download = `logo-3d-${nomeDoArquivo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { toast.error((e as Error).message); } finally { setOcupado(null); }
  };
  const salvar = async () => {
    if (!user) return;
    setOcupado('salvar');
    try {
      const png = await logoParaPng(cfg);
      const selo = await enviarParaBiblioteca({ arquivo: png, nome: nomeDoArquivo.slice(0, 60) || 'Logo 3D', tipo: 'LOGO_CABECALHO', categoria: 'Criadas no Studio', usuarioId: user.id, clienteId: saldo.data?.cliente ?? null, daEmpresa: paraTodos && !!central.data });
      try { sessionStorage.setItem(CHAVE_LOGO_DO_ENCARTE, JSON.stringify({ id: selo.id, url: selo.imagem_url, largura: selo.largura, altura: selo.altura })); } catch { /* sem armazenamento */ }
      toast.success('Logo salva! Ela já aparece nos encartes, no Cartaz Digital (Temas → logos 3D) e no Palco de Ofertas.');
    } catch (e) { toast.error((e as Error).message || 'Não foi possível salvar a logo.'); } finally { setOcupado(null); }
  };

  const fundoCss = fundoPrevia === 'xadrez' ? XADREZ : { background: { vermelho: 'radial-gradient(circle at 50% 40%,#ef1f35,#5a0610)', amarelo: 'radial-gradient(circle at 50% 40%,#ffe066,#f2a900)', azul: 'radial-gradient(circle at 50% 40%,#2f6bff,#0b1f6b)', verde: 'radial-gradient(circle at 50% 40%,#46c03a,#14532d)' }[fundoPrevia] };

  return (
    <div className="space-y-4" data-testid="studio-logos">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-black text-white"><Sparkles className="h-5 w-5 text-[#FFD400]" />Criador de logos 3D</h1>
        <p className="text-xs text-slate-400">Títulos de encarte com volume, chanfro, brilho e enfeites. Escolha um estilo, escreva o seu texto e salve: a logo vai para os encartes, o Cartaz Digital e o Palco de Ofertas.</p>
      </div>

      {/* estilos */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" role="radiogroup" aria-label="Estilos de logo">
        {ESTILOS_DE_LOGO.map((e) => (
          <button key={e.id} type="button" role="radio" aria-checked={cfg.estilo === e.id} onClick={() => escolherEstilo(e.id)} data-testid="estilo-logo"
            className={cn('overflow-hidden rounded-xl border p-1.5 text-left transition', cfg.estilo === e.id ? 'border-[#FFD400] shadow-[0_0_18px_rgba(255,212,0,.35)]' : 'border-white/10 hover:border-[#8A2EFF]/60')}>
            <div className="rounded-lg" style={{ background: `linear-gradient(160deg, ${e.config.corFundo[0]}, ${e.config.corFundo[1]})` }}><Previa cfg={e.config} largura={360} altura={200} /></div>
            <p className="mt-1 truncate px-0.5 text-[11px] font-semibold text-slate-200">{e.nome}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        {/* prévia grande */}
        <section className="space-y-2">
          <div className="overflow-hidden rounded-2xl border border-white/10" style={fundoCss} data-testid="logo-previa"><Previa cfg={cfg} largura={1600} altura={900} /></div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-300">
            Fundo da prévia:
            {(['vermelho', 'amarelo', 'azul', 'verde', 'xadrez'] as const).map((f) => (
              <button key={f} type="button" onClick={() => setFundoPrevia(f)} className={cn('rounded-full border px-2.5 py-1 capitalize', fundoPrevia === f ? 'border-[#FFD400] text-[#FFD400]' : 'border-white/10')}>{f === 'xadrez' ? 'transparente' : f}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void salvar()} disabled={!!ocupado} className="flex h-11 items-center gap-2 rounded-xl bg-[#25D366] px-5 text-sm font-bold text-[#0b2a17] hover:brightness-105 disabled:opacity-60" data-testid="logo-salvar">
              {ocupado === 'salvar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar e usar nos encartes
            </button>
            <button type="button" onClick={() => void baixar()} disabled={!!ocupado} className="flex h-11 items-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-semibold text-white hover:bg-white/5" data-testid="logo-baixar">
              {ocupado === 'baixar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Baixar PNG transparente
            </button>
            {central.data && (
              <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={paraTodos} onChange={(e) => setParaTodos(e.target.checked)} className="h-4 w-4 accent-[#8A2EFF]" />Vale para todos os usuários da empresa</label>
            )}
          </div>
        </section>

        {/* controles */}
        <section className="space-y-3 rounded-2xl border border-[#8A2EFF]/40 bg-[#14062f] p-3 text-sm text-slate-200">
          <h2 className="flex items-center gap-2 font-bold text-white"><Type className="h-4 w-4 text-[#FFD400]" />Texto</h2>
          {cfg.linhas.map((l, i) => (
            <div key={i} className="space-y-1 rounded-lg border border-white/10 p-2">
              <div className="flex gap-1.5">
                <input value={l.texto} onChange={(e) => mudarLinha(i, { texto: e.target.value.slice(0, 24) })} aria-label={`Linha ${i + 1}`} data-testid={`logo-linha-${i}`}
                  className="h-9 min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-2 font-bold uppercase text-white" />
                {cfg.linhas.length > 1 && <button type="button" onClick={() => setCfg((c) => ({ ...c, linhas: c.linhas.filter((_, k) => k !== i) }))} aria-label="Tirar a linha" className="rounded-md p-2 text-rose-300 hover:bg-rose-500/15"><Trash2 className="h-4 w-4" /></button>}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                Tamanho<input type="range" min={0.4} max={1.3} step={0.05} value={l.escala} onChange={(e) => mudarLinha(i, { escala: Number(e.target.value) })} className="w-24 accent-[#8A2EFF]" />
                Palavra pequena<input value={l.pilula?.texto ?? ''} placeholder="DA, DE…" onChange={(e) => mudarLinha(i, { pilula: e.target.value.trim() ? { cor: l.pilula?.cor ?? '#d90f1f', texto: e.target.value.toUpperCase().slice(0, 3) } : null })} className="h-7 w-14 rounded border border-white/10 bg-black/30 px-1 text-xs uppercase text-white" />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                Face<input type="color" value={l.pintura.face[1]} onChange={(e) => mudarLinha(i, { pintura: { ...l.pintura, face: [l.pintura.face[0], e.target.value, e.target.value, l.pintura.face[3]] } })} className="h-7 w-9 rounded" />
                Volume<input type="color" value={l.pintura.volume[0]} onChange={(e) => mudarLinha(i, { pintura: { ...l.pintura, volume: [e.target.value, l.pintura.volume[1]] } })} className="h-7 w-9 rounded" />
                Contorno<input type="color" value={l.pintura.contorno} onChange={(e) => mudarLinha(i, { pintura: { ...l.pintura, contorno: e.target.value } })} className="h-7 w-9 rounded" />
              </div>
            </div>
          ))}
          {cfg.linhas.length < 3 && <button type="button" onClick={() => setCfg((c) => ({ ...c, linhas: [...c.linhas, { ...c.linhas[c.linhas.length - 1], texto: 'NOVA LINHA', pilula: null }] }))} className="flex items-center gap-1 text-xs font-semibold text-[#FFD400]"><Plus className="h-3.5 w-3.5" />Linha</button>}

          <label className="flex flex-col gap-1 text-xs">Fonte
            <select value={cfg.fonte} onChange={(e) => mudar({ fonte: e.target.value })} className="h-9 rounded-md border border-white/10 bg-black/30 px-2 text-white">
              {FONTES_DO_LOGO.map((f) => <option key={f.id} value={f.id} className="bg-[#14062f]">{f.nome}</option>)}
            </select>
          </label>
          {([['profundidade', 'Volume (relevo)', 0, 40, 1], ['inclinacao', 'Inclinação', -15, 15, 1], ['arco', 'Arco', 0, 0.6, 0.02], ['direcao', 'Direção do volume', 45, 135, 5]] as const).map(([k, n, min, max, passo]) => (
            <label key={k} className="flex items-center justify-between gap-2 text-xs">{n}
              <input type="range" min={min} max={max} step={passo} value={cfg[k]} onChange={(e) => mudar({ [k]: Number(e.target.value) } as Partial<ConfigLogo3D>)} className="w-40 accent-[#8A2EFF]" data-testid={`logo-${k}`} />
            </label>
          ))}
          <div className="space-y-1 text-xs">Fundo atrás do texto
            <div className="flex flex-wrap gap-1">{FUNDOS.map((f) => <button key={f.id} type="button" onClick={() => mudar({ fundo: f.id })} className={cn('rounded-full border px-2.5 py-1', cfg.fundo === f.id ? 'border-[#FFD400] text-[#FFD400]' : 'border-white/10')}>{f.nome}</button>)}</div>
            {cfg.fundo !== 'nenhum' && <div className="flex items-center gap-2 text-[11px] text-slate-400">Cores<input type="color" value={cfg.corFundo[0]} onChange={(e) => mudar({ corFundo: [e.target.value, cfg.corFundo[1]] })} className="h-7 w-9 rounded" /><input type="color" value={cfg.corFundo[1]} onChange={(e) => mudar({ corFundo: [cfg.corFundo[0], e.target.value] })} className="h-7 w-9 rounded" /></div>}
          </div>
          <div className="space-y-1 text-xs">Enfeites
            <div className="flex flex-wrap gap-1">{ENFEITES.map((f) => { const on = cfg.enfeites.includes(f.id); return <button key={f.id} type="button" aria-pressed={on} onClick={() => mudar({ enfeites: on ? cfg.enfeites.filter((x) => x !== f.id) : [...cfg.enfeites, f.id] })} className={cn('rounded-full border px-2.5 py-1', on ? 'border-[#FFD400] text-[#FFD400]' : 'border-white/10')}>{f.nome}</button>; })}</div>
          </div>
        </section>
      </div>
    </div>
  );
}
