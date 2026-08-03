import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, Building2, User, Calendar, Shield, DollarSign, Clock, AlertTriangle } from 'lucide-react';
import { PICompleto, PIStatus, PIPrioridade } from '../../services/pi.service';

interface PIHeaderProps {
  pi: PICompleto;
}

export function PIHeader({ pi }: PIHeaderProps) {
  const getStatusBadge = (status: PIStatus) => {
    const statusMap: Record<PIStatus, { label: string; class: string }> = {
      EM_ELABORACAO: { label: 'Em Elaboração', class: 'bg-slate-500/20 text-slate-300 border-slate-500/30' },
      AGUARDANDO_MATERIAL: { label: 'Aguardando Material', class: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
      MATERIAL_RECEBIDO: { label: 'Material Recebido', class: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
      EM_PRODUCAO: { label: 'Em Produção', class: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
      AGUARDANDO_APROVACAO: { label: 'Aguardando Aprovação', class: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' },
      APROVADO: { label: 'Aprovado', class: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
      AGENDADO: { label: 'Agendado na Rede', class: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
      EM_EXIBICAO: { label: 'Em Exibição no Player', class: 'bg-emerald-500/30 text-emerald-300 border-emerald-400/50 glow-emerald' },
      FINALIZADO: { label: 'Finalizado', class: 'bg-slate-700 text-slate-300 border-slate-600' },
      CANCELADO: { label: 'Cancelado', class: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
    };

    const config = statusMap[status] || { label: status, class: 'bg-slate-800 text-slate-300' };
    return <Badge className={`${config.class} px-3 py-1 font-bold text-xs`}>{config.label}</Badge>;
  };

  const getPriorityBadge = (prio: PIPrioridade) => {
    const prioMap: Record<PIPrioridade, { label: string; class: string }> = {
      BAIXA: { label: 'Baixa', class: 'bg-slate-700 text-slate-300' },
      MEDIA: { label: 'Média', class: 'bg-blue-500/20 text-blue-400' },
      ALTA: { label: 'Alta', class: 'bg-amber-500/20 text-amber-400' },
      URGENTE: { label: 'URGENTE', class: 'bg-rose-500/30 text-rose-400 border-rose-500/50 animate-pulse' },
    };
    const config = prioMap[prio] || { label: prio, class: 'bg-slate-700 text-slate-300' };
    return <Badge className={`${config.class} text-[11px] font-bold`}>{config.label}</Badge>;
  };

  const emp = pi.cliente?.empresas?.[0];

  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl rounded-2xl">
      <CardContent className="p-6 space-y-4">
        {/* Row 1: Title & Badges */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-primary px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20">
                {pi.numero_pi}
              </span>
              <h2 className="text-xl font-bold text-white">{pi.titulo}</h2>
            </div>
            <p className="text-xs text-slate-400">
              {pi.descricao || 'Pedido de Inserção operacional atrelado ao contrato e proposta comercial.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {getPriorityBadge(pi.prioridade)}
            {getStatusBadge(pi.status)}
          </div>
        </div>

        {/* Row 2: Grid metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
            <span className="text-slate-400 flex items-center gap-1.5 text-[11px]">
              <Building2 className="h-3.5 w-3.5 text-primary" />
              Cliente Comercial
            </span>
            <strong className="text-white font-bold block truncate">{emp?.nome_fantasia || emp?.razao_social || 'N/A'}</strong>
            <span className="text-[10px] text-slate-500 font-mono block">{emp?.cnpj}</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
            <span className="text-slate-400 flex items-center gap-1.5 text-[11px]">
              <FileText className="h-3.5 w-3.5 text-emerald-400" />
              Contrato / Proposta
            </span>
            <strong className="text-emerald-400 font-bold block">
              {pi.contrato?.numero_contrato || pi.proposta?.numero_proposta || 'N/V'}
            </strong>
            <span className="text-[10px] text-slate-500 block">
              R$ {Number(pi.contrato?.valor_mensal || pi.proposta?.valor_final || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
            <span className="text-slate-400 flex items-center gap-1.5 text-[11px]">
              <Calendar className="h-3.5 w-3.5 text-amber-400" />
              Vigência de Exibição
            </span>
            <strong className="text-white font-bold block">
              {new Date(pi.inicio_veiculacao).toLocaleDateString('pt-BR')} até {new Date(pi.fim_veiculacao).toLocaleDateString('pt-BR')}
            </strong>
            <span className="text-[10px] text-slate-500 block">{pi.quantidade_pecas || 1} Peça(s) de Mídia</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
            <span className="text-slate-400 flex items-center gap-1.5 text-[11px]">
              <Clock className="h-3.5 w-3.5 text-indigo-400" />
              Emissão / Atualização
            </span>
            <strong className="text-white font-bold block">
              {new Date(pi.created_at).toLocaleDateString('pt-BR')}
            </strong>
            <span className="text-[10px] text-slate-500 block">v{pi.versao_atual || 1} • R2 Storage</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
