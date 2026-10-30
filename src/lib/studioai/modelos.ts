// SOBRE MÍDIA Studio AI — catálogo = modelos próprios do código + modelos novos que o owner/ADM cadastra (studio_modelos).
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MODELOS, type ModeloDeArte } from '@/lib/studio/modelos';
import { modelosDaEmpresa } from './api';

export function useCatalogo() {
  const extras = useQuery({ queryKey: ['studio-modelos'], queryFn: modelosDaEmpresa, staleTime: 60_000 });
  return useMemo(() => {
    const daEmpresa = (extras.data ?? []).filter((m) => m.ativo);
    const todos: ModeloDeArte[] = [...daEmpresa, ...MODELOS];
    return { todos, daEmpresa: new Set(daEmpresa.map((m) => m.id)), arquivados: (extras.data ?? []).filter((m) => !m.ativo), carregando: extras.isLoading };
  }, [extras.data, extras.isLoading]);
}

/** Identificador estável de um modelo novo (minúsculas, sem acento). */
export const idDoModelo = (nome: string) =>
  `${nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'modelo'}-${Date.now().toString(36)}`;
