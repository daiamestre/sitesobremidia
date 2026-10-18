/** F-196 — bloco do Pix: pede o Pix ao Banco Inter, mostra o QR Code e copia o copia e cola. */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const PIX = '00020101021226930014BR.GOV.BCB.PIX2571spi-qrcode.bancointer.com.br/teste5204000053039865802BR6304ABCD';
const emitir = vi.fn(async () => PIX);
vi.mock('@/modules/gestor/telaPago.service', () => ({ emitirPixDaCobranca: (id: string) => emitir(id) }));
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,QR') } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PixDaCobranca } from '@/components/pagamento/PixDaCobranca';

describe('F-196 · PixDaCobranca', () => {
  it('gera o Pix da cobrança, mostra o QR e copia o copia e cola', async () => {
    const escrever = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText: escrever } });
    render(<PixDaCobranca cobrancaId="cob-1" valorTexto="R$ 19,99" />);
    await waitFor(() => expect(screen.getByTestId('qr-pix')).toBeInTheDocument());
    expect(emitir).toHaveBeenCalledWith('cob-1');
    expect(screen.getByText(PIX)).toBeInTheDocument();
    expect(screen.getByText('R$ 19,99')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Copiar Pix copia e cola'));
    await waitFor(() => expect(escrever).toHaveBeenCalledWith(PIX));
  });
});
