import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('MICRO-GATE P0.3.2 — Antirregressão: Verificação de Imports do Supabase Client', () => {
  const crmFilesToCheck = [
    'src/modules/crm/components/forms/IntelligentCommercialWizard.tsx',
    'src/modules/crm/components/portal/AssinaturaContratoDialog.tsx',
    'src/modules/crm/pages/prospeccao/PontoParceiroWizardPage.tsx',
    'src/modules/crm/pages/prospeccao/GestorMidiiasProspeccaoPage.tsx',
    'src/modules/crm/pages/BillingDetailPage.tsx',
    'src/modules/crm/services/contratoDocumento.service.ts',
    'src/modules/crm/services/contrato.service.ts',
  ];

  it('Garante que todos os componentes e serviços chave do CRM importem supabase explicitamente', () => {
    for (const relPath of crmFilesToCheck) {
      const fullPath = path.resolve(process.cwd(), relPath);
      expect(fs.existsSync(fullPath), `Arquivo não encontrado: ${relPath}`).toBe(true);
      const content = fs.readFileSync(fullPath, 'utf-8');

      // Se o arquivo faz uso do identificador supabase, DEVE conter o import oficial
      const usesSupabase = /\bsupabase\b/.test(content);
      if (usesSupabase) {
        const hasImport = /import\s+.*?\bsupabase\b.*?from\s+['"]@\/integrations\/supabase\/client['"]/.test(content);
        expect(hasImport, `Arquivo ${relPath} usa 'supabase' mas não possui import oficial de @/integrations/supabase/client`).toBe(true);
      }
    }
  });

  it('Garante que nenhum arquivo em src/modules/crm utilize supabase sem import ou declaração', () => {
    function findTsFiles(dir: string, list: string[] = []) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          findTsFiles(full, list);
        } else if (full.endsWith('.ts') || full.endsWith('.tsx')) {
          list.push(full);
        }
      }
      return list;
    }

    const crmFiles = findTsFiles(path.resolve(process.cwd(), 'src/modules/crm'));
    const offendingFiles: string[] = [];

    for (const file of crmFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      if (/\bsupabase\./.test(content)) {
        const hasImport = /import\s+.*?\bsupabase\b.*?from/.test(content);
        const hasDecl = /(?:const|let|var|function)\s+\bsupabase\b/.test(content);
        if (!hasImport && !hasDecl) {
          offendingFiles.push(file);
        }
      }
    }

    expect(offendingFiles, `Arquivos com uso de supabase. sem import: ${offendingFiles.join(', ')}`).toEqual([]);
  });
});
