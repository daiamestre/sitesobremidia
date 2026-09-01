import { describe, it, expect } from 'vitest';
import { resolveContractTypeFromCadastroType, getOfficialPdfForTipoContrato } from '@/modules/crm/services/contractResolver.service';

describe('GATE 2-B.2 — Origens de Contrato e Navegação Direta', () => {

  describe('1. Resolução de Origens e Tipos de Contrato', () => {
    it('resolve ANUNCIANTE para cadastro direto de anunciante', () => {
      const tipo = resolveContractTypeFromCadastroType('ANUNCIANTE');
      expect(tipo).toBe('ANUNCIANTE');
    });

    it('resolve PARCEIRO para cadastro direto de ponto parceiro', () => {
      const tipo = resolveContractTypeFromCadastroType('PONTO_PARCEIRO');
      expect(tipo).toBe('PARCEIRO');
    });

    it('resolve null para GESTOR_MIDIAS (sem contrato)', () => {
      const tipo = resolveContractTypeFromCadastroType('GESTOR_MIDIAS');
      expect(tipo).toBeNull();
    });

    it('retorna PDF oficial correspondente para ANUNCIANTE', () => {
      const pdf = getOfficialPdfForTipoContrato('ANUNCIANTE');
      expect(pdf).toBeDefined();
      expect(pdf?.fileName).toBe('contrato-anunciante.pdf');
      expect(pdf?.publicPath).toBe('/official-contracts/contrato-anunciante.pdf');
    });

    it('retorna PDF oficial correspondente para PARCEIRO', () => {
      const pdf = getOfficialPdfForTipoContrato('PARCEIRO');
      expect(pdf).toBeDefined();
      expect(pdf?.fileName).toBe('contrato-parceria.pdf');
      expect(pdf?.publicPath).toBe('/official-contracts/contrato-parceria.pdf');
    });
  });

  describe('2. Regras de Navegação por Origem de Contrato', () => {
    function getContratoNavUrl(contrato: { id: string; proposta_id?: string | null; cliente_id?: string | null; ponto_id?: string | null }, basePath: string) {
      if (contrato.proposta_id) {
        return `${basePath}/contratos/selecionar/${contrato.proposta_id}`;
      } else if (contrato.cliente_id) {
        return `${basePath}/contratos/selecionar/direto?contratoId=${contrato.id}&clienteId=${contrato.cliente_id}`;
      } else if (contrato.ponto_id) {
        return `${basePath}/contratos/selecionar/direto?contratoId=${contrato.id}&pontoId=${contrato.ponto_id}`;
      }
      return `${basePath}/contratos/selecionar/direto?contratoId=${contrato.id}`;
    }

    it('navega para proposta quando proposta_id != null no contexto /workspace', () => {
      const contrato = { id: 'ctr-1', proposta_id: 'prop-123', cliente_id: 'cli-1' };
      const url = getContratoNavUrl(contrato, '/workspace');
      expect(url).toBe('/workspace/contratos/selecionar/prop-123');
    });

    it('navega para proposta quando proposta_id != null no contexto /representantes', () => {
      const contrato = { id: 'ctr-1', proposta_id: 'prop-123', cliente_id: 'cli-1' };
      const url = getContratoNavUrl(contrato, '/representantes');
      expect(url).toBe('/representantes/contratos/selecionar/prop-123');
    });

    it('navega para direto com clienteId quando proposta_id == null e cliente_id != null', () => {
      const contrato = { id: 'd1b111c6-838a-4b8a-90f6-1deb0b96dc97', proposta_id: null, cliente_id: 'f11cfb9b-bde0-46d8-945a-79aa1ae98045' };
      const url = getContratoNavUrl(contrato, '/workspace');
      expect(url).toBe('/workspace/contratos/selecionar/direto?contratoId=d1b111c6-838a-4b8a-90f6-1deb0b96dc97&clienteId=f11cfb9b-bde0-46d8-945a-79aa1ae98045');
    });

    it('navega para direto com pontoId quando proposta_id == null e ponto_id != null (sem cliente_id)', () => {
      const contrato = { id: 'e9e4f032-6e0f-49ab-ac4f-bf72fb804493', proposta_id: null, cliente_id: null, ponto_id: '21d808c4-e4a5-4c14-a5c0-3b72f6e017e2' };
      const url = getContratoNavUrl(contrato, '/representantes');
      expect(url).toBe('/representantes/contratos/selecionar/direto?contratoId=e9e4f032-6e0f-49ab-ac4f-bf72fb804493&pontoId=21d808c4-e4a5-4c14-a5c0-3b72f6e017e2');
    });
  });

  describe('3. Regra de Navegação a partir de Cliente sem Proposta', () => {
    function getClienteContratoUrl(clienteId: string, propId: string | null, basePath: string) {
      if (propId) {
        return `${basePath}/contratos/selecionar/${propId}`;
      }
      return `${basePath}/contratos/selecionar/direto?clienteId=${clienteId}`;
    }

    it('cliente com proposta navega para seleção por propostaId', () => {
      const url = getClienteContratoUrl('cli-1', 'prop-999', '/workspace');
      expect(url).toBe('/workspace/contratos/selecionar/prop-999');
    });

    it('cliente sem proposta navega para seleção direta sem disparar bloqueio', () => {
      const url = getClienteContratoUrl('cli-1', null, '/workspace');
      expect(url).toBe('/workspace/contratos/selecionar/direto?clienteId=cli-1');
    });

    it('cliente sem proposta preserva contexto /representantes', () => {
      const url = getClienteContratoUrl('cli-2', null, '/representantes');
      expect(url).toBe('/representantes/contratos/selecionar/direto?clienteId=cli-2');
    });
  });
});
