import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * F-116: no celular (até 767 px) a tabela vira blocos empilhados — cada linha um bloco, cada célula com o nome da
 * coluna ao lado (data-label copiado do cabeçalho). Nada de arrastar para o lado. No computador nada muda.
 * Quem precisar da tabela tradicional no celular passa empilharNoCelular={false}.
 */
function rotularCelulas(tabela: HTMLTableElement | null) {
  if (!tabela) return;
  const titulos = [...tabela.querySelectorAll(':scope > thead > tr:last-child > th')].map((th) => (th.textContent || '').trim());
  if (!titulos.length) return;
  for (const tr of tabela.querySelectorAll(':scope > tbody > tr')) {
    let col = 0;
    for (const td of (tr as HTMLTableRowElement).cells) {
      const span = (td as HTMLTableCellElement).colSpan || 1;
      if (span > 1) td.setAttribute('data-linha-inteira', '');
      else if (titulos[col]) td.setAttribute('data-label', titulos[col]);
      else td.removeAttribute('data-label');
      col += span;
    }
  }
}

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement> & { empilharNoCelular?: boolean }>(
  ({ className, empilharNoCelular = true, ...props }, ref) => {
    const interno = React.useRef<HTMLTableElement | null>(null);
    React.useEffect(() => { if (empilharNoCelular) rotularCelulas(interno.current); });
    return (
      <div className="relative w-full overflow-auto">
        <table
          ref={(el) => {
            interno.current = el;
            if (typeof ref === "function") ref(el);
            else if (ref) (ref as React.MutableRefObject<HTMLTableElement | null>).current = el;
          }}
          className={cn("w-full caption-bottom text-sm", empilharNoCelular && "tabela-empilhada", className)}
          {...props}
        />
      </div>
    );
  },
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />,
);
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  ),
);
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot ref={ref} className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)} {...props} />
  ),
);
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn("border-b transition-colors data-[state=selected]:bg-muted hover:bg-muted/50", className)}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  ),
);
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", className)} {...props} />
  ),
);
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
  ),
);
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
