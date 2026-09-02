-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261207
-- GATE GLOBAL-RLS-08: HARDENING CONTROLADO LOTE 4A (NÚCLEO COMERCIAL)
--
-- Escopo Exclusivo (Tabelas Primárias):
--   1. public.pedidos_insercao — Eliminar policy permissiva "Enable read for active PIs" (fn_can_access_data)
--                                Preservar policy canônica "pi_tenant_isolation"
--   2. public.playlists        — Eliminar policy permissiva "Enable read for active playlist users" (can_access_midia)
--                                Preservar policies "Users can * their own playlists"
--   3. public.contratos        — Eliminar policy permissiva "Enable read for active contracts" (can_read_contrato)
--                                Preservar policies canônicas "ctr_select_policy" e "ctr_write_policy"
--   4. public.clientes         — Eliminar policies permissivas/redundantes "Enable read for active authenticated users",
--                                "p_rep_clientes_read", "p_rep_clientes_insert", "p_rep_clientes_update"
--                                Preservar policies canônicas "cli_select_policy" e "cli_write_policy"
--
-- Idempotente via DO $$ ... DROP POLICY IF EXISTS ... END $$;
-- ======================================================================

-- ----------------------------------------------------------------------
-- 1. TABELA: public.pedidos_insercao
-- ----------------------------------------------------------------------
ALTER TABLE public.pedidos_insercao ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'pedidos_insercao'
      AND policyname = 'Enable read for active PIs'
  ) THEN
    DROP POLICY "Enable read for active PIs" ON public.pedidos_insercao;
  END IF;
  -- Preserva: "pi_tenant_isolation" (CMD: ALL, isolamento hermético por empresa_operadora_id)
END $$;


-- ----------------------------------------------------------------------
-- 2. TABELA: public.playlists
-- ----------------------------------------------------------------------
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'playlists'
      AND policyname = 'Enable read for active playlist users'
  ) THEN
    DROP POLICY "Enable read for active playlist users" ON public.playlists;
  END IF;
  -- Preserva: "Users can view their own playlists", "Users can insert...", "Users can update...", "Users can delete..."
END $$;


-- ----------------------------------------------------------------------
-- 3. TABELA: public.contratos
-- ----------------------------------------------------------------------
ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'contratos'
      AND policyname = 'Enable read for active contracts'
  ) THEN
    DROP POLICY "Enable read for active contracts" ON public.contratos;
  END IF;
  -- Preserva: "ctr_select_policy" e "ctr_write_policy" (isolamento hermético por tenant e roles autorizadas)
END $$;


-- ----------------------------------------------------------------------
-- 4. TABELA: public.clientes
-- ----------------------------------------------------------------------
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'clientes'
      AND policyname = 'Enable read for active authenticated users'
  ) THEN
    DROP POLICY "Enable read for active authenticated users" ON public.clientes;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'clientes'
      AND policyname = 'p_rep_clientes_read'
  ) THEN
    DROP POLICY "p_rep_clientes_read" ON public.clientes;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'clientes'
      AND policyname = 'p_rep_clientes_insert'
  ) THEN
    DROP POLICY "p_rep_clientes_insert" ON public.clientes;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'clientes'
      AND policyname = 'p_rep_clientes_update'
  ) THEN
    DROP POLICY "p_rep_clientes_update" ON public.clientes;
  END IF;
  -- Preserva: "cli_select_policy" e "cli_write_policy" (isolamento hermético por tenant e roles autorizadas)
END $$;
