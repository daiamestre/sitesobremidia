import { useNavigate } from 'react';
import { PixManagement } from '../components/financeiro/PixManagement';
import { BoletoManagement } from '../components/financeiro/BoletoManagement';
import { GatewayConfiguration } from '../components/financeiro/GatewayConfiguration';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreditCard, ArrowLeft } from 'lucide-react';

export default function BillingDashboard() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-primary" />
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">Central de Cobranças & Gateways</h2>
            <Badge className="bg-primary/20 text-primary border-primary/30 ml-2">FASE 9.1-B</Badge>
          </div>
          <p className="text-slate-300 text-xs">Gestão de Boletos, QRCodes PIX, Gateways e Régua Automática</p>
        </div>

        <Button variant="outline" onClick={() => navigate('/representantes/financeiro')} className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs">
          <ArrowLeft className="h-4 w-4" /> Voltar ao Financeiro
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <PixManagement />
        <BoletoManagement />
      </div>

      <GatewayConfiguration />
    </div>
  );
}
