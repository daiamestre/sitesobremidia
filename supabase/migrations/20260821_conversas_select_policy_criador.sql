-- Fix: conversas SELECT policy must allow the creator to see the conversation
-- even before participants are inserted (PostgREST INSERT ... RETURNING is
-- subject to the SELECT policy, and criarConversa inserts participants after).

DROP POLICY IF EXISTS conv_select_policy ON public.conversas;

CREATE POLICY conv_select_policy ON public.conversas
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_tenant_id()
    AND (public.is_conversa_participante(id) OR criado_por = auth.uid())
  );

-- Cleanup rows created during RLS debugging
DELETE FROM public.conversa_participantes WHERE conversa_id IN (
  SELECT id FROM public.conversas WHERE nome IS NULL AND criado_por = '12345678-1234-1234-1234-123456789012' AND NOT EXISTS (
    SELECT 1 FROM public.conversa_mensagens m WHERE m.conversa_id = conversas.id
  )
);
DELETE FROM public.conversas WHERE nome IS NULL AND criado_por = '12345678-1234-1234-1234-123456789012' AND NOT EXISTS (
  SELECT 1 FROM public.conversa_mensagens m WHERE m.conversa_id = conversas.id
);