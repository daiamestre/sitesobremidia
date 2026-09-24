/** Regras puras do card de Screenshot do Dashboard/Screens. */

/**
 * O print chegou? A fonte de verdade e last_screenshot_at mudar depois do pedido,
 * nao so o ack do comando (o ack pode se perder e o botao ficava "Capturando..." ate o timeout).
 */
export function hasNewScreenshot(before: string | null | undefined, current: string | null | undefined): boolean {
  if (!current) return false;
  return (before ?? null) !== current;
}

export type ScreenshotType = string | null | undefined; // 'manual' | 'heartbeat'

/** Texto do rodape do card: so print automatico (checagem de midia) diz "enviada automaticamente". */
export function screenshotFooterText(lastScreenshotAt: string | null | undefined, type: ScreenshotType): string {
  if (!lastScreenshotAt) return 'Aguardando o primeiro envio de captura do dispositivo vinculado.';
  return type === 'heartbeat'
    ? 'Esta captura foi enviada automaticamente pelo Player para auditoria visual.'
    : 'Captura solicitada pelo painel e enviada pelo Player.';
}
