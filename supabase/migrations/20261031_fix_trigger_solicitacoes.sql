-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261031
-- Correção de BUG pré-existente: handle_solicitacao_update() referenciava
-- NEW.approved_by / NEW.rejected_by — colunas inexistentes na tabela
-- `solicitacoes` (pertencem a solicitacoes_acesso). Qualquer UPDATE sem
-- sessão (jobs/SQL/admin) explodia. Agora usa responsavel_id com fallback.
-- ======================================================================

CREATE OR REPLACE FUNCTION public.handle_solicitacao_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := COALESCE(auth.uid(), NEW.responsavel_id);
  v_email text;
  v_role text;
BEGIN
  IF v_user_id IS NOT NULL THEN
    SELECT u.email, COALESCE(UPPER(p.nome), 'SISTEMA')
      INTO v_email, v_role
    FROM public.usuarios u
    LEFT JOIN public.perfis p ON u.perfil_id = p.id
    WHERE u.id = v_user_id;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.auditoria_logs (
      empresa_operadora_id, usuario_id, usuario_email, usuario_role,
      entidade_tipo, entidade_id, acao,
      status_anterior, status_novo, observacoes
    ) VALUES (
      NEW.empresa_operadora_id, v_user_id, v_email, COALESCE(v_role, 'SISTEMA'),
      'SOLICITACAO', NEW.id, 'STATUS_CHANGE',
      OLD.status, NEW.status,
      'Decisao registrada via Central de Comunicacao'
    );
  END IF;

  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- GATE: disparo de teste em transação isolada não deve mais falhar por campo inexistente
DO $$
DECLARE def TEXT;
BEGIN
  SELECT prosrc INTO def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='handle_solicitacao_update';
  IF def LIKE '%NEW.approved_by%' OR def LIKE '%NEW.rejected_by%' THEN
    RAISE EXCEPTION 'GATE: trigger ainda referencia campos inexistentes.';
  END IF;
END $$;
