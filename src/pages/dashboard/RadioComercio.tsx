import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Loader2, Monitor, Music, Plus, Radio, Search, Shuffle, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { duracaoDaFaixa, duracaoTotal, radioService, type AudioDaGaleria, type FaixaDaRadio, type RadioPlaylist } from '@/lib/radio';

/**
 * F-150 — Rádio Comércio: o usuário monta a rádio do estabelecimento (músicas e promoções) com os áudios da galeria,
 * e liga essa rádio em qualquer tela — do mesmo jeito que uma playlist de mídias serve várias telas.
 */
interface TelaResumo { id: string; name: string; radio_ativa: boolean | null; radio_playlist_id: string | null }

export default function RadioComercio() {
  const { user } = useAuth();
  const [radios, setRadios] = useState<RadioPlaylist[]>([]);
  const [atual, setAtual] = useState<string | null>(null);
  const [faixas, setFaixas] = useState<FaixaDaRadio[]>([]);
  const [telas, setTelas] = useState<TelaResumo[]>([]);
  const [audios, setAudios] = useState<AudioDaGaleria[]>([]);
  const [busca, setBusca] = useState('');
  const [nome, setNome] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);

  const carregarRadios = useCallback(async (manter?: string | null) => {
    try {
      const lista = await radioService.listar();
      setRadios(lista);
      setAtual((a) => (manter && lista.some((r) => r.id === manter) ? manter : a && lista.some((r) => r.id === a) ? a : lista[0]?.id ?? null));
    } catch (e) { toast.error((e as Error).message); }
    setCarregando(false);
  }, []);

  const carregarTelas = useCallback(async () => {
    const { data } = await supabase.from('screens').select('id, name, radio_ativa, radio_playlist_id' as never).order('name');
    setTelas((data as unknown as TelaResumo[]) ?? []);
  }, []);

  useEffect(() => { carregarRadios(); carregarTelas(); }, [carregarRadios, carregarTelas]);
  useEffect(() => { if (atual) radioService.faixas(atual).then(setFaixas).catch(() => setFaixas([])); else setFaixas([]); }, [atual]);
  useEffect(() => {
    const t = setTimeout(() => { radioService.audios(busca).then(setAudios).catch(() => setAudios([])); }, 300);
    return () => clearTimeout(t);
  }, [busca]);

  const fazer = async (acao: () => Promise<void>, sucesso?: string) => {
    setOcupado(true);
    try { await acao(); if (sucesso) toast.success(sucesso); } catch (e) { toast.error((e as Error).message); } finally { setOcupado(false); }
  };

  const criar = () => fazer(async () => {
    if (!user?.id || nome.trim().length < 1) throw new Error('Dê um nome para a playlist de áudio.');
    const nova = await radioService.criar(nome, user.id);
    setNome('');
    await carregarRadios(nova.id);
  }, 'Playlist de áudio criada.');

  const excluir = (r: RadioPlaylist) => {
    if (!window.confirm(`Excluir a playlist de áudio "${r.nome}"? As telas que tocam esta rádio ficam sem áudio.`)) return;
    fazer(async () => { await radioService.excluir(r.id); await carregarRadios(); await carregarTelas(); }, 'Playlist de áudio excluída.');
  };

  const adicionar = (a: AudioDaGaleria) => atual && fazer(async () => { await radioService.adicionar(atual, a.id); setFaixas(await radioService.faixas(atual)); await carregarRadios(atual); });
  const remover = (f: FaixaDaRadio) => atual && fazer(async () => { await radioService.remover(f.id); setFaixas(await radioService.faixas(atual)); await carregarRadios(atual); });
  const mover = (i: number, passo: -1 | 1) => {
    const j = i + passo;
    if (!atual || j < 0 || j >= faixas.length) return;
    const nova = [...faixas]; [nova[i], nova[j]] = [nova[j], nova[i]];
    setFaixas(nova);
    fazer(async () => { await radioService.reordenar(nova); setFaixas(await radioService.faixas(atual)); });
  };

  const ligarNaTela = (t: TelaResumo, ligar: boolean) => atual && fazer(async () => {
    await radioService.definirSom(t.id, ligar ? 'RADIO' : 'MUDO', ligar ? atual : null);
    await carregarTelas();
  }, ligar ? `Rádio ligada em "${t.name}".` : `"${t.name}" ficou sem áudio.`);

  const radio = radios.find((r) => r.id === atual) ?? null;

  if (carregando) return <Loader2 className="mx-auto my-16 h-6 w-6 animate-spin text-muted-foreground" />;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6" data-testid="radio-comercio">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground"><Radio className="h-6 w-6 text-primary" /> Rádio Comércio</h1>
        <p className="text-sm text-muted-foreground">
          Monte a rádio do seu estabelecimento com músicas e promoções e ligue em qualquer tela. Envie os áudios em{' '}
          <Link to="/dashboard/medias" className="text-primary underline-offset-2 hover:underline">Minhas Mídias → Áudio</Link>.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* playlists de áudio */}
        <div className="space-y-3 rounded-2xl border border-border/60 bg-card/80 p-4">
          <p className="text-sm font-semibold">Playlists de áudio</p>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); criar(); }}>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} placeholder="Nome da nova rádio" className="h-9" data-testid="nome-da-radio" />
            <Button type="submit" size="sm" className="h-9 gap-1" disabled={ocupado || !nome.trim()} data-testid="criar-radio"><Plus className="h-4 w-4" /> Criar</Button>
          </form>
          <ul className="space-y-1">
            {radios.map((r) => (
              <li key={r.id} className={`flex items-center gap-1 rounded-lg border ${r.id === atual ? 'border-primary bg-primary/10' : 'border-border/60'}`}>
                <button type="button" className="min-w-0 flex-1 px-3 py-2 text-left" onClick={() => setAtual(r.id)}>
                  <span className="block truncate text-sm font-medium">{r.nome}</span>
                  <span className="block text-[11px] text-muted-foreground">{r.faixas ?? 0} {(r.faixas ?? 0) === 1 ? 'áudio' : 'áudios'}</span>
                </button>
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-rose-400" title="Excluir playlist de áudio" onClick={() => excluir(r)}><Trash2 className="h-4 w-4" /></Button>
              </li>
            ))}
            {radios.length === 0 && <li className="py-3 text-center text-xs text-muted-foreground">Nenhuma playlist de áudio ainda. Crie a primeira acima.</li>}
          </ul>
        </div>

        {radio ? (
          <div className="space-y-4">
            <div className="space-y-3 rounded-2xl border border-border/60 bg-card/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold">{radio.nome}</p>
                  <p className="text-xs text-muted-foreground">{faixas.length} {faixas.length === 1 ? 'áudio' : 'áudios'} · {duracaoTotal(faixas)}</p>
                </div>
                <label className="flex items-center gap-2 text-sm"><Shuffle className="h-4 w-4 text-muted-foreground" /> Ordem aleatória
                  <Switch checked={radio.embaralhar} disabled={ocupado} onCheckedChange={(v) => fazer(async () => { await radioService.alterar(radio.id, { embaralhar: v }); await carregarRadios(radio.id); })} />
                </label>
              </div>
              <ol className="space-y-1" data-testid="faixas-da-radio">
                {faixas.map((f, i) => (
                  <li key={f.id} className="flex items-center gap-2 rounded-lg bg-muted/30 px-2 py-1.5 text-sm">
                    <span className="w-5 shrink-0 text-center font-mono text-xs text-muted-foreground">{i + 1}</span>
                    <Music className="h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate">{f.nome}</span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">{duracaoDaFaixa(f.duracao_ms)}</span>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0 || ocupado} title="Subir" onClick={() => mover(i, -1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={i === faixas.length - 1 || ocupado} title="Descer" onClick={() => mover(i, 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-rose-400" disabled={ocupado} title="Tirar da rádio" onClick={() => remover(f)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </li>
                ))}
                {faixas.length === 0 && <li className="py-3 text-center text-xs text-muted-foreground">Esta rádio ainda não tem áudios. Adicione abaixo.</li>}
              </ol>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 rounded-2xl border border-border/60 bg-card/80 p-4">
                <p className="text-sm font-semibold">Adicionar áudios</p>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar áudio pelo nome" className="h-9 pl-8" data-testid="busca-audio" />
                </div>
                <ul className="max-h-64 space-y-1 overflow-y-auto">
                  {audios.map((a) => (
                    <li key={a.id}>
                      <button type="button" disabled={ocupado} onClick={() => adicionar(a)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted/40">
                        <Plus className="h-3.5 w-3.5 shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate">{a.name}</span>
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">{duracaoDaFaixa(a.duration_ms)}</span>
                      </button>
                    </li>
                  ))}
                  {audios.length === 0 && (
                    <li className="space-y-2 py-3 text-center text-xs text-muted-foreground">
                      <p>Nenhum áudio na sua galeria{busca ? ' com esse nome' : ''}.</p>
                      <Link to="/dashboard/medias?novo=1" className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"><Upload className="h-3.5 w-3.5" /> Enviar áudio</Link>
                    </li>
                  )}
                </ul>
              </div>

              <div className="space-y-2 rounded-2xl border border-border/60 bg-card/80 p-4">
                <p className="text-sm font-semibold">Telas com esta rádio</p>
                <p className="text-[11px] text-muted-foreground">Ligue a rádio nas telas que quiser. Desligada, a tela volta a ficar sem áudio.</p>
                <ul className="max-h-64 space-y-1 overflow-y-auto" data-testid="telas-da-radio">
                  {telas.map((t) => {
                    const ligada = t.radio_ativa === true && t.radio_playlist_id === radio.id;
                    const outra = t.radio_ativa === true && t.radio_playlist_id !== radio.id;
                    return (
                      <li key={t.id} className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm">
                        <span className="flex min-w-0 items-center gap-2"><Monitor className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{t.name}</span>
                          {outra && <span className="shrink-0 text-[10px] text-amber-400">outra rádio</span>}</span>
                        <Switch checked={ligada} disabled={ocupado || faixas.length === 0} onCheckedChange={(v) => ligarNaTela(t, v)} aria-label={`Rádio em ${t.name}`} />
                      </li>
                    );
                  })}
                  {telas.length === 0 && <li className="py-3 text-center text-xs text-muted-foreground">Você ainda não tem telas.</li>}
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
            Crie uma playlist de áudio para começar a montar a rádio do seu estabelecimento.
          </div>
        )}
      </div>
    </div>
  );
}
