import { test, expect } from '@playwright/test';
import {
  E2E_REP_EMAIL, E2E_REP_PASSWORD, E2E_REP_ID, gerarCnpjValido, apenasDigitos, login,
  preencherEtapa1, preencherEtapa2, preencherEtapa3, verificarFormularioEdicao,
  writeReport,
} from './helpers';

const OWNER_CLIENT_SEM_REP = 'Cliente Golden Flow TEST-1786653258297';

test.describe('E2E REPRESENTANTE - FLUXO COMPLETO POR INTERFACE', () => {
  test('Cadastro rep vinculado ao rep autenticado, RLS, listagem, edicao, reload e isolamento', async ({ page }) => {
    test.setTimeout(240_000);

    const uniqueId = Date.now();
    const cnpjMasked = gerarCnpjValido();
    const data: Record<string, string> = {
      nomeFantasia: `Cliente E2E Rep ${uniqueId}`,
      razaoSocial: `Razao E2E Rep ${uniqueId} LTDA`,
      cnpj: cnpjMasked,
      cnpjStored: apenasDigitos(cnpjMasked),
      whatsapp: '(81) 97777-5555',
      whatsappStored: '81977775555',
      email: `contato.rep.${uniqueId}@e2e-rep.com.br`,
      segmento: 'Atacado',
      telefone: '(81) 3222-1111',
      telefoneStored: '8132221111',
      cep: '50720-001',
      cepStored: '50720001',
      logradouro: 'Rua do Comercio',
      numero: '321',
      complemento: 'Sala 02',
      bairro: 'Boa Vista',
      cidade: 'Recife',
      estado: 'PE',
      representanteLegal: 'Maria Oliveira',
      cargoRepresentante: 'Diretora Comercial',
      status: 'PROSPECT',
      observacoes: `Observacao E2E Rep ${uniqueId}`,
      contatoNome: 'Pedro Santos',
      contatoCargo: 'Comprador',
      contatoEmail: `pedro.rep.${uniqueId}@e2e-rep.com.br`,
      contatoTelefone: '(81) 98888-4444',
      contatoTelefoneStored: '81988884444',
      tituloCampanha: `Campanha E2E Rep ${uniqueId}`,
      quantidadeTelas: '3',
      duracaoSegundos: '15',
      dataInicio: '2026-10-01',
      dataFim: '2026-10-31',
      valorMensal: '900',
      formaPagamentoLabel: 'Boleto Faturado',
      formaPagamento: 'BOLETO',
      observacoesProposta: `Condicoes E2E Rep ${uniqueId}`,
    };

    console.log('1. LOGIN REPRESENTANTE pela interface...');
    await login(page, E2E_REP_EMAIL, E2E_REP_PASSWORD);

    console.log('2. Abrindo Novo Cliente (wizard)...');
    await page.goto('/representantes/clientes/novo', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await expect(page.getByText(/Novo Cliente.*Cadastro Completo/)).toBeVisible({ timeout: 20000 });

    console.log('3. ETAPA 1...');
    await preencherEtapa1(page, data);
    await page.click('button:has-text("Proximo: Unidade & Contato")');
    await expect(page.getByText('Etapa 2: Unidade & Contato')).toBeVisible({ timeout: 15000 });

    console.log('4. ETAPA 2...');
    await preencherEtapa2(page, data);
    await page.click('button:has-text("Proximo: Pontos Parceiros")');
    await expect(page.getByText('Etapa 3: Pontos Parceiros')).toBeVisible({ timeout: 15000 });

    console.log('4b. ETAPA 3 (Pontos Parceiros) - sem seleção, segue adiante...');
    await page.click('button:has-text("Proximo: Midia & Negociacao")');
    await expect(page.getByText(/Etapa 4: M.dia & Negocia..o/)).toBeVisible({ timeout: 15000 });

    console.log('5. ETAPA 4...');
    await preencherEtapa3(page, data);
    await page.click('button:has-text("Proximo: Revisao & Salvamento")');
    await expect(page.getByText(/Etapa 5: Revis.o e Salvamento/)).toBeVisible({ timeout: 15000 });

    console.log('6. ETAPA 5 - conferindo dados + aviso de vinculacao ao representante autenticado...');
    await expect(page.getByText(data.nomeFantasia, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(`Razao Social: ${data.razaoSocial}`)).toBeVisible();
    await expect(page.getByText(`CNPJ: ${data.cnpj}`)).toBeVisible();
    await expect(page.getByText(`CEP: ${data.cep}`).first()).toBeVisible();
    await expect(page.getByText(`${data.cidade}/${data.estado}`).first()).toBeVisible();
    await expect(page.getByText(`Nome: ${data.contatoNome}`)).toBeVisible();
    await expect(page.getByText(data.tituloCampanha, { exact: true })).toBeVisible();
    await expect(page.getByText('R$ 900,00')).toBeVisible();
    await expect(page.getByText('Forma de Pagamento: BOLETO')).toBeVisible();
    await expect(page.getByText(new RegExp(E2E_REP_ID))).toBeVisible();

    console.log('7. SALVANDO...');
    await page.click('button:has-text("Cadastrar Cliente & Salvar Proposta")');
    await expect(page.getByText('Cliente Cadastrado com Sucesso!', { exact: true })).toBeVisible({ timeout: 45000 });
    await page.waitForURL('**/representantes/clientes', { timeout: 30000 });

    console.log('8. LISTAGEM - cliente proprio visivel...');
    const row = page.locator('tbody tr', { hasText: data.nomeFantasia }).first();
    await row.waitFor({ state: 'visible', timeout: 20000 });
    await expect(row).toBeVisible();

    console.log('9. ISOLAMENTO RLS - cliente do OWNER (representante_id NULL) NAO deve aparecer para o rep...');
    await page.waitForTimeout(1500);
    const ownerRow = page.locator('tbody tr', { hasText: OWNER_CLIENT_SEM_REP });
    await expect(ownerRow).toHaveCount(0);

    console.log('10. EDICAO - conferindo todos os campos...');
    await row.getByRole('button', { name: 'Editar' }).click();
    await page.waitForURL('**/representantes/clientes/editar/**', { timeout: 20000 });
    await expect(page.getByText('Editar Cliente')).toBeVisible({ timeout: 20000 });
    await verificarFormularioEdicao(page, data);

    console.log('11. RELOAD - conferindo novamente todos os campos...');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    await expect(page.getByText('Editar Cliente')).toBeVisible({ timeout: 20000 });
    await verificarFormularioEdicao(page, data);

    console.log('12. Gravando relatorio para verificacao campo-a-campo no banco REAL...');
    writeReport('rep_full.json', data);
  });
});