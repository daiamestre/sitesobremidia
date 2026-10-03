import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// F-124 — achados da validação global que quebravam em uso real.
const ler = (arquivo: string) => readFileSync(path.join(process.cwd(), arquivo), 'utf8').replace(/\r\n/g, '\n');

describe('Validação global (F-124)', () => {
  it('cadastro de gestor: ícones da tela de sucesso/contrato estão importados (antes a tela quebrava)', () => {
    const pagina = ler('src/modules/crm/pages/prospeccao/GestorMidiiasProspeccaoPage.tsx');
    const importacao = pagina.slice(0, pagina.indexOf("} from 'lucide-react';"));
    for (const icone of ['FileText', 'PenTool']) {
      expect(pagina).toContain(`<${icone} `);
      expect(importacao).toContain(icone);
    }
  });

  it('"Cancelar cobrança" usa o cancelamento que existe e mostra o erro real', () => {
    const detalhes = ler('src/modules/crm/components/financeiro/ReceivableDetails.tsx');
    expect(detalhes).not.toContain('updateContaReceber');
    expect(detalhes).toContain('await financeiroService.cancelarCobranca(conta.id)');
    expect(detalhes).toContain('if (!resultado.success) {');
    expect(ler('src/modules/crm/services/financeiro.service.ts')).toContain('async cancelarCobranca(id: string)');
  });

  it('NOC: sem número inventado, contagem das últimas 24 h no banco e sem a ligação inexistente com screens', () => {
    const noc = ler('src/modules/crm/services/noc.service.ts');
    expect(noc).not.toContain('totalPlayers: 3');
    expect(noc).not.toMatch(/from\('playback_logs'\)[^;]*screen:screens/);
    expect(noc).toContain("select('id', { count: 'exact', head: true }).gte('started_at', desde)");
    expect(noc).toContain("from('screens').select('id, name, location').in('id', uuids)");
    expect(ler('src/modules/crm/pages/NocDashboardPage.tsx')).not.toContain('LED Shopping Avenida');
  });

  it('pagamento em cobrança cancelada: fica cancelada, mas deixa rastro (auditoria + nota), uma vez por transação', () => {
    const sql = ler('supabase/migrations/20261290_pagamento_em_cobranca_cancelada.sql');
    expect(sql).toContain("'PAGAMENTO_EM_COBRANCA_CANCELADA'");
    expect(sql).toContain("a.detalhes->>'transacao' = p_transacao");
    expect(sql).toContain('DEPOIS do cancelamento');
    const ramo = sql.slice(sql.indexOf("IN ('CANCELADA', 'CANCELADO') THEN"), sql.indexOf("RETURN jsonb_build_object('status', 'CANCELADA');"));
    expect(ramo).not.toContain('INSERT INTO public.pagamentos');
    expect(ramo).not.toMatch(/SET[^;]*status\s*=/);
  });
});
