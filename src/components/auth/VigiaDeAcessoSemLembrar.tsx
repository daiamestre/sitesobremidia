import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { deveEncerrarSessaoEsquecida, limparMarcaDeAcessoTemporario } from '@/lib/lembrarAcesso';

/** F-170 — Ao abrir o sistema, encerra a sessão que ficou de uma entrada feita SEM "Lembrar acesso". */
export function VigiaDeAcessoSemLembrar() {
  useEffect(() => {
    if (!deveEncerrarSessaoEsquecida()) return;
    limparMarcaDeAcessoTemporario();
    // escopo local: encerrar a sessão esquecida deste navegador não pode derrubar o login dos Players da mesma conta
    void supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }, []);
  return null;
}
