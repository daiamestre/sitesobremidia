export type WorkflowStatus =
  | 'PROSPECT'
  | 'PROPOSTA_GERADA'
  | 'AGUARDANDO_ASSINATURA'
  | 'AGUARDANDO_PAGAMENTO'
  | 'PAGAMENTO_CONFIRMADO'
  | 'EM_PRODUCAO'
  | 'AGUARDANDO_APROVACAO'
  | 'CAMPANHA_APROVADA'
  | 'CAMPANHA_ATIVA'
  | 'CAMPANHA_FINALIZADA'
  | 'CANCELADO';

export interface WorkflowStatusConfig {
  id: WorkflowStatus;
  label: string;
  description: string;
  color: string; // Tailwind color class
  hexColor: string;
  stepNumber: number;
}

export const WORKFLOW_STATUS_CONFIG: Record<WorkflowStatus, WorkflowStatusConfig> = {
  PROSPECT: {
    id: 'PROSPECT',
    label: 'Prospect',
    description: 'Representante iniciou negociação comercial',
    color: 'bg-slate-500/10 text-slate-300 border-slate-500/30',
    hexColor: '#64748b',
    stepNumber: 1,
  },
  PROPOSTA_GERADA: {
    id: 'PROPOSTA_GERADA',
    label: 'Proposta Gerada',
    description: 'Sistema gerou automaticamente a proposta comercial',
    color: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    hexColor: '#3b82f6',
    stepNumber: 2,
  },
  AGUARDANDO_ASSINATURA: {
    id: 'AGUARDANDO_ASSINATURA',
    label: 'Aguardando Assinatura',
    description: 'Cliente recebeu a proposta e aguarda assinatura digital',
    color: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    hexColor: '#f59e0b',
    stepNumber: 3,
  },
  AGUARDANDO_PAGAMENTO: {
    id: 'AGUARDANDO_PAGAMENTO',
    label: 'Aguardando Pagamento',
    description: 'Contrato assinado. Inicial do contrato aguardando financeiro',
    color: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
    hexColor: '#f97316',
    stepNumber: 4,
  },
  PAGAMENTO_CONFIRMADO: {
    id: 'PAGAMENTO_CONFIRMADO',
    label: 'Pagamento Confirmado',
    description: 'Pagamento confirmado pelo financeiro / admin',
    color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    hexColor: '#10b981',
    stepNumber: 5,
  },
  EM_PRODUCAO: {
    id: 'EM_PRODUCAO',
    label: 'Em Produção',
    description: 'Designer iniciou a produção dos arquivos de mídia',
    color: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    hexColor: '#a855f7',
    stepNumber: 6,
  },
  AGUARDANDO_APROVACAO: {
    id: 'AGUARDANDO_APROVACAO',
    label: 'Aguardando Aprovação',
    description: 'Designer enviou a arte para aprovação do cliente',
    color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
    hexColor: '#6366f1',
    stepNumber: 7,
  },
  CAMPANHA_APROVADA: {
    id: 'CAMPANHA_APROVADA',
    label: 'Campanha Aprovada',
    description: 'Cliente aprovou a mídia. Agendamento automático no Player',
    color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
    hexColor: '#06b6d4',
    stepNumber: 8,
  },
  CAMPANHA_ATIVA: {
    id: 'CAMPANHA_ATIVA',
    label: 'Campanha Ativa',
    description: 'Conteúdo em veiculação nas telas da rede',
    color: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40',
    hexColor: '#10b981',
    stepNumber: 9,
  },
  CAMPANHA_FINALIZADA: {
    id: 'CAMPANHA_FINALIZADA',
    label: 'Campanha Finalizada',
    description: 'Contrato concluído com sucesso e arquivado no histórico',
    color: 'bg-slate-700/30 text-slate-400 border-slate-600/30',
    hexColor: '#475569',
    stepNumber: 10,
  },
  CANCELADO: {
    id: 'CANCELADO',
    label: 'Cancelado',
    description: 'Contrato ou negociação cancelada',
    color: 'bg-red-500/10 text-red-400 border-red-500/30',
    hexColor: '#ef4444',
    stepNumber: 0,
  },
};
