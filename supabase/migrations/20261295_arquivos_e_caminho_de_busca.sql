-- F-130 — Armazenamento de arquivos e caminho de busca das funções.
-- Achados:
--   * balde "media": qualquer usuário logado podia ALTERAR e APAGAR qualquer arquivo (inclusive de outro cliente);
--   * balde "proof_of_play" (público): visitante ANÔNIMO podia enviar arquivos (hospedagem indevida, encher o disco);
--   * balde "audit_logs": qualquer usuário logado listava os registros de auditoria enviados;
--   * 30 funções sem caminho de busca fixo (consultor do Supabase: function_search_path_mutable).

-- 1) media: cada um altera/apaga só o que enviou; dono e administrador mantêm a gestão.
DROP POLICY IF EXISTS "Authenticated users can delete" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update" ON storage.objects;
DROP POLICY IF EXISTS media_apaga_o_proprio ON storage.objects;
DROP POLICY IF EXISTS media_altera_o_proprio ON storage.objects;
CREATE POLICY media_apaga_o_proprio ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'media' AND (owner = auth.uid() OR public.fn_eh_owner_ou_admin()));
CREATE POLICY media_altera_o_proprio ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'media' AND (owner = auth.uid() OR public.fn_eh_owner_ou_admin()))
  WITH CHECK (bucket_id = 'media' AND (owner = auth.uid() OR public.fn_eh_owner_ou_admin()));

-- 2) proof_of_play: envio só logado e só da própria tela (regra pop_shot_insert_own, que já existe).
DROP POLICY IF EXISTS "Enable upload for valid screens" ON storage.objects;

-- 3) audit_logs: só dono/administrador lista.
DROP POLICY IF EXISTS "Permitir listagem de logs para usuários autenticados" ON storage.objects;
DROP POLICY IF EXISTS audit_logs_so_gestao_le ON storage.objects;
CREATE POLICY audit_logs_so_gestao_le ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'audit_logs' AND public.fn_eh_owner_ou_admin());

-- 4) Caminho de busca fixo (igual ao padrão do projeto: public + extensions) nas funções que não tinham.
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS assinatura FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.prokind = 'f'
              AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')
              AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')  -- não mexe em função de extensão
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path TO public, extensions, pg_temp', f.assinatura);
  END LOOP;
END $$;
