import { supabase } from '@/integrations/supabase/client';

export interface ClientePayload {
  id?: string;
  empresaOperadoraId: string;
  representanteId: string;
  status?: 'PROSPECT' | 'CONTACTED' | 'PROPOSAL_SENT' | 'ACTIVE' | 'INACTIVE' | 'CANCELED';
  
  // Dados da Empresa Cliente (Pessoa Jurídica)
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
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

export interface ClienteCompleto {
  id: string;
  empresa_operadora_id: string;
  representante_id: string;
  codigo_cliente: number;
  status: string;
  created_at: string;
  updated_at: string;
  empresas?: Array<{
    id: string;
    razao_social: string;
    nome_fantasia: string;
    cnpj: string;
    segmento?: string;
    telefone?: string;
    whatsapp: string;
    email: string;
    cidade: string;
    estado: string;
    contatos?: Array<{
      id: string;
      nome: string;
      cargo: string;
      email: string;
      telefone: string;
      is_principal: boolean;
    }>;
  }>;
  representante?: {
    id: string;
    codigo_representante?: number;
    cpf_cnpj: string;
    usuario?: {
      nome: string;
      email: string;
    };
  };
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
   * Tenta via RPC atômica fn_cadastrar_cliente_atomo para garantir ROLLBACK completo e lock anti-concorrência.
   */
  async create(payload: ClientePayload): Promise<{ success: boolean; clienteId?: string; error?: string }> {
    try {
      // 1. Tenta chamada via RPC Atômica (Transação PostgreSQL isolada)
      const { data: rpcRes, error: rpcError } = await supabase.rpc('fn_cadastrar_cliente_atomo', {
        p_empresa_operadora_id: payload.empresaOperadoraId,
        p_representante_id: payload.representanteId,
        p_status: payload.status || 'PROSPECT',
        p_razao_social: payload.razaoSocial || payload.nomeFantasia,
        p_nome_fantasia: payload.nomeFantasia,
        p_cnpj: payload.cnpj,
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

      if (!rpcError && rpcRes && rpcRes.success) {
        return { success: true, clienteId: rpcRes.cliente_id };
      }

      // 2. Fallback Seguro (em caso da RPC ainda não estar publicada remotamente)
      const { data: maxCodeData } = await supabase
        .from('clientes')
        .select('codigo_cliente')
        .eq('empresa_operadora_id', payload.empresaOperadoraId)
        .order('codigo_cliente', { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextCode = (maxCodeData?.codigo_cliente || 0) + 1;

      const { data: cliente, error: clienteError } = await supabase
        .from('clientes')
        .insert({
          empresa_operadora_id: payload.empresaOperadoraId,
          representante_id: payload.representanteId,
          codigo_cliente: nextCode,
          status: payload.status || 'PROSPECT',
        })
        .select('id')
        .single();

      if (clienteError || !cliente) {
        return { success: false, error: clienteError?.message || 'Erro ao criar cliente.' };
      }

      const clienteId = cliente.id;

      const { data: empresa, error: empresaError } = await supabase
        .from('empresas')
        .insert({
          cliente_id: clienteId,
          razao_social: payload.razaoSocial,
          nome_fantasia: payload.nomeFantasia,
          cnpj: payload.cnpj,
          segmento: payload.segmento || '',
          telefone: payload.telefone || '',
          whatsapp: payload.whatsapp,
          email: payload.email,
          cep: payload.cep || '',
          logradouro: payload.logradouro || '',
          numero: payload.numero || '',
          complemento: payload.complemento || '',
          bairro: payload.bairro || '',
          cidade: payload.cidade,
          estado: payload.estado,
          representante_legal: payload.representanteLegal || '',
          cargo_representante: payload.cargoRepresentante || '',
          observacoes: payload.observacoes || '',
        })
        .select('id')
        .single();

      if (empresaError || !empresa) {
        // Rollback manual do cliente orfão se empresa falhar no fallback
        await supabase.from('clientes').delete().eq('id', clienteId);
        return { success: false, error: empresaError?.message || 'Erro ao vincular empresa ao cliente.' };
      }

      if (payload.contatoNome) {
        const { error: contatoError } = await supabase.from('contatos').insert({
          empresa_id: empresa.id,
          nome: payload.contatoNome,
          cargo: payload.contatoCargo || 'Responsável',
          email: payload.contatoEmail || payload.email,
          telefone: payload.contatoTelefone || payload.whatsapp,
          is_principal: true,
        });

        if (contatoError) {
          // Rollback manual em caso de falha no contato no modo fallback
          await supabase.from('empresas').delete().eq('id', empresa.id);
          await supabase.from('clientes').delete().eq('id', clienteId);
          return { success: false, error: contatoError.message };
        }
      }

      return { success: true, clienteId };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro inesperado no cadastro de cliente.' };
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
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }
}

export const clienteService = new ClienteService();
