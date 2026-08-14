-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 20260813: OWNER PODE CRIAR CLIENTES SEM REPRESENTANTE
-- ======================================================================
-- Objetivo: Permitir que OWNER/DONO crie clientes, empresas, contatos e
-- propostas sem depender de registro na tabela representantes.
-- Representante continua sendo obrigatório para REPRESENTANTE comum.
-- Idempotente: usa IF EXISTS / IF NOT EXISTS.

-- 1. Tornar representante_id nullable na tabela clientes
ALTER TABLE public.clientes ALTER COLUMN representante_id DROP NOT NULL;

-- 2. Tornar representante_id nullable na tabela propostas
ALTER TABLE public.propostas ALTER COLUMN representante_id DROP NOT NULL;

-- 3. Recriar RLS de clientes com suporte a OWNER via is_owner
-- SELECT
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

-- INSERT
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

-- UPDATE
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

-- DELETE permanece apenas para ADMIN/GERENTE (sem OWNER)
-- Owner nao deve deletar clientes diretamente

-- 4. Recriar RLS de propostas com suporte a OWNER
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
