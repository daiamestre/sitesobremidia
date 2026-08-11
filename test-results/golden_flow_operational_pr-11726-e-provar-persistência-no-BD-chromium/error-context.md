# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: golden_flow_operational_proof.spec.ts >> PROVA OPERACIONAL DO GOLDEN FLOW (FASE 10.1-B) >> Deve executar mutation real (Criar Cliente + Proposta), recarregar e provar persistência no BD
- Location: src\tests\e2e\golden_flow_operational_proof.spec.ts:10:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForURL: Test timeout of 30000ms exceeded.
=========================== logs ===========================
waiting for navigation to "**/representantes/clientes" until "load"
============================================================
```

# Page snapshot

```yaml
- generic [ref=f1e2]:
  - region "Notifications (F8)":
    - list
  - region "Notifications alt+T"
  - generic [ref=f1e5]:
    - complementary [ref=f1e7]:
      - generic [ref=f1e8]:
        - generic [ref=f1e9]:
          - link "SOBRE MÍDIA" [ref=f1e10] [cursor=pointer]:
            - /url: /
          - generic [ref=f1e17]: CRM
        - navigation [ref=f1e18]:
          - link "Dashboard" [ref=f1e19] [cursor=pointer]:
            - /url: /workspace/corporate
          - link "Clientes" [ref=f1e26] [cursor=pointer]:
            - /url: /workspace/clientes
          - link "Propostas" [ref=f1e37] [cursor=pointer]:
            - /url: /workspace/propostas
          - link "Contratos" [ref=f1e44] [cursor=pointer]:
            - /url: /workspace/contratos
          - link "Campanhas" [ref=f1e52] [cursor=pointer]:
            - /url: /workspace/campanhas
          - link "Pontos de Exibição" [ref=f1e59] [cursor=pointer]:
            - /url: /workspace/screens
          - link "Agenda" [ref=f1e66] [cursor=pointer]:
            - /url: /workspace/agenda
          - link "Financeiro" [ref=f1e72] [cursor=pointer]:
            - /url: /workspace/financeiro
          - link "BI & Relatórios" [ref=f1e78] [cursor=pointer]:
            - /url: /workspace/bi
          - link "Configurações" [ref=f1e84] [cursor=pointer]:
            - /url: /workspace/configuracoes
          - link "Meu Perfil" [ref=f1e91] [cursor=pointer]:
            - /url: /workspace/perfil
      - generic [ref=f1e98]:
        - generic [ref=f1e99]:
          - generic "e2e-owner-1786402674478@sobremidia-e2e.local" [ref=f1e100]: E2
          - generic [ref=f1e101]:
            - paragraph [ref=f1e102]: e2e-owner-1786402674478
            - paragraph [ref=f1e103]: Administrador Geral
        - button "Sair do CRM" [ref=f1e107] [cursor=pointer]
    - main [ref=f1e108]:
      - generic [ref=f1e109]:
        - generic [ref=f1e116]:
          - heading "CRM Comercial" [level=1] [ref=f1e117]
          - paragraph [ref=f1e118]: Gestão de Vendas & Clientes
        - textbox "Pesquisar clientes, propostas ou CNPJ..." [ref=f1e124]
        - generic [ref=f1e125]:
          - button [ref=f1e126] [cursor=pointer]
          - generic "e2e-owner-1786402674478 (e2e-owner-1786402674478@sobremidia-e2e.local)" [ref=f1e128]: E2
          - button "+ Novo Cliente" [ref=f1e130] [cursor=pointer]
      - generic [ref=f1e133]:
        - generic [ref=f1e134]:
          - generic [ref=f1e135]:
            - generic [ref=f1e141]:
              - heading "Formulário Comercial Inteligente" [level=2] [ref=f1e142]
              - paragraph [ref=f1e143]: Atendimento Unificado ➔ Cliente, Estabelecimento, Contato e Proposta Comercial
            - generic [ref=f1e144]: Etapa 5 de 5
          - generic [ref=f1e145]:
            - generic [ref=f1e146] [cursor=pointer]: 1. Cliente
            - generic [ref=f1e148] [cursor=pointer]: 2. Unidade
            - generic [ref=f1e150] [cursor=pointer]: 3. Contato
            - generic [ref=f1e152] [cursor=pointer]: 4. Mídia
            - generic [ref=f1e154] [cursor=pointer]: 5. Revisão
        - generic [ref=f1e156]:
          - generic [ref=f1e157]:
            - 'heading "Etapa 5: Resumo e Emissão da Proposta Comercial" [level=3] [ref=f1e158]'
            - paragraph [ref=f1e162]: Revise todos os dados coletados antes de gravar o atendimento no PostgreSQL.
          - generic [ref=f1e163]:
            - generic [ref=f1e164]:
              - generic [ref=f1e165]:
                - heading "Empresa & Cliente" [level=4] [ref=f1e166]
                - paragraph [ref=f1e167]: Cliente Golden Flow TEST-1786404446278
                - paragraph [ref=f1e168]: "CNPJ: 00.000.000/0001-47"
                - paragraph [ref=f1e169]: "Cidade: /"
                - paragraph [ref=f1e170]: "Contato: Contato Golden Flow ((11) 99999-9999)"
              - generic [ref=f1e171]:
                - heading "Campanha & Negociação" [level=4] [ref=f1e172]
                - paragraph [ref=f1e173]: Campanha Golden Flow TEST-1786404446278
                - paragraph [ref=f1e174]: "Telas / Pontos: 5 unidades"
                - paragraph [ref=f1e175]: "Valor Mensal: R$ 1.500"
                - paragraph [ref=f1e176]: "Pagamento: PIX"
            - generic [ref=f1e177]:
              - button "Voltar" [ref=f1e178] [cursor=pointer]
              - button "Finalizar Atendimento & Salvar Proposta" [ref=f1e179] [cursor=pointer]
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | // Utilizando variáveis de ambiente para credenciais de teste para evitar hardcoding
  4   | // Caso não existam, fallbacks apenas para o teste não quebrar na inicialização
  5   | const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'sobremidiadesigner@gmail.com';
  6   | const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'sua_senha_real_aqui';
  7   | 
  8   | test.describe('PROVA OPERACIONAL DO GOLDEN FLOW (FASE 10.1-B)', () => {
  9   | 
  10  |   test('Deve executar mutation real (Criar Cliente + Proposta), recarregar e provar persistência no BD', async ({ page }) => {
  11  |     page.on('console', msg => console.log(`[BROWSER]: ${msg.text()}`));
  12  |     
  13  |     console.log('1. Acessando página de autenticação...');
  14  |     
  15  | 
  16  | 
  17  |     await page.goto('/auth?tab=login');
  18  | 
  19  |     console.log('2. Realizando Login na UI...');
  20  |     await page.fill('input[type="email"]', TEST_EMAIL);
  21  |     await page.fill('input[type="password"]', TEST_PASSWORD);
  22  |     await page.click('button[type="submit"]');
  23  | 
  24  |     // Aguarda redirecionamento
  25  |     await page.waitForURL(url => url.toString().includes('/workspace') || url.toString().includes('/dashboard'), { timeout: 15000 });
  26  |     
  27  |     console.log('3. Navegando para Formulário Comercial (Novo Cliente)...');
  28  |     await page.goto('/workspace/clientes/novo');
  29  |     
  30  |     // Identificador único para comprovar persistência exclusiva desta rodada
  31  |     const uniqueId = `TEST-${Date.now()}`;
  32  |     const clienteNome = `Cliente Golden Flow ${uniqueId}`;
  33  |     const cnpjMock = `00.000.000/0001-${Math.floor(10 + Math.random() * 89)}`; // Apenas para passar validação de front
  34  | 
  35  |     console.log(`4. Preenchendo dados do Cliente: ${clienteNome}...`);
  36  |     // Etapa 1: Cliente & Empresa
  37  |     await page.fill('input[name="nomeFantasia"]', clienteNome);
  38  |     await page.fill('input[name="razaoSocial"]', `${clienteNome} LTDA`);
  39  |     await page.fill('input[name="cnpj"]', cnpjMock);
  40  |     await page.fill('input[name="whatsapp"]', '(11) 99999-9999');
  41  |     await page.fill('input[name="email"]', `contato-${uniqueId}@teste.com`);
  42  |     
  43  |     // Clica em Próximo
  44  |     await page.click('button:has-text("Próximo: Estabelecimento")');
  45  | 
  46  |     // Etapa 2: Estabelecimento
  47  |     await page.fill('input[name="nomeUnidade"]', 'Unidade Matriz Teste');
  48  |     await page.click('button:has-text("Próximo: Contato")');
  49  | 
  50  |     // Etapa 3: Contato
  51  |     await page.fill('input[name="contatoNome"]', 'Contato Golden Flow');
  52  |     await page.click('button:has-text("Próximo: Dados de Mídia")');
  53  | 
  54  |     // Etapa 4: Mídia & Plano
  55  |     await page.fill('input[name="tituloCampanha"]', `Campanha Golden Flow ${uniqueId}`);
  56  |     await page.fill('input[name="quantidadeTelas"]', '5');
  57  |     await page.fill('input[name="valorMensal"]', '1500');
  58  |     await page.click('button:has-text("Próximo: Revisão")');
  59  | 
  60  |     // Vamos interceptar a requisição HTTP para o Supabase (RPC ou Table Insert)
  61  |     page.on('request', req => {
  62  |       if (req.url().includes('/rest/v1/representantes')) {
  63  |         console.log(`[NETWORK REQ] ${req.method()} ${req.url()}`);
  64  |       }
  65  |     });
  66  |     page.on('response', async res => {
  67  |       if (res.url().includes('/rest/v1/representantes')) {
  68  |         const text = await res.text().catch(() => 'could not read');
  69  |         console.log(`[NETWORK RES] ${res.status()} ${res.url()} -> ${text}`);
  70  |       }
  71  |     });
  72  | 
  73  |     await page.click('button:has-text("Finalizar Atendimento & Salvar Proposta")');
  74  |     
  75  |     // Pequena pausa para capturar possiveis Toasts de erro no DOM
  76  |     await page.waitForTimeout(2000);
  77  |     const htmlPostClick = await page.content();
  78  |     console.log("DOM SNAPSHOT POST CLICK:", htmlPostClick.substring(0, 3000));
  79  | 
  80  |     
  81  |     // Espera o Toast de Sucesso e o Redirecionamento
> 82  |     await page.waitForURL('**/representantes/clientes');
      |                ^ Error: page.waitForURL: Test timeout of 30000ms exceeded.
  83  | 
  84  |     console.log('7. Forçando Reload da página para provar persistência na nuvem (sem dummy cache)...');
  85  |     await page.reload({ waitUntil: 'networkidle' });
  86  | 
  87  |     console.log('8. Nova leitura: Verificando se o registro continua existindo na UI pós-reload...');
  88  |     // Procura o cliente na lista de clientes
  89  |     const clienteVisivel = await page.locator(`text=${clienteNome}`).isVisible();
  90  |     
  91  |     if (clienteVisivel) {
  92  |       console.log('🟢 PERSISTÊNCIA COMPROVADA! Registro sobreviveu ao reload e foi retornado pelo Supabase real.');
  93  |     } else {
  94  |       console.error('🔴 FALHA DE PERSISTÊNCIA! Registro não apareceu na UI após reload.');
  95  |     }
  96  | 
  97  |     expect(clienteVisivel).toBeTruthy();
  98  |   });
  99  | });
  100 | 
```