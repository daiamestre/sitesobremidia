-- MEU PERFIL: avatars bucket + RLS + hardening self-update

-- Bucket avatars (public read, authenticated write scoped to own folder)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage policies for avatars
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='avatars_public_read') THEN
    CREATE POLICY avatars_public_read ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='avatars_self_insert') THEN
    CREATE POLICY avatars_self_insert ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id='avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='avatars_self_update') THEN
    CREATE POLICY avatars_self_update ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id='avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='avatars_self_delete') THEN
    CREATE POLICY avatars_self_delete ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id='avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;

-- Usuarios self-update: allow only own row, and block protected columns via trigger
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='usuarios' AND policyname='usuarios_self_select') THEN
    CREATE POLICY usuarios_self_select ON public.usuarios FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_central_privileged());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='usuarios' AND policyname='usuarios_self_update') THEN
    CREATE POLICY usuarios_self_update ON public.usuarios FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());
  END IF;
END $$;

-- Trigger to prevent tampering of protected columns on self-update
CREATE OR REPLACE FUNCTION public.check_meu_perfil_update()
RETURNS TRIGGER AS $$
BEGIN
  -- only enforce for non-privileged self-update (owner/admin bypass)
  IF auth.uid() = OLD.id AND NOT public.is_central_privileged() THEN
    IF NEW.empresa_operadora_id IS DISTINCT FROM OLD.empresa_operadora_id THEN
      RAISE EXCEPTION 'Alteração de empresa_operadora_id não permitida.' USING ERRCODE='42501';
    END IF;
    IF NEW.perfil_id IS DISTINCT FROM OLD.perfil_id THEN
      RAISE EXCEPTION 'Alteração de perfil não permitida.' USING ERRCODE='42501';
    END IF;
    IF NEW.cliente_id IS DISTINCT FROM OLD.cliente_id THEN
      RAISE EXCEPTION 'Alteração de cliente_id não permitida.' USING ERRCODE='42501';
    END IF;
    IF NEW.is_owner IS DISTINCT FROM OLD.is_owner THEN
      RAISE EXCEPTION 'Alteração de owner não permitida.' USING ERRCODE='42501';
    END IF;
    IF NEW.ativo IS DISTINCT FROM OLD.ativo AND OLD.ativo IS NOT NULL THEN
      RAISE EXCEPTION 'Alteração de ativo não permitida via Meu Perfil.' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public;

DROP TRIGGER IF EXISTS trg_check_meu_perfil_update ON public.usuarios;
CREATE TRIGGER trg_check_meu_perfil_update BEFORE UPDATE ON public.usuarios
FOR EACH ROW EXECUTE FUNCTION public.check_meu_perfil_update();
