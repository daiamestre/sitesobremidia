-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 029: CONTRACT REAL DOCUMENT STORAGE & SIGNING
-- ======================================================================

-- 1. Adiciona colunas para documento assinado e link com assinatura
ALTER TABLE public.contratos 
  ADD COLUMN IF NOT EXISTS pdf_assinado_key TEXT,
  ADD COLUMN IF NOT EXISTS assinatura_id UUID REFERENCES public.assinaturas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;

-- 1a. Adiciona colunas de signatário e token ao envelope de assinatura digital
ALTER TABLE public.assinaturas 
  ADD COLUMN IF NOT EXISTS signatario_nome VARCHAR(150),
  ADD COLUMN IF NOT EXISTS signatario_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS signatario_cpf_cnpj VARCHAR(20),
  ADD COLUMN IF NOT EXISTS secure_token TEXT,
  ADD COLUMN IF NOT EXISTS signed_document_hash TEXT;

-- 2. Cria bucket de storage privado para documentos de contrato
INSERT INTO storage.buckets (id, name, public)
VALUES ('contratos', 'contratos', false)
ON CONFLICT (id) DO NOTHING;

-- 3. Políticas RLS para storage.objects no bucket 'contratos'
--    Leitura: apenas membros do tenant (representante do contrato ou admin)
--    Upload/Delete: apenas OWNER/ADMIN (via service role no edge function)
DO $$
BEGIN
  -- SELECT policy - membros do tenant podem ler arquivos de contratos
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'ctr_storage_select'
  ) THEN
    CREATE POLICY "ctr_storage_select"
      ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'contratos'
        AND (
          -- O usuário é do mesmo tenant que possui o contrato
          (storage.foldername(name))[1] IN (
            SELECT empresa_operadora_id::text FROM public.contratos c
            WHERE c.pdf_object_key = storage.foldername(name)[2] || '/' || (storage.foldername(name))[3]
              AND c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
          )
          OR
          -- Usuário é OWNER/ADMIN
          public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'SUPERVISOR')
        )
      );
  END IF;

  -- INSERT policy - upload via service role (edge function usa service_role key)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'ctr_storage_insert'
  ) THEN
    CREATE POLICY "ctr_storage_insert"
      ON storage.objects FOR INSERT TO service_role
      WITH CHECK (bucket_id = 'contratos');
  END IF;

  -- UPDATE policy - apenas OWNER/ADMIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'ctr_storage_update'
  ) THEN
    CREATE POLICY "ctr_storage_update"
      ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = 'contratos'
        AND (
          public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'SUPERVISOR')
        )
      );
  END IF;

  -- DELETE policy - apenas OWNER/ADMIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'ctr_storage_delete'
  ) THEN
    CREATE POLICY "ctr_storage_delete"
      ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'contratos'
        AND (
          public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'SUPERVISOR')
        )
      );
  END IF;
END $$;

-- 4. Índices para performance de consultas de contrato
CREATE INDEX IF NOT EXISTS idx_contratos_pdf_object_key ON public.contratos(pdf_object_key);
CREATE INDEX IF NOT EXISTS idx_contratos_pdf_assinado_key ON public.contratos(pdf_assinado_key);
CREATE INDEX IF NOT EXISTS idx_contratos_assinatura_id ON public.contratos(assinatura_id);
CREATE INDEX IF NOT EXISTS idx_assinaturas_contrato_id_status ON public.assinaturas(contrato_id, status);
