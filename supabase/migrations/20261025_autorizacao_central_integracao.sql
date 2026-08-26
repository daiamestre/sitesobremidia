-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261025
-- INTEGRAÇÃO: AUTORIZAÇÃO DE USUÁRIOS ↔ CENTRAL DE COMUNICAÇÃO
-- ======================================================================
-- Objetivo (aditivo, idempotente, auditável):
--   FLUXO A (OWNER/ADMIN cria usuário): usuário nasce PENDING +
--     solicitação de acesso + mensagem IN_APP ao OWNER na Central com
--     APROVAR/RECUSAR via RPC decidir_solicitacao_acesso.
--   FLUXO B (cadastro público): solicitação PENDING já existente passa a
--     notificar o OWNER automaticamente (IN_APP + e-mail via Communication
--     Core), sem criar central paralela.
--
-- NÃO destrutivo:
--   - Não remove perfis; reafirma a constraint completa (12 valores).
--   - Não desabilita RLS; não cria bypass.
--   - Backfill preserva baseline: usuários ACTIVE pré-existentes recebem
--     solicitação APPROVED auditada (origem MIGRACAO_BASELINE) para que o
--     estado efetivo permaneça exatamente como antes da migration.
-- ======================================================================

-- ------------------------------------------------------------
-- 1. CONSTRAINT DE PERFIS — conjunto completo (reparo idempotente)
--    Garante os 9 perfis constitucionais + legados (superset 20261023).
-- ------------------------------------------------------------
ALTER TABLE public.perfis DROP CONSTRAINT IF EXISTS perfis_nome_check;
ALTER TABLE public.perfis ADD CONSTRAINT perfis_nome_check
  CHECK (nome IN (
    'OWNER', 'ADMIN', 'GESTOR', 'FUNCIONARIO', 'REPRESENTANTE', 'ANUNCIANTE', 'PARCEIRO',
    'GERENTE', 'FINANCEIRO', 'DESIGNER', 'OPERACIONAL', 'CLIENTE'
  ));

INSERT INTO public.perfis (nome, descricao, ativo)
VALUES
  ('OWNER',        'Proprietário soberano da plataforma', true),
  ('ADMIN',        'Administrador corporativo',           true),
  ('GESTOR',       'Gestor de telas/mídias',              true),
  ('FUNCIONARIO',  'Funcionário operacional',             true),
  ('REPRESENTANTE','Representante comercial',             true),
  ('ANUNCIANTE',   'Anunciante (portal do cliente)',      true),
  ('PARCEIRO',     'Parceiro de rede',                    true),
  ('GERENTE',      'Gerente (legado)',                    true),
  ('FINANCEIRO',   'Financeiro',                          true),
  ('DESIGNER',     'Designer (legado)',                   true),
  ('OPERACIONAL',  'Operacional (legado)',                true),
  ('CLIENTE',      'Cliente (legado)',                    true)
ON CONFLICT (nome) DO UPDATE SET ativo = TRUE;

DO $$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(req.p, ', ') INTO v_missing FROM (VALUES
    ('OWNER'),('ADMIN'),('ANUNCIANTE'),('REPRESENTANTE'),('GERENTE'),
    ('FINANCEIRO'),('GESTOR'),('FUNCIONARIO'),('PARCEIRO')
  ) AS req(p)
  WHERE NOT EXISTS (SELECT 1 FROM public.perfis c WHERE c.nome = req.p);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION ABORTADA — perfis constitucionais ausentes: %', v_missing;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. CATÁLOGO DE EVENTOS — USER_ACCESS_REQUESTED (aditivo)
--    Reutiliza eventos existentes quando semanticamente corretos;
--    cria apenas o evento faltante.
-- ------------------------------------------------------------
INSERT INTO public.comunicacao_eventos_catalogo
  (event_name, domain, descricao, canais_habilitados, template_key_padrao, prioridade, max_tentativas, backoff_segundos, tenant_scope)
VALUES
  ('USER_ACCESS_REQUESTED', 'auth',
   'Novo usuário aguardando autorização do OWNER (Fluxo A corporativo / Fluxo B cadastro público)',
   ARRAY['email','in_app']::text[],
   'user_access_request_admin',
   'ALTO', 3, 300, 'TENANT')
ON CONFLICT (event_name) DO NOTHING;

-- Reafirma eventos de decisão (idempotente; sem duplicação de template)
INSERT INTO public.comunicacao_eventos_catalogo
  (event_name, domain, descricao, canais_habilitados, template_key_padrao, prioridade, max_tentativas, backoff_segundos, tenant_scope)
VALUES
  ('USER_APPROVED',  'auth', 'Cadastro de usuário aprovado pelo OWNER/ADMIN', ARRAY['email','in_app']::text[], 'user_approved',  'NORMAL', 3, 300, 'TENANT'),
  ('USER_REJECTED',  'auth', 'Cadastro de usuário recusado pelo OWNER/ADMIN', ARRAY['email','in_app']::text[], 'user_rejected',  'NORMAL', 3, 300, 'TENANT'),
  ('USER_REGISTERED','auth', 'Novo registro de usuário confirmado no Supabase Auth', ARRAY['email','in_app']::text[], 'user_registered', 'ALTO', 3, 300, 'TENANT')
ON CONFLICT (event_name) DO NOTHING;

-- ------------------------------------------------------------
-- 3. TEMPLATE DO E-MAIL DO OWNER (aditivo — não duplica existentes)
-- ------------------------------------------------------------
INSERT INTO public.comunicacao_templates
  (empresa_operadora_id, template_key, event_name, canal, assunto, corpo, variaveis, versao, status)
VALUES
  (NULL, 'user_access_request_admin', 'USER_ACCESS_REQUESTED', 'email',
   'Sobre Mídia — Novo usuário aguardando autorização',
   '<div style="font-family:sans-serif;max-width:600px;margin:auto;background:#0f172a;color:#f8fafc;padding:24px;border-radius:12px;">'
     || '<h2 style="color:#38bdf8;margin-top:0;">Novo usuário aguardando autorização</h2>'
     || '<p>Uma nova solicitação de acesso foi registrada na Central de Comunicação.</p>'
     || '<div style="background:#1e293b;border-radius:8px;padding:16px;line-height:1.7;">'
     || '<p style="margin:4px 0;"><strong>Nome:</strong> {{nome_usuario}}</p>'
     || '<p style="margin:4px 0;"><strong>E-mail:</strong> {{email_usuario}}</p>'
     || '<p style="margin:4px 0;"><strong>Perfil:</strong> {{perfil_solicitado}}</p>'
     || '<p style="margin:4px 0;"><strong>Origem:</strong> {{origem}}</p>'
     || '<p style="margin:4px 0;"><strong>Data:</strong> {{data_solicitacao}}</p>'
     || '<p style="margin:4px 0;"><strong>Status:</strong> AGUARDANDO APROVAÇÃO</p>'
     || '</div>'
     || '<p style="margin-top:20px;">Acesse a <a href="{{central_link}}" style="color:#38bdf8;">Central de Comunicação → Solicitações</a> '
     || 'para <strong>[APROVAR]</strong> ou <strong>[RECUSAR]</strong> esta solicitação.</p>'
     || '<p style="color:#64748b;font-size:12px;margin-top:24px;">Plataforma SOBRE MÍDIA — comunicação oficial via Communication Core.</p>'
   || '</div>',
   ARRAY['nome_usuario','email_usuario','perfil_solicitado','origem','data_solicitacao','central_link'],
   1, 'ACTIVE')
ON CONFLICT (template_key, canal, versao) DO NOTHING;

-- ------------------------------------------------------------
-- 4. SOLICITACOES_ACESSO — colunas de integração (aditivas)
-- ------------------------------------------------------------
ALTER TABLE public.solicitacoes_acesso
  ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'CADASTRO_PUBLICO',
  ADD COLUMN IF NOT EXISTS perfil_solicitado_id UUID REFERENCES public.perfis(id),
  ADD COLUMN IF NOT EXISTS criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notificacao_central_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'solicitacoes_acesso_origem_check') THEN
    ALTER TABLE public.solicitacoes_acesso
      ADD CONSTRAINT solicitacoes_acesso_origem_check
      CHECK (origem IN (
        'CADASTRO_PUBLICO',
        'CRIACAO_CORPORATIVA',
        'MIGRACAO_BASELINE',
        'CRIACAO_CORPORATIVA_PROVISIONADA' -- missão portal: provisionamento direto interno
      ));
  ELSE
    -- Reconciliação aditiva: garante o valor da missão portal mesmo se a
    -- constraint já existir de uma execução anterior desta migration.
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = 'solicitacoes_acesso_origem_check'
         AND pg_get_constraintdef(oid) LIKE '%CRIACAO_CORPORATIVA_PROVISIONADA%'
    ) THEN
      ALTER TABLE public.solicitacoes_acesso DROP CONSTRAINT solicitacoes_acesso_origem_check;
      ALTER TABLE public.solicitacoes_acesso
        ADD CONSTRAINT solicitacoes_acesso_origem_check
        CHECK (origem IN (
          'CADASTRO_PUBLICO',
          'CRIACAO_CORPORATIVA',
          'MIGRACAO_BASELINE',
          'CRIACAO_CORPORATIVA_PROVISIONADA'
        ));
    END IF;
  END IF;
END $$;

-- Amplia o catálogo de tipos de acesso (aditivo) para cobrir os perfis
-- constitucionais usados pelos Fluxos A/B (antes: só REPRESENTANTE/GESTOR_TELAS)
DO $$
DECLARE v_conname text;
BEGIN
  SELECT conname INTO v_conname
    FROM pg_constraint
   WHERE conrelid = 'public.solicitacoes_acesso'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%tipo_acesso%'
     AND pg_get_constraintdef(oid) LIKE '%CHECK%';
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.solicitacoes_acesso DROP CONSTRAINT %I', v_conname);
  END IF;
  ALTER TABLE public.solicitacoes_acesso
    ADD CONSTRAINT solicitacoes_acesso_tipo_acesso_check
    CHECK (tipo_acesso IN ('REPRESENTANTE','GESTOR_TELAS','FUNCIONARIO','ANUNCIANTE','PARCEIRO'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Idempotência (§11): NO MÁXIMO UMA solicitação PENDING por e-mail
CREATE UNIQUE INDEX IF NOT EXISTS uq_solicitacoes_acesso_email_pending
  ON public.solicitacoes_acesso (lower(email_usuario))
  WHERE status = 'PENDING';

-- Anti-duplicidade de mensagem na Central por solicitação E por destinatário
-- (multi-OWNER: cada OWNER recebe a SUA cópia, sem duplicar para o mesmo)
CREATE UNIQUE INDEX IF NOT EXISTS uq_nc_user_access_request_por_owner
  ON public.notificacoes_central (entidade_relacionada_id, usuario_id)
  WHERE tipo_evento = 'USER_ACCESS_REQUESTED' AND entidade_relacionada_id IS NOT NULL;

-- ------------------------------------------------------------
-- 4.b USUARIOS — coluna de ciclo de vida canônica (029) se ausente
--    (o cloud não tinha a 029_epic aplicada; coluna é aditiva e
--     necessária para o estado PENDING/REJECTED do ciclo oficial)
-- ------------------------------------------------------------
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS status_ciclo_vida VARCHAR(30) DEFAULT 'ACTIVE' NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_usuarios_ciclo_vida') THEN
    ALTER TABLE public.usuarios ADD CONSTRAINT chk_usuarios_ciclo_vida
      CHECK (status_ciclo_vida IN ('PENDING','APPROVED','ACTIVE','SUSPENDED','REJECTED','INACTIVE','DELETED'));
  END IF;
END $$;

-- ------------------------------------------------------------
-- 5. TRIGGER — notifica OWNERs na Central + enfileira e-mail
--    (Communication Core; idempotente; sem central paralela)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notificar_owner_nova_solicitacao_acesso()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := NEW.empresa_operadora_id;
  v_origem text := CASE WHEN NEW.origem = 'CRIACAO_CORPORATIVA' THEN 'Criação corporativa (OWNER/ADMIN)' ELSE 'Cadastro no site' END;
  v_perfil_nome text;
  v_central_id uuid;
  v_app_url text := COALESCE(current_setting('app.public_url', true), 'https://plataforma.sobremidia.com.br');
  r RECORD;
BEGIN
  IF NEW.status IS DISTINCT FROM 'PENDING' THEN
    RETURN NEW;
  END IF;

  -- Tenant efetivo: explícito → tenant de quem criou → NULL (operador único)
  IF v_tenant IS NULL AND NEW.criado_por IS NOT NULL THEN
    SELECT u.empresa_operadora_id INTO v_tenant
      FROM public.usuarios u WHERE u.id = NEW.criado_por;
  END IF;

  SELECT p.nome INTO v_perfil_nome
    FROM public.perfis p WHERE p.id = NEW.perfil_solicitado_id;

  -- OWNERs destinatários: do tenant quando conhecido; senão todos os owners ativos
  FOR r IN
    SELECT u.id, u.email, u.empresa_operadora_id
      FROM public.usuarios u
     WHERE u.is_owner = true
       AND u.ativo = true
       AND (v_tenant IS NULL OR u.empresa_operadora_id = v_tenant)
  LOOP
    -- Mensagem IN_APP na Central de Comunicação (mensagens normais do sistema)
    -- empresa_operadora_id: SEMPRE um tenant real (FK) — o do OWNER destinatário
    INSERT INTO public.notificacoes_central
      (empresa_operadora_id, usuario_id, tipo_evento, canal, destinatario_contato,
       titulo, mensagem, prioridade, severidade, status_envio, lida, status_notificacao,
       rota_destino, entidade_relacionada_tipo, entidade_relacionada_id)
    VALUES
      (r.empresa_operadora_id,
       r.id, 'USER_ACCESS_REQUESTED', 'IN_APP', r.id::text,
       'Novo usuário aguardando autorização',
       'Nome: ' || NEW.nome_usuario
         || E'\nE-mail: ' || NEW.email_usuario
         || E'\nPerfil: ' || COALESCE(v_perfil_nome, NEW.tipo_acesso)
         || E'\nOrigem: ' || v_origem
         || E'\nStatus: PENDING — aguardando sua decisão (APROVAR/RECUSAR).',
       'IMPORTANTE', 'ALERTA', 'SENT', false, 'NAO_LIDA',
       '/workspace/central?solicitacao=' || NEW.id,
       'solicitacao_acesso', NEW.id)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_central_id;

    -- E-mail ao OWNER exclusivamente via Communication Core (job → Resend)
    PERFORM public.enfileirar_job(
      COALESCE(r.empresa_operadora_id, v_tenant),
      'USER_ACCESS_REQUESTED',
      jsonb_build_object(
        'to', r.email,
        'template_key', 'user_access_request_admin',
        'vars', jsonb_build_object(
          'nome_usuario', NEW.nome_usuario,
          'email_usuario', NEW.email_usuario,
          'perfil_solicitado', COALESCE(v_perfil_nome, NEW.tipo_acesso),
          'origem', v_origem,
          'data_solicitacao', to_char(NEW.created_at, 'DD/MM/YYYY HH24:MI'),
          'central_link', v_app_url || '/workspace/central?solicitacao=' || NEW.id
        )
      ),
      'acesso-sol-' || NEW.id::text || '-owner-' || r.id::text,
      'ALTO'
    );
  END LOOP;

  IF v_central_id IS NOT NULL THEN
    UPDATE public.solicitacoes_acesso
       SET notificacao_central_id = v_central_id
     WHERE id = NEW.id AND notificacao_central_id IS DISTINCT FROM v_central_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_solicitacao_acesso_notifica_owner ON public.solicitacoes_acesso;
CREATE TRIGGER trg_solicitacao_acesso_notifica_owner
  AFTER INSERT ON public.solicitacoes_acesso
  FOR EACH ROW EXECUTE FUNCTION public.notificar_owner_nova_solicitacao_acesso();

-- ------------------------------------------------------------
-- 6. RPC DECIDIR_SOLICITACAO_ACESSO — fluxo oficial APROVAR/RECUSAR
--    Autorização: is_owner_or_admin() + mesmo tenant (RBAC/RLS vigentes).
--    Idempotente: somente PENDING pode ser decidido (§9.2 / §10.2).
--    Auditable: trigger trg_solicitacao_status grava STATUS_CHANGE com autor.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decidir_solicitacao_acesso(
  p_solicitacao_id uuid,
  p_decisao text,
  p_motivo text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_tenant_caller uuid;
  v_sol public.solicitacoes_acesso%ROWTYPE;
  v_perfil_id uuid;
  v_perfil_nome text;
  v_cliente_id uuid;
  v_usuario_existente uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Acesso Negado: sessão inválida.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_owner_or_admin() THEN
    RAISE EXCEPTION 'Acesso Negado: apenas OWNER ou ADMIN podem decidir solicitações.' USING ERRCODE = '42501';
  END IF;
  IF upper(p_decisao) NOT IN ('APPROVED','REJECTED') THEN
    RAISE EXCEPTION 'Decisão inválida: use APPROVED ou REJECTED.' USING ERRCODE = '22023';
  END IF;

  SELECT get_user_tenant_id() INTO v_tenant_caller;

  SELECT * INTO v_sol FROM public.solicitacoes_acesso
    WHERE id = p_solicitacao_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação de acesso não encontrada.' USING ERRCODE = '22023';
  END IF;
  -- Tenant check: mesma empresa OU adoção de solicitação órfã (cadastro público)
  IF v_sol.empresa_operadora_id IS NOT NULL AND v_sol.empresa_operadora_id <> v_tenant_caller THEN
    RAISE EXCEPTION 'Acesso Negado: solicitação pertence a outro tenant.' USING ERRCODE = '42501';
  END IF;
  IF v_sol.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Esta solicitação já foi processada (status: %).', v_sol.status USING ERRCODE = '23505';
  END IF;

  -- Atualiza a solicitação (triggers preenchem approved_by/rejected_by via auth.uid()
  -- e gravam auditoria STATUS_CHANGE automaticamente)
  UPDATE public.solicitacoes_acesso
     SET status = upper(p_decisao),
         motivo_rejeicao = CASE WHEN upper(p_decisao) = 'REJECTED'
                                THEN COALESCE(NULLIF(trim(p_motivo),''), 'Recusado pelo administrador.')
                                ELSE NULL END,
         empresa_operadora_id = COALESCE(v_sol.empresa_operadora_id, v_tenant_caller)
   WHERE id = v_sol.id;

  -- Resolve cliente vinculado (quando fornecido nos dados de cadastro e do mesmo tenant)
  BEGIN
    v_cliente_id := NULLIF(v_sol.dados_cadastro->>'cliente_id','')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN v_cliente_id := NULL; END;
  IF v_cliente_id IS NOT NULL THEN
    SELECT c.id INTO v_cliente_id
      FROM public.clientes c
     WHERE c.id = v_cliente_id
       AND c.empresa_operadora_id = COALESCE(v_sol.empresa_operadora_id, v_tenant_caller);
  END IF;

  -- Perfil destino: perfil_solicitado_id (Fluxo A) ou mapa tipo_acesso (Fluxo B)
  v_perfil_id := v_sol.perfil_solicitado_id;
  IF v_perfil_id IS NULL THEN
    SELECT p.id, p.nome INTO v_perfil_id, v_perfil_nome
      FROM public.perfis p
     WHERE p.nome = CASE v_sol.tipo_acesso
                       WHEN 'REPRESENTANTE' THEN 'REPRESENTANTE'
                       WHEN 'GESTOR_TELAS'  THEN 'GESTOR'
                       WHEN 'ANUNCIANTE'    THEN 'ANUNCIANTE'
                       WHEN 'PARCEIRO'      THEN 'PARCEIRO'
                       WHEN 'FUNCIONARIO'   THEN 'FUNCIONARIO'
                       ELSE 'REPRESENTANTE'
                     END
     LIMIT 1;
  ELSE
    SELECT p.nome INTO v_perfil_nome FROM public.perfis p WHERE p.id = v_perfil_id;
  END IF;

  SELECT u.id INTO v_usuario_existente
    FROM public.usuarios u
   WHERE u.id = COALESCE(v_sol.auth_user_id, v_sol.usuario_id);

  IF upper(p_decisao) = 'APPROVED' THEN
    IF v_usuario_existente IS NOT NULL THEN
      UPDATE public.usuarios
         SET ativo = true,
             status = 'ACTIVE',
             status_ciclo_vida = 'ACTIVE',
             perfil_id = COALESCE(v_perfil_id, perfil_id),
             cliente_id = COALESCE(v_cliente_id, cliente_id),
             updated_by = v_caller,
             version = version + 1
       WHERE id = v_usuario_existente;
    ELSIF v_sol.auth_user_id IS NOT NULL AND v_perfil_id IS NOT NULL THEN
      -- Fluxo B: aprovação antes do primeiro login — cria o registro corporativo
      INSERT INTO public.usuarios
        (id, empresa_operadora_id, perfil_id, nome, email, telefone, ativo, status,
         status_ciclo_vida, cliente_id, created_by, version)
      VALUES
        (v_sol.auth_user_id,
         COALESCE(v_sol.empresa_operadora_id, v_tenant_caller),
         v_perfil_id, v_sol.nome_usuario, v_sol.email_usuario,
         NULLIF(trim(COALESCE(v_sol.telefone,'')), ''),
         true, 'ACTIVE', 'ACTIVE', v_cliente_id, v_caller, 1);

      IF v_perfil_nome = 'REPRESENTANTE' THEN
        INSERT INTO public.representantes (empresa_operadora_id, usuario_id, cpf_cnpj, ativo)
        VALUES (COALESCE(v_sol.empresa_operadora_id, v_tenant_caller), v_sol.auth_user_id, '', true);
      END IF;
    END IF;
  ELSE
    IF v_usuario_existente IS NOT NULL THEN
      UPDATE public.usuarios
         SET ativo = false,
             status = 'REJECTED',
             status_ciclo_vida = 'REJECTED',
             updated_by = v_caller,
             version = version + 1
       WHERE id = v_usuario_existente;
    END IF;
    -- Recusa NÃO exclui o usuário silenciosamente (§10): estado REJECTED auditável.
  END IF;

  -- Marca a mensagem da Central como RESOLVIDA (§9.8 / §10.8)
  UPDATE public.notificacoes_central
     SET status_notificacao = 'RESOLVIDA',
         lida = true,
         resolvida_em = NOW()
   WHERE tipo_evento = 'USER_ACCESS_REQUESTED'
     AND entidade_relacionada_id = v_sol.id
     AND status_notificacao <> 'RESOLVIDA';

  -- Comunicação ao usuário via Communication Core (§9.10 / §10.10)
  PERFORM public.enfileirar_job(
    COALESCE(v_sol.empresa_operadora_id, v_tenant_caller),
    CASE WHEN upper(p_decisao) = 'APPROVED' THEN 'USER_APPROVED' ELSE 'USER_REJECTED' END,
    jsonb_build_object(
      'to', v_sol.email_usuario,
      'template_key', CASE WHEN upper(p_decisao) = 'APPROVED' THEN 'user_approved' ELSE 'user_rejected' END,
      'vars', jsonb_build_object(
        'nome_usuario', v_sol.nome_usuario,
        'tipo_acesso', v_sol.tipo_acesso,
        'motivo', COALESCE(NULLIF(trim(p_motivo),''), '')
      )
    ),
    'acesso-decisao-' || v_sol.id::text || '-' || lower(p_decisao),
    'NORMAL'
  );

  -- Mensagem IN_APP ao usuário decidido — apenas se o registro corporativo
  -- existir (FK notificacoes_central.usuario_id → usuarios). O e-mail oficial
  -- já foi enfileirado acima e cobre os casos Fluxo B sem usuarios.
  IF v_usuario_existente IS NOT NULL THEN
    INSERT INTO public.notificacoes_central
      (empresa_operadora_id, usuario_id, tipo_evento, canal, destinatario_contato,
       titulo, mensagem, prioridade, severidade, status_envio, lida, status_notificacao)
    VALUES
      (COALESCE(v_sol.empresa_operadora_id, v_tenant_caller),
       v_usuario_existente,
       CASE WHEN upper(p_decisao) = 'APPROVED' THEN 'USUARIO_APROVADO' ELSE 'USUARIO_REJEITADO' END,
       'IN_APP',
       v_usuario_existente::text,
       CASE WHEN upper(p_decisao) = 'APPROVED' THEN 'Seu cadastro foi aprovado!' ELSE 'Sobre o seu cadastro' END,
       CASE WHEN upper(p_decisao) = 'APPROVED'
            THEN 'Seu acesso como ' || COALESCE(v_perfil_nome, v_sol.tipo_acesso) || ' foi aprovado. Você já pode acessar a plataforma.'
            ELSE 'Seu cadastro não foi aprovado neste momento.' || COALESCE(NULLIF(trim(p_motivo),''), '')
       END,
       CASE WHEN upper(p_decisao) = 'APPROVED' THEN 'SUCESSO' ELSE 'ATENCAO' END,
       'INFO', 'SENT', false, 'NAO_LIDA');
  END IF;

  RETURN json_build_object(
    'ok', true,
    'solicitacao_id', v_sol.id,
    'decisao', upper(p_decisao),
    'usuario_status', CASE WHEN upper(p_decisao) = 'APPROVED' THEN 'ACTIVE' ELSE 'REJECTED' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.decidir_solicitacao_acesso(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decidir_solicitacao_acesso(uuid, text, text) TO authenticated;

-- ------------------------------------------------------------
-- 6.b RLS — visibilidade das solicitações ÓRFÃS de cadastro público
--     (empresa_operadora_id NULL) para OWNER/ADMIN decidirem pela Central.
--     Solicitante continua vendo apenas a própria linha. Sem bypass.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS solicitacoes_select_own_or_tenant ON public.solicitacoes_acesso;
CREATE POLICY solicitacoes_select_own_or_tenant ON public.solicitacoes_acesso
  FOR SELECT TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR (
      public.is_owner_or_admin()
      AND (empresa_operadora_id = public.get_user_tenant_id() OR empresa_operadora_id IS NULL)
    )
  );

DROP POLICY IF EXISTS solicitacoes_update_admin ON public.solicitacoes_acesso;
CREATE POLICY solicitacoes_update_admin ON public.solicitacoes_acesso
  FOR UPDATE TO authenticated
  USING (
    status = 'PENDING'
    AND public.is_owner_or_admin()
    AND (empresa_operadora_id = public.get_user_tenant_id() OR empresa_operadora_id IS NULL)
  )
  WITH CHECK (
    public.is_owner_or_admin()
    AND (empresa_operadora_id = public.get_user_tenant_id() OR empresa_operadora_id IS NULL)
  );

-- ------------------------------------------------------------
-- 7. CRIAR_USUARIO_CORPORATIVO v2 — FLUXO A
--    Mantém todas as validações oficiais (sessão, tenant, users.create,
--    users.create_admin, proibição de OWNER). Evolução:
--      - usuário nasce PENDING/ativo=false (não libera acesso imediato);
--      - cria solicitação de autorização (origem CRIACAO_CORPORATIVA);
--      - o trigger §5 notifica OWNERs na Central + e-mail;
--      - aceita vínculo opcional de cliente (§12) validado no tenant.
--    Remove a assinatura antiga (5 args) para evitar ambiguidade PostgREST.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.criar_usuario_corporativo(uuid, text, text, text, uuid);

CREATE OR REPLACE FUNCTION public.criar_usuario_corporativo(
  p_uid uuid,
  p_email text,
  p_nome text,
  p_telefone text,
  p_perfil_id uuid,
  p_cliente_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_tenant uuid;
  v_caller_owner boolean;
  v_caller_admin boolean;
  v_caller_email text;
  v_perfil_nome text;
  v_perfil_ativo boolean;
  v_cliente_final uuid := NULL;
  v_solicitacao_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Acesso Negado: sessão inválida.' USING ERRCODE = '42501';
  END IF;

  SELECT u.empresa_operadora_id, COALESCE(u.is_owner, false),
         (UPPER(COALESCE(p.nome, '')) = 'ADMIN'), u.email
    INTO v_caller_tenant, v_caller_owner, v_caller_admin, v_caller_email
    FROM public.usuarios u
    LEFT JOIN public.perfis p ON p.id = u.perfil_id
   WHERE u.id = v_caller;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acesso Negado: usuário não registrado.' USING ERRCODE = '42501';
  END IF;

  -- Autorização: OWNER ou ADMIN com users.create (inalterado)
  IF NOT v_caller_owner THEN
    IF NOT v_caller_admin THEN
      RAISE EXCEPTION 'Acesso Negado: apenas OWNER ou ADMIN podem criar usuários.' USING ERRCODE = '42501';
    END IF;
    IF NOT public.has_admin_permission('users.create') THEN
      RAISE EXCEPTION 'Acesso Negado: permissão users.create não concedida.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Perfil alvo (inalterado)
  SELECT p.nome, p.ativo INTO v_perfil_nome, v_perfil_ativo
    FROM public.perfis p WHERE p.id = p_perfil_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil alvo inexistente.' USING ERRCODE = '22023';
  END IF;
  IF NOT v_perfil_ativo THEN
    RAISE EXCEPTION 'Perfil alvo inativo.' USING ERRCODE = '22023';
  END IF;
  IF v_perfil_nome = 'OWNER' THEN
    RAISE EXCEPTION 'Acesso Negado: não é possível criar contas OWNER.' USING ERRCODE = '42501';
  END IF;
  IF v_perfil_nome = 'ADMIN' AND NOT v_caller_owner THEN
    IF NOT public.has_admin_permission('users.create_admin') THEN
      RAISE EXCEPTION 'Acesso Negado: criar ADMIN requer users.create_admin.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Vínculo opcional de cliente (§12): só aceito se pertencer ao tenant do chamador
  IF p_cliente_id IS NOT NULL THEN
    SELECT c.id INTO v_cliente_final
      FROM public.clientes c
     WHERE c.id = p_cliente_id AND c.empresa_operadora_id = v_caller_tenant;
    IF v_cliente_final IS NULL THEN
      RAISE EXCEPTION 'Cliente informado não pertence à empresa operadora.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Registro corporativo NASCE PENDENTE DE AUTORIZAÇÃO (não liberado)
  INSERT INTO public.usuarios
    (id, empresa_operadora_id, perfil_id, nome, email, telefone, ativo, status,
     status_ciclo_vida, cliente_id, created_by, version)
  VALUES
    (p_uid, v_caller_tenant, p_perfil_id, p_nome, p_email, p_telefone,
     false, 'PENDING', 'PENDING', v_cliente_final, v_caller, 1);

  -- Estrutura comercial real: REPRESENTANTE ganha registro em representantes
  IF v_perfil_nome = 'REPRESENTANTE' THEN
    INSERT INTO public.representantes (empresa_operadora_id, usuario_id, cpf_cnpj, ativo)
    VALUES (v_caller_tenant, p_uid, '', true);
  END IF;

  -- Solicitação de autorização (FLUXO A) — dispara trigger de notificação ao OWNER
  INSERT INTO public.solicitacoes_acesso
    (id, empresa_operadora_id, auth_user_id, usuario_id, tipo_acesso,
     nome_usuario, email_usuario, telefone, dados_cadastro,
     status, approval_token_hash, approval_token_expires_at,
     origem, perfil_solicitado_id, criado_por)
  VALUES
    (gen_random_uuid(), v_caller_tenant, p_uid, p_uid,
     CASE v_perfil_nome
       WHEN 'REPRESENTANTE' THEN 'REPRESENTANTE'
       WHEN 'GESTOR'        THEN 'GESTOR_TELAS'
       WHEN 'ANUNCIANTE'    THEN 'ANUNCIANTE'
       WHEN 'PARCEIRO'      THEN 'PARCEIRO'
       ELSE 'FUNCIONARIO'
     END,
     p_nome, p_email, p_telefone,
     jsonb_build_object('criado_via', 'CENTRAL_ACESSOS', 'perfil_nome', v_perfil_nome,
                        'cliente_id', v_cliente_final),
     'PENDING',
     md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text),
     NOW() + interval '48 hours',
     'CRIACAO_CORPORATIVA', p_perfil_id, v_caller)
  RETURNING id INTO v_solicitacao_id;

  -- Auditoria (infraestrutura existente)
  INSERT INTO public.auditoria_logs
    (empresa_operadora_id, usuario_id, usuario_email, usuario_role, entidade_tipo, entidade_id,
     acao, status_novo, observacoes)
  VALUES
    (v_caller_tenant, v_caller, v_caller_email,
     CASE WHEN v_caller_owner THEN 'OWNER' ELSE 'ADMIN' END,
     'USUARIO', p_uid, 'USER_CREATED', 'PENDING',
     'Usuário criado via Central de Acessos. Perfil: ' || v_perfil_nome
       || '. Solicitação de autorização: ' || v_solicitacao_id::text);

  -- Mensagem IN_APP ao novo usuário (aguardando autorização)
  INSERT INTO public.notificacoes_central
    (empresa_operadora_id, usuario_id, tipo_evento, canal, destinatario_contato, titulo, mensagem,
     prioridade, severidade, status_envio, lida, status_notificacao)
  VALUES
    (v_caller_tenant, p_uid, 'USUARIO_CREATED', 'IN_APP', p_uid,
     'Seu acesso corporativo foi criado',
     'Um convite foi enviado por e-mail. Seu acesso está AGUARDANDO AUTORIZAÇÃO do administrador.',
     'SUCESSO', 'INFO', 'SENT', false, 'NAO_LIDA');

  RETURN p_uid;
END;
$$;

-- ------------------------------------------------------------
-- 8. BACKFILL BASELINE — preservação do estado válido existente
--    Usuários corporativos ATIVOS anteriores à integração recebem uma
--    solicitação APPROVED auditada (origem MIGRACAO_BASELINE), mantendo
--    o acesso exatamente como era. NÃO altera PENDING/REJECTED reais.
-- ------------------------------------------------------------
INSERT INTO public.solicitacoes_acesso
  (id, empresa_operadora_id, auth_user_id, usuario_id, tipo_acesso,
   nome_usuario, email_usuario, telefone, dados_cadastro, status,
   approval_token_hash, approval_token_expires_at, approval_used_at,
   approved_at, approved_by, origem, perfil_solicitado_id)
SELECT
  gen_random_uuid(),
  u.empresa_operadora_id,
  u.id,
  u.id,
  CASE COALESCE(p.nome, '')
    WHEN 'REPRESENTANTE' THEN 'REPRESENTANTE'
    WHEN 'GESTOR'        THEN 'GESTOR_TELAS'
    WHEN 'ANUNCIANTE'    THEN 'ANUNCIANTE'
    WHEN 'PARCEIRO'      THEN 'PARCEIRO'
    ELSE 'FUNCIONARIO'
  END,
  u.nome,
  u.email,
  u.telefone,
  jsonb_build_object('backfill', 'MIGRATION_20261025_BASELINE'),
  'APPROVED',
  md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text),
  NOW(),
  NOW(),
  NOW(),
  u.id,
  'MIGRACAO_BASELINE',
  u.perfil_id
FROM public.usuarios u
LEFT JOIN public.perfis p ON p.id = u.perfil_id
WHERE u.ativo = true
  AND COALESCE(u.status, 'ACTIVE') = 'ACTIVE'
  AND COALESCE(u.is_owner, false) = false
  AND UPPER(COALESCE(p.nome,'')) NOT IN ('OWNER','ADMIN')
  AND NOT EXISTS (
    SELECT 1 FROM public.solicitacoes_acesso s
     WHERE s.auth_user_id = u.id OR s.usuario_id = u.id
  );

INSERT INTO public.auditoria_logs
  (empresa_operadora_id, usuario_email, usuario_role, entidade_tipo, entidade_id,
   acao, status_novo, observacoes)
VALUES
  (NULL, 'migration@system', 'SISTEMA', 'MIGRACAO', gen_random_uuid(),
   'STATUS_CHANGE', 'APLICADA',
   'Integração Autorização↔Central aplicada. Backfill baseline de solicitações APPROVED executado conforme regra §17.');

-- ------------------------------------------------------------
-- 9. JOBS — RLS (fechamento de exposição pré-existente)
--    Leitura apenas para usuários autenticados do próprio tenant
--    (billing.service/financeiro.service consomem status de cobrança).
--    Escrita permanece exclusivamente via RPC SECURITY DEFINER e edge
--    functions service_role — sem bypass.
-- ------------------------------------------------------------
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jobs_select_tenant ON public.jobs;
CREATE POLICY jobs_select_tenant ON public.jobs
  FOR SELECT TO authenticated
  USING (empresa_operadora_id = public.get_user_tenant_id());
