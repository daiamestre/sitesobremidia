-- F-183: o Player pergunta pela versão mais nova do aplicativo mesmo SEM login.
--
-- Antes só quem tinha sessão (papel "authenticated") lia app_releases. Aparelho parado na tela de entrada (sessão
-- vencida ou derrubada) não conseguia nem saber que existia versão nova, então nunca se atualizava sozinho.
-- A informação (número da versão, endereço público do APK e o SHA-256 dele) já é pública: o APK fica numa release
-- aberta do GitHub e no armazenamento público. Esta função devolve SÓ esses campos da última versão, nada mais, e não
-- abre a tabela: app_releases continua sem leitura para visitantes.
CREATE OR REPLACE FUNCTION public.get_latest_app_release()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(r)
    FROM (
      SELECT id, version_code, version_name, apk_url, release_notes, is_mandatory, sha256
        FROM public.app_releases
       ORDER BY version_code DESC
       LIMIT 1
    ) r;
$$;

REVOKE ALL ON FUNCTION public.get_latest_app_release() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_latest_app_release() TO anon, authenticated;
