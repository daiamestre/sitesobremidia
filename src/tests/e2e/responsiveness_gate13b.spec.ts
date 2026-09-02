import { test, expect } from '@playwright/test';

const viewports = [
  { w: 320, h: 568, label: '320x568 (iPhone SE 1st gen)' },
  { w: 360, h: 800, label: '360x800 (Galaxy S20)' },
  { w: 375, h: 812, label: '375x812 (iPhone 12/13 mini)' },
  { w: 390, h: 844, label: '390x844 (iPhone 14)' },
  { w: 414, h: 896, label: '414x896 (iPhone XR)' },
  { w: 430, h: 932, label: '430x932 (iPhone 15 Pro Max)' },
  { w: 768, h: 1024, label: '768x1024 (iPad Portrait)' },
  { w: 1024, h: 768, label: '1024x768 (Tablet Landscape)' },
  { w: 1280, h: 800, label: '1280x800 (Laptop)' },
  { w: 1440, h: 900, label: '1440x900 (Desktop)' },
  { w: 1920, h: 1080, label: '1920x1080 (FHD)' },
];

const zoomLevels = [1.0, 1.25, 1.5, 2.0];

for (const vp of viewports) {
  test(`Gate 13B — Responsiveness ${vp.label}`, async ({ page }) => {
    // Intercept RPC
    await page.route('**/rest/v1/rpc/rpc_get_public_billing*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'mock-123',
          numero_documento: 'COB-2026-000295',
          codigo_operacional: 'COB-2026-000295',
          public_identifier: 'COB-FBMHCEPJ',
          competencia: '2026-08-01',
          vencimento: '2026-08-29',
          valor_original: 250.00,
          valor_pago: 0,
          saldo: 250.00,
          status: 'PENDENTE',
          numero_parcela: 1,
          total_parcelas: 1,
          metodo: 'PIX',
          metodos_gateway: ['PIX', 'BOLETO'],
          recorrencia: 'MENSAL',
          observacoes: 'Fatura regular de publicidade',
          billing_origin_type: 'ANUNCIANTE',
          establishment_name: 'HOTEL MAXSUEL',
          establishment_slug: 'hotel-maxsuel',
          invoice_month: 8,
          invoice_year: 2026,
          service_name: 'Aluguel de Software de Mídia',
          issuer_name: 'Sobre Mídia Designer Ltda',
          cliente_nome: 'Hotel Maxsuel Ltda',
          cliente_documento: '12.345.678/0001-90',
          empresa_nome: 'Sobre Mídia Designer Ltda',
          empresa_documento: '44.899.400/0001-56',
          contrato_codigo: 'CTR-2026-089',
          contrato_tipo: 'ANUNCIANTE',
          servico_faturado: 'Aluguel de Software de Mídia',
          pagamentos: []
        })
      });
    });

    // Intercept PIX
    await page.route('**/functions/v1/inter-pix-engine', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            cobranca: { valorNominal: 250.0, dataVencimento: '2026-08-29', situacao: 'PENDENTE', saldo: 250.0 },
            pix: {
              pixCopiaECola: '00020101021226930014BR.GOV.BCB.PIX2571spi-qrcode.bancointer.com.br/spi/pj/v2/test5204000053039865406250.005802BR5901*6009SAO_PAULO61080391006062070503***6304FB7F',
              txid: 'SMmock1234567890',
              status: 'ATIVA'
            }
          }
        })
      });
    });

    // Intercept Boleto
    await page.route('**/functions/v1/inter-billing-engine', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            cobranca: { valorNominal: 250.0, dataVencimento: '2026-08-29', situacao: 'PENDENTE', saldo: 250.0 },
            boleto: { linhaDigitavel: '07790.00116 00000.000000 00000.000000 1 90000000025000', codigoBarras: '07791900000000025000001100000000000000000000', disponivel: true }
          }
        })
      });
    });

    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.goto('/cobranca/hotel-maxsuel/fatura-agosto/COB-2026-000295', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // 1. Validar background sincronizado (sem exposição de fundo azul do body)
    const bodyBg = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
    // RGB(34, 0, 74) is #22004A
    expect(bodyBg).toBe('rgb(34, 0, 74)');

    // 2. Validar ausência de overflow horizontal em múltiplos níveis de zoom
    for (const zoom of zoomLevels) {
      if (zoom !== 1.0) {
        await page.evaluate((z) => { document.body.style.zoom = String(z); }, zoom);
        await page.waitForTimeout(100);
      }

      const overflow = await page.evaluate(() => {
        const de = document.documentElement;
        const body = document.body;
        return {
          deScroll: de.scrollWidth,
          deClient: de.clientWidth,
          bodyScroll: body.scrollWidth,
          bodyClient: body.clientWidth,
        };
      });

      expect(overflow.deScroll, `[Zoom ${(zoom*100).toFixed(0)}%] documentElement scrollWidth ${overflow.deScroll} > clientWidth ${overflow.deClient}`).toBeLessThanOrEqual(overflow.deClient + 2);
      expect(overflow.bodyScroll, `[Zoom ${(zoom*100).toFixed(0)}%] body scrollWidth ${overflow.bodyScroll} > clientWidth ${overflow.bodyClient}`).toBeLessThanOrEqual(overflow.bodyClient + 2);
    }

    // Reset zoom
    await page.evaluate(() => { document.body.style.zoom = '1'; });

    // 3. Validar visibilidade dos elementos fundamentais
    await expect(page.locator('[data-testid="establishment-name"]')).toHaveText('HOTEL MAXSUEL');
    await expect(page.locator('[data-testid="invoice-title"]')).toHaveText('Fatura Agosto');
    await expect(page.locator('img[alt="QR Code PIX"]')).toBeVisible();
    await expect(page.locator('input[value*="BR.GOV.BCB.PIX"]')).toBeVisible();
  });
}
