import { supabase } from '@/integrations/supabase/client';
import type { ClienteCompleto as ClienteCompletoTipo } from '../types/cliente.types';

export type ClienteCompleto = ClienteCompletoTipo;

export interface ClientePayload {
  id?: string;
  empresaOperadoraId: string;
  representanteId?: string | null;
  status?: 'PROSPECT' | 'CONTACTED' | 'PROPOSAL_SENT' | 'ACTIVE' | 'INACTIVE' | 'CANCELED';
  
  // Dados da Empresa Cliente (Pessoa Jurídica)
  razaoSocial: string;
  nomeFantasia: string;
  cnpj?: string;
  segmento?: string;
  telefone?: string;
  whatsapp: string;
  email: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade: string;
  estado: string;
  representanteLegal?: string;
  cargoRepresentante?: string;
  observacoes?: string;

  // Dados do Contato Principal
  contatoNome?: string;
  contatoCargo?: string;
  contatoEmail?: string;
  contatoTelefone?: string;
}

export class ClienteService {
  /**
   * Busca lista real de clientes do PostgreSQL respeitando Multi-Tenancy e Escopo de Representante
   */
  async findAll(empresaOperadoraId?: string, representanteId?: string): Promise<ClienteCompleto[]> {
    try {
      let query = supabase
        .from('clientes')
        .select(`
          *,
          empresas:empresas(*, contatos:contatos(*)),
          representante:representantes(*, usuario:usuarios(nome, email))
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (empresaOperadoraId) {
        query = query.eq('empresa_operadora_id', empresaOperadoraId);
      }

      if (representanteId) {
        query = query.eq('representante_id', representanteId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[ClienteService.findAll] Erro de consulta:', error);
        return [];
      }

      return (data || []) as ClienteCompleto[];
    } catch (err) {
      console.error('[ClienteService.findAll] Exceção:', err);
      return [];
    }
  }

  /**
   * Busca um único cliente pelo seu UUID
   */
  async findById(id: string): Promise<ClienteCompleto | null> {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select(`
          *,
          empresas:empresas(*, contatos:contatos(*)),
          representante:representantes(*, usuario:usuarios(nome, email))
        `)
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle();

      if (error || !data) return null;
      return data as ClienteCompleto;
    } catch (err) {
      return null;
    }
  }

  /**
   * Cadastra um novo cliente comercial atômico no PostgreSQL
   * Utiliza EXCLUSIVAMENTE a RPC atômica fn_cadastrar_cliente_atomo (publicada em produção),
   * que garante transação, lock anti-concorrência de codigo_cliente e ROLLBACK completo.
   * O representante_id é NULL para OWNER (regra validada na RPC e nas policies RLS).
   */
  async create(payload: ClientePayload): Promise<{ success: boolean; clienteId?: string; error?: string }> {
    try {
      if (!payload.empresaOperadoraId) {
        return { success: false, error: 'empresaOperadoraId (tenant) ausente no payload. Refaça o login.' };
      }
      if (!payload.nomeFantasia || !payload.email || !payload.whatsapp) {
        return { success: false, error: 'Payload incompleto: nome fantasia, e-mail e WhatsApp são obrigatórios.' };
      }

      const { data: rpcRes, error: rpcError } = await supabase.rpc('fn_cadastrar_cliente_atomo', {
        p_empresa_operadora_id: payload.empresaOperadoraId,
        p_representante_id: payload.representanteId ?? null,
        p_status: payload.status || 'PROSPECT',
        p_razao_social: payload.razaoSocial || payload.nomeFantasia,
        p_nome_fantasia: payload.nomeFantasia,
        p_cnpj: payload.cnpj?.trim() ? payload.cnpj : null,
        p_segmento: payload.segmento || '',
        p_telefone: payload.telefone || '',
        p_whatsapp: payload.whatsapp,
        p_email: payload.email,
        p_cep: payload.cep || '',
        p_logradouro: payload.logradouro || '',
        p_numero: payload.numero || '',
        p_complemento: payload.complemento || '',
        p_bairro: payload.bairro || '',
        p_cidade: payload.cidade,
        p_estado: payload.estado,
        p_representante_legal: payload.representanteLegal || '',
        p_cargo_representante: payload.cargoRepresentante || '',
        p_observacoes: payload.observacoes || '',
        p_contato_nome: payload.contatoNome || payload.representanteLegal || payload.nomeFantasia,
        p_contato_cargo: payload.contatoCargo || payload.cargoRepresentante || 'Responsável',
        p_contato_email: payload.contatoEmail || payload.email,
        p_contato_telefone: payload.contatoTelefone || payload.whatsapp,
      });

      if (rpcError) {
        if (rpcError.message?.includes('permission denied')) {
          return { success: false, error: 'Permissão negada pelo PostgreSQL. Verifique seu perfil e a RLS do tenant.' };
        }
        return { success: false, error: `Falha na RPC de cadastro: ${rpcError.message}` };
      }

      if (!rpcRes) {
        return { success: false, error: 'A RPC de cadastro não retornou resposta. Contate o suporte.' };
      }

      if (!rpcRes.success) {
        const msg = String(rpcRes.error || 'Erro desconhecido na RPC.');
        if (msg.includes('empresas_cnpj_key') || msg.toLowerCase().includes('duplicate key')) {
          return { success: false, error: 'CNPJ já cadastrado para outro cliente (constraint: empresas_cnpj_key). Verifique o número informado.' };
        }
        if (msg.includes('clientes_empresa_operadora_id_fkey')) {
          return { success: false, error: 'Tenant (empresa operadora) inválido. Refaça o login.' };
        }
        if (msg.includes('clientes_representante_id_fkey')) {
          return { success: false, error: 'Representante vinculado não existe (FK inválida). Contate o suporte.' };
        }
        return { success: false, error: msg };
      }

      if (!rpcRes.cliente_id) {
        return { success: false, error: 'A RPC retornou sucesso sem cliente_id. Contate o suporte.' };
      }

      return { success: true, clienteId: rpcRes.cliente_id };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg || 'Erro inesperado no cadastro de cliente.' };
    }
  }

  /**
   * Atualiza um cliente existente (status + dados da empresa + contato principal)
   * Escopo Multi-Tenant e de Representante garantido via RLS no PostgreSQL.
   */
  async update(id: string, payload: ClientePayload): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. Atualiza o registro mestre em public.clientes
      if (payload.status) {
        const { error: statusError } = await supabase
          .from('clientes')
          .update({ status: payload.status })
          .eq('id', id)
          .is('deleted_at', null);

        if (statusError) {
          return { success: false, error: `Erro ao atualizar status: ${statusError.message}` };
        }
      }

      // 2. Localiza a empresa vinculada ao cliente
      const { data: empresa, error: empresaFindError } = await supabase
        .from('empresas')
        .select('id')
        .eq('cliente_id', id)
        .maybeSingle();

      if (empresaFindError) {
        return { success: false, error: `Erro ao localizar empresa: ${empresaFindError.message}` };
      }

      // 3. Atualiza os dados da empresa (Pessoa Jurídica)
      if (empresa) {
        const { error: empresaError } = await supabase
          .from('empresas')
          .update({
            razao_social: payload.razaoSocial || undefined,
            nome_fantasia: payload.nomeFantasia || undefined,
            cnpj: payload.cnpj?.trim() ? payload.cnpj : null,
            segmento: payload.segmento ?? undefined,
            telefone: payload.telefone ?? undefined,
            whatsapp: payload.whatsapp || undefined,
            email: payload.email || undefined,
            cep: payload.cep ?? undefined,
            logradouro: payload.logradouro ?? undefined,
            numero: payload.numero ?? undefined,
            complemento: payload.complemento ?? undefined,
            bairro: payload.bairro ?? undefined,
            cidade: payload.cidade || undefined,
            estado: payload.estado || undefined,
            representante_legal: payload.representanteLegal ?? undefined,
            cargo_representante: payload.cargoRepresentante ?? undefined,
            observacoes: payload.observacoes ?? undefined,
          })
          .eq('id', empresa.id);

        if (empresaError) {
          return { success: false, error: `Erro ao atualizar empresa: ${empresaError.message}` };
        }

        // 4. Atualiza ou cria o contato principal
        if (payload.contatoNome) {
          const { data: contatoPrincipal } = await supabase
            .from('contatos')
            .select('id')
            .eq('empresa_id', empresa.id)
            .eq('is_principal', true)
            .maybeSingle();

          if (contatoPrincipal) {
            const { error: contatoError } = await supabase
              .from('contatos')
              .update({
                nome: payload.contatoNome,
                cargo: payload.contatoCargo || 'Responsável',
                email: payload.contatoEmail || payload.email,
                telefone: payload.contatoTelefone || payload.whatsapp,
              })
              .eq('id', contatoPrincipal.id);

            if (contatoError) {
              return { success: false, error: `Erro ao atualizar contato: ${contatoError.message}` };
            }
          } else {
            const { error: contatoInsertError } = await supabase.from('contatos').insert({
              empresa_id: empresa.id,
              nome: payload.contatoNome,
              cargo: payload.contatoCargo || 'Responsável',
              email: payload.contatoEmail || payload.email,
              telefone: payload.contatoTelefone || payload.whatsapp,
              is_principal: true,
            });

            if (contatoInsertError) {
              return { success: false, error: `Erro ao criar contato: ${contatoInsertError.message}` };
            }
          }
        }
      } else {
        return { success: false, error: 'Cliente sem empresa vinculada. Reabra o registro ou contate o suporte.' };
      }

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg || 'Erro inesperado na atualização do cliente.' };
    }
  }

  /**
   * Inativa um cliente comercial preservando histórico (Soft Delete)
   */
  async softDelete(id: string, reason?: string, userId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from('clientes')
        .update({
          status: 'INACTIVE',
          deleted_at: nowIso,
          deleted_by: userId || null,
          delete_reason: reason || 'Inativado pelo usuário.',
        })
        .eq('id', id);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg || 'Erro inesperado na inativação do cliente.' };
    }
  }
}

export const clienteService = new ClienteService();
