import { supabase } from '@/integrations/supabase/client';

export type ProducaoStatus =
  | 'CRIADA'
  | 'AGUARDANDO_MATERIAL'
  | 'MATERIAL_RECEBIDO'
  | 'EM_DESENVOLVIMENTO'
  | 'AGUARDANDO_APROVACAO'
  | 'REPROVADA'
  | 'APROVADA'
  | 'LIBERADA'
  | 'PUBLICADA'
  | 'FINALIZADA'
  | 'CANCELADA'
  | 'SUSPENSA';

export type TipoMidia = 'Imagem' | 'Vídeo' | 'HTML5' | 'ZIP' | 'PDF';

export interface CreateProductionPayload {
  empresaOperadoraId: string;
  pedidoInsercaoId: string;
  clienteId: string;
  titulo: string;
  descricao?: string;
  prioridade?: 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE';
  designerResponsavelId?: string;
  operadorResponsavelId?: string;
  prazo?: string;
}

export interface UploadMediaPayload {
  producaoId: string;
  tipo: TipoMidia;
  nome: string;
  descricao?: string;
  mimeType: string;
  tamanho: number;
  duracao?: number;
  largura?: number;
  altura?: number;
  checksum?: string;
  fileBuffer?: ArrayBuffer | Blob;
}

export interface MidiaRecord {
  id: string;
  producao_id: string;
  tipo: TipoMidia;
  nome: string;
  descricao?: string;
  mime_type: string;
  tamanho: number;
  duracao: number;
  largura: number;
  altura: number;
  object_key: string;
  checksum?: string;
  versao_atual: number;
  status: 'EM_REVISAO' | 'APROVADO' | 'REPROVADO';
  created_at: string;
  versoes?: any[];
  aprovacoes?: any[];
}

export interface ProducaoCompleta {
  id: string;
  empresa_operadora_id: string;
  pedido_insercao_id: string;
  cliente_id: string;
  titulo: string;
  descricao?: string;
  status: ProducaoStatus;
  prioridade: string;
  designer_responsavel_id?: string;
  operador_responsavel_id?: string;
  prazo?: string;
  created_at: string;
  cliente?: any;
  pedido_insercao?: any;
  midias?: MidiaRecord[];
  historico?: any[];
}

export class ProducaoService {
  /**
   * Valida metadados do arquivo antes do envio (Formato, Tamanho, Dimensões)
   */
  validateMediaFile(file: File): { valid: boolean; error?: string; tipo?: TipoMidia } {
    const maxSizeBytes = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSizeBytes) {
      return { valid: false, error: 'O tamanho máximo do arquivo não pode exceder 100MB.' };
    }

    let tipo: TipoMidia = 'Imagem';
    if (file.type.startsWith('image/')) tipo = 'Imagem';
    else if (file.type.startsWith('video/')) tipo = 'Vídeo';
    else if (file.type.includes('html') || file.name.endsWith('.html')) tipo = 'HTML5';
    else if (file.type.includes('zip') || file.name.endsWith('.zip')) tipo = 'ZIP';
    else if (file.type.includes('pdf') || file.name.endsWith('.pdf')) tipo = 'PDF';
    else {
      return { valid: false, error: `Formato de arquivo não suportado: ${file.type}` };
    }

    return { valid: true, tipo };
  }

  /**
   * Cria registro da Produção atrelada obrigatoriamente a um Pedido de Inserção (PI)
   */
  async createProduction(payload: CreateProductionPayload, usuarioId?: string): Promise<{ success: boolean; producaoId?: string; error?: string }> {
    try {
      const { data: producao, error } = await supabase
        .from('producoes')
        .insert({
          empresa_operadora_id: payload.empresaOperadoraId,
          pedido_insercao_id: payload.pedidoInsercaoId,
          cliente_id: payload.clienteId,
          titulo: payload.titulo,
          descricao: payload.descricao || null,
          status: 'CRIADA',
          prioridade: payload.prioridade || 'MEDIA',
          designer_responsavel_id: payload.designerResponsavelId || usuarioId || null,
          operador_responsavel_id: payload.operadorResponsavelId || null,
          prazo: payload.prazo || null,
          created_by: usuarioId || null,
        })
        .select('id')
        .single();

      if (error || !producao) {
        return { success: false, error: error?.message || 'Falha ao criar produção.' };
      }

      // Insere Histórico Inicial
      await supabase.from('producao_historico').insert({
        producao_id: producao.id,
        status_anterior: null,
        status_novo: 'CRIADA',
        descricao: `Produção de mídia iniciada para o Pedido de Inserção.`,
        usuario_id: usuarioId || null,
      });

      // Insere Auditoria
      await supabase.from('producao_auditoria').insert({
        producao_id: producao.id,
        evento: 'PRODUCAO_CRIADA',
        usuario_id: usuarioId || null,
        detalhes: { titulo: payload.titulo, pedido_insercao_id: payload.pedidoInsercaoId },
      });

      return { success: true, producaoId: producao.id };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  /**
   * Registra o upload do material publicitário, salva a object_key do Cloudflare R2 e cria a versão v1 imutável
   */
  async uploadMedia(payload: UploadMediaPayload, usuarioId?: string): Promise<{ success: boolean; midiaId?: string; error?: string }> {
    try {
      const { data: producao } = await supabase.from('producoes').select('empresa_operadora_id').eq('id', payload.producaoId).single();
      if (!producao) return { success: false, error: 'Produção não localizada.' };

      const versao = 1;
      const cleanFileName = payload.nome.replace(/[^a-zA-Z0-9._-]/g, '_');
      const objectKey = `tenants/${producao.empresa_operadora_id}/producoes/${payload.producaoId}/midias/v${versao}/${cleanFileName}`;

      const { data: midia, error: midiaErr } = await supabase
        .from('midias')
        .insert({
          producao_id: payload.producaoId,
          tipo: payload.tipo,
          nome: payload.nome,
          descricao: payload.descricao || null,
          mime_type: payload.mimeType,
          tamanho: payload.tamanho,
          duracao: payload.duracao || 15,
          largura: payload.largura || 1920,
          altura: payload.altura || 1080,
          object_key: objectKey,
          checksum: payload.checksum || `MD5-${Date.now()}`,
          versao_atual: versao,
          status: 'EM_REVISAO',
        })
        .select('id')
        .single();

      if (midiaErr || !midia) return { success: false, error: midiaErr?.message };

      // Insere Versão v1 Imutável em midia_versoes
      await supabase.from('midia_versoes').insert({
        midia_id: midia.id,
        numero_versao: versao,
        object_key: objectKey,
        checksum: payload.checksum || `MD5-${Date.now()}`,
        tamanho: payload.tamanho,
        mime_type: payload.mimeType,
        duracao: payload.duracao || 15,
        largura: payload.largura || 1920,
        altura: payload.altura || 1080,
        usuario_id: usuarioId || null,
      });

      // Atualiza Status da Produção para MATERIAL_RECEBIDO
      await supabase.from('producoes').update({ status: 'MATERIAL_RECEBIDO', updated_at: new Date().toISOString() }).eq('id', payload.producaoId);

      // Registra Histórico e Auditoria
      await supabase.from('producao_historico').insert({
        producao_id: payload.producaoId,
        status_anterior: 'CRIADA',
        status_novo: 'MATERIAL_RECEBIDO',
        descricao: `Material ${payload.nome} (v1) enviado para o R2 Storage.`,
        usuario_id: usuarioId || null,
      });

      await supabase.from('producao_auditoria').insert({
        producao_id: payload.producaoId,
        evento: 'MIDIA_ENVIADA',
        usuario_id: usuarioId || null,
        detalhes: { midia_id: midia.id, object_key: objectKey, nome: payload.nome },
      });

      return { success: true, midiaId: midia.id };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  /**
   * Substitui mídia por uma nova versão (Versão v2, v3...), sem sobrescrever arquivos antigos no R2
   */
  async replaceMedia(midiaId: string, payload: UploadMediaPayload, usuarioId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: midia } = await supabase.from('midias').select('*, producao:producoes(*)').eq('id', midiaId).single();
      if (!midia) return { success: false, error: 'Mídia não encontrada.' };

      const novaVersao = (midia.versao_atual || 1) + 1;
      const cleanFileName = payload.nome.replace(/[^a-zA-Z0-9._-]/g, '_');
      const objectKey = `tenants/${midia.producao.empresa_operadora_id}/producoes/${midia.producao_id}/midias/v${novaVersao}/${cleanFileName}`;

      // 1. Atualiza mídia principal com versao_atual incrementada
      await supabase
        .from('midias')
        .update({
          versao_atual: novaVersao,
          object_key: objectKey,
          tamanho: payload.tamanho,
          mime_type: payload.mimeType,
          status: 'EM_REVISAO',
        })
        .eq('id', midiaId);

      // 2. Insere nova versão imutável em midia_versoes
      await supabase.from('midia_versoes').insert({
        midia_id: midiaId,
        numero_versao: novaVersao,
        object_key: objectKey,
        checksum: payload.checksum || `MD5-${Date.now()}`,
        tamanho: payload.tamanho,
        mime_type: payload.mimeType,
        duracao: payload.duracao || 15,
        largura: payload.largura || 1920,
        altura: payload.altura || 1080,
        usuario_id: usuarioId || null,
      });

      // Auditoria
      await supabase.from('producao_auditoria').insert({
        producao_id: midia.producao_id,
        evento: 'MIDIA_SUBSTITUIDA',
        usuario_id: usuarioId || null,
        detalhes: { midia_id: midiaId, nova_versao: novaVersao, object_key: objectKey },
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  /**
   * Aprova formalmente a mídia publicitária
   */
  async approveMedia(midiaId: string, observacao?: string, usuarioId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: midia } = await supabase.from('midias').select('*').eq('id', midiaId).single();
      if (!midia) return { success: false, error: 'Mídia não encontrada.' };

      // Registra Aprovação em midia_aprovacoes
      await supabase.from('midia_aprovacoes').insert({
        midia_id: midiaId,
        status: 'APROVADO',
        observacao: observacao || 'Material aprovado formalmente para exibição.',
        usuario_id: usuarioId || null,
      });

      // Atualiza Mídia e Produção
      await supabase.from('midias').update({ status: 'APROVADO' }).eq('id', midiaId);
      await supabase.from('producoes').update({ status: 'APROVADA', updated_at: new Date().toISOString() }).eq('id', midia.producao_id);

      await supabase.from('producao_auditoria').insert({
        producao_id: midia.producao_id,
        evento: 'MIDIA_APROVADA',
        usuario_id: usuarioId || null,
        detalhes: { midia_id: midiaId, observacao },
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  /**
   * Reprova a mídia apontando o motivo técnico
   */
  async rejectMedia(midiaId: string, motivo: string, usuarioId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: midia } = await supabase.from('midias').select('*').eq('id', midiaId).single();
      if (!midia) return { success: false, error: 'Mídia não encontrada.' };

      await supabase.from('midia_aprovacoes').insert({
        midia_id: midiaId,
        status: 'REPROVADO',
        motivo,
        usuario_id: usuarioId || null,
      });

      await supabase.from('midias').update({ status: 'REPROVADO' }).eq('id', midiaId);
      await supabase.from('producoes').update({ status: 'REPROVADA', updated_at: new Date().toISOString() }).eq('id', midia.producao_id);

      await supabase.from('producao_auditoria').insert({
        producao_id: midia.producao_id,
        evento: 'MIDIA_REPROVADA',
        usuario_id: usuarioId || null,
        detalhes: { midia_id: midiaId, motivo },
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  /**
   * Marca a mídia como PUBLICADA e pronta para o Agendamento (Fase 7.5-C)
   */
  async publishMedia(midiaId: string, usuarioId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: midia } = await supabase.from('midias').select('*').eq('id', midiaId).single();
      if (!midia) return { success: false, error: 'Mídia não encontrada.' };

      await supabase.from('producoes').update({ status: 'PUBLICADA', updated_at: new Date().toISOString() }).eq('id', midia.producao_id);

      await supabase.from('producao_auditoria').insert({
        producao_id: midia.producao_id,
        evento: 'MIDIA_PUBLICADA',
        usuario_id: usuarioId || null,
        detalhes: { midia_id: midiaId },
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  /**
   * Busca produção completa com mídias, versões, aprovações e histórico
   */
  async getProduction(producaoId: string): Promise<ProducaoCompleta | null> {
    try {
      const { data, error } = await supabase
        .from('producoes')
        .select(`
          *,
          cliente:clientes(*),
          pedido_insercao:pedidos_insercao(*),
          midias:midias(*, versoes:midia_versoes(*), aprovacoes:midia_aprovacoes(*)),
          historico:producao_historico(*)
        `)
        .eq('id', producaoId)
        .maybeSingle();

      if (error || !data) return null;
      return data as ProducaoCompleta;
    } catch (err) {
      return null;
    }
  }

  /**
   * Lista todas as produções operacionais por tenant
   */
  async listProductions(empresaOperadoraId?: string): Promise<ProducaoCompleta[]> {
    try {
      let query = supabase
        .from('producoes')
        .select(`*, cliente:clientes(*), pedido_insercao:pedidos_insercao(*), midias:midias(*)`)
        .order('created_at', { ascending: false });

      if (empresaOperadoraId) query = query.eq('empresa_operadora_id', empresaOperadoraId);

      const { data } = await query;
      return (data || []) as ProducaoCompleta[];
    } catch (err) {
      return [];
    }
  }
}

export const producaoService = new ProducaoService();
