/**
 * ============================================================================
 * SPRINT 1.5: HARDENING, ZERO TRUST E HOMOLOGAÇÃO OPERACIONAL
 * REGISTRO CENTRAL DE PERMISSÕES (PERMISSION REGISTRY ENTERPRISE)
 * ============================================================================
 * 
 * Fonte única de verdade (Single Source of Truth) para todas as permissões 
 * granulares da Plataforma Operacional Sobre Mídia ERP.
 * Substitui verificações em strings literais esparsas (ex: can("upload")) por 
 * chamadas tipadas contra este registro: can(PERMISSIONS.MEDIA_UPLOAD).
 */

export type PermissionGroup = 
  | 'crm' 
  | 'contracts' 
  | 'financial' 
  | 'billing' 
  | 'media' 
  | 'campaigns' 
  | 'players' 
  | 'network' 
  | 'reports' 
  | 'users' 
  | 'team' 
  | 'system';

export type PermissionAction = 
  | 'read' 
  | 'write' 
  | 'create' 
  | 'update' 
  | 'delete' 
  | 'approve' 
  | 'manage' 
  | 'issue' 
  | 'cancel' 
  | 'view' 
  | 'read_own' 
  | 'partner_status';

export const PERMISSIONS = {
  // Módulo CRM & Vendas
  CRM_READ: 'crm.read',
  CRM_WRITE: 'crm.write',
  CRM_CREATE: 'crm.create',
  PROPOSAL_CREATE: 'proposals.create',

  // Módulo Contratos & PIs
  CONTRACT_READ: 'contracts.read',
  CONTRACT_WRITE: 'contracts.write',
  CONTRACT_READ_OWN: 'contracts.read_own',

  // Módulo Financeiro & Fluxo de Caixa
  FINANCIAL_READ: 'financial.read',
  FINANCIAL_WRITE: 'financial.write',
  FINANCIAL_REPASSE_VIEW: 'financial.repasse_view',

  // Módulo Billing / Notas e Faturas
  BILLING_INVOICE_READ: 'billing.invoice.read',
  BILLING_INVOICE_ISSUE: 'billing.invoice.issue',
  BILLING_INVOICE_CANCEL: 'billing.invoice.cancel',

  // Módulo Operação, Mídia & Transcode R2
  MEDIA_MANAGE: 'media.manage',
  MEDIA_UPLOAD: 'media.upload',
  MEDIA_DELETE: 'media.delete',
  CAMPAIGNS_MANAGE: 'campaigns.manage',
  CAMPAIGNS_READ_OWN: 'campaigns.read_own',

  // Módulo Telas & Players (Rede Física)
  NETWORK_VIEW: 'network.view',
  NETWORK_PARTNER_STATUS: 'network.partner_status',
  PLAYER_MANAGE: 'players.manage',
  PLAYER_READ_OWN: 'players.read_own',

  // Módulo BI & Executive Reports
  REPORTS_VIEW: 'reports.view',
  REPORTS_CLIENT_VIEW: 'reports.client_view',

  // Governança, Equipes e Central de Acesso
  USERS_APPROVE: 'users.approve',
  TEAM_MANAGE: 'team.manage',
  SYSTEM_MANAGE: 'system.manage',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export type PermissionValue = typeof PERMISSIONS[PermissionKey];

/**
 * Estrutura preparatória de hierarquia expansível para crescimento futuro
 * (Role -> Permission Group -> Permission -> Action)
 */
export interface PermissionNode {
  group: PermissionGroup;
  permission: PermissionValue;
  action: PermissionAction;
  description: string;
}

export const PERMISSION_NODES: Record<PermissionValue, PermissionNode> = {
  [PERMISSIONS.CRM_READ]: { group: 'crm', permission: PERMISSIONS.CRM_READ, action: 'read', description: 'Consulta geral a clientes e leads no CRM' },
  [PERMISSIONS.CRM_WRITE]: { group: 'crm', permission: PERMISSIONS.CRM_WRITE, action: 'write', description: 'Edição e exclusão administrativa no CRM' },
  [PERMISSIONS.CRM_CREATE]: { group: 'crm', permission: PERMISSIONS.CRM_CREATE, action: 'create', description: 'Criação de novos clientes na carteira própria' },
  [PERMISSIONS.PROPOSAL_CREATE]: { group: 'crm', permission: PERMISSIONS.PROPOSAL_CREATE, action: 'create', description: 'Geração de propostas comerciais (PIs)' },

  [PERMISSIONS.CONTRACT_READ]: { group: 'contracts', permission: PERMISSIONS.CONTRACT_READ, action: 'read', description: 'Leitura irrestrita de contratos' },
  [PERMISSIONS.CONTRACT_WRITE]: { group: 'contracts', permission: PERMISSIONS.CONTRACT_WRITE, action: 'write', description: 'Gestão e homologação de contratos' },
  [PERMISSIONS.CONTRACT_READ_OWN]: { group: 'contracts', permission: PERMISSIONS.CONTRACT_READ_OWN, action: 'read_own', description: 'Leitura estrita de contratos próprios (Anunciante)' },

  [PERMISSIONS.FINANCIAL_READ]: { group: 'financial', permission: PERMISSIONS.FINANCIAL_READ, action: 'read', description: 'Acesso ao DRE e relatórios de fluxo de caixa' },
  [PERMISSIONS.FINANCIAL_WRITE]: { group: 'financial', permission: PERMISSIONS.FINANCIAL_WRITE, action: 'write', description: 'Lançamentos financeiros e aprovação de pagamentos' },
  [PERMISSIONS.FINANCIAL_REPASSE_VIEW]: { group: 'financial', permission: PERMISSIONS.FINANCIAL_REPASSE_VIEW, action: 'view', description: 'Visualização de repasse para Parceiros de Rede' },

  [PERMISSIONS.BILLING_INVOICE_READ]: { group: 'billing', permission: PERMISSIONS.BILLING_INVOICE_READ, action: 'read', description: 'Leitura de faturas emitidas' },
  [PERMISSIONS.BILLING_INVOICE_ISSUE]: { group: 'billing', permission: PERMISSIONS.BILLING_INVOICE_ISSUE, action: 'issue', description: 'Emissão de notas fiscais e boletos' },
  [PERMISSIONS.BILLING_INVOICE_CANCEL]: { group: 'billing', permission: PERMISSIONS.BILLING_INVOICE_CANCEL, action: 'cancel', description: 'Cancelamento fiscal de faturas' },

  [PERMISSIONS.MEDIA_MANAGE]: { group: 'media', permission: PERMISSIONS.MEDIA_MANAGE, action: 'manage', description: 'Gestão geral da grade e acervo de mídias' },
  [PERMISSIONS.MEDIA_UPLOAD]: { group: 'media', permission: PERMISSIONS.MEDIA_UPLOAD, action: 'create', description: 'Upload e disparo de transcode no Cloudflare R2' },
  [PERMISSIONS.MEDIA_DELETE]: { group: 'media', permission: PERMISSIONS.MEDIA_DELETE, action: 'delete', description: 'Exclusão de arquivos multimídia no acervo' },
  [PERMISSIONS.CAMPAIGNS_MANAGE]: { group: 'campaigns', permission: PERMISSIONS.CAMPAIGNS_MANAGE, action: 'manage', description: 'Programação de campanhas publicitárias' },
  [PERMISSIONS.CAMPAIGNS_READ_OWN]: { group: 'campaigns', permission: PERMISSIONS.CAMPAIGNS_READ_OWN, action: 'read_own', description: 'Consulta externa de campanhas próprias (Anunciante)' },

  [PERMISSIONS.NETWORK_VIEW]: { group: 'network', permission: PERMISSIONS.NETWORK_VIEW, action: 'read', description: 'Monitoramento geral de players e telas de mídia' },
  [PERMISSIONS.NETWORK_PARTNER_STATUS]: { group: 'network', permission: PERMISSIONS.NETWORK_PARTNER_STATUS, action: 'partner_status', description: 'Inspeção de heartbeats e status pelo Parceiro de Rede' },
  [PERMISSIONS.PLAYER_MANAGE]: { group: 'players', permission: PERMISSIONS.PLAYER_MANAGE, action: 'manage', description: 'Atribuição de playlists e comandos remotos a players' },
  [PERMISSIONS.PLAYER_READ_OWN]: { group: 'players', permission: PERMISSIONS.PLAYER_READ_OWN, action: 'read_own', description: 'Leitura de players instalados no próprio estabelecimento' },

  [PERMISSIONS.REPORTS_VIEW]: { group: 'reports', permission: PERMISSIONS.REPORTS_VIEW, action: 'view', description: 'Painéis corporativos executivos e Inteligência Artificial' },
  [PERMISSIONS.REPORTS_CLIENT_VIEW]: { group: 'reports', permission: PERMISSIONS.REPORTS_CLIENT_VIEW, action: 'view', description: 'Relatório de exibição e retorno publicitário do cliente' },

  [PERMISSIONS.USERS_APPROVE]: { group: 'users', permission: PERMISSIONS.USERS_APPROVE, action: 'approve', description: 'Aprovação de cadastros na Fila da Central' },
  [PERMISSIONS.TEAM_MANAGE]: { group: 'team', permission: PERMISSIONS.TEAM_MANAGE, action: 'manage', description: 'Coordenação e gestão hierárquica de equipes' },
  [PERMISSIONS.SYSTEM_MANAGE]: { group: 'system', permission: PERMISSIONS.SYSTEM_MANAGE, action: 'manage', description: 'Governança global soberana do ecossistema' },
};
