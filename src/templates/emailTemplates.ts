export type TemplateType = 
  | 'ACCESS_REQUEST_REPRESENTANTE' 
  | 'ACCESS_REQUEST_GESTOR_TELAS' 
  | 'ACCESS_APPROVED' 
  | 'ACCESS_REJECTED' 
  | 'ACCESS_SUSPENDED'
  | 'PLAYER_OFFLINE_ALERT'
  | 'COLLECTION_REMINDER_D5'
  | 'COLLECTION_REMINDER_D1'
  | 'COLLECTION_OVERDUE';

export interface EmailTemplateData {
  nome: string;
  email: string;
  tipoAcesso?: string;
  requestId?: string;
  simUrl?: string;
  naoUrl?: string;
  motivoRejeicao?: string;
  nomeTela?: string;
  tempoOfflineMinutes?: number;
  cliente_nome?: string;
  empresa_nome?: string;
  valor?: string;
  vencimento?: string;
  dias_para_vencimento?: number;
  dias_em_atraso?: number;
  link_pagamento?: string;
  numero_cobranca?: string;
}

export class EmailTemplates {
  static getTemplate(type: TemplateType, data: EmailTemplateData): { subject: string; html: string } {
    switch (type) {
      case 'ACCESS_REQUEST_REPRESENTANTE':
        return {
          subject: `[APROVAÇÃO NECESSÁRIA] Novo Representante Comercial: ${data.nome}`,
          html: EmailTemplates.renderAdminRequestEmail(
            `Olá, ${data.nome} se cadastrou como representante. Você aprova esse cadastro?`,
            data
          ),
        };

      case 'ACCESS_REQUEST_GESTOR_TELAS':
        return {
          subject: `[APROVAÇÃO NECESSÁRIA] Novo Gestor de Telas: ${data.nome}`,
          html: EmailTemplates.renderAdminRequestEmail(
            `Olá, ${data.nome} se cadastrou como gestor de telas. Você aprova esse cadastro?`,
            data
          ),
        };

      case 'ACCESS_APPROVED':
        return {
          subject: 'Seu cadastro na plataforma SOBRE MÍDIA foi APROVADO!',
          html: `
            <div style="font-family: sans-serif; background-color: #0f172a; color: #f8fafc; padding: 25px; border-radius: 12px;">
              <h2 style="color: #10b981;">Acesso Liberado!</h2>
              <p>Olá <strong>${data.nome}</strong>,</p>
              <p>Seu cadastro na plataforma <strong>SOBRE MÍDIA</strong> foi <strong>APROVADO</strong> pela administração.</p>
              <p>Seu acesso às áreas da plataforma já está totalmente liberado.</p>
            </div>
          `,
        };

      case 'ACCESS_REJECTED':
        return {
          subject: 'Informação sobre seu cadastro na plataforma SOBRE MÍDIA',
          html: `
            <div style="font-family: sans-serif; background-color: #0f172a; color: #f8fafc; padding: 25px; border-radius: 12px;">
              <h2 style="color: #ef4444;">Cadastro Não Aprovado</h2>
              <p>Olá <strong>${data.nome}</strong>,</p>
              <p>Seu cadastro na plataforma <strong>SOBRE MÍDIA</strong> não foi aprovado pela administração neste momento.</p>
              ${data.motivoRejeicao ? `<p><strong>Motivo:</strong> ${data.motivoRejeicao}</p>` : ''}
            </div>
          `,
        };

      case 'ACCESS_SUSPENDED':
        return {
          subject: 'Aviso de Suspensão de Acesso — SOBRE MÍDIA',
          html: `
            <div style="font-family: sans-serif; background-color: #0f172a; color: #f8fafc; padding: 25px; border-radius: 12px;">
              <h2 style="color: #f59e0b;">Acesso Temporariamente Suspenso</h2>
              <p>Olá <strong>${data.nome}</strong>,</p>
              <p>Seu acesso à plataforma <strong>SOBRE MÍDIA</strong> foi temporariamente suspenso pela administração.</p>
            </div>
          `,
        };

      case 'PLAYER_OFFLINE_ALERT':
        return {
          subject: `[ALERTA DE TELEMETRIA] Player Offline: ${data.nomeTela || 'Tela Desconhecida'}`,
          html: `
            <div style="font-family: sans-serif; background-color: #0f172a; color: #f8fafc; padding: 25px; border-radius: 12px;">
              <h2 style="color: #f43f5e;">Alerta de Tela Offline</h2>
              <p>A tela <strong>${data.nomeTela}</strong> parou de emitir batimentos de telemetria há mais de <strong>${data.tempoOfflineMinutes || 15} minutos</strong>.</p>
            </div>
          `,
        };

      case 'COLLECTION_REMINDER_D5':
        return {
          subject: `Lembrete: Cobrança vencendo em ${data.dias_para_vencimento} dias`,
          html: `
            <div style="font-family: sans-serif; background-color: #0f172a; color: #f8fafc; padding: 25px; border-radius: 12px;">
              <h2 style="color: #10b981;">Lembrete de Cobrança</h2>
              <p>Olá <strong>${data.cliente_nome}</strong>,</p>
              <p>Este é um lembrete de que sua cobrança de <strong>${data.valor}</strong> vence em <strong>${data.vencimento}</strong> (<strong>${data.dias_para_vencimento}</strong> dias restantes).</p>
              ${data.dias_em_atraso > 0 ? '<p style="color: #f59e0b;"><strong>Atenção:</strong> Este título já está em atraso.</p>' : ''}
              <p>Por favor, realize o pagamento para evitar multas e juros.</p>
              ${data.link_pagamento ? '<p><a href="' + data.link_pagamento + '" style="background-color: #10b981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5;">Pagar Agora</a></p>' : ''}
              <p>Atenciosamente,<br/>Equipe SOBRE MÍDIA</p>
            </div>
          `,
        };

      case 'COLLECTION_REMINDER_D1':
        return {
          subject: `⚠️ Cobrança Vencendo Hoje - ${data.dias_para_vencimento} dias restantes`,
          html: `
            <div style="font-family: sans-serif; background-color: #0f172a; color: #f8fafc; padding: 25px; border-radius: 12px;">
              <h2 style="color: #ef4444;">Atenção: Cobrança Vencendo Hoje</h2>
              <p>Olá <strong>${data.cliente_nome}</strong>,</p>
              <p>Sua cobrança de <strong>${data.valor}</strong> vence hoje (<strong>${data.dias_para_vencimento}</strong> dias restantes).</p>
              <p>Por favor, realize o pagamento imediatamente para evitar inconvenientes.</p>
              ${data.link_pagamento ? '<p><a href="' + data.link_pagamento + '" style="background-color: #ef4444; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5;">Pagar Agora</a></p>' : ''}
              <p>Atenciosamente,<br/>Equipe SOBRE MÍDIA</p>
            </div>
          `,
        };

      case 'COLLECTION_OVERDUE':
        return {
          subject: `Cobrança em Atraso - ${data.dias_em_atraso} dias em atraso`,
          html: `
            <div style="font-family: sans-serif; background-color: #0f172a; color: #f8fafc; padding: 25px; border-radius: 12px;">
              <h2 style="color: #f87171;">Cobrança em Atraso</h2>
              <p>Olá <strong>${data.cliente_nome}</strong>,</p>
              <p>Sua cobrança de <strong>${data.valor}</strong> está em atraso há <strong>${data.dias_em_atraso}</strong> dias.</p>
              <p>Por favor, realize o pagamento o mais breve possível para evitar complicações.</p>
              ${data.link_pagamento ? '<p><a href="' + data.link_pagamento + '" style="background-color: #f87171; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5;">Pagar Agora</a></p>' : ''}
              <p>Atenciosamente,<br/>Equipe SOBRE MÍDIA</p>
            </div>
          `,
        };

      default:
        return { subject: 'Notificação SOBRE MÍDIA', html: '<p>Notificação do sistema.</p>' };
    }
  }

  private static renderAdminRequestEmail(tituloPergunta: string, data: EmailTemplateData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: sans-serif; background-color: #0f172a; color: #f8fafc; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #1e293b; padding: 30px; border-radius: 16px; border: 1px solid #334155; }
          h2 { color: #38bdf8; font-size: 20px; }
          p { font-size: 15px; color: #cbd5e1; line-height: 1.6; }
          .btn-container { margin-top: 25px; display: flex; gap: 15px; }
          .btn-sim { background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; }
          .btn-nao { background-color: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; }
          .footer { margin-top: 30px; font-size: 12px; color: #64748b; border-t: 1px solid #334155; padding-top: 15px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Solicitação de Novo Cadastro — SOBRE MÍDIA</h2>
          <p><strong>${tituloPergunta}</strong></p>
          
          <div style="background-color: #0f172a; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <p style="margin: 4px 0;"><strong>Nome:</strong> ${data.nome}</p>
            <p style="margin: 4px 0;"><strong>E-mail:</strong> ${data.email}</p>
            <p style="margin: 4px 0;"><strong>Tipo de Acesso:</strong> ${data.tipoAcesso}</p>
            <p style="margin: 4px 0;"><strong>ID do Pedido:</strong> ${data.requestId}</p>
          </div>

          <div class="btn-container">
            <a href="${data.simUrl}" class="btn-sim"> [ SIM ] APROVAR </a>
            <a href="${data.naoUrl}" class="btn-nao"> [ NÃO ] REJEITAR </a>
          </div>

          <div class="footer">
            <p>Plataforma SOBRE MÍDIA — Sistema Oficial de Aprovação de Acesso</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}
