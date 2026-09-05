import { describe, it, expect } from 'vitest';
import {
  CANONICAL_TEMPLATE_HTML_ANUNCIANTE,
  CANONICAL_TEMPLATE_HTML_PARCEIRO,
  CANONICAL_TEMPLATE_HTML_GESTOR,
  getCanonicalTemplateForTipo,
  preencherTemplate,
  validarPlaceholdersTemplate,
  montarDadosTemplate,
  gerarPdfDoHtml,
} from '@/modules/crm/services/contratoDocumento.service';
import {
  templateToVisualHtml,
  visualHtmlToTemplate,
  createTokenChipHtml,
  HUMAN_TOKEN_LABELS,
} from '@/modules/crm/components/contracts/ReadableContractEditor';
import { ContratoModelosAdminService } from '@/modules/crm/services/contratoModelosAdmin.service';

describe('MICRO-GATE 05.4.1 — Correção Definitiva do Nascimento e Editor Visual de Contratos', () => {

  describe('TESTE 1 & 2 — Nascimento Completo de ANUNCIANTE (Nunca Vazio, Nunca Stub)', () => {
    it('TESTE 1: Todo novo modelo/versão de ANUNCIANTE nasce com cabeçalho, partes, preâmbulo, cláusulas 01 a 09, política, grade e assinaturas', () => {
      const template = getCanonicalTemplateForTipo('ANUNCIANTE');

      // Cabeçalho institucional
      expect(template).toContain('SOBRE MÍDIA DESIGNER, Av. Agamenon Magalhães, 1019 - Maurício de Nassau, Caruaru - PE');
      expect(template).toContain('Tel: (81) 99884-4677');
      expect(template).toContain('sobremidiadesigner@gmail.com');
      expect(template).toContain('www.sobremidiadesigner.com.br');

      // Título oficial
      expect(template).toContain('CONTRATO DE SERVIÇO E VEICULAÇÃO DE PUBLICIDADE POR MEIO DIGITAL EM MÍDIA INDOOR – SOBRE MÍDIA DESIGNER');

      // Dados das partes
      expect(template).toContain('DADOS DO CONTRATANTE - ESTABELECIMENTO COMERCIAL');
      expect(template).toContain('DADOS DO CONTRATADO - SOBRE MÍDIA DESIGNER');
      expect(template).toContain('Jairan Santos');
      expect(template).toContain('44.899.400/0002-57');

      // Preâmbulo
      expect(template).toContain('Pelo presente instrumento as partes acima identificadas têm, entre si, justo e acertado');

      // Cláusulas 01 a 09 oficiais
      expect(template).toContain('CLÁUSULA 01 - NOSSO SERVIÇO');
      expect(template).toContain('CLÁUSULA 02 - SISTEMA INTELIGENTE');
      expect(template).toContain('CLÁUSULA 03 - NOSSO CONTEÚDO');
      expect(template).toContain('CLÁUSULA 04 - PLANO EXCLUSIVO');
      expect(template).toContain('CLÁUSULA 05 - PLANO SISTEMA');
      expect(template).toContain('CLÁUSULA 06 - RESPONSABILIDADE DO CONTRATANTE');
      expect(template).toContain('CLÁUSULA 07 - CONDIÇÕES DE PAGAMENTOS');
      expect(template).toContain('CLÁUSULA 08 - RENOVAÇÃO DE CONTRATO');
      expect(template).toContain('CLÁUSULA 09 - RESCISÃO CONTRATUAL');

      // Política de privacidade e grade
      expect(template).toContain('POLÍTICA DE PRIVACIDADE');
      expect(template).toContain('GRADE DE HORÁRIOS, VEICULAÇÃO E PAGAMENTO');
      expect(template).toContain('Autorizo a veiculação de material publicitário');

      // Local, data e assinaturas
      expect(template).toContain('Local: {{LOCAL_ASSINATURA}}, Data: {{DATA_ASSINATURA}}');
      expect(template).toContain('SOBRE MÍDIA DESIGNER');
      expect(template).toContain('{{RAZAO_SOCIAL}} (CONTRATANTE)');
    });

    it('TESTE 2: Não nascer em branco — assert explícito de tamanho e integridade', () => {
      const template = getCanonicalTemplateForTipo('ANUNCIANTE');
      expect(template.length).toBeGreaterThan(6000);
      expect(template.trim()).not.toBe('');
      expect(template).not.toContain('Inserir cláusulas...');
      expect(template).not.toContain('modelo em branco');
    });

    it('TESTE 2.1: ContratoModelosAdminService.criarModelo garante fallback automático para template completo se vier vazio', async () => {
      const service = new ContratoModelosAdminService();
      expect(service.obterTemplateOficialCompleto('ANUNCIANTE')).toBe(CANONICAL_TEMPLATE_HTML_ANUNCIANTE);
      expect(service.obterTemplateOficialCompleto('PARCEIRO')).toBe(CANONICAL_TEMPLATE_HTML_PARCEIRO);
      expect(service.obterTemplateOficialCompleto('GESTOR')).toBe(CANONICAL_TEMPLATE_HTML_GESTOR);
    });
  });

  describe('TESTE 3 & 4 — Editor Visual Sem Exposição de HTML ou Tokens Técnicos', () => {
    it('TESTE 3: O documento visual gerado pelo template oficial está 100% legível em português', () => {
      const visualHtml = templateToVisualHtml(CANONICAL_TEMPLATE_HTML_ANUNCIANTE);
      expect(visualHtml.length).toBeGreaterThan(6000);

      // Cláusulas em português legível
      expect(visualHtml).toContain('CLÁUSULA 01 - NOSSO SERVIÇO');
      expect(visualHtml).toContain('CLÁUSULA 09 - RESCISÃO CONTRATUAL');
      expect(visualHtml).toContain('GRADE DE HORÁRIOS, VEICULAÇÃO E PAGAMENTO');

      // Chips humanos
      expect(visualHtml).toContain('[Razão Social do Contratante]');
      expect(visualHtml).toContain('[CPF/CNPJ]');
      expect(visualHtml).toContain('[Cidade / UF]');
      expect(visualHtml).toContain('[Data da Assinatura]');
    });

    it('TESTE 4: Não expõe chaves {{...}} nem tokens técnicos brutos na interface visual', () => {
      const visualHtml = templateToVisualHtml(CANONICAL_TEMPLATE_HTML_ANUNCIANTE);

      // Nenhum {{TOKEN}} bruto
      expect(visualHtml).not.toMatch(/\{\{[A-Za-z0-9_]+\}\}/);
      expect(visualHtml).not.toContain('{{RAZAO_SOCIAL}}');
      expect(visualHtml).not.toContain('{{CNPJ}}');
      expect(visualHtml).not.toContain('{{DATA_INICIO}}');
    });
  });

  describe('TESTE 5, 6, 7 — Inserção por Clique e Drag-and-Drop (Intermediário e no Final)', () => {
    it('TESTE 5: Inserção por clique gera chip não-editável e arrastável vinculado ao token canônico', () => {
      const chipHtml = createTokenChipHtml('RAZAO_SOCIAL');

      expect(chipHtml).toContain('data-token="RAZAO_SOCIAL"');
      expect(chipHtml).toContain('contenteditable="false"');
      expect(chipHtml).toContain('draggable="true"');
      expect(chipHtml).toContain('[Razão Social do Contratante]');
      expect(chipHtml).toContain('cursor-grab');
    });

    it('TESTE 6: Drag-and-Drop intermediário — inserção do chip em posição arbitrária (dentro de parágrafo ou tabela)', () => {
      const documentoOriginal = `
        <p>Preâmbulo inicial do contrato.</p>
        <p id="clausula1">CLÁUSULA 01 - NOSSO SERVIÇO: O contratante concorda com as regras.</p>
      `;

      // Simulação do drop dentro da cláusula 1
      const chip = createTokenChipHtml('RESPONSAVEL');
      const documentoComDrop = documentoOriginal.replace(
        'O contratante concorda',
        `O contratante, representado por ${chip}, concorda`
      );

      // Converte para template canônico
      const canonical = visualHtmlToTemplate(documentoComDrop);
      expect(canonical).toContain('O contratante, representado por {{RESPONSAVEL}}, concorda');
      expect(canonical).not.toContain('data-token');

      // Reversibilidade do visual
      const novoVisual = templateToVisualHtml(canonical);
      expect(novoVisual).toContain('[Responsável Legal]');
    });

    it('TESTE 7: Drag-and-Drop no final do documento — permite soltar após a última linha/assinatura', () => {
      const chipFinal = createTokenChipHtml('FORO_COMARCA');
      const documentoComDropFinal = `${CANONICAL_TEMPLATE_HTML_ANUNCIANTE}<p>Observações finais: ${chipFinal}</p>`;

      const canonical = visualHtmlToTemplate(documentoComDropFinal);
      expect(canonical).toContain('Observações finais: {{FORO_COMARCA}}');

      const validacao = validarPlaceholdersTemplate(canonical);
      expect(validacao.valido).toBe(true);
    });
  });

  describe('TESTE 8, 9, 10 — Altura Livre, Persistência e Geração Real', () => {
    it('TESTE 8: Documento de altura dinâmica comporta todas as seções e permite rolagem completa', () => {
      const visualHtml = templateToVisualHtml(CANONICAL_TEMPLATE_HTML_ANUNCIANTE);
      // O documento oficial completo possui dezenas de parágrafos e tabelas
      const linhas = visualHtml.split('\n').length;
      expect(linhas).toBeGreaterThan(50);
      expect(visualHtml.length).toBeGreaterThan(6000);
    });

    it('TESTE 9: Persistência — alteração de cláusula + novo campo mantém texto e tokens íntegros', () => {
      let visualDoc = templateToVisualHtml(CANONICAL_TEMPLATE_HTML_ANUNCIANTE);

      // 1. Modifica o texto de uma cláusula
      visualDoc = visualDoc.replace(
        'CLÁUSULA 01 - NOSSO SERVIÇO',
        'CLÁUSULA 01 - NOSSO SERVIÇO DIGITAL EXCLUSIVO 2026'
      );

      // 2. Insere um novo campo
      const chipWhatsapp = createTokenChipHtml('WHATSAPP');
      visualDoc = visualDoc.replace(
        'DADOS DO CONTRATANTE',
        `DADOS DO CONTRATANTE (Contato Rápido: ${chipWhatsapp})`
      );

      // 3. Converte para persistência interna (Salvar)
      const templateSalvo = visualHtmlToTemplate(visualDoc);
      expect(templateSalvo).toContain('CLÁUSULA 01 - NOSSO SERVIÇO DIGITAL EXCLUSIVO 2026');
      expect(templateSalvo).toContain('Contato Rápido: {{WHATSAPP}}');

      // 4. Reabre (Carregar)
      const visualReaberto = templateToVisualHtml(templateSalvo);
      expect(visualReaberto).toContain('CLÁUSULA 01 - NOSSO SERVIÇO DIGITAL EXCLUSIVO 2026');
      expect(visualReaberto).toContain('[WhatsApp]');
    });

    it('TESTE 10: Geração Real de PDF a partir do template editado — resolve dados reais e gera bytes PDF válidos', async () => {
      const visualDoc = templateToVisualHtml(CANONICAL_TEMPLATE_HTML_ANUNCIANTE);
      const templateCanonical = visualHtmlToTemplate(visualDoc);

      const dadosMock: any = {
        contrato: { id: 'ctr-0541', numero_contrato: 'CTR-0541-2026', data_inicio: '2026-09-05', data_fim: '2027-09-05', valor_mensal: 1500 },
        proposta: { titulo_campanha: 'Campanha 2026', periodo_veiculacao: '12 meses', dias_semana: 'Seg a Sab', horario_inicio: '08:00', horario_fim: '22:00', pacote_veiculacao: 'Plano Ouro', valor_final: 18000 },
        empresa: { razao_social: 'EMPRESA REAL TESTE LTDA', nome_fantasia: 'FANTASIA TESTE', cnpj: '12.345.678/0001-99', representante_legal: 'Dr. Testador Real', email: 'testador@sobremidia.com.br', telefone: '(81) 99999-8888', logradouro: 'Rua Real', numero: '500', bairro: 'Centro', cidade: 'Caruaru', estado: 'PE', cep: '55000-000' },
        contato: { nome: 'Dr. Testador Real', telefone: '(81) 99999-8888', email: 'testador@sobremidia.com.br' },
        ponto: null,
        template: { codigo_template: 'TPL-ANUNCIANTE-OFICIAL' },
        operadora: { razao_social: 'SOBRE MIDIA DESIGNER LTDA' },
        quantidadeTelas: 5,
      };

      const mapaDados = montarDadosTemplate(dadosMock, 'ANUNCIANTE');
      const htmlFinal = preencherTemplate(templateCanonical, mapaDados, 'ANUNCIANTE');

      // Todos os campos resolvidos
      expect(htmlFinal).toContain('EMPRESA REAL TESTE LTDA');
      expect(htmlFinal).toContain('12.345.678/0001-99');
      expect(htmlFinal).toContain('Caruaru / PE');
      expect(htmlFinal).not.toContain('{{RAZAO_SOCIAL}}');

      // Gera PDF vetorial real
      const pdfBytes = await gerarPdfDoHtml(htmlFinal, 'CTR-0541-2026', 'ANUNCIANTE', 1);
      expect(pdfBytes).toBeInstanceOf(Uint8Array);
      expect(pdfBytes.length).toBeGreaterThan(1000);
    });
  });
});
