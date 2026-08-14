import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { digitalSignatureService } from '../services/digitalSignature.service';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileCheck, Clock, CheckCircle2, Loader2, ArrowLeft, Send } from 'lucide-react';
import { PendingSignatures } from '../components/signature/PendingSignatures';
import { SignedContracts } from '../components/signature/SignedContracts';
import { WebhookMonitor } from '../components/signature/WebhookMonitor';

export default function SignatureDashboard() {
  const navigate = useNavigate();
  const { empresaOperadoraId } = useAuth();
  const [assinaturas, setAssinaturas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSignatures = useCallback(async () => {
    setLoading(true);
    const data = await digitalSignatureService.listSignatures(empresaOperadoraId || undefined);
    setAssinaturas(data);
    setLoading(false);
  }, [empresaOperadoraId]);

  useEffect(() => {
    fetchSignatures();
  }, [fetchSignatures]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const pendentes = assinaturas.filter((a) => a.status === 'ENVIADO' || a.status === 'VISUALIZADO');
  const assinados = assinaturas.filter((a) => a.status === 'ASSINADO');

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FileCheck className="h-6 w-6 text-emerald-400" />
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">Central de Assinatura Digital</h2>
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 ml-2">FASE 9.4</Badge>
          </div>
          <p className="text-slate-300 text-xs">Integração E-Sign via Webhooks com Liberação Automática de PI</p>
        </div>

        <Button onClick={() => navigate('/representantes/contratos')} variant="outline" className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs">
          <ArrowLeft className="h-4 w-4" /> Voltar aos Contratos
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">Envelopes Pendentes</span>
              <strong className="text-xl font-bold text-amber-400">{pendentes.length}</strong>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">Contratos Assinados</span>
              <strong className="text-xl font-bold text-emerald-400">{assinados.length}</strong>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
              <Send className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">Total de Envelopes</span>
              <strong className="text-xl font-bold text-white">{assinaturas.length}</strong>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <PendingSignatures pendentes={pendentes} onAssinaturaEvent={fetchSignatures} />
        <SignedContracts assinados={assinados} onAssinaturaEvent={fetchSignatures} />
      </div>

      <WebhookMonitor empresaOperadoraId={empresaOperadoraId || undefined} />
    </div>
  );
}
