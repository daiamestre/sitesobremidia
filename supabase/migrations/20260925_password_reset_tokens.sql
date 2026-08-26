-- ======================================================================
-- Tabela para tokens de recuperação de senha (server-side only)
-- ======================================================================

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_usuario ON public.password_reset_tokens(usuario_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON public.password_reset_tokens(token_expires_at) WHERE used_at IS NULL;

ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'password_reset_tokens' AND policyname = 'prt_service_role_all'
  ) THEN
    CREATE POLICY prt_service_role_all ON public.password_reset_tokens
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_password_reset_tokens()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.password_reset_tokens
  WHERE token_expires_at < NOW() OR used_at IS NOT NULL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_password_reset_tokens() TO service_role;