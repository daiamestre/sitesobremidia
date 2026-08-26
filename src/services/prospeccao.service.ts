/**
 * SOBRE MÍDIA — prospeccao.service
 * Central de Prospecção do REPRESENTANTE:
 *  - listar pontos parceiros disponíveis (RPC server-side por tenant);
 *  - sincronizar seleção anunciante↔pontos via RPC validada;
 *  - cadastrar PONTO PARCEIRO (tabela `pontos`, código EST- automático);
 *  - provisionar GESTOR DE MÍDIAS pelo mecanismo oficial (senha automática).
 *
 * RPCs/tabelas novas (20261039) ainda não existem no Database gerado pelo
 * CLI — casts tipados no padrão customerPortalDb mantêm type-safety.
 */

import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommerceDatabase, PontoParceiroInsert } from '@/types/customerPortalDb';
import { corporateUsersService } from '@/services/corporateUsers.service';

const db = supabase as unknown as SupabaseClient<CommerceDatabase>;

type RpcResult<T> = { data: T | null; error: { message: string } | null };

function rpcTyped<T>(fn: string, args?: Record<string, unknown>): Promise<RpcResult<T>> {
  return (supabase as unknown as {
    rpc: (f: string, a?: Record<string, unknown>) => Promise<RpcResult<T>>;
  }).rpc(fn, args) as unknown as Promise<RpcResult<T>>;
}

export interface PontoParaAnunciar {
  ponto_id: string;
  nome: string;
  categoria?: string | null;
  descricao?: string | null;
  cidade?: string | null;
  estado?: string | null;
  bairro?: string | null;
  logradouro?: string | null;
  foto_url?: string | null;
  valor_anuncio?: number | null;
  periodicidade?: string | null;
  quantidade_telas: number;
  disponibilidade: string;
}

export interface KpisProspeccao {
  meus_anunciantes: number;
  pontos_disponiveis: number;
  gestores_ativos: number;
  pontos_vinculados: number;
}

export interface NovoPontoParceiroPayload {
  nome: string;
  razaoSocial?: string;
  cnpjCpf?: string;
  categoria?: string;
  responsavelNome?: string;
  responsavelCargo?: string;
  telefone?: string;
  whatsapp?: string;
  email?: string;
  siteRedes?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  referencia?: string;
  quantidadeTelas: number;
  ambientes?: string;
  localizacaoTelas?: string;
  horarioFuncionamento?: string;
  fluxoDiario?: string;
  perfilPublico?: string;
  fotoCapaUrl?: string;
  fotosUrls?: string[];
  modeloComercial: 'PERMUTA' | 'COMISSIONADO';
  permutaDescricao?: string;
  permutaContrapartida?: string;
  permutaPeriodo?: string;
  percentualComissao?: number | null;
  baseCalculo?: string;
  vigencia?: string;
  contratoObservacao?: string;
  observacoes?: string;
}

/** Monta o texto estruturado das regras comerciais do ponto */
export function montarRegrasComerciais(p: NovoPontoParceiroPayload): string[] {
  const r: string[] = [];
  r.push('MODELO COMERCIAL: ' + p.modeloComercial);
  if (p.modeloComercial === 'PERMUTA') {
    if (p.permutaDescricao) r.push('PERMUTA - Descricao: ' + p.permutaDescricao);
    if (p.permutaContrapartida) r.push('PERMUTA - Contrapartida: ' + p.permutaContrapartida);
    if (p.permutaPeriodo) r.push('PERMUTA - Periodo: ' + p.permutaPeriodo);
  } else {
    if (p.percentualComissao != null) r.push('COMISSAO: ' + p.percentualComissao + '%');
    if (p.baseCalculo) r.push('Base de calculo: ' + p.baseCalculo);
    if (p.vigencia) r.push('Vigencia: ' + p.vigencia);
  }
  if (p.contratoObservacao) r.push('Contrato: ' + p.contratoObservacao);
  if (p.horarioFuncionamento) r.push('Horario de funcionamento: ' + p.horarioFuncionamento);
  if (p.ambientes) r.push('Ambientes: ' + p.ambientes);
  if (p.localizacaoTelas) r.push('Localizacao das telas: ' + p.localizacaoTelas);
  if (p.fluxoDiario) r.push('Fluxo diario estimado: ' + p.fluxoDiario);
  if (p.perfilPublico) r.push('Perfil do publico: ' + p.perfilPublico);
  if (p.referencia) r.push('Ponto de referencia: ' + p.referencia);
  if (p.siteRedes) r.push('Site/redes: ' + p.siteRedes);
  if (p.observacoes) r.push(p.observacoes);
  return r;
}

/** Escritas em `pontos` com adaptador estreito e tipado */
function pontosInsert(payload: PontoParceiroInsert): Promise<RpcResult<unknown>> {
  return (db.from('pontos') as unknown as {
    insert: (v: PontoParceiroInsert) => Promise<RpcResult<unknown>>;
  }).insert(payload);
}

export class ProspeccaoService {
  /** Pontos parceiros DISPONÍVEIS do tenant (RPC server-side, RLS-safe) */
  async listarPontosDisponiveis(): Promise<PontoParaAnunciar[]> {
    const { data, error } = await rpcTyped<PontoParaAnunciar[]>('listar_pontos_para_anunciar');
    if (error) throw new Error(error.message);
    return (data ?? []).filter((p) => p.disponibilidade === 'DISPONIVEL');
  }

  /** Sincroniza a seleção anunciante↔pontos (RPC com validação de escopo) */
  async selecionarPontos(
    clienteId: string,
    pontoIds: string[]
  ): Promise<{ vinculados: number; selecionados: number }> {
    const { data, error } = await rpcTyped<{ vinculados: number; selecionados: number }>(
      'selecionar_pontos_prospeccao',
      { p_cliente_id: clienteId, p_ponto_ids: pontoIds }
    );
    if (error) throw new Error(error.message);
    return {
      vinculados: Number((data as any)?.vinculados ?? 0),
      selecionados: Number((data as any)?.selecionados ?? 0),
    };
  }

  /** Vínculos de prospecção já existentes de um cliente */
  async listarPontosDoCliente(clienteId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('cliente_pontos')
      .select('ponto_id')
      .eq('cliente_id', clienteId)
      .eq('origem', 'PROSPECCAO');
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => r.ponto_id);
  }

  /**
   * Cadastra PONTO PARCEIRO na tabela central `pontos`.
   * Código EST-NNNNNN gerado pelo trigger fn_set_codigo_publico.
   * RLS pontos_interno_insert autoriza REPRESENTANTE no próprio tenant.
   */
  async criarPontoParceiro(
    payload: NovoPontoParceiroPayload
  ): Promise<{ id: string; codigo_publico: string | null }> {
    const descricao = [
      payload.razaoSocial ? 'Razao social: ' + payload.razaoSocial : null,
      payload.cnpjCpf ? 'CPF/CNPJ: ' + payload.cnpjCpf : null,
      payload.responsavelNome
        ? 'Responsavel: ' + payload.responsavelNome + (payload.responsavelCargo ? ' (' + payload.responsavelCargo + ')' : '')
        : null,
      payload.telefone || payload.whatsapp
        ? 'Contato: ' + [payload.telefone, payload.whatsapp].filter(Boolean).join(' / ')
        : null,
      payload.email ? 'E-mail: ' + payload.email : null,
    ]
      .filter(Boolean)
      .join(' | ');

    const insertPayload: PontoParceiroInsert = {
      // Tolerante à origem do chamador: wizard envia nome; form legível usa nomeFantasia
      nome: payload.nome ?? (payload as unknown as { nomeFantasia?: string }).nomeFantasia ?? '',
      categoria: payload.categoria || null,
      descricao: [descricao, ...montarRegrasComerciais(payload)].filter(Boolean).join('\n'),
      foto_url: payload.fotoCapaUrl || null,
      galeria: (payload.fotosUrls ?? []).length ? (payload.fotosUrls as unknown as import('@/types/customerPortalDb').Json) : undefined,
      cep: payload.cep || null,
      logradouro: payload.logradouro || null,
      numero: payload.numero || null,
      complemento: payload.complemento || null,
      bairro: payload.bairro || null,
      cidade: payload.cidade || null,
      estado: payload.estado ? payload.estado.toUpperCase().slice(0, 2) : null,
      quantidade_telas: Math.max(0, Number(payload.quantidadeTelas) || 0),
      disponibilidade: 'DISPONIVEL',
      status_operacional: 'ATIVO',
      regras_comerciais: montarRegrasComerciais(payload).join('\n'),
    };

    const { data, error } = await pontosInsert(insertPayload);
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as { id: string; codigo_publico?: string | null } | null;
    return { id: String(row?.id ?? ''), codigo_publico: row?.codigo_publico ?? null };
  }

  /** Provisiona GESTOR DE MÍDIAS via mecanismo oficial (senha automática) */
  async provisionarGestor(dados: {
    nome: string;
    email: string;
    telefone?: string;
    empresa?: string;
    cargo?: string;
    cpfCnpj?: string;
    cidade?: string;
    estado?: string;
    endereco?: string;
    observacoes?: string;
  }): Promise<{ email: string; senha_inicial: string }> {
    const perfilId = await this.buscarPerfilGestorId();
    const dadosExtra: Record<string, unknown> = {
      tipo_prospect: 'GESTOR_DE_MIDIAS',
      empresa: dados.empresa || null,
      cargo: dados.cargo || null,
      cpf_cnpj: dados.cpfCnpj || null,
      endereco: [dados.endereco, dados.cidade, dados.estado].filter(Boolean).join(', ') || null,
      observacoes: dados.observacoes || null,
    };
    const r = await corporateUsersService.provisionarUsuarioDireto({
      nome: dados.nome,
      email: dados.email,
      telefone: dados.telefone,
      perfilId,
      clienteId: null,
      dadosExtra,
    });
    if (!r.success) throw new Error(r.error || 'Falha ao provisionar gestor.');
    return { email: r.email ?? dados.email, senha_inicial: r.senha_inicial ?? '' };
  }

  private async buscarPerfilGestorId(): Promise<string> {
    const { data, error } = await supabase
      .from('perfis')
      .select('id')
      .eq('nome', 'GESTOR')
      .eq('ativo', true)
      .maybeSingle();
    if (error || !data) throw new Error(error?.message || 'Perfil GESTOR não encontrado.');
    return data.id;
  }

  /** KPIs da Central de Prospecção para o dashboard */
  async getKpis(): Promise<KpisProspeccao> {
    const { data, error } = await rpcTyped<KpisProspeccao>('get_kpis_prospeccao_representante');
    if (error) throw new Error(error.message);
    return {
      meus_anunciantes: Number(data?.meus_anunciantes ?? 0),
      pontos_disponiveis: Number(data?.pontos_disponiveis ?? 0),
      gestores_ativos: Number(data?.gestores_ativos ?? 0),
      pontos_vinculados: Number(data?.pontos_vinculados ?? 0),
    };
  }
}

export const prospeccaoService = new ProspeccaoService();
