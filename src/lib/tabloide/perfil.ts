/**
 * Cartaz Digital (F-179) — perfil da loja de quem cria os cartazes.
 * Os dados da empresa, as fontes e a logo ficam guardados uma vez e valem para os próximos cartazes;
 * o endereço do portal, o CEP, os segmentos e "mostrar minha loja" controlam a página pública de ofertas.
 */
import { supabase } from '@/integrations/supabase/client';
import { type ConfigCartaz, type DadosEmpresa, type FontesCartaz, type FundoLogo, type MostrarEmpresa } from './cartaz';

const tabela = () => (supabase as unknown as { from: (t: string) => any }).from('tabloide_perfil');

export interface PerfilDaLoja {
  empresa?: DadosEmpresa;
  mostrar?: MostrarEmpresa;
  fontes?: FontesCartaz;
  logoMarcaUrl?: string | null;
  mostrarLogo?: boolean;
  fundoLogo?: FundoLogo;
}

export interface PortalDaLoja {
  slug: string | null;
  cep: string | null;
  segmentos: string[];
  visivel: boolean;
}

export interface PerfilCompleto { dados: PerfilDaLoja; portal: PortalDaLoja }

const PORTAL_VAZIO: PortalDaLoja = { slug: null, cep: null, segmentos: [], visivel: false };

export async function carregarPerfil(): Promise<PerfilCompleto> {
  const { data } = await tabela().select('dados, slug, cep, segmentos, visivel').maybeSingle();
  if (!data) return { dados: {}, portal: { ...PORTAL_VAZIO } };
  return {
    dados: (data.dados ?? {}) as PerfilDaLoja,
    portal: { slug: data.slug ?? null, cep: data.cep ?? null, segmentos: Array.isArray(data.segmentos) ? data.segmentos : [], visivel: !!data.visivel },
  };
}

/** O que do cartaz atual vira "padrão da loja" para os próximos. */
export function perfilDoCartaz(cfg: ConfigCartaz): PerfilDaLoja {
  return { empresa: cfg.empresa, mostrar: cfg.mostrar, fontes: cfg.fontes, logoMarcaUrl: cfg.logoMarcaUrl, mostrarLogo: cfg.mostrarLogo, fundoLogo: cfg.fundoLogo };
}

/** Aplica o padrão da loja num cartaz novo (só o que estiver guardado). */
export function aplicarPerfil(cfg: ConfigCartaz, perfil: PerfilDaLoja): ConfigCartaz {
  return {
    ...cfg,
    empresa: { ...cfg.empresa, ...(perfil.empresa ?? {}) },
    mostrar: { ...cfg.mostrar, ...(perfil.mostrar ?? {}) },
    fontes: { ...cfg.fontes, ...(perfil.fontes ?? {}) },
    logoMarcaUrl: perfil.logoMarcaUrl ?? cfg.logoMarcaUrl,
    mostrarLogo: perfil.mostrarLogo ?? cfg.mostrarLogo,
    fundoLogo: perfil.fundoLogo ?? cfg.fundoLogo,
  };
}

async function gravar(linha: Record<string, unknown>, usuarioId: string): Promise<void> {
  const { data: existe } = await tabela().select('user_id').eq('user_id', usuarioId).maybeSingle();
  const { error } = existe ? await tabela().update(linha as never).eq('user_id', usuarioId) : await tabela().insert({ ...linha, user_id: usuarioId } as never);
  if (error) {
    if (/duplicate|unique|23505/i.test(`${error.code ?? ''} ${error.message ?? ''}`)) throw new Error('Esse endereço do portal já está em uso. Escolha outro.');
    if (/check|23514/i.test(`${error.code ?? ''} ${error.message ?? ''}`)) throw new Error('Confira o endereço (letras minúsculas, números e hífen, de 3 a 40) e o CEP.');
    throw new Error(error.message || 'Não foi possível salvar.');
  }
}

export async function salvarPerfil(dados: PerfilDaLoja, usuarioId: string, clienteId: string | null): Promise<void> {
  await gravar({ dados, cliente_id: clienteId }, usuarioId);
}

/** Transforma o nome digitado num endereço válido: "Mercado Bom Preço" → "mercado-bom-preco". */
export function enderecoDoPortal(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

export async function salvarPortal(portal: PortalDaLoja, dados: PerfilDaLoja, usuarioId: string, clienteId: string | null): Promise<void> {
  const slug = portal.slug ? enderecoDoPortal(portal.slug) : '';
  if (portal.visivel && slug.length < 3) throw new Error('Para mostrar a loja no portal, escolha um endereço com pelo menos 3 letras.');
  const cep = (portal.cep ?? '').trim();
  if (cep && !/^\d{5}-?\d{3}$/.test(cep)) throw new Error('CEP inválido. Use o formato 00000-000.');
  await gravar({ dados, cliente_id: clienteId, slug: slug || null, cep: cep || null, segmentos: portal.segmentos.slice(0, 3), visivel: portal.visivel }, usuarioId);
}

export interface CartazDoPortal { id: string; nome: string; imagens: string[]; inicio: string | null; fim: string | null; publicado_em: string | null }
export interface LojaDoPortal { slug: string; segmentos: string[]; empresa: Partial<DadosEmpresa>; logo: string | null; cartazes: CartazDoPortal[] }

/** Página pública: a loja e os cartazes publicados (não exige login). */
export async function lerPortal(slug: string): Promise<LojaDoPortal | null> {
  const { data, error } = await (supabase as unknown as { rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> }).rpc('tabloide_portal', { p_slug: slug });
  if (error || !data) return null;
  return data as LojaDoPortal;
}

export const enderecoPublico = (slug: string): string => `${typeof window !== 'undefined' ? window.location.origin : ''}/ofertas/${slug}`;
