import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as EventoDePonteiro } from 'react';
import { Copy, Film, Image as ImagemIcone, LayoutGrid, ListVideo, Loader2, Plus, Save, Search, Trash2, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  TELAS_PRONTAS, arrastoVale, doBanco, estiloDaZona, limitarZona, marcarUnica, naGrade, novaChave, novaZona, paraSalvar,
  paresSobrepostos, percentual, proximoNumero, redimensionarLayout, telaLogicaPadrao, validarLayout, zonaDoArrasto, zonasDaDivisao,
  type DivisaoPronta, type LayoutDaTela, type ModoEncaixe, type Retangulo, type Zona,
} from '@/lib/layoutZonas';

/**
 * F-147 — Divisão da tela em zonas. O usuário cria cada zona digitando os números ou clicando e arrastando sobre a
 * tela; as medidas aparecem ao lado enquanto arrasta. Cada zona recebe uma playlist (a principal usa a da tela).
 */
interface TelaResumo { id: string; name: string; resolution?: string | null; orientation?: string | null }
interface PlaylistResumo { id: string; name: string }
interface MidiaResumo { id: string; name: string; file_type: string; thumbnail_url: string | null; file_url: string | null; duration_ms: number | null }
interface ItemDaZona { id: string; nome: string; tipo: string }

type Arrasto =
  | { modo: 'criar'; inicio: { x: number; y: number } }
  | { modo: 'mover'; chave: string; dx: number; dy: number }
  | { modo: 'tamanho'; chave: string };

const CORES = ['#6366F1', '#22C55E', '#F59E0B', '#EC4899', '#06B6D4', '#A855F7', '#EF4444', '#84CC16'];
const corDaZona = (numero: number) => CORES[(numero - 1) % CORES.length];
const DIVISOES: Array<{ tipo: DivisaoPronta; rotulo: string; fracao?: number }> = [
  { tipo: 'LATERAL_DIREITA', rotulo: '75% + 25% à direita', fracao: 0.25 },
  { tipo: 'LATERAL_ESQUERDA', rotulo: '25% à esquerda + 75%', fracao: 0.25 },
  { tipo: 'RODAPE', rotulo: 'Principal + rodapé (20%)', fracao: 0.2 },
  { tipo: 'DUAS_COLUNAS', rotulo: 'Duas metades' },
  { tipo: 'QUATRO', rotulo: 'Quatro partes' },
  { tipo: 'TELA_CHEIA', rotulo: 'Uma zona (tela inteira)' },
];

function CampoNumero({ rotulo, valor, onChange, id }: { rotulo: string; valor: number; onChange: (n: number) => void; id: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-[11px] text-muted-foreground">{rotulo}</Label>
      <Input id={id} type="number" inputMode="numeric" value={Number.isFinite(valor) ? valor : 0} className="h-9 font-mono"
        onChange={(e) => onChange(Math.round(Number(e.target.value) || 0))} />
    </div>
  );
}

export function EditorDeZonas({ tela, aberto, onFechar, onSalvo }: { tela: TelaResumo; aberto: boolean; onFechar: () => void; onSalvo?: () => void }) {
  const { user } = useAuth();
  const padrao = useMemo(() => telaLogicaPadrao(tela.resolution, tela.orientation), [tela.resolution, tela.orientation]);
  const [layout, setLayout] = useState<LayoutDaTela>({ ...padrao, cor_fundo: '#000000', zonas: [] });
  const [existe, setExiste] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Retangulo | null>(null);
  const [grade, setGrade] = useState(10);
  const [filtroZona, setFiltroZona] = useState('');
  const [playlists, setPlaylists] = useState<PlaylistResumo[]>([]);
  const [busca, setBusca] = useState('');
  const [midias, setMidias] = useState<MidiaResumo[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [itens, setItens] = useState<ItemDaZona[]>([]);
  const [alvoDoArraste, setAlvoDoArraste] = useState<string | null>(null);
  const palco = useRef<HTMLDivElement>(null);
  const arrasto = useRef<Arrasto | null>(null);

  const zona = layout.zonas.find((z) => z.chave === selecionada) ?? null;
  const medida = rascunho ?? zona;

  // ------------------------------------------------------------------ carga
  const carregar = useCallback(async () => {
    setCarregando(true);
    const { data: l } = await supabase.from('screen_layouts' as never).select('id, largura_px, altura_px, cor_fundo').eq('screen_id', tela.id).maybeSingle();
    const linha = l as { id: string; largura_px: number; altura_px: number; cor_fundo: string } | null;
    if (linha) {
      const { data: zs } = await supabase.from('layout_zones' as never).select('*').eq('layout_id', linha.id).order('numero');
      const zonas = ((zs as Record<string, unknown>[] | null) ?? []).map(doBanco);
      setLayout({ largura: linha.largura_px, altura: linha.altura_px, cor_fundo: linha.cor_fundo, zonas });
      setSelecionada(zonas[0]?.chave ?? null);
      setExiste(true);
    } else {
      setLayout({ ...padrao, cor_fundo: '#000000', zonas: [] });
      setSelecionada(null);
      setExiste(false);
    }
    const { data: ps } = await supabase.from('playlists').select('id, name').order('name');
    setPlaylists((ps as PlaylistResumo[] | null) ?? []);
    setCarregando(false);
  }, [tela.id, padrao]);

  useEffect(() => { if (aberto) carregar(); }, [aberto, carregar]);

  // busca de mídias por nome (com pequena espera para não consultar a cada tecla)
  useEffect(() => {
    if (!aberto) return;
    const t = setTimeout(async () => {
      setBuscando(true);
      let q = supabase.from('media').select('id, name, file_type, thumbnail_url, file_url, duration_ms').in('file_type', ['image', 'video']).order('created_at', { ascending: false }).limit(24);
      if (busca.trim()) q = q.ilike('name', `%${busca.trim()}%`);
      const { data } = await q;
      setMidias((data as unknown as MidiaResumo[] | null) ?? []);
      setBuscando(false);
    }, 300);
    return () => clearTimeout(t);
  }, [busca, aberto]);

  // itens da playlist da zona selecionada
  const carregarItens = useCallback(async (playlistId: string | null) => {
    if (!playlistId) { setItens([]); return; }
    const { data } = await supabase.from('playlist_items').select('id, position, media:media!playlist_items_media_id_fkey(name, file_type), widget:widgets!playlist_items_widget_id_fkey(name)').eq('playlist_id', playlistId).order('position');
    setItens(((data as unknown as Array<{ id: string; media: { name: string; file_type: string } | null; widget: { name: string } | null }> | null) ?? [])
      .map((i) => ({ id: i.id, nome: i.media?.name ?? i.widget?.name ?? 'Item', tipo: i.media?.file_type ?? 'widget' })));
  }, []);
  useEffect(() => { carregarItens(zona && !zona.principal ? zona.playlist_id : null); }, [zona?.chave, zona?.playlist_id, zona?.principal, carregarItens]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------ alterações
  const alterar = (chave: string, mudanca: Partial<Zona>) => setLayout((l) => ({
    ...l, zonas: l.zonas.map((z) => (z.chave === chave ? { ...z, ...limitarZona({ ...z, ...mudanca }, l.largura, l.altura), ...('nome' in mudanca ? { nome: mudanca.nome ?? '' } : {}) } : z)),
  }));

  const adicionarPorNumeros = () => {
    const z = novaZona({ x: 0, y: 0, largura: Math.round(layout.largura / 4), altura: Math.round(layout.altura / 4) }, layout.zonas, layout.largura, layout.altura);
    setLayout({ ...layout, zonas: [...layout.zonas, z] });
    setSelecionada(z.chave);
  };

  const duplicar = (z: Zona) => {
    const numero = proximoNumero(layout.zonas);
    const copia: Zona = { ...limitarZona({ ...z, x: z.x + 20, y: z.y + 20 }, layout.largura, layout.altura), id: undefined, chave: novaChave(), numero, nome: `Zona ${numero}`, principal: false, audio: false };
    setLayout({ ...layout, zonas: [...layout.zonas, copia] });
    setSelecionada(copia.chave);
  };

  const excluir = (chave: string) => {
    const zonas = layout.zonas.filter((z) => z.chave !== chave);
    if (zonas.length && !zonas.some((z) => z.principal)) zonas[0] = { ...zonas[0], principal: true, playlist_id: null };
    setLayout({ ...layout, zonas });
    setSelecionada(zonas[0]?.chave ?? null);
  };

  const aplicarDivisao = (d: (typeof DIVISOES)[number]) => {
    if (layout.zonas.length > 0 && !window.confirm('Trocar as zonas atuais por esta divisão pronta?')) return;
    const zonas = zonasDaDivisao(d.tipo, layout.largura, layout.altura, d.fracao);
    setLayout((l) => ({ ...l, zonas }));
    setSelecionada(zonas[0]?.chave ?? null);
  };

  const mudarTela = (largura: number, altura: number) => {
    if (!(largura >= 16 && altura >= 16)) return;
    setLayout((l) => redimensionarLayout(l, largura, altura));
  };

  // ------------------------------------------------------------------ clicar e arrastar
  const ponto = (e: EventoDePonteiro) => {
    const r = palco.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * layout.largura, y: ((e.clientY - r.top) / r.height) * layout.altura };
  };

  const aoPressionar = (e: EventoDePonteiro, alvo?: { chave: string; modo: 'mover' | 'tamanho' }) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const p = ponto(e);
    if (alvo) {
      const z = layout.zonas.find((x) => x.chave === alvo.chave);
      if (!z) return;
      setSelecionada(z.chave);
      if (z.travada) return;
      arrasto.current = alvo.modo === 'mover' ? { modo: 'mover', chave: z.chave, dx: p.x - z.x, dy: p.y - z.y } : { modo: 'tamanho', chave: z.chave };
    } else {
      arrasto.current = { modo: 'criar', inicio: p };
      setRascunho({ x: Math.round(p.x), y: Math.round(p.y), largura: 0, altura: 0 });
    }
    palco.current?.setPointerCapture?.(e.pointerId);
    e.stopPropagation();
    e.preventDefault();
  };

  const aoMover = (e: EventoDePonteiro) => {
    const a = arrasto.current;
    if (!a) return;
    const p = ponto(e);
    if (a.modo === 'criar') {
      setRascunho(zonaDoArrasto({ x: naGrade(a.inicio.x, grade), y: naGrade(a.inicio.y, grade) }, { x: naGrade(p.x, grade), y: naGrade(p.y, grade) }, layout.largura, layout.altura));
    } else if (a.modo === 'mover') {
      alterar(a.chave, { x: naGrade(p.x - a.dx, grade), y: naGrade(p.y - a.dy, grade) });
    } else {
      const z = layout.zonas.find((x) => x.chave === a.chave);
      if (z) alterar(a.chave, { largura: Math.max(1, naGrade(p.x, grade) - z.x), altura: Math.max(1, naGrade(p.y, grade) - z.y) });
    }
  };

  const aoSoltar = (e: EventoDePonteiro) => {
    const a = arrasto.current;
    arrasto.current = null;
    palco.current?.releasePointerCapture?.(e.pointerId);
    if (a?.modo === 'criar') {
      const r = rascunho;
      setRascunho(null);
      if (r && arrastoVale(r)) {
        const z = novaZona(r, layout.zonas, layout.largura, layout.altura);
        setLayout({ ...layout, zonas: [...layout.zonas, z] });
        setSelecionada(z.chave);
      }
    }
  };

  // ------------------------------------------------------------------ conteúdo da zona
  const adicionarMidia = async (z: Zona, m: MidiaResumo) => {
    if (z.principal) { toast.info('A zona principal toca a playlist da tela. Adicione a mídia na Lista de Reprodução da tela.'); return; }
    if (!user?.id) return;
    try {
      let playlistId = z.playlist_id;
      if (!playlistId) {
        const { data, error } = await supabase.from('playlists').insert({ user_id: user.id, name: `${tela.name} — Zona ${z.numero}`, resolution: layout.altura > layout.largura ? '9x16' : '16x9', is_active: true } as never).select('id, name').single();
        if (error || !data) throw new Error(error?.message || 'Não foi possível criar a playlist da zona.');
        playlistId = (data as PlaylistResumo).id;
        setPlaylists((ps) => [...ps, data as PlaylistResumo].sort((a, b) => a.name.localeCompare(b.name)));
        setLayout((l) => ({ ...l, zonas: l.zonas.map((x) => (x.chave === z.chave ? { ...x, playlist_id: playlistId } : x)) }));
      }
      const { data: ultimo } = await supabase.from('playlist_items').select('position').eq('playlist_id', playlistId).order('position', { ascending: false }).limit(1);
      const posicao = ((ultimo as Array<{ position: number }> | null)?.[0]?.position ?? -1) + 1;
      const duracao = m.file_type === 'video' ? Math.max(1, Math.round((m.duration_ms || 10000) / 1000)) : 10;
      const { error: erroItem } = await supabase.from('playlist_items').insert({ playlist_id: playlistId, media_id: m.id, position: posicao, duration: duracao } as never);
      if (erroItem) throw new Error(erroItem.message);
      toast.success(`"${m.name}" entrou na zona ${z.numero}. Salve a divisão para valer na tela.`);
      if (z.chave === selecionada) carregarItens(playlistId);
    } catch (e) {
      toast.error((e as Error).message || 'Não foi possível colocar a mídia na zona.');
    }
  };

  const removerItem = async (id: string) => {
    const { error, count } = await supabase.from('playlist_items').delete({ count: 'exact' }).eq('id', id);
    if (error || !count) { toast.error(error?.message || 'Não foi possível remover: a playlist não é sua.'); return; }
    setItens((is) => is.filter((i) => i.id !== id));
  };

  // ------------------------------------------------------------------ salvar / remover
  const erros = validarLayout(layout);
  const sobrepostas = paresSobrepostos(layout.zonas);

  const salvar = async () => {
    if (erros.length) { toast.error(erros[0]); return; }
    setSalvando(true);
    const { error } = await supabase.rpc('fn_salvar_layout_da_tela' as never, {
      p_screen: tela.id, p_largura: layout.largura, p_altura: layout.altura, p_cor_fundo: layout.cor_fundo, p_zonas: paraSalvar(layout.zonas), p_ativo: true,
    } as never);
    setSalvando(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Divisão salva: ${layout.zonas.length} zona(s). A tela atualiza sozinha em instantes.`);
    await carregar();
    onSalvo?.();
  };

  const removerDivisao = async () => {
    if (!window.confirm('Remover a divisão? A tela volta a tocar a playlist dela em tela cheia.')) return;
    const { error } = await supabase.rpc('fn_excluir_layout_da_tela' as never, { p_screen: tela.id } as never);
    if (error) { toast.error(error.message); return; }
    toast.success('Divisão removida. A tela voltou para tela cheia.');
    await carregar();
    onSalvo?.();
  };

  const pc = medida ? percentual(medida, layout.largura, layout.altura) : null;
  const zonasFiltradas = layout.zonas.filter((z) => !filtroZona.trim() || `${z.numero} ${z.nome}`.toLowerCase().includes(filtroZona.trim().toLowerCase())).sort((a, b) => a.numero - b.numero);

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="flex max-h-[94dvh] flex-col gap-3 overflow-hidden p-4 sm:p-5" style={{ width: 'min(1500px, 97vw)', maxWidth: 'none' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><LayoutGrid className="h-5 w-5 text-primary" /> Divisão da tela — {tela.name}</DialogTitle>
          <DialogDescription>
            Clique e arraste sobre a tela para criar uma zona, ou use "Nova zona" e digite os números. Cada zona tem a sua playlist e o seu ciclo.
          </DialogDescription>
        </DialogHeader>

        {carregando ? <Loader2 className="mx-auto my-16 h-6 w-6 animate-spin text-muted-foreground" /> : (
          <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_380px] lg:overflow-hidden">
            {/* ---------------- tela ---------------- */}
            {/* no celular e no tablet as seções empilham e a janela rola; no computador cada coluna rola por conta própria */}
            <div className="flex flex-col gap-3 lg:min-h-0">
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Tamanho da tela</Label>
                  <select className="h-9 rounded-md border border-border/60 bg-background px-2 text-sm" data-testid="tela-pronta"
                    value={TELAS_PRONTAS.some((t) => t.largura === layout.largura && t.altura === layout.altura) ? `${layout.largura}x${layout.altura}` : 'sob-medida'}
                    onChange={(e) => { const [w, h] = e.target.value.split('x').map(Number); if (w && h) mudarTela(w, h); }}>
                    {TELAS_PRONTAS.map((t) => <option key={t.rotulo} value={`${t.largura}x${t.altura}`}>{t.rotulo}</option>)}
                    <option value="sob-medida">Sob medida</option>
                  </select>
                </div>
                <div className="w-24"><CampoNumero id="tela-l" rotulo="Largura (px)" valor={layout.largura} onChange={(n) => mudarTela(n, layout.altura)} /></div>
                <div className="w-24"><CampoNumero id="tela-a" rotulo="Altura (px)" valor={layout.altura} onChange={(n) => mudarTela(layout.largura, n)} /></div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Encaixe ao arrastar</Label>
                  <select className="h-9 rounded-md border border-border/60 bg-background px-2 text-sm" value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
                    <option value={0}>Livre (1 px)</option><option value={5}>De 5 em 5 px</option><option value={10}>De 10 em 10 px</option><option value={20}>De 20 em 20 px</option><option value={40}>De 40 em 40 px</option>
                  </select>
                </div>
                <Button type="button" size="sm" variant="outline" className="h-9 gap-1" onClick={adicionarPorNumeros} data-testid="nova-zona"><Plus className="h-4 w-4" /> Nova zona</Button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {DIVISOES.map((d) => (
                  <Button key={d.rotulo} type="button" size="sm" variant="secondary" className="h-7 px-2 text-[11px]" onClick={() => aplicarDivisao(d)}>{d.rotulo}</Button>
                ))}
              </div>

              {/* a tela cabe inteira na área disponível, na largura e na altura (medidas do próprio contêiner) */}
              <div className="flex h-[46dvh] min-h-[220px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-slate-950/60 p-3 lg:h-auto lg:flex-1"
                style={{ containerType: 'size' }}>
                <div ref={palco} data-testid="palco-zonas"
                  className="relative cursor-crosshair select-none overflow-hidden rounded-md shadow-lg ring-1 ring-white/20"
                  style={{ aspectRatio: `${layout.largura} / ${layout.altura}`, width: `min(100cqw, calc(100cqh * ${layout.largura / layout.altura}))`, maxWidth: 'none', backgroundColor: layout.cor_fundo, touchAction: 'none' }}
                  onPointerDown={(e) => aoPressionar(e)} onPointerMove={aoMover} onPointerUp={aoSoltar} onPointerCancel={aoSoltar}>
                  {layout.zonas.filter((z) => z.visivel).sort((a, b) => a.ordem_z - b.ordem_z).map((z) => {
                    const ativa = z.chave === selecionada;
                    const cor = corDaZona(z.numero);
                    return (
                      <div key={z.chave} data-testid="zona" data-numero={z.numero}
                        className={`absolute flex items-center justify-center overflow-hidden ${z.travada ? 'cursor-not-allowed' : 'cursor-move'}`}
                        style={{ ...estiloDaZona(z, layout.largura, layout.altura), backgroundColor: `${cor}${ativa ? '66' : '33'}`,
                                 outline: `${ativa || alvoDoArraste === z.chave ? 3 : 1}px solid ${alvoDoArraste === z.chave ? '#22C55E' : cor}`, outlineOffset: '-1px', zIndex: ativa ? 9999 : z.ordem_z + 1 }}
                        onPointerDown={(e) => aoPressionar(e, { chave: z.chave, modo: 'mover' })}
                        onDragOver={(e) => { e.preventDefault(); setAlvoDoArraste(z.chave); }}
                        onDragLeave={() => setAlvoDoArraste((c) => (c === z.chave ? null : c))}
                        onDrop={(e) => {
                          e.preventDefault(); setAlvoDoArraste(null);
                          const m = midias.find((x) => x.id === e.dataTransfer.getData('text/midia'));
                          if (m) { setSelecionada(z.chave); adicionarMidia(z, m); }
                        }}>
                        <div className="pointer-events-none text-center leading-tight text-white drop-shadow">
                          <div className="text-sm font-black sm:text-lg">{z.numero}</div>
                          <div className="hidden text-[10px] opacity-90 sm:block">{z.largura} × {z.altura}</div>
                          {z.principal && <div className="text-[9px] font-semibold uppercase">principal</div>}
                        </div>
                        {ativa && !z.travada && (
                          <div data-testid="alca-tamanho" className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize rounded-tl bg-white"
                            onPointerDown={(e) => aoPressionar(e, { chave: z.chave, modo: 'tamanho' })} />
                        )}
                      </div>
                    );
                  })}
                  {rascunho && (
                    <div className="pointer-events-none absolute border-2 border-dashed border-white bg-white/20" data-testid="rascunho-zona"
                      style={estiloDaZona(rascunho, layout.largura, layout.altura)} />
                  )}
                </div>
              </div>

              {/* medidas ao vivo */}
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/60 bg-card/60 p-3 text-sm sm:grid-cols-5" data-testid="medidas-ao-vivo">
                {medida && pc ? (
                  <>
                    <div><span className="text-[11px] text-muted-foreground">X</span><div className="font-mono font-semibold">{medida.x} px <span className="text-muted-foreground">({pc.x}%)</span></div></div>
                    <div><span className="text-[11px] text-muted-foreground">Y</span><div className="font-mono font-semibold">{medida.y} px <span className="text-muted-foreground">({pc.y}%)</span></div></div>
                    <div><span className="text-[11px] text-muted-foreground">Largura</span><div className="font-mono font-semibold" data-testid="medida-largura">{medida.largura} px <span className="text-muted-foreground">({pc.largura}%)</span></div></div>
                    <div><span className="text-[11px] text-muted-foreground">Altura</span><div className="font-mono font-semibold" data-testid="medida-altura">{medida.altura} px <span className="text-muted-foreground">({pc.altura}%)</span></div></div>
                    <div><span className="text-[11px] text-muted-foreground">Área da tela</span><div className="font-mono font-semibold">{pc.area}%</div></div>
                  </>
                ) : <p className="col-span-full text-xs text-muted-foreground">Clique e arraste sobre a tela para criar a primeira zona. As medidas aparecem aqui enquanto você arrasta.</p>}
              </div>
            </div>

            {/* ---------------- painel lateral ---------------- */}
            <div className="flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
              <div className="rounded-xl border border-border/60 bg-card/60 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Zonas ({layout.zonas.length})</p>
                  {layout.zonas.length > 6 && (
                    <Input value={filtroZona} onChange={(e) => setFiltroZona(e.target.value)} placeholder="Procurar zona" className="h-7 w-36 text-xs" />
                  )}
                </div>
                <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                  {zonasFiltradas.map((z) => (
                    <button key={z.chave} type="button" onClick={() => setSelecionada(z.chave)} title={z.nome}
                      className={`rounded-md border px-2 py-1 text-xs font-semibold ${z.chave === selecionada ? 'border-primary bg-primary/20 text-foreground' : 'border-border/60 text-muted-foreground hover:bg-muted/40'}`}
                      style={{ borderLeft: `4px solid ${corDaZona(z.numero)}` }}>
                      {z.numero}{z.principal ? ' ★' : ''}{z.audio ? ' ♪' : ''}
                    </button>
                  ))}
                  {layout.zonas.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma zona ainda.</p>}
                </div>
              </div>

              {zona && (
                <div className="space-y-3 rounded-xl border border-border/60 bg-card/60 p-3" data-testid="painel-zona">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-sm font-semibold"><span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: corDaZona(zona.numero) }} /> Zona {zona.numero}</p>
                    <div className="flex gap-1">
                      <Button type="button" size="icon" variant="ghost" className="h-8 w-8" title="Duplicar zona" onClick={() => duplicar(zona)}><Copy className="h-4 w-4" /></Button>
                      <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-rose-400" title="Excluir zona" onClick={() => excluir(zona.chave)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-[72px_1fr] gap-2">
                    <CampoNumero id="z-numero" rotulo="Número" valor={zona.numero} onChange={(n) => setLayout((l) => ({ ...l, zonas: l.zonas.map((z) => (z.chave === zona.chave ? { ...z, numero: Math.max(1, n) } : z)) }))} />
                    <div className="space-y-1">
                      <Label htmlFor="z-nome" className="text-[11px] text-muted-foreground">Nome</Label>
                      <Input id="z-nome" className="h-9" maxLength={80} value={zona.nome} onChange={(e) => alterar(zona.chave, { nome: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <CampoNumero id="z-x" rotulo="X" valor={zona.x} onChange={(n) => alterar(zona.chave, { x: n })} />
                    <CampoNumero id="z-y" rotulo="Y" valor={zona.y} onChange={(n) => alterar(zona.chave, { y: n })} />
                    <CampoNumero id="z-l" rotulo="Largura" valor={zona.largura} onChange={(n) => alterar(zona.chave, { largura: n })} />
                    <CampoNumero id="z-a" rotulo="Altura" valor={zona.altura} onChange={(n) => alterar(zona.chave, { altura: n })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Como a mídia ocupa a zona</Label>
                    <select className="h-9 w-full rounded-md border border-border/60 bg-background px-2 text-sm" value={zona.modo_encaixe}
                      onChange={(e) => alterar(zona.chave, { modo_encaixe: e.target.value as ModoEncaixe })}>
                      <option value="CONTER">Inteira, sem cortar (pode sobrar borda)</option>
                      <option value="COBRIR">Preenche a zona (pode cortar as bordas)</option>
                      <option value="ESTICAR">Estica até preencher</option>
                    </select>
                  </div>
                  <div className="space-y-2 text-sm">
                    <label className="flex items-center justify-between gap-2"><span>Zona principal <span className="text-xs text-muted-foreground">(toca a playlist da tela)</span></span>
                      <Switch checked={zona.principal} onCheckedChange={(v) => setLayout((l) => ({ ...l, zonas: marcarUnica(l.zonas, zona.chave, 'principal', v) }))} /></label>
                    <label className="flex items-center justify-between gap-2"><span className="flex items-center gap-1"><Volume2 className="h-3.5 w-3.5" /> Som desta zona</span>
                      <Switch checked={zona.audio} onCheckedChange={(v) => setLayout((l) => ({ ...l, zonas: marcarUnica(l.zonas, zona.chave, 'audio', v) }))} /></label>
                    <label className="flex items-center justify-between gap-2"><span>Recebe anúncios pagos do ponto</span>
                      <Switch checked={zona.anuncios_pagos} onCheckedChange={(v) => alterar(zona.chave, { anuncios_pagos: v })} /></label>
                  </div>

                  {/* conteúdo */}
                  <div className="space-y-2 border-t border-border/60 pt-3">
                    <p className="flex items-center gap-2 text-sm font-semibold"><ListVideo className="h-4 w-4" /> Conteúdo da zona</p>
                    {zona.principal ? (
                      <p className="text-xs text-muted-foreground">Esta é a zona principal: ela toca a playlist da própria tela (a "Lista de Reprodução" na página da tela).</p>
                    ) : (
                      <>
                        <select className="h-9 w-full rounded-md border border-border/60 bg-background px-2 text-sm" data-testid="playlist-da-zona"
                          value={zona.playlist_id ?? ''} onChange={(e) => alterar(zona.chave, { playlist_id: e.target.value || null })}>
                          <option value="">Sem playlist (zona vazia)</option>
                          {playlists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        {itens.length > 0 && (
                          <ul className="max-h-32 space-y-1 overflow-y-auto text-xs">
                            {itens.map((i) => (
                              <li key={i.id} className="flex items-center justify-between gap-2 rounded bg-muted/30 px-2 py-1">
                                <span className="flex min-w-0 items-center gap-1.5">{i.tipo === 'video' ? <Film className="h-3 w-3 shrink-0" /> : <ImagemIcone className="h-3 w-3 shrink-0" />}<span className="truncate">{i.nome}</span></span>
                                <button type="button" className="text-rose-400" title="Tirar da zona" onClick={() => removerItem(i.id)}><Trash2 className="h-3 w-3" /></button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* mídias: pesquisar por nome e arrastar para a zona */}
              <div className="space-y-2 rounded-xl border border-border/60 bg-card/60 p-3">
                <p className="text-sm font-semibold">Mídias</p>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar mídia pelo nome" className="h-9 pl-8" data-testid="busca-midia" />
                </div>
                <p className="text-[11px] text-muted-foreground">Arraste a mídia para uma zona da tela, ou toque nela para colocar na zona selecionada.</p>
                <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto">
                  {buscando && <Loader2 className="col-span-full mx-auto my-3 h-4 w-4 animate-spin text-muted-foreground" />}
                  {!buscando && midias.map((m) => (
                    <button key={m.id} type="button" draggable title={m.name} data-testid="midia"
                      onDragStart={(e) => { e.dataTransfer.setData('text/midia', m.id); e.dataTransfer.effectAllowed = 'copy'; }}
                      onClick={() => { if (zona) adicionarMidia(zona, m); else toast.info('Selecione uma zona primeiro.'); }}
                      className="group overflow-hidden rounded-md border border-border/60 bg-muted/20 text-left hover:border-primary">
                      <div className="flex aspect-video items-center justify-center bg-slate-900">
                        {m.thumbnail_url || (m.file_type === 'image' && m.file_url)
                          ? <img src={m.thumbnail_url || m.file_url || ''} alt="" loading="lazy" className="h-full w-full object-cover" draggable={false} />
                          : <Film className="h-5 w-5 text-muted-foreground" />}
                      </div>
                      <div className="truncate px-1 py-0.5 text-[10px]">{m.name}</div>
                    </button>
                  ))}
                  {!buscando && midias.length === 0 && <p className="col-span-full py-3 text-center text-xs text-muted-foreground">Nenhuma mídia com esse nome.</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        {!carregando && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
            <div className="min-w-0 text-xs">
              {erros.length > 0 ? <span className="text-rose-400">{erros[0]}</span>
                : sobrepostas.length > 0 ? <span className="text-amber-400">Atenção: as zonas {sobrepostas[0][0]} e {sobrepostas[0][1]} estão uma sobre a outra.</span>
                : <span className="text-muted-foreground">A mesma mídia nunca toca em duas zonas ao mesmo tempo.</span>}
            </div>
            <div className="flex gap-2">
              {existe && <Button type="button" variant="ghost" className="text-rose-400" onClick={removerDivisao}>Remover divisão</Button>}
              <Button type="button" variant="outline" onClick={onFechar}>Fechar</Button>
              <Button type="button" onClick={salvar} disabled={salvando || erros.length > 0} className="gap-2" data-testid="salvar-divisao">
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar divisão
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Cartão na página da tela: mostra se a tela está dividida e abre o editor. */
export function DivisaoDaTela({ tela }: { tela: TelaResumo }) {
  const [aberto, setAberto] = useState(false);
  const [zonas, setZonas] = useState<number | null>(null);

  const contar = useCallback(async () => {
    const { data: l } = await supabase.from('screen_layouts' as never).select('id').eq('screen_id', tela.id).maybeSingle();
    const id = (l as { id: string } | null)?.id;
    if (!id) { setZonas(0); return; }
    const { count } = await supabase.from('layout_zones' as never).select('id', { count: 'exact', head: true }).eq('layout_id', id);
    setZonas(count ?? 0);
  }, [tela.id]);
  useEffect(() => { contar(); }, [contar]);

  return (
    <Card className="glass border-border/60 mb-6" data-testid="cartao-divisao-da-tela">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2"><LayoutGrid className="h-5 w-5 text-primary" /> Divisão da tela (zonas)</span>
          <Badge variant="outline">{zonas === null ? '…' : zonas > 0 ? `${zonas} zona(s)` : 'Tela cheia'}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-0">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          Divida a tela em várias áreas, cada uma com a sua playlist — por exemplo, anúncios em 75% da tela e um anunciante fixo nos outros 25%.
        </p>
        <Button type="button" onClick={() => setAberto(true)} className="gap-2" data-testid="abrir-editor-zonas"><LayoutGrid className="h-4 w-4" /> {zonas ? 'Editar divisão' : 'Dividir a tela'}</Button>
      </CardContent>
      {aberto && <EditorDeZonas tela={tela} aberto={aberto} onFechar={() => setAberto(false)} onSalvo={contar} />}
    </Card>
  );
}
