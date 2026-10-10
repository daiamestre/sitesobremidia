import { supabase } from '@/integrations/supabase/client';

/** Tabelas do Tabloide (F-172) ainda não estão nos tipos gerados do Supabase; este acesso é só para elas. */
export const tabelaTabloide = (nome: 'tabloides' | 'tabloide_catalogo' | 'tabloide_selos') => (supabase as unknown as { from: (t: string) => any }).from(nome);

/** Funções do banco do Tabloide (também fora dos tipos gerados). */
export const rpcTabloide = (nome: 'tabloide_catalogo_salvar' | 'tabloide_ia_registrar', args?: Record<string, unknown>) =>
  (supabase as unknown as { rpc: (n: string, a?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }).rpc(nome, args);
