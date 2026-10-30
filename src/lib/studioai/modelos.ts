// SOBRE MÍDIA Studio AI — catálogo em PASTAS (F-221): cada pasta = modelo de capa + variações do mesmo segmento
// (src/lib/studio/pastas.ts) + modelos que o owner/ADM gravou nela (studio_modelos.dados.pasta). Modelo novo do
// owner/ADM sem pasta vira uma pasta própria.
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ModeloDeArte } from '@/lib/studio/modelos';
import { CAPAS, modelosDaPasta } from '@/lib/studio/pastas';
import { modelosDaEmpresa } from './api';

export interface PastaDeModelos { capa: ModeloDeArte; modelos: ModeloDeArte[] }

export function montarPastas(daEmpresa: ModeloDeArte[]): PastaDeModelos[] {
  const proprias = daEmpresa.filter((m) => !m.pasta || !CAPAS.some((c) => c.id === m.pasta) && !daEmpresa.some((x) => x.id === m.pasta));
  return [
    ...proprias.map((m) => ({ capa: m, modelos: [m, ...daEmpresa.filter((x) => x.pasta === m.id)] })),
    ...CAPAS.map((c) => modelosDaPasta(c, daEmpresa)).filter((l) => l.length).map((l) => ({ capa: l[0], modelos: l })),
  ];
}

export function useCatalogo() {
  const extras = useQuery({ queryKey: ['studio-modelos'], queryFn: modelosDaEmpresa, staleTime: 60_000 });
  return useMemo(() => {
    const daEmpresa = (extras.data ?? []).filter((m) => m.ativo);
    const pastas = montarPastas(daEmpresa);
    const todos = pastas.flatMap((p) => p.modelos);
    return { pastas, todos, daEmpresa: new Set(daEmpresa.map((m) => m.id)), arquivados: (extras.data ?? []).filter((m) => !m.ativo), carregando: extras.isLoading };
  }, [extras.data, extras.isLoading]);
}

/** Identificador estável de um modelo novo (minúsculas, sem acento). */
export const idDoModelo = (nome: string) =>
  `${nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'modelo'}-${Date.now().toString(36)}`;
