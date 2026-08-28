import * as React from "react";

/**
 * Helper para exibição responsiva de dados tabulares.
 * Desktop: renderiza children como tabela (via prop desktop).
 * Mobile: renderiza cards/listas (via prop mobile).
 * Preserva MESMOS dados — apenas apresentação muda (FASE 5).
 */
interface ResponsiveDataViewProps {
  desktop: React.ReactNode;
  mobile: React.ReactNode;
}

export function ResponsiveDataView({ desktop, mobile }: ResponsiveDataViewProps) {
  return (
    <>
      <div className="hidden md:block">{desktop}</div>
      <div className="md:hidden space-y-3">{mobile}</div>
    </>
  );
}
