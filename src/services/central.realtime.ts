import { supabase } from '@/integrations/supabase/client';

// ============================================================
// Realtime unificado da Central de Comunicação & Inteligência
// Um único canal por janela; evita duplicação de subscriptions
// entre sino global, menu lateral e página Central.
// ============================================================

type CentralListener = () => void;

const listeners = new Set<CentralListener>();
let channel: ReturnType<typeof supabase.channel> | null = null;

const TABLES = [
  'notificacoes_central',
  'solicitacoes',
  'conversas',
  'conversa_participantes',
  'conversa_mensagens',
] as const;

function emit(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (err) {
      console.error('[CentralRealtime] listener error', err);
    }
  });
}

function ensureChannel(): void {
  if (channel) return;

  const ch = supabase.channel('central-comunicacao-realtime');
  for (const table of TABLES) {
    ch.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table },
      emit
    );
    ch.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table },
      emit
    );
  }
  ch.subscribe((status) => {
    if (status !== 'SUBSCRIBED' && status !== 'CHANNEL_ERROR') {
      console.warn('[CentralRealtime] status:', status);
    }
  });

  channel = ch;
}

/**
 * Registra um listener para eventos realtime da Central.
 * Retorna função para cancelar a inscrição (e derrubar o canal
 * quando não restarem ouvintes).
 */
export function subscribeCentralRealtime(listener: CentralListener): () => void {
  listeners.add(listener);
  ensureChannel();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
  };
}
