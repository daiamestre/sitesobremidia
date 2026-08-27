/**
 * SOBRE MÍDIA — useClienteModalidade
 * Detecta modalidade comercial do cliente (ANUNCIANTE | HOST | HIBRIDO),
 * identidade da empresa (tabela `empresas`, fonte real dos dados cadastrais)
 * e existência de contrato ativo.
 *
 * CORREÇÃO CRÍTICA (regressão histórica): o hook anterior consultava colunas
 * inexistentes em `clientes` (razao_social/nome_fantasia vivem em `empresas`)
 * e não expunha `hasActiveContract` — o layout avaliava `undefined` e
 * redirecionava TODO usuário do portal para /portal/onboarding.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type ModalidadePortal = 'ANUNCIANTE' | 'HOST' | 'HIBRIDO';

export interface ClientePortalInfo {
  id: string;
  modalidade: ModalidadePortal;
  razao_social: string;
  nome_fantasia?: string;
  segmento?: string;
  cnpj?: string;
  brand_logo_url?: string | null;
  brand_cor_primaria?: string | null;
  brand_cor_secundaria?: string | null;
  brand_fonte_primaria?: string | null;
  brand_fonte_secundaria?: string | null;
}

/** Contrato em vigor para fins comerciais do portal */
export const CONTRATOS_ATIVOS_STATUS = [
  'EM_PRODUCAO',
  'AGUARDANDO_APROVACAO',
  'CAMPANHA_APROVADA',
  'CAMPANHA_ATIVA',
] as const;

export interface UseClienteModalidadeReturn {
  modalidade: ModalidadePortal | null;
  cliente: ClientePortalInfo | null;
  isLoading: boolean;
  isError: boolean;
  // Guards por modalidade
  isAnunciante: boolean;
  isHost: boolean;
  isHibrido: boolean;
  // Label human-readable
  modalidadeLabel: string;
  // Contrato ativo real (fonte: contratos.status_workflow)
  hasActiveContract: boolean;
}

const MODALIDADE_LABELS: Record<ModalidadePortal, string> = {
  ANUNCIANTE: 'Anunciante',
  HOST: 'Host',
  HIBRIDO: 'Híbrido',
};

interface EmpresasJoin {
  razao_social?: string | null;
  nome_fantasia?: string | null;
  segmento?: string | null;
  cnpj?: string | null;
}

function extrairEmpresa(raw: EmpresasJoin[] | EmpresasJoin | null): EmpresasJoin | null {
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] ?? null : raw;
}

export function useClienteModalidade(): UseClienteModalidadeReturn {
  const { usuario } = useAuth();
  const clienteId = usuario?.cliente_id;

  const { data, isLoading: loadingCliente, isError } = useQuery<ClientePortalInfo | null>({
    queryKey: ['cliente-modalidade', clienteId],
    queryFn: async (): Promise<ClientePortalInfo | null> => {
      if (!clienteId) return null;

      const { data, error } = await supabase
        .from('clientes')
        .select('id, modalidade, brand_logo_url, brand_cor_primaria, brand_cor_secundaria, brand_fonte_primaria, brand_fonte_secundaria, empresas(razao_social, nome_fantasia, segmento, cnpj)')
        .eq('id', clienteId)
        .maybeSingle();

      if (error) {
        console.error('[useClienteModalidade] Erro ao buscar modalidade:', error);
        throw error;
      }
      if (!data) return null;

      const emp = extrairEmpresa(
        (data as unknown as { empresas?: EmpresasJoin[] | EmpresasJoin }).empresas ?? null
      );

      return {
        id: data.id,
        modalidade: (data.modalidade as ModalidadePortal) || 'ANUNCIANTE',
        razao_social: emp?.razao_social || '',
        nome_fantasia: emp?.nome_fantasia || undefined,
        segmento: emp?.segmento || undefined,
        cnpj: emp?.cnpj || undefined,
        brand_logo_url: data.brand_logo_url,
        brand_cor_primaria: data.brand_cor_primaria,
        brand_cor_secundaria: data.brand_cor_secundaria,
        brand_fonte_primaria: data.brand_fonte_primaria,
        brand_fonte_secundaria: data.brand_fonte_secundaria,
      };
    },
    enabled: !!clienteId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 2,
  });

  const { data: contratoAtivo, isLoading: loadingContrato } = useQuery<boolean>({
    queryKey: ['cliente-contrato-ativo', clienteId],
    queryFn: async (): Promise<boolean> => {
      if (!clienteId) return false;

      const { count, error } = await supabase
        .from('contratos')
        .select('id', { count: 'exact', head: true })
        .eq('cliente_id', clienteId)
        .in('status_workflow', [...CONTRATOS_ATIVOS_STATUS]);

      if (error) {
        console.error('[useClienteModalidade] Erro ao verificar contrato ativo:', error);
        return false;
      }
      return (count ?? 0) > 0;
    },
    enabled: !!clienteId,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });

  const modalidade = data?.modalidade ?? null;

  return {
    modalidade,
    cliente: data ?? null,
    isLoading: loadingCliente || loadingContrato,
    isError,
    isAnunciante: modalidade === 'ANUNCIANTE' || modalidade === 'HIBRIDO',
    isHost: modalidade === 'HOST' || modalidade === 'HIBRIDO',
    isHibrido: modalidade === 'HIBRIDO',
    modalidadeLabel: modalidade ? MODALIDADE_LABELS[modalidade] : '',
    hasActiveContract: contratoAtivo === true,
  };
}
