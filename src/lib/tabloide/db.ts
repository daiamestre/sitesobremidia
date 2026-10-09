import { supabase } from '@/integrations/supabase/client';

/** Tabelas do Tabloide (F-172) ainda não estão nos tipos gerados do Supabase; este acesso é só para elas. */
export const tabelaTabloide = (nome: 'tabloides' | 'tabloide_catalogo') => (supabase as unknown as { from: (t: string) => any }).from(nome);
