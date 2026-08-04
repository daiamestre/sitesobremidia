import { supabase } from '@/integrations/supabase/client';
import { notificationService } from './notification.service';

export type TipoAcesso = 'REPRESENTANTE' | 'GESTOR_TELAS' | 'FUNCIONARIO' | 'ANUNCIANTE' | 'PARCEIRO';
export type StatusSolicitacao = 'PENDING' | 'APPROVED' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED' | 'INACTIVE' | 'DELETED';


export interface SolicitacaoAcessoInput {
  tipoAcesso: TipoAcesso;
  nomeUsuario: string;
  emailUsuario: string;
  telefone?: string;
  dadosCadastro?: Record<string, any>;
  authUserId?: string;
}

export interface SolicitacaoAcessoRecord {
  id: string;
  empresa_operadora_id?: string;
  auth_user_id?: string;
  usuario_id?: string;
  tipo_acesso: TipoAcesso;
  nome_usuario: string;
  email_usuario: string;
  telefone?: string;
  dados_cadastro?: Record<string, any>;
  status: StatusSolicitacao;
  approval_token_hash?: string;
  approval_token_expires_at?: string;
  approval_used_at?: string;
  created_at: string;
  approved_at?: string;
  approved_by?: string;
  rejected_at?: string;
  rejected_by?: string;
  motivo_rejeicao?: string;
}

export const ADMIN_EMAIL_NOTIFICATION = 'sobremidiadesigner@gmail.com';

/**
 * Função utilitária para gerar hash SHA-256 no navegador/Node
 */
async function hashToken(token: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Gera token randômico único (64 caracteres hexadecimais)
 */
function generateRandomHexToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

export class AccessRequestService {
  /**
   * Registra uma nova solicitação de acesso e dispara notificação por e-mail para a Administração
   */
  async createRequest(input: SolicitacaoAcessoInput): Promise<{ success: boolean; requestId?: string; error?: string }> {
    try {
      // 1. Previne solicitações duplicadas PENDING/APPROVED para o mesmo e-mail
      const { data: existing } = await supabase
        .from('solicitacoes_acesso')
        .select('id, status')
        .eq('email_usuario', input.emailUsuario)
        .in('status', ['PENDING', 'APPROVED'])
        .maybeSingle();

      if (existing) {
        if (existing.status === 'APPROVED') {
          return { success: false, error: 'Este e-mail já possui um cadastro aprovado no sistema.' };
        }
        return { success: false, error: 'Já existe uma solicitação de cadastro pendente de aprovação para este e-mail.' };
      }

      // 2. Gera token randômico, calcula HASH SHA-256 e define expiração de 48 horas
      const rawToken = generateRandomHexToken();
      const tokenHash = await hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

      // 3. Insere a solicitação de acesso com hash de token
      const { data: inserted, error: insertError } = await supabase
        .from('solicitacoes_acesso')
        .insert({
          tipo_acesso: input.tipoAcesso,
          nome_usuario: input.nomeUsuario,
          email_usuario: input.emailUsuario,
          telefone: input.telefone || '',
          dados_cadastro: input.dadosCadastro || {},
          auth_user_id: input.authUserId || null,
          status: 'PENDING',
          approval_token_hash: tokenHash,
          approval_token_expires_at: expiresAt,
        })
        .select('id')
        .single();

      if (insertError || !inserted) {
        console.error('[AccessRequestService.createRequest] Erro na inserção:', insertError);
        return { success: false, error: insertError?.message || 'Falha ao registrar solicitação de acesso.' };
      }

      const requestId = inserted.id;

      // 4. Dispara e-mail formatado com link contendo token único seguro para sobremidiadesigner@gmail.com
      await this.notifyAdmin(requestId, input.nomeUsuario, input.emailUsuario, input.tipoAcesso, rawToken);

      return { success: true, requestId };
    } catch (err: any) {
      console.error('[AccessRequestService.createRequest] Exceção:', err);
      return { success: false, error: err?.message || 'Erro interno ao processar cadastro.' };
    }
  }

  /**
   * Envia e-mail administrativo com links seguros contendo TOKEN DE USO ÚNICO
   */
  private async notifyAdmin(requestId: string, nome: string, email: string, tipo: TipoAcesso, rawToken: string): Promise<void> {
    const origin = window.location.origin;
    const simUrl = `${origin}/admin/solicitacoes/${requestId}?token=${rawToken}&action=approve`;
    const naoUrl = `${origin}/admin/solicitacoes/${requestId}?token=${rawToken}&action=reject`;

    const tipoTexto = tipo === 'REPRESENTANTE' ? 'representante' : 'gestor de telas';
    const tituloPergunta = `Olá, ${nome} se cadastrou como ${tipoTexto}. Você aprova esse cadastro?`;

    const htmlContent = `
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
            <p style="margin: 4px 0;"><strong>Nome:</strong> ${nome}</p>
            <p style="margin: 4px 0;"><strong>E-mail:</strong> ${email}</p>
            <p style="margin: 4px 0;"><strong>Tipo de Acesso:</strong> ${tipo}</p>
            <p style="margin: 4px 0;"><strong>ID do Pedido:</strong> ${requestId}</p>
          </div>

          <div class="btn-container">
            <a href="${simUrl}" class="btn-sim"> [ SIM ] APROVAR </a>
            <a href="${naoUrl}" class="btn-nao"> [ NÃO ] REJEITAR </a>
          </div>

          <div class="footer">
            <p>Plataforma SOBRE MÍDIA — Links com Token de Uso Único e Expiração em 48h</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await notificationService.sendEmail({
      to: ADMIN_EMAIL_NOTIFICATION,
      subject: `[APROVAÇÃO NECESSÁRIA] Novo ${tipoTexto}: ${nome}`,
      html: htmlContent,
    });

    await supabase
      .from('solicitacoes_acesso')
      .update({
        email_admin_enviado: true,
        email_admin_enviado_em: new Date().toISOString(),
      })
      .eq('id', requestId);
  }

  /**
   * Valida HASH DO TOKEN, EXPIRAÇÃO E REUTILIZAÇÃO, e processa decisão do Administrador
   */
  async processDecision(
    requestId: string, 
    decision: 'APPROVED' | 'REJECTED', 
    motivoRejeicao?: string, 
    adminUserId?: string,
    rawToken?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const now = new Date();
      const nowIso = now.toISOString();

      // 1. Busca solicitação existente
      const { data: request, error: fetchError } = await supabase
        .from('solicitacoes_acesso')
        .select('*')
        .eq('id', requestId)
        .single();

      if (fetchError || !request) {
        return { success: false, error: 'Solicitação de acesso não encontrada.' };
      }

      // 2. Se a chamada for via link de e-mail com token, realiza as 3 validações de token:
      if (rawToken) {
        // Validação 2.1: Reutilização (token já consumido)
        if (request.approval_used_at) {
          return { success: false, error: 'Este link de aprovação já foi utilizado anteriormente (Token Consumido).' };
        }

        // Validação 2.2: Expiração do token
        if (request.approval_token_expires_at && new Date(request.approval_token_expires_at) < now) {
          return { success: false, error: 'Este link de aprovação expirou (Token Expirado).' };
        }

        // Validação 2.3: Integridade do hash do token
        const incomingHash = await hashToken(rawToken);
        if (request.approval_token_hash && request.approval_token_hash !== incomingHash) {
          return { success: false, error: 'Token de aprovação inválido ou adulterado.' };
        }
      }

      // 3. Atualiza estado e marca approval_used_at = NOW() com Trava de Concorrência (Sprint 1.5)
      const updatePayload: Record<string, any> = {
        status: decision,
        approval_used_at: nowIso,
        updated_at: nowIso,
      };

      if (decision === 'APPROVED') {
        updatePayload.approved_at = nowIso;
        updatePayload.approved_by = adminUserId || null;
      } else {
        updatePayload.rejected_at = nowIso;
        updatePayload.rejected_by = adminUserId || null;
        updatePayload.motivo_rejeicao = motivoRejeicao || 'Rejeitado pelo administrador.';
      }

      // Bloqueio Otimista anti-race condition: ao aprovar, exige que approved_by esteja NULO e status PENDING
      let query = supabase
        .from('solicitacoes_acesso')
        .update(updatePayload)
        .eq('id', requestId);

      if (decision === 'APPROVED') {
        query = query.is('approved_by', null).eq('status', 'PENDING');
      }

      const { data: updateResult, error: updateError } = await query.select('id');

      if (updateError) {
        return { success: false, error: updateError.message };
      }

      if (decision === 'APPROVED' && (!updateResult || updateResult.length === 0)) {
        return { success: false, error: '[RACE CONDITION SHIELD] Esta solicitação já foi aprovada ou processada anteriormente por outro administrador.' };
      }

      // 4. Notifica o usuário por e-mail
      const userSubject = decision === 'APPROVED' 
        ? 'Seu cadastro na plataforma SOBRE MÍDIA foi APROVADO!' 
        : 'Informação sobre seu cadastro na plataforma SOBRE MÍDIA';

      const userMessage = decision === 'APPROVED'
        ? `<p>Olá <strong>${request.nome_usuario}</strong>,</p><p>Seu cadastro como <strong>${request.tipo_acesso}</strong> foi <strong>APROVADO</strong> pela administração!</p><p>Você já pode acessar a plataforma utilizando suas credenciais.</p>`
        : `<p>Olá <strong>${request.nome_usuario}</strong>,</p><p>Seu cadastro como <strong>${request.tipo_acesso}</strong> não foi aprovado pela administração neste momento.</p>`;

      await notificationService.sendEmail({
        to: request.email_usuario,
        subject: userSubject,
        html: userMessage,
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao processar aprovação.' };
    }
  }

  /**
   * Busca todas as solicitações para exibições no Painel Administrativo
   */
  async listRequests(statusFilter?: StatusSolicitacao): Promise<SolicitacaoAcessoRecord[]> {
    let query = supabase.from('solicitacoes_acesso').select('*').order('created_at', { ascending: false });

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;

    if (error || !data) {
      console.warn('[AccessRequestService.listRequests] Erro:', error);
      return [];
    }

    return data as SolicitacaoAcessoRecord[];
  }
}

export const accessRequestService = new AccessRequestService();
