import { useNavigate } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Smartphone, ArrowLeft, Navigation, Camera, RefreshCw } from 'lucide-react';
import { SalesDashboardMobile } from '../components/mobile/SalesDashboardMobile';
import { FieldDashboard } from '../components/mobile/FieldDashboard';
import { RouteDashboard } from '../components/mobile/RouteDashboard';
import { SyncDashboard } from '../components/mobile/SyncDashboard';

export default function MobileDashboard() {
  const navigate = useNavigate();
  const { empresaOperadoraId } = useAuth();

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Smartphone className="h-6 w-6 text-emerald-400" />
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">App Mobile Enterprise (PWA)</h2>
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 ml-2">FASE 9.6</Badge>
          </div>
          <p className="text-slate-300 text-xs">Vendas de Campo, Manutenção Técnica, GPS & Offline-First</p>
        </div>

        <Button onClick={() => navigate('/representantes/dashboard')} variant="outline" className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs">
          <ArrowLeft className="h-4 w-4" /> Voltar ao ERP
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SalesDashboardMobile empresaOperadoraId={empresaOperadoraId || 'emp-001'} />
        <FieldDashboard empresaOperadoraId={empresaOperadoraId || 'emp-001'} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <RouteDashboard />
        <SyncDashboard empresaOperadoraId={empresaOperadoraId || 'emp-001'} />
      </div>
    </div>
  );
}
