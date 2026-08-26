-- ======================================================================
-- SOBRE MIDIA - MIGRATION 20260814: RPC DE CADASTRO RESTRITA A AUTENTICADOS
-- ======================================================================
-- Objetivo: fn_cadastrar_cliente_atomo e SECURITY DEFINER e esta publicada
-- para PUBLIC (incluindo anon), permitindo que qualquer usuario com a
-- chave anon invoque a criacao de clientes com tenant arbitrario.
-- Esta migration restringe a execucao ao role authenticated.
-- Tambem alinha public.get_user_role() com a regra de OWNER do AuthContext:
-- usuarios com is_owner = true devem retornar 'OWNER' independente do nome
-- do perfil, garantindo que as policies de empresas/contatos/contratos
-- (baseadas em get_user_role) funcionem para OWNER na edicao via REST.
-- Idempotente: REVOKE/GRANT podem ser executados multiplas vezes.

-- 0. get_user_role: OWNER soberano (is_owner) tem precedencia sobre o perfil
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    CASE
      WHEN u.is_owner = true THEN 'OWNER'
      ELSE UPPER(COALESCE(p.nome, 'REPRESENTANTE'))
    END
  FROM public.usuarios u
  LEFT JOIN public.perfis p ON u.perfil_id = p.id
  WHERE u.id = auth.uid()
  LIMIT 1;
$$;

-- Assinatura real (24 argumentos) da funcao publicada em producao.

REVOKE EXECUTE ON FUNCTION public.fn_cadastrar_cliente_atomo(
  uuid, uuid, character varying, character varying, character varying,
  character varying, character varying, character varying, character varying,
  character varying, character varying, character varying, character varying,
  character varying, character varying, character varying, character varying,
  character varying, character varying, text, character varying,
  character varying, character varying, character varying
) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.fn_cadastrar_cliente_atomo(
  uuid, uuid, character varying, character varying, character varying,
  character varying, character varying, character varying, character varying,
  character varying, character varying, character varying, character varying,
  character varying, character varying, character varying, character varying,
  character varying, character varying, text, character varying,
  character varying, character varying, character varying
) FROM anon;

GRANT EXECUTE ON FUNCTION public.fn_cadastrar_cliente_atomo(
  uuid, uuid, character varying, character varying, character varying,
  character varying, character varying, character varying, character varying,
  character varying, character varying, character varying, character varying,
  character varying, character varying, character varying, character varying,
  character varying, character varying, text, character varying,
  character varying, character varying, character varying
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.fn_cadastrar_cliente_atomo(
  uuid, uuid, character varying, character varying, character varying,
  character varying, character varying, character varying, character varying,
  character varying, character varying, character varying, character varying,
  character varying, character varying, character varying, character varying,
  character varying, character varying, text, character varying,
  character varying, character varying, character varying
) TO service_role;