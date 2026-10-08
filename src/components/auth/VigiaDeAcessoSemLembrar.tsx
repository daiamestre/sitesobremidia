import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { deveEncerrarSessaoEsquecida, limparMarcaDeAcessoTemporario } from '@/lib/lembrarAcesso';

/** F-170 — Ao abrir o sistema, encerra a sessão que ficou de uma entrada feita SEM "Lembrar acesso". */
export function VigiaDeAcessoSemLembrar() {
  useEffect(() => {
    if (!deveEncerrarSessaoEsquecida()) return;
    limparMarcaDeAcessoTemporario();
    void supabase.auth.signOut().catch(() => undefined);
  }, []);
  return null;
}
