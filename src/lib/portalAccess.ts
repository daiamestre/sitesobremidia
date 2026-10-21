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

/**
 * Perfis autorizados por portal — F-204: cada perfil entra SÓ pela porta da sua área, a mesma para onde o login o leva
 * (AuthContext.workspaceRoute). OWNER e ADMIN entram por qualquer uma (ver podeAcessarPortal).
 */
export const AUTORIZADOS_POR_PORTAL: Record<PortalEntrada, readonly string[]> = {
  // CLIENTE é perfil legado que SEMPRE acessou o portal do anunciante (/portal)
  ANUNCIANTES: ['ANUNCIANTE', 'CLIENTE'],
  REPRESENTANTES: ['REPRESENTANTE'],
  // Gestor de Mídias e a equipe que trabalha no painel dele (/dashboard)
  GESTOR: ['GESTOR', 'GESTOR_TELAS', 'GESTOR_MIDIAS', 'FUNCIONARIO', 'OPERACIONAL', 'DESIGNER'],
  // Equipe interna cujo workspace é corporativo (/workspace)
  CORPORATIVO: ['OWNER', 'ADMIN', 'FINANCEIRO', 'GERENTE', 'SUPERVISOR', 'MARKETING'],
};

/** F-204: tela de login de cada portal (a porta certa de cada perfil). */
export const LOGIN_DO_PORTAL: Record<PortalEntrada, string> = {
  ANUNCIANTES: '/auth?tab=login&role=anunciantes',
  REPRESENTANTES: '/representantes/login',
  GESTOR: '/auth?tab=login&role=gestor',
  CORPORATIVO: '/auth/corporate',
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

const ehDonoOuAdm = (perfilNome: string | null | undefined, isOwner = false): boolean => {
  const p = String(perfilNome ?? '').toUpperCase();
  return isOwner || p === 'OWNER' || p === 'ADMIN';
};

/**
 * F-204: a área (portal) de cada perfil. OWNER/ADMIN: 'TODAS'. Perfil sem portal de login próprio (PARCEIRO) fica na
 * área do Gestor, que é para onde o login o leva (/dashboard).
 */
export function areaDoPerfil(perfilNome: string | null | undefined, isOwner = false): PortalEntrada | 'TODAS' {
  if (ehDonoOuAdm(perfilNome, isOwner)) return 'TODAS';
  const p = String(perfilNome ?? '').toUpperCase();
  const portal = (Object.keys(AUTORIZADOS_POR_PORTAL) as PortalEntrada[]).find((k) => AUTORIZADOS_POR_PORTAL[k].includes(p));
  return portal ?? 'GESTOR';
}

/**
 * F-204: para onde mandar quem entrou pela porta errada — a tela de login da área dele (que, com a sessão já aberta,
 * leva direto para a área). Sem portal de login próprio (PARCEIRO): o login geral.
 */
export function loginDoPerfil(perfilNome: string | null | undefined, isOwner = false): string {
  const area = areaDoPerfil(perfilNome, isOwner);
  if (area === 'TODAS') return LOGIN_DO_PORTAL.CORPORATIVO;
  return podeAcessarPortal(area, perfilNome) ? LOGIN_DO_PORTAL[area] : '/auth?tab=login';
}

/** F-204: a qual área pertence uma rota protegida (null = rota sem área, ex.: login, player, cobrança). */
export function areaDaRota(pathname: string): PortalEntrada | null {
  const r = (pathname || '').toLowerCase();
  const em = (base: string) => r === base || r.startsWith(base + '/');
  if (em('/portal')) return 'ANUNCIANTES';
  if (em('/representantes') && !em('/representantes/login')) return 'REPRESENTANTES';
  if (em('/dashboard')) return 'GESTOR';
  if (em('/workspace') || em('/financeiro')) return 'CORPORATIVO';
  return null;
}

/** F-204: o perfil pode abrir esta rota? (cada um só a sua área; OWNER/ADMIN todas) */
export function podeAbrirRota(pathname: string, perfilNome: string | null | undefined, isOwner = false): boolean {
  const areaDaPagina = areaDaRota(pathname);
  if (!areaDaPagina) return true;
  const minha = areaDoPerfil(perfilNome, isOwner);
  if (minha === 'TODAS') return true;
  return minha === areaDaPagina;
}
