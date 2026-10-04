import * as React from "react";

import { cn } from "@/lib/utils";
import { rotularCelulas } from "@/lib/tabelasResponsivas";

/**
 * F-116: no celular e no tablet em pé (até 1023 px) a tabela vira blocos empilhados — cada linha um bloco, cada célula com o nome da
 * coluna ao lado (data-label copiado do cabeçalho). Nada de arrastar para o lado. No computador nada muda.
 * Quem precisar da tabela tradicional no celular passa empilharNoCelular={false}.
 */
const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement> & { empilharNoCelular?: boolean }>(
  ({ className, empilharNoCelular = true, ...props }, ref) => {
    const interno = React.useRef<HTMLTableElement | null>(null);
    React.useEffect(() => { if (empilharNoCelular) rotularCelulas(interno.current); });
    // F-121: se a tabela não couber na área dela (telas até 1280 px, pelo CSS), empilha; se couber de novo, volta a ser tabela
    React.useEffect(() => {
      const tabela = interno.current; const area = tabela?.parentElement;
      if (!empilharNoCelular || !tabela || !area || typeof ResizeObserver === 'undefined') return;
      let larguraNatural = 0;
      const medir = () => {
        const empilhada = tabela.classList.contains('sem-espaco');
        if (!empilhada) {
          larguraNatural = tabela.scrollWidth;
          if (larguraNatural > area.clientWidth + 4) tabela.classList.add('sem-espaco');
        } else if (larguraNatural && area.clientWidth >= larguraNatural + 4) {
          tabela.classList.remove('sem-espaco');
        }
      };
      // a medição é só um ajuste visual: se o navegador não permitir observar o tamanho, a página segue normal
      try {
        medir();
        const ro = new ResizeObserver(medir);
        ro.observe(area);
        return () => ro.disconnect();
      } catch {
        return;
      }
    }, [empilharNoCelular]);
    return (
      <div className="relative w-full overflow-auto">
        <table
          ref={(el) => {
            interno.current = el;
            if (typeof ref === "function") ref(el);
            else if (ref) (ref as React.MutableRefObject<HTMLTableElement | null>).current = el;
          }}
          className={cn("w-full caption-bottom text-sm", empilharNoCelular && "tabela-empilhada", className)}
          data-tabela-fixa={empilharNoCelular ? undefined : ""}
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
