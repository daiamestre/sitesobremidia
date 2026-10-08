/**
 * F-164 — Mensagem de abertura do portal do anunciante.
 *  - Primeiras 24 h depois do primeiro acesso: "Bem-vindo(a), <nome>!";
 *  - depois: "Olá, <nome> — Bom dia / Boa tarde / Boa noite!" (pelo horário de Brasília).
 * O primeiro acesso vem do banco (portal_registrar_primeiro_acesso), então vale em qualquer aparelho.
 */
import { saudacao } from '@/lib/dashboardResumo';
import { brasiliaHour } from '@/lib/brasiliaTime';

/** Quanto tempo as boas-vindas ficam no ar depois do primeiro acesso. */
export const JANELA_DE_BOAS_VINDAS_MS = 24 * 60 * 60 * 1000;

export type TipoDeAbertura = 'boas-vindas' | 'saudacao';

/** Dentro das 24 h do primeiro acesso? Data ausente, inválida ou no futuro distante não conta. */
export function emBoasVindas(primeiroAcessoEm: string | Date | null | undefined, agoraMs: number): boolean {
  if (!primeiroAcessoEm) return false;
  const inicio = new Date(primeiroAcessoEm).getTime();
  if (!Number.isFinite(inicio)) return false;
  const passou = agoraMs - inicio;
  return passou >= -60_000 && passou < JANELA_DE_BOAS_VINDAS_MS; // 1 min de folga para relógios levemente adiantados
}

export function aberturaDoPortal(o: { nome: string; primeiroAcessoEm: string | Date | null | undefined; agoraMs: number }): { tipo: TipoDeAbertura; texto: string } {
  const nome = o.nome.trim();
  if (emBoasVindas(o.primeiroAcessoEm, o.agoraMs)) return { tipo: 'boas-vindas', texto: `Bem-vindo(a), ${nome}!` };
  return { tipo: 'saudacao', texto: `Olá, ${nome} — ${saudacao(brasiliaHour(new Date(o.agoraMs)))}!` };
}
