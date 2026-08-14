import { test, expect } from '@playwright/test';
import {
  E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD, gerarCnpjValido, apenasDigitos, login,
  preencherEtapa1, preencherEtapa2, preencherEtapa3, verificarFormularioEdicao,
  writeReport,
} from './helpers';

test.describe('E2E OWNER - FLUXO COMPLETO POR INTERFACE (todos os campos)', () => {
  test('Cadastro completo via wizard, revisao exata, salvar, listagem, edicao, reload e prova de persistencia', async ({ page }) => {
    test.setTimeout(240_000);

    const uniqueId = Date.now();
    const cnpjMasked = gerarCnpjValido();
    const data: Record<string, string> = {
      nomeFantasia: `Cliente E2E Full OWNER ${uniqueId}`,
      razaoSocial: `Razao E2E Full ${uniqueId} LTDA`,
      cnpj: cnpjMasked,
      cnpjStored: apenasDigitos(cnpjMasked),
      whatsapp: '(11) 98888-7777',
      whatsappStored: '11988887777',
      email: `contato.${uniqueId}@e2e-owner.com.br`,
      segmento: 'Varejo Farmaceutico',
      telefone: '(11) 3222-0000',
      telefoneStored: '1132220000',
      cep: '01310-100',
      cepStored: '01310100',
      logradouro: 'Av. Paulista',
      numero: '1000',
      complemento: 'Loja 04',
      bairro: 'Bela Vista',
      cidade: 'Sao Paulo',
      estado: 'SP',
      representanteLegal: 'Joao da Silva',
      cargoRepresentante: 'Socio-Administrador',
      status: 'ACTIVE',
      observacoes: `Observacao E2E completa OWNER ${uniqueId}`,
      contatoNome: 'Carlos Roberto',
      contatoCargo: 'Gerente Geral',
      contatoEmail: `carlos.${uniqueId}@e2e-owner.com.br`,
      contatoTelefone: '(11) 97777-6666',
      contatoTelefoneStored: '11977776666',
      tituloCampanha: `Campanha E2E Full OWNER ${uniqueId}`,
      quantidadeTelas: '12',
      duracaoSegundos: '30',
      dataInicio: '2026-09-01',
      dataFim: '2026-12-31',
      valorMensal: '4500',
      formaPagamentoLabel: 'PIX à Vista',
      formaPagamento: 'PIX',
      observacoesProposta: `Condicoes comerciais E2E OWNER ${uniqueId}`,
    };

    console.log('1. LOGIN OWNER pela interface...');
    await login(page, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);

    console.log('2. Abrindo Novo Cliente (wizard)...');
    await page.goto('/representantes/clientes/novo', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await expect(page.getByText(/Novo Cliente.*Cadastro Completo/)).toBeVisible({ timeout: 20000 });

    console.log('3. ETAPA 1 - preenchendo TODOS os campos (cliente, endereco, responsavel, comercial)...');
    await preencherEtapa1(page, data);
    await page.click('button:has-text("Proximo: Unidade & Contato")');
    await expect(page.getByText('Etapa 2: Unidade & Contato')).toBeVisible({ timeout: 15000 });

    console.log('3.1 ETAPA 2 - bloco Unidade/Estabelecimento reflete EXATAMENTE os dados da Etapa 1...');
    await expect(page.getByText('Unidade / Estabelecimento')).toBeVisible();
    await expect(page.getByText(data.nomeFantasia, { exact: true })).toBeVisible();
    await expect(page.getByText(`${data.logradouro}, ${data.numero}, ${data.complemento}, ${data.bairro}`)).toBeVisible();
    await expect(page.getByText(data.cep, { exact: true })).toBeVisible();

    console.log('4. ETAPA 2 - contato principal...');
    await preencherEtapa2(page, data);
    await page.click('button:has-text("Proximo: Midia & Negociacao")');
    await expect(page.getByText(/Etapa 3: M.dia & Negocia..o/)).toBeVisible({ timeout: 15000 });

    console.log('5. ETAPA 3 - midia e negociacao...');
    await preencherEtapa3(page, data);
    await page.click('button:has-text("Proximo: Revisao & Salvamento")');
    await expect(page.getByText(/Etapa 4: Revis.o e Salvamento/)).toBeVisible({ timeout: 15000 });

    console.log('6. ETAPA 4 - verificando visualmente que a revisao contem EXATAMENTE os dados informados...');
    await expect(page.getByText(data.nomeFantasia, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(`Razao Social: ${data.razaoSocial}`)).toBeVisible();
    await expect(page.getByText(`CNPJ: ${data.cnpj}`)).toBeVisible();
    await expect(page.getByText(`Segmento: ${data.segmento}`)).toBeVisible();
    await expect(page.getByText('Status: ACTIVE')).toBeVisible();
    await expect(page.getByText(data.telefone, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(data.whatsapp, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(data.email, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(`${data.logradouro}, ${data.numero}, ${data.complemento}, ${data.bairro}`).first()).toBeVisible();
    await expect(page.getByText(`CEP: ${data.cep}`).first()).toBeVisible();
    await expect(page.getByText(`${data.cidade}/${data.estado}`).first()).toBeVisible();
    await expect(page.getByText(`Representante Legal: ${data.representanteLegal}`)).toBeVisible();
    await expect(page.getByText(`Cargo: ${data.cargoRepresentante}`)).toBeVisible();
    await expect(page.getByText(`Obs: ${data.observacoes}`)).toBeVisible();
    await expect(page.getByText('Unidade', { exact: true })).toBeVisible();
    const unidadeCard = page.locator('div.rounded-xl').filter({ has: page.getByText('Unidade', { exact: true }) });
    await expect(unidadeCard.getByText(data.nomeFantasia, { exact: true })).toBeVisible();
    await expect(unidadeCard.getByText(`CEP: ${data.cep}`, { exact: true })).toBeVisible();
    await expect(page.getByText(`Nome: ${data.contatoNome}`)).toBeVisible();
    await expect(page.getByText(`Cargo: ${data.contatoCargo}`)).toBeVisible();
    await expect(page.getByText(`E-mail: ${data.contatoEmail}`)).toBeVisible();
    await expect(page.getByText(`Telefone: ${data.contatoTelefone}`)).toBeVisible();
    await expect(page.getByText(data.tituloCampanha, { exact: true })).toBeVisible();
    await expect(page.getByText('Telas / Pontos: 12 unidades')).toBeVisible();
    await expect(page.getByText(/Dura..o: 30s/)).toBeVisible();
    await expect(page.getByText(/Vig.ncia: 2026-09-01/)).toBeVisible();
    await expect(page.getByText('R$ 4.500,00')).toBeVisible();
    await expect(page.getByText('Forma de Pagamento: PIX')).toBeVisible();
    await expect(page.getByText(`Obs: ${data.observacoesProposta}`)).toBeVisible();
    await expect(page.getByText(/representante_id NULL/)).toBeVisible();

    console.log('7. SALVANDO na interface (RPC real para o Supabase)...');
    await page.click('button:has-text("Cadastrar Cliente & Salvar Proposta")');
    await expect(page.getByText('Cliente Cadastrado com Sucesso!', { exact: true })).toBeVisible({ timeout: 45000 });
    await page.waitForURL('**/representantes/clientes', { timeout: 30000 });

    console.log('8. LISTAGEM - localizando o cliente criado...');
    const row = page.locator('tbody tr', { hasText: data.nomeFantasia }).first();
    await row.waitFor({ state: 'visible', timeout: 20000 });
    await expect(row).toBeVisible();

    console.log('9. ABRINDO EDICAO - conferindo todos os campos...');
    await row.getByRole('button', { name: 'Editar' }).click();
    await page.waitForURL('**/representantes/clientes/editar/**', { timeout: 20000 });
    await expect(page.getByText('Editar Cliente')).toBeVisible({ timeout: 20000 });
    await verificarFormularioEdicao(page, data);

    console.log('10. RECARREGANDO a pagina e conferindo novamente todos os campos...');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    await expect(page.getByText('Editar Cliente')).toBeVisible({ timeout: 20000 });
    await verificarFormularioEdicao(page, data);

    console.log('11. Persistencia comprovada na interface. Gravando relatorio para verificacao campo-a-campo no banco REAL...');
    writeReport('owner_full.json', data);
  });
});