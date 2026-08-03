-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 006: PRODUÇÃO, MÍDIAS, REDE DE TELAS & PLAYERS
-- ======================================================================

-- 28. Designers
CREATE TABLE IF NOT EXISTS public.designers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  usuario_id UUID NOT NULL UNIQUE REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  especialidade VARCHAR(100),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 29. Ordens de Produção
CREATE TABLE IF NOT EXISTS public.ordens_producao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  contrato_id UUID NOT NULL REFERENCES public.contratos(id) ON DELETE RESTRICT,
  designer_id UUID REFERENCES public.designers(id) ON DELETE SET NULL,
  numero_op VARCHAR(40) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PRODUCTION', 'AWAITING_APPROVAL', 'APPROVED', 'REJECTED')),
  data_prazo DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(empresa_operadora_id, numero_op)
);

-- 30. Tarefas de Produção
CREATE TABLE IF NOT EXISTS public.tarefas_producao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_producao_id UUID NOT NULL REFERENCES public.ordens_producao(id) ON DELETE CASCADE,
  titulo VARCHAR(150) NOT NULL,
  descricao TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'TODO',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 31. Campanhas
CREATE TABLE IF NOT EXISTS public.campanhas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  contrato_id UUID NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  codigo_campanha INT,
  numero_campanha VARCHAR(40),
  titulo VARCHAR(150) NOT NULL,
  objetivo TEXT,
  duracao_segundos INT NOT NULL DEFAULT 15 CHECK (duracao_segundos > 0),
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'REVIEW', 'APPROVED', 'ACTIVE', 'PAUSED', 'FINISHED')),
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.usuarios(id),
  updated_by UUID REFERENCES public.usuarios(id),
  version INT NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  delete_reason TEXT,
  UNIQUE(empresa_operadora_id, codigo_campanha)
);

-- 32. Artes da Campanha
CREATE TABLE IF NOT EXISTS public.artes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id UUID NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
  titulo VARCHAR(150) NOT NULL,
  tipo_midia VARCHAR(30) NOT NULL CHECK (tipo_midia IN ('IMAGE', 'VIDEO', 'MOTION', 'AUDIO', 'HTML5')),
  url_arquivo TEXT NOT NULL,
  thumbnail_url TEXT,
  duracao_segundos INT DEFAULT 15,
  versao_atual INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 33. Versões de Artes
CREATE TABLE IF NOT EXISTS public.campanha_arte_versoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  arte_id UUID NOT NULL REFERENCES public.artes(id) ON DELETE CASCADE,
  numero_versao INT NOT NULL,
  url_arquivo TEXT NOT NULL,
  thumbnail_url TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.usuarios(id),
  UNIQUE(arte_id, numero_versao)
);

-- 34. Aprovações do Cliente
CREATE TABLE IF NOT EXISTS public.aprovacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id UUID NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
  aprovado_por_nome VARCHAR(150) NOT NULL,
  aprovado_por_email VARCHAR(255) NOT NULL,
  status VARCHAR(30) NOT NULL CHECK (status IN ('APPROVED', 'REJECTED')),
  data_aprovacao TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  observacoes TEXT
);

-- 35. Revisões Solicitadas
CREATE TABLE IF NOT EXISTS public.revisoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id UUID NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
  solicitado_por_nome VARCHAR(150) NOT NULL,
  descricao_ajuste TEXT NOT NULL,
  concluido BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 36. Biblioteca de Mídias (DAM)
CREATE TABLE IF NOT EXISTS public.biblioteca_midias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  titulo VARCHAR(150) NOT NULL,
  tipo_midia VARCHAR(30) NOT NULL CHECK (tipo_midia IN ('IMAGEM', 'VIDEO', 'MOTION', 'AUDIO', 'PDF')),
  storage_url TEXT NOT NULL,
  thumbnail_url TEXT,
  resolucao VARCHAR(20),
  duracao_segundos INT DEFAULT 0,
  tamanho_bytes BIGINT NOT NULL DEFAULT 0,
  versao INT NOT NULL DEFAULT 1,
  metadados JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 37. Mídia Versões
CREATE TABLE IF NOT EXISTS public.midia_versoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  biblioteca_midia_id UUID NOT NULL REFERENCES public.biblioteca_midias(id) ON DELETE CASCADE,
  numero_versao INT NOT NULL,
  storage_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(biblioteca_midia_id, numero_versao)
);

-- 38. Redes de Estabelecimentos
CREATE TABLE IF NOT EXISTS public.redes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  nome VARCHAR(150) NOT NULL,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 39. Unidades / Lojas Físicas
CREATE TABLE IF NOT EXISTS public.unidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rede_id UUID NOT NULL REFERENCES public.redes(id) ON DELETE CASCADE,
  nome VARCHAR(150) NOT NULL,
  cidade VARCHAR(100) NOT NULL,
  estado VARCHAR(2) NOT NULL,
  endereco VARCHAR(200),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 40. Locais Internos
CREATE TABLE IF NOT EXISTS public.locais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id UUID NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
  nome VARCHAR(150) NOT NULL,
  descricao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 41. Telas Físicas
CREATE TABLE IF NOT EXISTS public.telas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  local_id UUID NOT NULL REFERENCES public.locais(id) ON DELETE RESTRICT,
  screen_code VARCHAR(30),
  nome_tela VARCHAR(150) NOT NULL,
  resolucao VARCHAR(20) NOT NULL DEFAULT '1920x1080',
  orientacao VARCHAR(20) NOT NULL DEFAULT 'landscape' CHECK (orientacao IN ('landscape', 'portrait')),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(empresa_operadora_id, screen_code)
);

-- 42. Equipamentos (Hardware Físico)
CREATE TABLE IF NOT EXISTS public.equipamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tela_id UUID UNIQUE REFERENCES public.telas(id) ON DELETE SET NULL,
  fabricante VARCHAR(100) NOT NULL,
  modelo VARCHAR(100) NOT NULL,
  serial_number VARCHAR(100) NOT NULL UNIQUE,
  mac_address VARCHAR(17) NOT NULL UNIQUE,
  sistema_operacional VARCHAR(50) NOT NULL,
  versao_firmware VARCHAR(50),
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 43. Players (Instância do Software Canônico)
CREATE TABLE IF NOT EXISTS public.players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  equipamento_id UUID UNIQUE REFERENCES public.equipamentos(id) ON DELETE SET NULL,
  player_key VARCHAR(100) NOT NULL UNIQUE,
  versao_app VARCHAR(30) NOT NULL,
  status_online BOOLEAN NOT NULL DEFAULT FALSE,
  ultima_comunicacao TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 44. Playlists (Grade de Exibição)
CREATE TABLE IF NOT EXISTS public.playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  campanha_id UUID NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
  ordem_exibicao INT NOT NULL DEFAULT 1 CHECK (ordem_exibicao > 0),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 45. Player Telemetria
CREATE TABLE IF NOT EXISTS public.player_telemetria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  ping_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cpu_usage NUMERIC(5,2),
  ram_usage NUMERIC(5,2),
  espaco_disco_livre_mb BIGINT,
  status_conexao VARCHAR(20) NOT NULL,
  log_mensagem TEXT
);

CREATE INDEX IF NOT EXISTS idx_telemetria_ping ON public.player_telemetria(player_id, ping_timestamp DESC);

-- 46. Player Histórico de Hardware
CREATE TABLE IF NOT EXISTS public.player_historico_hardware (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tela_id UUID NOT NULL REFERENCES public.telas(id) ON DELETE CASCADE,
  equipamento_anterior_id UUID REFERENCES public.equipamentos(id) ON DELETE SET NULL,
  equipamento_novo_id UUID REFERENCES public.equipamentos(id) ON DELETE SET NULL,
  motivo_troca TEXT NOT NULL,
  trocado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trocado_por_usuario_id UUID REFERENCES public.usuarios(id)
);
