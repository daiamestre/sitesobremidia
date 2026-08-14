import { test, expect } from '@playwright/test';
import {
  E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD, gerarCnpjValido, login,
  preencherEtapa1, preencherEtapa2, preencherEtapa3, writeReport,
} from './helpers';

test.describe('E2E NEGATIVOS - VALIDACOES E CONTROLE DE ERRO PELA INTERFACE', () => {
  test('Campo obrigatorio vazio, CNPJ invalido, email invalido, CEP invalido, CNPJ duplicado, salvar 2x, sessao invalida', async ({ page }) => {
    test.setTimeout(360_000);
    await login(page, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);

    const uniqueId = Date.now();
    const baseCnpj = gerarCnpjValido();

    // ---------- (a) CAMPO OBRIGATORIO VAZIO ----------
    console.log('N1. Tentativa de avancar com formulario vazio...');
    await page.goto('/representantes/clientes/novo', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await expect(page.getByText(/Novo Cliente.*Cadastro Completo/)).toBeVisible({ timeout: 20000 });
    await page.click('button:has-text("Proximo: Unidade & Contato")');
    await expect(page.getByText('Corrija os campos destacados', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("Proximo: Unidade & Contato")')).toBeVisible();
    await expect(page.getByText('Etapa 2: Unidade & Contato')).not.toBeVisible();
    console.log('   PASS: bloqueado, permanece na Etapa 1.');

    // ---------- (b) CNPJ INVALIDO ----------
    console.log('N2. CNPJ com digitos verificadores invalidos...');
    const formOk = {
      nomeFantasia: `Negativo CNPJ ${uniqueId}`,
      razaoSocial: `Negativo CNPJ ${uniqueId} LTDA`,
      cnpj: '12.345.678/0001-99',
      whatsapp: '(11) 91111-1111',
      email: `neg.cnpj.${uniqueId}@e2e.com.br`,
      cidade: 'Sao Paulo',
      estado: 'SP',
      status: 'PROSPECT',
    };
    await preencherEtapa1(page, formOk);
    await page.click('button:has-text("Proximo: Unidade & Contato")');
    await expect(page.getByText('Corrija os campos destacados', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/CNPJ inv.lido/)).toBeVisible();
    await expect(page.getByText('Etapa 2: Unidade & Contato')).not.toBeVisible();
    console.log('   PASS: CNPJ invalido bloqueado.');

    // ---------- (c) EMAIL INVALIDO ----------
    console.log('N3. E-mail sem formato valido...');
    await page.goto('/representantes/clientes/novo', { waitUntil: 'domcontentloaded' });
    const formEmail = {
      ...formOk,
      cnpj: gerarCnpjValido(),
      nomeFantasia: `Negativo Email ${uniqueId}`,
      razaoSocial: `Negativo Email ${uniqueId} LTDA`,
      email: 'email-sem-arroba',
    };
    await preencherEtapa1(page, formEmail);
    await page.click('button:has-text("Proximo: Unidade & Contato")');
    await expect(page.getByText('Corrija os campos destacados', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/E-mail inv.lido/)).toBeVisible();
    await expect(page.getByText('Etapa 2: Unidade & Contato')).not.toBeVisible();
    console.log('   PASS: e-mail invalido bloqueado.');

    // ---------- (d) CEP INVALIDO ----------
    console.log('N4. CEP com menos de 8 digitos...');
    await page.goto('/representantes/clientes/novo', { waitUntil: 'domcontentloaded' });
    const formCep = {
      ...formEmail,
      cnpj: gerarCnpjValido(),
      nomeFantasia: `Negativo CEP ${uniqueId}`,
      razaoSocial: `Negativo CEP ${uniqueId} LTDA`,
      email: `neg.cep.${uniqueId}@e2e.com.br`,
      cep: '123',
    };
    await preencherEtapa1(page, formCep);
    await page.click('button:has-text("Proximo: Unidade & Contato")');
    await expect(page.getByText('Corrija os campos destacados', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/CEP inv.lido/)).toBeVisible();
    await expect(page.getByText('Etapa 2: Unidade & Contato')).not.toBeVisible();
    console.log('   PASS: CEP invalido bloqueado.');

    // ---------- (e) CLIENTE BASE VALIDO (para teste de duplicidade) ----------
    console.log('N5. Criando cliente valido (base para duplicidade)...');
    await page.goto('/representantes/clientes/novo', { waitUntil: 'domcontentloaded' });
    const base = {
      nomeFantasia: `Base Duplicidade ${uniqueId}`,
      razaoSocial: `Base Duplicidade ${uniqueId} LTDA`,
      cnpj: baseCnpj,
      whatsapp: '(11) 92222-2222',
      email: `base.dup.${uniqueId}@e2e.com.br`,
      cidade: 'Sao Paulo',
      estado: 'SP',
      status: 'ACTIVE',
      observacoes: 'Base para teste de CNPJ duplicado',
      contatoNome: 'Contato Base',
      tituloCampanha: `Campanha Base ${uniqueId}`,
      quantidadeTelas: '2',
      valorMensal: '700',
    };
    await preencherEtapa1(page, base);
    await page.click('button:has-text("Proximo: Unidade & Contato")');
    await expect(page.getByText('Etapa 2: Unidade & Contato')).toBeVisible({ timeout: 15000 });
    await preencherEtapa2(page, base);
    await page.click('button:has-text("Proximo: Midia & Negociacao")');
    await expect(page.getByText(/Etapa 3: M.dia & Negocia..o/)).toBeVisible({ timeout: 15000 });
    await preencherEtapa3(page, base);
    await page.click('button:has-text("Proximo: Revisao & Salvamento")');
    await expect(page.getByText(/Etapa 4: Revis.o e Salvamento/)).toBeVisible({ timeout: 15000 });
    await page.click('button:has-text("Cadastrar Cliente & Salvar Proposta")');
    await expect(page.getByText('Cliente Cadastrado com Sucesso!', { exact: true })).toBeVisible({ timeout: 45000 });
    await page.waitForURL('**/representantes/clientes', { timeout: 30000 });
    console.log('   PASS: cliente base criado.');

    // ---------- (f) CNPJ DUPLICADO ----------
    console.log('N6. Tentativa de cadastro com CNPJ ja existente...');
    await page.goto('/representantes/clientes/novo', { waitUntil: 'domcontentloaded' });
    const dup = {
      ...base,
      nomeFantasia: `Duplicata CNPJ ${uniqueId}`,
      razaoSocial: `Duplicata CNPJ ${uniqueId} LTDA`,
      whatsapp: '(11) 93333-3333',
      email: `dup.${uniqueId}@e2e.com.br`,
      contatoNome: 'Contato Duplicata',
      tituloCampanha: `Campanha Duplicata ${uniqueId}`,
      observacoesProposta: 'Tentativa de CNPJ duplicado',
    };
    await preencherEtapa1(page, dup);
    await page.click('button:has-text("Proximo: Unidade & Contato")');
    await expect(page.getByText('Etapa 2: Unidade & Contato')).toBeVisible({ timeout: 15000 });
    await preencherEtapa2(page, dup);
    await page.click('button:has-text("Proximo: Midia & Negociacao")');
    await expect(page.getByText(/Etapa 3: M.dia & Negocia..o/)).toBeVisible({ timeout: 15000 });
    await preencherEtapa3(page, dup);
    await page.click('button:has-text("Proximo: Revisao & Salvamento")');
    await expect(page.getByText(/Etapa 4: Revis.o e Salvamento/)).toBeVisible({ timeout: 15000 });
    await page.click('button:has-text("Cadastrar Cliente & Salvar Proposta")');
    await expect(page.getByText('Erro ao cadastrar cliente', { exact: true })).toBeVisible({ timeout: 45000 });
    await expect(page.getByText(/empresas_cnpj_key/).first()).toBeVisible({ timeout: 15000 });
    console.log('   PASS: erro controlado exibido ao tentar CNPJ duplicado (sem redirecionar).');

    // ---------- (g) SALVAR DUAS VEZES ----------
    console.log('N7. Duplo clique em salvar - guarda isSubmitting deve impedir segunda gravacao...');
    const doubleSave = {
      ...dup,
      cnpj: gerarCnpjValido(),
      nomeFantasia: `Duplo Salvar ${uniqueId}`,
      razaoSocial: `Duplo Salvar ${uniqueId} LTDA`,
      email: `dbl.${uniqueId}@e2e.com.br`,
      whatsapp: '(11) 94444-4444',
      contatoNome: 'Contato Duplo',
      tituloCampanha: `Campanha Duplo ${uniqueId}`,
      observacoesProposta: 'Teste de salvar duas vezes',
    };
    await page.goto('/representantes/clientes/novo', { waitUntil: 'domcontentloaded' });
    await preencherEtapa1(page, doubleSave);
    await page.click('button:has-text("Proximo: Unidade & Contato")');
    await expect(page.getByText('Etapa 2: Unidade & Contato')).toBeVisible({ timeout: 15000 });
    await preencherEtapa2(page, doubleSave);
    await page.click('button:has-text("Proximo: Midia & Negociacao")');
    await expect(page.getByText(/Etapa 3: M.dia & Negocia..o/)).toBeVisible({ timeout: 15000 });
    await preencherEtapa3(page, doubleSave);
    await page.click('button:has-text("Proximo: Revisao & Salvamento")');
    await expect(page.getByText(/Etapa 4: Revis.o e Salvamento/)).toBeVisible({ timeout: 15000 });
    const saveBtn = page.locator('div.space-y-6.max-w-5xl.mx-auto button').last();
    await saveBtn.click();
    await expect(page.getByText('Gravando no PostgreSQL...', { exact: true })).toBeVisible({ timeout: 10000 });
    await saveBtn.click({ force: true }).catch(() => {});
    await expect(page.getByText('Cliente Cadastrado com Sucesso!', { exact: true })).toBeVisible({ timeout: 45000 });
    await page.waitForURL('**/representantes/clientes', { timeout: 30000 });
    console.log('   PASS: segundo clique ignorado (botao desabilitado durante gravacao).');

    // ---------- (g2) AVANCAR SEM COMPLETAR ETAPA 3 + SALVAR SEM COMPLETAR ----------
    console.log('N7b. Etapa 2 vazia avanca (opcional por design); Etapa 3 vazia chega na Etapa 4, mas SALVAR bloqueia e retorna a Etapa 3...');
    const step3Empty = {
      ...doubleSave,
      cnpj: gerarCnpjValido(),
      nomeFantasia: `Salvar Sem Completar ${uniqueId}`,
      razaoSocial: `Salvar Sem Completar ${uniqueId} LTDA`,
      email: `vazio.${uniqueId}@e2e.com.br`,
      whatsapp: '(11) 95555-5555',
      contatoNome: '',
      contatoCargo: '',
      contatoEmail: '',
      contatoTelefone: '',
    };
    await page.goto('/representantes/clientes/novo', { waitUntil: 'domcontentloaded' });
    await preencherEtapa1(page, step3Empty);
    await page.click('button:has-text("Proximo: Unidade & Contato")');
    await expect(page.getByText('Etapa 2: Unidade & Contato')).toBeVisible({ timeout: 15000 });
    await page.click('button:has-text("Proximo: Midia & Negociacao")');
    await expect(page.getByText(/Etapa 3: M.dia & Negocia..o/)).toBeVisible({ timeout: 15000 });
    await page.click('button:has-text("Proximo: Revisao & Salvamento")');
    await expect(page.getByText(/Etapa 4: Revis.o e Salvamento/)).toBeVisible({ timeout: 15000 });
    await page.click('button:has-text("Cadastrar Cliente & Salvar Proposta")');
    await expect(page.getByText('Título da campanha obrigatório', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Etapa 3: M.dia & Negocia..o/)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Etapa 4: Revisão e Salvamento', { exact: true })).not.toBeVisible();
    console.log('   PASS: salvar bloqueado (título obrigatório) e wizard retornou a Etapa 3, sem gravar.');

    // ---------- (h) SESSAO INVALIDA / EXPIRADA ----------
    console.log('N8. Sessao expirada (localStorage limpo) - rota protegida deve redirecionar para /auth...');
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForURL('**/auth**', { timeout: 20000 });
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 15000 });
    console.log('   PASS: redirecionado para autenticacao.');

    writeReport('negativos.json', {
      baseCnpj: baseCnpj.replace(/\D/g, ''),
      baseNome: `Base Duplicidade ${uniqueId}`,
      dupNome: `Duplicata CNPJ ${uniqueId}`,
      doubleSaveCnpj: doubleSave.cnpj.replace(/\D/g, ''),
      doubleSaveNome: `Duplo Salvar ${uniqueId}`,
      step3EmptyCnpj: step3Empty.cnpj.replace(/\D/g, ''),
      step3EmptyNome: `Salvar Sem Completar ${uniqueId}`,
    });
  });
});