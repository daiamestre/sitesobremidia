import { test, expect } from '@playwright/test';

// Utilizando variáveis de ambiente para credenciais de teste para evitar hardcoding
// Caso não existam, fallbacks apenas para o teste não quebrar na inicialização
const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'sobremidiadesigner@gmail.com';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'sua_senha_real_aqui';

/** Gera um CNPJ real e válido (com dígitos verificadores calculados). */
function gerarCnpjValido(): string {
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

test.describe('PROVA OPERACIONAL DO GOLDEN FLOW (FASE 10.1-B)', () => {

  test('Deve executar mutation real (Criar Cliente + Proposta), recarregar e provar persistência no BD', async ({ page }) => {
    test.setTimeout(120_000);
    page.on('console', msg => console.log(`[BROWSER]: ${msg.text()}`));

    console.log('1. Acessando página de autenticação...');

    await page.goto('/auth?tab=login', { waitUntil: 'domcontentloaded' });

    console.log('2. Realizando Login na UI...');
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    // Aguarda redirecionamento
    await page.waitForURL(url => url.toString().includes('/workspace') || url.toString().includes('/dashboard') || url.toString().includes('/representantes'), { timeout: 15000 });

    console.log('3. Navegando para Novo Cliente (wizard comercial)...');
    await page.goto('/representantes/clientes/novo', { waitUntil: 'domcontentloaded', timeout: 90_000 });

    // Identificador único para comprovar persistência exclusiva desta rodada
    const uniqueId = `TEST-${Date.now()}`;
    const clienteNome = `Cliente Golden Flow ${uniqueId}`;

    console.log(`4. Etapa 1 — Cliente & Endereço: ${clienteNome}...`);
    await page.fill('input[name="nomeFantasia"]', clienteNome);
    await page.fill('input[name="razaoSocial"]', `${clienteNome} LTDA`);
    await page.fill('input[name="cnpj"]', gerarCnpjValido());
    await page.fill('input[name="whatsapp"]', '(11) 99999-9999');
    await page.fill('input[name="email"]', `contato-${uniqueId}@teste.com`);
    await page.fill('input[name="cep"]', '01310-100');
    await page.fill('input[name="logradouro"]', 'Av. Paulista');
    await page.fill('input[name="numero"]', '1000');
    await page.fill('input[name="cidade"]', 'São Paulo');

    await page.click('button:has-text("Proximo: Unidade & Contato")');

    console.log('5. Etapa 2 — Contato Principal...');
    await page.fill('input[name="contatoNome"]', 'Contato Golden Flow');
    await page.click('button:has-text("Proximo: Midia & Negociacao")');

    console.log('6. Etapa 3 — Mídia & Negociação...');
    await page.fill('input[name="tituloCampanha"]', `Campanha Golden Flow ${uniqueId}`);
    await page.fill('input[name="quantidadeTelas"]', '5');
    await page.fill('input[name="valorMensal"]', '1500');
    await page.click('button:has-text("Proximo: Revisao & Salvamento")');

    // Intercepta a requisição HTTP para o Supabase (RPC ou Table Insert)
    page.on('request', req => {
      if (req.url().includes('/rest/v1/rpc/fn_cadastrar_cliente_atomo')) {
        console.log(`[NETWORK REQ] ${req.method()} ${req.url()}`);
      }
    });
    page.on('response', async res => {
      if (res.url().includes('/rest/v1/rpc/fn_cadastrar_cliente_atomo')) {
        const text = await res.text().catch(() => 'could not read');
        console.log(`[NETWORK RES] ${res.status()} ${res.url()} -> ${text}`);
      }
    });

    console.log('7. Etapa 4 — Revisão & Salvamento (gravação real)...');
    await page.click('button:has-text("Cadastrar Cliente & Salvar Proposta")');

    // Pequena pausa para capturar possíveis Toasts de erro no DOM
    await page.waitForTimeout(2000);
    const htmlPostClick = await page.content();
    console.log("DOM SNAPSHOT POST CLICK:", htmlPostClick.substring(0, 3000));

    // Espera o Toast de Sucesso e o Redirecionamento para a listagem
    await page.waitForURL('**/representantes/clientes', { timeout: 45000 });

    console.log('8. Forçando Reload da página para provar persistência na nuvem (sem dummy cache)...');
    await page.reload({ waitUntil: 'networkidle' });

    console.log('9. Nova leitura: Verificando se o registro continua existindo na UI pós-reload...');
    const clienteLinha = page.locator('tbody tr', { hasText: clienteNome }).first();
    await clienteLinha.waitFor({ state: 'visible', timeout: 20000 });
    const clienteVisivel = await clienteLinha.isVisible();

    if (clienteVisivel) {
      console.log('🟢 PERSISTÊNCIA COMPROVADA! Registro sobreviveu ao reload e foi retornado pelo Supabase real.');
    } else {
      console.error('🔴 FALHA DE PERSISTÊNCIA! Registro não apareceu na UI após reload.');
    }

    expect(clienteVisivel).toBeTruthy();
  });
});