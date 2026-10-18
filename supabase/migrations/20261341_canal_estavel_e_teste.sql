-- F-198 — Regra do dono (18/10): o Player 5.7.10 é a versão COMERCIAL (estável). Toda versão nova do APK sai primeiro
-- como TESTE e NUNCA atualiza sozinha os aparelhos instalados; só vai para os aparelhos depois de promovida a estável
-- (node scripts/ops/publicar-player.mjs --promover <codigo>). O Player consulta get_latest_app_release(): ela passa a
-- devolver só o canal estável. Aparelho de teste com APK de teste instalado à mão não é "rebaixado" (o Player só
-- instala versão MAIOR que a dele).
-- Rollback: get_latest_app_release sem o filtro de canal; ALTER TABLE app_releases DROP COLUMN canal.
ALTER TABLE public.app_releases ADD COLUMN IF NOT EXISTS canal text NOT NULL DEFAULT 'estavel';
ALTER TABLE public.app_releases DROP CONSTRAINT IF EXISTS app_releases_canal_check;
ALTER TABLE public.app_releases ADD CONSTRAINT app_releases_canal_check CHECK (canal IN ('estavel', 'teste'));
-- versão nova entra como TESTE por padrão (quem quiser estável tem de dizer)
ALTER TABLE public.app_releases ALTER COLUMN canal SET DEFAULT 'teste';

CREATE OR REPLACE FUNCTION public.get_latest_app_release()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT to_jsonb(r)
    FROM (
      SELECT id, version_code, version_name, apk_url, release_notes, is_mandatory, sha256
        FROM public.app_releases
       WHERE canal = 'estavel'
       ORDER BY version_code DESC
       LIMIT 1
    ) r;
$function$;
