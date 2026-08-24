-- Complemento 20260826b: cobranças internas (telas de gestor, serviços de plataforma)
-- não possuem cliente/contrato comercial; FKs preservadas, apenas nullable.
ALTER TABLE public.contas_receber ALTER COLUMN contrato_id DROP NOT NULL;
ALTER TABLE public.contas_receber ALTER COLUMN cliente_id DROP NOT NULL;
SELECT 'complemento aplicado' AS status;
