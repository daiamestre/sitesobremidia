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
  origem?: 'CADASTRO_PUBLICO' | 'CRIACAO_CORPORATIVA' | 'MIGRACAO_BASELINE';
  perfil_solicitado_id?: string;
  perfil_solicitado_nome?: string;
  criado_por?: string;
  notificacao_central_id?: string;
}

export const ADMIN_EMAIL_NOTIFICATION = 'sobremidiadesigner@gmail.com';

/**
 * Função utilitária para gerar hash SHA-256 no navegador/Node
 */
export async function hashToken(token: string): Promise<string> {
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
   * Registra uma nova solicitação de acesso e retorna o rawToken para notificação
   */
  async createRequest(input: SolicitacaoAcessoInput): Promise<{ success: boolean; requestId?: string; rawToken?: string; error?: string }> {
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

      // 3. Insere a solicitação de acesso com hash de token.
      //    O id é gerado no cliente porque o INSERT roda como anon (sem sessão
      //    pós signUp) e anon não possui policy SELECT para ler o RETURNING.
      const requestId = crypto.randomUUID();
      const { error: insertError } = await supabase
        .from('solicitacoes_acesso')
        .insert({
          id: requestId,
          tipo_acesso: input.tipoAcesso,
          nome_usuario: input.nomeUsuario,
          email_usuario: input.emailUsuario,
          telefone: input.telefone || '',
          dados_cadastro: input.dadosCadastro || {},
          auth_user_id: input.authUserId || null,
          status: 'PENDING',
          approval_token_hash: tokenHash,
          approval_token_expires_at: expiresAt,
        });

      if (insertError) {
        console.error('[AccessRequestService.createRequest] Erro na inserção:', insertError);
        return { success: false, error: insertError?.message || 'Falha ao registrar solicitação de acesso.' };
      }

      // Retorna rawToken para que o chamador invoque send-approval-notification
      return { success: true, requestId, rawToken };
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

    // Marcador cosmético de envio: só quando há sessão (anon não tem UPDATE RLS)
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await supabase
        .from('solicitacoes_acesso')
        .update({
          email_admin_enviado: true,
          email_admin_enviado_em: new Date().toISOString(),
        })
        .eq('id', requestId);
    }
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

      // 3. Decisão via FLUXO OFICIAL: RPC decidir_solicitacao_acesso
      //    (valida RBAC/tenant no banco, atualiza usuarios, audita via trigger,
      //     resolve a mensagem na Central e enfileira USER_APPROVED/USER_REJECTED
      //     pelo Communication Core — sem chamadas diretas ao Resend).
      const result = await this.decidirViaCentral(requestId, decision, motivoRejeicao);
      if (!result.success) {
        return { success: false, error: result.error };
      }

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

  /**
   * Lista solicitações de acesso para a CENTRAL DE COMUNICAÇÃO (aba Solicitações).
   * RLS oficial: solicitante vê a própria; OWNER/ADMIN veem as do tenant
   * (incluindo órfãs de cadastro público).
   */
  async listarParaCentral(statusFilter?: StatusSolicitacao): Promise<SolicitacaoAcessoRecord[]> {
    let query = supabase
      .from('solicitacoes_acesso')
      .select('*, perfil_solicitado:perfis(nome)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;
    if (error || !data) {
      console.warn('[AccessRequestService.listarParaCentral] Erro:', error);
      return [];
    }
    return (data as any[]).map((r) => ({
      ...r,
      perfil_solicitado_nome: r.perfil_solicitado?.nome ?? undefined,
      perfil_solicitado: undefined,
    })) as SolicitacaoAcessoRecord[];
  }

  /**
   * FLUXO OFICIAL DE DECISÃO pela Central de Comunicação.
   * Executa a RPC decidir_solicitacao_acesso (SECURITY DEFINER no banco) que:
   *   - valida OWNER/ADMIN + tenant via RBAC/RLS vigentes;
   *   - aceita decisão somente se status = PENDING (idempotente);
   *   - atualiza usuarios (APPROVED→ACTIVE / REJECTED→bloqueado);
   *   - registra auditoria (trigger trg_solicitacao_status com auth.uid());
   *   - resolve a mensagem USER_ACCESS_REQUESTED na Central;
   *   - enfileira USER_APPROVED/USER_REJECTED via Communication Core.
   */
  async decidirViaCentral(
    requestId: string,
    decisao: 'APPROVED' | 'REJECTED',
    motivo?: string
  ): Promise<{ success: boolean; error?: string; data?: Record<string, unknown> }> {
    const { data, error } = await supabase.rpc('decidir_solicitacao_acesso', {
      p_solicitacao_id: requestId,
      p_decisao: decisao,
      p_motivo: motivo ?? null,
    });
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, data: (data as Record<string, unknown>) ?? undefined };
  }
}

export const accessRequestService = new AccessRequestService();
