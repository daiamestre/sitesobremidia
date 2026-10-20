import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AppWindow, ArrowDown, ArrowUp, Clock, Eye, EyeOff, Film, Image as ImageIcon, Loader2, Palette, Play, Plus, Search, Smartphone, Trash2, Wifi, X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { appOcultoNaLauncher, ehAjustesDoSistema, nomeDaRegra, regraQueOculta } from '@/lib/launcherApps';
import {
  adicionarAoFundo, atualizarItemDoFundo, buscarMidias, carregarAppsVistos, carregarConfig, carregarFundo, empresaDaConta,
  removerDoFundo, salvarConfig, type ConfigLauncher, type ItemDeFundo, type MidiaEscolhivel,
} from '@/services/launcher.service';

// ────────────────────────────────────────────────────────────────────────────────────────────────
// F-200 — LAUNCHER SOBRE MÍDIA (OWNER/ADM)
// O Player Sobre Mídia (a partir do 5.8.0, versão de teste) pode ser a tela inicial do aparelho. Aqui o dono e o ADM
// escolhem as mídias de fundo, quanto tempo a launcher espera para abrir o Player sozinha, o tempo de uso livre e os
// aplicativos que não aparecem nela. A logo de cada aparelho é a "Minha Marca" do gestor logado nele.
// ────────────────────────────────────────────────────────────────────────────────────────────────

const ehVideo = (t?: string | null) => (t ?? '').startsWith('video');

function Miniatura({ midia, className }: { midia?: MidiaEscolhivel | null; className?: string }) {
  if (!midia) return <div className={`bg-muted ${className ?? ''}`} />;
  const capa = midia.thumbnail_url || (!ehVideo(midia.file_type) ? midia.file_url : null);
  return capa
    ? <img src={capa} alt="" loading="lazy" className={`object-cover ${className ?? ''}`} />
    : <div className={`flex items-center justify-center bg-muted ${className ?? ''}`}><Film className="h-6 w-6 text-muted-foreground" /></div>;
}

/** Prévia igual à launcher do aparelho (F-200, visual futurista): topo, destaque com as mídias e 4 cartões. */
function Previa({ fundo, cfg }: { fundo: ItemDeFundo[]; cfg: ConfigLauncher | null }) {
  const primeiro = fundo.find((f) => f.ativo)?.media ?? null;
  const cartoes = [
    { nome: 'Player Sobre Mídia', sub: `abre sozinho em ${cfg?.segundos_para_abrir_player ?? 30} s`, cor: 'from-indigo-600 to-violet-600', icone: '▶' },
    { nome: 'Aplicativos', sub: 'apps do aparelho', cor: 'from-violet-700 to-fuchsia-700', icone: '▦' },
    { nome: 'Loja de apps', sub: 'Play Store', cor: 'from-emerald-600 to-teal-600', icone: '🛍' },
    { nome: 'Ajustes', sub: 'do aparelho', cor: 'from-sky-700 to-cyan-600', icone: '⚙' },
  ];
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl border bg-[linear-gradient(315deg,#050A1F,#0B1A4A_55%,#14105A)] text-white" data-testid="previa-launcher">
      <div className="absolute -left-[10%] top-[-30%] h-[70%] w-[70%] rotate-[-28deg] bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent" />
      <div className="absolute inset-0 flex flex-col gap-[3cqw] p-[3.4cqw]">
        <div className="flex items-center gap-[1.2cqw] text-[1.5cqw]">
          <span className="rounded-[0.8cqw] bg-white/10 px-[1cqw] py-[0.6cqw] text-[1.9cqw] font-bold">Logo do gestor</span>
          <span className="ml-auto" />
          {cfg?.mostrar_clima !== false && <span className="rounded-full border border-white/20 bg-black/30 px-[1cqw] py-[0.3cqw]">31°C</span>}
          {cfg?.mostrar_wifi !== false && <span className="rounded-full border border-indigo-400/40 bg-slate-900/60 px-[1cqw] py-[0.3cqw]">Wi-Fi <span className="text-green-400">●</span></span>}
          {cfg?.mostrar_relogio !== false && (
            <span className="text-right leading-none"><span className="block text-[3cqw] font-bold">14:32</span><span className="text-[1.2cqw] text-slate-400">20/10/2026</span></span>
          )}
        </div>
        <div className="flex min-h-0 flex-1 gap-[1.8cqw]">
          <div className="relative flex-[1.35] overflow-hidden rounded-[2cqw] border-2 border-violet-400/60 bg-[#0B1230]">
            {primeiro
              ? <Miniatura midia={primeiro} className="absolute inset-0 h-full w-full" />
              : <div className="absolute inset-0 flex items-center justify-center text-[3cqw] font-black text-indigo-300/80">SOBRE MÍDIA</div>}
            <div className="absolute inset-0 bg-gradient-to-t from-[#050A1F]/90 via-transparent to-transparent" />
            <div className="absolute bottom-[1.6cqw] left-[1.6cqw]">
              <span className="rounded-full border border-indigo-400/50 bg-slate-900/70 px-[0.9cqw] text-[1cqw] font-bold tracking-widest text-cyan-400">SOBRE MÍDIA</span>
              <p className="mt-[0.4cqw] text-[1.7cqw] font-bold">Destaques dos pontos parceiros</p>
            </div>
          </div>
          <div className="grid flex-1 grid-cols-2 grid-rows-2 gap-[1.4cqw]">
            {cartoes.map((c) => (
              <div key={c.nome} className={`flex flex-col items-center justify-center rounded-[1.8cqw] border border-white/20 bg-gradient-to-br ${c.cor} text-center`}>
                <span className="text-[3.4cqw] leading-none">{c.icone}</span>
                <span className="mt-[0.6cqw] text-[1.5cqw] font-bold">{c.nome}</span>
                <span className="text-[1.1cqw] opacity-85">{c.sub}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-[1cqw] text-[1.2cqw]">
          <span className="rounded-full border border-indigo-400/40 bg-slate-900/60 px-[1.2cqw] py-[0.4cqw]">↩ Launcher original</span>
        </div>
      </div>
    </div>
  );
}

function EscolherMidias({ aberto, onFechar, onEscolher }: {
  aberto: boolean; onFechar: () => void; onEscolher: (m: MidiaEscolhivel[]) => Promise<void>;
}) {
  const [busca, setBusca] = useState('');
  const [termo, setTermo] = useState('');
  const [marcadas, setMarcadas] = useState<Map<string, MidiaEscolhivel>>(new Map());
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { const t = setTimeout(() => setTermo(busca), 350); return () => clearTimeout(t); }, [busca]);
  useEffect(() => { if (!aberto) { setMarcadas(new Map()); setBusca(''); } }, [aberto]);
  const midias = useQuery({ queryKey: ['launcher-midias', termo], queryFn: () => buscarMidias(termo), enabled: aberto });
  const alternar = (m: MidiaEscolhivel) => setMarcadas((atual) => {
    const novo = new Map(atual);
    if (novo.has(m.id)) novo.delete(m.id); else novo.set(m.id, m);
    return novo;
  });
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Mídias de fundo da launcher</DialogTitle>
          <DialogDescription>Escolha fotos e vídeos (dos pontos parceiros, da Sobre Mídia ou da Biblioteca). Vídeos tocam sem som.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pelo nome da mídia" className="pl-9" />
        </div>
        <div className="grid max-h-[50vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-4">
          {midias.isLoading && <p className="col-span-full py-6 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Buscando…</p>}
          {midias.data?.map((m) => {
            const marcada = marcadas.has(m.id);
            return (
              <button key={m.id} type="button" onClick={() => alternar(m)}
                className={`group overflow-hidden rounded-lg border text-left transition ${marcada ? 'border-primary ring-2 ring-primary' : 'hover:border-primary/50'}`}>
                <div className="relative">
                  <Miniatura midia={m} className="aspect-video w-full" />
                  <Badge variant="secondary" className="absolute left-1 top-1 h-5 px-1.5 text-[10px]">{ehVideo(m.file_type) ? 'Vídeo' : 'Foto'}</Badge>
                </div>
                <p className="truncate px-2 py-1 text-xs">{m.name}</p>
              </button>
            );
          })}
          {midias.data && midias.data.length === 0 && <p className="col-span-full py-6 text-center text-sm text-muted-foreground">Nenhuma mídia encontrada.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button disabled={!marcadas.size || salvando} onClick={async () => {
            setSalvando(true);
            try { await onEscolher([...marcadas.values()]); onFechar(); } finally { setSalvando(false); }
          }}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Adicionar {marcadas.size || ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function LauncherPage() {
  const qc = useQueryClient();
  const empresa = useQuery({ queryKey: ['launcher-empresa'], queryFn: empresaDaConta, staleTime: Infinity });
  const emp = empresa.data ?? null;
  const config = useQuery({ queryKey: ['launcher-config', emp], queryFn: () => carregarConfig(emp!), enabled: !!emp });
  const fundo = useQuery({ queryKey: ['launcher-fundo', emp], queryFn: () => carregarFundo(emp!), enabled: !!emp });
  const apps = useQuery({ queryKey: ['launcher-apps', emp], queryFn: () => carregarAppsVistos(emp!), enabled: !!emp });
  const [cfg, setCfg] = useState<ConfigLauncher | null>(null);
  const [escolhendo, setEscolhendo] = useState(false);
  const [novaRegra, setNovaRegra] = useState('');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { if (config.data) setCfg(config.data); }, [config.data]);

  const alterado = !!cfg && !!config.data && JSON.stringify(cfg) !== JSON.stringify(config.data);
  const salvar = async (proxima?: ConfigLauncher) => {
    const alvo = proxima ?? cfg;
    if (!alvo) return;
    setSalvando(true);
    try {
      await salvarConfig(alvo);
      await qc.invalidateQueries({ queryKey: ['launcher-config', emp] });
      toast.success('Launcher salva. Os aparelhos aplicam em até 1 minuto (ao abrir a launcher).');
    } catch (e) {
      toast.error(`Não foi possível salvar: ${(e as Error).message}`);
    } finally { setSalvando(false); }
  };

  const itens = fundo.data ?? [];
  const recarregarFundo = () => qc.invalidateQueries({ queryKey: ['launcher-fundo', emp] });
  const mover = async (i: number, d: -1 | 1) => {
    const a = itens[i]; const b = itens[i + d];
    if (!a || !b) return;
    await Promise.all([atualizarItemDoFundo(a.id, { ordem: i + d }), atualizarItemDoFundo(b.id, { ordem: i })]);
    // normaliza as demais posições
    await Promise.all(itens.map((it, j) => (j !== i && j !== i + d && it.ordem !== j) ? atualizarItemDoFundo(it.id, { ordem: j }) : null));
    recarregarFundo();
  };

  const listaDeApps = useMemo(() => (apps.data ?? []).map((a) => ({
    ...a,
    oculto: cfg ? appOcultoNaLauncher(a.pacote, a.nome, cfg.apps_ocultos, cfg.apps_liberados) : false,
    regra: cfg ? regraQueOculta(a.pacote, a.nome, cfg.apps_ocultos) : null,
  })), [apps.data, cfg]);

  const alternarApp = (pacote: string, nome: string) => {
    if (!cfg) return;
    const oculto = appOcultoNaLauncher(pacote, nome, cfg.apps_ocultos, cfg.apps_liberados);
    let ocultos = cfg.apps_ocultos.filter((r) => r !== pacote);
    let liberados = cfg.apps_liberados.filter((r) => r !== pacote);
    if (oculto) {
      // mostrar: tira a regra do próprio app; se outra regra ainda o esconde, libera só ele
      if (appOcultoNaLauncher(pacote, nome, ocultos, liberados)) liberados = [...liberados, pacote];
    } else if (!appOcultoNaLauncher(pacote, nome, ocultos, liberados)) {
      ocultos = [...ocultos, pacote]; // esconder só este app
    }
    const proxima: ConfigLauncher = { ...cfg, apps_ocultos: ocultos, apps_liberados: liberados };
    setCfg(proxima);
    void salvar(proxima);
  };

  if (empresa.isLoading || (emp && (config.isLoading || fundo.isLoading))) {
    return <div className="flex items-center justify-center p-12 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Carregando a launcher…</div>;
  }
  if (!emp || config.isError) {
    return <div className="p-8 text-center text-muted-foreground">Só o dono e o ADM da empresa configuram a launcher.</div>;
  }

  return (
    <div className="space-y-6 p-4 md:p-6" data-testid="pagina-launcher">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Smartphone className="h-6 w-6 text-primary" />Launcher Sobre Mídia</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            A tela inicial dos aparelhos que usam a launcher: aparece ao ligar e ao sair do Player, com o Player em destaque.
            Vale a partir do Player 5.8.0 (versão de teste). Só o dono e o ADM mudam o que está aqui.
          </p>
        </div>
        {alterado && (
          <Button onClick={() => salvar()} disabled={salvando}>{salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar alterações</Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Como fica no aparelho</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div style={{ containerType: 'inline-size' }}><Previa fundo={itens} cfg={cfg} /></div>
            <p className="flex items-start gap-2 rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
              <Palette className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              A logo é a de cada gestor de mídia (a "Minha Marca" de quem está logado no aparelho); sem marca, aparece a da Sobre Mídia.
              <Link to="/dashboard/marca" className="ml-auto shrink-0 text-primary hover:underline">Minha Marca</Link>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Clock className="h-4 w-4" />Comportamento</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {cfg && (
              <>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Abrir o Player sozinho depois de (segundos sem ninguém mexer)</span>
                  <Input type="number" min={5} max={3600} value={cfg.segundos_para_abrir_player}
                    onChange={(e) => setCfg({ ...cfg, segundos_para_abrir_player: Math.max(5, Math.min(3600, Number(e.target.value) || 30)) })} />
                  <span className="text-xs text-muted-foreground">Só nos aparelhos que já estão numa tela. Ao ligar o aparelho, a launcher aparece e o Player abre após esse tempo.</span>
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Uso livre (minutos)</span>
                  <Input type="number" min={1} max={1440} value={cfg.minutos_de_uso_livre}
                    onChange={(e) => setCfg({ ...cfg, minutos_de_uso_livre: Math.max(1, Math.min(1440, Number(e.target.value) || 30)) })} />
                  <span className="text-xs text-muted-foreground">Ao abrir um app, os Ajustes ou a launcher original, o Player não puxa a tela de volta durante esse tempo.</span>
                </label>
                <div className="grid gap-2 sm:grid-cols-3">
                  {([['mostrar_relogio', 'Hora', Clock], ['mostrar_clima', 'Temperatura', Eye], ['mostrar_wifi', 'Wi-Fi', Wifi]] as const).map(([chave, rotulo, Icone]) => (
                    <label key={chave} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                      <span className="flex items-center gap-1.5"><Icone className="h-3.5 w-3.5" />{rotulo}</span>
                      <Switch checked={cfg[chave]} onCheckedChange={(v) => setCfg({ ...cfg, [chave]: v })} />
                    </label>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><ImageIcon className="h-4 w-4" />Mídias de fundo ({itens.length})</CardTitle>
          <Button size="sm" onClick={() => setEscolhendo(true)} className="gap-1.5"><Plus className="h-4 w-4" />Adicionar mídias</Button>
        </CardHeader>
        <CardContent>
          {itens.length === 0 && (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Sem mídias: a launcher mostra o fundo padrão da Sobre Mídia. Adicione fotos e vídeos dos pontos parceiros.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {itens.map((it, i) => (
              <div key={it.id} className={`flex gap-3 rounded-lg border p-2 ${it.ativo ? '' : 'opacity-50'}`}>
                <Miniatura midia={it.media} className="h-20 w-32 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="truncate text-sm font-medium">{it.media?.name ?? 'Mídia removida'}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{ehVideo(it.media?.file_type) ? 'Vídeo' : 'Foto'}</Badge>
                    {!ehVideo(it.media?.file_type) && (
                      <span className="flex items-center gap-1">
                        <Input type="number" min={3} max={600} defaultValue={it.duracao_s} className="h-7 w-16 px-2 text-xs"
                          onBlur={async (e) => {
                            const v = Math.max(3, Math.min(600, Number(e.target.value) || 10));
                            if (v !== it.duracao_s) { await atualizarItemDoFundo(it.id, { duracao_s: v }); recarregarFundo(); }
                          }} />s
                      </span>
                    )}
                    {ehVideo(it.media?.file_type) && <span>toca inteiro, sem som</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Subir"><ArrowUp className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === itens.length - 1} onClick={() => mover(i, 1)} aria-label="Descer"><ArrowDown className="h-3.5 w-3.5" /></Button>
                    <Switch checked={it.ativo} onCheckedChange={async (v) => { await atualizarItemDoFundo(it.id, { ativo: v }); recarregarFundo(); }} aria-label="Ativa" />
                    <Button size="icon" variant="ghost" className="ml-auto h-7 w-7 text-destructive" aria-label="Remover"
                      onClick={async () => { await removerDoFundo(it.id); recarregarFundo(); toast.success('Mídia removida do fundo.'); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><AppWindow className="h-4 w-4" />Aplicativos na launcher</CardTitle>
          <p className="text-xs text-muted-foreground">
            YouTube, Netflix e apps de TV ficam fora da launcher Sobre Mídia (continuam funcionando na launcher original do aparelho).
            Os demais aparecem. Clique num app para mostrar ou esconder.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {cfg && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Regras de ocultar (pacote ou nome que contém)</p>
              <div className="flex flex-wrap gap-1.5">
                {cfg.apps_ocultos.map((r) => (
                  <Badge key={r} variant="secondary" className="gap-1 pr-1">
                    {nomeDaRegra(r)}
                    <button type="button" aria-label={`Tirar ${r}`} className="rounded p-0.5 hover:bg-background/60"
                      onClick={() => setCfg({ ...cfg, apps_ocultos: cfg.apps_ocultos.filter((x) => x !== r) })}><X className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
              <form className="flex gap-2" onSubmit={(e) => {
                e.preventDefault();
                const r = novaRegra.trim().toLowerCase();
                if (r && !cfg.apps_ocultos.includes(r)) setCfg({ ...cfg, apps_ocultos: [...cfg.apps_ocultos, r] });
                setNovaRegra('');
              }}>
                <Input value={novaRegra} onChange={(e) => setNovaRegra(e.target.value)} placeholder="ex.: tiktok ou com.empresa.app" className="max-w-xs" />
                <Button type="submit" variant="outline" size="sm">Ocultar</Button>
              </form>
            </div>
          )}
          <div>
            <p className="mb-2 text-sm font-medium">Apps encontrados nos aparelhos ({listaDeApps.length})</p>
            {listaDeApps.length === 0 && (
              <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                Os aparelhos com o Player 5.8.0 enviam a lista de apps ao abrir a launcher.
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {listaDeApps.map((a) => (
                <button key={a.pacote} type="button" onClick={() => !ehAjustesDoSistema(a.pacote) && alternarApp(a.pacote, a.nome)}
                  className={`flex items-center gap-2 rounded-md border p-2 text-left transition hover:border-primary/50 ${a.oculto ? 'opacity-60' : ''}`}>
                  {a.oculto ? <EyeOff className="h-4 w-4 shrink-0 text-muted-foreground" /> : <Eye className="h-4 w-4 shrink-0 text-green-500" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{a.nome}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{a.pacote} · {a.aparelhos} aparelho(s)</span>
                  </span>
                  <Badge variant={a.oculto ? 'outline' : 'secondary'} className="shrink-0 text-[10px]">
                    {ehAjustesDoSistema(a.pacote) ? 'botão Ajustes' : a.oculto ? (a.regra ? `oculto: ${nomeDaRegra(a.regra)}` : 'oculto') : 'aparece'}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Play className="h-4 w-4" />Como colocar a launcher num aparelho</CardTitle></CardHeader>
        <CardContent className="space-y-1.5 text-sm text-muted-foreground">
          <p>1. Instale o Player 5.8.0 (versão de teste) no aparelho. Na abertura ele pergunta se quer usar a launcher Sobre Mídia; quem disser "Agora não" usa o Player normalmente pela launcher original.</p>
          <p>2. Aparelho com root ou "Device Owner": vira a tela inicial sozinho. Nos outros, o Android pergunta uma vez (escolha Sobre Mídia e "Sempre").</p>
          <p>3. Aparelho que não deixa trocar a tela inicial: a launcher pede "Acesso ao uso" e volta sempre que a original aparecer (modo forçado).</p>
          <p>4. Na página de cada tela: botões "Launcher Sobre Mídia" e "Launcher original". No aparelho: botão "Launcher original".</p>
        </CardContent>
      </Card>

      <EscolherMidias aberto={escolhendo} onFechar={() => setEscolhendo(false)} onEscolher={async (m) => {
        try {
          await adicionarAoFundo(emp, m, itens.length);
          await recarregarFundo();
          toast.success(`${m.length} mídia(s) no fundo da launcher.`);
        } catch (e) { toast.error(`Não foi possível adicionar: ${(e as Error).message}`); }
      }} />
    </div>
  );
}
