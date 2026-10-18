/**
 * F-193 — Página da tela: o selo do topo e o do "Dispositivo Vinculado" seguem UMA regra só.
 * Online = tela ativa, com aparelho pareado e sinal nos últimos 3 minutos (sinal da tela OU telemetria do próprio aparelho).
 * Antes o quadro do aparelho guardava dados da tela aberta anteriormente (outro aparelho, desligado) e dizia "Offline"
 * enquanto o topo dizia "Online".
 */
export const JANELA_ONLINE_MS = 3 * 60 * 1000;

const recente = (quando: string | null | undefined, agora: number) => {
  if (!quando) return false;
  const t = new Date(quando).getTime();
  return Number.isFinite(t) && agora - t < JANELA_ONLINE_MS;
};

export function telaOnlineAgora(
  tela: { is_active?: boolean | null; bound_device_id?: string | null; last_ping_at?: string | null },
  saudeUltimoSinal?: string | null,
  agora = Date.now(),
): boolean {
  if (tela.is_active === false || !tela.bound_device_id) return false;
  return recente(tela.last_ping_at, agora) || recente(saudeUltimoSinal, agora);
}

/** Só aceita a linha do aparelho que é DESTA tela (mesmo identity_hash do vínculo); senão não mostra nada. */
export function aparelhoDaTela<T extends { identity_hash?: string | null }>(
  aparelho: T | null | undefined,
  vinculo: string | null | undefined,
): T | null {
  if (!aparelho || !vinculo) return null;
  return aparelho.identity_hash === vinculo ? aparelho : null;
}

/** Só aceita a saúde do aparelho mostrado (device_health.device_id = devices.id). */
export function saudeDoAparelho<T extends { device_id?: string | null }>(
  saude: T | null | undefined,
  aparelhoId: string | null | undefined,
): T | null {
  if (!saude || !aparelhoId) return null;
  return saude.device_id === aparelhoId ? saude : null;
}
