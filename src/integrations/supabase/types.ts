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
            foreignKeyName: "agenda_visitas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_cliente"
            referencedColumns: ["cliente_id"]
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
      agendamento_auditoria: {
        Row: {
          agendamento_id: string
          created_at: string
          detalhes: Json | null
          evento: string
          id: string
          usuario_id: string | null
        }
        Insert: {
          agendamento_id: string
          created_at?: string
          detalhes?: Json | null
          evento: string
          id?: string
          usuario_id?: string | null
        }
        Update: {
          agendamento_id?: string
          created_at?: string
          detalhes?: Json | null
          evento?: string
          id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agendamento_auditoria_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamento_auditoria_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_campanha"
            referencedColumns: ["agendamento_id"]
          },
          {
            foreignKeyName: "agendamento_auditoria_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "dw_fact_exibicao"
            referencedColumns: ["agendamento_id"]
          },
          {
            foreignKeyName: "agendamento_auditoria_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      agendamento_conflitos: {
        Row: {
          agendamento_exist_id: string | null
          agendamento_novo_id: string | null
          created_at: string
          id: string
          motivo: string
          resolvido: boolean
          screen_id: string | null
        }
        Insert: {
          agendamento_exist_id?: string | null
          agendamento_novo_id?: string | null
          created_at?: string
          id?: string
          motivo: string
          resolvido?: boolean
          screen_id?: string | null
        }
        Update: {
          agendamento_exist_id?: string | null
          agendamento_novo_id?: string | null
          created_at?: string
          id?: string
          motivo?: string
          resolvido?: boolean
          screen_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agendamento_conflitos_agendamento_exist_id_fkey"
            columns: ["agendamento_exist_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamento_conflitos_agendamento_exist_id_fkey"
            columns: ["agendamento_exist_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_campanha"
            referencedColumns: ["agendamento_id"]
          },
          {
            foreignKeyName: "agendamento_conflitos_agendamento_exist_id_fkey"
            columns: ["agendamento_exist_id"]
            isOneToOne: false
            referencedRelation: "dw_fact_exibicao"
            referencedColumns: ["agendamento_id"]
          },
          {
            foreignKeyName: "agendamento_conflitos_agendamento_novo_id_fkey"
            columns: ["agendamento_novo_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamento_conflitos_agendamento_novo_id_fkey"
            columns: ["agendamento_novo_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_campanha"
            referencedColumns: ["agendamento_id"]
          },
          {
            foreignKeyName: "agendamento_conflitos_agendamento_novo_id_fkey"
            columns: ["agendamento_novo_id"]
            isOneToOne: false
            referencedRelation: "dw_fact_exibicao"
            referencedColumns: ["agendamento_id"]
          },
          {
            foreignKeyName: "agendamento_conflitos_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_tela"
            referencedColumns: ["tela_id"]
          },
          {
            foreignKeyName: "agendamento_conflitos_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "screens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamento_conflitos_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "vw_offline_screens"
            referencedColumns: ["id"]
          },
        ]
      }
      agendamento_historico: {
        Row: {
          agendamento_id: string
          criado_em: string
          criado_por: string | null
          dias_semana: number[] | null
          empresa_operadora_id: string
          hora_fim: string
          hora_inicio: string
          id: string
          playlist_id: string | null
          screen_id: string | null
        }
        Insert: {
          agendamento_id: string
          criado_em?: string
          criado_por?: string | null
          dias_semana?: number[] | null
          empresa_operadora_id: string
          hora_fim?: string
          hora_inicio?: string
          id?: string
          playlist_id?: string | null
          screen_id?: string | null
        }
        Update: {
          agendamento_id?: string
          criado_em?: string
          criado_por?: string | null
          dias_semana?: number[] | null
          empresa_operadora_id?: string
          hora_fim?: string
          hora_inicio?: string
          id?: string
          playlist_id?: string | null
          screen_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agendamento_historico_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamento_historico_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_campanha"
            referencedColumns: ["agendamento_id"]
          },
          {
            foreignKeyName: "agendamento_historico_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "dw_fact_exibicao"
            referencedColumns: ["agendamento_id"]
          },
          {
            foreignKeyName: "agendamento_historico_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamento_historico_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamento_historico_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_tela"
            referencedColumns: ["tela_id"]
          },
          {
            foreignKeyName: "agendamento_historico_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "screens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamento_historico_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "vw_offline_screens"
            referencedColumns: ["id"]
          },
        ]
      }
      agendamento_telas: {
        Row: {
          agendamento_id: string
          created_at: string
          id: string
          last_synced_at: string | null
          screen_id: string
          status_sync: string
        }
        Insert: {
          agendamento_id: string
          created_at?: string
          id?: string
          last_synced_at?: string | null
          screen_id: string
          status_sync?: string
        }
        Update: {
          agendamento_id?: string
          created_at?: string
          id?: string
          last_synced_at?: string | null
          screen_id?: string
          status_sync?: string
        }
        Relationships: [
          {
            foreignKeyName: "agendamento_telas_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamento_telas_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_campanha"
            referencedColumns: ["agendamento_id"]
          },
          {
            foreignKeyName: "agendamento_telas_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "dw_fact_exibicao"
            referencedColumns: ["agendamento_id"]
          },
          {
            foreignKeyName: "agendamento_telas_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_tela"
            referencedColumns: ["tela_id"]
          },
          {
            foreignKeyName: "agendamento_telas_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "screens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamento_telas_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "vw_offline_screens"
            referencedColumns: ["id"]
          },
        ]
      }
      agendamentos: {
        Row: {
          cliente_id: string | null
          contrato_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          dias_semana: string[] | null
          empresa_operadora_id: string
          fim: string
          hora_fim: string | null
          hora_inicio: string | null
          id: string
          inicio: string
          insercoes_por_hora: number | null
          media_id: string | null
          pedido_insercao_id: string
          playlist_id: string | null
          prioridade: number
          producao_id: string | null
          status: string
          timezone: string
          titulo: string
          total_telas: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cliente_id?: string | null
          contrato_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dias_semana?: string[] | null
          empresa_operadora_id: string
          fim: string
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          inicio: string
          insercoes_por_hora?: number | null
          media_id?: string | null
          pedido_insercao_id: string
          playlist_id?: string | null
          prioridade?: number
          producao_id?: string | null
          status?: string
          timezone?: string
          titulo: string
          total_telas?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cliente_id?: string | null
          contrato_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dias_semana?: string[] | null
          empresa_operadora_id?: string
          fim?: string
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          inicio?: string
          insercoes_por_hora?: number | null
          media_id?: string | null
          pedido_insercao_id?: string
          playlist_id?: string | null
          prioridade?: number
          producao_id?: string | null
          status?: string
          timezone?: string
          titulo?: string
          total_telas?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_cliente"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "agendamentos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_contrato"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "agendamentos_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "medias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_pedido_insercao_id_fkey"
            columns: ["pedido_insercao_id"]
            isOneToOne: false
            referencedRelation: "pedidos_insercao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_producao_id_fkey"
            columns: ["producao_id"]
            isOneToOne: false
            referencedRelation: "ordens_producao"
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
          sha256: string | null
          version_code: number
          version_name: string
        }
        Insert: {
          apk_url: string
          created_at?: string | null
          id?: string
          is_mandatory?: boolean | null
          release_notes?: string | null
          sha256?: string | null
          version_code: number
          version_name: string
        }
        Update: {
          apk_url?: string
          created_at?: string | null
          id?: string
          is_mandatory?: boolean | null
          release_notes?: string | null
          sha256?: string | null
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
      assinatura_auditoria: {
        Row: {
          created_at: string
          detalhes: Json | null
          empresa_operadora_id: string
          evento: string
          id: string
          ip: string | null
          user_agent: string | null
          usuario_id: string | null
        }
        Insert: {
          created_at?: string
          detalhes?: Json | null
          empresa_operadora_id: string
          evento: string
          id?: string
          ip?: string | null
          user_agent?: string | null
          usuario_id?: string | null
        }
        Update: {
          created_at?: string
          detalhes?: Json | null
          empresa_operadora_id?: string
          evento?: string
          id?: string
          ip?: string | null
          user_agent?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assinatura_auditoria_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinatura_auditoria_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      assinatura_eventos: {
        Row: {
          assinatura_id: string
          created_at: string
          detalhes: Json | null
          evento: string
          id: string
        }
        Insert: {
          assinatura_id: string
          created_at?: string
          detalhes?: Json | null
          evento: string
          id?: string
        }
        Update: {
          assinatura_id?: string
          created_at?: string
          detalhes?: Json | null
          evento?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assinatura_eventos_assinatura_id_fkey"
            columns: ["assinatura_id"]
            isOneToOne: false
            referencedRelation: "assinaturas"
            referencedColumns: ["id"]
          },
        ]
      }
      assinaturas: {
        Row: {
          assinado_em: string | null
          assinado_por_usuario_id: string | null
          cancelado_em: string | null
          contrato_id: string
          created_at: string
          document_hash: string | null
          empresa_operadora_id: string
          envelope_id: string
          expira_em: string | null
          id: string
          ip_assinatura: string | null
          pdf_assinado_key: string | null
          pdf_original_key: string | null
          provedor: string
          signatario_cpf_cnpj: string | null
          signatario_email: string | null
          signatario_nome: string | null
          status: string
          updated_at: string
          user_agent_assinatura: string | null
          visualizado_em: string | null
        }
        Insert: {
          assinado_em?: string | null
          assinado_por_usuario_id?: string | null
          cancelado_em?: string | null
          contrato_id: string
          created_at?: string
          document_hash?: string | null
          empresa_operadora_id: string
          envelope_id: string
          expira_em?: string | null
          id?: string
          ip_assinatura?: string | null
          pdf_assinado_key?: string | null
          pdf_original_key?: string | null
          provedor?: string
          signatario_cpf_cnpj?: string | null
          signatario_email?: string | null
          signatario_nome?: string | null
          status?: string
          updated_at?: string
          user_agent_assinatura?: string | null
          visualizado_em?: string | null
        }
        Update: {
          assinado_em?: string | null
          assinado_por_usuario_id?: string | null
          cancelado_em?: string | null
          contrato_id?: string
          created_at?: string
          document_hash?: string | null
          empresa_operadora_id?: string
          envelope_id?: string
          expira_em?: string | null
          id?: string
          ip_assinatura?: string | null
          pdf_assinado_key?: string | null
          pdf_original_key?: string | null
          provedor?: string
          signatario_cpf_cnpj?: string | null
          signatario_email?: string | null
          signatario_nome?: string | null
          status?: string
          updated_at?: string
          user_agent_assinatura?: string | null
          visualizado_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assinaturas_assinado_por_usuario_id_fkey"
            columns: ["assinado_por_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinaturas_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinaturas_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_contrato"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "assinaturas_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
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
      bi_snapshots: {
        Row: {
          empresa_operadora_id: string
          gerado_em: string
          gerado_por: string | null
          id: string
          payload: Json
          tipo_relatorio: string
        }
        Insert: {
          empresa_operadora_id: string
          gerado_em?: string
          gerado_por?: string | null
          id?: string
          payload: Json
          tipo_relatorio: string
        }
        Update: {
          empresa_operadora_id?: string
          gerado_em?: string
          gerado_por?: string | null
          id?: string
          payload?: Json
          tipo_relatorio?: string
        }
        Relationships: [
          {
            foreignKeyName: "bi_snapshots_empresa_operadora_id_fkey"
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
            foreignKeyName: "biblioteca_midias_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_cliente"
            referencedColumns: ["cliente_id"]
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
            foreignKeyName: "campanhas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_cliente"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "campanhas_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanhas_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_contrato"
            referencedColumns: ["contrato_id"]
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
          bloqueado_em: string | null
          bloqueio_financeiro: boolean
          bloqueio_motivo: string | null
          codigo_cliente: number
          created_at: string
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          empresa_operadora_id: string
          id: string
          representante_id: string | null
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          bloqueado_em?: string | null
          bloqueio_financeiro?: boolean
          bloqueio_motivo?: string | null
          codigo_cliente: number
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          empresa_operadora_id: string
          id?: string
          representante_id?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          bloqueado_em?: string | null
          bloqueio_financeiro?: boolean
          bloqueio_motivo?: string | null
          codigo_cliente?: number
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          empresa_operadora_id?: string
          id?: string
          representante_id?: string | null
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
      comissoes: {
        Row: {
          contrato_id: string
          created_at: string
          data_liberacao: string | null
          data_pagamento: string | null
          empresa_operadora_id: string | null
          id: string
          porcentagem: number
          status: string
          valor_base: number
          valor_comissao: number
          vendedor_id: string | null
        }
        Insert: {
          contrato_id: string
          created_at?: string
          data_liberacao?: string | null
          data_pagamento?: string | null
          empresa_operadora_id?: string | null
          id?: string
          porcentagem?: number
          status?: string
          valor_base?: number
          valor_comissao: number
          vendedor_id?: string | null
        }
        Update: {
          contrato_id?: string
          created_at?: string
          data_liberacao?: string | null
          data_pagamento?: string | null
          empresa_operadora_id?: string | null
          id?: string
          porcentagem?: number
          status?: string
          valor_base?: number
          valor_comissao?: number
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_contrato"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "comissoes_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_vendedor_id_fkey"
            columns: ["vendedor_id"]
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
            foreignKeyName: "comissoes_representantes_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_contrato"
            referencedColumns: ["contrato_id"]
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
      comunicacao_eventos_catalogo: {
        Row: {
          ativo: boolean
          backoff_segundos: number
          canais_habilitados: string[]
          created_at: string
          descricao: string | null
          domain: string
          event_name: string
          id: string
          max_tentativas: number
          payload_schema: Json
          prioridade: string
          template_key_padrao: string | null
          tenant_scope: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          backoff_segundos?: number
          canais_habilitados?: string[]
          created_at?: string
          descricao?: string | null
          domain: string
          event_name: string
          id?: string
          max_tentativas?: number
          payload_schema?: Json
          prioridade?: string
          template_key_padrao?: string | null
          tenant_scope?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          backoff_segundos?: number
          canais_habilitados?: string[]
          created_at?: string
          descricao?: string | null
          domain?: string
          event_name?: string
          id?: string
          max_tentativas?: number
          payload_schema?: Json
          prioridade?: string
          template_key_padrao?: string | null
          tenant_scope?: string
          updated_at?: string
        }
        Relationships: []
      }
      comunicacao_preferencias: {
        Row: {
          canal: string
          empresa_operadora_id: string | null
          event_name: string
          habilitado: boolean
          id: string
          pode_desabilitar: boolean
          updated_at: string
          usuario_id: string
        }
        Insert: {
          canal: string
          empresa_operadora_id?: string | null
          event_name: string
          habilitado?: boolean
          id?: string
          pode_desabilitar?: boolean
          updated_at?: string
          usuario_id: string
        }
        Update: {
          canal?: string
          empresa_operadora_id?: string | null
          event_name?: string
          habilitado?: boolean
          id?: string
          pode_desabilitar?: boolean
          updated_at?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comunicacao_preferencias_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
        ]
      }
      comunicacao_templates: {
        Row: {
          assunto: string
          canal: string
          corpo: string
          created_at: string
          criado_por: string | null
          empresa_operadora_id: string | null
          event_name: string | null
          id: string
          status: string
          template_key: string
          updated_at: string
          variaveis: string[]
          versao: number
        }
        Insert: {
          assunto?: string
          canal: string
          corpo: string
          created_at?: string
          criado_por?: string | null
          empresa_operadora_id?: string | null
          event_name?: string | null
          id?: string
          status?: string
          template_key: string
          updated_at?: string
          variaveis?: string[]
          versao?: number
        }
        Update: {
          assunto?: string
          canal?: string
          corpo?: string
          created_at?: string
          criado_por?: string | null
          empresa_operadora_id?: string | null
          event_name?: string | null
          id?: string
          status?: string
          template_key?: string
          updated_at?: string
          variaveis?: string[]
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "comunicacao_templates_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comunicacao_templates_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
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
      contas_receber: {
        Row: {
          cliente_id: string | null
          codigo_operacional: string
          competencia_date: string | null
          contrato_id: string
          created_at: string
          currency: string
          data_recebimento: string | null
          data_vencimento: string
          empresa_operadora_id: string | null
          gerada_automaticamente: boolean
          id: string
          issue_date: string | null
          metodo_cobranca: string | null
          notes: string | null
          numero_documento: string | null
          numero_parcela: number
          payment_date: string | null
          recorrencia: string | null
          saldo: number | null
          situacao_cobranca: string
          status: string
          total_parcelas: number
          updated_at: string
          valor: number
          valor_pago: number
        }
        Insert: {
          cliente_id?: string | null
          codigo_operacional: string
          competencia_date?: string | null
          contrato_id: string
          created_at?: string
          currency?: string
          data_recebimento?: string | null
          data_vencimento: string
          empresa_operadora_id?: string | null
          gerada_automaticamente?: boolean
          id?: string
          issue_date?: string | null
          metodo_cobranca?: string | null
          notes?: string | null
          numero_documento?: string | null
          numero_parcela?: number
          payment_date?: string | null
          recorrencia?: string | null
          saldo?: number | null
          situacao_cobranca?: string
          status?: string
          total_parcelas?: number
          updated_at?: string
          valor: number
          valor_pago?: number
        }
        Update: {
          cliente_id?: string | null
          codigo_operacional?: string
          competencia_date?: string | null
          contrato_id?: string
          created_at?: string
          currency?: string
          data_recebimento?: string | null
          data_vencimento?: string
          empresa_operadora_id?: string | null
          gerada_automaticamente?: boolean
          id?: string
          issue_date?: string | null
          metodo_cobranca?: string | null
          notes?: string | null
          numero_documento?: string | null
          numero_parcela?: number
          payment_date?: string | null
          recorrencia?: string | null
          saldo?: number | null
          situacao_cobranca?: string
          status?: string
          total_parcelas?: number
          updated_at?: string
          valor?: number
          valor_pago?: number
        }
        Relationships: [
          {
            foreignKeyName: "contas_receber_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_receber_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_cliente"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "contas_receber_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_receber_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_contrato"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "contas_receber_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
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
            foreignKeyName: "contrato_auditoria_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_contrato"
            referencedColumns: ["contrato_id"]
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
          pdf_anexo_key: string | null
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
          pdf_anexo_key?: string | null
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
          pdf_anexo_key?: string | null
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
            foreignKeyName: "contrato_versoes_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_contrato"
            referencedColumns: ["contrato_id"]
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
          assinado_por: string | null
          assinatura_envelope_id: string | null
          cliente_id: string
          created_at: string
          created_by: string | null
          data_fim: string
          data_inicio: string
          data_selecao: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          documento_assinado_em: string | null
          documento_enviado_em: string | null
          empresa_id: string
          empresa_operadora_id: string
          forma_pagamento: string
          id: string
          numero_contrato: string
          numero_contrato_legivel: string | null
          pdf_assinado_key: string | null
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
          assinado_por?: string | null
          assinatura_envelope_id?: string | null
          cliente_id: string
          created_at?: string
          created_by?: string | null
          data_fim: string
          data_inicio: string
          data_selecao?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          documento_assinado_em?: string | null
          documento_enviado_em?: string | null
          empresa_id: string
          empresa_operadora_id: string
          forma_pagamento: string
          id?: string
          numero_contrato: string
          numero_contrato_legivel?: string | null
          pdf_assinado_key?: string | null
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
          assinado_por?: string | null
          assinatura_envelope_id?: string | null
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          data_fim?: string
          data_inicio?: string
          data_selecao?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          documento_assinado_em?: string | null
          documento_enviado_em?: string | null
          empresa_id?: string
          empresa_operadora_id?: string
          forma_pagamento?: string
          id?: string
          numero_contrato?: string
          numero_contrato_legivel?: string | null
          pdf_assinado_key?: string | null
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
            foreignKeyName: "contratos_assinado_por_fkey"
            columns: ["assinado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_cliente"
            referencedColumns: ["cliente_id"]
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
      conversa_mensagens: {
        Row: {
          conversa_id: string
          created_at: string
          empresa_operadora_id: string
          id: string
          mensagem: string
          remetente_id: string
        }
        Insert: {
          conversa_id: string
          created_at?: string
          empresa_operadora_id: string
          id?: string
          mensagem: string
          remetente_id: string
        }
        Update: {
          conversa_id?: string
          created_at?: string
          empresa_operadora_id?: string
          id?: string
          mensagem?: string
          remetente_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversa_mensagens_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversa_mensagens_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversa_mensagens_remetente_id_fkey"
            columns: ["remetente_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      conversa_participantes: {
        Row: {
          conversa_id: string
          created_at: string
          ultima_leitura: string | null
          usuario_id: string
        }
        Insert: {
          conversa_id: string
          created_at?: string
          ultima_leitura?: string | null
          usuario_id: string
        }
        Update: {
          conversa_id?: string
          created_at?: string
          ultima_leitura?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversa_participantes_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversa_participantes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      conversas: {
        Row: {
          created_at: string
          criado_por: string | null
          empresa_operadora_id: string
          id: string
          nome: string | null
          tipo: string
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          empresa_operadora_id: string
          id?: string
          nome?: string | null
          tipo?: string
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          empresa_operadora_id?: string
          id?: string
          nome?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
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
      device_health: {
        Row: {
          app_version: string | null
          battery_level: number | null
          current_media_id: string | null
          device_id: string
          last_seen: string | null
          storage_usage_percent: number | null
        }
        Insert: {
          app_version?: string | null
          battery_level?: number | null
          current_media_id?: string | null
          device_id: string
          last_seen?: string | null
          storage_usage_percent?: number | null
        }
        Update: {
          app_version?: string | null
          battery_level?: number | null
          current_media_id?: string | null
          device_id?: string
          last_seen?: string | null
          storage_usage_percent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "device_health_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: true
            referencedRelation: "devices"
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
      device_pairing_codes: {
        Row: {
          created_at: string
          device_model: string | null
          expires_at: string
          id: string
          identity_hash: string
          pairing_code: string
          screen_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          device_model?: string | null
          expires_at: string
          id?: string
          identity_hash: string
          pairing_code: string
          screen_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          device_model?: string | null
          expires_at?: string
          id?: string
          identity_hash?: string
          pairing_code?: string
          screen_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_pairing_codes_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_tela"
            referencedColumns: ["tela_id"]
          },
          {
            foreignKeyName: "device_pairing_codes_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "screens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_pairing_codes_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "vw_offline_screens"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          activated_at: string | null
          app_version: string | null
          brand: string | null
          created_at: string | null
          current_playlist_id: string | null
          id: string
          identity_hash: string | null
          ip_address: string | null
          is_online: boolean | null
          last_heartbeat: string | null
          last_seen: string | null
          mac_address: string | null
          model: string | null
          name: string
          os_version: string | null
          revoked_at: string | null
          screen_id: string | null
          screen_token: string | null
          storage_available: number | null
        }
        Insert: {
          activated_at?: string | null
          app_version?: string | null
          brand?: string | null
          created_at?: string | null
          current_playlist_id?: string | null
          id?: string
          identity_hash?: string | null
          ip_address?: string | null
          is_online?: boolean | null
          last_heartbeat?: string | null
          last_seen?: string | null
          mac_address?: string | null
          model?: string | null
          name: string
          os_version?: string | null
          revoked_at?: string | null
          screen_id?: string | null
          screen_token?: string | null
          storage_available?: number | null
        }
        Update: {
          activated_at?: string | null
          app_version?: string | null
          brand?: string | null
          created_at?: string | null
          current_playlist_id?: string | null
          id?: string
          identity_hash?: string | null
          ip_address?: string | null
          is_online?: boolean | null
          last_heartbeat?: string | null
          last_seen?: string | null
          mac_address?: string | null
          model?: string | null
          name?: string
          os_version?: string | null
          revoked_at?: string | null
          screen_id?: string | null
          screen_token?: string | null
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
      dw_dim_representante: {
        Row: {
          codigo_representante: number
          empresa_operadora_id: string
          razao_social: string | null
          representante_id: string
        }
        Insert: {
          codigo_representante: number
          empresa_operadora_id: string
          razao_social?: string | null
          representante_id: string
        }
        Update: {
          codigo_representante?: number
          empresa_operadora_id?: string
          razao_social?: string | null
          representante_id?: string
        }
        Relationships: []
      }
      dw_dim_tempo: {
        Row: {
          ano: number
          dia: number
          dia_semana: number
          e_fim_semana: boolean
          mes: number
          tempo_id: string
          trimestre: number
        }
        Insert: {
          ano: number
          dia: number
          dia_semana: number
          e_fim_semana: boolean
          mes: number
          tempo_id: string
          trimestre: number
        }
        Update: {
          ano?: number
          dia?: number
          dia_semana?: number
          e_fim_semana?: boolean
          mes?: number
          tempo_id?: string
          trimestre?: number
        }
        Relationships: []
      }
      dw_operacao: {
        Row: {
          created_at: string
          data_referencia: string
          empresa_operadora_id: string
          id: string
          incidentes_abertos: number | null
          taxa_uptime: number | null
          total_players_offline: number | null
          total_telas_ativas: number | null
        }
        Insert: {
          created_at?: string
          data_referencia: string
          empresa_operadora_id: string
          id?: string
          incidentes_abertos?: number | null
          taxa_uptime?: number | null
          total_players_offline?: number | null
          total_telas_ativas?: number | null
        }
        Update: {
          created_at?: string
          data_referencia?: string
          empresa_operadora_id?: string
          id?: string
          incidentes_abertos?: number | null
          taxa_uptime?: number | null
          total_players_offline?: number | null
          total_telas_ativas?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dw_operacao_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
        ]
      }
      dw_receita: {
        Row: {
          comissoes_pagas: number | null
          created_at: string
          empresa_operadora_id: string
          id: string
          inadimplencia: number | null
          mes_referencia: string
          receita_prevista: number | null
          receita_realizada: number | null
        }
        Insert: {
          comissoes_pagas?: number | null
          created_at?: string
          empresa_operadora_id: string
          id?: string
          inadimplencia?: number | null
          mes_referencia: string
          receita_prevista?: number | null
          receita_realizada?: number | null
        }
        Update: {
          comissoes_pagas?: number | null
          created_at?: string
          empresa_operadora_id?: string
          id?: string
          inadimplencia?: number | null
          mes_referencia?: string
          receita_prevista?: number | null
          receita_realizada?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dw_receita_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "empresas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_cliente"
            referencedColumns: ["cliente_id"]
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
      financeiro_auditoria: {
        Row: {
          created_at: string
          detalhes: Json | null
          empresa_operadora_id: string | null
          evento: string
          id: string
          usuario_id: string | null
        }
        Insert: {
          created_at?: string
          detalhes?: Json | null
          empresa_operadora_id?: string | null
          evento: string
          id?: string
          usuario_id?: string | null
        }
        Update: {
          created_at?: string
          detalhes?: Json | null
          empresa_operadora_id?: string | null
          evento?: string
          id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_auditoria_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_auditoria_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
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
            foreignKeyName: "financeiro_lancamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_cliente"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_contrato"
            referencedColumns: ["contrato_id"]
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
      fluxo_caixa: {
        Row: {
          categoria: string
          created_at: string
          data_movimento: string
          descricao: string
          empresa_operadora_id: string | null
          id: string
          tipo: string
          valor: number
        }
        Insert: {
          categoria: string
          created_at?: string
          data_movimento?: string
          descricao: string
          empresa_operadora_id?: string | null
          id?: string
          tipo: string
          valor: number
        }
        Update: {
          categoria?: string
          created_at?: string
          data_movimento?: string
          descricao?: string
          empresa_operadora_id?: string | null
          id?: string
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "fluxo_caixa_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
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
            foreignKeyName: "historico_financeiro_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_contrato"
            referencedColumns: ["contrato_id"]
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
            foreignKeyName: "itens_contrato_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_contrato"
            referencedColumns: ["contrato_id"]
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
      metas_representantes: {
        Row: {
          ano: number
          created_at: string
          empresa_operadora_id: string
          id: string
          mes: number
          representante_id: string
          status: string
          updated_at: string
          valor_meta: number
          valor_realizado: number
        }
        Insert: {
          ano?: number
          created_at?: string
          empresa_operadora_id: string
          id?: string
          mes: number
          representante_id: string
          status?: string
          updated_at?: string
          valor_meta?: number
          valor_realizado?: number
        }
        Update: {
          ano?: number
          created_at?: string
          empresa_operadora_id?: string
          id?: string
          mes?: number
          representante_id?: string
          status?: string
          updated_at?: string
          valor_meta?: number
          valor_realizado?: number
        }
        Relationships: [
          {
            foreignKeyName: "metas_representantes_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metas_representantes_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "representantes"
            referencedColumns: ["id"]
          },
        ]
      }
      midia_aprovacoes: {
        Row: {
          created_at: string
          id: string
          midia_id: string
          motivo: string | null
          observacao: string | null
          status: string
          usuario_id: string | null
          versao_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          midia_id: string
          motivo?: string | null
          observacao?: string | null
          status: string
          usuario_id?: string | null
          versao_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          midia_id?: string
          motivo?: string | null
          observacao?: string | null
          status?: string
          usuario_id?: string | null
          versao_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "midia_aprovacoes_midia_id_fkey"
            columns: ["midia_id"]
            isOneToOne: false
            referencedRelation: "midias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "midia_aprovacoes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "midia_aprovacoes_versao_id_fkey"
            columns: ["versao_id"]
            isOneToOne: false
            referencedRelation: "midia_versoes"
            referencedColumns: ["id"]
          },
        ]
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
      midias: {
        Row: {
          altura: number | null
          checksum: string | null
          created_at: string
          descricao: string | null
          duracao: number | null
          id: string
          largura: number | null
          mime_type: string
          nome: string
          object_key: string
          producao_id: string
          status: string
          tamanho: number
          tipo: string
          versao_atual: number
        }
        Insert: {
          altura?: number | null
          checksum?: string | null
          created_at?: string
          descricao?: string | null
          duracao?: number | null
          id?: string
          largura?: number | null
          mime_type: string
          nome: string
          object_key: string
          producao_id: string
          status?: string
          tamanho: number
          tipo: string
          versao_atual?: number
        }
        Update: {
          altura?: number | null
          checksum?: string | null
          created_at?: string
          descricao?: string | null
          duracao?: number | null
          id?: string
          largura?: number | null
          mime_type?: string
          nome?: string
          object_key?: string
          producao_id?: string
          status?: string
          tamanho?: number
          tipo?: string
          versao_atual?: number
        }
        Relationships: [
          {
            foreignKeyName: "midias_producao_id_fkey"
            columns: ["producao_id"]
            isOneToOne: false
            referencedRelation: "producoes"
            referencedColumns: ["id"]
          },
        ]
      }
      mobile_checkins: {
        Row: {
          created_by: string
          data_hora: string
          empresa_operadora_id: string
          id: string
          latitude: number | null
          longitude: number | null
          screen_id: string | null
          status: string
          tipo: string
        }
        Insert: {
          created_by: string
          data_hora?: string
          empresa_operadora_id: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          screen_id?: string | null
          status?: string
          tipo: string
        }
        Update: {
          created_by?: string
          data_hora?: string
          empresa_operadora_id?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          screen_id?: string | null
          status?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "mobile_checkins_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobile_checkins_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_tela"
            referencedColumns: ["tela_id"]
          },
          {
            foreignKeyName: "mobile_checkins_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "screens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobile_checkins_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "vw_offline_screens"
            referencedColumns: ["id"]
          },
        ]
      }
      mobile_fotos: {
        Row: {
          categoria: string | null
          checkin_id: string
          created_at: string
          id: string
          media_id: string
        }
        Insert: {
          categoria?: string | null
          checkin_id: string
          created_at?: string
          id?: string
          media_id: string
        }
        Update: {
          categoria?: string | null
          checkin_id?: string
          created_at?: string
          id?: string
          media_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mobile_fotos_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: false
            referencedRelation: "mobile_checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobile_fotos_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "medias"
            referencedColumns: ["id"]
          },
        ]
      }
      mobile_visitas: {
        Row: {
          created_at: string
          data_agendada: string
          empresa_operadora_id: string
          id: string
          screen_id: string | null
          status: string
          tecnico_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_agendada: string
          empresa_operadora_id: string
          id?: string
          screen_id?: string | null
          status?: string
          tecnico_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_agendada?: string
          empresa_operadora_id?: string
          id?: string
          screen_id?: string | null
          status?: string
          tecnico_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mobile_visitas_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobile_visitas_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_tela"
            referencedColumns: ["tela_id"]
          },
          {
            foreignKeyName: "mobile_visitas_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "screens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobile_visitas_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "vw_offline_screens"
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
            referencedRelation: "dw_dim_tela"
            referencedColumns: ["tela_id"]
          },
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
      noc_alerts: {
        Row: {
          created_at: string
          empresa_operadora_id: string | null
          id: string
          mensagem: string
          nivel: string
          player_id: string | null
          resolvido: boolean
          resolvido_em: string | null
          resolvido_por: string | null
          screen_id: string | null
          tipo_alerta: string
        }
        Insert: {
          created_at?: string
          empresa_operadora_id?: string | null
          id?: string
          mensagem: string
          nivel?: string
          player_id?: string | null
          resolvido?: boolean
          resolvido_em?: string | null
          resolvido_por?: string | null
          screen_id?: string | null
          tipo_alerta: string
        }
        Update: {
          created_at?: string
          empresa_operadora_id?: string | null
          id?: string
          mensagem?: string
          nivel?: string
          player_id?: string | null
          resolvido?: boolean
          resolvido_em?: string | null
          resolvido_por?: string | null
          screen_id?: string | null
          tipo_alerta?: string
        }
        Relationships: [
          {
            foreignKeyName: "noc_alerts_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "noc_alerts_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_player"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "noc_alerts_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "noc_alerts_resolvido_por_fkey"
            columns: ["resolvido_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "noc_alerts_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_tela"
            referencedColumns: ["tela_id"]
          },
          {
            foreignKeyName: "noc_alerts_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "screens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "noc_alerts_screen_id_fkey"
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
          entidade_relacionada_id: string | null
          entidade_relacionada_tipo: string | null
          enviado_em: string | null
          erro_mensagem: string | null
          id: string
          lida: boolean
          mensagem: string
          prioridade: string
          resolvida_em: string | null
          rota_destino: string | null
          severidade: string
          status_envio: string
          status_notificacao: string
          tipo_evento: string
          titulo: string
          usuario_id: string
        }
        Insert: {
          canal: string
          created_at?: string
          destinatario_contato: string
          empresa_operadora_id: string
          entidade_relacionada_id?: string | null
          entidade_relacionada_tipo?: string | null
          enviado_em?: string | null
          erro_mensagem?: string | null
          id?: string
          lida?: boolean
          mensagem: string
          prioridade?: string
          resolvida_em?: string | null
          rota_destino?: string | null
          severidade?: string
          status_envio?: string
          status_notificacao?: string
          tipo_evento: string
          titulo: string
          usuario_id: string
        }
        Update: {
          canal?: string
          created_at?: string
          destinatario_contato?: string
          empresa_operadora_id?: string
          entidade_relacionada_id?: string | null
          entidade_relacionada_tipo?: string | null
          enviado_em?: string | null
          erro_mensagem?: string | null
          id?: string
          lida?: boolean
          mensagem?: string
          prioridade?: string
          resolvida_em?: string | null
          rota_destino?: string | null
          severidade?: string
          status_envio?: string
          status_notificacao?: string
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
      operacao_players: {
        Row: {
          created_at: string
          id: string
          is_online: boolean
          operacao_id: string
          player_id: string | null
          ultima_sincronizacao: string
          ultimo_erro: string | null
          ultimo_heartbeat: string
          versao_app: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_online?: boolean
          operacao_id: string
          player_id?: string | null
          ultima_sincronizacao?: string
          ultimo_erro?: string | null
          ultimo_heartbeat?: string
          versao_app?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_online?: boolean
          operacao_id?: string
          player_id?: string | null
          ultima_sincronizacao?: string
          ultimo_erro?: string | null
          ultimo_heartbeat?: string
          versao_app?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operacao_players_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "operacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacao_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_player"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "operacao_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      operacoes: {
        Row: {
          agendamento_id: string
          created_at: string
          empresa_operadora_id: string
          fim_execucao: string | null
          health_status: string
          id: string
          inicio_execucao: string
          pedido_insercao_id: string | null
          producao_id: string | null
          status: string
          ultima_exibicao: string | null
          ultima_sincronizacao: string
          updated_at: string
        }
        Insert: {
          agendamento_id: string
          created_at?: string
          empresa_operadora_id: string
          fim_execucao?: string | null
          health_status?: string
          id?: string
          inicio_execucao?: string
          pedido_insercao_id?: string | null
          producao_id?: string | null
          status?: string
          ultima_exibicao?: string | null
          ultima_sincronizacao?: string
          updated_at?: string
        }
        Update: {
          agendamento_id?: string
          created_at?: string
          empresa_operadora_id?: string
          fim_execucao?: string | null
          health_status?: string
          id?: string
          inicio_execucao?: string
          pedido_insercao_id?: string | null
          producao_id?: string | null
          status?: string
          ultima_exibicao?: string | null
          ultima_sincronizacao?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operacoes_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacoes_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_campanha"
            referencedColumns: ["agendamento_id"]
          },
          {
            foreignKeyName: "operacoes_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "dw_fact_exibicao"
            referencedColumns: ["agendamento_id"]
          },
          {
            foreignKeyName: "operacoes_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacoes_pedido_insercao_id_fkey"
            columns: ["pedido_insercao_id"]
            isOneToOne: false
            referencedRelation: "pedidos_insercao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacoes_producao_id_fkey"
            columns: ["producao_id"]
            isOneToOne: false
            referencedRelation: "producoes"
            referencedColumns: ["id"]
          },
        ]
      }
      ordens_producao: {
        Row: {
          cliente_id: string | null
          contrato_id: string
          created_at: string
          created_by: string | null
          data_prazo: string | null
          deleted_at: string | null
          deleted_by: string | null
          descricao: string | null
          designer_id: string | null
          empresa_operadora_id: string
          id: string
          numero_op: string
          operador_id: string | null
          pedido_insercao_id: string | null
          prioridade: string
          status: string
          titulo: string
          updated_at: string
          updated_by: string | null
          versao_atual: number
        }
        Insert: {
          cliente_id?: string | null
          contrato_id: string
          created_at?: string
          created_by?: string | null
          data_prazo?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          descricao?: string | null
          designer_id?: string | null
          empresa_operadora_id: string
          id?: string
          numero_op: string
          operador_id?: string | null
          pedido_insercao_id?: string | null
          prioridade?: string
          status?: string
          titulo?: string
          updated_at?: string
          updated_by?: string | null
          versao_atual?: number
        }
        Update: {
          cliente_id?: string | null
          contrato_id?: string
          created_at?: string
          created_by?: string | null
          data_prazo?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          descricao?: string | null
          designer_id?: string | null
          empresa_operadora_id?: string
          id?: string
          numero_op?: string
          operador_id?: string | null
          pedido_insercao_id?: string | null
          prioridade?: string
          status?: string
          titulo?: string
          updated_at?: string
          updated_by?: string | null
          versao_atual?: number
        }
        Relationships: [
          {
            foreignKeyName: "ordens_producao_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_producao_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_cliente"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "ordens_producao_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_producao_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_contrato"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "ordens_producao_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_producao_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
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
          {
            foreignKeyName: "ordens_producao_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_producao_pedido_insercao_id_fkey"
            columns: ["pedido_insercao_id"]
            isOneToOne: false
            referencedRelation: "pedidos_insercao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_producao_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
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
          cobranca_id: string | null
          conta_receber_id: string | null
          contrato_id: string | null
          created_at: string
          created_by: string | null
          data_liquidacao: string
          empresa_operadora_id: string | null
          id: string
          meio_pagamento: string
          transacao_id_externo: string | null
          valor_pago: number
        }
        Insert: {
          cobranca_id?: string | null
          conta_receber_id?: string | null
          contrato_id?: string | null
          created_at?: string
          created_by?: string | null
          data_liquidacao?: string
          empresa_operadora_id?: string | null
          id?: string
          meio_pagamento: string
          transacao_id_externo?: string | null
          valor_pago: number
        }
        Update: {
          cobranca_id?: string | null
          conta_receber_id?: string | null
          contrato_id?: string | null
          created_at?: string
          created_by?: string | null
          data_liquidacao?: string
          empresa_operadora_id?: string | null
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
            foreignKeyName: "pagamentos_conta_receber_id_fkey"
            columns: ["conta_receber_id"]
            isOneToOne: false
            referencedRelation: "contas_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_conta_receber_id_fkey"
            columns: ["conta_receber_id"]
            isOneToOne: false
            referencedRelation: "dw_fact_receita"
            referencedColumns: ["conta_receber_id"]
          },
          {
            foreignKeyName: "pagamentos_conta_receber_id_fkey"
            columns: ["conta_receber_id"]
            isOneToOne: false
            referencedRelation: "vw_cobranca_completa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_contrato"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "pagamentos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_insercao: {
        Row: {
          cliente_id: string | null
          contrato_id: string
          created_at: string
          created_by: string | null
          data_emissao: string
          deleted_at: string | null
          deleted_by: string | null
          descricao: string | null
          empresa_operadora_id: string
          fim_veiculacao: string
          id: string
          inicio_veiculacao: string
          numero_pi: string
          observacoes: string | null
          pdf_object_key: string | null
          pdf_url: string | null
          prioridade: string
          proposta_id: string | null
          quantidade_pecas: number
          responsavel_id: string | null
          status: string
          titulo: string
          updated_at: string
          updated_by: string | null
          versao_atual: number
        }
        Insert: {
          cliente_id?: string | null
          contrato_id: string
          created_at?: string
          created_by?: string | null
          data_emissao?: string
          deleted_at?: string | null
          deleted_by?: string | null
          descricao?: string | null
          empresa_operadora_id: string
          fim_veiculacao?: string
          id?: string
          inicio_veiculacao?: string
          numero_pi: string
          observacoes?: string | null
          pdf_object_key?: string | null
          pdf_url?: string | null
          prioridade?: string
          proposta_id?: string | null
          quantidade_pecas?: number
          responsavel_id?: string | null
          status?: string
          titulo?: string
          updated_at?: string
          updated_by?: string | null
          versao_atual?: number
        }
        Update: {
          cliente_id?: string | null
          contrato_id?: string
          created_at?: string
          created_by?: string | null
          data_emissao?: string
          deleted_at?: string | null
          deleted_by?: string | null
          descricao?: string | null
          empresa_operadora_id?: string
          fim_veiculacao?: string
          id?: string
          inicio_veiculacao?: string
          numero_pi?: string
          observacoes?: string | null
          pdf_object_key?: string | null
          pdf_url?: string | null
          prioridade?: string
          proposta_id?: string | null
          quantidade_pecas?: number
          responsavel_id?: string | null
          status?: string
          titulo?: string
          updated_at?: string
          updated_by?: string | null
          versao_atual?: number
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_insercao_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_insercao_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_cliente"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_insercao_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_insercao_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_contrato"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "pedidos_insercao_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_insercao_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_insercao_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_insercao_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "propostas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_insercao_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_insercao_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
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
      permissoes_usuarios: {
        Row: {
          concedida_por: string | null
          created_at: string
          empresa_operadora_id: string
          id: string
          permissao: string
          usuario_id: string
        }
        Insert: {
          concedida_por?: string | null
          created_at?: string
          empresa_operadora_id: string
          id?: string
          permissao: string
          usuario_id: string
        }
        Update: {
          concedida_por?: string | null
          created_at?: string
          empresa_operadora_id?: string
          id?: string
          permissao?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permissoes_usuarios_concedida_por_fkey"
            columns: ["concedida_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permissoes_usuarios_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permissoes_usuarios_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      pi_auditoria: {
        Row: {
          created_at: string
          detalhes: Json | null
          evento: string
          id: string
          pi_id: string
          usuario_id: string | null
        }
        Insert: {
          created_at?: string
          detalhes?: Json | null
          evento: string
          id?: string
          pi_id: string
          usuario_id?: string | null
        }
        Update: {
          created_at?: string
          detalhes?: Json | null
          evento?: string
          id?: string
          pi_id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pi_auditoria_pi_id_fkey"
            columns: ["pi_id"]
            isOneToOne: false
            referencedRelation: "pedidos_insercao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pi_auditoria_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      pi_historico: {
        Row: {
          created_at: string
          descricao: string
          id: string
          pi_id: string
          status_anterior: string | null
          status_novo: string
          usuario_id: string | null
        }
        Insert: {
          created_at?: string
          descricao: string
          id?: string
          pi_id: string
          status_anterior?: string | null
          status_novo: string
          usuario_id?: string | null
        }
        Update: {
          created_at?: string
          descricao?: string
          id?: string
          pi_id?: string
          status_anterior?: string | null
          status_novo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pi_historico_pi_id_fkey"
            columns: ["pi_id"]
            isOneToOne: false
            referencedRelation: "pedidos_insercao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pi_historico_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      pi_locais: {
        Row: {
          created_at: string
          empresa_id: string | null
          id: string
          pi_id: string
          player_id: string | null
          playlist_id: string | null
          tela_id: string | null
          unidade_id: string | null
        }
        Insert: {
          created_at?: string
          empresa_id?: string | null
          id?: string
          pi_id: string
          player_id?: string | null
          playlist_id?: string | null
          tela_id?: string | null
          unidade_id?: string | null
        }
        Update: {
          created_at?: string
          empresa_id?: string | null
          id?: string
          pi_id?: string
          player_id?: string | null
          playlist_id?: string | null
          tela_id?: string | null
          unidade_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pi_locais_pi_id_fkey"
            columns: ["pi_id"]
            isOneToOne: false
            referencedRelation: "pedidos_insercao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pi_locais_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_player"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "pi_locais_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pi_locais_tela_id_fkey"
            columns: ["tela_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_tela"
            referencedColumns: ["tela_id"]
          },
          {
            foreignKeyName: "pi_locais_tela_id_fkey"
            columns: ["tela_id"]
            isOneToOne: false
            referencedRelation: "screens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pi_locais_tela_id_fkey"
            columns: ["tela_id"]
            isOneToOne: false
            referencedRelation: "vw_offline_screens"
            referencedColumns: ["id"]
          },
        ]
      }
      pi_observacoes: {
        Row: {
          conteudo: string
          created_at: string
          id: string
          pi_id: string
          usuario_id: string | null
        }
        Insert: {
          conteudo: string
          created_at?: string
          id?: string
          pi_id: string
          usuario_id?: string | null
        }
        Update: {
          conteudo?: string
          created_at?: string
          id?: string
          pi_id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pi_observacoes_pi_id_fkey"
            columns: ["pi_id"]
            isOneToOne: false
            referencedRelation: "pedidos_insercao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pi_observacoes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
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
          agendamento_id: string | null
          contrato_id: string | null
          duracao_segundos: number | null
          duration: number | null
          empresa_operadora_id: string | null
          ended_at: string | null
          error_message: string | null
          id: string
          media_id: string | null
          metadata: Json | null
          player_id: string | null
          playlist_id: string | null
          resultado: string
          screen_id: string
          signature: string | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          agendamento_id?: string | null
          contrato_id?: string | null
          duracao_segundos?: number | null
          duration?: number | null
          empresa_operadora_id?: string | null
          ended_at?: string | null
          error_message?: string | null
          id?: string
          media_id?: string | null
          metadata?: Json | null
          player_id?: string | null
          playlist_id?: string | null
          resultado?: string
          screen_id: string
          signature?: string | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          agendamento_id?: string | null
          contrato_id?: string | null
          duracao_segundos?: number | null
          duration?: number | null
          empresa_operadora_id?: string | null
          ended_at?: string | null
          error_message?: string | null
          id?: string
          media_id?: string | null
          metadata?: Json | null
          player_id?: string | null
          playlist_id?: string | null
          resultado?: string
          screen_id?: string
          signature?: string | null
          started_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "playback_logs_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playback_logs_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_campanha"
            referencedColumns: ["agendamento_id"]
          },
          {
            foreignKeyName: "playback_logs_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "dw_fact_exibicao"
            referencedColumns: ["agendamento_id"]
          },
          {
            foreignKeyName: "playback_logs_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playback_logs_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_contrato"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "playback_logs_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playback_logs_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_player"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "playback_logs_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playback_logs_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      player_events: {
        Row: {
          created_at: string
          detalhes: Json | null
          empresa_operadora_id: string | null
          id: string
          player_id: string
          tipo_evento: string
        }
        Insert: {
          created_at?: string
          detalhes?: Json | null
          empresa_operadora_id?: string | null
          id?: string
          player_id: string
          tipo_evento: string
        }
        Update: {
          created_at?: string
          detalhes?: Json | null
          empresa_operadora_id?: string | null
          id?: string
          player_id?: string
          tipo_evento?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_events_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_player"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_heartbeats: {
        Row: {
          cpu_usage: number | null
          created_at: string
          empresa_operadora_id: string | null
          id: string
          ip_address: string | null
          memory_usage: number | null
          ping_at: string
          player_id: string | null
          screen_id: string | null
          status_ping: string
          storage_free_mb: number | null
          temp_celsius: number | null
          versao_app: string | null
        }
        Insert: {
          cpu_usage?: number | null
          created_at?: string
          empresa_operadora_id?: string | null
          id?: string
          ip_address?: string | null
          memory_usage?: number | null
          ping_at?: string
          player_id?: string | null
          screen_id?: string | null
          status_ping?: string
          storage_free_mb?: number | null
          temp_celsius?: number | null
          versao_app?: string | null
        }
        Update: {
          cpu_usage?: number | null
          created_at?: string
          empresa_operadora_id?: string | null
          id?: string
          ip_address?: string | null
          memory_usage?: number | null
          ping_at?: string
          player_id?: string | null
          screen_id?: string | null
          status_ping?: string
          storage_free_mb?: number | null
          temp_celsius?: number | null
          versao_app?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_heartbeats_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_heartbeats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_player"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_heartbeats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_heartbeats_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_tela"
            referencedColumns: ["tela_id"]
          },
          {
            foreignKeyName: "player_heartbeats_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "screens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_heartbeats_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "vw_offline_screens"
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
            referencedRelation: "dw_dim_player"
            referencedColumns: ["player_id"]
          },
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
          active_playlist_id: string | null
          cpu_usage: number | null
          created_at: string
          empresa_operadora_id: string
          equipamento_id: string | null
          id: string
          ip_address: string | null
          memory_usage: number | null
          player_key: string
          screen_id: string | null
          status_online: boolean
          storage_free_mb: number | null
          temp_celsius: number | null
          ultima_comunicacao: string | null
          updated_at: string
          versao_app: string
        }
        Insert: {
          active_playlist_id?: string | null
          cpu_usage?: number | null
          created_at?: string
          empresa_operadora_id: string
          equipamento_id?: string | null
          id?: string
          ip_address?: string | null
          memory_usage?: number | null
          player_key: string
          screen_id?: string | null
          status_online?: boolean
          storage_free_mb?: number | null
          temp_celsius?: number | null
          ultima_comunicacao?: string | null
          updated_at?: string
          versao_app: string
        }
        Update: {
          active_playlist_id?: string | null
          cpu_usage?: number | null
          created_at?: string
          empresa_operadora_id?: string
          equipamento_id?: string | null
          id?: string
          ip_address?: string | null
          memory_usage?: number | null
          player_key?: string
          screen_id?: string | null
          status_online?: boolean
          storage_free_mb?: number | null
          temp_celsius?: number | null
          ultima_comunicacao?: string | null
          updated_at?: string
          versao_app?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_active_playlist_id_fkey"
            columns: ["active_playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "players_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_tela"
            referencedColumns: ["tela_id"]
          },
          {
            foreignKeyName: "players_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "screens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "vw_offline_screens"
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
          audio_enabled: boolean
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
          audio_enabled?: boolean
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
          audio_enabled?: boolean
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
      portal_aprovacoes: {
        Row: {
          comentarios: string | null
          created_at: string
          data_decisao: string | null
          decidido_por: string | null
          empresa_operadora_id: string
          id: string
          producao_id: string
          status: string
        }
        Insert: {
          comentarios?: string | null
          created_at?: string
          data_decisao?: string | null
          decidido_por?: string | null
          empresa_operadora_id: string
          id?: string
          producao_id: string
          status?: string
        }
        Update: {
          comentarios?: string | null
          created_at?: string
          data_decisao?: string | null
          decidido_por?: string | null
          empresa_operadora_id?: string
          id?: string
          producao_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_aprovacoes_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_aprovacoes_producao_id_fkey"
            columns: ["producao_id"]
            isOneToOne: false
            referencedRelation: "producoes"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_chamados: {
        Row: {
          assunto: string
          contrato_id: string
          created_at: string
          created_by: string | null
          descricao: string
          empresa_operadora_id: string
          id: string
          prioridade: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assunto: string
          contrato_id: string
          created_at?: string
          created_by?: string | null
          descricao: string
          empresa_operadora_id: string
          id?: string
          prioridade?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assunto?: string
          contrato_id?: string
          created_at?: string
          created_by?: string | null
          descricao?: string
          empresa_operadora_id?: string
          id?: string
          prioridade?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_chamados_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_chamados_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_contrato"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "portal_chamados_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
        ]
      }
      producao_auditoria: {
        Row: {
          created_at: string
          created_by: string | null
          empresa_operadora_id: string
          id: string
          observacoes: string | null
          producao_id: string
          status_anterior: string | null
          status_novo: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          empresa_operadora_id: string
          id?: string
          observacoes?: string | null
          producao_id: string
          status_anterior?: string | null
          status_novo?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          empresa_operadora_id?: string
          id?: string
          observacoes?: string | null
          producao_id?: string
          status_anterior?: string | null
          status_novo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "producao_auditoria_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producao_auditoria_producao_id_fkey"
            columns: ["producao_id"]
            isOneToOne: false
            referencedRelation: "producoes"
            referencedColumns: ["id"]
          },
        ]
      }
      producao_historico: {
        Row: {
          created_at: string
          descricao: string
          id: string
          producao_id: string
          status_anterior: string | null
          status_novo: string
          usuario_id: string | null
        }
        Insert: {
          created_at?: string
          descricao: string
          id?: string
          producao_id: string
          status_anterior?: string | null
          status_novo: string
          usuario_id?: string | null
        }
        Update: {
          created_at?: string
          descricao?: string
          id?: string
          producao_id?: string
          status_anterior?: string | null
          status_novo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "producao_historico_producao_id_fkey"
            columns: ["producao_id"]
            isOneToOne: false
            referencedRelation: "ordens_producao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producao_historico_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      producao_midia: {
        Row: {
          altura_px: number | null
          aprovado_em: string | null
          aprovado_por: string | null
          checksum: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          duracao_segundos: number | null
          empresa_operadora_id: string | null
          id: string
          largura_px: number | null
          media_id: string | null
          mime_type: string | null
          motivo_rejeicao: string | null
          object_key: string | null
          observacoes: string | null
          pedido_insercao_id: string | null
          producao_id: string
          status_aprovacao: string
          tamanho_bytes: number | null
          tipo_midia: string
          titulo: string
          updated_at: string
          updated_by: string | null
          versao: number
        }
        Insert: {
          altura_px?: number | null
          aprovado_em?: string | null
          aprovado_por?: string | null
          checksum?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          duracao_segundos?: number | null
          empresa_operadora_id?: string | null
          id?: string
          largura_px?: number | null
          media_id?: string | null
          mime_type?: string | null
          motivo_rejeicao?: string | null
          object_key?: string | null
          observacoes?: string | null
          pedido_insercao_id?: string | null
          producao_id: string
          status_aprovacao?: string
          tamanho_bytes?: number | null
          tipo_midia?: string
          titulo?: string
          updated_at?: string
          updated_by?: string | null
          versao?: number
        }
        Update: {
          altura_px?: number | null
          aprovado_em?: string | null
          aprovado_por?: string | null
          checksum?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          duracao_segundos?: number | null
          empresa_operadora_id?: string | null
          id?: string
          largura_px?: number | null
          media_id?: string | null
          mime_type?: string | null
          motivo_rejeicao?: string | null
          object_key?: string | null
          observacoes?: string | null
          pedido_insercao_id?: string | null
          producao_id?: string
          status_aprovacao?: string
          tamanho_bytes?: number | null
          tipo_midia?: string
          titulo?: string
          updated_at?: string
          updated_by?: string | null
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "producao_midia_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producao_midia_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producao_midia_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producao_midia_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "medias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producao_midia_pedido_insercao_id_fkey"
            columns: ["pedido_insercao_id"]
            isOneToOne: false
            referencedRelation: "pedidos_insercao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producao_midia_producao_id_fkey"
            columns: ["producao_id"]
            isOneToOne: false
            referencedRelation: "ordens_producao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producao_midia_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      producao_versoes: {
        Row: {
          checksum: string | null
          created_at: string
          created_by: string | null
          file_url: string | null
          id: string
          mime_type: string
          object_key: string
          observacoes_versao: string | null
          producao_midia_id: string
          status_versao: string
          tamanho_bytes: number
          versao: number
        }
        Insert: {
          checksum?: string | null
          created_at?: string
          created_by?: string | null
          file_url?: string | null
          id?: string
          mime_type: string
          object_key: string
          observacoes_versao?: string | null
          producao_midia_id: string
          status_versao?: string
          tamanho_bytes?: number
          versao: number
        }
        Update: {
          checksum?: string | null
          created_at?: string
          created_by?: string | null
          file_url?: string | null
          id?: string
          mime_type?: string
          object_key?: string
          observacoes_versao?: string | null
          producao_midia_id?: string
          status_versao?: string
          tamanho_bytes?: number
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "producao_versoes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producao_versoes_producao_midia_id_fkey"
            columns: ["producao_midia_id"]
            isOneToOne: false
            referencedRelation: "producao_midia"
            referencedColumns: ["id"]
          },
        ]
      }
      producoes: {
        Row: {
          created_at: string
          created_by: string | null
          descricao: string | null
          empresa_operadora_id: string
          id: string
          pedido_insercao_id: string
          prazo: string | null
          prioridade: string
          status: string
          titulo: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          empresa_operadora_id: string
          id?: string
          pedido_insercao_id: string
          prazo?: string | null
          prioridade?: string
          status?: string
          titulo: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          empresa_operadora_id?: string
          id?: string
          pedido_insercao_id?: string
          prazo?: string | null
          prioridade?: string
          status?: string
          titulo?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "producoes_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producoes_pedido_insercao_id_fkey"
            columns: ["pedido_insercao_id"]
            isOneToOne: false
            referencedRelation: "pedidos_insercao"
            referencedColumns: ["id"]
          },
        ]
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
          data_fim: string | null
          data_inicio: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          desconto: number | null
          duracao_segundos: number | null
          empresa_operadora_id: string
          forma_pagamento: string
          id: string
          numero_proposta: string
          observacoes: string | null
          pdf_url: string | null
          representante_id: string | null
          status: string
          titulo_campanha: string | null
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
          data_fim?: string | null
          data_inicio?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          desconto?: number | null
          duracao_segundos?: number | null
          empresa_operadora_id: string
          forma_pagamento: string
          id?: string
          numero_proposta: string
          observacoes?: string | null
          pdf_url?: string | null
          representante_id?: string | null
          status?: string
          titulo_campanha?: string | null
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
          data_fim?: string | null
          data_inicio?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          desconto?: number | null
          duracao_segundos?: number | null
          empresa_operadora_id?: string
          forma_pagamento?: string
          id?: string
          numero_proposta?: string
          observacoes?: string | null
          pdf_url?: string | null
          representante_id?: string | null
          status?: string
          titulo_campanha?: string | null
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
            foreignKeyName: "propostas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_cliente"
            referencedColumns: ["cliente_id"]
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
      regras_cobranca: {
        Row: {
          ativo: boolean
          atualizado_em: string
          canais_habilitados: string[]
          criado_em: string
          criado_por: string | null
          empresa_operadora_id: string
          evento_situacao: string
          id: string
          nome: string
          prioridade: string
          trigger_dias: number
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          canais_habilitados?: string[]
          criado_em?: string
          criado_por?: string | null
          empresa_operadora_id: string
          evento_situacao?: string
          id?: string
          nome: string
          prioridade?: string
          trigger_dias: number
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          canais_habilitados?: string[]
          criado_em?: string
          criado_por?: string | null
          empresa_operadora_id?: string
          evento_situacao?: string
          id?: string
          nome?: string
          prioridade?: string
          trigger_dias?: number
        }
        Relationships: [
          {
            foreignKeyName: "regras_cobranca_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regras_cobranca_empresa_operadora_id_fkey"
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
            referencedRelation: "dw_dim_tela"
            referencedColumns: ["tela_id"]
          },
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
            referencedRelation: "dw_dim_tela"
            referencedColumns: ["tela_id"]
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
          bound_device_id: string | null
          cidade: string | null
          cpu_temp: string | null
          created_at: string
          custom_id: string | null
          description: string | null
          device_type: string | null
          empresa_operadora_id: string | null
          endereco_instalacao: string | null
          estado: string | null
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
          player_id: string | null
          playlist_id: string | null
          ram_usage: string | null
          resolution: string | null
          saved_playlist_id: string | null
          status: string | null
          status_note: string | null
          updated_at: string
          uptime: string | null
          user_id: string | null
          version: string | null
        }
        Insert: {
          app_version?: string | null
          audio_enabled?: boolean | null
          bound_device_id?: string | null
          cidade?: string | null
          cpu_temp?: string | null
          created_at?: string
          custom_id?: string | null
          description?: string | null
          device_type?: string | null
          empresa_operadora_id?: string | null
          endereco_instalacao?: string | null
          estado?: string | null
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
          player_id?: string | null
          playlist_id?: string | null
          ram_usage?: string | null
          resolution?: string | null
          saved_playlist_id?: string | null
          status?: string | null
          status_note?: string | null
          updated_at?: string
          uptime?: string | null
          user_id?: string | null
          version?: string | null
        }
        Update: {
          app_version?: string | null
          audio_enabled?: boolean | null
          bound_device_id?: string | null
          cidade?: string | null
          cpu_temp?: string | null
          created_at?: string
          custom_id?: string | null
          description?: string | null
          device_type?: string | null
          empresa_operadora_id?: string | null
          endereco_instalacao?: string | null
          estado?: string | null
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
          player_id?: string | null
          playlist_id?: string | null
          ram_usage?: string | null
          resolution?: string | null
          saved_playlist_id?: string | null
          status?: string | null
          status_note?: string | null
          updated_at?: string
          uptime?: string | null
          user_id?: string | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "screens_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screens_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_player"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "screens_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
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
      solicitacoes: {
        Row: {
          created_at: string
          decisao_data: string | null
          decisao_motivo: string | null
          descricao: string | null
          empresa_operadora_id: string
          entidade_id: string | null
          entidade_tipo: string | null
          id: string
          responsavel_id: string | null
          solicitante_id: string | null
          status: string
          tipo_solicitacao: string
          titulo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decisao_data?: string | null
          decisao_motivo?: string | null
          descricao?: string | null
          empresa_operadora_id: string
          entidade_id?: string | null
          entidade_tipo?: string | null
          id?: string
          responsavel_id?: string | null
          solicitante_id?: string | null
          status?: string
          tipo_solicitacao: string
          titulo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decisao_data?: string | null
          decisao_motivo?: string | null
          descricao?: string | null
          empresa_operadora_id?: string
          entidade_id?: string | null
          entidade_tipo?: string | null
          id?: string
          responsavel_id?: string | null
          solicitante_id?: string | null
          status?: string
          tipo_solicitacao?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
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
      storage_migration_map: {
        Row: {
          arquivo: string
          bucket: string
          created_at: string
          error_log: string | null
          id: string
          new_url: string
          old_url: string
          record_id: string
          status: string
          table_name: string
          updated_at: string
        }
        Insert: {
          arquivo: string
          bucket: string
          created_at?: string
          error_log?: string | null
          id?: string
          new_url: string
          old_url: string
          record_id: string
          status?: string
          table_name: string
          updated_at?: string
        }
        Update: {
          arquivo?: string
          bucket?: string
          created_at?: string
          error_log?: string | null
          id?: string
          new_url?: string
          old_url?: string
          record_id?: string
          status?: string
          table_name?: string
          updated_at?: string
        }
        Relationships: []
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
      system_events: {
        Row: {
          action: string
          created_at: string
          empresa_operadora_id: string | null
          entity: string
          entity_id: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          module: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          empresa_operadora_id?: string | null
          entity: string
          entity_id?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          module: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          empresa_operadora_id?: string | null
          entity?: string
          entity_id?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          module?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_events_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "timeline_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_contrato"
            referencedColumns: ["contrato_id"]
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
          cliente_id: string | null
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
          cliente_id?: string | null
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
          cliente_id?: string | null
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
            foreignKeyName: "usuarios_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuarios_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_cliente"
            referencedColumns: ["cliente_id"]
          },
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
      dw_dim_campanha: {
        Row: {
          agendamento_id: string | null
          contrato_id: string | null
          empresa_operadora_id: string | null
          fim: string | null
          inicio: string | null
          insercoes_por_hora: number | null
          pedido_insercao_id: string | null
          producao_id: string | null
          status_agendamento: string | null
          titulo_campanha: string | null
        }
        Insert: {
          agendamento_id?: string | null
          contrato_id?: string | null
          empresa_operadora_id?: string | null
          fim?: string | null
          inicio?: string | null
          insercoes_por_hora?: number | null
          pedido_insercao_id?: string | null
          producao_id?: string | null
          status_agendamento?: string | null
          titulo_campanha?: string | null
        }
        Update: {
          agendamento_id?: string | null
          contrato_id?: string | null
          empresa_operadora_id?: string | null
          fim?: string | null
          inicio?: string | null
          insercoes_por_hora?: number | null
          pedido_insercao_id?: string | null
          producao_id?: string | null
          status_agendamento?: string | null
          titulo_campanha?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_contrato"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "agendamentos_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_pedido_insercao_id_fkey"
            columns: ["pedido_insercao_id"]
            isOneToOne: false
            referencedRelation: "pedidos_insercao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_producao_id_fkey"
            columns: ["producao_id"]
            isOneToOne: false
            referencedRelation: "ordens_producao"
            referencedColumns: ["id"]
          },
        ]
      }
      dw_dim_cliente: {
        Row: {
          cliente_id: string | null
          codigo_cliente: number | null
          data_cadastro: string | null
          empresa_operadora_id: string | null
          status_cliente: string | null
        }
        Insert: {
          cliente_id?: string | null
          codigo_cliente?: number | null
          data_cadastro?: string | null
          empresa_operadora_id?: string | null
          status_cliente?: string | null
        }
        Update: {
          cliente_id?: string | null
          codigo_cliente?: number | null
          data_cadastro?: string | null
          empresa_operadora_id?: string | null
          status_cliente?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
        ]
      }
      dw_dim_contrato: {
        Row: {
          cliente_id: string | null
          contrato_id: string | null
          created_at: string | null
          data_fim: string | null
          data_inicio: string | null
          empresa_operadora_id: string | null
          numero_contrato: string | null
          proposta_id: string | null
          status_contrato: string | null
          valor_mensal: number | null
        }
        Insert: {
          cliente_id?: string | null
          contrato_id?: string | null
          created_at?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          empresa_operadora_id?: string | null
          numero_contrato?: string | null
          proposta_id?: string | null
          status_contrato?: string | null
          valor_mensal?: number | null
        }
        Update: {
          cliente_id?: string | null
          contrato_id?: string | null
          created_at?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          empresa_operadora_id?: string | null
          numero_contrato?: string | null
          proposta_id?: string | null
          status_contrato?: string | null
          valor_mensal?: number | null
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
            foreignKeyName: "contratos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_cliente"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "contratos_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "propostas"
            referencedColumns: ["id"]
          },
        ]
      }
      dw_dim_player: {
        Row: {
          empresa_operadora_id: string | null
          ip_address: string | null
          player_id: string | null
          player_key: string | null
          screen_id: string | null
          status_online: boolean | null
          ultima_comunicacao: string | null
          versao_app: string | null
        }
        Insert: {
          empresa_operadora_id?: string | null
          ip_address?: string | null
          player_id?: string | null
          player_key?: string | null
          screen_id?: string | null
          status_online?: boolean | null
          ultima_comunicacao?: string | null
          versao_app?: string | null
        }
        Update: {
          empresa_operadora_id?: string | null
          ip_address?: string | null
          player_id?: string | null
          player_key?: string | null
          screen_id?: string | null
          status_online?: boolean | null
          ultima_comunicacao?: string | null
          versao_app?: string | null
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
            foreignKeyName: "players_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_tela"
            referencedColumns: ["tela_id"]
          },
          {
            foreignKeyName: "players_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "screens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "vw_offline_screens"
            referencedColumns: ["id"]
          },
        ]
      }
      dw_dim_tela: {
        Row: {
          empresa_operadora_id: string | null
          localizacao: string | null
          nome_tela: string | null
          orientacao: string | null
          resolucao: string | null
          status_tela: string | null
          tela_id: string | null
        }
        Insert: {
          empresa_operadora_id?: string | null
          localizacao?: string | null
          nome_tela?: string | null
          orientacao?: string | null
          resolucao?: string | null
          status_tela?: string | null
          tela_id?: string | null
        }
        Update: {
          empresa_operadora_id?: string | null
          localizacao?: string | null
          nome_tela?: string | null
          orientacao?: string | null
          resolucao?: string | null
          status_tela?: string | null
          tela_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "screens_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
        ]
      }
      dw_fact_comissao: {
        Row: {
          comissao_id: string | null
          contrato_id: string | null
          data_liberacao: string | null
          empresa_operadora_id: string | null
          porcentagem: number | null
          status_comissao: string | null
          valor_base: number | null
          valor_comissao: number | null
        }
        Insert: {
          comissao_id?: string | null
          contrato_id?: string | null
          data_liberacao?: string | null
          empresa_operadora_id?: string | null
          porcentagem?: number | null
          status_comissao?: string | null
          valor_base?: number | null
          valor_comissao?: number | null
        }
        Update: {
          comissao_id?: string | null
          contrato_id?: string | null
          data_liberacao?: string | null
          empresa_operadora_id?: string | null
          porcentagem?: number | null
          status_comissao?: string | null
          valor_base?: number | null
          valor_comissao?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_contrato"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "comissoes_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
        ]
      }
      dw_fact_exibicao: {
        Row: {
          agendamento_id: string | null
          campanha: string | null
          cliente_id: string | null
          contrato_id: string | null
          empresa_operadora_id: string | null
          insercoes_contratadas: number | null
          insercoes_realizadas: number | null
          sla_entrega_pct: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_cliente"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "agendamentos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_contrato"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "agendamentos_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
        ]
      }
      dw_fact_receita: {
        Row: {
          cliente_id: string | null
          conta_receber_id: string | null
          contrato_id: string | null
          data_recebimento: string | null
          data_vencimento: string | null
          empresa_operadora_id: string | null
          numero_parcela: number | null
          status_recebimento: string | null
          total_parcelas: number | null
          valor_contratado: number | null
          valor_pendente: number | null
          valor_recebido: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contas_receber_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_receber_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_cliente"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "contas_receber_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_receber_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_contrato"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "contas_receber_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_daily_stats: {
        Row: {
          log_day: string | null
          screen_id: string | null
          total_plays: number | null
        }
        Relationships: []
      }
      v_dre_consolidado: {
        Row: {
          comissoes_vendas: number | null
          custos_operacionais_rede: number | null
          ebitda: number | null
          empresa_operadora_id: string | null
          impostos_estimados: number | null
          receita_bruta: number | null
          resultado_liquido: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contas_receber_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_cobranca_completa: {
        Row: {
          cliente_id: string | null
          cliente_nome: string | null
          competencia_date: string | null
          contrato_id: string | null
          currency: string | null
          dias_em_atraso: number | null
          dias_para_vencimento: number | null
          empresa_operadora_id: string | null
          gerada_automaticamente: boolean | null
          id: string | null
          issue_date: string | null
          metodo_cobranca: string | null
          notes: string | null
          numero_contrato: string | null
          numero_documento: string | null
          qtd_pagamentos: number | null
          recorrencia: string | null
          saldo: number | null
          situacao_cobranca: string | null
          status_conta_receber: string | null
          tipo_contrato: string | null
          ultima_atualizacao: string | null
          valor_original: number | null
          valor_pago: number | null
          vencimento: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contas_receber_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_receber_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_cliente"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "contas_receber_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_receber_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "dw_dim_contrato"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "contas_receber_empresa_operadora_id_fkey"
            columns: ["empresa_operadora_id"]
            isOneToOne: false
            referencedRelation: "empresa_operadora"
            referencedColumns: ["id"]
          },
        ]
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
      admin_unpair_screen: { Args: { p_screen_id?: string }; Returns: Json }
      atualizar_usuario_corporativo: {
        Args: {
          p_alvo_id: string
          p_nome: string
          p_perfil_id: string
          p_telefone: string
        }
        Returns: undefined
      }
      buscar_conta_por_documento: {
        Args: { p_doc: string }
        Returns: {
          cliente_id: string | null
          codigo_operacional: string
          competencia_date: string | null
          contrato_id: string
          created_at: string
          currency: string
          data_recebimento: string | null
          data_vencimento: string
          empresa_operadora_id: string | null
          gerada_automaticamente: boolean
          id: string
          issue_date: string | null
          metodo_cobranca: string | null
          notes: string | null
          numero_documento: string | null
          numero_parcela: number
          payment_date: string | null
          recorrencia: string | null
          saldo: number | null
          situacao_cobranca: string
          status: string
          total_parcelas: number
          updated_at: string
          valor: number
          valor_pago: number
        }[]
        SetofOptions: {
          from: "*"
          to: "contas_receber"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      can_access_client_data: {
        Args: { p_empresa_id?: string; p_user_id?: string }
        Returns: boolean
      }
      can_access_midia: {
        Args: { p_empresa_id?: string; p_user_id?: string }
        Returns: boolean
      }
      can_read_contrato: {
        Args: {
          p_empresa_id?: string
          p_representante_id?: string
          p_user_id?: string
        }
        Returns: boolean
      }
      criar_usuario_corporativo: {
        Args: {
          p_email: string
          p_nome: string
          p_perfil_id: string
          p_telefone: string
          p_uid: string
        }
        Returns: string
      }
      current_device_id: { Args: never; Returns: string }
      delete_old_logs: { Args: never; Returns: undefined }
      desbloquear_cliente: {
        Args: { p_cliente_id: string; p_motivo?: string }
        Returns: Json
      }
      enfileirar_job: {
        Args: {
          p_available_at?: string
          p_empresa_operadora_id: string
          p_event_name: string
          p_idempotency_key?: string
          p_max_tentativas?: number
          p_payload?: Json
          p_priority?: string
        }
        Returns: Json
      }
      fn_assinar_contrato: {
        Args: {
          p_assinatura_id: string
          p_document_hash?: string
          p_ip?: string
          p_pdf_assinado_key?: string
          p_signatario_cpf_cnpj?: string
          p_signatario_email?: string
          p_signatario_nome?: string
          p_user_agent?: string
        }
        Returns: Json
      }
      fn_cadastrar_cliente_atomo: {
        Args: {
          p_bairro?: string
          p_cargo_representante?: string
          p_cep?: string
          p_cidade?: string
          p_cnpj?: string
          p_complemento?: string
          p_contato_cargo?: string
          p_contato_email?: string
          p_contato_nome?: string
          p_contato_telefone?: string
          p_email?: string
          p_empresa_operadora_id: string
          p_estado?: string
          p_logradouro?: string
          p_nome_fantasia?: string
          p_numero?: string
          p_observacoes?: string
          p_razao_social?: string
          p_representante_id?: string
          p_representante_legal?: string
          p_segmento?: string
          p_status?: string
          p_telefone?: string
          p_whatsapp?: string
        }
        Returns: Json
      }
      fn_can_access_data: { Args: { p_user_id?: string }; Returns: boolean }
      fn_can_login: { Args: { p_user_id?: string }; Returns: boolean }
      fn_check_pairing_status: {
        Args: { p_identity_hash: string }
        Returns: Json
      }
      fn_device_attest: {
        Args: { p_identity_hash: string; p_screen_id: string }
        Returns: Json
      }
      fn_device_bind: {
        Args: { p_identity_hash: string; p_model?: string; p_screen_id: string }
        Returns: Json
      }
      fn_device_revoke: { Args: { p_device_id: string }; Returns: Json }
      fn_gerar_numero_contrato_atomo: {
        Args: { p_empresa_operadora_id: string }
        Returns: string
      }
      fn_gerar_numero_op: {
        Args: { p_empresa_operadora_id: string }
        Returns: string
      }
      fn_gerar_numero_pi: {
        Args: { p_empresa_operadora_id: string }
        Returns: string
      }
      fn_get_user_security_context: {
        Args: { p_user_id?: string }
        Returns: {
          cargo_nome: string
          empresa_operadora_id: string
          status_ciclo_vida: string
        }[]
      }
      fn_link_device_to_screen: {
        Args: { p_pairing_code: string; p_screen_id: string }
        Returns: Json
      }
      fn_player_can_access_screen: {
        Args: { p_screen_id: string }
        Returns: boolean
      }
      fn_player_can_access_screen_text:
        | {
            Args: { p_screen_id: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.fn_player_can_access_screen_text(p_screen_id => text), public.fn_player_can_access_screen_text(p_screen_id => uuid). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { p_screen_id: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.fn_player_can_access_screen_text(p_screen_id => text), public.fn_player_can_access_screen_text(p_screen_id => uuid). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      fn_player_report_telemetry: {
        Args: {
          p_cpu_usage?: number
          p_ip_address?: string
          p_memory_usage?: number
          p_screen_id: string
          p_storage_free_mb?: number
          p_temp_celsius?: number
          p_versao_app?: string
        }
        Returns: Json
      }
      fn_r2_validate_object_scope: {
        Args: { p_object_key: string }
        Returns: boolean
      }
      fn_registrar_visualizacao_assinatura: {
        Args: { p_assinatura_id: string; p_ip?: string; p_user_agent?: string }
        Returns: Json
      }
      fn_request_pairing_code: {
        Args: { p_device_model?: string; p_identity_hash: string }
        Returns: Json
      }
      gerar_cobrancas_recorrentes: {
        Args: { p_empresa_operadora_id?: string; p_meses_frente?: number }
        Returns: Json
      }
      gerar_codigo_conta: { Args: { p_id: string }; Returns: string }
      gerar_numero_documento: {
        Args: { p_ano?: number; p_tenant_id: string; p_tipo: string }
        Returns: string
      }
      gerenciar_autonomia: {
        Args: { p_alvo_id: string; p_conceder: boolean; p_permissoes: string[] }
        Returns: undefined
      }
      gerenciar_representante: {
        Args: {
          p_acao: string
          p_banco_agencia?: string
          p_banco_conta?: string
          p_banco_nome?: string
          p_chave_pix?: string
          p_comissao_porcentagem?: number
          p_cpf_cnpj?: string
          p_razao_social?: string
          p_representante_id: string
        }
        Returns: Json
      }
      get_authorized_screens_for_player:
        | { Args: never; Returns: Json }
        | { Args: { payload: Json }; Returns: Json }
      get_central_acessos_dashboard: { Args: never; Returns: Json }
      get_current_user_tenant_ids: {
        Args: never
        Returns: {
          emp_id: string
          is_sys_owner: boolean
          org_id: string
        }[]
      }
      get_desempenho_representante_detalhe: {
        Args: {
          p_periodo_fim?: string
          p_periodo_inicio?: string
          p_representante_id: string
        }
        Returns: Json
      }
      get_desempenho_representantes: {
        Args: {
          p_empresa_operadora_id?: string
          p_ordenar?: string
          p_periodo_fim?: string
          p_periodo_inicio?: string
          p_representante_id?: string
        }
        Returns: Json
      }
      get_my_admin_permissions: { Args: never; Returns: string[] }
      get_player_playlist_for_screen:
        | { Args: { p_device_id: string; p_identifier: string }; Returns: Json }
        | { Args: { payload: Json }; Returns: Json }
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
      get_solicitacao_aprovacao: {
        Args: { p_request_id: string; p_token_hash: string }
        Returns: {
          approval_token_expires_at: string
          approval_used_at: string
          approved_at: string
          auth_user_id: string
          created_at: string
          dados_cadastro: Json
          email_usuario: string
          empresa_operadora_id: string
          id: string
          motivo_rejeicao: string
          nome_usuario: string
          rejected_at: string
          status: string
          telefone: string
          tipo_acesso: string
          updated_at: string
          usuario_id: string
        }[]
      }
      get_tenant_id: { Args: never; Returns: string }
      get_user_empresa_operadora_id: {
        Args: { p_user_id: string }
        Returns: string
      }
      get_user_representante_id: { Args: never; Returns: string }
      get_user_role: { Args: never; Returns: string }
      get_user_tenant_id: { Args: never; Returns: string }
      has_admin_permission: { Args: { p_permissao: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_user: { Args: never; Returns: boolean }
      is_central_privileged: { Args: never; Returns: boolean }
      is_conversa_participante: {
        Args: { p_conversa_id: string }
        Returns: boolean
      }
      is_owner_or_admin: { Args: never; Returns: boolean }
      listar_representantes_gerencia: {
        Args: {
          p_busca?: string
          p_empresa_operadora_id?: string
          p_representante_id?: string
          p_status?: string
        }
        Returns: Json
      }
      listar_usuarios_central: { Args: never; Returns: Json }
      player_unpair_screen:
        | { Args: { p_device_id: string; p_screen_id: string }; Returns: Json }
        | { Args: { payload: Json }; Returns: Json }
      pode_gerenciar_representantes: {
        Args: { p_permissao: string }
        Returns: boolean
      }
      processar_regua_cobranca: {
        Args: { p_empresa_operadora_id?: string }
        Returns: Json
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
      reassinar_cliente_representante: {
        Args: { p_cliente_id: string; p_representante_id?: string }
        Returns: Json
      }
      refresh_daily_stats: { Args: never; Returns: undefined }
      registrar_tentativa_job: {
        Args: { p_erro?: string; p_job_id: string; p_ok: boolean }
        Returns: Json
      }
      release_screen_device: { Args: { p_screen_id: string }; Returns: boolean }
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
  public: {
    Enums: {
      app_role: ["admin", "editor", "viewer"],
      approval_status: ["pending", "approved", "rejected"],
    },
  },
} as const
