-- ======================================================================
-- SOBRE MÃDIA â€” MIGRATION 20261027
-- RECONCILIAÃ‡ÃƒO: handle_solicitacao_update era compartilhada por duas
-- tabelas com ROWTYPES diferentes (solicitacoes TEM responsavel_id;
-- solicitacoes_acesso NÃƒO TEM). PL/pgSQL resolve o campo na inicializaÃ§Ã£o
-- do bloco â†’ TODO INSERT/UPDATE em solicitacoes_acesso quebrava (42703).
--
-- SOLUÃ‡ÃƒO: duas funÃ§Ãµes especializadas (mesma semÃ¢ntica de auditoria):
--   handle_solicitacao_acesso_update()   â†’ trg em solicitacoes_acesso
--   handle_solicitacao_central_update()  â†’ trg em solicitacoes
-- Nenhum comportamento Ã© removido; apenas desacoplados.
-- ======================================================================

-- ---------- 1. AUTORIZAÃ‡ÃƒO DE ACESSO (solicitacoes_acesso) ----------
CREATE OR REPLACE FUNCTION public.handle_solicitacao_acesso_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := COALESCE(auth.uid(), NEW.approved_by, NEW.rejected_by);
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

DROP TRIGGER IF EXISTS trg_solicitacao_status ON public.solicitacoes_acesso;
CREATE TRIGGER trg_solicitacao_status
  BEFORE UPDATE ON public.solicitacoes_acesso
  FOR EACH ROW EXECUTE FUNCTION public.handle_solicitacao_acesso_update();

-- ---------- 2. WORKFLOW DA CENTRAL (solicitacoes) ----------
CREATE OR REPLACE FUNCTION public.handle_solicitacao_central_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Reponta APENAS o trigger da tabela solicitacoes para a funÃ§Ã£o prÃ³pria
DROP TRIGGER IF EXISTS trg_solicitacao_status ON public.solicitacoes;
CREATE TRIGGER trg_solicitacao_status
  BEFORE UPDATE ON public.solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.handle_solicitacao_central_update();

-- Remove a funÃ§Ã£o compartilhada quebrada (nenhum trigger restante a usa)
DROP FUNCTION IF EXISTS public.handle_solicitacao_update();

-- ---------- 3. COLUNAS CANÃ”NICAS DE APROVAÃ‡ÃƒO EM usuarios (029) ----------
-- a RPC de provisionamento direto da missão portal grava approved_by/approved_at; no cloud
-- essas colunas canÃ´nicas nÃ£o existiam (029_epic ausente). Aditivo.
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
