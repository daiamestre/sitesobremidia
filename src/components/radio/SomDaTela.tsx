import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Music, Plus, Radio, Search, Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { ROTULO_DO_SOM, modoDeSomDaTela, radioService, type AudioDaGaleria, type ModoDeSom, type RadioPlaylist } from '@/lib/radio';

/**
 * F-150 — Som da tela: "Só mídias, sem áudio" (como toda tela nasce), "Som das mídias" ou "Rádio Comércio".
 * Com a rádio, a tela toca a playlist de áudio escolhida (ou os áudios colocados direto nela) e os vídeos ficam mudos.
 * As zonas nunca têm som.
 */
interface TelaComSom { id: string; name: string; audio_enabled?: boolean | null; radio_ativa?: boolean | null; radio_playlist_id?: string | null; radio_volume?: number | null }

const ICONE: Record<ModoDeSom, typeof Radio> = { MUDO: VolumeX, MIDIAS: Volume2, RADIO: Radio };

export function SomDaTela({ tela, aoMudar }: { tela: TelaComSom; aoMudar?: () => void }) {
  const { user } = useAuth();
  const [modo, setModo] = useState<ModoDeSom>(modoDeSomDaTela(tela));
  const [radioId, setRadioId] = useState<string | null>(tela.radio_playlist_id ?? null);
  const [volume, setVolume] = useState<number>(tela.radio_volume ?? 70);
  const [radios, setRadios] = useState<RadioPlaylist[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState('');
  const [audios, setAudios] = useState<AudioDaGaleria[]>([]);
  const [mostrarAudios, setMostrarAudios] = useState(false);

  useEffect(() => { setModo(modoDeSomDaTela(tela)); setRadioId(tela.radio_playlist_id ?? null); setVolume(tela.radio_volume ?? 70); }, [tela.id, tela.audio_enabled, tela.radio_ativa, tela.radio_playlist_id, tela.radio_volume]); // eslint-disable-line react-hooks/exhaustive-deps

  const carregarRadios = useCallback(async () => { try { setRadios(await radioService.listar()); } catch { /* lista vazia */ } }, []);
  useEffect(() => { carregarRadios(); }, [carregarRadios]);

  useEffect(() => {
    if (!mostrarAudios) return;
    const t = setTimeout(async () => { try { setAudios(await radioService.audios(busca)); } catch { setAudios([]); } }, 300);
    return () => clearTimeout(t);
  }, [busca, mostrarAudios]);

  const gravar = async (novoModo: ModoDeSom, novaRadio: string | null, novoVolume: number) => {
    setSalvando(true);
    try {
      await radioService.definirSom(tela.id, novoModo, novaRadio, novoVolume);
      setModo(novoModo); setRadioId(novaRadio); setVolume(novoVolume);
      toast.success(novoModo === 'RADIO' ? 'Rádio Comércio ligada nesta tela.' : novoModo === 'MIDIAS' ? 'Som das mídias ligado nesta tela.' : 'Tela sem áudio.');
      aoMudar?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setSalvando(false); }
  };

  const escolher = (m: ModoDeSom) => {
    if (m === modo || salvando) return;
    if (m === 'RADIO') {
      const alvo = radioId ?? radios[0]?.id ?? null;
      if (!alvo) { setModo('RADIO'); setMostrarAudios(true); toast.info('Escolha uma playlist de áudio ou adicione áudios abaixo para ligar a rádio.'); return; }
      gravar('RADIO', alvo, volume); return;
    }
    gravar(m, radioId, volume);
  };

  /** Áudio por áudio: entra na rádio própria desta tela (criada na primeira vez). */
  const adicionarAudio = async (a: AudioDaGaleria) => {
    if (!user?.id) return;
    try {
      const nomeDaTela = `${tela.name} — Rádio`;
      let alvo = radios.find((r) => r.id === radioId) ?? radios.find((r) => r.nome === nomeDaTela) ?? null;
      if (!alvo) { alvo = await radioService.criar(nomeDaTela, user.id); }
      await radioService.adicionar(alvo.id, a.id);
      await carregarRadios();
      toast.success(`"${a.name}" entrou na rádio "${alvo.nome}".`);
      if (modo !== 'RADIO' || radioId !== alvo.id) await gravar('RADIO', alvo.id, volume);
    } catch (e) { toast.error((e as Error).message); }
  };

  const radioLigada = modo === 'RADIO' && !!radioId && tela.radio_ativa === true;

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3" data-testid="som-da-tela">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium"><Music className="h-4 w-4 text-primary" /> Som da tela</span>
        {salvando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Som da tela">
        {(Object.keys(ROTULO_DO_SOM) as ModoDeSom[]).map((m) => {
          const Icone = ICONE[m];
          const ativo = modo === m;
          return (
            <button key={m} type="button" role="radio" aria-checked={ativo} disabled={salvando} onClick={() => escolher(m)} data-testid={`som-${m.toLowerCase()}`}
              className={`rounded-lg border p-2.5 text-left transition-colors ${ativo ? 'border-primary bg-primary/15' : 'border-border/60 hover:bg-muted/40'}`}>
              <span className="flex items-center gap-2 text-sm font-semibold"><Icone className={`h-4 w-4 ${ativo ? 'text-primary' : 'text-muted-foreground'}`} /> {ROTULO_DO_SOM[m].titulo}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{ROTULO_DO_SOM[m].detalhe}</span>
            </button>
          );
        })}
      </div>

      {modo === 'RADIO' && (
        <div className="space-y-3 border-t border-border/60 pt-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
            <label className="block space-y-1">
              <span className="text-[11px] text-muted-foreground">Playlist de áudio desta tela</span>
              <select className="h-9 w-full rounded-md border border-border/60 bg-background px-2 text-sm" value={radioId ?? ''} data-testid="radio-da-tela"
                onChange={(e) => { if (e.target.value) gravar('RADIO', e.target.value, volume); }}>
                <option value="" disabled>Escolha uma playlist de áudio</option>
                {radios.map((r) => <option key={r.id} value={r.id}>{r.nome} ({r.faixas ?? 0} áudios)</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] text-muted-foreground">Volume da rádio: {volume}%</span>
              <Slider value={[volume]} min={0} max={100} step={5} onValueChange={(v) => setVolume(v[0])} onValueCommit={(v) => { if (radioId) gravar('RADIO', radioId, v[0]); }} aria-label="Volume da rádio" />
            </label>
          </div>
          {!radioLigada && <p className="text-xs text-amber-400">A rádio ainda não está tocando: escolha uma playlist de áudio ou adicione um áudio.</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2.5 py-1.5 text-xs hover:bg-muted/40" onClick={() => setMostrarAudios((v) => !v)} data-testid="adicionar-audio-na-tela">
              <Plus className="h-3.5 w-3.5" /> Adicionar áudio nesta tela
            </button>
            <Link to="/dashboard/radio" className="text-xs text-primary underline-offset-2 hover:underline">Gerenciar playlists de áudio</Link>
          </div>
          {mostrarAudios && (
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar áudio pelo nome" className="h-9 pl-8" />
              </div>
              <ul className="max-h-40 space-y-1 overflow-y-auto">
                {audios.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => adicionarAudio(a)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted/40">
                      <Music className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{a.name}</span>
                    </button>
                  </li>
                ))}
                {audios.length === 0 && <li className="px-2 py-2 text-xs text-muted-foreground">Nenhum áudio encontrado. Envie seus áudios em Minhas Mídias → Áudio.</li>}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
