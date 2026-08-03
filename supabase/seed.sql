-- ======================================================================
-- SOBRE MÍDIA - SEED INICIAL: PERFIS, SERVICES & TENANT DEFAULT
-- ======================================================================

-- 1. Inserção de Perfis Globais
INSERT INTO public.perfis (id, nome, descricao, ativo) VALUES
('00000000-0000-0000-0000-000000000001', 'ADMIN', 'Administrador Geral do Sistema', TRUE),
('00000000-0000-0000-0000-000000000002', 'GERENTE', 'Gerente Comercial de Mídia', TRUE),
('00000000-0000-0000-0000-000000000003', 'FINANCEIRO', 'Gestão Financeira e Cobranças', TRUE),
('00000000-0000-0000-0000-000000000004', 'DESIGNER', 'Equipe de Criação e Arte 3D', TRUE),
('00000000-0000-0000-0000-000000000005', 'REPRESENTANTE', 'Representante Comercial Parceiro', TRUE),
('00000000-0000-0000-0000-000000000006', 'OPERACIONAL', 'Técnico de Instalação e Hardware', TRUE),
('00000000-0000-0000-0000-000000000007', 'CLIENTE', 'Acesso de Visualização pelo Cliente', TRUE)
ON CONFLICT (nome) DO NOTHING;

-- 2. Tenant Padrão (Sobre Mídia Matriz)
INSERT INTO public.empresa_operadora (id, nome, nome_fantasia, cnpj, email, telefone, status) VALUES
('11111111-1111-1111-1111-111111111111', 'Sobre Mídia Tecnologia LTDA', 'Sobre Mídia', '00.000.000/0001-00', 'contato@sobremidia.com.br', '(11) 99999-9999', 'ACTIVE')
ON CONFLICT (cnpj) DO NOTHING;

-- 3. Catálogo Inicial de Serviços
INSERT INTO public.catalogo_servicos (id, empresa_operadora_id, codigo_servico, nome, descricao, valor_tabela) VALUES
('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111111', 'VEICULACAO_INDOOR', 'Veiculação Mídia Indoor TV 15s', 'Exibição de vinheta de 15s na rede de telas indoor', 250.00),
('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111111', 'PAINEL_LED', 'Veiculação Painel LED Outdoor 15s', 'Exibição de vinheta em painel de LED urbano', 450.00),
('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111111', 'PRODUCAO_ARTE', 'Produção de Arte Visual Motion 3D', 'Criação de vinheta publicitária animada em 3D', 350.00),
('22222222-2222-2222-2222-222222222204', '11111111-1111-1111-1111-111111111111', 'QR_CODE_DINAMICO', 'QR Code Dinâmico com Relatório BI', 'Rastreamento de engajamento de leituras via QR Code', 80.00),
('22222222-2222-2222-2222-222222222205', '11111111-1111-1111-1111-111111111111', 'LOCUCAO_PROFISSIONAL', 'Locução Comercial Profissional', 'Gravação de voz com locutor de estúdio', 150.00)
ON CONFLICT (empresa_operadora_id, codigo_servico) DO NOTHING;

-- 4. Planos Comerciais
INSERT INTO public.planos (id, empresa_operadora_id, tipo, nome, duracao_meses, desconto_porcentagem) VALUES
('33333333-3333-3333-3333-333333333301', '11111111-1111-1111-1111-111111111111', 'MONTHLY', 'Plano Mensal', 1, 0.00),
('33333333-3333-3333-3333-333333333302', '11111111-1111-1111-1111-111111111111', 'QUARTERLY', 'Plano Trimestral (5% Desc)', 3, 5.00),
('33333333-3333-3333-3333-333333333303', '11111111-1111-1111-1111-111111111111', 'SEMIANNUAL', 'Plano Semestral (10% Desc)', 6, 10.00),
('33333333-3333-3333-3333-333333333304', '11111111-1111-1111-1111-111111111111', 'ANNUAL', 'Plano Anual (15% Desc)', 12, 15.00)
ON CONFLICT (empresa_operadora_id, tipo) DO NOTHING;

-- 5. Feature Flags Base
INSERT INTO public.feature_flags (id, chave, descricao, ativo_global) VALUES
('44444444-4444-4444-4444-444444444401', 'MODULO_CRM_REPRESENTANTES', 'Habilita o módulo de representantes comerciais', TRUE),
('44444444-4444-4444-4444-444444444402', 'ASSINATURA_DIGITAL_AUTO', 'Habilita a coleta de assinatura eletrônica do contrato', TRUE),
('44444444-4444-4444-4444-444444444403', 'NOTIFICACOES_WHATSAPP', 'Disparo de cobranças e notificações via WhatsApp API', TRUE),
('44444444-4444-4444-4444-444444444404', 'AGENDA_GPS_CHECKIN', 'Exige validação de geolocalização no check-in de visitas', TRUE)
ON CONFLICT (chave) DO NOTHING;
