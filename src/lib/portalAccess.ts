/**
 * VALIDAÇÃO DA PORTA DE ENTRADA × RBAC REAL
 *
 * O parâmetro ?role= / rota escolhida representa SOMENTE "qual portal o
 * usuário está tentando acessar" — NUNCA concede autorização. A autorização
 * real vem do perfil carregado do banco (usuarios.perfil via AuthContext).
 *
 * Modelo vigente: 1 perfil por usuário (usuarios.perfil_id). Não existe
 * multi-role; a matriz abaixo usa EXATAMENTE os perfis existentes.
 */

export type PortalEntrada =
  | 'ANUNCIANTES'
  | 'REPRESENTANTES'
  | 'GESTOR'
  | 'CORPORATIVO';

/** Perfis autorizados por portal — reflete AuthContext/useRbac/rotas existentes */
export const AUTORIZADOS_POR_PORTAL: Record<PortalEntrada, readonly string[]> = {
  // CLIENTE é perfil legado que SEMPRE acessou o portal do anunciante (/portal)
  ANUNCIANTES: ['ANUNCIANTE', 'CLIENTE'],
  REPRESENTANTES: ['REPRESENTANTE'],
  GESTOR: ['GESTOR'],
  // Perfis internos cujo workspace é corporativo (routeRedirect existente)
  CORPORATIVO: [
    'OWNER',
    'ADMIN',
    'GESTOR',
    'FUNCIONARIO',
    'GERENTE',
    'FINANCEIRO',
    'DESIGNER',
    'OPERACIONAL',
    'SUPERVISOR',
  ],
};

export const ROTULO_PORTAL: Record<PortalEntrada, string> = {
  ANUNCIANTES: 'Portal do Anunciante',
  REPRESENTANTES: 'Portal do Representante',
  GESTOR: 'Portal do Gestor',
  CORPORATIVO: 'Área Corporativa',
};

/** Rótulo legível do portal (helper funcional usado por Auth/RepresentantesAuth). */
export function rotuloPortal(portal: PortalEntrada | null | undefined): string {
  if (!portal) return 'Área do Sistema';
  return ROTULO_PORTAL[portal] ?? 'Área do Sistema';
}

/**
 * Resolve qual portal está sendo solicitado a partir da porta de entrada.
 * Retorna null quando a porta não declara portal específico (login genérico
 * da área corporativa sem role na URL continua válido).
 */
export function resolverPortalSolicitado(
  roleParam: string | null | undefined,
  pathname?: string,
): PortalEntrada | null {
  if (pathname && pathname.replace(/\/+$/, '').toLowerCase().endsWith('/auth/corporate')) {
    return 'CORPORATIVO';
  }
  switch ((roleParam ?? '').toLowerCase()) {
    case 'anunciantes': return 'ANUNCIANTES';
    case 'gestor': return 'GESTOR';
    case 'representantes': return 'REPRESENTANTES';
    default: return null;
  }
}

/** A autorização REAL: perfil carregado do banco × matriz fixa acima. */
export function podeAcessarPortal(portal: PortalEntrada, perfilNome: string | null | undefined): boolean {
  if (!perfilNome) return false;
  const p = String(perfilNome).toUpperCase();
  // RBAC constitucional vigente (useRbac.hasRole/can): OWNER e ADMIN têm
  // bypass total — mesma regra aplicada em todos os portais.
  if (p === 'OWNER' || p === 'ADMIN') return true;
  const lista = AUTORIZADOS_POR_PORTAL[portal];
  if (!lista) return false;
  return lista.includes(p);
}
