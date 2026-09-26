import { useEffect, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { ResultadoAdicao } from '@/lib/biblioteca';

export interface Destino { id: string; nome: string; detalhe?: string | null; habilitada?: boolean; motivo?: string | null }

/** Busca com atraso (não consulta a cada tecla). */
export function useDebounced<T>(valor: T, ms = 300): T {
  const [v, setV] = useState(valor);
  useEffect(() => { const t = setTimeout(() => setV(valor), ms); return () => clearTimeout(t); }, [valor, ms]);
  return v;
}

/**
 * Seletor de destino (Playlist ou Tela) com busca paginada no servidor e seleção múltipla.
 * Só aparecem destinos que o usuário pode alterar — o banco decide (RPC), e recusa de novo ao gravar.
 */
export function DestinoDialog({ open, onOpenChange, titulo, descricao, grupo, placeholder, vazio, buscar, confirmar, rotuloSucesso }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  titulo: string;
  descricao: string;
  grupo: string;
  placeholder: string;
  vazio: string;
  buscar: (termo: string) => Promise<Destino[]>;
  confirmar: (ids: string[]) => Promise<ResultadoAdicao>;
  rotuloSucesso: (n: number) => string;
}) {
  const [termo, setTermo] = useState('');
  const termoAtrasado = useDebounced(termo);
  const [lista, setLista] = useState<Destino[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { if (!open) { setTermo(''); setSelecionados(new Set()); } }, [open]);
  useEffect(() => {
    if (!open) return;
    let vivo = true;
    setCarregando(true);
    buscar(termoAtrasado)
      .then((r) => { if (vivo) setLista(r); })
      .catch((e) => { if (vivo) { setLista([]); toast.error(e instanceof Error ? e.message : 'Erro ao buscar'); } })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [open, termoAtrasado, buscar]);

  const alternar = (id: string) => setSelecionados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const salvar = async () => {
    setSalvando(true);
    try {
      const r = await confirmar([...selecionados]);
      if (r.adicionadas > 0) toast.success(rotuloSucesso(r.adicionadas));
      for (const x of r.recusadas ?? []) toast.warning(`${x.tela ?? 'Destino'} não aceitou: ${x.motivo}`);
      if (r.aviso) toast.info(r.aviso);
      if (r.adicionadas > 0) onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível adicionar');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={termo} onChange={(e) => setTermo(e.target.value)} placeholder={placeholder} className="pl-9" data-testid="destino-busca" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{grupo}</p>
        <div className="max-h-72 space-y-1 overflow-y-auto pr-1" data-testid="destino-lista">
          {carregando && <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Buscando…</div>}
          {!carregando && lista.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{vazio}</p>}
          {!carregando && lista.map((d) => {
            const habilitada = d.habilitada !== false;
            return (
              <label key={d.id} className={`flex items-start gap-3 rounded-lg border p-3 ${habilitada ? 'cursor-pointer hover:bg-muted/60' : 'cursor-not-allowed opacity-60'} ${selecionados.has(d.id) ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <Checkbox checked={selecionados.has(d.id)} disabled={!habilitada} onCheckedChange={() => habilitada && alternar(d.id)} className="mt-0.5" aria-label={d.nome} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{d.nome}</span>
                  {d.detalhe && <span className="block truncate text-xs text-muted-foreground">{d.detalhe}</span>}
                  {d.motivo && <span className={`block text-xs ${habilitada ? 'text-muted-foreground' : 'text-amber-500'}`}>{d.motivo}</span>}
                </span>
              </label>
            );
          })}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={selecionados.size === 0 || salvando} data-testid="destino-confirmar">
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {selecionados.size > 1 ? `Adicionar (${selecionados.size})` : 'Adicionar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
