-- F-139 — Assinatura da SOBRE MÍDIA (dono ou administrador) nos contratos.
-- Antes só existia a assinatura do cliente. Agora o dono/administrador pode assinar pela empresa na hora do cadastro
-- (anunciante, gestor de mídias, ponto parceiro) ou deixar para depois; a Central de Assinatura mostra a fila
-- "Aguardando assinatura Sobre Mídia" e coleta a assinatura ali.

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS empresa_assinado_em timestamptz,
  ADD COLUMN IF NOT EXISTS empresa_assinado_por uuid,
  ADD COLUMN IF NOT EXISTS empresa_signatario_nome text;
COMMENT ON COLUMN public.contratos.empresa_assinado_em IS 'F-139: quando a Sobre Mídia (dono/administrador) assinou o contrato.';

-- A imagem da assinatura fica numa tabela à parte (não pesa nas listas de contratos). Só o servidor grava.
CREATE TABLE IF NOT EXISTS public.contrato_assinatura_empresa (
  contrato_id uuid PRIMARY KEY REFERENCES public.contratos(id) ON DELETE CASCADE,
  empresa_operadora_id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  signatario_nome text NOT NULL,
  metodo text NOT NULL CHECK (metodo IN ('DRAWN', 'TYPED')),
  imagem_data_url text,
  user_agent text,
  assinado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contrato_assinatura_empresa ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contrato_assinatura_empresa FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.contrato_assinatura_empresa FROM authenticated;
GRANT SELECT ON public.contrato_assinatura_empresa TO authenticated;
DROP POLICY IF EXISTS assinatura_empresa_leitura ON public.contrato_assinatura_empresa;
CREATE POLICY assinatura_empresa_leitura ON public.contrato_assinatura_empresa FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contratos c WHERE c.id = contrato_assinatura_empresa.contrato_id));

-- A auditoria de contratos passa a aceitar o evento da assinatura da empresa.
ALTER TABLE public.contrato_auditoria DROP CONSTRAINT IF EXISTS contrato_auditoria_evento_check;
ALTER TABLE public.contrato_auditoria ADD CONSTRAINT contrato_auditoria_evento_check CHECK (evento::text = ANY (ARRAY[
  'CONTRATO_SELECIONADO', 'CONTRATO_PDF_GERADO', 'CONTRATO_REENVIADO', 'CONTRATO_CANCELADO', 'CONTRATO_DOCUMENTO_GERADO',
  'CONTRATO_DOCUMENTO_ARMAZENADO', 'CONTRATO_ENVIADO_ASSINATURA', 'CONTRATO_VISUALIZADO', 'CONTRATO_ASSINADO',
  'DOCUMENTO_BAIXADO', 'CONTRATO_SUBSTITUIDO', 'CONTRATO_VERSIONADO', 'CONTRATO_ASSINADO_EMPRESA']));

-- Dono/administrador assina pela empresa. Uma vez só por contrato.
CREATE OR REPLACE FUNCTION public.fn_assinar_contrato_pela_empresa(p_contrato uuid, p_dados jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant uuid;
  c record;
  v_nome text;
  v_metodo text := upper(coalesce(p_dados->>'metodo', 'DRAWN'));
  v_imagem text := p_dados->>'imagem';
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'É preciso estar logado.' USING ERRCODE = '42501'; END IF;
  IF NOT public.fn_eh_owner_ou_admin() THEN
    RAISE EXCEPTION 'Só o dono ou o administrador assina pela Sobre Mídia.' USING ERRCODE = '42501';
  END IF;
  v_tenant := public.get_user_empresa_operadora_id(v_uid);
  SELECT id, empresa_operadora_id, empresa_assinado_em, numero_contrato INTO c
    FROM public.contratos WHERE id = p_contrato AND deleted_at IS NULL FOR UPDATE;
  IF c.id IS NULL OR c.empresa_operadora_id IS DISTINCT FROM v_tenant THEN
    RAISE EXCEPTION 'Contrato não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF c.empresa_assinado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Este contrato já foi assinado pela Sobre Mídia.' USING ERRCODE = 'P0001';
  END IF;
  IF v_metodo NOT IN ('DRAWN', 'TYPED') THEN v_metodo := 'DRAWN'; END IF;
  IF v_imagem IS NOT NULL AND (length(v_imagem) > 400000 OR v_imagem !~ '^data:image/(png|jpeg);base64,') THEN
    RAISE EXCEPTION 'Imagem da assinatura inválida.' USING ERRCODE = '22023';
  END IF;
  v_nome := nullif(btrim(coalesce(p_dados->>'nome', '')), '');
  IF v_nome IS NULL THEN SELECT nome INTO v_nome FROM public.usuarios WHERE id = v_uid; END IF;
  IF v_nome IS NULL OR length(v_nome) < 3 THEN RAISE EXCEPTION 'Informe o nome de quem assina.' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.contrato_assinatura_empresa (contrato_id, empresa_operadora_id, usuario_id, signatario_nome, metodo, imagem_data_url, user_agent)
  VALUES (p_contrato, v_tenant, v_uid, v_nome, v_metodo, v_imagem, left(p_dados->>'user_agent', 400));
  UPDATE public.contratos SET empresa_assinado_em = now(), empresa_assinado_por = v_uid, empresa_signatario_nome = v_nome WHERE id = p_contrato;
  INSERT INTO public.contrato_auditoria (contrato_id, evento, usuario_id, detalhes)
  VALUES (p_contrato, 'CONTRATO_ASSINADO_EMPRESA', v_uid, jsonb_build_object('signatario', v_nome, 'metodo', v_metodo));
  RETURN jsonb_build_object('status', 'OK', 'signatario', v_nome, 'assinado_em', now());
END;
$$;
REVOKE ALL ON FUNCTION public.fn_assinar_contrato_pela_empresa(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_assinar_contrato_pela_empresa(uuid, jsonb) TO authenticated, service_role;

-- Fila da Central: contratos com documento que ainda não têm a assinatura da Sobre Mídia.
CREATE OR REPLACE FUNCTION public.fn_contratos_aguardando_empresa()
RETURNS TABLE (contrato_id uuid, numero_contrato text, tipo_contrato text, parte text, criado_em timestamptz, cliente_assinou_em timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT c.id, c.numero_contrato::text, c.tipo_contrato::text,
         coalesce(e.nome_fantasia, e.razao_social, po.nome, ug.nome, '—')::text,
         c.created_at, c.documento_assinado_em
    FROM public.contratos c
    LEFT JOIN LATERAL (SELECT x.nome_fantasia, x.razao_social FROM public.empresas x WHERE x.cliente_id = c.cliente_id AND x.deleted_at IS NULL ORDER BY x.created_at LIMIT 1) e ON true
    LEFT JOIN public.pontos po ON po.id = c.ponto_id
    LEFT JOIN public.usuarios ug ON ug.id = c.gestor_usuario_id
   WHERE public.fn_eh_owner_ou_admin()
     AND c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
     AND c.deleted_at IS NULL
     AND c.empresa_assinado_em IS NULL
     AND (c.pdf_object_key IS NOT NULL OR c.status_documento IS NOT NULL)
   ORDER BY c.created_at DESC
   LIMIT 300;
$$;
REVOKE ALL ON FUNCTION public.fn_contratos_aguardando_empresa() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_contratos_aguardando_empresa() TO authenticated, service_role;
