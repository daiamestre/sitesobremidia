-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 008: TRIGGERS AUTOMÁTICOS & SUPABASE RLS POLICIES
-- ======================================================================

-- 1. Trigger de Atualização Automática de updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Aplicando Triggers de updated_at em Tabelas Principais
CREATE OR REPLACE TRIGGER trg_empresa_operadora_updated_at BEFORE UPDATE ON public.empresa_operadora FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE OR REPLACE TRIGGER trg_usuarios_updated_at BEFORE UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE OR REPLACE TRIGGER trg_representantes_updated_at BEFORE UPDATE ON public.representantes FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE OR REPLACE TRIGGER trg_clientes_updated_at BEFORE UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE OR REPLACE TRIGGER trg_empresas_updated_at BEFORE UPDATE ON public.empresas FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE OR REPLACE TRIGGER trg_contratos_updated_at BEFORE UPDATE ON public.contratos FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE OR REPLACE TRIGGER trg_campanhas_updated_at BEFORE UPDATE ON public.campanhas FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 2. Ativação de RLS (Row Level Security) em Todas as Tabelas Apropriadas
ALTER TABLE public.empresa_operadora ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes_empresa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.representantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propostas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_versoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_lancamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cobrancas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comissoes_representantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campanhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.biblioteca_midias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_visitas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_logs ENABLE ROW LEVEL SECURITY;

-- 3. Políticas RLS de Isolamento por Empresa Operadora (Multi-Tenant)

-- Função auxiliar para extrair a empresa_operadora do token JWT
CREATE OR REPLACE FUNCTION public.get_tenant_id()
RETURNS UUID AS $$
BEGIN
  RETURN (auth.jwt() ->> 'empresa_operadora_id')::UUID;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- Policy: Admin tem acesso completo
CREATE POLICY p_admin_all ON public.empresa_operadora FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.usuarios u
    JOIN public.perfis p ON p.id = u.perfil_id
    WHERE u.id = auth.uid() AND p.nome = 'ADMIN'
  )
);

-- Policy: Representantes acessam apenas seus próprios clientes
CREATE POLICY p_representante_clientes ON public.clientes FOR ALL TO authenticated USING (
  empresa_operadora_id = public.get_tenant_id() AND
  EXISTS (
    SELECT 1 FROM public.representantes r
    WHERE r.id = clientes.representante_id AND r.usuario_id = auth.uid()
  )
);

-- Policy: Contratos acessíveis apenas dentro da mesma Operadora
CREATE POLICY p_tenant_contratos ON public.contratos FOR ALL TO authenticated USING (
  empresa_operadora_id = public.get_tenant_id()
);

-- Policy: Players de exibição possuem leitura de mídias ativas da operadora
CREATE POLICY p_players_read_campanhas ON public.campanhas FOR SELECT TO anon, authenticated USING (
  status = 'ACTIVE'
);
