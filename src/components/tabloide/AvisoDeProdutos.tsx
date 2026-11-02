/**
 * F-256 — REGRA DO DONO: produto com informação incompleta aparece em aviso vermelho pulsando, dizendo qual é e o que falta.
 * Usado no Studio (Seus produtos, Palco de Ofertas) e no Cartaz Digital.
 */
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProdutoIncompleto } from '@/lib/tabloide/produtoCompleto';

export function AvisoDeProdutos({ itens, total, className }: { itens: ProdutoIncompleto[]; total: number; className?: string }) {
  if (!itens.length) return null;
  return (
    <div role="alert" data-testid="produtos-incompletos" className={cn('rounded-lg border-2 border-red-500 bg-red-500/10 p-2 text-red-500', className)}>
      <p className="flex items-center gap-1.5 text-sm font-bold motion-safe:animate-pulse">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {itens.length} de {total} {total === 1 ? 'produto precisa' : 'produtos precisam'} de atenção
      </p>
      <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto text-xs font-semibold motion-safe:animate-pulse">
        {itens.map((i) => <li key={i.nome}><b>{i.nome}</b>: {i.motivo}.</li>)}
      </ul>
    </div>
  );
}
