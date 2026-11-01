// F-235 — a logo 3D que a pessoa salvou no Criador de Logos do Studio (guardada na aba do navegador) segue para os
// encartes (cabeçalho) e para o Palco de Ofertas (no lugar do título escrito).
import type { Selo } from '@/lib/tabloide/selos';

export const CHAVE_LOGO_DO_ENCARTE = 'studio-logo-encarte';
export interface LogoSalva { id: string; url: string; largura: number; altura: number }

export function logoSalvaDoStudio(): LogoSalva | null {
  try {
    const bruto = sessionStorage.getItem(CHAVE_LOGO_DO_ENCARTE);
    if (!bruto) return null;
    const l = JSON.parse(bruto) as Partial<LogoSalva>;
    return l.id && l.url && Number(l.largura) > 0 && Number(l.altura) > 0 ? { id: l.id, url: l.url, largura: Number(l.largura), altura: Number(l.altura) } : null;
  } catch { return null; }
}

/** A logo como item da galeria (para o desenho do encarte achar a logo pelo id). */
export const seloDaLogo = (l: LogoSalva): Selo => ({
  id: l.id, slug: l.id, nome: 'Logo 3D', categoria: 'Criadas no Studio', titulo: 'Logo 3D', imagem_url: l.url, miniatura_url: null,
  largura: l.largura, altura: l.altura, tipo: 'LOGO_CABECALHO', estado: 'APROVADO', ordem: 0, dono_id: 'eu',
} as unknown as Selo);
