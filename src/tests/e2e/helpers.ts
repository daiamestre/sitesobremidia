import { Page, expect } from '@playwright/test';
import fs from 'fs';

export const E2E_OWNER_EMAIL = process.env.TEST_USER_EMAIL || 'e2e-owner@sobremidia.com.br';
export const E2E_OWNER_PASSWORD = process.env.TEST_USER_PASSWORD || '';
export const E2E_REP_EMAIL = process.env.TEST_REP_EMAIL || 'e2e-rep@sobremidia.com.br';
export const E2E_REP_PASSWORD = process.env.TEST_REP_PASSWORD || '';
export const E2E_REP_ID = '34567890-1234-1234-1234-123456789012';

const ARTIFACTS_DIR = 'C:/Users/JAIRAN~1/AppData/Local/Temp/opencode/e2e_artifacts';

export function writeReport(file: string, data: unknown): void {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  fs.writeFileSync(`${ARTIFACTS_DIR}/${file}`, JSON.stringify(data, null, 2));
  console.log(`[REPORT] ${file} gravado em ${ARTIFACTS_DIR}/${file}`);
}

export function readReport(file: string): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(`${ARTIFACTS_DIR}/${file}`, 'utf8'));
  } catch {
    return null;
  }
}

export function apenasDigitos(v: string): string {
  return v.replace(/\D/g, '');
}

export function gerarCnpjValido(): string {
  const base = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join('');
  const dv = (parte: string, pesos: number[]) => {
    const soma = parte.split('').reduce((acc, d, i) => acc + Number(d) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = dv(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv(base + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${base.slice(0, 2)}.${base.slice(2, 5)}.${base.slice(5, 8)}/${base.slice(8, 12)}-${d1}${d2}`;
}

export async function login(page: Page, email: string, password: string): Promise<void> {
  // Garante uma sessão limpa: em testes com múltiplos logins no MESMO contexto,
  // a sessão anterior faria o /auth redirecionar imediatamente (loop de detach).
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.goto('/auth?tab=login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(
    (url) => /\/representantes|\/workspace|\/dashboard/.test(url.toString()),
    { timeout: 60000 }
  );
}

export async function selectByLabel(page: Page, labelText: string, option: string): Promise<void> {
  if (!option) return;
  const wrapper = page.locator('label', { hasText: labelText }).first().locator('..');
  await wrapper.locator('button[role="combobox"]').click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

export async function preencherEtapa1(
  page: Page,
  data: Record<string, string>
): Promise<void> {
  for (const name of [
    'nomeFantasia', 'razaoSocial', 'cnpj', 'segmento', 'telefone', 'whatsapp', 'email',
    'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade',
    'representanteLegal', 'cargoRepresentante', 'observacoes',
  ]) {
    if (data[name] !== undefined) {
      await page.fill(`input[name="${name}"]`, data[name]);
    }
  }
  await selectByLabel(page, 'Estado (UF)', data.estado);
  await selectByLabel(page, 'Status', data.status);
}

export async function preencherEtapa2(page: Page, data: Record<string, string>): Promise<void> {
  for (const name of ['contatoNome', 'contatoCargo', 'contatoEmail', 'contatoTelefone']) {
    if (data[name] !== undefined) {
      await page.fill(`input[name="${name}"]`, data[name]);
    }
  }
}

export async function preencherEtapa3(page: Page, data: Record<string, string>): Promise<void> {
  for (const name of ['tituloCampanha', 'quantidadeTelas', 'duracaoSegundos', 'dataInicio', 'dataFim', 'valorMensal', 'observacoesProposta']) {
    if (data[name] !== undefined) {
      await page.fill(`input[name="${name}"]`, data[name]);
    }
  }
  await selectByLabel(page, 'Forma de Pagamento', data.formaPagamentoLabel);
}

export async function verificarFormularioEdicao(page: Page, data: Record<string, string>): Promise<void> {
  const expectValue = async (name: string, value: string) => {
    await expect(page.locator(`input[name="${name}"]`)).toHaveValue(value, { timeout: 15000 });
  };
  await expectValue('nomeFantasia', data.nomeFantasia);
  await expectValue('razaoSocial', data.razaoSocial);
  await expectValue('cnpj', data.cnpjStored);
  await expectValue('segmento', data.segmento);
  await expectValue('telefone', data.telefoneStored);
  await expectValue('whatsapp', data.whatsappStored);
  await expectValue('email', data.email);
  await expectValue('cep', data.cepStored);
  await expectValue('logradouro', data.logradouro);
  await expectValue('numero', data.numero);
  await expectValue('complemento', data.complemento);
  await expectValue('bairro', data.bairro);
  await expectValue('cidade', data.cidade);
  await expectValue('estado', data.estado);
  await expectValue('representanteLegal', data.representanteLegal);
  await expectValue('cargoRepresentante', data.cargoRepresentante);
  await expectValue('observacoes', data.observacoes);
  await expectValue('contatoNome', data.contatoNome);
  await expectValue('contatoCargo', data.contatoCargo);
  await expectValue('contatoEmail', data.contatoEmail);
  await expectValue('contatoTelefone', data.contatoTelefoneStored);
  await expect(
    page.locator('label', { hasText: 'Status' }).first().locator('..').locator('button[role="combobox"]')
  ).toContainText(data.status);
}