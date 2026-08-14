-- ======================================================================
-- SOBRE MIDIA - MIGRATION 20260818: CNPJ/CPF OPCIONAL NO CADASTRO DE CLIENTE
-- ======================================================================
-- Objetivo: liberar o campo de documento (CNPJ/CPF) no cadastro de clientes.
-- Hoje public.empresas.cnpj e VARCHAR(18) NOT NULL UNIQUE (003_crm.sql):
-- o cadastro sem documento falha no NOT NULL e o segundo cliente sem
-- documento violaria o UNIQUE (empresas_cnpj_key) com '' duplicado.
-- Esta e a MENOR migration possivel: apenas remove o NOT NULL. O UNIQUE e
-- mantido (PostgreSQL permite varios NULLs, entao clientes sem documento
-- coexistem sem violar a constraint).
-- O frontend envia p_cnpj = null quando o campo esta vazio; a RPC
-- fn_cadastrar_cliente_atomo ja aceita o parametro e o INSERT de NULL passa.
-- Idempotente: DROP NOT NULL sobre coluna ja nullable e no-op.
-- ======================================================================

ALTER TABLE public.empresas ALTER COLUMN cnpj DROP NOT NULL;