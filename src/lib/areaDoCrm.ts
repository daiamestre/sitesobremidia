/**
 * F-170 — Qual menu do CRM mostrar. Owner e ADM SEMPRE veem o menu do painel principal (workspace), em qualquer tela do CRM
 * (inclusive a Central de Cobranças em /financeiro): o menu não troca por outro quando eles abrem uma tela financeira.
 * O representante continua com o menu de representantes.
 */
export type AreaDoCrm = '/workspace' | '/representantes';

export function areaDoCrm(pathname: string, ownerOuAdmin: boolean): AreaDoCrm {
  if (pathname.startsWith('/workspace')) return '/workspace';
  if (pathname.startsWith('/representantes')) return '/representantes';
  return ownerOuAdmin ? '/workspace' : '/representantes';
}
