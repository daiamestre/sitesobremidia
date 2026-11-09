/**
 * F-256 — REGRA DO DONO: produto com informação incompleta aparece em aviso vermelho pulsando, dizendo qual é e o que falta.
 * Usado no Studio (Seus produtos, Palco de Ofertas) e no Cartaz Digital.
 */
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProdutoIncompleto } from '@/lib/tabloide/produtoCompleto';

/** F-280: tocar no aviso abre a lista de produtos com os que precisam de atenção pulsando em vermelho neon. O encarte pode ser usado, salvo e publicado mesmo assim. */
export function AvisoDeProdutos({ itens, total, className, aoTocar }: { itens: ProdutoIncompleto[]; total: number; className?: string; aoTocar?: () => void }) {
  if (!itens.length) return null;
  return (
    <div role="alert" data-testid="produtos-incompletos" onClick={aoTocar} onKeyDown={(e) => { if (aoTocar && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); aoTocar(); } }} tabIndex={aoTocar ? 0 : undefined}
      title={aoTocar ? 'Toque para ver e corrigir os produtos' : undefined}
      className={cn('rounded-lg border-2 border-red-500 bg-red-500/10 p-2 text-red-500', aoTocar && 'cursor-pointer hover:bg-red-500/15', className)}>
      <p className="flex items-center gap-1.5 text-sm font-bold motion-safe:animate-pulse">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {itens.length} de {total} {total === 1 ? 'produto precisa' : 'produtos precisam'} de atenção
      </p>
      <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto text-xs font-semibold motion-safe:animate-pulse">
        {itens.map((i) => <li key={i.nome}><b>{i.nome}</b>: {i.motivo}.</li>)}
      </ul>
      {aoTocar && <p className="mt-1 text-[11px] font-bold underline">Toque aqui para corrigir: os produtos com problema ficam piscando em vermelho na lista.</p>}
    </div>
  );
}
