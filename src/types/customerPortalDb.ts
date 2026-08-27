// ======================================================================
// SOBRE MÍDIA CUSTOMER PORTAL — Tipos do banco estendido
// Espelha o schema da migration 20260916_customer_portal_commerce_foundation
//
// As tabelas/RPCs abaixo ainda não existem no tipo Database gerado pelo
// Supabase CLI. Este tipo estende Database['public'] SEM `any`, mantendo
// o type-safety dos builders do cliente (filters, selects com embed,
// inserts) e documentando as chaves estrangeiras via Relationships.
// ======================================================================

import type { Database } from '@/integrations/supabase/types';
import type {
  ContratoEstabelecimento,
  Expansao,
  ExpansaoItem,
  ModalidadeCliente,
  Oferta,
  OfertaCanal,
  OfertaItem,
  OfertaStatus,
  OnboardingSessao,
  OnboardingStatus,
  PrecoAuditoria,
  Produto,
  ProdutoPreco,
} from '@/types/customerPortal';

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface ProdutoInsert {
  empresa_operadora_id: string;
  cliente_id: string;
  codigo?: string | null;
  nome: string;
  descricao?: string | null;
  categoria?: string | null;
  marca?: string | null;
  unidade_medida?: string;
  imagem_url?: string | null;
  preco_atual: number;
  preco_promocional?: number | null;
  promocao_inicio?: string | null;
  promocao_fim?: string | null;
  ativo?: boolean;
  created_by?: string | null;
}

export interface OfertaInsert {
  empresa_operadora_id: string;
  cliente_id: string;
  titulo: string;
  descricao?: string | null;
  data_inicio: string;
  data_fim: string;
  status: OfertaStatus;
  canal?: OfertaCanal;
  destaque?: boolean;
  criada_por_ia?: boolean;
  created_by?: string | null;
}

export interface OfertaItemInsert {
  oferta_id: string;
  produto_id: string;
  preco_original: number;
  preco_oferta: number;
  desconto_porcentagem: number;
  destaque?: boolean;
}

export interface ContratoEstabelecimentoInsert {
  contrato_id: string;
  unidade_id: string;
  quantidade_telas: number;
  valor_unitario: number;
  ativo?: boolean;
  created_by?: string | null;
}

export interface ExpansaoItemInsert {
  expansao_id: string;
  unidade_id: string;
  quantidade_telas: number;
  valor_unitario: number;
  valor_total: number;
}

export interface OnboardingSessaoInsert {
  empresa_operadora_id: string;
  usuario_id: string;
  cliente_id?: string | null;
  modalidade?: ModalidadeCliente | null;
  step?: string;
  status?: OnboardingStatus;
  dados?: Record<string, unknown>;
}

// ── Ponto parceiro (migration 20261026_portal_anunciante_foundation) ──
export interface PontoParceiro {
  id: string;
  empresa_operadora_id: string;
  unidade_id?: string | null;
  nome: string;
  categoria?: string | null;
  descricao?: string | null;
  foto_url?: string | null;
  galeria?: Json;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  quantidade_telas: number;
  valor_anuncio?: number | null;
  periodicidade: 'MENSAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL' | 'UNICO';
  disponibilidade: 'DISPONIVEL' | 'RESERVADO' | 'INDISPONIVEL';
  status_operacional: 'ATIVO' | 'INATIVO' | 'MANUTENCAO';
  regras_comerciais?: string | null;
  ativo: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface PontoParceiroInsert {
  empresa_operadora_id?: string | null;
  unidade_id?: string | null;
  nome: string;
  categoria?: string | null;
  descricao?: string | null;
  foto_url?: string | null;
  galeria?: Json;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  quantidade_telas?: number;
  valor_anuncio?: number | null;
  periodicidade?: PontoParceiro['periodicidade'];
  disponibilidade?: PontoParceiro['disponibilidade'];
  status_operacional?: PontoParceiro['status_operacional'];
  regras_comerciais?: string | null;
  ativo?: boolean;
  created_by?: string | null;
}

export interface CommerceTables {
  produtos: {
    Row: Produto;
    Insert: ProdutoInsert;
    Update: Partial<Produto>;
    Relationships: [];
  };
  produto_precos: {
    Row: ProdutoPreco;
    Insert: Omit<ProdutoPreco, 'id' | 'created_at'> & { id?: string; created_at?: string };
    Update: Partial<ProdutoPreco>;
    Relationships: [];
  };
  preco_auditoria: {
    Row: PrecoAuditoria;
    Insert: Omit<PrecoAuditoria, 'id' | 'created_at'> & { id?: string; created_at?: string };
    Update: Partial<PrecoAuditoria>;
    Relationships: [];
  };
  ofertas: {
    Row: Oferta;
    Insert: OfertaInsert;
    Update: Partial<Oferta>;
    Relationships: [
      {
        foreignKeyName: 'ofertas_oferta_itens_fkey';
        columns: ['id'];
        isOneToOne: false;
        referencedRelation: 'oferta_itens';
        referencedColumns: ['oferta_id'];
      },
    ];
  };
  oferta_itens: {
    Row: OfertaItem;
    Insert: OfertaItemInsert;
    Update: Partial<OfertaItem>;
    Relationships: [
      {
        foreignKeyName: 'oferta_itens_produto_fkey';
        columns: ['produto_id'];
        isOneToOne: false;
        referencedRelation: 'produtos';
        referencedColumns: ['id'];
      },
    ];
  };
  contrato_estabelecimentos: {
    Row: ContratoEstabelecimento;
    Insert: ContratoEstabelecimentoInsert;
    Update: Partial<ContratoEstabelecimento>;
    Relationships: [
      {
        foreignKeyName: 'contrato_estabelecimentos_unidade_fkey';
        columns: ['unidade_id'];
        isOneToOne: false;
        referencedRelation: 'unidades';
        referencedColumns: ['id'];
      },
    ];
  };
  expansoes: {
    Row: Expansao;
    Insert: Omit<Expansao, 'id' | 'created_at' | 'updated_at' | 'itens'> & {
      id?: string;
      created_at?: string;
      updated_at?: string;
    };
    Update: Partial<Expansao>;
    Relationships: [
      {
        foreignKeyName: 'expansoes_expansao_itens_fkey';
        columns: ['id'];
        isOneToOne: false;
        referencedRelation: 'expansao_itens';
        referencedColumns: ['expansao_id'];
      },
      {
        foreignKeyName: 'expansoes_contrato_fkey';
        columns: ['contrato_id'];
        isOneToOne: false;
        referencedRelation: 'contratos';
        referencedColumns: ['id'];
      },
    ];
  };
  expansao_itens: {
    Row: ExpansaoItem;
    Insert: ExpansaoItemInsert;
    Update: Partial<ExpansaoItem>;
    Relationships: [
      {
        foreignKeyName: 'expansao_itens_unidade_fkey';
        columns: ['unidade_id'];
        isOneToOne: false;
        referencedRelation: 'unidades';
        referencedColumns: ['id'];
      },
    ];
  };
  onboarding_sessoes: {
    Row: OnboardingSessao;
    Insert: OnboardingSessaoInsert;
    Update: Partial<OnboardingSessao>;
    Relationships: [];
  };
  pontos: {
    Row: PontoParceiro;
    Insert: PontoParceiroInsert;
    Update: Partial<PontoParceiro>;
    Relationships: [
      {
        foreignKeyName: 'pontos_unidade_id_fkey';
        columns: ['unidade_id'];
        isOneToOne: true;
        referencedRelation: 'unidades';
        referencedColumns: ['id'];
      },
    ];
  };
}

export interface CommerceFunctions {
  atualizar_preco_produto: {
    Args: {
      p_produto_id: string;
      p_novo_preco: number;
      p_justificativa: string;
      p_preco_promocional?: number | null;
      p_promocao_inicio?: string | null;
      p_promocao_fim?: string | null;
    };
    Returns: Json;
  };
  calcular_preco_onboarding: {
    Args: {
      p_unidade_ids: string[];
      p_duracao_meses: number;
    };
    Returns: Json;
  };
  criar_contrato_onboarding: {
    Args: {
      p_sessao_id: string;
      p_unidade_ids: string[];
      p_duracao_meses: number;
      p_forma_pagamento: string;
      p_data_inicio: string;
    };
    Returns: Json;
  };
  solicitar_expansao: {
    Args: {
      p_contrato_id: string;
      p_unidade_ids: string[];
      p_justificativa?: string | null;
    };
    Returns: Json;
  };
  aprovar_expansao: {
    Args: {
      p_expansao_id: string;
    };
    Returns: Json;
  };
  rejeitar_expansao: {
    Args: {
      p_expansao_id: string;
      p_motivo: string;
    };
    Returns: Json;
  };
  listar_estabelecimentos_disponiveis: {
    Args: Record<string, never>;
    Returns: Json;
  };
  listar_pontos_para_anunciar: {
    Args: Record<string, never>;
    Returns: Json;
  };
  solicitar_novo_ponto: {
    Args: {
      p_ponto_id: string;
      p_justificativa?: string | null;
    };
    Returns: void;
  };
  publicar_playlist_cliente: {
    Args: {
      p_playlist_id: string;
    };
    Returns: Json;
  };
}

export interface CommerceDatabase {
  public: {
    Tables: Database['public']['Tables'] & CommerceTables;
    Views: Database['public']['Views'];
    Functions: Database['public']['Functions'] & CommerceFunctions;
    Enums: Database['public']['Enums'];
    CompositeTypes: Database['public']['CompositeTypes'];
  };
}