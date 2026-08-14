-- ======================================================================
-- SOBRE MIDIA - MIGRATION CONSOLIDADA: OWNER CLIENTE SEM REPRESENTANTE
-- ======================================================================
-- Data: 2026-08-13
-- Status: CRITICA - Corrige erro "null value in column representante_id"
-- Idempotente: pode ser executada multiplas vezes sem efeito colateral
--
-- INSTRUCOES: Copie e cole TODO este bloco no SQL Editor do Supabase Dashboard
--             e clique em "Run". Nao e necessario Supabase CLI.
-- ======================================================================

-- 1. Tornar representante_id nullable na tabela clientes
ALTER TABLE public.clientes ALTER COLUMN representante_id DROP NOT NULL;

-- 2. Tornar representante_id nullable na tabela propostas
ALTER TABLE public.propostas ALTER COLUMN representante_id DROP NOT NULL;

-- 3. RPC: fn_cadastrar_cliente_atomo aceita representante nullable
CREATE OR REPLACE FUNCTION public.fn_cadastrar_cliente_atomo(
  p_empresa_operadora_id UUID,
  p_representante_id UUID DEFAULT NULL,
  p_status VARCHAR(30) DEFAULT 'PROSPECT',
  p_razao_social VARCHAR(150),
  p_nome_fantasia VARCHAR(150),
  p_cnpj VARCHAR(18),
  p_segmento VARCHAR(80) DEFAULT '',
  p_telefone VARCHAR(20) DEFAULT '',
  p_whatsapp VARCHAR(20),
  p_email VARCHAR(255),
  p_cep VARCHAR(9) DEFAULT '',
  p_logradouro VARCHAR(150) DEFAULT '',
  p_numero VARCHAR(20) DEFAULT '',
  p_complemento VARCHAR(50) DEFAULT '',
  p_bairro VARCHAR(100) DEFAULT '',
  p_cidade VARCHAR(100),
  p_estado VARCHAR(2),
  p_representante_legal VARCHAR(150) DEFAULT '',
  p_cargo_representante VARCHAR(80) DEFAULT '',
  p_observacoes TEXT DEFAULT '',
  p_contato_nome VARCHAR(150) DEFAULT '',
  p_contato_cargo VARCHAR(80) DEFAULT '',
  p_contato_email VARCHAR(255) DEFAULT '',
  p_contato_telefone VARCHAR(20) DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lock_key BIGINT;
  v_next_code INT;
  v_cliente_id UUID;
  v_empresa_id UUID;
  v_contato_id UUID;
BEGIN
  v_lock_key := hashtext('cliente_code_' || p_empresa_operadora_id::text);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(MAX(codigo_cliente), 0) + 1
  INTO v_next_code
  FROM public.clientes
  WHERE empresa_operadora_id = p_empresa_operadora_id;

  INSERT INTO public.clientes (
    empresa_operadora_id, representante_id, codigo_cliente, status
  ) VALUES (
    p_empresa_operadora_id, p_representante_id, v_next_code, COALESCE(p_status, 'PROSPECT')
  ) RETURNING id INTO v_cliente_id;

  INSERT INTO public.empresas (
    cliente_id, razao_social, nome_fantasia, cnpj, segmento,
    telefone, whatsapp, email, cep, logradouro, numero, complemento,
    bairro, cidade, estado, representante_legal, cargo_representante, observacoes
  ) VALUES (
    v_cliente_id, COALESCE(p_razao_social, p_nome_fantasia),
    p_nome_fantasia, p_cnpj, p_segmento,
    p_telefone, p_whatsapp, p_email, p_cep, p_logradouro, p_numero, p_complemento,
    p_bairro, p_cidade, p_estado, p_representante_legal, p_cargo_representante, p_observacoes
  ) RETURNING id INTO v_empresa_id;

  IF p_contato_nome IS NOT NULL AND p_contato_nome <> '' THEN
    INSERT INTO public.contatos (
      empresa_id, nome, cargo, email, telefone, is_principal
    ) VALUES (
      v_empresa_id, p_contato_nome,
      COALESCE(p_contato_cargo, 'Responsavel'),
      COALESCE(p_contato_email, p_email),
      COALESCE(p_contato_telefone, p_whatsapp),
      TRUE
    ) RETURNING id INTO v_contato_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'cliente_id', v_cliente_id,
    'empresa_id', v_empresa_id,
    'contato_id', v_contato_id,
    'codigo_cliente', v_next_code
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- 4. RLS clientes: INSERT permite OWNER com representante NULL
DROP POLICY IF EXISTS p_rep_clientes_insert ON public.clientes;
CREATE POLICY p_rep_clientes_insert ON public.clientes
FOR INSERT TO authenticated
WITH CHECK (
  representante_id IN (
    SELECT r.id FROM public.representantes r WHERE r.usuario_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM public.usuarios u
    JOIN public.perfis p ON p.id = u.perfil_id
    WHERE u.id = auth.uid() AND (
      p.nome IN ('ADMIN', 'GERENTE')
      OR u.is_owner = true
    )
  )
  OR
  (representante_id IS NULL AND EXISTS (
    SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.is_owner = true
  ))
);

-- 5. RLS clientes: SELECT permite OWNER
DROP POLICY IF EXISTS p_rep_clientes_read ON public.clientes;
CREATE POLICY p_rep_clientes_read ON public.clientes
FOR SELECT TO authenticated
USING (
  representante_id IN (
    SELECT r.id FROM public.representantes r WHERE r.usuario_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM public.usuarios u
    JOIN public.perfis p ON p.id = u.perfil_id
    WHERE u.id = auth.uid() AND (
      p.nome IN ('ADMIN', 'GERENTE')
      OR u.is_owner = true
    )
  )
);

-- 6. RLS clientes: UPDATE permite OWNER
DROP POLICY IF EXISTS p_rep_clientes_update ON public.clientes;
CREATE POLICY p_rep_clientes_update ON public.clientes
FOR UPDATE TO authenticated
USING (
  representante_id IN (
    SELECT r.id FROM public.representantes r WHERE r.usuario_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM public.usuarios u
    JOIN public.perfis p ON p.id = u.perfil_id
    WHERE u.id = auth.uid() AND (
      p.nome IN ('ADMIN', 'GERENTE')
      OR u.is_owner = true
    )
  )
);

-- 7. RLS propostas: INSERT permite OWNER com representante NULL
DROP POLICY IF EXISTS p_rep_propostas_insert ON public.propostas;
CREATE POLICY p_rep_propostas_insert ON public.propostas
FOR INSERT TO authenticated
WITH CHECK (
  representante_id IN (
    SELECT r.id FROM public.representantes r WHERE r.usuario_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM public.usuarios u
    JOIN public.perfis p ON p.id = u.perfil_id
    WHERE u.id = auth.uid() AND (
      p.nome IN ('ADMIN', 'GERENTE')
      OR u.is_owner = true
    )
  )
  OR
  (representante_id IS NULL AND EXISTS (
    SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.is_owner = true
  ))
);

-- 8. RLS propostas: SELECT permite OWNER
DROP POLICY IF EXISTS p_rep_propostas_read ON public.propostas;
CREATE POLICY p_rep_propostas_read ON public.propostas
FOR SELECT TO authenticated
USING (
  representante_id IN (
    SELECT r.id FROM public.representantes r WHERE r.usuario_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM public.usuarios u
    JOIN public.perfis p ON p.id = u.perfil_id
    WHERE u.id = auth.uid() AND (
      p.nome IN ('ADMIN', 'GERENTE')
      OR u.is_owner = true
    )
  )
);
