-- ======================================================================
-- SOBRE MÍDIA — MIGRAÇÃO 20261316 — F-171
-- Lentidão do sistema depois do F-166.
--
-- Achado (medido no banco como ADM): fn_biblioteca_tenant() — chamada POR LINHA nas regras de acesso (RLS) de media,
-- biblioteca_itens e biblioteca_pastas — ficou ~15 vezes mais cara quando passou a perguntar "é anunciante?" em outra
-- função (que consulta usuarios, perfis e papéis de novo a cada chamada). Resultado: a lista de mídias (407 linhas) foi de
-- 42 ms para 292 ms, e biblioteca_itens (390 linhas) de 10 ms para 133 ms — e quase toda tela lê essas tabelas.
--
-- Correção: uma única consulta (sem funções aninhadas) que devolve a empresa do usuário, ou nada se ele for anunciante
-- (perfil ANUNCIANTE/CLIENTE, exceto Owner/ADM). Mesma regra do F-166, só que barata (a lista de mídias volta a ~27 ms).
--
-- Player: nada muda.
-- ROLLBACK: recriar fn_biblioteca_tenant (20261312) / fn_usuario_eh_anunciante (20261312).
-- ======================================================================

CREATE OR REPLACE FUNCTION public.fn_biblioteca_tenant()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v uuid;
    eh_anunciante boolean;
    uid uuid := auth.uid();
BEGIN
    SELECT u.empresa_operadora_id, (upper(coalesce(p.nome, '')) IN ('ANUNCIANTE', 'CLIENTE') AND NOT coalesce(u.is_owner, false))
      INTO v, eh_anunciante
      FROM public.usuarios u LEFT JOIN public.perfis p ON p.id = u.perfil_id
     WHERE u.id = uid;
    -- anunciante (exceto Owner/ADM): a Biblioteca não existe para ele
    IF eh_anunciante AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = uid AND ur.role = 'admin'::public.app_role) THEN
        RETURN NULL;
    END IF;
    IF v IS NULL THEN
        SELECT r.empresa_operadora_id INTO v FROM public.representantes r WHERE r.usuario_id = uid LIMIT 1;
    END IF;
    RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_usuario_eh_anunciante()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.usuarios u JOIN public.perfis p ON p.id = u.perfil_id
         WHERE u.id = auth.uid() AND upper(p.nome) IN ('ANUNCIANTE', 'CLIENTE') AND NOT coalesce(u.is_owner, false)
           AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role = 'admin'::public.app_role));
$$;
