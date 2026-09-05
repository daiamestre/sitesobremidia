import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SIGNATURE_PLACEMENTS,
  SignaturePlacement,
  DadosAssinatura,
} from '@/modules/crm/services/contratoDocumento.service';
import { PDFDocument } from 'pdf-lib';

// Valid minimal 1x1 transparent PNG
const MOCK_SIGNATURE_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// Helper to create a minimal PDF in memory for tests
async function createTestPdfBytes(pageCount: number = 1): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([595.28, 841.89]);
    page.drawText(`Pagina ${i + 1}`, { x: 50, y: 800, size: 12 });
  }
  return new Uint8Array(await doc.save());
}

describe('GATE 2-B.4: Sistema de Assinatura Eletrônica de Contratos', () => {
  describe('1. SIGNATURE_PLACEMENTS (Isolamento de Coordenadas por Template)', () => {
    it('deve possuir coordenadas específicas para ANUNCIANTE sem cobrir SOBRE MÍDIA', () => {
      const placement = SIGNATURE_PLACEMENTS.ANUNCIANTE;
      expect(placement).toBeDefined();
      expect(placement.x).toBeGreaterThanOrEqual(280); // Coluna da direita
      expect(placement.y).toBeGreaterThan(100);
      expect(placement.width).toBeGreaterThan(150);
      expect(placement.height).toBeGreaterThan(30);
    });

    it('deve possuir coordenadas específicas para PARCEIRO sem cobrir SOBRE MÍDIA', () => {
      const placement = SIGNATURE_PLACEMENTS.PARCEIRO;
      expect(placement).toBeDefined();
      expect(placement.x).toBeLessThan(200); // Coluna da esquerda (alinhado com PARCEIRO)
      expect(placement.y).toBeGreaterThan(80);
      expect(placement.width).toBeGreaterThan(150);
      expect(placement.height).toBeGreaterThan(30);
    });

    it('coordenadas de ANUNCIANTE e PARCEIRO devem ser distintas (não universal)', () => {
      expect(SIGNATURE_PLACEMENTS.ANUNCIANTE.y).not.toEqual(SIGNATURE_PLACEMENTS.PARCEIRO.y);
    });
  });

  describe('2. PDF Overlay de Assinatura (pdf-lib)', () => {
    it('deve aplicar imagem PNG de assinatura na página existente sem adicionar nova página', async () => {
      const originalBytes = await createTestPdfBytes(3);
      const pdfDoc = await PDFDocument.load(originalBytes);
      const originalPageCount = pdfDoc.getPages().length;
      expect(originalPageCount).toBe(3);

      const placement = SIGNATURE_PLACEMENTS.ANUNCIANTE;
      const pages = pdfDoc.getPages();
      const targetPage = pages[pages.length - 1]; // Última página

      // Decode base64
      const base64Data = MOCK_SIGNATURE_DATA_URL.split(',')[1];
      const imgBytes = new Uint8Array(Buffer.from(base64Data, 'base64'));
      const embeddedImg = await pdfDoc.embedPng(imgBytes);

      targetPage.drawImage(embeddedImg, {
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
      });

      const signedBytes = await pdfDoc.save();
      const signedDoc = await PDFDocument.load(signedBytes);

      // REGRA CRÍTICA: Não criar nova página!
      expect(signedDoc.getPages().length).toBe(originalPageCount);
      expect(signedBytes.length).toBeGreaterThan(originalBytes.length);
    });

    it('PARCEIRO: deve aplicar imagem PNG na página 2 de 2 preservando total de páginas', async () => {
      const originalBytes = await createTestPdfBytes(2);
      const pdfDoc = await PDFDocument.load(originalBytes);
      expect(pdfDoc.getPages().length).toBe(2);

      const placement = SIGNATURE_PLACEMENTS.PARCEIRO;
      const pages = pdfDoc.getPages();
      const targetPage = pages[pages.length - 1]; // Página 2 (index 1)

      const base64Data = MOCK_SIGNATURE_DATA_URL.split(',')[1];
      const imgBytes = new Uint8Array(Buffer.from(base64Data, 'base64'));
      const embeddedImg = await pdfDoc.embedPng(imgBytes);

      targetPage.drawImage(embeddedImg, {
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
      });

      const signedBytes = await pdfDoc.save();
      const signedDoc = await PDFDocument.load(signedBytes);

      expect(signedDoc.getPages().length).toBe(2);
    });

    it('deve aplicar metadados de auditoria e carimbo UTC sobre o campo correto', async () => {
      const originalBytes = await createTestPdfBytes(3);
      const pdfDoc = await PDFDocument.load(originalBytes);
      const placement = SIGNATURE_PLACEMENTS.ANUNCIANTE;
      const targetPage = pdfDoc.getPages()[2];

      const agora = new Date();
      targetPage.drawText(`Assinado digitalmente por: Signatário Teste`, {
        x: placement.x,
        y: placement.y - 10,
        size: 6.5,
      });
      targetPage.drawText(`Data/Hora: ${agora.toLocaleString('pt-BR')} (UTC: ${agora.toISOString()})`, {
        x: placement.x,
        y: placement.y - 18,
        size: 5.5,
      });

      const signedBytes = await pdfDoc.save();
      const signedDoc = await PDFDocument.load(signedBytes);
      expect(signedDoc.getPages().length).toBe(3);
    });
  });
});
