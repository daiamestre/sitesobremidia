import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AppWindow, Clock, Eye, EyeOff, Film, Image as ImageIcon, Loader2, Palette, Play, Smartphone, Wifi, X,
} from 'lucide-react';
import { CartaoDaVitrine } from '@/components/launcher/CartaoDaVitrine';
import { SeletorDeMidiasLauncher } from '@/components/launcher/SeletorDeMidiasLauncher';
import { paletaDaLauncher, type PaletaDaLauncher } from '@/lib/temaLauncher';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { appOcultoNaLauncher, ehAjustesDoSistema, nomeDaRegra, regraQueOculta } from '@/lib/launcherApps';
import {
  adicionarAoFundo, atualizarItemDoFundo, carregarAppsVistos, carregarConfig, carregarFundo, empresaDaConta,
  midiasPorId, removerDoFundo, salvarConfig, VITRINES, type ConfigLauncher, type ItemDeFundo, type MidiaEscolhivel, type Vitrine,
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

function TelaDaPrevia({ midia, formato, pal }: { midia: ItemDeFundo['media'] | null; formato: '16:9' | '9:16'; pal: PaletaDaLauncher | null }) {
  // F-215: na TV não aparece "TV 16:9"/"TOTEM 9:16" (só nos cartões de edição abaixo); fundo e fio de luz na cor do app
  return (
    <div className={`relative overflow-hidden rounded-[1cqw] border border-cyan-400/30 bg-[#0A1230]/90 ${formato === '16:9' ? 'aspect-video h-[48.5%]' : 'aspect-[9/16] h-full'}`}
      style={pal ? { background: pal.tela, borderColor: `${pal.brilho}4D` } : undefined} data-testid="previa-tela">
      {midia ? <Miniatura midia={midia} className="absolute inset-0 h-full w-full" />
        : <div className="absolute inset-0 flex items-center justify-center text-[1.3cqw] font-black text-indigo-300/60">SOBRE MÍDIA</div>}
    </div>
  );
}

/**
 * Prévia igual à launcher do aparelho (F-209/F-211): topo com a logo, Destaques grande e centralizado (só as 4
 * telas) e, embaixo, Sobre Mídia Player e Menu, com o selo "App Oficial" no canto. Fundo: padrão, cor escolhida ou imagem de capa.
 * F-213: a cor escolhida também pinta os botões (o app inteiro), inclusive por cima da imagem de capa.
 */
function Previa({ fundo, cfg, capa }: { fundo: ItemDeFundo[]; cfg: ConfigLauncher | null; capa: MidiaEscolhivel | null }) {
  const primeiroDa = (v: Vitrine) => fundo.find((f) => f.ativo && (f.vitrine ?? 'tv1') === v)?.media ?? null;
  const fundoDaTela = capa?.file_url
    ? undefined
    : cfg?.fundo_cor ? { background: `linear-gradient(135deg, ${cfg.fundo_cor}, color-mix(in srgb, ${cfg.fundo_cor} 45%, black))` } : undefined;
  // F-213: a cor escolhida pinta o app inteiro (mesma conta do aparelho), com ou sem imagem de capa
  const pal = paletaDaLauncher(cfg?.fundo_cor);
  const botao = pal ? { background: `linear-gradient(315deg, ${pal.botaoInicio}, ${pal.botaoFim})` } : undefined;
  // F-215: o brilho da seleção e o selo "App Oficial" também na cor do app
  const selecionado = pal ? { ...botao, borderColor: pal.brilho, boxShadow: `0 0 1.4cqw ${pal.brilho}99` } : undefined;
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl border bg-[linear-gradient(315deg,#050A1F,#0B1A4A_55%,#14105A)] text-white"
      style={fundoDaTela} data-testid="previa-launcher">
      {capa?.file_url && (
        <>
          <img src={capa.file_url} alt="" className="absolute inset-0 h-full w-full object-cover" data-testid="previa-capa" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#050A1F]/60 via-[#050A1F]/30 to-[#050A1F]/70"
            style={pal ? { background: `linear-gradient(to bottom, ${pal.veu}, transparent 45%, ${pal.veu})` } : undefined} />
        </>
      )}
      {!capa?.file_url && !cfg?.fundo_cor && <div className="absolute -left-[10%] top-[-30%] h-[70%] w-[70%] rotate-[-28deg] bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent" />}
      <div className="absolute inset-0 flex flex-col p-[3.1cqw]">
        <div className="flex items-center gap-[1cqw] text-[1.4cqw]">
          <span className="rounded-[0.8cqw] bg-white/10 px-[1cqw] py-[0.5cqw] text-[1.7cqw] font-bold">Logo da empresa</span>
          <span className="ml-auto" />
          {cfg?.mostrar_clima !== false && <span className="rounded-full border border-white/20 bg-black/30 px-[1cqw] py-[0.3cqw]">31°C</span>}
          {cfg?.mostrar_wifi !== false && <span className="rounded-full border border-indigo-400/40 bg-slate-900/60 px-[1cqw] py-[0.3cqw]">Wi-Fi <span className="text-green-400">●</span></span>}
          {cfg?.mostrar_relogio !== false && (
            <span className="text-right leading-none"><span className="block text-[2.9cqw] font-bold">14:32</span><span className="text-[1.1cqw] text-slate-400">20/10/2026</span></span>
          )}
        </div>
        <div className="mt-[1.3cqw] flex min-h-0 flex-1 items-center justify-center gap-[0.9cqw]">
          <div className="flex h-full flex-col justify-between">
            {(['tv1', 'tv2'] as const).map((v) => <TelaDaPrevia key={v} midia={primeiroDa(v)} formato="16:9" pal={pal} />)}
          </div>
          {(['totem1', 'totem2'] as const).map((v) => <TelaDaPrevia key={v} midia={primeiroDa(v)} formato="9:16" pal={pal} />)}
        </div>
        <div className="relative mt-[1.4cqw] flex justify-center gap-[1.9cqw]">
          {/* F-211: selo "App Oficial" no canto inferior esquerdo, neon com verificado azul */}
          <span className="absolute bottom-0 left-0 flex items-center gap-[0.5cqw] rounded-full border border-cyan-400/80 bg-[#050A1F]/80 px-[1cqw] py-[0.5cqw] text-[1.05cqw] font-bold text-cyan-50 shadow-[0_0_1cqw_rgba(0,212,255,0.45)]"
            style={pal ? { borderColor: pal.brilho, background: `${pal.gaveta.slice(0, 7)}CC`, boxShadow: `0 0 1cqw ${pal.brilho}73` } : undefined} data-testid="previa-selo">
            <span className="flex h-[1.7cqw] w-[1.7cqw] items-center justify-center rounded-full bg-sky-500 text-[1cqw] leading-none"
              style={pal ? { background: pal.verificado } : undefined}>✓</span>App Oficial
          </span>
          {/* Player e Menu da mesma cor; o selecionado (Player ao abrir) ganha o brilho neon azul */}
          <div className="flex h-[8.1cqw] w-[24.9cqw] items-center gap-[1.1cqw] rounded-[2.3cqw] border border-cyan-200 bg-gradient-to-br from-indigo-600 to-violet-600 px-[2.3cqw] shadow-[0_0_1.4cqw_rgba(0,212,255,0.6)]"
            style={selecionado} data-testid="previa-botao-player">
            <span className="text-[2.6cqw] leading-none">▶</span>
            <span className="leading-tight"><span className="block whitespace-nowrap text-[1.55cqw] font-bold">Sobre Mídia Player</span><span className="text-[0.95cqw] opacity-85">abre sozinho em {cfg?.segundos_para_abrir_player ?? 30} s</span></span>
          </div>
          <div className="flex h-[8.1cqw] w-[24.9cqw] items-center justify-center gap-[1.1cqw] rounded-[2.3cqw] border border-white/20 bg-gradient-to-br from-indigo-600/90 to-violet-600/90"
            style={botao} data-testid="previa-botao-menu">
            <span className="text-[2.6cqw] leading-none">▦</span>
            <span className="text-[1.65cqw] font-bold">Menu</span>
          </div>
        </div>
      </div>
    </div>
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
  const [escolhendoCapa, setEscolhendoCapa] = useState(false);
  const [novaRegra, setNovaRegra] = useState('');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { if (config.data) setCfg(config.data); }, [config.data]);
  const capaId = cfg?.capa_media_id ?? null;
  const capa = useQuery({ queryKey: ['launcher-capa', capaId], queryFn: async () => (await midiasPorId([capaId!]))[0] ?? null, enabled: !!capaId });

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
  /** F-213: nova ordem da lista de reprodução de uma tela (arrastar ou setas): renumera só o que mudou. */
  const reordenar = async (nova: ItemDeFundo[]) => {
    try {
      await Promise.all(nova.map((it, j) => (it.ordem !== j ? atualizarItemDoFundo(it.id, { ordem: j }) : null)));
    } catch (e) { toast.error(`Não foi possível reordenar: ${(e as Error).message}`); }
    recarregarFundo();
  };
  const atualizarItem = async (id: string, mudanca: Partial<Pick<ItemDeFundo, 'duracao_s' | 'ativo' | 'vitrine'>>) => {
    try {
      // mudou de tela: entra no fim da lista da tela nova
      await atualizarItemDoFundo(id, mudanca.vitrine ? { ...mudanca, ordem: daTela(mudanca.vitrine).length } : mudanca);
    } catch (e) { toast.error(`Não foi possível salvar: ${(e as Error).message}`); }
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
            <div style={{ containerType: 'inline-size' }}><Previa fundo={itens} cfg={cfg} capa={capaId ? capa.data ?? null : null} /></div>
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

      {cfg && (
        <Card data-testid="fundo-launcher">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Palette className="h-4 w-4" />Fundo e cor do app</CardTitle>
            <p className="text-xs text-muted-foreground">
              A cor escolhida pinta o fundo e o app inteiro no aparelho (botões Player e Menu, opções do Menu e pílulas). A imagem de capa entra
              por trás e o app continua na cor escolhida. Trocar de cor volta o fundo para a cor (a capa sai; escolha a imagem de novo se quiser).
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant={!cfg.fundo_cor && !cfg.capa_media_id ? 'default' : 'outline'} data-testid="fundo-padrao"
                onClick={() => setCfg({ ...cfg, fundo_cor: null, capa_media_id: null })}>Padrão Sobre Mídia</Button>
              <Button type="button" size="sm" variant={cfg.fundo_cor ? 'default' : 'outline'} data-testid="fundo-cor-modo"
                onClick={() => setCfg({ ...cfg, capa_media_id: null, fundo_cor: cfg.fundo_cor ?? '#1E1B4B' })}>Cor</Button>
              <Button type="button" size="sm" variant={cfg.capa_media_id ? 'default' : 'outline'} data-testid="fundo-capa"
                onClick={() => setEscolhendoCapa(true)}>{cfg.capa_media_id ? 'Trocar imagem de capa' : 'Imagem de capa'}</Button>
            </div>
            {cfg.fundo_cor && (
              <div className="flex flex-wrap items-center gap-3" data-testid="paleta-de-cores">
                {/* F-213: escolher uma cor (outra ou a mesma) volta o fundo para a cor e tira a capa; o app fica nessa cor */}
                <input type="color" aria-label="Cor do app" value={cfg.fundo_cor} onChange={(e) => setCfg({ ...cfg, fundo_cor: e.target.value.toUpperCase(), capa_media_id: null })}
                  className="h-10 w-14 cursor-pointer rounded border bg-transparent p-0.5" data-testid="fundo-cor" />
                {['#0F172A', '#1E1B4B', '#312E81', '#4C1D95', '#0C4A6E', '#064E3B', '#15803D', '#7F1D1D', '#B45309', '#111827'].map((c) => (
                  <button key={c} type="button" aria-label={`Cor ${c}`} onClick={() => setCfg({ ...cfg, fundo_cor: c, capa_media_id: null })}
                    className={`h-8 w-8 rounded-full border-2 ${cfg.fundo_cor === c ? 'border-primary ring-2 ring-primary/40' : 'border-transparent'}`} style={{ background: c }} />
                ))}
                <span className="font-mono text-xs text-muted-foreground">{cfg.fundo_cor}</span>
                {paletaDaLauncher(cfg.fundo_cor) && (
                  <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground" data-testid="amostra-do-tema">
                    Botões:
                    <span className="h-6 w-14 rounded-full border border-white/20" style={{ background: `linear-gradient(315deg, ${paletaDaLauncher(cfg.fundo_cor)!.botaoInicio}, ${paletaDaLauncher(cfg.fundo_cor)!.botaoFim})` }} />
                  </span>
                )}
              </div>
            )}
            {cfg.capa_media_id && (
              <div className="flex flex-wrap items-center gap-3">
                <Miniatura midia={capa.data ?? null} className="h-16 w-28 rounded" />
                <span className="min-w-0 flex-1 truncate text-sm">{capa.data?.name ?? 'Carregando…'}{cfg.fundo_cor ? ` · app na cor ${cfg.fundo_cor}` : ''}</span>
                <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => setCfg({ ...cfg, capa_media_id: null })}>Tirar capa</Button>
              </div>
            )}
            {alterado && <p className="text-xs text-amber-600">Clique em "Salvar alterações" (no alto da página) para levar o fundo aos aparelhos.</p>}
          </CardContent>
        </Card>
      )}

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
          {/* F-213: um cartão futurista por tela, cada um com a sua lista de reprodução (quantas mídias quiser) */}
          <div className="grid gap-4 md:grid-cols-2" data-testid="vitrines-launcher">
            {VITRINES.map((v) => (
              <CartaoDaVitrine key={v.id} vitrine={v} itens={daTela(v.id)} onAdicionar={() => setEscolhendo(v.id)}
                onReordenar={reordenar} onAtualizar={atualizarItem}
                onAdicionarMidias={async (m) => {
                  try {
                    await adicionarAoFundo(emp, m, v.id, daTela(v.id).length);
                    toast.success(`${m.length} mídia(s) em ${v.nome}.`);
                  } catch (e) { toast.error(`Não foi possível adicionar: ${(e as Error).message}`); }
                  await recarregarFundo();
                }}
                onRemover={async (id) => {
                  try { await removerDoFundo(id); toast.success('Mídia removida dos destaques.'); } catch (e) { toast.error((e as Error).message); }
                  recarregarFundo();
                }} />
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
          <p>4. Na página de cada tela: botões "Launcher Sobre Mídia" e "Launcher original". No aparelho: o selo "App Oficial" (canto inferior esquerdo) é o botão que volta para a launcher original.</p>
        </CardContent>
      </Card>

      <SeletorDeMidiasLauncher aberto={escolhendoCapa} empresa={emp} capa titulo="Imagem de capa da launcher"
        descricao="Uma imagem para o fundo inteiro da launcher (de preferência 1920x1080, deitada). Os botões e a hora continuam legíveis por cima."
        onFechar={() => setEscolhendoCapa(false)} onEscolher={async (m) => {
          if (!cfg || !m[0]) return;
          // F-213: a capa entra por trás e o app continua na cor escolhida
          const proxima: ConfigLauncher = { ...cfg, capa_media_id: m[0].id };
          setCfg(proxima);
          await salvar(proxima);
        }} />

      <SeletorDeMidiasLauncher aberto={!!escolhendo} empresa={emp} formato={VITRINES.find((v) => v.id === escolhendo)?.formato}
        titulo={`Destaques Sobre Mídia — ${VITRINES.find((v) => v.id === escolhendo)?.nome ?? ''} (${VITRINES.find((v) => v.id === escolhendo)?.formato ?? ''})`}
        descricao={`Pontos parceiros e tutoriais do sistema. Use mídias ${VITRINES.find((v) => v.id === escolhendo)?.formato === '9:16' ? 'em pé (9:16), como no totem' : 'deitadas (16:9), como na TV'}. Vídeos tocam sem som.`}
        onFechar={() => setEscolhendo(null)} onEscolher={async (m) => {
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
