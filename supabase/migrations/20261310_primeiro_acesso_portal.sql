-- F-164 — Boas-vindas do portal só no PRIMEIRO dia: guarda quando cada usuário abriu o portal pela primeira vez.
-- Depois de 24 h o portal cumprimenta com "Olá, <estabelecimento> — Bom dia / Boa tarde / Boa noite".
--   * tabela própria portal_primeiro_acesso (uma linha por usuário). Não toca na tabela usuarios, que tem vários gatilhos
--     de proteção (conta OWNER, auditoria, escalada de permissão);
--   * quem já tinha entrado antes desta mudança não recebe as boas-vindas de novo: o primeiro acesso vira a data mais antiga
--     entre o cadastro e o último login; quem nunca entrou fica sem linha e ganha as boas-vindas no primeiro login;
--   * portal_registrar_primeiro_acesso(): grava now() só se ainda não houver linha e devolve a data — cada usuário só
--     enxerga e cria a própria linha (auth.uid()); o navegador não escreve na tabela (ela fica fechada).
CREATE TABLE IF NOT EXISTS public.portal_primeiro_acesso (
  usuario_id uuid PRIMARY KEY REFERENCES public.usuarios(id) ON DELETE CASCADE,
  primeiro_acesso_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.portal_primeiro_acesso ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portal_primeiro_acesso FROM public, anon, authenticated;

INSERT INTO public.portal_primeiro_acesso (usuario_id, primeiro_acesso_em)
SELECT u.id, least(a.last_sign_in_at, u.created_at)
  FROM public.usuarios u JOIN auth.users a ON a.id = u.id
 WHERE a.last_sign_in_at IS NOT NULL
ON CONFLICT (usuario_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.portal_registrar_primeiro_acesso()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_quando timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.portal_primeiro_acesso (usuario_id)
  SELECT u.id FROM public.usuarios u WHERE u.id = auth.uid()
  ON CONFLICT (usuario_id) DO NOTHING;
  SELECT primeiro_acesso_em INTO v_quando FROM public.portal_primeiro_acesso WHERE usuario_id = auth.uid();
  RETURN v_quando;
END;
$$;

REVOKE ALL ON FUNCTION public.portal_registrar_primeiro_acesso() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.portal_registrar_primeiro_acesso() TO authenticated;
