import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserCheck, Tv, FileText, LifeBuoy, ArrowLeft, ShieldCheck } from 'lucide-react';
import { ArtworkApproval } from '../components/portal/ArtworkApproval';
import { ProofOfPlayViewer } from '../components/portal/ProofOfPlayViewer';
import { CustomerSupportTickets } from '../components/portal/CustomerSupportTickets';
import { CustomerInvoices } from '../components/portal/CustomerInvoices';

export default function CustomerPortalDashboard() {
  const navigate = useNavigate();
  const { empresaOperadoraId } = useAuth();
  const dummyClienteId = 'cli-001';

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <UserCheck className="h-6 w-6 text-purple-400" />
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">Portal do Cliente Anunciante</h2>
            <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 ml-2">FASE 9.5</Badge>
          </div>
          <p className="text-slate-300 text-xs">Self-Service Enterprise: Aprovações de Arte, Proof-of-Play, Contratos e Faturamento</p>
        </div>

        <Button onClick={() => navigate('/representantes/dashboard')} variant="outline" className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs">
          <ArrowLeft className="h-4 w-4" /> Voltar ao ERP
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <Tv className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">Campanhas Ativas</span>
              <strong className="text-xl font-bold text-white">3</strong>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">Artes Aprovadas</span>
              <strong className="text-xl font-bold text-emerald-400">100%</strong>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">Contratos Vigentes</span>
              <strong className="text-xl font-bold text-blue-400">2</strong>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <LifeBuoy className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">Chamados Abertos</span>
              <strong className="text-xl font-bold text-amber-400">0</strong>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ArtworkApproval producaoId="prod-001" empresaOperadoraId={empresaOperadoraId || 'emp-001'} />
        <ProofOfPlayViewer />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CustomerInvoices />
        <CustomerSupportTickets clienteId={dummyClienteId} empresaOperadoraId={empresaOperadoraId || 'emp-001'} />
      </div>
    </div>
  );
}
