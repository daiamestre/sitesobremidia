-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261040
-- Trigger anti-forgery: sanciona o caminho REPRESENTANTE (fechamento
-- comercial) introduzido em 20261039, com validações equivalentes.
-- ======================================================================

CREATE OR REPLACE FUNCTION public.prevent_usuario_insert_forgery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_tenant uuid;
  v_caller_owner boolean;
  v_caller_admin boolean;
  v_caller_perfil text;
  v_caller_cliente uuid;
  v_perfil_nome text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_caller_tenant := public.get_user_tenant_id();

  IF v_caller_tenant IS NULL THEN
    RAISE EXCEPTION 'Acesso Negado: criação direta de usuário não autorizada.' USING ERRCODE = '42501';
  END IF;

  IF NEW.empresa_operadora_id IS DISTINCT FROM v_caller_tenant THEN
    RAISE EXCEPTION 'Acesso Negado: tenant não corresponde ao do chamador.' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(NEW.is_owner, false) THEN
    RAISE EXCEPTION 'Acesso Negado: criação direta de conta OWNER não autorizada.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(u.is_owner, false),
         (UPPER(COALESCE(p.nome, '')) = 'ADMIN'),
         UPPER(COALESCE(p.nome, '')),
         u.cliente_id
    INTO v_caller_owner, v_caller_admin, v_caller_perfil, v_caller_cliente
    FROM public.usuarios u
    LEFT JOIN public.perfis p ON p.id = u.perfil_id
   WHERE u.id = auth.uid();

  IF NEW.perfil_id IS NOT NULL THEN
    SELECT nome INTO v_perfil_nome FROM public.perfis WHERE id = NEW.perfil_id;
    IF v_perfil_nome = 'OWNER' THEN
      RAISE EXCEPTION 'Acesso Negado: perfil OWNER não pode ser atribuído em criação.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Caminho SANCIONADO: provisionamento oficial via RPC (GUC transacional)
  IF COALESCE(current_setting('app.sobremidia.provisioning', true), '') = 'on' THEN
    IF NOT v_caller_owner AND NOT v_caller_admin THEN
      IF v_caller_perfil = 'ANUNCIANTE' THEN
        IF v_perfil_nome IS NULL OR v_perfil_nome NOT IN ('CLIENTE','ANUNCIANTE')
           OR NEW.cliente_id IS NULL OR NEW.cliente_id IS DISTINCT FROM v_caller_cliente THEN
          RAISE EXCEPTION 'Acesso Negado: equipe do anunciante aceita apenas perfis CLIENTE/ANUNCIANTE do próprio cliente.' USING ERRCODE = '42501';
        END IF;
      ELSIF v_caller_perfil = 'REPRESENTANTE' THEN
        IF v_perfil_nome IS NULL OR v_perfil_nome NOT IN ('CLIENTE','ANUNCIANTE')
           OR NEW.cliente_id IS NULL THEN
          RAISE EXCEPTION 'Acesso Negado: representante provisiona apenas perfis CLIENTE/ANUNCIANTE.' USING ERRCODE = '42501';
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM public.clientes c
          JOIN public.representantes r ON r.id = c.representante_id
          WHERE c.id = NEW.cliente_id
            AND c.empresa_operadora_id = v_caller_tenant
            AND r.usuario_id = auth.uid()
            AND r.ativo
        ) THEN
          RAISE EXCEPTION 'Acesso Negado: cliente fora da carteira do representante.' USING ERRCODE = '42501';
        END IF;
      ELSE
        RAISE EXCEPTION 'Acesso Negado: criação de usuário não sancionada para este perfil.' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF v_perfil_nome = 'ADMIN' AND NOT v_caller_owner THEN
      IF NOT public.has_admin_permission('users.create_admin') THEN
        RAISE EXCEPTION 'Acesso Negado: criar ADMIN requer users.create_admin.' USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Caminho DIRETO (sem sanção): apenas OWNER/ADMIN
  IF NOT v_caller_owner AND NOT v_caller_admin THEN
    RAISE EXCEPTION 'Acesso Negado: apenas OWNER ou ADMIN criam usuários.' USING ERRCODE = '42501';
  END IF;

  IF v_perfil_nome = 'ADMIN' AND NOT v_caller_owner THEN
    IF NOT public.has_admin_permission('users.create_admin') THEN
      RAISE EXCEPTION 'Acesso Negado: criar ADMIN requer users.create_admin.' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
