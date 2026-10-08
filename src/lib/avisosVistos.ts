/**
 * F-167 — Alertas calculados da faixa do topo ("14 faturas vencidas", "2 mensagens não lidas"…) respeitam o que o usuário já viu.
 *  - O alerta fica "visto" por usuário + assinatura (o texto dele). Se a situação mudar (nova fatura vencida, outro número),
 *    a assinatura muda e o alerta volta sozinho.
 *  - Abrir a tela para onde o alerta aponta conta como ter visto o aviso.
 *  - O usuário também pode dispensar com o X. Nada é apagado: só deixa de aparecer para ele.
 */
import { supabase } from '@/integrations/supabase/client';
import type { Alerta } from '@/lib/dashboardResumo';

export interface AvisoVisto { chave: string; assinatura: string }

export const avisosVistosKey = ['avisos-vistos'] as const;

export const assinaturaDoAlerta = (a: Pick<Alerta, 'titulo' | 'detalhe'>) => `${a.titulo}|${a.detalhe}`;

/** Caminho sem ?busca e #âncora (o alerta aponta para uma tela). */
export const caminhoDoLink = (link: string) => link.split('?')[0].split('#')[0];

export function alertaEstaVisto(a: Alerta, vistos: AvisoVisto[]): boolean {
  return a.nivel !== 'ok' && vistos.some((v) => v.chave === a.id && v.assinatura === assinaturaDoAlerta(a));
}

// Alertas que acabaram de aparecer numa faixa: se o usuário abrir a tela de destino, contam como vistos.
const exibidos = new Map<string, { chave: string; assinatura: string; caminho: string }>();

export function lembrarAlertasExibidos(alertas: Alerta[]) {
  for (const a of alertas) {
    if (a.nivel === 'ok') continue;
    exibidos.set(a.id, { chave: a.id, assinatura: assinaturaDoAlerta(a), caminho: caminhoDoLink(a.link) });
  }
}

/** Tira da memória os alertas cujo destino é esta tela e devolve o que foi visto. */
export function alertasVistosAoAbrir(caminho: string): Array<{ chave: string; assinatura: string }> {
  const vistos: Array<{ chave: string; assinatura: string }> = [];
  for (const [chave, e] of exibidos) {
    if (e.caminho === caminho) { vistos.push({ chave: e.chave, assinatura: e.assinatura }); exibidos.delete(chave); }
  }
  return vistos;
}

export function esquecerAlertasExibidos() { exibidos.clear(); }

type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc: Rpc = (fn, args) => (supabase as unknown as { rpc: Rpc }).rpc(fn, args);

export async function listarAvisosVistos(): Promise<AvisoVisto[]> {
  try {
    const { data, error } = await rpc('aviso_listar_vistos');
    if (error || !Array.isArray(data)) return [];
    return data as AvisoVisto[];
  } catch {
    return [];
  }
}

export async function registrarAvisoVisto(chave: string, assinatura: string): Promise<boolean> {
  try {
    const { error } = await rpc('aviso_registrar_visto', { p_chave: chave, p_assinatura: assinatura });
    return !error;
  } catch {
    return false;
  }
}
