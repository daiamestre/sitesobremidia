import { supabase } from '@/integrations/supabase/client';
import { centralService } from '@/services/central.service';
import { EmailTemplates, TemplateType, EmailTemplateData } from '@/templates/emailTemplates';

export type NotificationChannel = 'EMAIL' | 'WHATSAPP' | 'SMS' | 'IN_APP';

export interface EmailPayload {
  to: string;
  templateType?: TemplateType;
  templateData?: EmailTemplateData;
  subject?: string;
  html?: string;
}

export interface NotificationResult {
  success: boolean;
  channel: NotificationChannel;
  messageId?: string;
  error?: string;
  providerStatus?: 'ACTIVE' | 'DISABLED';
}

/**
 * Adapter para envio de e-mail (Resend / Edge Function Backend)
 */
export class EmailProviderAdapter {
  async send(payload: EmailPayload): Promise<NotificationResult> {
    try {
      let finalSubject = payload.subject || 'Notificação SOBRE MÍDIA';
      let finalHtml = payload.html || '<p>Sem conteúdo</p>';

      if (payload.templateType && payload.templateData) {
        const rendered = EmailTemplates.getTemplate(payload.templateType, payload.templateData);
        finalSubject = rendered.subject;
        finalHtml = rendered.html;
      }

      console.log(`[EmailProviderAdapter] Disparando e-mail para ${payload.to}: ${finalSubject}`);

      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          to: payload.to,
          subject: finalSubject,
          html: finalHtml,
        },
      });

      if (error) {
        console.warn('[EmailProviderAdapter] Erro na Edge Function:', error);
        return {
          success: false,
          channel: 'EMAIL',
          providerStatus: 'ACTIVE',
          error: error.message,
        };
      }

      return {
        success: true,
        channel: 'EMAIL',
        providerStatus: 'ACTIVE',
        messageId: data?.id || `msg-${Date.now()}`,
      };
    } catch (err: any) {
      return {
        success: false,
        channel: 'EMAIL',
        providerStatus: 'ACTIVE',
        error: err?.message || 'Erro ao processar envio de e-mail',
      };
    }
  }
}

/**
 * Adapter para WhatsApp (PREPARADO, MAS DESATIVADO)
 */
export class WhatsAppProviderAdapter {
  async send(to: string, message: string): Promise<NotificationResult> {
    console.log(`[WhatsAppProviderAdapter] Provider DESATIVADO (Status: DISABLED). Para: ${to}`);
    return {
      success: false,
      channel: 'WHATSAPP',
      providerStatus: 'DISABLED',
      error: 'WHATSAPP_PROVIDER_DISABLED',
    };
  }
}

/**
 * Adapter para SMS (PREPARADO, MAS DESATIVADO)
 */
export class SMSProviderAdapter {
  async send(to: string, message: string): Promise<NotificationResult> {
    console.log(`[SMSProviderAdapter] Provider DESATIVADO (Status: DISABLED). Para: ${to}`);
    return {
      success: false,
      channel: 'SMS',
      providerStatus: 'DISABLED',
      error: 'SMS_PROVIDER_DISABLED',
    };
  }
}

/**
 * Adapter para In-App Notification (Central de Notificações)
 */
export class InAppProviderAdapter {
  async send(userId: string, title: string, message: string): Promise<NotificationResult> {
    try {
      const { data: usuario } = await supabase
        .from('usuarios')
        .select('empresa_operadora_id')
        .eq('id', userId)
        .maybeSingle();

      if (!usuario) {
        return { success: false, channel: 'IN_APP', providerStatus: 'ACTIVE', error: 'Usuário destino não encontrado' };
      }

      const ok = await centralService.criarNotificacao({
        usuarioId: userId,
        empresaId: usuario.empresa_operadora_id,
        tipoEvento: 'SYSTEM_ALERT',
        titulo: title,
        mensagem: message,
      });

      return ok
        ? { success: true, channel: 'IN_APP', providerStatus: 'ACTIVE' }
        : { success: false, channel: 'IN_APP', providerStatus: 'ACTIVE', error: 'Falha ao criar notificação in-app' };
    } catch (err: any) {
      return { success: false, channel: 'IN_APP', providerStatus: 'ACTIVE', error: err?.message };
    }
  }
}

/**
 * Servidor Unificado de Notificações (NotificationService)
 */
export class NotificationService {
  private emailProvider = new EmailProviderAdapter();
  private whatsAppProvider = new WhatsAppProviderAdapter();
  private smsProvider = new SMSProviderAdapter();
  private inAppProvider = new InAppProviderAdapter();

  async sendEmail(payload: EmailPayload): Promise<NotificationResult> {
    return this.emailProvider.send(payload);
  }

  async sendWhatsApp(to: string, message: string): Promise<NotificationResult> {
    return this.whatsAppProvider.send(to, message);
  }

  async sendSMS(to: string, message: string): Promise<NotificationResult> {
    return this.smsProvider.send(to, message);
  }

  async sendInApp(userId: string, title: string, message: string): Promise<NotificationResult> {
    return this.inAppProvider.send(userId, title, message);
  }
}

export const notificationService = new NotificationService();
