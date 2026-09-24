import { describe, it, expect } from 'vitest';
import { hasNewScreenshot, screenshotFooterText } from '@/utils/screenshotStatus';

describe('screenshotStatus (auditoria Dashboard/Screens)', () => {
  it('conclui a captura quando last_screenshot_at muda, mesmo sem ack do comando', () => {
    expect(hasNewScreenshot('2026-09-24T12:12:05.471Z', '2026-09-24T15:40:00.000Z')).toBe(true);
  });
  it('nao conclui enquanto o print e o mesmo de antes do pedido', () => {
    expect(hasNewScreenshot('2026-09-24T12:12:05.471Z', '2026-09-24T12:12:05.471Z')).toBe(false);
  });
  it('primeiro print da tela (antes nulo) conta como novo', () => {
    expect(hasNewScreenshot(null, '2026-09-24T15:40:00.000Z')).toBe(true);
  });
  it('sem print atual nunca conclui', () => {
    expect(hasNewScreenshot('2026-09-24T12:12:05.471Z', null)).toBe(false);
  });
  it('rodape: manual nao diz "automaticamente"; heartbeat diz', () => {
    expect(screenshotFooterText('2026-09-24T15:40:00Z', 'manual')).not.toMatch(/automaticamente/i);
    expect(screenshotFooterText('2026-09-24T15:40:00Z', 'heartbeat')).toMatch(/automaticamente/i);
    expect(screenshotFooterText(null, 'manual')).toMatch(/Aguardando/);
  });
});
