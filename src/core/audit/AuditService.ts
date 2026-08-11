import { supabase } from '@/lib/supabase';
import { identityService } from '../identity/IdentityService';

export interface AuditEventParams {
  action: string;
  module: string;
  targetId?: string;
  metadata?: Record<string, any>;
}

export class AuditService {
  private static instance: AuditService;

  private constructor() {}

  public static getInstance(): AuditService {
    if (!AuditService.instance) {
      AuditService.instance = new AuditService();
    }
    return AuditService.instance;
  }

  public async logEvent(params: AuditEventParams): Promise<void> {
    const identity = identityService.getIdentity();
    
    if (!identity) {
      console.warn('Attempted to log audit event without active identity', params);
      return;
    }

    try {
      // In a real production app we'd also get the IP via an edge function, 
      // but for client side we just log the actor.
      await supabase.from('audit_events').insert({
        organization_id: identity.organization?.id,
        actor_email: identity.email,
        actor_user_id: identity.id,
        action: params.action,
        module: params.module,
        target_id: params.targetId,
        metadata: params.metadata || {}
      });
    } catch (error) {
      // We don't throw here to avoid breaking the main application flow
      console.error('Failed to log audit event', error);
    }
  }
}

export const auditService = AuditService.getInstance();
