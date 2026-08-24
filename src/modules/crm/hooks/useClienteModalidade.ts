/**
 * SOBRE MÍDIA — useClienteModalidade
 * Customer Portal FASE 1: detectar modalidade do cliente em runtime.
 *
 * Retorna modalidade (ANUNCIANTE | HOST | HIBRIDO), nome e dados básicos
 * do cliente vinculado ao usuário autenticado.
 * Cached via React Query (5 minutos) para evitar waterfall de requests.
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
  logo_url?: string;
}

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
}

const MODALIDADE_LABELS: Record<ModalidadePortal, string> = {
  ANUNCIANTE: 'Anunciante',
  HOST: 'Host',
  HIBRIDO: 'Híbrido',
};

export function useClienteModalidade(): UseClienteModalidadeReturn {
  const { usuario } = useAuth();
  const clienteId = usuario?.cliente_id;

  const { data, isLoading, isError } = useQuery<ClientePortalInfo | null>({
    queryKey: ['cliente-modalidade', clienteId],
    queryFn: async (): Promise<ClientePortalInfo | null> => {
      if (!clienteId) return null;

      const { data, error } = await supabase
        .from('clientes')
        .select('id, modalidade, razao_social, nome_fantasia, segmento, cnpj')
        .eq('id', clienteId)
        .maybeSingle();

      if (error) {
        console.error('[useClienteModalidade] Erro ao buscar modalidade:', error);
        throw error;
      }

      if (!data) return null;

      return {
        id: data.id,
        modalidade: (data.modalidade as ModalidadePortal) || 'ANUNCIANTE',
        razao_social: data.razao_social || '',
        nome_fantasia: data.nome_fantasia || undefined,
        segmento: data.segmento || undefined,
        cnpj: data.cnpj || undefined,
      };
    },
    enabled: !!clienteId,
    staleTime: 5 * 60 * 1000, // 5 minutos
    gcTime: 10 * 60 * 1000,
    retry: 2,
  });

  const modalidade = data?.modalidade ?? null;

  return {
    modalidade,
    cliente: data ?? null,
    isLoading,
    isError,
    isAnunciante: modalidade === 'ANUNCIANTE' || modalidade === 'HIBRIDO',
    isHost: modalidade === 'HOST' || modalidade === 'HIBRIDO',
    isHibrido: modalidade === 'HIBRIDO',
    modalidadeLabel: modalidade ? MODALIDADE_LABELS[modalidade] : '',
  };
}
