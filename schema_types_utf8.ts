export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      agenda_visitas: {
        Row: {
          cliente_id: string | null
          created_at: string
          data_agendada: string
          descricao: string | null
          empresa_operadora_id: string
          id: string
          representante_id: string
          status: string
          tipo_visita: string
          titulo: string
          updated_at: string
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          data_agendada: string
          descricao?: string | null
          empresa_operadora_id: string
          id?: string
          representante_id: string
          status?: string
          tipo_visita?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          data_agendada?: string
          descricao?: string | null
          empresa_operadora_id?: string
          id?: string
          representante_id?: string
          status?: string
          tipo_visita?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_visitas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_visitas_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_visitas_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "representantes"
            referencedColumns: ["id"]
          },
        ]
      }
      app_releases: {
        Row: {
          apk_url: string
          created_at: string | null
          id: string
          is_mandatory: boolean | null
          release_notes: string | null
          version_code: number
          version_name: string
        }
        Insert: {
          apk_url: string
          created_at?: string | null
          id?: string
          is_mandatory?: boolean | null
          release_notes?: string | null
          version_code: number
          version_name: string
        }
        Update: {
          apk_url?: string
          created_at?: string | null
          id?: string
          is_mandatory?: boolean | null
          release_notes?: string | null
          version_code?: number
          version_name?: string
        }
        Relationships: []
      }
      aprovacoes: {
        Row: {
          aprovado_por_email: string
          aprovado_por_nome: string
          campanha_id: string
          data_aprovacao: string
          id: string
          observacoes: string | null
          status: string
        }
        Insert: {
          aprovado_por_email: string
          aprovado_por_nome: string
          campanha_id: string
          data_aprovacao?: string
          id?: string
          observacoes?: string | null
          status: string
        }
        Update: {
          aprovado_por_email?: string
          aprovado_por_nome?: string
          campanha_id?: string
          data_aprovacao?: string
          id?: string
          observacoes?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "aprovacoes_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
        ]
      }
      artes: {
        Row: {
          campanha_id: string
          created_at: string
          duracao_segundos: number | null
          id: string
          thumbnail_url: string | null
          tipo_midia: string
          titulo: string
          updated_at: string
          url_arquivo: string
          versao_atual: number
        }
        Insert: {
          campanha_id: string
          created_at?: string
          duracao_segundos?: number | null
          id?: string
          thumbnail_url?: string | null
          tipo_midia: string
          titulo: string
          updated_at?: string
          url_arquivo: string
          versao_atual?: number
        }
        Update: {
          campanha_id?: string
          created_at?: string
          duracao_segundos?: number | null
          id?: string
          thumbnail_url?: string | null
          tipo_midia?: string
          titulo?: string
          updated_at?: string
          url_arquivo?: string
          versao_atual?: number
        }
        Relationships: [
          {
            foreignKeyName: "artes_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
        ]
      }
      assinaturas_digitais: {
        Row: {
          assinado_em: string | null
          contrato_versao_id: string
          created_at: string
          id: string
          ip_assinatura: string | null
          signatario_cpf: string
          signatario_email: string
          signatario_nome: string
          status: string
          token_assinatura: string | null
          updated_at: string
          user_agent_assinatura: string | null
        }
        Insert: {
          assinado_em?: string | null
          contrato_versao_id: string
          created_at?: string
          id?: string
          ip_assinatura?: string | null
          signatario_cpf: string
          signatario_email: string
          signatario_nome: string
          status?: string
          token_assinatura?: string | null
          updated_at?: string
          user_agent_assinatura?: string | null
        }
        Update: {
          assinado_em?: string | null
          contrato_versao_id?: string
          created_at?: string
          id?: string
          ip_assinatura?: string | null
          signatario_cpf?: string
          signatario_email?: string
          signatario_nome?: string
          status?: string
          token_assinatura?: string | null
          updated_at?: string
          user_agent_assinatura?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assinaturas_digitais_contrato_versao_id_fkey"
            columns: ["contrato_versao_id"]
            isOneToOne: false
            referencedRelation: "contrato_versoes"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_email: string
          actor_user_id: string | null
          created_at: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          module: string
          organization_id: string | null
          target_id: string | null
        }
        Insert: {
          action: string
          actor_email: string
          actor_user_id?: string | null
          created_at?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          module: string
          organization_id?: string | null
          target_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string
          actor_user_id?: string | null
          created_at?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          module?: string
          organization_id?: string | null
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria_logs: {
        Row: {
          acao: string
          data_hora: string
          empresa_operadora_id: string | null
          entidade_id: string
          entidade_tipo: string
          id: number
          ip_address: string | null
          observacoes: string | null
          status_anterior: string | null
          status_novo: string | null
          user_agent: string | null
          usuario_email: string | null
          usuario_id: string | null
          usuario_role: string | null
          valor_antigo: Json | null
          valor_novo: Json | null
        }
        Insert: {
          acao: string
          data_hora?: string
          empresa_operadora_id?: string | null
          entidade_id: string
          entidade_tipo: string
          id?: number
          ip_address?: string | null
          observacoes?: string | null
          status_anterior?: string | null
          status_novo?: string | null
          user_agent?: string | null
          usuario_email?: string | null
          usuario_id?: string | null
          usuario_role?: string | null
          valor_antigo?: Json | null
          valor_novo?: Json | null
        }
        Update: {
          acao?: string
          data_hora?: string
          empresa_operadora_id?: string | null
          entidade_id?: string
          entidade_tipo?: string
          id?: number
          ip_address?: string | null
          observacoes?: string | null
          status_anterior?: string | null
          status_novo?: string | null
          user_agent?: string | null
          usuario_email?: string | null
          usuario_id?: string | null
          usuario_role?: string | null
          valor_antigo?: Json | null
          valor_novo?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_logs_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
        ]
      }
      biblioteca_midias: {
        Row: {
          cliente_id: string | null
          created_at: string
          duracao_segundos: number | null
          empresa_operadora_id: string
          id: string
          metadados: Json | null
          resolucao: string | null
          storage_url: string
          tamanho_bytes: number
          thumbnail_url: string | null
          tipo_midia: string
          titulo: string
          updated_at: string
          versao: number
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          duracao_segundos?: number | null
          empresa_operadora_id: string
          id?: string
          metadados?: Json | null
          resolucao?: string | null
          storage_url: string
          tamanho_bytes?: number
          thumbnail_url?: string | null
          tipo_midia: string
          titulo: string
          updated_at?: string
          versao?: number
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          duracao_segundos?: number | null
          empresa_operadora_id?: string
          id?: string
          metadados?: Json | null
          resolucao?: string | null
          storage_url?: string
          tamanho_bytes?: number
          thumbnail_url?: string | null
          tipo_midia?: string
          titulo?: string
          updated_at?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "biblioteca_midias_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "biblioteca_midias_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
        ]
      }
      campanha_arte_versoes: {
        Row: {
          arte_id: string
          created_at: string
          created_by: string | null
          id: string
          numero_versao: number
          observacoes: string | null
          thumbnail_url: string | null
          url_arquivo: string
        }
        Insert: {
          arte_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          numero_versao: number
          observacoes?: string | null
          thumbnail_url?: string | null
          url_arquivo: string
        }
        Update: {
          arte_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          numero_versao?: number
          observacoes?: string | null
          thumbnail_url?: string | null
          url_arquivo?: string
        }
        Relationships: [
          {
            foreignKeyName: "campanha_arte_versoes_arte_id_fkey"
            columns: ["arte_id"]
            isOneToOne: false
            referencedRelation: "artes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_arte_versoes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      campanhas: {
        Row: {
          cliente_id: string
          codigo_campanha: number | null
          contrato_id: string
          created_at: string
          created_by: string | null
          data_fim: string
          data_inicio: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          duracao_segundos: number
          empresa_operadora_id: string
          id: string
          numero_campanha: string | null
          objetivo: string | null
          status: string
          titulo: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          cliente_id: string
          codigo_campanha?: number | null
          contrato_id: string
          created_at?: string
          created_by?: string | null
          data_fim: string
          data_inicio: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          duracao_segundos?: number
          empresa_operadora_id: string
          id?: string
          numero_campanha?: string | null
          objetivo?: string | null
          status?: string
          titulo: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          cliente_id?: string
          codigo_campanha?: number | null
          contrato_id?: string
          created_at?: string
          created_by?: string | null
          data_fim?: string
          data_inicio?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          duracao_segundos?: number
          empresa_operadora_id?: string
          id?: string
          numero_campanha?: string | null
          objetivo?: string | null
          status?: string
          titulo?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "campanhas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanhas_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanhas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanhas_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanhas_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogo_servicos: {
        Row: {
          ativo: boolean
          codigo_servico: string
          created_at: string
          descricao: string | null
          empresa_operadora_id: string
          id: string
          nome: string
          updated_at: string
          valor_tabela: number
        }
        Insert: {
          ativo?: boolean
          codigo_servico: string
          created_at?: string
          descricao?: string | null
          empresa_operadora_id: string
          id?: string
          nome: string
          updated_at?: string
          valor_tabela: number
        }
        Update: {
          ativo?: boolean
          codigo_servico?: string
          created_at?: string
          descricao?: string | null
          empresa_operadora_id?: string
          id?: string
          nome?: string
          updated_at?: string
          valor_tabela?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalogo_servicos_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          codigo_cliente: number
          created_at: string
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          empresa_operadora_id: string
          id: string
          representante_id: string
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          codigo_cliente: number
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          empresa_operadora_id: string
          id?: string
          representante_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          codigo_cliente?: number
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          empresa_operadora_id?: string
          id?: string
          representante_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "clientes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "representantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      cobrancas: {
        Row: {
          comprovante_url: string | null
          created_at: string
          created_by: string | null
          data_pagamento: string | null
          data_vencimento: string
          desconto_aplicado: number | null
          empresa_operadora_id: string
          financeiro_lancamento_id: string
          forma_pagamento: string
          id: string
          juros_multa: number | null
          link_boleto_pix: string | null
          numero_parcela: number
          status_pagamento: string
          total_parcelas: number
          updated_at: string
          updated_by: string | null
          valor_parcela: number
        }
        Insert: {
          comprovante_url?: string | null
          created_at?: string
          created_by?: string | null
          data_pagamento?: string | null
          data_vencimento: string
          desconto_aplicado?: number | null
          empresa_operadora_id: string
          financeiro_lancamento_id: string
          forma_pagamento: string
          id?: string
          juros_multa?: number | null
          link_boleto_pix?: string | null
          numero_parcela: number
          status_pagamento?: string
          total_parcelas: number
          updated_at?: string
          updated_by?: string | null
          valor_parcela: number
        }
        Update: {
          comprovante_url?: string | null
          created_at?: string
          created_by?: string | null
          data_pagamento?: string | null
          data_vencimento?: string
          desconto_aplicado?: number | null
          empresa_operadora_id?: string
          financeiro_lancamento_id?: string
          forma_pagamento?: string
          id?: string
          juros_multa?: number | null
          link_boleto_pix?: string | null
          numero_parcela?: number
          status_pagamento?: string
          total_parcelas?: number
          updated_at?: string
          updated_by?: string | null
          valor_parcela?: number
        }
        Relationships: [
          {
            foreignKeyName: "cobrancas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobrancas_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobrancas_financeiro_lancamento_id_fkey"
            columns: ["financeiro_lancamento_id"]
            isOneToOne: false
            referencedRelation: "financeiro_lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobrancas_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      comissoes_representantes: {
        Row: {
          cobranca_id: string | null
          contrato_id: string
          created_at: string
          created_by: string | null
          data_pagamento: string | null
          empresa_operadora_id: string
          id: string
          observacoes: string | null
          porcentagem_aplicada: number
          representante_id: string
          status: string
          updated_at: string
          updated_by: string | null
          valor_base: number
          valor_comissao: number
        }
        Insert: {
          cobranca_id?: string | null
          contrato_id: string
          created_at?: string
          created_by?: string | null
          data_pagamento?: string | null
          empresa_operadora_id: string
          id?: string
          observacoes?: string | null
          porcentagem_aplicada: number
          representante_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          valor_base: number
          valor_comissao: number
        }
        Update: {
          cobranca_id?: string | null
          contrato_id?: string
          created_at?: string
          created_by?: string | null
          data_pagamento?: string | null
          empresa_operadora_id?: string
          id?: string
          observacoes?: string | null
          porcentagem_aplicada?: number
          representante_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          valor_base?: number
          valor_comissao?: number
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_representantes_cobranca_id_fkey"
            columns: ["cobranca_id"]
            isOneToOne: false
            referencedRelation: "cobrancas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_representantes_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_representantes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_representantes_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_representantes_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "representantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_representantes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      conciliacoes: {
        Row: {
          cobranca_id: string | null
          created_at: string
          data_extrato: string
          empresa_operadora_id: string
          id: string
          status: string
          valor_extrato: number
        }
        Insert: {
          cobranca_id?: string | null
          created_at?: string
          data_extrato: string
          empresa_operadora_id: string
          id?: string
          status?: string
          valor_extrato: number
        }
        Update: {
          cobranca_id?: string | null
          created_at?: string
          data_extrato?: string
          empresa_operadora_id?: string
          id?: string
          status?: string
          valor_extrato?: number
        }
        Relationships: [
          {
            foreignKeyName: "conciliacoes_cobranca_id_fkey"
            columns: ["cobranca_id"]
            isOneToOne: false
            referencedRelation: "cobrancas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliacoes_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracoes_empresa: {
        Row: {
          aliquota_imposto_padrao: number | null
          created_at: string
          created_by: string | null
          dados_bancarios_pix: Json | null
          dias_validade_proposta_padrao: number | null
          empresa_operadora_id: string
          id: string
          logo_pdf_url: string | null
          rodape_pdf_contratos: string | null
          termos_contratuais_padrao: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          aliquota_imposto_padrao?: number | null
          created_at?: string
          created_by?: string | null
          dados_bancarios_pix?: Json | null
          dias_validade_proposta_padrao?: number | null
          empresa_operadora_id: string
          id?: string
          logo_pdf_url?: string | null
          rodape_pdf_contratos?: string | null
          termos_contratuais_padrao?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          aliquota_imposto_padrao?: number | null
          created_at?: string
          created_by?: string | null
          dados_bancarios_pix?: Json | null
          dias_validade_proposta_padrao?: number | null
          empresa_operadora_id?: string
          id?: string
          logo_pdf_url?: string | null
          rodape_pdf_contratos?: string | null
          termos_contratuais_padrao?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "configuracoes_empresa_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: true
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
        ]
      }
      contatos: {
        Row: {
          cargo: string
          created_at: string
          created_by: string | null
          email: string
          empresa_id: string
          id: string
          is_principal: boolean
          nome: string
          telefone: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cargo: string
          created_at?: string
          created_by?: string | null
          email: string
          empresa_id: string
          id?: string
          is_principal?: boolean
          nome: string
          telefone: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cargo?: string
          created_at?: string
          created_by?: string | null
          email?: string
          empresa_id?: string
          id?: string
          is_principal?: boolean
          nome?: string
          telefone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contatos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contatos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contatos_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_auditoria: {
        Row: {
          contrato_id: string
          created_at: string
          detalhes: Json | null
          evento: string
          id: string
          tipo_contrato: string | null
          usuario_id: string | null
          versao: number | null
        }
        Insert: {
          contrato_id: string
          created_at?: string
          detalhes?: Json | null
          evento: string
          id?: string
          tipo_contrato?: string | null
          usuario_id?: string | null
          versao?: number | null
        }
        Update: {
          contrato_id?: string
          created_at?: string
          detalhes?: Json | null
          evento?: string
          id?: string
          tipo_contrato?: string | null
          usuario_id?: string | null
          versao?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contrato_auditoria_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_auditoria_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_templates: {
        Row: {
          ativo: boolean
          codigo_template: string
          conteudo_html: string
          created_at: string
          descricao: string | null
          empresa_operadora_id: string | null
          id: string
          nome: string
          tipo_contrato: string
          updated_at: string
          versao: number
        }
        Insert: {
          ativo?: boolean
          codigo_template: string
          conteudo_html: string
          created_at?: string
          descricao?: string | null
          empresa_operadora_id?: string | null
          id?: string
          nome: string
          tipo_contrato: string
          updated_at?: string
          versao?: number
        }
        Update: {
          ativo?: boolean
          codigo_template?: string
          conteudo_html?: string
          created_at?: string
          descricao?: string | null
          empresa_operadora_id?: string | null
          id?: string
          nome?: string
          tipo_contrato?: string
          updated_at?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "contrato_templates_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_versoes: {
        Row: {
          contrato_id: string
          created_at: string
          created_by: string
          id: string
          motivo_alteracao: string
          numero_versao: number
          pdf_url: string | null
          snapshot_dados: Json
        }
        Insert: {
          contrato_id: string
          created_at?: string
          created_by: string
          id?: string
          motivo_alteracao: string
          numero_versao: number
          pdf_url?: string | null
          snapshot_dados: Json
        }
        Update: {
          contrato_id?: string
          created_at?: string
          created_by?: string
          id?: string
          motivo_alteracao?: string
          numero_versao?: number
          pdf_url?: string | null
          snapshot_dados?: Json
        }
        Relationships: [
          {
            foreignKeyName: "contrato_versoes_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_versoes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos: {
        Row: {
          cliente_id: string
          created_at: string
          created_by: string | null
          data_fim: string
          data_inicio: string
          data_selecao: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          empresa_id: string
          empresa_operadora_id: string
          forma_pagamento: string
          id: string
          numero_contrato: string
          numero_contrato_legivel: string | null
          pdf_object_key: string | null
          plano_id: string | null
          proposta_id: string | null
          representante_id: string
          status_documento: string | null
          status_workflow: string
          template_id: string | null
          template_nome: string | null
          template_versao: number | null
          tipo_contrato: string | null
          updated_at: string
          updated_by: string | null
          usuario_responsavel_id: string | null
          valor_mensal: number
          versao_atual: number
          version: number
        }
        Insert: {
          cliente_id: string
          created_at?: string
          created_by?: string | null
          data_fim: string
          data_inicio: string
          data_selecao?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          empresa_id: string
          empresa_operadora_id: string
          forma_pagamento: string
          id?: string
          numero_contrato: string
          numero_contrato_legivel?: string | null
          pdf_object_key?: string | null
          plano_id?: string | null
          proposta_id?: string | null
          representante_id: string
          status_documento?: string | null
          status_workflow?: string
          template_id?: string | null
          template_nome?: string | null
          template_versao?: number | null
          tipo_contrato?: string | null
          updated_at?: string
          updated_by?: string | null
          usuario_responsavel_id?: string | null
          valor_mensal: number
          versao_atual?: number
          version?: number
        }
        Update: {
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          data_fim?: string
          data_inicio?: string
          data_selecao?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          empresa_id?: string
          empresa_operadora_id?: string
          forma_pagamento?: string
          id?: string
          numero_contrato?: string
          numero_contrato_legivel?: string | null
          pdf_object_key?: string | null
          plano_id?: string | null
          proposta_id?: string | null
          representante_id?: string
          status_documento?: string | null
          status_workflow?: string
          template_id?: string | null
          template_nome?: string | null
          template_versao?: number | null
          tipo_contrato?: string | null
          updated_at?: string
          updated_by?: string | null
          usuario_responsavel_id?: string | null
          valor_mensal?: number
          versao_atual?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "contratos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "propostas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "representantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contrato_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_usuario_responsavel_id_fkey"
            columns: ["usuario_responsavel_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      corporate_modules: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          module_key: string
          name: string
          organization_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          module_key: string
          name: string
          organization_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          module_key?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "corporate_modules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      corporate_navigation: {
        Row: {
          created_at: string | null
          display_order: number | null
          enabled: boolean | null
          feature_flag: string | null
          icon: string | null
          id: string
          module_key: string
          name: string
          organization_id: string | null
          parent_id: string | null
          permission_required: string | null
          required_license: string | null
          route: string | null
          updated_at: string | null
          visible: boolean | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          enabled?: boolean | null
          feature_flag?: string | null
          icon?: string | null
          id?: string
          module_key: string
          name: string
          organization_id?: string | null
          parent_id?: string | null
          permission_required?: string | null
          required_license?: string | null
          route?: string | null
          updated_at?: string | null
          visible?: boolean | null
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          enabled?: boolean | null
          feature_flag?: string | null
          icon?: string | null
          id?: string
          module_key?: string
          name?: string
          organization_id?: string | null
          parent_id?: string | null
          permission_required?: string | null
          required_license?: string | null
          route?: string | null
          updated_at?: string | null
          visible?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "corporate_navigation_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corporate_navigation_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "corporate_navigation"
            referencedColumns: ["id"]
          },
        ]
      }
      corporate_settings: {
        Row: {
          created_at: string | null
          id: string
          organization_id: string
          setting_key: string
          setting_value: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          organization_id: string
          setting_key: string
          setting_value?: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          organization_id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "corporate_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          organization_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      designers: {
        Row: {
          ativo: boolean
          created_at: string
          empresa_operadora_id: string
          especialidade: string | null
          id: string
          usuario_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          empresa_operadora_id: string
          especialidade?: string | null
          id?: string
          usuario_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          empresa_operadora_id?: string
          especialidade?: string | null
          id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "designers_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designers_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      device_logs: {
        Row: {
          created_at: string | null
          device_id: string | null
          id: string
          log_type: string | null
          message: string | null
          occurrence_time: string | null
        }
        Insert: {
          created_at?: string | null
          device_id?: string | null
          id?: string
          log_type?: string | null
          message?: string | null
          occurrence_time?: string | null
        }
        Update: {
          created_at?: string | null
          device_id?: string | null
          id?: string
          log_type?: string | null
          message?: string | null
          occurrence_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_logs_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          app_version: string | null
          created_at: string | null
          current_playlist_id: string | null
          id: string
          ip_address: string | null
          is_online: boolean | null
          last_heartbeat: string | null
          mac_address: string | null
          name: string
          storage_available: number | null
        }
        Insert: {
          app_version?: string | null
          created_at?: string | null
          current_playlist_id?: string | null
          id?: string
          ip_address?: string | null
          is_online?: boolean | null
          last_heartbeat?: string | null
          mac_address?: string | null
          name: string
          storage_available?: number | null
        }
        Update: {
          app_version?: string | null
          created_at?: string | null
          current_playlist_id?: string | null
          id?: string
          ip_address?: string | null
          is_online?: boolean | null
          last_heartbeat?: string | null
          mac_address?: string | null
          name?: string
          storage_available?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "devices_current_playlist_id_fkey"
            columns: ["current_playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      download_status: {
        Row: {
          device_id: string
          media_id: string
          progress: number | null
          updated_at: string | null
        }
        Insert: {
          device_id: string
          media_id: string
          progress?: number | null
          updated_at?: string | null
        }
        Update: {
          device_id?: string
          media_id?: string
          progress?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      empresa_operadora: {
        Row: {
          cnpj: string
          configuracoes: Json | null
          created_at: string
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          dominio_customizado: string | null
          email: string
          id: string
          logo_url: string | null
          nome: string
          nome_fantasia: string
          status: string
          telefone: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          cnpj: string
          configuracoes?: Json | null
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          dominio_customizado?: string | null
          email: string
          id?: string
          logo_url?: string | null
          nome: string
          nome_fantasia: string
          status?: string
          telefone?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          cnpj?: string
          configuracoes?: Json | null
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          dominio_customizado?: string | null
          email?: string
          id?: string
          logo_url?: string | null
          nome?: string
          nome_fantasia?: string
          status?: string
          telefone?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      empresas: {
        Row: {
          bairro: string | null
          cargo_representante: string | null
          cep: string | null
          cidade: string | null
          cliente_id: string
          cnpj: string
          complemento: string | null
          created_at: string
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          email: string
          estado: string | null
          id: string
          logradouro: string | null
          nome_fantasia: string
          numero: string | null
          observacoes: string | null
          razao_social: string
          representante_legal: string | null
          segmento: string | null
          telefone: string | null
          updated_at: string
          updated_by: string | null
          version: number
          whatsapp: string
        }
        Insert: {
          bairro?: string | null
          cargo_representante?: string | null
          cep?: string | null
          cidade?: string | null
          cliente_id: string
          cnpj: string
          complemento?: string | null
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email: string
          estado?: string | null
          id?: string
          logradouro?: string | null
          nome_fantasia: string
          numero?: string | null
          observacoes?: string | null
          razao_social: string
          representante_legal?: string | null
          segmento?: string | null
          telefone?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
          whatsapp: string
        }
        Update: {
          bairro?: string | null
          cargo_representante?: string | null
          cep?: string | null
          cidade?: string | null
          cliente_id?: string
          cnpj?: string
          complemento?: string | null
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string
          estado?: string | null
          id?: string
          logradouro?: string | null
          nome_fantasia?: string
          numero?: string | null
          observacoes?: string | null
          razao_social?: string
          representante_legal?: string | null
          segmento?: string | null
          telefone?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "empresas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empresas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empresas_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      equipamentos: {
        Row: {
          created_at: string
          fabricante: string
          id: string
          mac_address: string
          modelo: string
          serial_number: string
          sistema_operacional: string
          status: string
          tela_id: string | null
          updated_at: string
          versao_firmware: string | null
        }
        Insert: {
          created_at?: string
          fabricante: string
          id?: string
          mac_address: string
          modelo: string
          serial_number: string
          sistema_operacional: string
          status?: string
          tela_id?: string | null
          updated_at?: string
          versao_firmware?: string | null
        }
        Update: {
          created_at?: string
          fabricante?: string
          id?: string
          mac_address?: string
          modelo?: string
          serial_number?: string
          sistema_operacional?: string
          status?: string
          tela_id?: string | null
          updated_at?: string
          versao_firmware?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipamentos_tela_id_fkey"
            columns: ["tela_id"]
            isOneToOne: true
            referencedRelation: "telas"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos: {
        Row: {
          created_at: string
          created_by: string | null
          empresa_operadora_id: string
          entidade_id: string
          entidade_origem: string
          id: string
          payload: Json
          processado: boolean
          tipo_evento: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          empresa_operadora_id: string
          entidade_id: string
          entidade_origem: string
          id?: string
          payload?: Json
          processado?: boolean
          tipo_evento: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          empresa_operadora_id?: string
          entidade_id?: string
          entidade_origem?: string
          id?: string
          payload?: Json
          processado?: boolean
          tipo_evento?: string
        }
        Relationships: [
          {
            foreignKeyName: "eventos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos_tentativas: {
        Row: {
          erro_mensagem: string | null
          evento_id: string
          executado_em: string
          id: string
          tentativa_numero: number
        }
        Insert: {
          erro_mensagem?: string | null
          evento_id: string
          executado_em?: string
          id?: string
          tentativa_numero: number
        }
        Update: {
          erro_mensagem?: string | null
          evento_id?: string
          executado_em?: string
          id?: string
          tentativa_numero?: number
        }
        Relationships: [
          {
            foreignKeyName: "eventos_tentativas_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
        ]
      }
      external_links: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          platform: string
          thumbnail_url: string | null
          title: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          platform: string
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          platform?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          ativo_global: boolean
          chave: string
          created_at: string
          descricao: string
          id: string
        }
        Insert: {
          ativo_global?: boolean
          chave: string
          created_at?: string
          descricao: string
          id?: string
        }
        Update: {
          ativo_global?: boolean
          chave?: string
          created_at?: string
          descricao?: string
          id?: string
        }
        Relationships: []
      }
      feature_flags_empresa: {
        Row: {
          ativo: boolean
          configuracao_opcional: Json | null
          created_at: string
          empresa_operadora_id: string
          feature_flag_id: string
          id: string
        }
        Insert: {
          ativo?: boolean
          configuracao_opcional?: Json | null
          created_at?: string
          empresa_operadora_id: string
          feature_flag_id: string
          id?: string
        }
        Update: {
          ativo?: boolean
          configuracao_opcional?: Json | null
          created_at?: string
          empresa_operadora_id?: string
          feature_flag_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_empresa_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_flags_empresa_feature_flag_id_fkey"
            columns: ["feature_flag_id"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_lancamentos: {
        Row: {
          cliente_id: string
          contrato_id: string
          created_at: string
          created_by: string | null
          empresa_operadora_id: string
          id: string
          numero_parcelas: number
          status_geral: string
          updated_at: string
          updated_by: string | null
          valor_total_contrato: number
        }
        Insert: {
          cliente_id: string
          contrato_id: string
          created_at?: string
          created_by?: string | null
          empresa_operadora_id: string
          id?: string
          numero_parcelas?: number
          status_geral?: string
          updated_at?: string
          updated_by?: string | null
          valor_total_contrato: number
        }
        Update: {
          cliente_id?: string
          contrato_id?: string
          created_at?: string
          created_by?: string | null
          empresa_operadora_id?: string
          id?: string
          numero_parcelas?: number
          status_geral?: string
          updated_at?: string
          updated_by?: string | null
          valor_total_contrato?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_lancamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      historico_financeiro: {
        Row: {
          contrato_id: string
          created_at: string
          id: string
          motivo_alteracao: string
          usuario_responsavel_id: string
          valor_anterior: number
          valor_novo: number
        }
        Insert: {
          contrato_id: string
          created_at?: string
          id?: string
          motivo_alteracao: string
          usuario_responsavel_id: string
          valor_anterior: number
          valor_novo: number
        }
        Update: {
          contrato_id?: string
          created_at?: string
          id?: string
          motivo_alteracao?: string
          usuario_responsavel_id?: string
          valor_anterior?: number
          valor_novo?: number
        }
        Relationships: [
          {
            foreignKeyName: "historico_financeiro_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_financeiro_usuario_responsavel_id_fkey"
            columns: ["usuario_responsavel_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      itens_contrato: {
        Row: {
          contrato_id: string
          created_at: string
          desconto: number | null
          id: string
          quantidade: number
          servico_id: string
          valor_total: number
          valor_unitario: number
        }
        Insert: {
          contrato_id: string
          created_at?: string
          desconto?: number | null
          id?: string
          quantidade?: number
          servico_id: string
          valor_total: number
          valor_unitario: number
        }
        Update: {
          contrato_id?: string
          created_at?: string
          desconto?: number | null
          id?: string
          quantidade?: number
          servico_id?: string
          valor_total?: number
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "itens_contrato_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_contrato_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "catalogo_servicos"
            referencedColumns: ["id"]
          },
        ]
      }
      itens_proposta: {
        Row: {
          created_at: string
          desconto: number | null
          id: string
          proposta_id: string
          quantidade: number
          servico_id: string
          valor_total: number
          valor_unitario: number
        }
        Insert: {
          created_at?: string
          desconto?: number | null
          id?: string
          proposta_id: string
          quantidade?: number
          servico_id: string
          valor_total: number
          valor_unitario: number
        }
        Update: {
          created_at?: string
          desconto?: number | null
          id?: string
          proposta_id?: string
          quantidade?: number
          servico_id?: string
          valor_total?: number
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "itens_proposta_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "propostas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_proposta_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "catalogo_servicos"
            referencedColumns: ["id"]
          },
        ]
      }
      job_tentativas: {
        Row: {
          erro_detalhado: string | null
          executado_em: string
          id: string
          job_id: string
          tentativa_numero: number
        }
        Insert: {
          erro_detalhado?: string | null
          executado_em?: string
          id?: string
          job_id: string
          tentativa_numero: number
        }
        Update: {
          erro_detalhado?: string | null
          executado_em?: string
          id?: string
          job_id?: string
          tentativa_numero?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_tentativas_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          created_at: string
          empresa_operadora_id: string
          erro_ultimo: string | null
          id: string
          idempotency_key: string | null
          max_tentativas: number
          payload: Json
          prioridade: number
          processed_at: string | null
          retry_at: string | null
          status: string
          tentativas: number
          tipo_job: string
        }
        Insert: {
          created_at?: string
          empresa_operadora_id: string
          erro_ultimo?: string | null
          id?: string
          idempotency_key?: string | null
          max_tentativas?: number
          payload?: Json
          prioridade?: number
          processed_at?: string | null
          retry_at?: string | null
          status?: string
          tentativas?: number
          tipo_job: string
        }
        Update: {
          created_at?: string
          empresa_operadora_id?: string
          erro_ultimo?: string | null
          id?: string
          idempotency_key?: string | null
          max_tentativas?: number
          payload?: Json
          prioridade?: number
          processed_at?: string | null
          retry_at?: string | null
          status?: string
          tentativas?: number
          tipo_job?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
        ]
      }
      locais: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          nome: string
          unidade_id: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          unidade_id: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "locais_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      media: {
        Row: {
          aspect_ratio: string | null
          created_at: string
          file_hash: string | null
          file_path: string
          file_size: number
          file_type: string
          file_url: string
          id: string
          mime_type: string
          name: string
          thumbnail_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          aspect_ratio?: string | null
          created_at?: string
          file_hash?: string | null
          file_path: string
          file_size: number
          file_type: string
          file_url: string
          id?: string
          mime_type: string
          name: string
          thumbnail_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          aspect_ratio?: string | null
          created_at?: string
          file_hash?: string | null
          file_path?: string
          file_size?: number
          file_type?: string
          file_url?: string
          id?: string
          mime_type?: string
          name?: string
          thumbnail_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      medias: {
        Row: {
          checksum: string | null
          created_at: string | null
          duration_seconds: number | null
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          title: string
        }
        Insert: {
          checksum?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          title: string
        }
        Update: {
          checksum?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          title?: string
        }
        Relationships: []
      }
      midia_versoes: {
        Row: {
          biblioteca_midia_id: string
          created_at: string
          id: string
          numero_versao: number
          storage_url: string
        }
        Insert: {
          biblioteca_midia_id: string
          created_at?: string
          id?: string
          numero_versao: number
          storage_url: string
        }
        Update: {
          biblioteca_midia_id?: string
          created_at?: string
          id?: string
          numero_versao?: number
          storage_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "midia_versoes_biblioteca_midia_id_fkey"
            columns: ["biblioteca_midia_id"]
            isOneToOne: false
            referencedRelation: "biblioteca_midias"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoring_logs: {
        Row: {
          app_version: string | null
          battery_level: number | null
          cpu_temp: number | null
          created_at: string | null
          id: string
          is_charging: boolean | null
          ram_used_mb: number | null
          screen_id: string
          screenshot_url: string | null
          storage_used_mb: number | null
        }
        Insert: {
          app_version?: string | null
          battery_level?: number | null
          cpu_temp?: number | null
          created_at?: string | null
          id?: string
          is_charging?: boolean | null
          ram_used_mb?: number | null
          screen_id: string
          screenshot_url?: string | null
          storage_used_mb?: number | null
        }
        Update: {
          app_version?: string | null
          battery_level?: number | null
          cpu_temp?: number | null
          created_at?: string | null
          id?: string
          is_charging?: boolean | null
          ram_used_mb?: number | null
          screen_id?: string
          screenshot_url?: string | null
          storage_used_mb?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "monitoring_logs_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "screens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitoring_logs_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "vw_offline_screens"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes_central: {
        Row: {
          canal: string
          created_at: string
          destinatario_contato: string
          empresa_operadora_id: string
          enviado_em: string | null
          erro_mensagem: string | null
          id: string
          lida: boolean
          mensagem: string
          status_envio: string
          tipo_evento: string
          titulo: string
          usuario_id: string
        }
        Insert: {
          canal: string
          created_at?: string
          destinatario_contato: string
          empresa_operadora_id: string
          enviado_em?: string | null
          erro_mensagem?: string | null
          id?: string
          lida?: boolean
          mensagem: string
          status_envio?: string
          tipo_evento: string
          titulo: string
          usuario_id: string
        }
        Update: {
          canal?: string
          created_at?: string
          destinatario_contato?: string
          empresa_operadora_id?: string
          enviado_em?: string | null
          erro_mensagem?: string | null
          id?: string
          lida?: boolean
          mensagem?: string
          status_envio?: string
          tipo_evento?: string
          titulo?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_central_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_central_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      ordens_producao: {
        Row: {
          contrato_id: string
          created_at: string
          data_prazo: string | null
          designer_id: string | null
          empresa_operadora_id: string
          id: string
          numero_op: string
          status: string
          updated_at: string
        }
        Insert: {
          contrato_id: string
          created_at?: string
          data_prazo?: string | null
          designer_id?: string | null
          empresa_operadora_id: string
          id?: string
          numero_op: string
          status?: string
          updated_at?: string
        }
        Update: {
          contrato_id?: string
          created_at?: string
          data_prazo?: string | null
          designer_id?: string | null
          empresa_operadora_id?: string
          id?: string
          numero_op?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordens_producao_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_producao_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "designers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_producao_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          cnpj: string | null
          created_at: string | null
          id: string
          name: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          cnpj?: string | null
          created_at?: string | null
          id?: string
          name: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          cnpj?: string | null
          created_at?: string | null
          id?: string
          name?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      pagamentos: {
        Row: {
          cobranca_id: string
          created_at: string
          created_by: string | null
          data_liquidacao: string
          id: string
          meio_pagamento: string
          transacao_id_externo: string | null
          valor_pago: number
        }
        Insert: {
          cobranca_id: string
          created_at?: string
          created_by?: string | null
          data_liquidacao?: string
          id?: string
          meio_pagamento: string
          transacao_id_externo?: string | null
          valor_pago: number
        }
        Update: {
          cobranca_id?: string
          created_at?: string
          created_by?: string | null
          data_liquidacao?: string
          id?: string
          meio_pagamento?: string
          transacao_id_externo?: string | null
          valor_pago?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_cobranca_id_fkey"
            columns: ["cobranca_id"]
            isOneToOne: false
            referencedRelation: "cobrancas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_insercao: {
        Row: {
          contrato_id: string
          created_at: string
          data_emissao: string
          empresa_operadora_id: string
          id: string
          numero_pi: string
          pdf_url: string | null
        }
        Insert: {
          contrato_id: string
          created_at?: string
          data_emissao?: string
          empresa_operadora_id: string
          id?: string
          numero_pi: string
          pdf_url?: string | null
        }
        Update: {
          contrato_id?: string
          created_at?: string
          data_emissao?: string
          empresa_operadora_id?: string
          id?: string
          numero_pi?: string
          pdf_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_insercao_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_insercao_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_insercao_versoes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          numero_versao: number
          pdf_url: string | null
          pedidos_insercao_id: string
          snapshot_dados: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          numero_versao: number
          pdf_url?: string | null
          pedidos_insercao_id: string
          snapshot_dados: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          numero_versao?: number
          pdf_url?: string | null
          pedidos_insercao_id?: string
          snapshot_dados?: Json
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_insercao_versoes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_insercao_versoes_pedidos_insercao_id_fkey"
            columns: ["pedidos_insercao_id"]
            isOneToOne: false
            referencedRelation: "pedidos_insercao"
            referencedColumns: ["id"]
          },
        ]
      }
      perfis: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      permissions: {
        Row: {
          code: string
          created_at: string | null
          description: string | null
          id: string
        }
        Insert: {
          code: string
          created_at?: string | null
          description?: string | null
          id?: string
        }
        Update: {
          code?: string
          created_at?: string | null
          description?: string | null
          id?: string
        }
        Relationships: []
      }
      planos: {
        Row: {
          ativo: boolean
          created_at: string
          desconto_porcentagem: number
          duracao_meses: number
          empresa_operadora_id: string
          id: string
          nome: string
          tipo: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          desconto_porcentagem?: number
          duracao_meses: number
          empresa_operadora_id: string
          id?: string
          nome: string
          tipo: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          desconto_porcentagem?: number
          duracao_meses?: number
          empresa_operadora_id?: string
          id?: string
          nome?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "planos_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
        ]
      }
      playback_logs: {
        Row: {
          duration: number | null
          id: string
          media_id: string | null
          metadata: Json | null
          playlist_id: string | null
          screen_id: string
          signature: string | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          duration?: number | null
          id?: string
          media_id?: string | null
          metadata?: Json | null
          playlist_id?: string | null
          screen_id: string
          signature?: string | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          duration?: number | null
          id?: string
          media_id?: string | null
          metadata?: Json | null
          playlist_id?: string | null
          screen_id?: string
          signature?: string | null
          started_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "playback_logs_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      player_historico_hardware: {
        Row: {
          equipamento_anterior_id: string | null
          equipamento_novo_id: string | null
          id: string
          motivo_troca: string
          tela_id: string
          trocado_em: string
          trocado_por_usuario_id: string | null
        }
        Insert: {
          equipamento_anterior_id?: string | null
          equipamento_novo_id?: string | null
          id?: string
          motivo_troca: string
          tela_id: string
          trocado_em?: string
          trocado_por_usuario_id?: string | null
        }
        Update: {
          equipamento_anterior_id?: string | null
          equipamento_novo_id?: string | null
          id?: string
          motivo_troca?: string
          tela_id?: string
          trocado_em?: string
          trocado_por_usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_historico_hardware_equipamento_anterior_id_fkey"
            columns: ["equipamento_anterior_id"]
            isOneToOne: false
            referencedRelation: "equipamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_historico_hardware_equipamento_novo_id_fkey"
            columns: ["equipamento_novo_id"]
            isOneToOne: false
            referencedRelation: "equipamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_historico_hardware_tela_id_fkey"
            columns: ["tela_id"]
            isOneToOne: false
            referencedRelation: "telas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_historico_hardware_trocado_por_usuario_id_fkey"
            columns: ["trocado_por_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      player_telemetria: {
        Row: {
          cpu_usage: number | null
          espaco_disco_livre_mb: number | null
          id: string
          log_mensagem: string | null
          ping_timestamp: string
          player_id: string
          ram_usage: number | null
          status_conexao: string
        }
        Insert: {
          cpu_usage?: number | null
          espaco_disco_livre_mb?: number | null
          id?: string
          log_mensagem?: string | null
          ping_timestamp?: string
          player_id: string
          ram_usage?: number | null
          status_conexao: string
        }
        Update: {
          cpu_usage?: number | null
          espaco_disco_livre_mb?: number | null
          id?: string
          log_mensagem?: string | null
          ping_timestamp?: string
          player_id?: string
          ram_usage?: number | null
          status_conexao?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_telemetria_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          created_at: string
          empresa_operadora_id: string
          equipamento_id: string | null
          id: string
          player_key: string
          status_online: boolean
          ultima_comunicacao: string | null
          updated_at: string
          versao_app: string
        }
        Insert: {
          created_at?: string
          empresa_operadora_id: string
          equipamento_id?: string | null
          id?: string
          player_key: string
          status_online?: boolean
          ultima_comunicacao?: string | null
          updated_at?: string
          versao_app: string
        }
        Update: {
          created_at?: string
          empresa_operadora_id?: string
          equipamento_id?: string | null
          id?: string
          player_key?: string
          status_online?: boolean
          ultima_comunicacao?: string | null
          updated_at?: string
          versao_app?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: true
            referencedRelation: "equipamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      playlist_items: {
        Row: {
          created_at: string
          days: number[] | null
          duration: number
          end_time: string | null
          external_link_id: string | null
          id: string
          media_id: string | null
          playlist_id: string
          position: number
          start_time: string | null
          widget_id: string | null
        }
        Insert: {
          created_at?: string
          days?: number[] | null
          duration?: number
          end_time?: string | null
          external_link_id?: string | null
          id?: string
          media_id?: string | null
          playlist_id: string
          position?: number
          start_time?: string | null
          widget_id?: string | null
        }
        Update: {
          created_at?: string
          days?: number[] | null
          duration?: number
          end_time?: string | null
          external_link_id?: string | null
          id?: string
          media_id?: string | null
          playlist_id?: string
          position?: number
          start_time?: string | null
          widget_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_playlist_items_external_link"
            columns: ["external_link_id"]
            isOneToOne: false
            referencedRelation: "external_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_playlist_items_media"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_playlist_items_widget"
            columns: ["widget_id"]
            isOneToOne: false
            referencedRelation: "widgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlist_items_external_link_id_fkey"
            columns: ["external_link_id"]
            isOneToOne: false
            referencedRelation: "external_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlist_items_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlist_items_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlist_items_widget_id_fkey"
            columns: ["widget_id"]
            isOneToOne: false
            referencedRelation: "widgets"
            referencedColumns: ["id"]
          },
        ]
      }
      playlists: {
        Row: {
          company_id: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          last_modified: string | null
          name: string
          resolution: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          last_modified?: string | null
          name: string
          resolution?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          last_modified?: string | null
          name?: string
          resolution?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company_name: string
          created_at: string
          email: string
          full_name: string
          id: string
          status: Database["public"]["Enums"]["approval_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          company_name: string
          created_at?: string
          email: string
          full_name: string
          id?: string
          status?: Database["public"]["Enums"]["approval_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          company_name?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          status?: Database["public"]["Enums"]["approval_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      proof_of_play: {
        Row: {
          captured_at: string | null
          device_id: string | null
          id: string
          media_id: string | null
          screenshot_url: string | null
        }
        Insert: {
          captured_at?: string | null
          device_id?: string | null
          id?: string
          media_id?: string | null
          screenshot_url?: string | null
        }
        Update: {
          captured_at?: string | null
          device_id?: string | null
          id?: string
          media_id?: string | null
          screenshot_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proof_of_play_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proof_of_play_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "medias"
            referencedColumns: ["id"]
          },
        ]
      }
      proposta_versoes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          numero_versao: number
          pdf_url: string | null
          proposta_id: string
          snapshot_dados: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          numero_versao: number
          pdf_url?: string | null
          proposta_id: string
          snapshot_dados: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          numero_versao?: number
          pdf_url?: string | null
          proposta_id?: string
          snapshot_dados?: Json
        }
        Relationships: [
          {
            foreignKeyName: "proposta_versoes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposta_versoes_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "propostas"
            referencedColumns: ["id"]
          },
        ]
      }
      propostas: {
        Row: {
          cliente_id: string
          created_at: string
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          desconto: number | null
          empresa_operadora_id: string
          forma_pagamento: string
          id: string
          numero_proposta: string
          observacoes: string | null
          pdf_url: string | null
          representante_id: string
          status: string
          updated_at: string
          updated_by: string | null
          validade_dias: number
          valor_final: number
          valor_total: number
          versao_atual: number
          version: number
        }
        Insert: {
          cliente_id: string
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          desconto?: number | null
          empresa_operadora_id: string
          forma_pagamento: string
          id?: string
          numero_proposta: string
          observacoes?: string | null
          pdf_url?: string | null
          representante_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          validade_dias?: number
          valor_final: number
          valor_total: number
          versao_atual?: number
          version?: number
        }
        Update: {
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          desconto?: number | null
          empresa_operadora_id?: string
          forma_pagamento?: string
          id?: string
          numero_proposta?: string
          observacoes?: string | null
          pdf_url?: string | null
          representante_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          validade_dias?: number
          valor_final?: number
          valor_total?: number
          versao_atual?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "propostas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "representantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      redes: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          empresa_operadora_id: string
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          empresa_operadora_id: string
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          empresa_operadora_id?: string
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "redes_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
        ]
      }
      remote_commands: {
        Row: {
          command: string
          created_at: string
          executed_at: string | null
          id: string
          payload: Json | null
          screen_id: string
          status: string
        }
        Insert: {
          command: string
          created_at?: string
          executed_at?: string | null
          id?: string
          payload?: Json | null
          screen_id: string
          status?: string
        }
        Update: {
          command?: string
          created_at?: string
          executed_at?: string | null
          id?: string
          payload?: Json | null
          screen_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "remote_commands_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "screens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remote_commands_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "vw_offline_screens"
            referencedColumns: ["id"]
          },
        ]
      }
      representantes: {
        Row: {
          ativo: boolean
          banco_agencia: string | null
          banco_conta: string | null
          banco_nome: string | null
          chave_pix: string | null
          codigo_representante: number | null
          comissao_porcentagem: number | null
          cpf_cnpj: string
          created_at: string
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          empresa_operadora_id: string
          id: string
          razao_social: string | null
          updated_at: string
          updated_by: string | null
          usuario_id: string
          version: number
        }
        Insert: {
          ativo?: boolean
          banco_agencia?: string | null
          banco_conta?: string | null
          banco_nome?: string | null
          chave_pix?: string | null
          codigo_representante?: number | null
          comissao_porcentagem?: number | null
          cpf_cnpj: string
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          empresa_operadora_id: string
          id?: string
          razao_social?: string | null
          updated_at?: string
          updated_by?: string | null
          usuario_id: string
          version?: number
        }
        Update: {
          ativo?: boolean
          banco_agencia?: string | null
          banco_conta?: string | null
          banco_nome?: string | null
          chave_pix?: string | null
          codigo_representante?: number | null
          comissao_porcentagem?: number | null
          cpf_cnpj?: string
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          empresa_operadora_id?: string
          id?: string
          razao_social?: string | null
          updated_at?: string
          updated_by?: string | null
          usuario_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "representantes_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "representantes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      revisoes: {
        Row: {
          campanha_id: string
          concluido: boolean
          created_at: string
          descricao_ajuste: string
          id: string
          solicitado_por_nome: string
        }
        Insert: {
          campanha_id: string
          concluido?: boolean
          created_at?: string
          descricao_ajuste: string
          id?: string
          solicitado_por_nome: string
        }
        Update: {
          campanha_id?: string
          concluido?: boolean
          created_at?: string
          descricao_ajuste?: string
          id?: string
          solicitado_por_nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "revisoes_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string | null
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string | null
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string | null
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      roles_permissoes: {
        Row: {
          created_at: string
          id: string
          perfil_id: string
          permissao: string
        }
        Insert: {
          created_at?: string
          id?: string
          perfil_id: string
          permissao: string
        }
        Update: {
          created_at?: string
          id?: string
          perfil_id?: string
          permissao?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_permissoes_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      screen_schedules: {
        Row: {
          created_at: string
          days_of_week: number[]
          end_time: string
          id: string
          is_active: boolean
          name: string
          playlist_id: string
          priority: number
          screen_id: string
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          days_of_week?: number[]
          end_time: string
          id?: string
          is_active?: boolean
          name: string
          playlist_id: string
          priority?: number
          screen_id: string
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          days_of_week?: number[]
          end_time?: string
          id?: string
          is_active?: boolean
          name?: string
          playlist_id?: string
          priority?: number
          screen_id?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "screen_schedules_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screen_schedules_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "screens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screen_schedules_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "vw_offline_screens"
            referencedColumns: ["id"]
          },
        ]
      }
      screens: {
        Row: {
          app_version: string | null
          audio_enabled: boolean | null
          cpu_temp: string | null
          created_at: string
          custom_id: string | null
          description: string | null
          device_type: string | null
          free_space: string | null
          hardware_version: string | null
          id: string
          ip_address: string | null
          is_active: boolean
          last_action: string | null
          last_action_at: string | null
          last_action_value: string | null
          last_ping_at: string | null
          last_screenshot_at: string | null
          last_screenshot_type: string | null
          last_screenshot_url: string | null
          location: string | null
          name: string
          orientation: string | null
          playlist_id: string | null
          ram_usage: string | null
          resolution: string | null
          saved_playlist_id: string | null
          status: string | null
          status_note: string | null
          updated_at: string
          uptime: string | null
          user_id: string
          version: string | null
        }
        Insert: {
          app_version?: string | null
          audio_enabled?: boolean | null
          cpu_temp?: string | null
          created_at?: string
          custom_id?: string | null
          description?: string | null
          device_type?: string | null
          free_space?: string | null
          hardware_version?: string | null
          id?: string
          ip_address?: string | null
          is_active?: boolean
          last_action?: string | null
          last_action_at?: string | null
          last_action_value?: string | null
          last_ping_at?: string | null
          last_screenshot_at?: string | null
          last_screenshot_type?: string | null
          last_screenshot_url?: string | null
          location?: string | null
          name: string
          orientation?: string | null
          playlist_id?: string | null
          ram_usage?: string | null
          resolution?: string | null
          saved_playlist_id?: string | null
          status?: string | null
          status_note?: string | null
          updated_at?: string
          uptime?: string | null
          user_id: string
          version?: string | null
        }
        Update: {
          app_version?: string | null
          audio_enabled?: boolean | null
          cpu_temp?: string | null
          created_at?: string
          custom_id?: string | null
          description?: string | null
          device_type?: string | null
          free_space?: string | null
          hardware_version?: string | null
          id?: string
          ip_address?: string | null
          is_active?: boolean
          last_action?: string | null
          last_action_at?: string | null
          last_action_value?: string | null
          last_ping_at?: string | null
          last_screenshot_at?: string | null
          last_screenshot_type?: string | null
          last_screenshot_url?: string | null
          location?: string | null
          name?: string
          orientation?: string | null
          playlist_id?: string | null
          ram_usage?: string | null
          resolution?: string | null
          saved_playlist_id?: string | null
          status?: string | null
          status_note?: string | null
          updated_at?: string
          uptime?: string | null
          user_id?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "screens_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      screenshots_logs: {
        Row: {
          captured_at: string | null
          device_id: string | null
          id: string
          image_url: string | null
          media_id: string | null
        }
        Insert: {
          captured_at?: string | null
          device_id?: string | null
          id?: string
          image_url?: string | null
          media_id?: string | null
        }
        Update: {
          captured_at?: string | null
          device_id?: string | null
          id?: string
          image_url?: string | null
          media_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "screenshots_logs_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      sequencias_numeracao: {
        Row: {
          ano: number
          empresa_operadora_id: string
          id: string
          tipo_documento: string
          ultimo_valor: number
          updated_at: string
        }
        Insert: {
          ano: number
          empresa_operadora_id: string
          id?: string
          tipo_documento: string
          ultimo_valor?: number
          updated_at?: string
        }
        Update: {
          ano?: number
          empresa_operadora_id?: string
          id?: string
          tipo_documento?: string
          ultimo_valor?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sequencias_numeracao_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes_acesso: {
        Row: {
          approval_token_expires_at: string | null
          approval_token_hash: string | null
          approval_used_at: string | null
          approved_at: string | null
          approved_by: string | null
          auth_user_id: string | null
          created_at: string
          dados_cadastro: Json | null
          email_admin_enviado: boolean
          email_admin_enviado_em: string | null
          email_usuario: string
          empresa_operadora_id: string | null
          id: string
          motivo_rejeicao: string | null
          nome_usuario: string
          rejected_at: string | null
          rejected_by: string | null
          status: string
          telefone: string | null
          tentativas_envio: number
          tipo_acesso: string
          updated_at: string
          usuario_id: string | null
        }
        Insert: {
          approval_token_expires_at?: string | null
          approval_token_hash?: string | null
          approval_used_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          auth_user_id?: string | null
          created_at?: string
          dados_cadastro?: Json | null
          email_admin_enviado?: boolean
          email_admin_enviado_em?: string | null
          email_usuario: string
          empresa_operadora_id?: string | null
          id?: string
          motivo_rejeicao?: string | null
          nome_usuario: string
          rejected_at?: string | null
          rejected_by?: string | null
          status?: string
          telefone?: string | null
          tentativas_envio?: number
          tipo_acesso: string
          updated_at?: string
          usuario_id?: string | null
        }
        Update: {
          approval_token_expires_at?: string | null
          approval_token_hash?: string | null
          approval_used_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          auth_user_id?: string | null
          created_at?: string
          dados_cadastro?: Json | null
          email_admin_enviado?: boolean
          email_admin_enviado_em?: string | null
          email_usuario?: string
          empresa_operadora_id?: string | null
          id?: string
          motivo_rejeicao?: string | null
          nome_usuario?: string
          rejected_at?: string | null
          rejected_by?: string | null
          status?: string
          telefone?: string | null
          tentativas_envio?: number
          tipo_acesso?: string
          updated_at?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_acesso_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_acesso_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_acesso_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_acesso_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      system_errors: {
        Row: {
          created_at: string | null
          error_type: string
          hardware_stats: Json | null
          id: number
          message: string | null
          screen_id: string
          stack_trace: string | null
        }
        Insert: {
          created_at?: string | null
          error_type: string
          hardware_stats?: Json | null
          id?: number
          message?: string | null
          screen_id: string
          stack_trace?: string | null
        }
        Update: {
          created_at?: string | null
          error_type?: string
          hardware_stats?: Json | null
          id?: number
          message?: string | null
          screen_id?: string
          stack_trace?: string | null
        }
        Relationships: []
      }
      system_ownership: {
        Row: {
          created_at: string | null
          id: string
          locked: boolean | null
          organization_id: string
          owner_user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          locked?: boolean | null
          organization_id: string
          owner_user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          locked?: boolean | null
          organization_id?: string
          owner_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_ownership_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_ownership_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefas_producao: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          ordem_producao_id: string
          status: string
          titulo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          ordem_producao_id: string
          status?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          ordem_producao_id?: string
          status?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefas_producao_ordem_producao_id_fkey"
            columns: ["ordem_producao_id"]
            isOneToOne: false
            referencedRelation: "ordens_producao"
            referencedColumns: ["id"]
          },
        ]
      }
      telas: {
        Row: {
          ativo: boolean
          created_at: string
          deleted_at: string | null
          empresa_operadora_id: string
          id: string
          local_id: string
          nome_tela: string
          orientacao: string
          resolucao: string
          screen_code: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          deleted_at?: string | null
          empresa_operadora_id: string
          id?: string
          local_id: string
          nome_tela: string
          orientacao?: string
          resolucao?: string
          screen_code?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          deleted_at?: string | null
          empresa_operadora_id?: string
          id?: string
          local_id?: string
          nome_tela?: string
          orientacao?: string
          resolucao?: string
          screen_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "telas_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telas_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "locais"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline: {
        Row: {
          acao: string
          contrato_id: string
          descricao: string
          empresa_operadora_id: string
          id: string
          metadata: Json | null
          status_anterior: string | null
          status_novo: string | null
          timestamp: string
          usuario_id: string | null
          usuario_nome: string
          usuario_role: string
        }
        Insert: {
          acao: string
          contrato_id: string
          descricao: string
          empresa_operadora_id: string
          id?: string
          metadata?: Json | null
          status_anterior?: string | null
          status_novo?: string | null
          timestamp?: string
          usuario_id?: string | null
          usuario_nome: string
          usuario_role: string
        }
        Update: {
          acao?: string
          contrato_id?: string
          descricao?: string
          empresa_operadora_id?: string
          id?: string
          metadata?: Json | null
          status_anterior?: string | null
          status_novo?: string | null
          timestamp?: string
          usuario_id?: string | null
          usuario_nome?: string
          usuario_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "timeline_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      unidades: {
        Row: {
          ativo: boolean
          cidade: string
          created_at: string
          endereco: string | null
          estado: string
          id: string
          nome: string
          rede_id: string
        }
        Insert: {
          ativo?: boolean
          cidade: string
          created_at?: string
          endereco?: string | null
          estado: string
          id?: string
          nome: string
          rede_id: string
        }
        Update: {
          ativo?: boolean
          cidade?: string
          created_at?: string
          endereco?: string | null
          estado?: string
          id?: string
          nome?: string
          rede_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unidades_rede_id_fkey"
            columns: ["rede_id"]
            isOneToOne: false
            referencedRelation: "redes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      usuarios: {
        Row: {
          ativo: boolean
          avatar_url: string | null
          created_at: string
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          department_id: string | null
          email: string
          empresa_operadora_id: string
          id: string
          is_owner: boolean | null
          nome: string
          organization_id: string | null
          owner_locked: boolean | null
          ownership_scope: string | null
          perfil_id: string
          role_id: string | null
          status: string | null
          telefone: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          ativo?: boolean
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
          email: string
          empresa_operadora_id: string
          id: string
          is_owner?: boolean | null
          nome: string
          organization_id?: string | null
          owner_locked?: boolean | null
          ownership_scope?: string | null
          perfil_id: string
          role_id?: string | null
          status?: string | null
          telefone?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          ativo?: boolean
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
          email?: string
          empresa_operadora_id?: string
          id?: string
          is_owner?: boolean | null
          nome?: string
          organization_id?: string | null
          owner_locked?: boolean | null
          ownership_scope?: string | null
          perfil_id?: string
          role_id?: string | null
          status?: string | null
          telefone?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuarios_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuarios_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuarios_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuarios_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      visita_checkins: {
        Row: {
          agenda_visita_id: string
          checkin_lat: number | null
          checkin_lng: number | null
          checkin_timestamp: string
          checkout_timestamp: string | null
          created_at: string
          foto_comprovante_url: string | null
          id: string
          observacoes: string | null
          resultado_visita: string | null
        }
        Insert: {
          agenda_visita_id: string
          checkin_lat?: number | null
          checkin_lng?: number | null
          checkin_timestamp?: string
          checkout_timestamp?: string | null
          created_at?: string
          foto_comprovante_url?: string | null
          id?: string
          observacoes?: string | null
          resultado_visita?: string | null
        }
        Update: {
          agenda_visita_id?: string
          checkin_lat?: number | null
          checkin_lng?: number | null
          checkin_timestamp?: string
          checkout_timestamp?: string | null
          created_at?: string
          foto_comprovante_url?: string | null
          id?: string
          observacoes?: string | null
          resultado_visita?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visita_checkins_agenda_visita_id_fkey"
            columns: ["agenda_visita_id"]
            isOneToOne: false
            referencedRelation: "agenda_visitas"
            referencedColumns: ["id"]
          },
        ]
      }
      widgets: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_active: boolean
          name: string
          thumbnail_url: string | null
          updated_at: string
          user_id: string
          widget_type: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          thumbnail_url?: string | null
          updated_at?: string
          user_id: string
          widget_type: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          thumbnail_url?: string | null
          updated_at?: string
          user_id?: string
          widget_type?: string
        }
        Relationships: []
      }
    }
    Views: {
      mv_daily_stats: {
        Row: {
          log_day: string | null
          screen_id: string | null
          total_plays: number | null
        }
        Relationships: []
      }
      vw_daily_stats: {
        Row: {
          day: string | null
          total_duration_seconds: number | null
          total_plays: number | null
        }
        Relationships: []
      }
      vw_industrial_monitoring: {
        Row: {
          app_version: string | null
          connectivity_status: string | null
          cpu_temp: string | null
          custom_id: string | null
          free_space: string | null
          last_ping_at: string | null
          name: string | null
          ram_usage: string | null
          status: string | null
          uptime: string | null
        }
        Insert: {
          app_version?: string | null
          connectivity_status?: never
          cpu_temp?: string | null
          custom_id?: string | null
          free_space?: string | null
          last_ping_at?: string | null
          name?: string | null
          ram_usage?: string | null
          status?: string | null
          uptime?: string | null
        }
        Update: {
          app_version?: string | null
          connectivity_status?: never
          cpu_temp?: string | null
          custom_id?: string | null
          free_space?: string | null
          last_ping_at?: string | null
          name?: string | null
          ram_usage?: string | null
          status?: string | null
          uptime?: string | null
        }
        Relationships: []
      }
      vw_media_popularity: {
        Row: {
          media_id: string | null
          media_name: string | null
          play_count: number | null
          total_duration_seconds: number | null
        }
        Relationships: []
      }
      vw_offline_screens: {
        Row: {
          custom_id: string | null
          id: string | null
          last_ping_at: string | null
          name: string | null
          offline_duration: string | null
        }
        Insert: {
          custom_id?: string | null
          id?: string | null
          last_ping_at?: string | null
          name?: string | null
          offline_duration?: never
        }
        Update: {
          custom_id?: string | null
          id?: string | null
          last_ping_at?: string | null
          name?: string | null
          offline_duration?: never
        }
        Relationships: []
      }
      vw_screen_activity: {
        Row: {
          last_play_at: string | null
          screen_id: string | null
          total_plays: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      delete_old_logs: { Args: never; Returns: undefined }
      fn_cadastrar_cliente_atomo: {
        Args: {
          p_bairro: string
          p_cargo_representante: string
          p_cep: string
          p_cidade: string
          p_cnpj: string
          p_complemento: string
          p_contato_cargo: string
          p_contato_email: string
          p_contato_nome: string
          p_contato_telefone: string
          p_email: string
          p_empresa_operadora_id: string
          p_estado: string
          p_logradouro: string
          p_nome_fantasia: string
          p_numero: string
          p_observacoes: string
          p_razao_social: string
          p_representante_id: string
          p_representante_legal: string
          p_segmento: string
          p_status: string
          p_telefone: string
          p_whatsapp: string
        }
        Returns: Json
      }
      fn_gerar_numero_contrato_atomo: {
        Args: { p_empresa_operadora_id: string }
        Returns: string
      }
      gerar_numero_documento: {
        Args: { p_ano?: number; p_tenant_id: string; p_tipo: string }
        Returns: string
      }
      get_screen_stats: {
        Args: {
          end_date: string
          period: string
          start_date: string
          target_screen_id: string
        }
        Returns: {
          label: string
          value: number
        }[]
      }
      get_tenant_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      pulse_screen:
        | {
            Args: {
              p_free_space?: string
              p_ram_usage?: string
              p_screen_id: string
              p_status: string
              p_version: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_device_type?: string
              p_free_space?: string
              p_ram_usage?: string
              p_screen_id: string
              p_status: string
              p_version: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_cpu_temp?: string
              p_device_type?: string
              p_free_space?: string
              p_ip_address?: string
              p_ram_usage?: string
              p_screen_id: string
              p_status: string
              p_uptime?: string
              p_version: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_free_space?: string
              p_ram_usage?: string
              p_screen_id: string
              p_status: string
              p_version: string
            }
            Returns: Json
          }
      purge_old_logs: { Args: never; Returns: undefined }
      refresh_daily_stats: { Args: never; Returns: undefined }
      report_error: {
        Args: {
          p_error_type: string
          p_hardware_stats?: Json
          p_message: string
          p_screen_id: string
          p_stack_trace: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "editor" | "viewer"
      approval_status: "pending" | "approved" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "editor", "viewer"],
      approval_status: ["pending", "approved", "rejected"],
    },
  },
} as const

