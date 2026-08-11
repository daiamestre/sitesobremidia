import { test, expect } from '@playwright/test';

// Utilizando variáveis de ambiente para credenciais de teste para evitar hardcoding
// Caso não existam, fallbacks apenas para o teste não quebrar na inicialização
const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'sobremidiadesigner@gmail.com';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'sua_senha_real_aqui';

test.describe('PROVA OPERACIONAL DO GOLDEN FLOW (FASE 10.1-B)', () => {

  test('Deve executar mutation real (Criar Cliente + Proposta), recarregar e provar persistência no BD', async ({ page }) => {
    page.on('console', msg => console.log(`[BROWSER]: ${msg.text()}`));
    
    console.log('1. Acessando página de autenticação...');
    


    await page.goto('/auth?tab=login');

    console.log('2. Realizando Login na UI...');
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    // Aguarda redirecionamento
    await page.waitForURL(url => url.toString().includes('/workspace') || url.toString().includes('/dashboard'), { timeout: 15000 });
    
    console.log('3. Navegando para Formulário Comercial (Novo Cliente)...');
    await page.goto('/workspace/clientes/novo');
    
    // Identificador único para comprovar persistência exclusiva desta rodada
    const uniqueId = `TEST-${Date.now()}`;
    const clienteNome = `Cliente Golden Flow ${uniqueId}`;
    const cnpjMock = `00.000.000/0001-${Math.floor(10 + Math.random() * 89)}`; // Apenas para passar validação de front

    console.log(`4. Preenchendo dados do Cliente: ${clienteNome}...`);
    // Etapa 1: Cliente & Empresa
    await page.fill('input[name="nomeFantasia"]', clienteNome);
    await page.fill('input[name="razaoSocial"]', `${clienteNome} LTDA`);
    await page.fill('input[name="cnpj"]', cnpjMock);
    await page.fill('input[name="whatsapp"]', '(11) 99999-9999');
    await page.fill('input[name="email"]', `contato-${uniqueId}@teste.com`);
    
    // Clica em Próximo
    await page.click('button:has-text("Próximo: Estabelecimento")');

    // Etapa 2: Estabelecimento
    await page.fill('input[name="nomeUnidade"]', 'Unidade Matriz Teste');
    await page.click('button:has-text("Próximo: Contato")');

    // Etapa 3: Contato
    await page.fill('input[name="contatoNome"]', 'Contato Golden Flow');
    await page.click('button:has-text("Próximo: Dados de Mídia")');

    // Etapa 4: Mídia & Plano
    await page.fill('input[name="tituloCampanha"]', `Campanha Golden Flow ${uniqueId}`);
    await page.fill('input[name="quantidadeTelas"]', '5');
    await page.fill('input[name="valorMensal"]', '1500');
    await page.click('button:has-text("Próximo: Revisão")');

    // Vamos interceptar a requisição HTTP para o Supabase (RPC ou Table Insert)
    page.on('request', req => {
      if (req.url().includes('/rest/v1/representantes')) {
        console.log(`[NETWORK REQ] ${req.method()} ${req.url()}`);
      }
    });
    page.on('response', async res => {
      if (res.url().includes('/rest/v1/representantes')) {
        const text = await res.text().catch(() => 'could not read');
        console.log(`[NETWORK RES] ${res.status()} ${res.url()} -> ${text}`);
      }
    });

    await page.click('button:has-text("Finalizar Atendimento & Salvar Proposta")');
    
    // Pequena pausa para capturar possiveis Toasts de erro no DOM
    await page.waitForTimeout(2000);
    const htmlPostClick = await page.content();
    console.log("DOM SNAPSHOT POST CLICK:", htmlPostClick.substring(0, 3000));

    
    // Espera o Toast de Sucesso e o Redirecionamento
    await page.waitForURL('**/representantes/clientes');

    console.log('7. Forçando Reload da página para provar persistência na nuvem (sem dummy cache)...');
    await page.reload({ waitUntil: 'networkidle' });

    console.log('8. Nova leitura: Verificando se o registro continua existindo na UI pós-reload...');
    // Procura o cliente na lista de clientes
    const clienteVisivel = await page.locator(`text=${clienteNome}`).isVisible();
    
    if (clienteVisivel) {
      console.log('🟢 PERSISTÊNCIA COMPROVADA! Registro sobreviveu ao reload e foi retornado pelo Supabase real.');
    } else {
      console.error('🔴 FALHA DE PERSISTÊNCIA! Registro não apareceu na UI após reload.');
    }

    expect(clienteVisivel).toBeTruthy();
  });
});
