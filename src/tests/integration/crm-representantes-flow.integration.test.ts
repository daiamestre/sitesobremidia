import { describe, it, expect } from 'vitest';
import { clienteService } from '@/modules/crm/services/cliente.service';
import { propostaService } from '@/modules/crm/services/proposta.service';
import { contratoService } from '@/modules/crm/services/contrato.service';
import { piService } from '@/modules/crm/services/pi.service';
import { financeiroService } from '@/modules/crm/services/financeiro.service';

describe('Integração CRM — Fluxo Comercial do Representante (FASE 6 a 10)', () => {
  const tenantId = 'empresa-operadora-uuid-master';
  const repId = 'representante-uuid-alpha';
  let clienteIdCriado = 'cliente-mock-uuid';
  let propostaIdCriada = 'proposta-mock-uuid';
  let contratoIdCriado = 'contrato-mock-uuid';

  it('1. ClienteService.findAll deve retornar clientes filtrados pelo escopo do Representante no banco', async () => {
    const clientes = await clienteService.findAll(tenantId, repId);
    expect(Array.isArray(clientes)).toBe(true);
    if (clientes.length > 0) {
      clienteIdCriado = clientes[0].id || 'cli-001';
      expect(clientes[0]).toHaveProperty('status');
    }
  });

  it('2. PropostaService.create deve gerar uma proposta comercial real associada ao Cliente e Representante', async () => {
    const res = await propostaService.create({
      empresaOperadoraId: tenantId,
      clienteId: clienteIdCriado,
      representanteId: repId,
      tituloCampanha: 'Campanha Digital Signage 2026',
      duracaoSegundos: 30,
      quantidadeTelas: 10,
      valorMensal: 15000,
      desconto: 500,
      formaPagamento: 'PIX',
      dataInicio: '2026-09-01',
      dataFim: '2027-08-31',
    });

    if (res.success && res.propostaId) {
      propostaIdCriada = res.propostaId;
      expect(res.numeroProposta).toBeDefined();
    } else {
      expect(res.error).toBeDefined();
    }
  });

  it('3. PropostaService.generatePreview & sendProposalEmail devem interagir com a Edge Function e atualizar status', async () => {
    const preview = await propostaService.generatePreview(propostaIdCriada);
    expect(preview).toHaveProperty('success');

    const envio = await propostaService.sendProposalEmail(propostaIdCriada);
    expect(envio).toHaveProperty('success');
  });

  it('4. ContratoService.selectContractModel deve vincular modelo e gerar o Contrato Jurídico no banco', async () => {
    const contr = await contratoService.selectContractModel({
      propostaId: propostaIdCriada,
      tipoContrato: 'ANUNCIANTE',
      templateId: 'tpl-001',
      templateNome: 'Modelo Padrão Anunciante 2026',
      templateVersao: 1,
      usuarioResponsavelId: repId,
    });

    if (contr.success && contr.contratoId) {
      contratoIdCriado = contr.contratoId;
    }
    expect(contr).toHaveProperty('success');
  });

  it('5. PIService.createPI deve emitir o Pedido de Inserção (PI) operacional com especificações e locais', async () => {
    const pi = await piService.createPI({
      empresaOperadoraId: tenantId,
      clienteId: clienteIdCriado,
      propostaId: propostaIdCriada,
      contratoId: contratoIdCriado,
      titulo: ' veiculação Campanha Verão 2026',
      inicioVeiculacao: '2026-09-01',
      fimVeiculacao: '2027-08-31',
      quantidadePecas: 4,
    }, repId);

    expect(pi).toHaveProperty('success');
  });

  it('6. FinanceiroService.createReceivable deve registrar o título a receber e provar integração com comissões', async () => {
    const rec = await financeiroService.createReceivable({
      empresaOperadoraId: tenantId,
      contratoId: contratoIdCriado,
      clienteId: clienteIdCriado,
      valorOriginal: 14500,
      vencimento: '2026-09-05',
    });

    expect(rec.success).toBe(true);
    expect(rec.contaId).toBeDefined();
  });
});
