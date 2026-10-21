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
  removerDoFundo, salvarConfig, VITRINES, type ConfigLauncher, type ItemDeFundo, type MidiaEscolhivel, type Vitrine,
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

function TelaDaPrevia({ midia, formato }: { midia: ItemDeFundo['media'] | null; formato: '16:9' | '9:16' }) {
  return (
    <div className={`relative overflow-hidden rounded-[0.8cqw] border border-violet-400/50 bg-[#070D24] ${formato === '16:9' ? 'aspect-video h-[46%]' : 'aspect-[9/16] h-full'}`}>
      {midia ? <Miniatura midia={midia} className="absolute inset-0 h-full w-full" />
        : <div className="absolute inset-0 flex items-center justify-center text-[1cqw] font-black text-indigo-300/70">SOBRE MÍDIA</div>}
      <span className="absolute bottom-[0.4cqw] right-[0.4cqw] rounded-full bg-slate-950/80 px-[0.5cqw] text-[0.7cqw] font-bold text-cyan-400">{formato === '16:9' ? 'TV 16:9' : 'TOTEM 9:16'}</span>
    </div>
  );
}

/** Prévia igual à launcher do aparelho (F-200, visual futurista): topo, destaque com as mídias e 4 cartões. */
function Previa({ fundo, cfg }: { fundo: ItemDeFundo[]; cfg: ConfigLauncher | null }) {
  const primeiroDa = (v: Vitrine) => fundo.find((f) => f.ativo && (f.vitrine ?? 'tv1') === v)?.media ?? null;
  const cartoes = [
    { nome: 'Player', sub: `abre sozinho em ${cfg?.segundos_para_abrir_player ?? 30} s`, cor: 'from-indigo-600 to-violet-600', icone: '▶' },
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
          <div className="flex flex-[2.55] flex-col overflow-hidden rounded-[2cqw] border-2 border-violet-400/60 bg-[#0B1230] p-[1.2cqw]">
            <span className="self-start rounded-full border border-indigo-400/50 bg-slate-900/70 px-[0.9cqw] text-[0.9cqw] font-bold tracking-widest text-cyan-400">SOBRE MÍDIA</span>
            <p className="mt-[0.3cqw] text-[1.5cqw] font-bold">Destaques Sobre Mídia</p>
            <div className="mt-[0.8cqw] flex min-h-0 flex-1 items-center justify-center gap-[0.9cqw]">
              <div className="flex h-full flex-col justify-center gap-[0.9cqw]">
                {(['tv1', 'tv2'] as const).map((v) => <TelaDaPrevia key={v} midia={primeiroDa(v)} formato="16:9" />)}
              </div>
              {(['totem1', 'totem2'] as const).map((v) => <TelaDaPrevia key={v} midia={primeiroDa(v)} formato="9:16" />)}
            </div>
          </div>
          <div className="grid flex-1 grid-cols-2 grid-rows-2 gap-[1.2cqw] self-center" style={{ height: '70%' }}>
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

const formatoDaMidia = (m: { aspect_ratio?: string | null }) => {
  const a = (m.aspect_ratio ?? '').replace(/\s/g, '');
  if (/^9[:x/]16$/i.test(a) || a === 'vertical' || a === 'portrait') return '9:16';
  if (/^16[:x/]9$/i.test(a) || a === 'horizontal' || a === 'landscape') return '16:9';
  return null;
};

function EscolherMidias({ vitrine, onFechar, onEscolher }: {
  vitrine: Vitrine | null; onFechar: () => void; onEscolher: (m: MidiaEscolhivel[]) => Promise<void>;
}) {
  const aberto = !!vitrine;
  const tela = VITRINES.find((v) => v.id === vitrine);
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
          <DialogTitle>Destaques Sobre Mídia — {tela?.nome} ({tela?.formato})</DialogTitle>
          <DialogDescription>
            Pontos parceiros e tutoriais do sistema. Para esta tela use mídias {tela?.formato} ({tela?.formato === '9:16' ? 'em pé, como no totem' : 'deitadas, como na TV'}). Vídeos tocam sem som.
          </DialogDescription>
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
                  {formatoDaMidia(m) && (
                    <Badge variant={formatoDaMidia(m) === tela?.formato ? 'default' : 'outline'} className="absolute right-1 top-1 h-5 px-1.5 text-[10px]">{formatoDaMidia(m)}</Badge>
                  )}
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
  const [escolhendo, setEscolhendo] = useState<Vitrine | null>(null);
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
  const daTela = (v: Vitrine) => itens.filter((it) => (it.vitrine ?? 'tv1') === v);
  /** Troca a posição de duas mídias da mesma tela e renumera as demais dela. */
  const mover = async (v: Vitrine, i: number, d: -1 | 1) => {
    const lista = daTela(v);
    const a = lista[i]; const b = lista[i + d];
    if (!a || !b) return;
    const nova = [...lista]; nova[i] = b; nova[i + d] = a;
    await Promise.all(nova.map((it, j) => (it.ordem !== j ? atualizarItemDoFundo(it.id, { ordem: j }) : null)));
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
                  <Input type="number" min={5} max={60} value={Math.min(60, cfg.segundos_para_abrir_player)}
                    onChange={(e) => setCfg({ ...cfg, segundos_para_abrir_player: Math.max(5, Math.min(60, Number(e.target.value) || 30)) })} />
                  <span className="text-xs text-muted-foreground">Só nos aparelhos que já estão numa tela. Ao ligar o aparelho, a launcher aparece e o Player abre após esse tempo (no máximo 60 s).</span>
                </label>
                <div className="space-y-1 rounded-md border bg-muted/20 p-2" data-testid="regra-home-launcher">
                  <span className="text-sm font-medium">Home no Player e uso livre</span>
                  <p className="text-xs text-muted-foreground">
                    1º e 2º Home: a launcher aparece e o Player volta logo. 3º Home seguido: a pessoa fica livre (launcher, apps, Ajustes)
                    e o Player volta em 1 minuto. O Player nunca fica mais de <strong>1 minuto</strong> fora da tela (Player 5.8.8 ou mais novo).
                  </p>
                </div>
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
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><ImageIcon className="h-4 w-4" />Destaques Sobre Mídia ({itens.length})</CardTitle>
          <p className="text-xs text-muted-foreground">
            O cartão de destaque da launcher tem 4 telas: 2 TVs 16:9 e 2 totens 9:16. Cada uma passa as suas mídias — pontos parceiros e
            tutoriais mostrando o sistema funcionando em TV e em totem. Fotos trocam no tempo escolhido; vídeos tocam um de cada vez (as outras
            telas mostram um quadro do vídeo enquanto esperam), para a TV Box não travar.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4" data-testid="vitrines-launcher">
            {VITRINES.map((v) => {
              const lista = daTela(v.id);
              return (
                <div key={v.id} className="space-y-2 rounded-lg border bg-muted/10 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{v.nome} <Badge variant="outline" className="ml-1 text-[10px]">{v.formato}</Badge></p>
                    <Button size="sm" variant="outline" onClick={() => setEscolhendo(v.id)} className="h-7 gap-1 px-2 text-xs"><Plus className="h-3.5 w-3.5" />Adicionar</Button>
                  </div>
                  {lista.length === 0 && (
                    <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">Sem mídia: mostra a logo da Sobre Mídia.</p>
                  )}
                  {lista.map((it, i) => (
                    <div key={it.id} className={`flex gap-2 rounded-md border bg-background/40 p-2 ${it.ativo ? '' : 'opacity-50'}`}>
                      <Miniatura midia={it.media} className={`${v.formato === '9:16' ? 'h-20 w-12' : 'h-12 w-20'} shrink-0 rounded`} />
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="truncate text-xs font-medium">{it.media?.name ?? 'Mídia removida'}</p>
                        <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                          <Badge variant="secondary" className="h-4 px-1 text-[10px]">{ehVideo(it.media?.file_type) ? 'Vídeo' : 'Foto'}</Badge>
                          {!ehVideo(it.media?.file_type) && (
                            <span className="flex items-center gap-1">
                              <Input type="number" min={3} max={600} defaultValue={it.duracao_s} className="h-6 w-14 px-1 text-[11px]"
                                onBlur={async (e) => {
                                  const s = Math.max(3, Math.min(600, Number(e.target.value) || 10));
                                  if (s !== it.duracao_s) { await atualizarItemDoFundo(it.id, { duracao_s: s }); recarregarFundo(); }
                                }} />s
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5">
                          <Button size="icon" variant="ghost" className="h-6 w-6" disabled={i === 0} onClick={() => mover(v.id, i, -1)} aria-label="Subir"><ArrowUp className="h-3 w-3" /></Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6" disabled={i === lista.length - 1} onClick={() => mover(v.id, i, 1)} aria-label="Descer"><ArrowDown className="h-3 w-3" /></Button>
                          <Switch checked={it.ativo} onCheckedChange={async (on) => { await atualizarItemDoFundo(it.id, { ativo: on }); recarregarFundo(); }} aria-label="Ativa" className="scale-75" />
                          <select aria-label="Mudar de tela" value={v.id} className="ml-1 h-6 rounded border bg-background px-1 text-[11px]"
                            onChange={async (e) => { await atualizarItemDoFundo(it.id, { vitrine: e.target.value as Vitrine, ordem: daTela(e.target.value as Vitrine).length }); recarregarFundo(); }}>
                            {VITRINES.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                          </select>
                          <Button size="icon" variant="ghost" className="ml-auto h-6 w-6 text-destructive" aria-label="Remover"
                            onClick={async () => { await removerDoFundo(it.id); recarregarFundo(); toast.success('Mídia removida dos destaques.'); }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
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

      <EscolherMidias vitrine={escolhendo} onFechar={() => setEscolhendo(null)} onEscolher={async (m) => {
        if (!escolhendo) return;
        try {
          await adicionarAoFundo(emp, m, escolhendo, daTela(escolhendo).length);
          await recarregarFundo();
          toast.success(`${m.length} mídia(s) em ${VITRINES.find((v) => v.id === escolhendo)?.nome}.`);
        } catch (e) { toast.error(`Não foi possível adicionar: ${(e as Error).message}`); }
      }} />
    </div>
  );
}
