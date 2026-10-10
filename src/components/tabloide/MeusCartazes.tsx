/**
 * Cartaz Digital (F-179) — aba "Meus cartazes": tudo que o cliente já criou fica guardado aqui.
 * Ele marca um, dois ou todos e imprime (ou baixa) só os escolhidos, de uma vez.
 */
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Download, FolderOpen, Globe, Loader2, Plus, Printer, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { propsDasPaginas } from '@/lib/tabloide/cartaz';
import { duplicarCartaz, excluirCartaz, gerarPngsDoCartaz, type CartazSalvo } from '@/lib/tabloide/cartazes';
import { baixarBlob, imprimirBlobs, nomeDeArquivo } from '@/lib/tabloide/exportar';
import type { Selo } from '@/lib/tabloide/selos';
import { formatoPorId } from '@/lib/tabloide/temas';
import { TabloideCanvas } from './TabloideCanvas';

export interface MeusCartazesProps {
  cartazes: CartazSalvo[] | null;
  selos: Selo[] | null;
  clienteId: string | null;
  abertoId: string | null;
  aoAbrir: (c: CartazSalvo) => void;
  aoNovo: () => void;
  aoRecarregar: () => Promise<void>;
  /** o cartaz aberto no editor foi excluído daqui */
  aoExcluirAberto: () => void;
}

const LADO = 220;

/** A primeira página do cartaz, desenhada pelo mesmo componente da prévia (sem diferença para o que será impresso). */
function Miniatura({ cartaz, selos }: { cartaz: CartazSalvo; selos: Selo[] | null }) {
  const formato = formatoPorId(cartaz.formatoId);
  const pagina = useMemo(() => propsDasPaginas(cartaz, selos)[0], [cartaz, selos]);
  const escala = Math.min(LADO / formato.largura, LADO / formato.altura);
  return (
    <div className="flex items-center justify-center rounded-md bg-black/30" style={{ height: LADO }}>
      <div className="overflow-hidden rounded" style={{ width: formato.largura * escala, height: formato.altura * escala }}>
        <div style={{ width: formato.largura, height: formato.altura, transform: `scale(${escala})`, transformOrigin: 'top left', pointerEvents: 'none' }}>
          {pagina && <TabloideCanvas {...pagina} />}
        </div>
      </div>
    </div>
  );
}

const quando = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export function MeusCartazes({ cartazes, selos, clienteId, abertoId, aoAbrir, aoNovo, aoRecarregar, aoExcluirAberto }: MeusCartazesProps) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState<null | 'imprimir' | 'baixar'>(null);
  const [andamento, setAndamento] = useState('');
  const lista = cartazes ?? [];
  const escolhidos = lista.filter((c) => marcados.has(c.id));
  const todos = lista.length > 0 && escolhidos.length === lista.length;

  const marcar = (id: string) => setMarcados((a) => { const n = new Set(a); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  /** Gera as imagens de cada cartaz escolhido, na ordem da lista. */
  const gerar = async (): Promise<Array<{ cartaz: CartazSalvo; pngs: Blob[] }>> => {
    const out: Array<{ cartaz: CartazSalvo; pngs: Blob[] }> = [];
    for (let i = 0; i < escolhidos.length; i++) {
      setAndamento(`Preparando ${i + 1} de ${escolhidos.length}…`);
      if (!escolhidos[i].produtos.length) continue;
      out.push({ cartaz: escolhidos[i], pngs: await gerarPngsDoCartaz(escolhidos[i], selos) });
    }
    return out;
  };

  const emLote = async (acao: 'imprimir' | 'baixar') => {
    if (!escolhidos.length) { toast.error('Marque pelo menos um cartaz.'); return; }
    setOcupado(acao);
    try {
      const prontos = await gerar();
      if (!prontos.length) { toast.error('Os cartazes marcados ainda não têm produtos.'); return; }
      if (acao === 'imprimir') imprimirBlobs(prontos.flatMap((p) => p.pngs));
      else {
        prontos.forEach((p) => p.pngs.forEach((b, i) => baixarBlob(b, nomeDeArquivo(p.cartaz.nome, i + 1, p.pngs.length))));
        const total = prontos.reduce((n, p) => n + p.pngs.length, 0);
        toast.success(total === 1 ? 'Imagem baixada.' : `${total} imagens baixadas.`);
      }
      if (prontos.length < escolhidos.length) toast.info('Cartaz sem produtos ficou de fora.');
    } catch (e) {
      toast.error((e as Error).message || 'Não foi possível preparar os cartazes.');
    } finally { setOcupado(null); setAndamento(''); }
  };

  const duplicar = async (c: CartazSalvo) => {
    try { await duplicarCartaz(c, clienteId); await aoRecarregar(); toast.success('Cópia criada.'); }
    catch (e) { toast.error((e as Error).message || 'Não foi possível duplicar.'); }
  };

  const excluir = async (c: CartazSalvo) => {
    if (!confirm(`Excluir o cartaz "${c.nome}"?`)) return;
    try {
      await excluirCartaz(c.id);
      setMarcados((a) => { const n = new Set(a); n.delete(c.id); return n; });
      if (c.id === abertoId) aoExcluirAberto();
      await aoRecarregar();
      toast.success('Cartaz excluído.');
    } catch (e) { toast.error((e as Error).message || 'Não foi possível excluir.'); }
  };

  if (cartazes === null) return <p className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando os seus cartazes…</p>;

  return (
    <div className="space-y-3" data-testid="meus-cartazes">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={todos} disabled={!lista.length} onChange={(e) => setMarcados(e.target.checked ? new Set(lista.map((c) => c.id)) : new Set())} data-testid="cartazes-todos" /> Marcar todos
        </label>
        <span className="text-sm text-muted-foreground" data-testid="cartazes-contagem">{escolhidos.length} de {lista.length} marcado{escolhidos.length === 1 ? '' : 's'}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {andamento && <span className="text-xs text-primary">{andamento}</span>}
          <Button onClick={() => emLote('imprimir')} disabled={ocupado !== null || !escolhidos.length} data-testid="cartazes-imprimir">
            {ocupado === 'imprimir' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Printer className="mr-1 h-4 w-4" />} Imprimir marcados{escolhidos.length ? ` (${escolhidos.length})` : ''}
          </Button>
          <Button variant="outline" onClick={() => emLote('baixar')} disabled={ocupado !== null || !escolhidos.length} data-testid="cartazes-baixar">
            {ocupado === 'baixar' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />} Baixar marcados
          </Button>
          <Button variant="secondary" onClick={aoNovo} data-testid="cartazes-novo"><Plus className="mr-1 h-4 w-4" /> Novo cartaz</Button>
        </div>
      </div>

      {!lista.length ? (
        <div className="rounded-xl border border-dashed p-10 text-center" data-testid="cartazes-vazio">
          <p className="font-semibold">Você ainda não salvou nenhum cartaz.</p>
          <p className="mt-1 text-sm text-muted-foreground">Crie um cartaz e toque em <b>Salvar cartaz</b>. Ele aparece aqui, pronto para imprimir junto com os outros.</p>
          <Button className="mt-4" onClick={aoNovo}><Plus className="mr-1 h-4 w-4" /> Criar o primeiro cartaz</Button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {lista.map((c) => {
            const formato = formatoPorId(c.formatoId);
            const marcado = marcados.has(c.id);
            return (
              <li key={c.id} data-testid="cartaz-salvo" data-marcado={marcado} className={cn('space-y-2 rounded-xl border-2 bg-card p-2.5', marcado ? 'border-primary' : 'border-border')}>
                <button type="button" onClick={() => marcar(c.id)} className="block w-full" aria-label={`${marcado ? 'Desmarcar' : 'Marcar'} ${c.nome}`}>
                  <Miniatura cartaz={c} selos={selos} />
                </button>
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={marcado} onChange={() => marcar(c.id)} data-testid="cartaz-marcar" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold" title={c.nome}>{c.nome}{c.id === abertoId ? ' · aberto' : ''}</span>
                    <span className="block text-[11px] text-muted-foreground">{formato.nome} · {c.produtos.length} produto{c.produtos.length === 1 ? '' : 's'}</span>
                    <span className="block text-[11px] text-muted-foreground">{quando(c.atualizadoEm)}</span>
                  </span>
                  {c.publicado && <span title="Publicado no portal" className="rounded-full bg-emerald-500/15 p-1 text-emerald-600"><Globe className="h-3.5 w-3.5" /></span>}
                </label>
                <div className="flex gap-1.5">
                  <Button size="sm" className="flex-1" onClick={() => aoAbrir(c)} data-testid="cartaz-abrir"><FolderOpen className="mr-1 h-3.5 w-3.5" /> Abrir</Button>
                  <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => duplicar(c)} aria-label={`Duplicar ${c.nome}`} title="Duplicar"><Copy className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => excluir(c)} aria-label={`Excluir ${c.nome}`} title="Excluir" data-testid="cartaz-excluir"><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
