// F-240 — ARTE PRONTA no editor do Studio: uma arte montada fora do catálogo de modelos (ex.: encarte oficial com os
// produtos, a logo e os contatos do cliente) abre no editor de camadas só nos formatos dela (em pé e/ou deitado), com a
// pasta da galeria certa.
import type { Documento, FormatoArte } from './documento';
import type { PastaDaGaleria } from '@/lib/galeria';

export const CHAVE_ARTE_PRONTA = 'studio-arte-pronta';
/** modelo de supermercado usado só como "casca" do editor (a arte pronta substitui o desenho dele) */
export const BASE_DA_ARTE_PRONTA = 'ofertas-da-semana';
export interface ArtePronta { /** F-296: o encarte de onde a arte saiu (o projeto salvo fica com a identidade dele) */ id?: string; docs: Partial<Record<FormatoArte, Documento>>; formato: FormatoArte; nome: string; pasta: PastaDaGaleria; voltar: string }
/** F-296: id gravado no projeto de uma arte pronta (`arte:<id do encarte>`); a casca do editor nunca vira a identidade dele */
export const idDaArtePronta = (id?: string | null) => `arte:${id || 'encarte'}`;
export const ehArtePronta = (modeloId?: string | null) => !!modeloId && modeloId.startsWith('arte:');

/** Guarda a arte e devolve o endereço do editor. */
export function enderecoDaArtePronta(a: ArtePronta): string {
  sessionStorage.setItem(CHAVE_ARTE_PRONTA, JSON.stringify(a));
  return `/studio/editar/${BASE_DA_ARTE_PRONTA}?pronto=1`;
}

export function lerArtePronta(): ArtePronta | null {
  try {
    const a = JSON.parse(sessionStorage.getItem(CHAVE_ARTE_PRONTA) ?? 'null') as ArtePronta | null;
    return a?.docs?.[a.formato]?.camadas && a.pasta?.chave ? a : null;
  } catch { return null; }
}
