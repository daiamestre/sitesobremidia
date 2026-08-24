/**
 * SOBRE MÍDIA — CustomerPortalDashboard
 * Portal FASE 1 + FASE 2: Customer Command Center adaptativo por modalidade.
 *
 * Detecta modalidade do cliente (ANUNCIANTE/HOST/HÍBRIDO) e adapta:
 * - KPIs exibidos
 * - Widgets e módulos
 * - Mensagem de boas-vindas
 */

import { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useClienteModalidade, type ModalidadePortal } from '../hooks/useClienteModalidade';
import { useCentralUnread } from '@/hooks/useCentral';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  UserCheck, Tv, FileText, LifeBuoy, ArrowLeft, ShieldCheck,
  MapPin, DollarSign, Bell, TrendingUp, Zap, Monitor, Clock,
  Building2, Megaphone, Store, Landmark, AlertTriangle,
} from 'lucide-react';
import { ArtworkApproval } from '../components/portal/ArtworkApproval';
import { ProofOfPlayViewer } from '../components/portal/ProofOfPlayViewer';
import { CustomerSupportTickets } from '../components/portal/CustomerSupportTickets';
import { CustomerInvoices } from '../components/portal/CustomerInvoices';
import { customerPortalService } from '../services/customerPortal.service';
import { formatCurrency } from '@/utils/formatters';
import { cn } from '@/lib/utils';

// ──────────────────────────────────────────────────────────────────────
// KPI Definitions por modalidade
// ──────────────────────────────────────────────────────────────────────

interface KPI {
  label: string;
  value: string | number;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ComponentType<{ className?: string }>;
  sub?: string;
}

function getKpisAnunciante(kpis: DashboardKPIs): KPI[] {
  return [
    {
      label: 'Campanhas Ativas',
      value: kpis.campanhasAtivas,
      icon: Tv,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/20',
      borderColor: 'border-purple-500/30',
    },
    {
      label: 'Artes Aprovadas',
      value: `${kpis.artesAprovadasPct}%`,
      icon: ShieldCheck,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/20',
      borderColor: 'border-emerald-500/30',
    },
    {
      label: 'Contratos Vigentes',
      value: kpis.contratosVigentes,
      icon: FileText,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/20',
      borderColor: 'border-blue-500/30',
    },
    {
      label: 'Chamados Abertos',
      value: kpis.chamadosAbertos,
      icon: LifeBuoy,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/20',
      borderColor: 'border-amber-500/30',
    },
  ];
}

function getKpisHost(kpis: DashboardKPIs): KPI[] {
  return [
    {
      label: 'Pontos Ativos',
      value: kpis.pontosAtivos ?? 0,
      icon: MapPin,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/20',
      borderColor: 'border-emerald-500/30',
    },
    {
      label: 'Telas Online',
      value: kpis.telasOnline ?? 0,
      icon: Monitor,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/20',
      borderColor: 'border-blue-500/30',
    },
    {
      label: 'Receita Estimada',
      value: kpis.receitaEstimada != null ? formatCurrency(kpis.receitaEstimada) : '—',
      icon: DollarSign,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/20',
      borderColor: 'border-purple-500/30',
      sub: 'mês corrente',
    },
    {
      label: 'Contratos Vigentes',
      value: kpis.contratosVigentes,
      icon: FileText,
      color: 'text-slate-400',
      bgColor: 'bg-slate-500/20',
      borderColor: 'border-slate-500/30',
    },
  ];
}

// ──────────────────────────────────────────────────────────────────────
// Interfaces
// ──────────────────────────────────────────────────────────────────────

interface DashboardKPIs {
  campanhasAtivas: number;
  artesAprovadasPct: number;
  contratosVigentes: number;
  chamadosAbertos: number;
  // HOST específicos
  pontosAtivos?: number;
  telasOnline?: number;
  receitaEstimada?: number | null;
}

// ──────────────────────────────────────────────────────────────────────
// Mapa de ícones e labels por modalidade
// ──────────────────────────────────────────────────────────────────────

const MODALIDADE_CONFIG: Record<ModalidadePortal, {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tagline: string;
  color: string;
  badgeClass: string;
}> = {
  ANUNCIANTE: {
    icon: Megaphone,
    label: 'Painel do Anunciante',
    tagline: 'Gerencie campanhas, ofertas, aprovações e seu contrato.',
    color: 'text-purple-400',
    badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  },
  HOST: {
    icon: Store,
    label: 'Painel do Host',
    tagline: 'Monitore sua rede, receita de veiculação e status dos Players.',
    color: 'text-emerald-400',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
  HIBRIDO: {
    icon: Landmark,
    label: 'Painel Híbrido',
    tagline: 'Acesso completo: anuncie e hospede telas ao mesmo tempo.',
    color: 'text-blue-400',
    badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  },
};

// ──────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ──────────────────────────────────────────────────────────────────────

export default function CustomerPortalDashboard() {
  const navigate = useNavigate();
  const { empresaOperadoraId, usuario } = useAuth();
  const { modalidade, cliente, isLoading: loadingModalidade, isAnunciante, isHost } = useClienteModalidade();
  const { total: naoLidas } = useCentralUnread();

  const resolvedClienteId = usuario?.cliente_id || null;
  const resolvedEmpresaId = empresaOperadoraId || null;

  const [kpis, setKpis] = useState<DashboardKPIs>({
    campanhasAtivas: 0,
    artesAprovadasPct: 0,
    contratosVigentes: 0,
    chamadosAbertos: 0,
    pontosAtivos: 0,
    telasOnline: 0,
    receitaEstimada: null,
  });
  const [loadingKpis, setLoadingKpis] = useState(true);

  useEffect(() => {
    if (!resolvedClienteId) return;
    setLoadingKpis(true);
    customerPortalService
      .getDashboardKPIs(resolvedClienteId, resolvedEmpresaId)
      .then((data) => setKpis((prev) => ({ ...prev, ...data })))
      .finally(() => setLoadingKpis(false));
  }, [resolvedClienteId, resolvedEmpresaId]);

  // Enquanto modalidade carrega
  if (loadingModalidade) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  const config = modalidade ? MODALIDADE_CONFIG[modalidade] : MODALIDADE_CONFIG.ANUNCIANTE;
  const ModalidadeIcon = config.icon;

  // KPIs adaptados por modalidade
  const kpiList: KPI[] = isHost && !isAnunciante
    ? getKpisHost(kpis)
    : getKpisAnunciante(kpis);

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
      {/* ── Hero Header ── */}
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <ModalidadeIcon className={cn('h-6 w-6', config.color)} />
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">
              {config.label}
            </h2>
            {modalidade && (
              <Badge className={cn('border', config.badgeClass)}>
                {modalidade}
              </Badge>
            )}
            {naoLidas > 0 && (
              <Badge
                className="bg-red-500/20 text-red-400 border-red-500/30 gap-1 cursor-pointer"
                onClick={() => navigate('/portal/central')}
              >
                <Bell className="h-3 w-3" />
                {naoLidas} nova{naoLidas > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          <p className="text-slate-300 text-sm">{config.tagline}</p>
          {cliente && (
            <div className="flex items-center gap-1.5 text-slate-500 text-xs mt-1">
              <Building2 className="h-3 w-3" />
              <span>{cliente.nome_fantasia || cliente.razao_social}</span>
              {cliente.segmento && <span className="text-slate-600">· {cliente.segmento}</span>}
            </div>
          )}
        </div>
        <Button
          onClick={() => navigate('/workspace')}
          variant="outline"
          className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs flex-shrink-0"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar ao ERP
        </Button>
      </div>

      {/* ── KPIs Grid ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loadingKpis
          ? [...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)
          : kpiList.map((kpi) => (
              <Card key={kpi.label} className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={cn('p-3 rounded-2xl border flex-shrink-0', kpi.bgColor, kpi.borderColor)}>
                    <kpi.icon className={cn('h-5 w-5', kpi.color)} />
                  </div>
                  <div className="min-w-0">
                    <span className="text-slate-400 text-xs block font-semibold truncate">{kpi.label}</span>
                    <strong className={cn('text-xl font-bold', kpi.color)}>{kpi.value}</strong>
                    {kpi.sub && <span className="text-slate-600 text-[10px] block">{kpi.sub}</span>}
                  </div>
                </CardContent>
              </Card>
            ))
        }
      </div>

      {/* ── Widgets adaptativos ── */}
      {/* ANUNCIANTE + HÍBRIDO: Approval + Proof of Play */}
      {isAnunciante && (
        <>
          {kpis.campanhasAtivas === 0 ? (
            <Card className="border border-purple-500/20 bg-purple-500/5 rounded-2xl mb-4">
              <CardContent className="p-8 flex flex-col items-center justify-center text-center space-y-4">
                <div className="h-16 w-16 bg-purple-500/10 rounded-full flex items-center justify-center">
                  <Tv className="h-8 w-8 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Nenhuma campanha ativa</h3>
                  <p className="text-slate-400 mt-1 max-w-md mx-auto">
                    Aproveite para criar sua primeira campanha e exibir sua marca na nossa rede de telas.
                  </p>
                </div>
                <Button 
                  onClick={() => navigate('/portal/campanhas/nova')}
                  className="bg-purple-600 hover:bg-purple-700 text-white mt-2 rounded-xl"
                >
                  Criar Minha Primeira Campanha
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {resolvedEmpresaId && (
                <ArtworkApproval empresaOperadoraId={resolvedEmpresaId} />
              )}
              <ProofOfPlayViewer />
            </div>
          )}
        </>
      )}

      {/* TODOS: Faturas + Suporte */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CustomerInvoices />
        {resolvedEmpresaId && (
          <CustomerSupportTickets
            clienteId={resolvedClienteId || ''}
            empresaOperadoraId={resolvedEmpresaId}
          />
        )}
      </div>

      {/* HOST + HÍBRIDO: Alerta de telas offline e Inventário */}
      {isHost && (
        <Card className="border border-emerald-500/20 bg-emerald-500/5 rounded-2xl mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-emerald-400">
              <Store className="h-4 w-4" />
              Inventário e Conectividade
            </CardTitle>
          </CardHeader>
          <CardContent className="text-slate-400 text-sm">
            <p>Monitore a saúde do seu inventário de telas. Mantenha as telas online para maximizar sua receita de veiculação (Proof of Play).</p>
            <div className="flex flex-wrap gap-3 mt-4">
              <Button
                variant="outline"
                size="sm"
                className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 rounded-xl"
                onClick={() => navigate('/portal/minha-rede')}
              >
                <Store className="h-4 w-4 mr-2" />
                Gerenciar Inventário
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 rounded-xl"
                onClick={() => navigate('/portal/pontos')}
              >
                <MapPin className="h-4 w-4 mr-2" />
                Status das Telas
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
