import type { ReactNode } from 'react';
import { DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * Janela dos seletores "Selecionar Mídia / Widget / Link Externo / Playlist" (detalhe da tela).
 *
 * Causa dos problemas relatados (reproduzidos em 1366x612 e 375x812):
 *  1) `src/index.css` tem a regra global `.flex, .grid { max-width: 100% }` (fora das camadas do Tailwind), que anula
 *     `max-w-2xl` em elementos com `flex`/`grid` -> a janela ocupava ~95% da largura e as miniaturas ficavam enormes;
 *  2) a área de rolagem (`ScrollArea` com `flex-1`, sem `min-h-0`) crescia até o tamanho do conteúdo e o excesso era
 *     cortado (`overflow: hidden`) -> não havia como rolar até as mídias de baixo.
 * Aqui: largura/altura por `style` (não é anulado pela regra global), rolagem NATIVA (toque no celular/tablet, roda do
 * mouse e barra no PC) e colunas que se ajustam à largura do aparelho.
 */
export function SeletorGrade({ titulo, children, vazio, testId }: {
  titulo: string; children: ReactNode; vazio?: ReactNode; testId?: string;
}) {
  return (
    <DialogContent
      className="flex flex-col gap-3 overflow-hidden p-4 sm:p-6"
      style={{ width: 'min(95vw, 64rem)', maxWidth: 'min(95vw, 64rem)', maxHeight: 'min(85dvh, 56rem)' }}
      data-testid={testId ?? 'seletor-grade'}
    >
      <DialogHeader className="shrink-0 pr-8">
        <DialogTitle>{titulo}</DialogTitle>
      </DialogHeader>
      <div
        className="min-h-0 shrink overflow-y-auto overscroll-contain pr-1"
        style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
        data-testid="seletor-rolagem"
      >
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,9.5rem),1fr))]" data-testid="seletor-itens">
          {children}
        </div>
        {vazio}
      </div>
    </DialogContent>
  );
}

/** Um item da grade: miniatura 16:9 que acompanha a largura da coluna e o nome embaixo. */
export function ItemSeletor({ rotulo, onClick, children, className, testId }: {
  rotulo: string; onClick: () => void; children: ReactNode; className?: string; testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={rotulo}
      data-testid={testId}
      className={cn('group relative aspect-video w-full cursor-pointer overflow-hidden rounded-lg bg-muted text-left outline-none ring-offset-background transition hover:ring-2 hover:ring-primary focus-visible:ring-2 focus-visible:ring-primary', className)}
    >
      {children}
      <span className="absolute inset-x-0 bottom-0 truncate bg-black/65 px-1.5 py-1 text-[11px] text-white">{rotulo}</span>
    </button>
  );
}
