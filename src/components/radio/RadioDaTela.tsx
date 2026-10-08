import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, Loader2, Radio, Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PainelDaRadio } from '@/components/radio/PainelDaRadio';
import { modoDeSomDaTela, radioService, textoDoSom, type ModoDeSom, type RadioPlaylist } from '@/lib/radio';

/**
 * F-162 — Cartão "Rádio Comércio" da página de cada tela (abaixo de "Divisão da tela").
 * Duas chaves que NUNCA ficam ligadas juntas (o banco grava as duas de uma vez em fn_definir_som_da_tela):
 *  - Rádio Comércio: a tela toca a playlist de áudio escolhida e os vídeos ficam mudos;
 *  - Som das mídias: a tela toca o áudio dos vídeos da playlist; a rádio desliga.
 * As duas desligadas = tela em silêncio (as mídias seguem rodando em mudo, como sempre). Tocar no cartão abre o painel da
 * rádio (playlists de áudio, envio de áudio com prévia). As zonas nunca têm som.
 */
interface TelaComSom { id: string; name: string; audio_enabled?: boolean | null; radio_ativa?: boolean | null; radio_playlist_id?: string | null; radio_volume?: number | null }

export function RadioDaTela({ tela, aoMudar }: { tela: TelaComSom; aoMudar?: () => void }) {
  const [modo, setModo] = useState<ModoDeSom>(modoDeSomDaTela(tela));
  const [radioId, setRadioId] = useState<string | null>(tela.radio_playlist_id ?? null);
  const [volume, setVolume] = useState<number>(tela.radio_volume ?? 70);
  const [radios, setRadios] = useState<RadioPlaylist[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [aberto, setAberto] = useState(false);

  useEffect(() => { setModo(modoDeSomDaTela(tela)); setRadioId(tela.radio_playlist_id ?? null); setVolume(tela.radio_volume ?? 70); }, [tela.id, tela.audio_enabled, tela.radio_ativa, tela.radio_playlist_id, tela.radio_volume]); // eslint-disable-line react-hooks/exhaustive-deps

  const carregarRadios = useCallback(async () => { try { setRadios(await radioService.listar()); } catch { /* sem lista */ } }, []);
  useEffect(() => { carregarRadios(); }, [carregarRadios, aberto]);

  const gravar = async (novoModo: ModoDeSom, novaRadio: string | null, novoVolume: number) => {
    setSalvando(true);
    try {
      await radioService.definirSom(tela.id, novoModo, novaRadio, novoVolume);
      setModo(novoModo); setRadioId(novaRadio); setVolume(novoVolume);
      toast.success(novoModo === 'RADIO' ? 'Rádio Comércio ligada nesta tela (som das mídias desligado).' : novoModo === 'MIDIAS' ? 'Som das mídias ligado nesta tela (rádio desligada).' : 'Tela em silêncio.');
      aoMudar?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setSalvando(false); }
  };

  const ligarRadio = (ligar: boolean) => {
    if (salvando) return;
    if (!ligar) { gravar('MUDO', radioId, volume); return; }
    const alvo = radioId ?? radios[0]?.id ?? null;
    if (!alvo) { setAberto(true); toast.info('Crie uma playlist de áudio e coloque áudios nela para ligar a rádio.'); return; }
    gravar('RADIO', alvo, volume);
  };
  const ligarMidias = (ligar: boolean) => { if (!salvando) gravar(ligar ? 'MIDIAS' : 'MUDO', radioId, volume); };

  const nomeDaRadio = radios.find((r) => r.id === radioId)?.nome ?? null;
  const parar = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <>
      <Card className="glass cursor-pointer transition-colors hover:border-primary/50" data-testid="cartao-radio-da-tela" onClick={() => setAberto(true)}>
        <CardContent className="space-y-3 p-4">
          <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={(e) => { e.stopPropagation(); setAberto(true); }} data-testid="abrir-painel-radio" aria-label="Abrir a Rádio Comércio desta tela">
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary"><Radio className="h-5 w-5" /></span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-semibold">Rádio Comércio
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${modo === 'RADIO' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-muted text-muted-foreground'}`} data-testid="estado-da-radio">{modo === 'RADIO' ? 'no ar' : 'desligada'}</span>
                </span>
                <span className="block text-xs text-muted-foreground">Músicas e promoções em áudio nesta tela. Toque para escolher a rádio e enviar áudios.</span>
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1 text-xs text-primary">{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Abrir <ChevronRight className="h-4 w-4" /></>}</span>
          </button>

          <div className="grid gap-2 sm:grid-cols-2" onClick={parar} role="group" aria-label="Som da tela">
            <label className={`flex items-center justify-between gap-3 rounded-lg border p-2.5 ${modo === 'RADIO' ? 'border-primary bg-primary/10' : 'border-border/60'}`}>
              <span className="min-w-0"><span className="flex items-center gap-1.5 text-sm font-medium"><Radio className="h-4 w-4 text-primary" /> Rádio Comércio</span>
                <span className="block text-[11px] leading-snug text-muted-foreground">Ligada: toca a rádio e desliga o som das mídias.</span></span>
              <Switch checked={modo === 'RADIO'} disabled={salvando} onCheckedChange={ligarRadio} aria-label="Ligar a Rádio Comércio nesta tela" data-testid="radio-ligada" />
            </label>
            <label className={`flex items-center justify-between gap-3 rounded-lg border p-2.5 ${modo === 'MIDIAS' ? 'border-primary bg-primary/10' : 'border-border/60'}`}>
              <span className="min-w-0"><span className="flex items-center gap-1.5 text-sm font-medium">{modo === 'MIDIAS' ? <Volume2 className="h-4 w-4 text-primary" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />} Som das mídias</span>
                <span className="block text-[11px] leading-snug text-muted-foreground">Ligado: toca o áudio dos vídeos e desliga a rádio.</span></span>
              <Switch checked={modo === 'MIDIAS'} disabled={salvando} onCheckedChange={ligarMidias} aria-label="Ligar o som das mídias nesta tela" data-testid="som-midias-ligado" />
            </label>
          </div>

          {modo === 'RADIO' && (
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]" onClick={parar}>
              <label className="block space-y-1">
                <span className="text-[11px] text-muted-foreground">Playlist de áudio desta tela</span>
                <select className="h-9 w-full rounded-md border border-border/60 bg-background px-2 text-sm" value={radioId ?? ''} data-testid="radio-escolher" disabled={salvando}
                  onChange={(e) => { if (e.target.value) gravar('RADIO', e.target.value, volume); }}>
                  <option value="" disabled>Escolha uma playlist de áudio</option>
                  {radios.map((r) => <option key={r.id} value={r.id}>{r.nome} ({r.faixas ?? 0} áudios)</option>)}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] text-muted-foreground">Volume da rádio: {volume}%</span>
                <Slider value={[volume]} min={0} max={100} step={5} onValueChange={(v) => setVolume(v[0])} onValueCommit={(v) => { if (radioId) gravar('RADIO', radioId, v[0]); }} aria-label="Volume da rádio" data-testid="radio-volume" />
              </label>
            </div>
          )}

          <p className="text-xs text-muted-foreground" data-testid="texto-do-som">{textoDoSom(modo, nomeDaRadio, volume)}</p>
        </CardContent>
      </Card>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto" style={{ width: 'min(1100px, 96vw)', maxWidth: 'none' }} data-testid="janela-da-radio">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Radio className="h-5 w-5 text-primary" /> Rádio Comércio — {tela.name}</DialogTitle>
            <DialogDescription>Monte a playlist de áudio, ouça cada áudio antes de colocar, envie novos áudios e ligue a rádio nas telas.</DialogDescription>
          </DialogHeader>
          <PainelDaRadio embutido telaAtualId={tela.id} aoMudarTela={() => { aoMudar?.(); }} />
        </DialogContent>
      </Dialog>
    </>
  );
}
