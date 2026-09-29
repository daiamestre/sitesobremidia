import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { telaVazia, telasParaEnvio, validarTelas } from '@/modules/crm/components/prospeccao/TelasDoPontoEditor';

// F-109 — telas de pontos parceiros criadas pelo cadastro do ponto.
describe('Cadastro das telas do ponto parceiro (F-109)', () => {
  it('exige local, foto e valor em cada tela', () => {
    expect(validarTelas([])).toMatch(/ao menos uma tela/);
    expect(validarTelas([telaVazia()])).toMatch(/Tela 1: informe onde/);
    expect(validarTelas([{ ...telaVazia(), local: 'Caixa' }])).toMatch(/Tela 1: tire ou envie a foto/);
    expect(validarTelas([{ ...telaVazia(), local: 'Caixa', foto_url: 'https://x/f.jpg' }])).toMatch(/Tela 1: informe o valor/);
    expect(validarTelas([{ ...telaVazia(), local: 'Caixa', foto_url: 'https://x/f.jpg', valor: '149,90' }])).toBeNull();
  });

  it('envia o valor em número (vírgula brasileira) e a orientação', () => {
    const [t] = telasParaEnvio([{ ...telaVazia(), local: ' Caixa ', foto_url: 'u', valor: '1.149,90', orientacao: 'vertical', polegadas: '43' }]);
    expect(t).toMatchObject({ local: 'Caixa', valor: 1149.9, orientacao: 'vertical', polegadas: 43 });
  });

  it('banco: só OWNER/ADMIN alteram a tela parceira; telemetria do Player livre; criação idempotente', () => {
    const sql = readFileSync(path.join(process.cwd(), 'supabase', 'migrations', '20261278_telas_parceiras.sql'), 'utf8');
    expect(sql).toContain('só o dono e os administradores podem alterar');
    expect(sql).toContain("AS RESTRICTIVE FOR DELETE");
    expect(sql).toContain("'JA_EXISTIAM'");
    expect(sql).not.toMatch(/NEW\.last_ping_at IS DISTINCT FROM/);
  });

  it('página "Telas de pontos parceiros" só para OWNER/ADMIN e ligada ao menu e à página de telas', () => {
    const pagina = readFileSync(path.join(process.cwd(), 'src', 'pages', 'dashboard', 'TelasParceiras.tsx'), 'utf8');
    expect(pagina).toContain("perfilNome === 'ADMIN'");
    expect(pagina).toContain('<Navigate to="/dashboard/screens" replace />');
    const menu = readFileSync(path.join(process.cwd(), 'src', 'components', 'dashboard', 'Sidebar.tsx'), 'utf8');
    // F-116: o menu abre a página nova de Telas (cartão de pontos parceiros); a página antiga segue pelo botão "Telas de parceiros"
    expect(menu).toContain("'/dashboard/screens?secao=parceiros'");
    // F-119: o menu leva à sala de pontos parceiros; o botão "Novo Ponto Parceiro" da sala abre o cadastro completo
    expect(menu).toContain("'/dashboard/pontos-parceiros'");
  });
});
