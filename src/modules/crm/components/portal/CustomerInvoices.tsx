import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, FileText } from 'lucide-react';

export function CustomerInvoices() {
  // Zero Mock: faturas buscadas do banco real (FASE 8.4 — stub aguardando portal_faturas)
  // Enquanto não implementado, exibir Empty State, nunca dados fictícios
  const faturas: any[] = []; // TODO-FASE8.4: buscar de contas_receber WHERE contrato_id = contratoId

  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-400" /> Faturamento, Boletos &amp; Notas Fiscais
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-2 text-xs">
        {faturas.length === 0 ? (
          <div className="p-6 text-center text-slate-400 space-y-2">
            <FileText className="h-8 w-8 mx-auto opacity-30" />
            <p>Nenhuma fatura disponível no momento.</p>
            <p className="text-[10px] text-slate-500">Os documentos financeiros serão exibidos aqui quando gerados.</p>
          </div>
        ) : (
          faturas.map((fat: any) => (
            <div key={fat.id} className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex items-center justify-between">
              <div className="space-y-0.5">
                <strong className="text-white block font-mono">{fat.numero}</strong>
                <span className="text-[10px] text-slate-400">Vencimento: {fat.vencimento} — {fat.valor}</span>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
