-- F-195 — REGRA PERMANENTE: cada conta vê só o que é dela. Só o dono (OWNER) e o ADM veem tudo.
--  * Gestor de mídia e representante (fn_perfil_so_proprias_telas): usuários, clientes, contratos, cobranças, pagamentos,
--    auditoria financeira, assinaturas, pedidos de inserção, campanhas, propostas, representantes e comissões — só os
--    próprios (antes: tudo da empresa do dono, porque contam como "perfil interno").
--  * Anunciante/cliente/parceiro (fn_perfil_cliente_externo): telas só as de pontos parceiros (o catálogo onde anunciam),
--    as próprias e as que exibiram mídia dele; aparelhos, saúde e exibições só dessas / das próprias mídias
--    (antes: todas as telas, aparelhos e exibições da empresa).
-- São regras RESTRITIVAS de LEITURA (alterar/apagar exige enxergar a linha, então também ficam presas): somam-se às existentes e cortam o que sobra; dono, ADM e demais perfis internos não mudam.
-- Rollback: DROP POLICY so_o_proprio ON <cada tabela abaixo>; DROP POLICY externo_so_o_permitido ON screens/devices/
-- device_health/playback_logs; DROP POLICY scr_select_catalogo_representante ON screens; DROP FUNCTION fn_meus_clientes(),
-- fn_tela_exibiu_midia_do_usuario(uuid), fn_externo_ve_tela(uuid), fn_externo_ve_aparelho(uuid).

-- clientes do gestor/representante: os que ele cadastrou ou que estão na carteira dele
CREATE OR REPLACE FUNCTION public.fn_meus_clientes()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
  SELECT c.id FROM public.clientes c
   WHERE c.created_by = auth.uid()
      OR (c.representante_id IS NOT NULL AND c.representante_id = public.get_user_representante_id());
$f$;
REVOKE ALL ON FUNCTION public.fn_meus_clientes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_meus_clientes() TO authenticated, service_role;

-- a tela já exibiu mídia deste usuário? (anunciante acompanha onde o anúncio dele passou)
CREATE OR REPLACE FUNCTION public.fn_tela_exibiu_midia_do_usuario(p_tela uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
  SELECT EXISTS (SELECT 1 FROM public.playback_logs pl
                  WHERE pl.screen_id = p_tela::text
                    AND pl.media_id IN (SELECT m.id::text FROM public.media m WHERE m.user_id = auth.uid())
                  LIMIT 1);
$f$;
REVOKE ALL ON FUNCTION public.fn_tela_exibiu_midia_do_usuario(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_tela_exibiu_midia_do_usuario(uuid) TO authenticated, service_role;

-- tela/aparelho que o anunciante (cliente externo) pode ver — direto na tabela, sem passar pelas regras de novo (evita laço)
CREATE OR REPLACE FUNCTION public.fn_externo_ve_tela(p_tela uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
  SELECT EXISTS (SELECT 1 FROM public.screens s WHERE s.id = p_tela AND (s.tipo_tela = 'PARCEIRA' OR s.user_id = auth.uid()))
      OR public.fn_tela_exibiu_midia_do_usuario(p_tela);
$f$;
CREATE OR REPLACE FUNCTION public.fn_externo_ve_aparelho(p_aparelho uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
  SELECT EXISTS (SELECT 1 FROM public.devices d WHERE d.id = p_aparelho AND d.screen_id IS NOT NULL AND public.fn_externo_ve_tela(d.screen_id));
$f$;
REVOKE ALL ON FUNCTION public.fn_externo_ve_tela(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_externo_ve_aparelho(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_externo_ve_tela(uuid), public.fn_externo_ve_aparelho(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------- gestor de mídia e representante: só o próprio
DROP POLICY IF EXISTS so_o_proprio ON public.usuarios;
CREATE POLICY so_o_proprio ON public.usuarios AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT (SELECT public.fn_perfil_so_proprias_telas()) OR id = (SELECT auth.uid()));

DROP POLICY IF EXISTS so_o_proprio ON public.clientes;
CREATE POLICY so_o_proprio ON public.clientes AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT (SELECT public.fn_perfil_so_proprias_telas()) OR id IN (SELECT public.fn_meus_clientes()));

DROP POLICY IF EXISTS so_o_proprio ON public.contratos;
CREATE POLICY so_o_proprio ON public.contratos AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT (SELECT public.fn_perfil_so_proprias_telas())
         OR created_by = (SELECT auth.uid()) OR gestor_usuario_id = (SELECT auth.uid()) OR usuario_responsavel_id = (SELECT auth.uid())
         OR (representante_id IS NOT NULL AND representante_id = (SELECT public.get_user_representante_id()))
         OR cliente_id IN (SELECT public.fn_meus_clientes()));

-- cobranças: as da carteira dele e a cobrança de tela paga do próprio gestor (criar_cobranca_tela)
DROP POLICY IF EXISTS so_o_proprio ON public.contas_receber;
CREATE POLICY so_o_proprio ON public.contas_receber AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT (SELECT public.fn_perfil_so_proprias_telas())
         OR notes = 'Criacao de tela — Gestor de Midias (user ' || (SELECT auth.uid())::text || ')'
         OR notes LIKE 'Criacao de tela — Gestor de Midias (user ' || (SELECT auth.uid())::text || ')%'
         OR cliente_id IN (SELECT public.fn_meus_clientes()));

DROP POLICY IF EXISTS so_o_proprio ON public.pagamentos;
CREATE POLICY so_o_proprio ON public.pagamentos AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT (SELECT public.fn_perfil_so_proprias_telas()) OR conta_receber_id IN (SELECT cr.id FROM public.contas_receber cr));

DROP POLICY IF EXISTS so_o_proprio ON public.financeiro_auditoria;
CREATE POLICY so_o_proprio ON public.financeiro_auditoria AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT (SELECT public.fn_perfil_so_proprias_telas()) OR usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS so_o_proprio ON public.assinaturas;
CREATE POLICY so_o_proprio ON public.assinaturas AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT (SELECT public.fn_perfil_so_proprias_telas()) OR assinado_por_usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS so_o_proprio ON public.pedidos_insercao;
CREATE POLICY so_o_proprio ON public.pedidos_insercao AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT (SELECT public.fn_perfil_so_proprias_telas()) OR created_by = (SELECT auth.uid()) OR cliente_id IN (SELECT public.fn_meus_clientes()));

DROP POLICY IF EXISTS so_o_proprio ON public.campanhas;
CREATE POLICY so_o_proprio ON public.campanhas AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT (SELECT public.fn_perfil_so_proprias_telas()) OR created_by = (SELECT auth.uid()) OR cliente_id IN (SELECT public.fn_meus_clientes()));

DROP POLICY IF EXISTS so_o_proprio ON public.propostas;
CREATE POLICY so_o_proprio ON public.propostas AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT (SELECT public.fn_perfil_so_proprias_telas()) OR created_by = (SELECT auth.uid())
         OR (representante_id IS NOT NULL AND representante_id = (SELECT public.get_user_representante_id()))
         OR cliente_id IN (SELECT public.fn_meus_clientes()));

DROP POLICY IF EXISTS so_o_proprio ON public.representantes;
CREATE POLICY so_o_proprio ON public.representantes AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT (SELECT public.fn_perfil_so_proprias_telas()) OR usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS so_o_proprio ON public.comissoes;
CREATE POLICY so_o_proprio ON public.comissoes AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT (SELECT public.fn_perfil_so_proprias_telas()) OR vendedor_id = (SELECT auth.uid())
         OR vendedor_id = (SELECT public.get_user_representante_id()));

-- representante vende as telas dos pontos parceiros: o catálogo (só telas PARCEIRA da própria empresa) continua visível
DROP POLICY IF EXISTS scr_select_catalogo_representante ON public.screens;
CREATE POLICY scr_select_catalogo_representante ON public.screens FOR SELECT TO authenticated
  USING (tipo_tela = 'PARCEIRA' AND (SELECT public.get_user_role()) = 'REPRESENTANTE'
         AND empresa_operadora_id = (SELECT public.get_user_empresa_operadora_id(auth.uid())));

-- ---------------------------------------------------------------- anunciante / cliente / parceiro: só o permitido
DROP POLICY IF EXISTS externo_so_o_permitido ON public.screens;
CREATE POLICY externo_so_o_permitido ON public.screens AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT (SELECT public.fn_perfil_cliente_externo()) OR tipo_tela = 'PARCEIRA' OR user_id = (SELECT auth.uid())
         OR public.fn_tela_exibiu_midia_do_usuario(id));

DROP POLICY IF EXISTS externo_so_o_permitido ON public.devices;
CREATE POLICY externo_so_o_permitido ON public.devices AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT (SELECT public.fn_perfil_cliente_externo()) OR public.fn_externo_ve_tela(screen_id));

DROP POLICY IF EXISTS externo_so_o_permitido ON public.device_health;
CREATE POLICY externo_so_o_permitido ON public.device_health AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT (SELECT public.fn_perfil_cliente_externo()) OR public.fn_externo_ve_aparelho(device_id));

DROP POLICY IF EXISTS externo_so_o_permitido ON public.playback_logs;
CREATE POLICY externo_so_o_permitido ON public.playback_logs AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT (SELECT public.fn_perfil_cliente_externo())
         OR media_id IN (SELECT m.id::text FROM public.media m WHERE m.user_id = (SELECT auth.uid())));
