import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { financeiroPlusService } from '../services/financeiroPlus.service';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileText, ArrowLeft, Loader2, FileCheck } from 'lucide-react';

export default function InvoicesPage() {
  const navigate = useNavigate();
  const { empresaOperadoraId } = useAuth();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    const data = await financeiroPlusService.listInvoices(empresaOperadoraId || undefined);
    setInvoices(data);
    setLoading(false);
  }, [empresaOperadoraId]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-blue-400" />
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">Motor Fiscal (NFS-e / RPS)</h2>
            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 ml-2">FASE 9.1-B</Badge>
          </div>
          <p className="text-slate-300 text-xs">Emissão de Notas Fiscais de Serviço Eletrônicas e RPS</p>
        </div>

        <Button variant="outline" onClick={() => navigate('/representantes/financeiro')} className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs">
          <ArrowLeft className="h-4 w-4" /> Voltar ao Financeiro
        </Button>
      </div>

      <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
        <CardHeader className="pb-3 border-b border-white/10">
          <CardTitle className="text-base font-bold text-white flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-blue-400" />
              Notas Fiscais Emitidas ({invoices.length})
            </span>
          </CardTitle>
          <CardDescription className="text-slate-400 text-xs">Apuração automática de ISS, PIS e COFINS sobre faturamento de mídia.</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          {invoices.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">Nenhuma nota fiscal emitida.</div>
          ) : (
            <div className="rounded-xl border border-white/10 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-950">
                  <TableRow className="border-white/10">
                    <TableHead className="text-slate-300">NFS-e / RPS</TableHead>
                    <TableHead className="text-slate-300">Cliente</TableHead>
                    <TableHead className="text-slate-300">Valor Serviços</TableHead>
                    <TableHead className="text-slate-300">ISS (5%)</TableHead>
                    <TableHead className="text-slate-300">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((n) => (
                    <TableRow key={n.id} className="border-white/10 hover:bg-white/5">
                      <TableCell>
                        <strong className="text-white block font-mono text-xs">{n.numero_nfse || `RPS #${n.numero_rps}`}</strong>
                        <span className="text-[10px] text-slate-500">{new Date(n.created_at).toLocaleDateString('pt-BR')}</span>
                      </TableCell>
                      <TableCell className="text-xs text-slate-300">{n.cliente?.empresas?.[0]?.nome_fantasia || 'Cliente'}</TableCell>
                      <TableCell className="text-xs font-bold text-emerald-400">
                        R$ {Number(n.valor_servicos).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-xs text-slate-300 font-mono">
                        R$ {Number(n.valor_iss).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-emerald-500/20 text-emerald-400">{n.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
