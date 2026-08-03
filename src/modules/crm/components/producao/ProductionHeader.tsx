import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Film, Building2, Layers, Calendar, Clock, CheckCircle2, User } from 'lucide-react';
import { ProducaoCompleta, ProducaoStatus } from '../../services/producao.service';

interface ProductionHeaderProps {
  producao: ProducaoCompleta;
}

export function ProductionHeader({ producao }: ProductionHeaderProps) {
  const getStatusBadge = (status: ProducaoStatus) => {
    const map: Record<ProducaoStatus, { label: string; class: string }> = {
      CRIADA: { label: 'Criada', class: 'bg-slate-500/20 text-slate-300 border-slate-500/30' },
      AGUARDANDO_MATERIAL: { label: 'Aguardando Material', class: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
      MATERIAL_RECEBIDO: { label: 'Material Recebido', class: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
      EM_DESENVOLVIMENTO: { label: 'Em Desenvolvimento', class: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
      AGUARDANDO_APROVACAO: { label: 'Aguardando Aprovação', class: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' },
      REPROVADA: { label: 'Reprovada', class: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
      APROVADA: { label: 'Aprovada', class: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
      LIBERADA: { label: 'Liberada para Rede', class: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
      PUBLICADA: { label: 'Publicada', class: 'bg-emerald-500/30 text-emerald-300 border-emerald-400/50 glow-emerald' },
      FINALIZADA: { label: 'Finalizada', class: 'bg-slate-700 text-slate-300' },
      CANCELADA: { label: 'Cancelada', class: 'bg-rose-500/20 text-rose-400' },
      SUSPENSA: { label: 'Suspensa', class: 'bg-amber-500/20 text-amber-400' },
    };
    const config = map[status] || { label: status, class: 'bg-slate-800 text-slate-300' };
    return <Badge className={`${config.class} px-3 py-1 font-bold text-xs`}>{config.label}</Badge>;
  };

  const emp = producao.cliente?.empresas?.[0];

  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl rounded-2xl">
      <CardContent className="p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Film className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-bold text-white">{producao.titulo}</h2>
            </div>
            <p className="text-xs text-slate-400">{producao.descricao || 'Produção de mídia vinculada ao Pedido de Inserção.'}</p>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-white/10 text-slate-300 text-[11px]">
              Prioridade {producao.prioridade}
            </Badge>
            {getStatusBadge(producao.status)}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
            <span className="text-slate-400 flex items-center gap-1.5 text-[11px]">
              <Building2 className="h-3.5 w-3.5 text-primary" /> Cliente
            </span>
            <strong className="text-white font-bold block truncate">{emp?.nome_fantasia || emp?.razao_social || 'N/A'}</strong>
            <span className="text-[10px] text-slate-500 block">{emp?.cnpj}</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
            <span className="text-slate-400 flex items-center gap-1.5 text-[11px]">
              <Layers className="h-3.5 w-3.5 text-purple-400" /> PI Vinculado
            </span>
            <strong className="text-purple-400 font-bold block">
              {producao.pedido_insercao?.numero_pi || 'PI Registrado'}
            </strong>
            <span className="text-[10px] text-slate-500 block">{producao.pedido_insercao?.titulo}</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
            <span className="text-slate-400 flex items-center gap-1.5 text-[11px]">
              <Calendar className="h-3.5 w-3.5 text-amber-400" /> Prazo de Entrega
            </span>
            <strong className="text-white font-bold block">
              {producao.prazo ? new Date(producao.prazo).toLocaleDateString('pt-BR') : 'Sem Prazo'}
            </strong>
            <span className="text-[10px] text-slate-500 block">Designer Responsável</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
            <span className="text-slate-400 flex items-center gap-1.5 text-[11px]">
              <Clock className="h-3.5 w-3.5 text-emerald-400" /> Início da Produção
            </span>
            <strong className="text-white font-bold block">
              {new Date(producao.created_at).toLocaleDateString('pt-BR')}
            </strong>
            <span className="text-[10px] text-slate-500 block">Cloudflare R2 Storage</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
