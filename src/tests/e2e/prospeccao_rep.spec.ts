import { test, expect } from '@playwright/test';
import {
  E2E_REP_EMAIL, E2E_REP_PASSWORD, login,
  preencherEtapa1, preencherEtapa2, preencherEtapa3, writeReport,
} from './helpers';

// ─────────────────────────────────────────────────────────────────────
// E2E — CENTRAL DE PROSPECÇÃO DO REPRESENTANTE (missão §34)
// Fluxos reais contra banco live + validação de persistência via REST
// com SUPABASE_SERVICE_ROLE_KEY (somente ambiente de teste).
// ─────────────────────────────────────────────────────────────────────

const SB_URL = process.env.VITE_SUPABASE_URL || '';
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function dbGet(table: string, query: string): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {
    headers: { apikey: SRK, Authorization: `Bearer ${SRK}` },
  });
  if (!res.ok) throw new Error(`dbGet ${table}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as Array<Record<string, unknown>>;
}

test.describe('CENTRAL DE PROSPECÇÃO — Representante', () => {
  test.setTimeout(300_000);

  test('HUB — três tipos de cadastro visíveis após login do representante', async ({ page }) => {
    await login(page, E2E_REP_EMAIL, E2E_REP_PASSWORD);
    await page.goto('/representantes/prospeccao', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await expect(page.getByRole('heading', { name: 'NOVO CADASTRO' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('ANUNCIANTE', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('PONTO PARCEIRO', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('GESTOR DE MÍDIAS', { exact: true }).first()).toBeVisible();
  });

  test('GESTOR DE MÍDIAS — provisionamento oficial com senha automática + troca obrigatória', async ({ page }) => {
    test.skip(!SRK, 'SUPABASE_SERVICE_ROLE_KEY ausente');
    const uniqueId = Date.now();
    const email = `gestor.pros.${uniqueId}@e2e-rep.com.br`;

    await login(page, E2E_REP_EMAIL, E2E_REP_PASSWORD);
    await page.goto('/representantes/prospeccao/gestor', { waitUntil: 'domcontentloaded' });

    await page.getByPlaceholder('Ex.: Maria Silva').fill(`Gestor Pros ${uniqueId}`);
    await page.locator('input[type="email"]').fill(email);
    await page.getByPlaceholder('(00) 00000-0000').fill('(81) 3300-1200');

    // (validação negativa de e-mail coberta em teste separado abaixo)

    await page.click('button:has-text("Cadastrar Gestor e Gerar Acesso")');

    await expect(page.getByText('Gestor de Mídias cadastrado!')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText('exibida apenas agora')).toBeVisible();

    const usuarios = await dbGet('usuarios', `email=eq.${email}&select=id,nome,status,must_change_password`);
    expect(usuarios.length).toBe(1);
    expect(String(usuarios[0].status)).toBe('ACTIVE');
    expect(Boolean(usuarios[0].must_change_password)).toBe(true);

    const sol = await dbGet('solicitacoes_acesso', `email_usuario=eq.${email}&select=status,tipo_acesso`);
    expect(sol.length).toBeGreaterThanOrEqual(1);
    expect(String(sol[0].status)).toBe('APPROVED');
    expect(['GESTOR_TELAS', 'FUNCIONARIO']).toContain(String(sol[0].tipo_acesso));

    writeReport(`prospeccao_gestor_${uniqueId}.json`, { email });
  });

  test('GESTOR — validação negativa: e-mail inválido não envia', async ({ page }) => {
    await login(page, E2E_REP_EMAIL, E2E_REP_PASSWORD);
    await page.goto('/representantes/prospeccao/gestor', { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('Ex.: Maria Silva').fill('Validação Negativa');
    await page.locator('input[type="email"]').fill('email-invalido');
    await page.getByPlaceholder('(00) 00000-0000').fill('(81) 3300-1200');
    await page.click('button:has-text("Cadastrar Gestor e Gerar Acesso")');
    await expect(page.getByText(/Informe um e-mail válido/i)).toBeVisible({ timeout: 10_000 });
    // Continua na mesma página (nenhum credencial exibida)
    await expect(page.getByText('exibida apenas agora')).toHaveCount(0);
  });

  test('PONTO PARCEIRO — wizard grava em pontos com código EST- e disponibilidade', async ({ page }) => {
    test.skip(!SRK, 'SUPABASE_SERVICE_ROLE_KEY ausente');
    const uniqueId = Date.now();
    const nomeFantasia = `Ponto Pros ${uniqueId}`;

    await login(page, E2E_REP_EMAIL, E2E_REP_PASSWORD);
    await page.goto('/representantes/prospeccao/ponto-parceiro', { waitUntil: 'domcontentloaded' });

    // Passo 1
    await page.getByPlaceholder('Ex.: Supermercado Exemplo').fill(nomeFantasia);
    await page.getByPlaceholder('Supermercado / Padaria / Academia').fill('Padaria');
    await page.click('button:has-text("Próximo:")');


    // Passo 2
    await page.getByPlaceholder('(00) 0000-0000').fill('(81) 3300-1200');
    await page.click('button:has-text("Próximo:")');

    // Passo 3 (endereço opcional — segue direto)
    await page.getByPlaceholder('Ex.: cerca de 800 pessoas/dia').waitFor({ state: 'hidden', timeout: 1000 }).catch(() => {});
    await page.getByPlaceholder('(81) 3300-1200').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    const botaoEndereco = page.locator('button:has-text("Próximo:")');
    await botaoEndereco.first().click();

    // Passo 4
    await page.locator('input[type="number"]').first().fill('2');
    await page.getByPlaceholder('Ex.: famílias, classe B/C').fill('Famílias');
    await page.click('button:has-text("Próximo:")');

    // Passo 5 (fotos opcionais)
    await page.locator('label:has-text("Foto de capa")').click().catch(() => {});
    await page.locator('button:has-text("Próximo:")').last().click();

    // Passo 6: COMISSIONADO 9% (valor livre, não fixado)
    await page.locator('button:has-text("COMISSIONADO")').click();
    await page.locator('input[type="number"]').first().fill('9');
    await page.click('button:has-text("Cadastrar Ponto Parceiro")');

    await expect(page.getByText('Ponto Parceiro cadastrado!')).toBeVisible({ timeout: 45_000 });
    const codigo = await page.locator('.text-sm.px-3.py-1').textContent();
    expect(String(codigo)).toMatch(/^EST-\d{6}$/);

    const pontos = await dbGet('pontos', `nome=eq.${encodeURIComponent(nomeFantasia)}&select=id,codigo_publico,disponibilidade,quantidade_telas,regras_comerciais`);
    expect(pontos.length).toBe(1);
    expect(String(pontos[0].codigo_publico)).toMatch(/^EST-/);
    expect(String(pontos[0].disponibilidade)).toBe('DISPONIVEL');
    expect(Number(pontos[0].quantidade_telas)).toBe(2);
    expect(String(pontos[0].regras_comerciais)).toContain('COMISSAO: 9%');
  });

  test('ANUNCIANTE — wizard com seleção de pontos persiste cliente_pontos', async ({ page }) => {
    test.skip(!SRK, 'SUPABASE_SERVICE_ROLE_KEY ausente');
    const uniqueId = Date.now();
    const data: Record<string, string> = {
      nomeFantasia: `Anunciante Pros ${uniqueId}`,
      razaoSocial: `Razao Pros ${uniqueId} LTDA`,
      whatsapp: '(81) 97777-5555',
      email: `anun.pros.${uniqueId}@e2e-rep.com.br`,
      cidade: 'Recife',
      estado: 'PE',
      contatoNome: 'Contato Pros',
      tituloCampanha: `Campanha Pros ${uniqueId}`,
      quantidadeTelas: '1',
      valorMensal: '300',
      formaPagamentoLabel: 'PIX',
    };

    await login(page, E2E_REP_EMAIL, E2E_REP_PASSWORD);
    await page.goto('/representantes/prospeccao', { waitUntil: 'domcontentloaded' });
    await page.click('button:has-text("Cadastrar anunciante")');
    await expect(page.getByRole('heading', { name: /Novo Cliente/ })).toBeVisible({ timeout: 30_000 });

    await preencherEtapa1(page, data);
    await page.click('button:has-text("Proximo: Unidade & Contato")');
    await preencherEtapa2(page, data);
    await page.click('button:has-text("Proximo: Pontos Parceiros")');
    await expect(page.getByText('Etapa 3: Pontos Parceiros')).toBeVisible({ timeout: 15_000 });


    // Seleciona o primeiro ponto disponível (se houver) e avança
    const primeiroCheckbox = page.locator('label:has(input[type="checkbox"])').first();
    if (await primeiroCheckbox.count()) {
      await primeiroCheckbox.click();
      await expect(page.getByText(/ponto(s)? selecionado(s)?/)).toBeVisible({ timeout: 5_000 });
    }
    await page.click('button:has-text("Proximo: Midia & Negociacao")');
    await expect(page.getByText(/Etapa 4: M.dia & Negocia..o/)).toBeVisible({ timeout: 15_000 });

    await preencherEtapa3(page, data);
    await page.click('button:has-text("Proximo: Revisao & Salvamento")');
    await page.click('button:has-text("Cadastrar Cliente & Salvar Proposta")');
    await expect(page.getByText('Cliente Cadastrado com Sucesso!', { exact: true })).toBeVisible({ timeout: 45_000 });

    // VALIDA BANCO: cliente criado + vínculos de prospecção
    const clientes = await dbGet('clientes', `nome_fantasia=eq.${encodeURIComponent(data.nomeFantasia)}&select=id,codigo_publico`);
    expect(clientes.length).toBe(1);
    if (clientes[0].codigo_publico) {
      expect(String(clientes[0].codigo_publico)).toMatch(/^ANU-/);
    }

    const vinculos = await dbGet('cliente_pontos', `cliente_id=eq.${clientes[0].id}&select=ponto_id,origem`);
    // Se havia pontos disponíveis no tenant, o vínculo deve existir
    const pontosDisponiveis = await dbGet('pontos', 'disponibilidade=eq.DISPONIVEL&ativo=eq.true&deleted_at=is.null&select=id');
    if (pontosDisponiveis.length > 0) {
      expect(vinculos.length).toBeGreaterThanOrEqual(1);
      expect(String(vinculos[0].origem)).toBe('PROSPECCAO');
    }

    writeReport(`prospeccao_anunciante_${uniqueId}.json`, {
      clienteId: String(clientes[0].id),
      vinculos: vinculos.length,
    });
  });
});
