import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { producaoService, ProducaoCompleta } from '../services/producao.service';
import { ProductionHeader } from '../components/producao/ProductionHeader';
import { ProductionTimeline } from '../components/producao/ProductionTimeline';
import { MediaUploader } from '../components/producao/MediaUploader';
import { MediaVersions } from '../components/producao/MediaVersions';
import { ApprovalPanel } from '../components/producao/ApprovalPanel';
import { ProductionHistory } from '../components/producao/ProductionHistory';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2, Film, ShieldCheck } from 'lucide-react';

export default function ProductionDetailsPage() {
  const { producaoId } = useParams<{ producaoId: string }>();
  const navigate = useNavigate();
  const [producao, setProducao] = useState<ProducaoCompleta | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!producaoId) return;
    setLoading(true);
    const data = await producaoService.getProduction(producaoId);
    setProducao(data);
    setLoading(false);
  }, [producaoId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!producao) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-slate-300">Produção não encontrada.</p>
        <Button onClick={() => {
          const basePath = window.location.pathname.startsWith('/workspace') ? '/workspace' : '/representantes';
          navigate(`${basePath}/campanhas`);
        }} variant="outline" className="text-white">
          Voltar para Lista
        </Button>
      </div>
    );
  }

  const primaryMidia = producao.midias?.[0] || null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Film className="h-6 w-6 text-primary" />
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">
              Painel de Controle da Produção
            </h2>
            <Badge className="bg-primary/20 text-primary border-primary/30 ml-2">FASE 7.5-B</Badge>
          </div>
          <p className="text-slate-300 text-xs">
            Upload no Cloudflare R2 ➔ Versionamento Imutável ➔ Painel de Aprovação
          </p>
        </div>

        <Button variant="outline" onClick={() => {
          const basePath = window.location.pathname.startsWith('/workspace') ? '/workspace' : '/representantes';
          navigate(`${basePath}/campanhas`);
        }} className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs">
          <ArrowLeft className="h-4 w-4" />
          Voltar para Produções
        </Button>
      </div>

      {/* Header Resumo */}
      <ProductionHeader producao={producao} />

      {/* Stepper Timeline */}
      <ProductionTimeline currentStatus={producao.status} />

      {/* Componente de Upload para o R2 */}
      <MediaUploader producaoId={producao.id} onUploadSuccess={loadData} />

      {/* Painel de Aprovação Formal da Mídia */}
      {primaryMidia && <ApprovalPanel midia={primaryMidia} onActionSuccess={loadData} />}

      {/* Histórico Imutável de Versões no R2 */}
      {primaryMidia && <MediaVersions versoes={primaryMidia.versoes || []} />}

      {/* Histórico Operacional Completo */}
      <ProductionHistory historico={producao.historico || []} />
    </div>
  );
}
