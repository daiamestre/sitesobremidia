-- ======================================================================
-- MIGRATION: 20260911 — CLOSE TENANT EXPOSURE (P0 CROSS-TENANT)
-- SOBRE MÍDIA PLATFORM | FASE DE FUNDAÇÃO — ANDROID / MEDIA NETWORK
-- ======================================================================
-- Fecha a exposição cross-tenant identificada na auditoria:
--   * As migrations 20260807001188/89/90 criaram políticas permissivas
--     `..._all ... FOR ALL USING (true)` SEM `TO` de role (valem para
--     anon!) combinadas com policies RESTRICTIVE tautológicas
--     (`empresa_operadora_id IN (SELECT o.id FROM organizations o
--     WHERE o.id = empresa_operadora_id)` — sempre TRUE), anulando o
--     isolamento de producoes/agendamentos/portal/mobile/DW.
--   * Políticas antigas `p_read_* USING (TRUE)` (015/017/025) e
--     `p_players_read_campanhas` (anon) expunham dados de TODOS os
--     tenants a qualquer usuário autenticado (e anônimo).
--   * Tabelas da rede de telas SEM RLS habilitado (artes, locais,
--     telas, equipamentos, telemetria, etc.) ficavam totalmente abertas
--     à API pública.
--
-- Padrão canônico aplicado (idêntico ao usado em 021..031 e nas
-- migrations de hardening):
--   empresa_operadora_id = get_user_empresa_operadora_id(auth.uid())
--   OR has_role(auth.uid(), 'admin')
-- SEM o cláusula `... IS NULL` (que permitia bypass para usuário sem
-- tenant). Idempotente: todas as quedas são IF EXISTS.
-- ======================================================================

-- ======================================================================
-- 1. PRODUCOES / AGENDAMENTOS / PRODUCAO / AGENDAMENTO_HISTORICO
-- ======================================================================
ALTER TABLE public.producoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producao_midia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producao_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamento_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS producoes_tenant_isolation ON public.producoes;
DROP POLICY IF EXISTS producoes_select ON public.producoes;
DROP POLICY IF EXISTS producoes_insert ON public.producoes;
DROP POLICY IF EXISTS producoes_update ON public.producoes;
DROP POLICY IF EXISTS producoes_delete ON public.producoes;
DROP POLICY IF EXISTS p_read_producoes ON public.producoes;
DROP POLICY IF EXISTS p_insert_producoes ON public.producoes;
DROP POLICY IF EXISTS p_update_producoes ON public.producoes;

DROP POLICY IF EXISTS agendamentos_tenant_isolation ON public.agendamentos;
DROP POLICY IF EXISTS agendamentos_select ON public.agendamentos;
DROP POLICY IF EXISTS agendamentos_insert ON public.agendamentos;
DROP POLICY IF EXISTS agendamentos_update ON public.agendamentos;
DROP POLICY IF EXISTS agendamentos_delete ON public.agendamentos;
DROP POLICY IF EXISTS p_read_agendamentos ON public.agendamentos;
DROP POLICY IF EXISTS p_insert_agendamentos ON public.agendamentos;
DROP POLICY IF EXISTS p_update_agendamentos ON public.agendamentos;

DROP POLICY IF EXISTS pmidia_select ON public.producao_midia;
DROP POLICY IF EXISTS pmidia_insert ON public.producao_midia;
DROP POLICY IF EXISTS pmidia_update ON public.producao_midia;
DROP POLICY IF EXISTS pmidia_delete ON public.producao_midia;
DROP POLICY IF EXISTS pm_tenant_isolation ON public.producao_midia;

DROP POLICY IF EXISTS paud_select ON public.producao_auditoria;
DROP POLICY IF EXISTS paud_insert ON public.producao_auditoria;
DROP POLICY IF EXISTS p_read_producao_auditoria ON public.producao_auditoria;
DROP POLICY IF EXISTS p_insert_producao_auditoria ON public.producao_auditoria;

DROP POLICY IF EXISTS ahist_select ON public.agendamento_historico;
DROP POLICY IF EXISTS ahist_insert ON public.agendamento_historico;
DROP POLICY IF EXISTS ahist_update ON public.agendamento_historico;
DROP POLICY IF EXISTS ahist_delete ON public.agendamento_historico;
DROP POLICY IF EXISTS p_read_agendamento_historico ON public.agendamento_historico;
DROP POLICY IF EXISTS p_insert_agendamento_historico ON public.agendamento_historico;

CREATE POLICY prod_tenant_select ON public.producoes
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY prod_tenant_insert ON public.producoes
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY prod_tenant_update ON public.producoes
  FOR UPDATE TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY prod_tenant_delete ON public.producoes
  FOR DELETE TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY agend_tenant_select ON public.agendamentos
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY agend_tenant_insert ON public.agendamentos
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY agend_tenant_update ON public.agendamentos
  FOR UPDATE TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY agend_tenant_delete ON public.agendamentos
  FOR DELETE TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- producao_midia: escopo via producao_id -> producoes (tenant)
CREATE POLICY pm_tenant_select ON public.producao_midia
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.producoes p
      WHERE p.id = producao_midia.producao_id
        AND p.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY pm_tenant_insert ON public.producao_midia
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.producoes p
      WHERE p.id = producao_midia.producao_id
        AND p.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY pm_tenant_update ON public.producao_midia
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.producoes p
      WHERE p.id = producao_midia.producao_id
        AND p.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.producoes p
      WHERE p.id = producao_midia.producao_id
        AND p.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY pm_tenant_delete ON public.producao_midia
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.producoes p
      WHERE p.id = producao_midia.producao_id
        AND p.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY paud_tenant_select ON public.producao_auditoria
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY paud_tenant_insert ON public.producao_auditoria
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY ahist_tenant_select ON public.agendamento_historico
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR (screen_id IS NOT NULL AND public.fn_player_can_access_screen(screen_id))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY ahist_tenant_insert ON public.agendamento_historico
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR (screen_id IS NOT NULL AND public.fn_player_can_access_screen(screen_id))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY ahist_tenant_update ON public.agendamento_historico
  FOR UPDATE TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR (screen_id IS NOT NULL AND public.fn_player_can_access_screen(screen_id))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR (screen_id IS NOT NULL AND public.fn_player_can_access_screen(screen_id))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY ahist_tenant_delete ON public.agendamento_historico
  FOR DELETE TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR (screen_id IS NOT NULL AND public.fn_player_can_access_screen(screen_id))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

REVOKE ALL ON public.producoes FROM anon;
REVOKE ALL ON public.agendamentos FROM anon;
REVOKE ALL ON public.producao_midia FROM anon;
REVOKE ALL ON public.producao_auditoria FROM anon;
REVOKE ALL ON public.agendamento_historico FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.producoes, public.agendamentos, public.producao_midia, public.producao_auditoria, public.agendamento_historico TO authenticated;

-- ======================================================================
-- 2. CUSTOMER PORTAL + MOBILE (EQUIPE TÉCNICA)
-- ======================================================================
ALTER TABLE public.portal_chamados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_aprovacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mobile_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mobile_fotos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mobile_visitas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pchamados_tenant_isolation ON public.portal_chamados;
DROP POLICY IF EXISTS pchamados_all ON public.portal_chamados;
DROP POLICY IF EXISTS p_read_portal_chamados ON public.portal_chamados;
DROP POLICY IF EXISTS paprov_tenant_isolation ON public.portal_aprovacoes;
DROP POLICY IF EXISTS paprov_all ON public.portal_aprovacoes;
DROP POLICY IF EXISTS p_read_portal_aprovacoes ON public.portal_aprovacoes;
DROP POLICY IF EXISTS mcheckins_tenant_isolation ON public.mobile_checkins;
DROP POLICY IF EXISTS mcheckins_all ON public.mobile_checkins;
DROP POLICY IF EXISTS p_read_mobile_checkins ON public.mobile_checkins;
DROP POLICY IF EXISTS mfotos_all ON public.mobile_fotos;
DROP POLICY IF EXISTS p_read_mobile_fotos ON public.mobile_fotos;
DROP POLICY IF EXISTS mvisitas_tenant_isolation ON public.mobile_visitas;
DROP POLICY IF EXISTS mvisitas_all ON public.mobile_visitas;
DROP POLICY IF EXISTS p_read_mobile_visitas ON public.mobile_visitas;

CREATE POLICY pch_tenant_select ON public.portal_chamados
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY pch_tenant_insert ON public.portal_chamados
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY pch_tenant_update ON public.portal_chamados
  FOR UPDATE TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY pap_tenant_select ON public.portal_aprovacoes
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY pap_tenant_insert ON public.portal_aprovacoes
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY pap_tenant_update ON public.portal_aprovacoes
  FOR UPDATE TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY mchk_tenant_select ON public.mobile_checkins
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY mchk_tenant_insert ON public.mobile_checkins
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY mchk_tenant_update ON public.mobile_checkins
  FOR UPDATE TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY mfot_tenant_select ON public.mobile_fotos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.mobile_checkins mc
      WHERE mc.id = mobile_fotos.checkin_id
        AND mc.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY mfot_tenant_insert ON public.mobile_fotos
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.mobile_checkins mc
      WHERE mc.id = mobile_fotos.checkin_id
        AND mc.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY mvis_tenant_select ON public.mobile_visitas
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR tecnico_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY mvis_tenant_insert ON public.mobile_visitas
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY mvis_tenant_update ON public.mobile_visitas
  FOR UPDATE TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR tecnico_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

REVOKE ALL ON public.portal_chamados, public.portal_aprovacoes, public.mobile_checkins, public.mobile_fotos, public.mobile_visitas FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.portal_chamados, public.portal_aprovacoes, public.mobile_checkins, public.mobile_fotos, public.mobile_visitas TO authenticated;

-- ======================================================================
-- 3. DATAWAREHOUSE / BI
-- ======================================================================
ALTER TABLE public.dw_operacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dw_receita ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bi_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dw_op_tenant_isolation ON public.dw_operacao;
DROP POLICY IF EXISTS dw_op_all ON public.dw_operacao;
DROP POLICY IF EXISTS p_read_dw_operacao ON public.dw_operacao;
DROP POLICY IF EXISTS dw_rec_tenant_isolation ON public.dw_receita;
DROP POLICY IF EXISTS dw_rec_all ON public.dw_receita;
DROP POLICY IF EXISTS p_read_dw_receita ON public.dw_receita;
DROP POLICY IF EXISTS bi_snap_tenant_isolation ON public.bi_snapshots;
DROP POLICY IF EXISTS bi_snap_all ON public.bi_snapshots;
DROP POLICY IF EXISTS p_read_bi_snapshots ON public.bi_snapshots;

-- Leitura tenant-scoped; escrita somente admin (DW alimentado por backend/scripts)
CREATE POLICY dw_op_tenant_read ON public.dw_operacao
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY dw_op_admin_write ON public.dw_operacao
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY dw_rec_tenant_read ON public.dw_receita
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY dw_rec_admin_write ON public.dw_receita
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY bi_snap_tenant_read ON public.bi_snapshots
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY bi_snap_admin_write ON public.bi_snapshots
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

REVOKE ALL ON public.dw_operacao, public.dw_receita, public.bi_snapshots FROM anon;
GRANT SELECT ON public.dw_operacao, public.dw_receita, public.bi_snapshots TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.dw_operacao, public.dw_receita, public.bi_snapshots TO authenticated;

-- dw_dim_tempo: dimensão compartilhada (datas) — leitura para autenticados, sem anon
ALTER TABLE public.dw_dim_tempo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dw_tempo_read" ON public.dw_dim_tempo;
CREATE POLICY "dw_tempo_read_authenticated" ON public.dw_dim_tempo
  FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.dw_dim_tempo FROM anon;
GRANT SELECT ON public.dw_dim_tempo TO authenticated;

-- ======================================================================
-- 4. CAMPANHAS (a policy anon vazava campanhas ACTIVE de todos os tenants)
-- ======================================================================
DROP POLICY IF EXISTS p_players_read_campanhas ON public.campanhas;

CREATE POLICY camp_tenant_select ON public.campanhas
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY camp_tenant_insert ON public.campanhas
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY camp_tenant_update ON public.campanhas
  FOR UPDATE TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY camp_tenant_delete ON public.campanhas
  FOR DELETE TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

REVOKE ALL ON public.campanhas FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campanhas TO authenticated;

-- ======================================================================
-- 5. CAMPANHAS — TABELAS FILHAS (artes, versões, aprovações, revisões)
-- ======================================================================
ALTER TABLE public.artes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campanha_arte_versoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aprovacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revisoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY arte_tenant_select ON public.artes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campanhas c
      WHERE c.id = artes.campanha_id
        AND c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY arte_tenant_insert ON public.artes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campanhas c
      WHERE c.id = artes.campanha_id
        AND c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY arte_tenant_update ON public.artes
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campanhas c
      WHERE c.id = artes.campanha_id
        AND c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campanhas c
      WHERE c.id = artes.campanha_id
        AND c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY arte_tenant_delete ON public.artes
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campanhas c
      WHERE c.id = artes.campanha_id
        AND c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY cav_tenant_select ON public.campanha_arte_versoes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.artes a
      JOIN public.campanhas c ON c.id = a.campanha_id
      WHERE a.id = campanha_arte_versoes.arte_id
        AND c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY cav_tenant_insert ON public.campanha_arte_versoes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.artes a
      JOIN public.campanhas c ON c.id = a.campanha_id
      WHERE a.id = campanha_arte_versoes.arte_id
        AND c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY cav_tenant_update ON public.campanha_arte_versoes
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.artes a
      JOIN public.campanhas c ON c.id = a.campanha_id
      WHERE a.id = campanha_arte_versoes.arte_id
        AND c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.artes a
      JOIN public.campanhas c ON c.id = a.campanha_id
      WHERE a.id = campanha_arte_versoes.arte_id
        AND c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY apr_tenant_select ON public.aprovacoes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campanhas c
      WHERE c.id = aprovacoes.campanha_id
        AND c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY apr_tenant_insert ON public.aprovacoes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campanhas c
      WHERE c.id = aprovacoes.campanha_id
        AND c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY rev_tenant_select ON public.revisoes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campanhas c
      WHERE c.id = revisoes.campanha_id
        AND c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY rev_tenant_insert ON public.revisoes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campanhas c
      WHERE c.id = revisoes.campanha_id
        AND c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

REVOKE ALL ON public.artes, public.campanha_arte_versoes, public.aprovacoes, public.revisoes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artes, public.campanha_arte_versoes, public.aprovacoes, public.revisoes TO authenticated;

-- ======================================================================
-- 6. REDE DE TELAS (redes, unidades, locais, telas, equipamentos)
-- ======================================================================
ALTER TABLE public.redes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY red_tenant_select ON public.redes
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY red_tenant_insert ON public.redes
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY red_tenant_update ON public.redes
  FOR UPDATE TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY red_tenant_delete ON public.redes
  FOR DELETE TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY uni_tenant_select ON public.unidades
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.redes r
      WHERE r.id = unidades.rede_id
        AND r.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY uni_tenant_insert ON public.unidades
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.redes r
      WHERE r.id = unidades.rede_id
        AND r.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY uni_tenant_update ON public.unidades
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.redes r
      WHERE r.id = unidades.rede_id
        AND r.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.redes r
      WHERE r.id = unidades.rede_id
        AND r.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY uni_tenant_delete ON public.unidades
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.redes r
      WHERE r.id = unidades.rede_id
        AND r.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY loc_tenant_select ON public.locais
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.unidades u
      JOIN public.redes r ON r.id = u.rede_id
      WHERE u.id = locais.unidade_id
        AND r.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY loc_tenant_insert ON public.locais
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.unidades u
      JOIN public.redes r ON r.id = u.rede_id
      WHERE u.id = locais.unidade_id
        AND r.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY loc_tenant_update ON public.locais
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.unidades u
      JOIN public.redes r ON r.id = u.rede_id
      WHERE u.id = locais.unidade_id
        AND r.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.unidades u
      JOIN public.redes r ON r.id = u.rede_id
      WHERE u.id = locais.unidade_id
        AND r.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY loc_tenant_delete ON public.locais
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.unidades u
      JOIN public.redes r ON r.id = u.rede_id
      WHERE u.id = locais.unidade_id
        AND r.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY tel_tenant_select ON public.telas
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY tel_tenant_insert ON public.telas
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY tel_tenant_update ON public.telas
  FOR UPDATE TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY tel_tenant_delete ON public.telas
  FOR DELETE TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY eqp_tenant_select ON public.equipamentos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.telas t
      WHERE t.id = equipamentos.tela_id
        AND t.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY eqp_tenant_insert ON public.equipamentos
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.telas t
      WHERE t.id = equipamentos.tela_id
        AND t.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY eqp_tenant_update ON public.equipamentos
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.telas t
      WHERE t.id = equipamentos.tela_id
        AND t.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.telas t
      WHERE t.id = equipamentos.tela_id
        AND t.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY eqp_tenant_delete ON public.equipamentos
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.telas t
      WHERE t.id = equipamentos.tela_id
        AND t.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

REVOKE ALL ON public.redes, public.unidades, public.locais, public.telas, public.equipamentos FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.redes, public.unidades, public.locais, public.telas, public.equipamentos TO authenticated;

-- ======================================================================
-- 7. PLAYERS E TELEMETRIA LEGADOS (player_telemetria, player_historico_hardware, designers)
-- ======================================================================
ALTER TABLE public.player_telemetria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_historico_hardware ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.designers ENABLE ROW LEVEL SECURITY;

CREATE POLICY pte_tenant_select ON public.player_telemetria
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.players p
      WHERE p.id = player_telemetria.player_id
        AND p.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY pte_tenant_insert ON public.player_telemetria
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.players p
      WHERE p.id = player_telemetria.player_id
        AND p.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY phh_tenant_select ON public.player_historico_hardware
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.telas t
      WHERE t.id = player_historico_hardware.tela_id
        AND t.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY phh_tenant_insert ON public.player_historico_hardware
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.telas t
      WHERE t.id = player_historico_hardware.tela_id
        AND t.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY dsg_tenant_select ON public.designers
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY dsg_tenant_insert ON public.designers
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY dsg_tenant_update ON public.designers
  FOR UPDATE TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

REVOKE ALL ON public.player_telemetria, public.player_historico_hardware, public.designers FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.player_telemetria, public.player_historico_hardware, public.designers TO authenticated;

-- ======================================================================
-- 8. DAM LEGADO (biblioteca_midias, midia_versoes, midia_aprovacoes) + PI/OPERAÇÃO
-- ======================================================================
ALTER TABLE public.biblioteca_midias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midia_versoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midia_aprovacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_read_midia_versoes ON public.midia_versoes;
DROP POLICY IF EXISTS p_insert_midia_versoes ON public.midia_versoes;
DROP POLICY IF EXISTS p_read_midia_aprovacoes ON public.midia_aprovacoes;
DROP POLICY IF EXISTS p_insert_midia_aprovacoes ON public.midia_aprovacoes;

CREATE POLICY bm_tenant_select ON public.biblioteca_midias
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY bm_tenant_insert ON public.biblioteca_midias
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY bm_tenant_update ON public.biblioteca_midias
  FOR UPDATE TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY bm_tenant_delete ON public.biblioteca_midias
  FOR DELETE TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY mv_tenant_select ON public.midia_versoes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.biblioteca_midias bm
      WHERE bm.id = midia_versoes.biblioteca_midia_id
        AND bm.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY mv_tenant_insert ON public.midia_versoes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.biblioteca_midias bm
      WHERE bm.id = midia_versoes.biblioteca_midia_id
        AND bm.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY ma_tenant_select ON public.midia_aprovacoes
  FOR SELECT TO authenticated
  USING (
    usuario_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.midias m
      JOIN public.producoes p ON p.id = m.producao_id
      WHERE m.id = midia_aprovacoes.midia_id
        AND p.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY ma_tenant_insert ON public.midia_aprovacoes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.midias m
      JOIN public.producoes p ON p.id = m.producao_id
      WHERE m.id = midia_aprovacoes.midia_id
        AND p.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

REVOKE ALL ON public.biblioteca_midias, public.midia_versoes, public.midia_aprovacoes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.biblioteca_midias, public.midia_versoes, public.midia_aprovacoes TO authenticated;

-- ======================================================================
-- 9. ORDENS DE PRODUÇÃO / PI LOCAIS / AGENDAMENTO TELAS / OPERAÇÃO REDE
-- ======================================================================
ALTER TABLE public.ordens_producao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas_producao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pi_locais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamento_telas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operacao_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS op_tenant_isolation ON public.ordens_producao;
DROP POLICY IF EXISTS pi_locais_tenant ON public.pi_locais;
DROP POLICY IF EXISTS p_read_pi_locais ON public.pi_locais;
DROP POLICY IF EXISTS p_insert_pi_locais ON public.pi_locais;
DROP POLICY IF EXISTS at_tenant_isolation ON public.agendamento_telas;
DROP POLICY IF EXISTS p_read_operacao_players ON public.operacao_players;

CREATE POLICY op_tenant_select ON public.ordens_producao
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY op_tenant_insert ON public.ordens_producao
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY op_tenant_update ON public.ordens_producao
  FOR UPDATE TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY op_tenant_delete ON public.ordens_producao
  FOR DELETE TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY tp_tenant_select ON public.tarefas_producao
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ordens_producao op
      WHERE op.id = tarefas_producao.ordem_producao_id
        AND op.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY tp_tenant_insert ON public.tarefas_producao
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ordens_producao op
      WHERE op.id = tarefas_producao.ordem_producao_id
        AND op.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY tp_tenant_update ON public.tarefas_producao
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ordens_producao op
      WHERE op.id = tarefas_producao.ordem_producao_id
        AND op.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ordens_producao op
      WHERE op.id = tarefas_producao.ordem_producao_id
        AND op.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY tp_tenant_delete ON public.tarefas_producao
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ordens_producao op
      WHERE op.id = tarefas_producao.ordem_producao_id
        AND op.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY pil_tenant_select ON public.pi_locais
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pedidos_insercao pi
      WHERE pi.id = pi_locais.pi_id
        AND pi.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY pil_tenant_insert ON public.pi_locais
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pedidos_insercao pi
      WHERE pi.id = pi_locais.pi_id
        AND pi.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY pil_tenant_update ON public.pi_locais
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pedidos_insercao pi
      WHERE pi.id = pi_locais.pi_id
        AND pi.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pedidos_insercao pi
      WHERE pi.id = pi_locais.pi_id
        AND pi.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY pil_tenant_delete ON public.pi_locais
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pedidos_insercao pi
      WHERE pi.id = pi_locais.pi_id
        AND pi.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY agt_tenant_select ON public.agendamento_telas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.id = agendamento_telas.agendamento_id
        AND a.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR (screen_id IS NOT NULL AND public.fn_player_can_access_screen(screen_id))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY agt_tenant_insert ON public.agendamento_telas
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.id = agendamento_telas.agendamento_id
        AND a.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR (screen_id IS NOT NULL AND public.fn_player_can_access_screen(screen_id))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY agt_tenant_update ON public.agendamento_telas
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.id = agendamento_telas.agendamento_id
        AND a.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR (screen_id IS NOT NULL AND public.fn_player_can_access_screen(screen_id))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.id = agendamento_telas.agendamento_id
        AND a.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR (screen_id IS NOT NULL AND public.fn_player_can_access_screen(screen_id))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY agt_tenant_delete ON public.agendamento_telas
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.id = agendamento_telas.agendamento_id
        AND a.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR (screen_id IS NOT NULL AND public.fn_player_can_access_screen(screen_id))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY opa_tenant_select ON public.operacao_players
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.operacoes o
      WHERE o.id = operacao_players.operacao_id
        AND o.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.players p
      WHERE p.id = operacao_players.player_id
        AND p.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY opa_tenant_insert ON public.operacao_players
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.operacoes o
      WHERE o.id = operacao_players.operacao_id
        AND o.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY opa_tenant_update ON public.operacao_players
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.operacoes o
      WHERE o.id = operacao_players.operacao_id
        AND o.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.operacoes o
      WHERE o.id = operacao_players.operacao_id
        AND o.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

REVOKE ALL ON public.ordens_producao, public.tarefas_producao, public.pi_locais, public.agendamento_telas, public.operacao_players FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ordens_producao, public.tarefas_producao, public.pi_locais, public.agendamento_telas, public.operacao_players TO authenticated;

-- ======================================================================
-- VERIFICAÇÃO FINAL — NENHUMA policy permissiva sem escopo deve restar
-- ======================================================================
SELECT schemaname, tablename, policyname, cmd, roles, qual
FROM pg_policies
WHERE (tablename IN (
        'producoes','agendamentos','producao_midia','producao_auditoria',
        'agendamento_historico','portal_chamados','portal_aprovacoes',
        'mobile_checkins','mobile_fotos','mobile_visitas','dw_operacao',
        'dw_receita','bi_snapshots','dw_dim_tempo','campanhas','artes',
        'campanha_arte_versoes','aprovacoes','revisoes','tarefas_producao',
        'redes','unidades','locais','telas','equipamentos',
        'player_telemetria','player_historico_hardware','designers',
        'biblioteca_midias','midia_versoes','midia_aprovacoes',
        'ordens_producao','pi_locais','agendamento_telas','operacao_players'
      ))
ORDER BY tablename, policyname;