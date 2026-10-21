import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { Link2, Loader2, MonitorSmartphone, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { listarAparelhosParaVincular, vincularAparelhoNaTela, type AparelhoParaVincular } from '@/services/vincularAparelho.service';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  telaId: string;
  telaNome: string;
  /** Chamado depois de vincular (para recarregar a tela). */
  onVinculado?: () => void;
}

/**
 * F-205 — "Vincular outro aparelho": lista os aparelhos já conectados desta conta. Ao escolher um, ele sai da tela onde
 * está e passa a reproduzir esta (baixa as mídias desta playlist e apaga as da antiga sozinho).
 */
export function VincularOutroAparelhoDialog({ open, onOpenChange, telaId, telaNome, onVinculado }: Props) {
  const [aparelhos, setAparelhos] = useState<AparelhoParaVincular[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [escolhido, setEscolhido] = useState<AparelhoParaVincular | null>(null);
  const [vinculando, setVinculando] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    try {
      // aparelho antigo e sem tela não serve para nada aqui (não troca de tela e não está tocando): fica fora da lista
      setAparelhos((await listarAparelhosParaVincular(telaId)).filter((a) => a.compativel || a.tela_id));
    } catch (e) {
      toast.error((e as Error).message || 'Não foi possível listar os aparelhos.');
      setAparelhos([]);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    if (open) { setEscolhido(null); carregar(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, telaId]);

  const confirmar = async () => {
    if (!escolhido) return;
    setVinculando(true);
    try {
      const msg = await vincularAparelhoNaTela(telaId, escolhido.aparelho);
      toast.success('Aparelho vinculado a esta tela', { description: msg });
      onOpenChange(false);
      onVinculado?.();
    } catch (e) {
      toast.error((e as Error).message || 'Não foi possível vincular o aparelho.');
    } finally {
      setVinculando(false);
    }
  };

  const nomeDoAparelho = (a: AparelhoParaVincular) =>
    a.tela_nome ? `Aparelho da tela ${a.tela_nome}` : `Aparelho …${a.aparelho.slice(-6)}`;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!vinculando) onOpenChange(v); }}>
      <DialogContent style={{ maxWidth: '34rem' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Link2 className="h-5 w-5 text-primary" /> Vincular outro aparelho</DialogTitle>
          <DialogDescription>
            Escolha um aparelho já conectado para passar a reproduzir a tela <strong>{telaNome}</strong>. Ele sai da tela
            onde está, baixa as mídias desta playlist e apaga as da playlist antiga sozinho.
          </DialogDescription>
        </DialogHeader>

        {escolhido ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm space-y-1">
              <div className="font-medium">{nomeDoAparelho(escolhido)}</div>
              {escolhido.tela_nome
                ? <p className="text-muted-foreground">Vai <strong>deixar de reproduzir a tela {escolhido.tela_nome}</strong>{escolhido.playlist_nome ? ` (playlist ${escolhido.playlist_nome})` : ''} e passar para <strong>{telaNome}</strong>. A tela {escolhido.tela_nome} fica livre, sem aparelho.</p>
                : <p className="text-muted-foreground">Está desvinculado (mostrando a tela de suporte) e vai passar a reproduzir <strong>{telaNome}</strong>.</p>}
              {!escolhido.online && <p className="text-amber-500">Ele está sem sinal agora: troca assim que voltar a ficar online.</p>}
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button variant="outline" disabled={vinculando} onClick={() => setEscolhido(null)}>Voltar</Button>
              <Button disabled={vinculando} onClick={confirmar} className="gap-2" data-testid="confirmar-vincular-aparelho">
                {vinculando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                Vincular nesta tela
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Aparelhos desta conta</span>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={carregar} disabled={carregando}>
                <RefreshCw className={`h-3 w-3 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
              </Button>
            </div>
            {carregando && !aparelhos ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : !aparelhos?.length ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Nenhum aparelho conectado nesta conta ainda. Conecte um pelo Player (login → escolher tela).</p>
            ) : (
              <ul className="space-y-2 max-h-[55vh] overflow-y-auto pr-1" data-testid="lista-aparelhos-vincular">
                {aparelhos.map((a) => {
                  const bloqueado = a.nesta_tela || !a.compativel;
                  return (
                    <li key={a.aparelho}>
                      <button
                        type="button"
                        disabled={bloqueado}
                        onClick={() => setEscolhido(a)}
                        className="w-full text-left rounded-lg border border-border/60 p-3 flex items-start gap-3 hover:bg-muted/40 disabled:opacity-60 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
                      >
                        <MonitorSmartphone className="h-5 w-5 mt-0.5 text-primary shrink-0" />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-sm truncate">{nomeDoAparelho(a)}</span>
                            <Badge className={a.online ? 'bg-green-600 hover:bg-green-600' : 'bg-slate-500 hover:bg-slate-500'}>{a.online ? 'Online' : 'Offline'}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {a.nesta_tela ? 'Já está nesta tela'
                              : a.tela_nome ? `Reproduzindo ${a.playlist_nome ? `a playlist ${a.playlist_nome}` : 'a tela'} em ${a.tela_nome}`
                              : a.compativel ? 'Desvinculado (tela de suporte)' : 'Sem tela'}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Player {a.versao || 'versão não informada'}
                            {a.visto_em ? ` · visto ${formatDistanceToNow(new Date(a.visto_em), { addSuffix: true, locale: ptBR })}` : ''}
                          </p>
                          {!a.compativel && !a.nesta_tela && (
                            <p className="text-[11px] text-amber-500">Precisa do Player 5.8.9 ou mais novo para trocar de tela pelo painel.</p>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
