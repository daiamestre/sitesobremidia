import { supabase } from '@/integrations/supabase/client';
import { jsPDF } from 'jspdf';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { uploadToR2 } from '@/lib/r2Upload';

/**
 * Servico REAL de Documentos de Contrato.
 *
 * - PDF gerado como documento vetorial real a partir do template oficial.
 * - Upload para Cloudflare R2 (object key institucional).
 * - Download/visualizacao passam por autorizacao real (RLS) via Edge Function.
 * - Assinatura: envelope ASSINADOR_INTERNO real, pdf-lib, hash SHA-256, RPC fn_assinar_contrato.
 */

export interface DadosDocumentoContrato {
  contrato: any;
  proposta: any;
  empresa: any;
  contato: any;
  ponto: any;
  template: any;
  operadora: any;
  quantidadeTelas: number;
}

export interface ResultadoDocumento {
  success: boolean;
  objectKey?: string;
  documentHash?: string;
  versao?: number;
  error?: string;
}

const FORMATO_MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

export function formatarData(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

/**
 * Formata data no padrão extenso pt-BR: 'DD de mês por extenso de YYYY'.
 * Fuso horário obrigatório: America/Sao_Paulo.
 * Exemplo: '05 de setembro de 2026'.
 */
export function formatarDataExtensa(data?: Date | string | null): string {
  const d = data ? (typeof data === 'string' ? new Date(data) : data) : new Date();
  if (isNaN(d.getTime())) {
    return formatarDataExtensa(new Date());
  }
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  return formatter.format(d);
}

export type PlaceholderCategoria = 'CADASTRO' | 'COMERCIAL' | 'FINANCEIRO' | 'DERIVADO' | 'SISTEMA' | 'MANUAL';
export type PlaceholderTipo = 'texto' | 'data' | 'moeda' | 'numero' | 'endereco';

export interface PlaceholderInfo {
  nome: string;
  descricao: string;
  tipo: PlaceholderTipo;
  origem: string;
  resolver: string;
  obrigatorio: boolean;
  categoria: PlaceholderCategoria;
}

/**
 * Catálogo Canônico Oficial de Placeholders do SOBRE MÍDIA.
 * Todo token utilizado em modelos deve estar categorizado e documentado aqui.
 */
export const PLACEHOLDER_CATALOG: Record<string, PlaceholderInfo> = {
  // CADASTRO
  RAZAO_SOCIAL: {
    nome: 'RAZAO_SOCIAL',
    descricao: 'Razão Social ou Nome do cliente/anunciante/parceiro',
    tipo: 'texto',
    origem: 'empresas.razao_social / empresas.nome_fantasia / pontos.nome',
    resolver: 'empresa?.razao_social || empresa?.nome_fantasia || ponto?.nome',
    obrigatorio: true,
    categoria: 'CADASTRO',
  },
  NOME_FANTASIA: {
    nome: 'NOME_FANTASIA',
    descricao: 'Nome Fantasia do estabelecimento comercial',
    tipo: 'texto',
    origem: 'empresas.nome_fantasia / pontos.nome_fantasia',
    resolver: 'empresa?.nome_fantasia || ponto?.nome_fantasia || ponto?.nome',
    obrigatorio: false,
    categoria: 'CADASTRO',
  },
  CNPJ: {
    nome: 'CNPJ',
    descricao: 'CPF ou CNPJ do contratante/parceiro',
    tipo: 'texto',
    origem: 'empresas.cnpj / pontos.cnpj',
    resolver: 'empresa?.cnpj || ponto?.cnpj',
    obrigatorio: true,
    categoria: 'CADASTRO',
  },
  CPF_CNPJ: {
    nome: 'CPF_CNPJ',
    descricao: 'CPF ou CNPJ (compatibilidade geral e gestor)',
    tipo: 'texto',
    origem: 'empresas.cnpj / perfis.cpf_cnpj / pontos.cnpj',
    resolver: 'empresa?.cnpj || ponto?.cnpj',
    obrigatorio: false,
    categoria: 'CADASTRO',
  },
  RESPONSAVEL: {
    nome: 'RESPONSAVEL',
    descricao: 'Nome do responsável legal ou contato principal',
    tipo: 'texto',
    origem: 'contatos.nome / empresas.representante_legal / pontos.responsavel_nome',
    resolver: 'contato?.nome || empresa?.representante_legal || ponto?.responsavel_nome',
    obrigatorio: false,
    categoria: 'CADASTRO',
  },
  REPRESENTANTE_LEGAL: {
    nome: 'REPRESENTANTE_LEGAL',
    descricao: 'Nome do representante legal da empresa',
    tipo: 'texto',
    origem: 'empresas.representante_legal / contatos.nome',
    resolver: 'contato?.nome || empresa?.representante_legal',
    obrigatorio: false,
    categoria: 'CADASTRO',
  },
  NOME_GESTOR: {
    nome: 'NOME_GESTOR',
    descricao: 'Nome completo do gestor de mídias',
    tipo: 'texto',
    origem: 'usuarios.nome / contatos.nome',
    resolver: 'responsavel || razaoSocial',
    obrigatorio: true,
    categoria: 'CADASTRO',
  },
  LOGRADOURO: {
    nome: 'LOGRADOURO',
    descricao: 'Logradouro / Rua do endereço comercial',
    tipo: 'texto',
    origem: 'empresas.logradouro / pontos.logradouro',
    resolver: 'empresa?.logradouro || ponto?.logradouro',
    obrigatorio: false,
    categoria: 'CADASTRO',
  },
  NUMERO: {
    nome: 'NUMERO',
    descricao: 'Número do endereço',
    tipo: 'texto',
    origem: 'empresas.numero / pontos.numero',
    resolver: 'empresa?.numero || ponto?.numero',
    obrigatorio: false,
    categoria: 'CADASTRO',
  },
  COMPLEMENTO: {
    nome: 'COMPLEMENTO',
    descricao: 'Complemento do endereço (sala, bloco, etc.)',
    tipo: 'texto',
    origem: 'empresas.complemento / pontos.complemento',
    resolver: 'empresa?.complemento || ponto?.complemento',
    obrigatorio: false,
    categoria: 'CADASTRO',
  },
  BAIRRO: {
    nome: 'BAIRRO',
    descricao: 'Bairro do estabelecimento',
    tipo: 'texto',
    origem: 'empresas.bairro / pontos.bairro',
    resolver: 'empresa?.bairro || ponto?.bairro',
    obrigatorio: false,
    categoria: 'CADASTRO',
  },
  CIDADE: {
    nome: 'CIDADE',
    descricao: 'Cidade do estabelecimento',
    tipo: 'texto',
    origem: 'empresas.cidade / pontos.cidade',
    resolver: 'empresa?.cidade || ponto?.cidade',
    obrigatorio: false,
    categoria: 'CADASTRO',
  },
  ESTADO: {
    nome: 'ESTADO',
    descricao: 'Estado da Federação (UF)',
    tipo: 'texto',
    origem: 'empresas.estado / pontos.estado',
    resolver: 'empresa?.estado || ponto?.estado',
    obrigatorio: false,
    categoria: 'CADASTRO',
  },
  UF: {
    nome: 'UF',
    descricao: 'Sigla do Estado (UF)',
    tipo: 'texto',
    origem: 'empresas.estado / pontos.estado',
    resolver: 'empresa?.estado || ponto?.estado',
    obrigatorio: false,
    categoria: 'CADASTRO',
  },
  CEP: {
    nome: 'CEP',
    descricao: 'Código de Endereçamento Postal',
    tipo: 'texto',
    origem: 'empresas.cep / pontos.cep',
    resolver: 'empresa?.cep || ponto?.cep',
    obrigatorio: false,
    categoria: 'CADASTRO',
  },
  ENDERECO_UNIDADE: {
    nome: 'ENDERECO_UNIDADE',
    descricao: 'Endereço completo estruturado (Rua, Nº - Bairro - Cidade/UF)',
    tipo: 'endereco',
    origem: 'Derivado estruturado de logradouro, número, bairro e cidade/UF',
    resolver: 'montarEnderecoUnidade()',
    obrigatorio: false,
    categoria: 'CADASTRO',
  },
  NOME_UNIDADE: {
    nome: 'NOME_UNIDADE',
    descricao: 'Nome ou identificação da unidade / ponto parceiro',
    tipo: 'texto',
    origem: 'pontos.nome / empresas.nome_fantasia',
    resolver: 'ponto?.nome || empresa?.nome_fantasia',
    obrigatorio: false,
    categoria: 'CADASTRO',
  },
  TELEFONE: {
    nome: 'TELEFONE',
    descricao: 'Telefone de contato principal',
    tipo: 'texto',
    origem: 'empresas.telefone / contatos.telefone / pontos.telefone',
    resolver: 'empresa?.telefone || contato?.telefone || ponto?.telefone',
    obrigatorio: false,
    categoria: 'CADASTRO',
  },
  WHATSAPP: {
    nome: 'WHATSAPP',
    descricao: 'WhatsApp comercial',
    tipo: 'texto',
    origem: 'pontos.whatsapp / contatos.telefone / empresas.telefone',
    resolver: 'ponto?.whatsapp || contato?.telefone || empresa?.telefone',
    obrigatorio: false,
    categoria: 'CADASTRO',
  },
  EMAIL: {
    nome: 'EMAIL',
    descricao: 'E-mail de contato principal',
    tipo: 'texto',
    origem: 'empresas.email / contatos.email / pontos.email',
    resolver: 'empresa?.email || contato?.email || ponto?.email',
    obrigatorio: false,
    categoria: 'CADASTRO',
  },
  INSTAGRAM: {
    nome: 'INSTAGRAM',
    descricao: 'Perfil do Instagram (@perfil)',
    tipo: 'texto',
    origem: 'empresas.instagram / pontos.instagram',
    resolver: 'empresa?.instagram || ponto?.instagram',
    obrigatorio: false,
    categoria: 'CADASTRO',
  },
  WEBSITE: {
    nome: 'WEBSITE',
    descricao: 'Website ou página institucional',
    tipo: 'texto',
    origem: 'empresas.website',
    resolver: 'empresa?.website',
    obrigatorio: false,
    categoria: 'CADASTRO',
  },

  // COMERCIAL
  DATA_INICIO: {
    nome: 'DATA_INICIO',
    descricao: 'Data de início de vigência / veiculação (DD/MM/AAAA)',
    tipo: 'data',
    origem: 'contratos.data_inicio',
    resolver: 'formatarData(contrato.data_inicio)',
    obrigatorio: true,
    categoria: 'COMERCIAL',
  },
  DATA_FIM: {
    nome: 'DATA_FIM',
    descricao: 'Data de término de vigência / veiculação (DD/MM/AAAA)',
    tipo: 'data',
    origem: 'contratos.data_fim',
    resolver: 'formatarData(contrato.data_fim)',
    obrigatorio: true,
    categoria: 'COMERCIAL',
  },
  DATA_INICIO_VEICULACAO: {
    nome: 'DATA_INICIO_VEICULACAO',
    descricao: 'Data de início de veiculação (DD/MM/AAAA)',
    tipo: 'data',
    origem: 'contratos.data_inicio',
    resolver: 'formatarData(contrato.data_inicio)',
    obrigatorio: false,
    categoria: 'COMERCIAL',
  },
  DATA_FIM_VEICULACAO: {
    nome: 'DATA_FIM_VEICULACAO',
    descricao: 'Data de término de veiculação (DD/MM/AAAA)',
    tipo: 'data',
    origem: 'contratos.data_fim',
    resolver: 'formatarData(contrato.data_fim)',
    obrigatorio: false,
    categoria: 'COMERCIAL',
  },
  PERIODO_VEICULACAO: {
    nome: 'PERIODO_VEICULACAO',
    descricao: 'Prazo / Período de veiculação acordado (ex: 12 meses)',
    tipo: 'texto',
    origem: 'propostas.periodo_veiculacao',
    resolver: 'proposta?.periodo_veiculacao',
    obrigatorio: false,
    categoria: 'COMERCIAL',
  },
  DIAS_SEMANA: {
    nome: 'DIAS_SEMANA',
    descricao: 'Dias da semana de exibição (ex: Segunda a Sábado)',
    tipo: 'texto',
    origem: 'pontos.dias_funcionamento / propostas.dias_semana',
    resolver: 'ponto?.dias_funcionamento || "Segunda a Sábado"',
    obrigatorio: false,
    categoria: 'COMERCIAL',
  },
  HORARIO_INICIO: {
    nome: 'HORARIO_INICIO',
    descricao: 'Horário diário de início da exibição (ex: 08:00)',
    tipo: 'texto',
    origem: 'pontos.horario_abertura',
    resolver: 'ponto?.horario_abertura || "08:00"',
    obrigatorio: false,
    categoria: 'COMERCIAL',
  },
  HORARIO_FIM: {
    nome: 'HORARIO_FIM',
    descricao: 'Horário diário de término da exibição (ex: 22:00)',
    tipo: 'texto',
    origem: 'pontos.horario_fechamento',
    resolver: 'ponto?.horario_fechamento || "22:00"',
    obrigatorio: false,
    categoria: 'COMERCIAL',
  },
  PACOTE_VEICULACAO: {
    nome: 'PACOTE_VEICULACAO',
    descricao: 'Nome do pacote / plano de veiculação comercial',
    tipo: 'texto',
    origem: 'propostas.pacote_veiculacao / propostas.plano',
    resolver: 'proposta?.pacote_veiculacao || proposta?.plano',
    obrigatorio: false,
    categoria: 'COMERCIAL',
  },
  QUANTIDADE_TELAS: {
    nome: 'QUANTIDADE_TELAS',
    descricao: 'Quantidade de telas / sistemas contratados',
    tipo: 'numero',
    origem: 'itens_contrato (somatório) / propostas.quantidade_telas',
    resolver: 'String(dados.quantidadeTelas)',
    obrigatorio: false,
    categoria: 'COMERCIAL',
  },
  QTD_TVS: {
    nome: 'QTD_TVS',
    descricao: 'Quantidade de TVs instaladas',
    tipo: 'numero',
    origem: 'propostas.qtd_tvs',
    resolver: 'String(proposta.qtd_tvs)',
    obrigatorio: false,
    categoria: 'COMERCIAL',
  },
  QTD_TOTENS: {
    nome: 'QTD_TOTENS',
    descricao: 'Quantidade de Totens instalados',
    tipo: 'numero',
    origem: 'propostas.qtd_totens',
    resolver: 'String(proposta.qtd_totens)',
    obrigatorio: false,
    categoria: 'COMERCIAL',
  },
  QTD_PAINEIS_LED: {
    nome: 'QTD_PAINEIS_LED',
    descricao: 'Quantidade de Painéis de LED instalados',
    tipo: 'numero',
    origem: 'propostas.qtd_paineis_led',
    resolver: 'String(proposta.qtd_paineis_led)',
    obrigatorio: false,
    categoria: 'COMERCIAL',
  },
  TOTAL_SISTEMAS: {
    nome: 'TOTAL_SISTEMAS',
    descricao: 'Total geral de sistemas de veiculação',
    tipo: 'numero',
    origem: 'itens_contrato (somatório)',
    resolver: 'String(dados.quantidadeTelas)',
    obrigatorio: false,
    categoria: 'COMERCIAL',
  },
  TITULO_CAMPANHA: {
    nome: 'TITULO_CAMPANHA',
    descricao: 'Título ou identificador da campanha de mídia',
    tipo: 'texto',
    origem: 'propostas.titulo_campanha',
    resolver: 'proposta?.titulo_campanha',
    obrigatorio: false,
    categoria: 'COMERCIAL',
  },

  // FINANCEIRO
  VALOR_MENSAL: {
    nome: 'VALOR_MENSAL',
    descricao: 'Valor da mensalidade do contrato (R$ formatado)',
    tipo: 'moeda',
    origem: 'contratos.valor_mensal',
    resolver: 'FORMATO_MOEDA.format(contrato.valor_mensal)',
    obrigatorio: false,
    categoria: 'FINANCEIRO',
  },
  VALOR_A_VISTA: {
    nome: 'VALOR_A_VISTA',
    descricao: 'Valor total à vista negociado',
    tipo: 'moeda',
    origem: 'propostas.valor_final',
    resolver: 'FORMATO_MOEDA.format(proposta.valor_final)',
    obrigatorio: false,
    categoria: 'FINANCEIRO',
  },
  DESCONTO: {
    nome: 'DESCONTO',
    descricao: 'Valor de desconto concedido',
    tipo: 'moeda',
    origem: 'propostas.desconto',
    resolver: 'FORMATO_MOEDA.format(proposta.desconto)',
    obrigatorio: false,
    categoria: 'FINANCEIRO',
  },
  ENTRADA: {
    nome: 'ENTRADA',
    descricao: 'Valor de entrada pago pelo contratante',
    tipo: 'moeda',
    origem: 'propostas.entrada',
    resolver: 'FORMATO_MOEDA.format(proposta.entrada)',
    obrigatorio: false,
    categoria: 'FINANCEIRO',
  },
  NUMERO_PARCELAS: {
    nome: 'NUMERO_PARCELAS',
    descricao: 'Número total de parcelas do plano',
    tipo: 'numero',
    origem: 'propostas.numero_parcelas',
    resolver: 'String(proposta.numero_parcelas)',
    obrigatorio: false,
    categoria: 'FINANCEIRO',
  },
  PARCELAMENTO_CARTAO: {
    nome: 'PARCELAMENTO_CARTAO',
    descricao: 'Detalhamento do parcelamento via cartão de crédito',
    tipo: 'texto',
    origem: 'propostas.parcelamento_cartao',
    resolver: 'proposta?.parcelamento_cartao',
    obrigatorio: false,
    categoria: 'FINANCEIRO',
  },
  VALOR_POR_SISTEMA: {
    nome: 'VALOR_POR_SISTEMA',
    descricao: 'Valor individual por sistema instalado',
    tipo: 'moeda',
    origem: 'propostas.valor_por_sistema',
    resolver: 'FORMATO_MOEDA.format(proposta.valor_por_sistema)',
    obrigatorio: false,
    categoria: 'FINANCEIRO',
  },
  FORMA_PAGAMENTO: {
    nome: 'FORMA_PAGAMENTO',
    descricao: 'Forma de pagamento (PIX, Boleto, Cartão de Crédito)',
    tipo: 'texto',
    origem: 'contratos.forma_pagamento',
    resolver: 'contrato?.forma_pagamento',
    obrigatorio: false,
    categoria: 'FINANCEIRO',
  },
  DATA_VENCIMENTO_PRIMEIRA_FATURA: {
    nome: 'DATA_VENCIMENTO_PRIMEIRA_FATURA',
    descricao: 'Data de vencimento da primeira fatura (DD/MM/AAAA)',
    tipo: 'data',
    origem: 'propostas.data_vencimento_primeira',
    resolver: 'formatarData(proposta.data_vencimento_primeira)',
    obrigatorio: false,
    categoria: 'FINANCEIRO',
  },

  // DERIVADO
  LOCAL_ASSINATURA: {
    nome: 'LOCAL_ASSINATURA',
    descricao: 'Local da assinatura no formato "Cidade / UF" (ex: Caruaru / PE)',
    tipo: 'texto',
    origem: 'empresas.cidade + empresas.estado ou pontos.cidade + pontos.estado',
    resolver: '${cidade} / ${uf}',
    obrigatorio: false,
    categoria: 'DERIVADO',
  },
  DATA_ASSINATURA: {
    nome: 'DATA_ASSINATURA',
    descricao: 'Data da assinatura por extenso no fuso America/Sao_Paulo (ex: 05 de setembro de 2026)',
    tipo: 'data',
    origem: 'Data do sistema em America/Sao_Paulo (pt-BR)',
    resolver: 'formatarDataExtensa(new Date())',
    obrigatorio: false,
    categoria: 'DERIVADO',
  },
  FORO_COMARCA: {
    nome: 'FORO_COMARCA',
    descricao: 'Foro da comarca eleita para resolução de controvérsias',
    tipo: 'texto',
    origem: 'Cidade do estabelecimento ou Caruaru',
    resolver: 'cidade || "Caruaru"',
    obrigatorio: false,
    categoria: 'DERIVADO',
  },

  // SISTEMA
  NUMERO_CONTRATO: {
    nome: 'NUMERO_CONTRATO',
    descricao: 'Código identificador operacional do contrato',
    tipo: 'texto',
    origem: 'contratos.numero_contrato',
    resolver: 'contrato.numero_contrato',
    obrigatorio: false,
    categoria: 'SISTEMA',
  },
  VERSAO_CONTRATO: {
    nome: 'VERSAO_CONTRATO',
    descricao: 'Versão numérica do contrato',
    tipo: 'numero',
    origem: 'contratos.versao_atual',
    resolver: 'String(contrato.versao_atual)',
    obrigatorio: false,
    categoria: 'SISTEMA',
  },
  TIPO_CONTRATO: {
    nome: 'TIPO_CONTRATO',
    descricao: 'Tipo/Categoria do contrato (ANUNCIANTE, PARCEIRO, GESTOR)',
    tipo: 'texto',
    origem: 'contratos.tipo_contrato',
    resolver: 'contrato.tipo_contrato',
    obrigatorio: false,
    categoria: 'SISTEMA',
  },

  // MANUAL
  ASSINATURA_SOBRE_MIDIA: {
    nome: 'ASSINATURA_SOBRE_MIDIA',
    descricao: 'Espaço / Selo da assinatura SOBRE MÍDIA',
    tipo: 'texto',
    origem: 'Assinador digital',
    resolver: '""',
    obrigatorio: false,
    categoria: 'MANUAL',
  },
  ASSINATURA_CONTRATANTE: {
    nome: 'ASSINATURA_CONTRATANTE',
    descricao: 'Espaço / Selo da assinatura do Contratante',
    tipo: 'texto',
    origem: 'Assinador digital',
    resolver: '""',
    obrigatorio: false,
    categoria: 'MANUAL',
  },
  ASSINATURA_PARCEIRO: {
    nome: 'ASSINATURA_PARCEIRO',
    descricao: 'Espaço / Selo da assinatura do Parceiro',
    tipo: 'texto',
    origem: 'Assinador digital',
    resolver: '""',
    obrigatorio: false,
    categoria: 'MANUAL',
  },
};

/**
 * Detecta todos os placeholders no padrão {{NOME_DO_CAMPO}} dentro do HTML do template.
 */
export function detectarPlaceholders(templateHtml: string): string[] {
  if (!templateHtml) return [];
  const matches = [...templateHtml.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)];
  return [...new Set(matches.map((m) => m[1]))];
}

export interface ValidacaoPlaceholdersResultado {
  valido: boolean;
  erros: string[];
  placeholdersEncontrados: string[];
  placeholdersDesconhecidos: string[];
  placeholdersValidos: string[];
}

/**
 * Valida os placeholders do template contra o catálogo canônico.
 * Se houver tokens não catalogados, retorna valido = false com lista descritiva de erros.
 */
export function validarPlaceholdersTemplate(templateHtml: string): ValidacaoPlaceholdersResultado {
  const encontrados = detectarPlaceholders(templateHtml);
  const desconhecidos: string[] = [];
  const validos: string[] = [];
  const erros: string[] = [];

  for (const ph of encontrados) {
    if (PLACEHOLDER_CATALOG[ph]) {
      validos.push(ph);
    } else {
      desconhecidos.push(ph);
      erros.push(`Campo de contrato não reconhecido ou sem origem configurada: {{${ph}}}`);
    }
  }

  return {
    valido: desconhecidos.length === 0,
    erros,
    placeholdersEncontrados: encontrados,
    placeholdersDesconhecidos: desconhecidos,
    placeholdersValidos: validos,
  };
}

/**
 * Campos OBRIGATÓRIOS por tipo de contrato.
 * Ausência bloqueia geração com mensagem técnica clara.
 */
const CAMPOS_OBRIGATORIOS: Record<'ANUNCIANTE' | 'PARCEIRO' | 'GESTOR', string[]> = {
  ANUNCIANTE: ['RAZAO_SOCIAL', 'CNPJ', 'DATA_INICIO', 'DATA_FIM'],
  PARCEIRO:   ['RAZAO_SOCIAL', 'DATA_INICIO', 'DATA_FIM'],
  GESTOR:     ['NOME_GESTOR', 'CPF_CNPJ', 'DATA_INICIO', 'DATA_FIM'],
};

export const CANONICAL_TEMPLATE_HTML_ANUNCIANTE = `<div class="contract-container" style="font-family: Arial, sans-serif; font-size: 12px; line-height: 1.45; color: #111827;">
  <div style="text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 8px; margin-bottom: 14px;">
    <p style="margin: 0; font-size: 11px; font-weight: bold; color: #1e3a8a;">SOBRE MÍDIA DESIGNER, Av. Agamenon Magalhães, 1019 - Maurício de Nassau, Caruaru - PE, CEP 55012-140</p>
    <p style="margin: 2px 0; font-size: 11px; color: #4b5563;">Tel: (81) 99884-4677 | E-mail: sobremidiadesigner@gmail.com | Site: www.sobremidiadesigner.com.br</p>
    <h3 style="margin: 8px 0 0; font-size: 14px; color: #111827; font-weight: bold; text-transform: uppercase;">CONTRATO DE SERVIÇO E VEICULAÇÃO DE PUBLICIDADE POR MEIO DIGITAL EM MÍDIA INDOOR – SOBRE MÍDIA DESIGNER</h3>
  </div>

  <div style="margin-bottom: 12px; background-color: #f9fafb; padding: 10px; border-radius: 4px; border: 1px solid #e5e7eb;">
    <h4 style="margin: 0 0 6px; font-size: 12px; font-weight: bold; color: #1e3a8a;">DADOS DO CONTRATANTE - ESTABELECIMENTO COMERCIAL</h4>
    <table style="width: 100%; font-size: 11px; border-collapse: collapse; margin-bottom: 8px;">
      <tr>
        <td style="padding: 2px 0; width: 50%;"><strong>Nome/Razão Social:</strong> {{RAZAO_SOCIAL}}</td>
        <td style="padding: 2px 0; width: 50%;"><strong>Responsável:</strong> {{RESPONSAVEL}}</td>
      </tr>
      <tr>
        <td style="padding: 2px 0;"><strong>CPF/CNPJ:</strong> {{CNPJ}}</td>
        <td style="padding: 2px 0;"><strong>Endereço:</strong> {{ENDERECO_UNIDADE}}</td>
      </tr>
      <tr>
        <td style="padding: 2px 0;"><strong>Bairro:</strong> {{BAIRRO}}</td>
        <td style="padding: 2px 0;"><strong>Cidade/UF:</strong> {{CIDADE}} / {{UF}}</td>
      </tr>
      <tr>
        <td style="padding: 2px 0;"><strong>CEP:</strong> {{CEP}}</td>
        <td style="padding: 2px 0;"><strong>E-mail:</strong> {{EMAIL}}</td>
      </tr>
      <tr>
        <td style="padding: 2px 0;" colspan="2"><strong>Instagram / Website:</strong> {{INSTAGRAM}} {{WEBSITE}}</td>
      </tr>
    </table>

    <h4 style="margin: 8px 0 6px; font-size: 12px; font-weight: bold; color: #1e3a8a; border-top: 1px solid #e5e7eb; padding-top: 6px;">DADOS DO CONTRATADO - SOBRE MÍDIA DESIGNER</h4>
    <table style="width: 100%; font-size: 11px; border-collapse: collapse;">
      <tr>
        <td style="padding: 2px 0; width: 50%;"><strong>Nome/Razão Social:</strong> Sobre Mídia Designer</td>
        <td style="padding: 2px 0; width: 50%;"><strong>Responsável:</strong> Jairan Santos</td>
      </tr>
      <tr>
        <td style="padding: 2px 0;"><strong>CPF/CNPJ:</strong> 44.899.400/0002-57</td>
        <td style="padding: 2px 0;"><strong>Endereço:</strong> Av. Agamenon Magalhães, Nº 1019</td>
      </tr>
      <tr>
        <td style="padding: 2px 0;"><strong>Bairro:</strong> Maurício de Nassau</td>
        <td style="padding: 2px 0;"><strong>Cidade/UF:</strong> Caruaru / PE</td>
      </tr>
      <tr>
        <td style="padding: 2px 0;"><strong>CEP:</strong> 55012-140</td>
        <td style="padding: 2px 0;"><strong>E-mail:</strong> sobremidiadesigner@gmail.com</td>
      </tr>
      <tr>
        <td style="padding: 2px 0;" colspan="2"><strong>Instagram / Website:</strong> @sobremidiadesigner | www.sobremidiadesigner.com.br</td>
      </tr>
    </table>
  </div>

  <div style="margin-bottom: 10px;">
    <p style="text-align: justify; margin: 0 0 8px; font-size: 11.5px;">Pelo presente instrumento as partes acima identificadas têm, entre si, justo e acertado o presente contrato de serviço de marketing visual e publicidade digital em monitores de Mídia indoor que se regerá pelas cláusulas seguintes.</p>
  </div>

  <div style="margin-bottom: 10px;">
    <h4 style="margin: 0 0 4px; font-size: 12px; font-weight: bold; color: #1e3a8a;">CLÁUSULA 01 - NOSSO SERVIÇO</h4>
    <p style="text-align: justify; margin: 0;">O serviço oferecido pela SOBRE MÍDIA DESIGNER é anúncios publicitários na forma de vídeos e stories animados em 3D de alta qualidade em uma rede de telas de LED TVS ou TOTEM, visando locais estratégicos com grande fluxo de pessoas como: lotéricas, padarias, restaurantes, hotéis, clínicas, farmácias, etc. Impactando diretamente os consumidores da região de interesse do anunciante, oferecemos o serviço de publicidade exclusiva que apresenta vídeos apenas do cliente em seu próprio estabelecimento construindo uma marca forte e comunicativa, visando prender a atenção do seu cliente e do seu provável cliente. O contratante também tem a possibilidade de usar apenas o nosso sistema em sua TELA ou TV, sendo assim ciente por essa cláusula o mesmo aceita e concorda que passará stories, vídeos, fotos e anúncios de outros estabelecimentos da região em suas telas. Ao concordar, o seu comercial, fotos e vídeos também passará em outros estabelecimentos da sua cidade, construindo uma marca forte e comunicativa em parceria com a SOBRE MÍDIA DESIGNER.</p>
  </div>

  <div style="margin-bottom: 10px;">
    <h4 style="margin: 0 0 4px; font-size: 12px; font-weight: bold; color: #1e3a8a;">CLÁUSULA 02 - SISTEMA INTELIGENTE</h4>
    <p style="text-align: justify; margin: 0;">Nossas TELAS e TOTEM têm a função inteligente, ligando no horário de abertura do seu estabelecimento e desligando ao término da jornada de trabalho, tudo automatizado pelo nosso sistema. A automação inteligente reduz os desgastes dos aparelhos e a demanda de manutenções no local, sendo responsabilidade da empresa contratada a rever, reparar e resolver ocorrências em até 72 horas se caso preciso.</p>
  </div>

  <div style="margin-bottom: 10px;">
    <h4 style="margin: 0 0 4px; font-size: 12px; font-weight: bold; color: #1e3a8a;">CLÁUSULA 03 - NOSSO CONTEÚDO</h4>
    <p style="text-align: justify; margin: 0;">Criamos roteiros de vídeos e imagens pensado no seu estabelecimento com qualidade e clareza nas informações que é passada, o conteúdo apresentado na suas telas são estratégias validadas e que trazem retorno visíveis para sua empresa. Fica ciente o contratante que conteúdos externos produzido por terceiros ou por si próprio é de sua total responsabilidade. A empresa contratada não se responsabiliza e não garante fluidez e qualidade nos conteúdos que é fornecidos. NÃO ACEITAMOS IMAGENS EXPLÍCITAS, CONTEÚDOS COM BAIXA VISIBILIDADE OU JOGOS e/ou APOSTAS.</p>
  </div>

  <div style="margin-bottom: 10px;">
    <h4 style="margin: 0 0 4px; font-size: 12px; font-weight: bold; color: #1e3a8a;">CLÁUSULA 04 - PLANO EXCLUSIVO</h4>
    <p style="text-align: justify; margin: 0;">No plano exclusivo o contratante recebe 10 mídias grátis podendo rodar até 30 mídias exclusivas de até 30 segundos cada, fazendo o ciclo de 15 minutos. O contratante tem o poder de montar sua grade de anúncios do jeito que preferir, seja mostrando novos produtos ou destacando promoções relevantes. O marketing visual exclusivo trabalhado da forma certa tem a função de despertar o desejo das pessoas e quase sempre o instinto humano vai querer vivenciar aquilo que está sendo mostrado na tela, a mídia gera uma conexão e sugere algo que não se encontra em qualquer lugar. Fica a critério do contratante rodar anúncios de notícias, esportes, hora certa e clima da região.</p>
  </div>

  <div style="margin-bottom: 10px;">
    <h4 style="margin: 0 0 4px; font-size: 12px; font-weight: bold; color: #1e3a8a;">CLÁUSULA 05 - PLANO SISTEMA</h4>
    <p style="text-align: justify; margin: 0;">No plano sistema o contratante recebe apenas 5 mídias grátis podendo rodar até 8 mídias exclusivas de até 30 segundos cada, fazendo o ciclo de 2:40 minutos. No plano sistema o contratante é incluso no grupo de anunciantes da região permitindo assim rodar anúncios de outros estabelecimentos em suas telas. ESSE CASO NÃO SE APLICA AOS SEUS CONCORRENTES DIRETO.</p>
  </div>

  <div style="margin-bottom: 10px;">
    <h4 style="margin: 0 0 4px; font-size: 12px; font-weight: bold; color: #1e3a8a;">CLÁUSULA 06 - RESPONSABILIDADE DO CONTRATANTE</h4>
    <p style="text-align: justify; margin: 0;">Nossos aparelhos são novos e sempre revisados, a nossa responsabilidade é garantir a fluidez e o bom funcionamento dos equipamentos fornecidos. Nosso kit contém: tela de LCD ou TVs acompanhado de um mine computador portátil e quase sempre uma moldura personalizada da loja. É dever do contratante/responsável informar possíveis problemas de tela desligada, tela sem exibir vídeos ou programações desatualizadas. O responsável pelo local tem a obrigação de manter todas as TELAS, MONITORES e TOTENS sempre ligados. A integridade desses aparelhos dentro do estabelecimento é de suma responsabilidade do contratante. Se constatado mau uso sobre os aparelhos o estabelecimento será prontamente notificado.</p>
  </div>

  <div style="margin-bottom: 10px;">
    <h4 style="margin: 0 0 4px; font-size: 12px; font-weight: bold; color: #1e3a8a;">CLÁUSULA 07 - CONDIÇÕES DE PAGAMENTOS</h4>
    <p style="text-align: justify; margin: 0;">Toda véspera do vencimento de fatura o contratante receberá uma notificação por E-mail, WhatsApp e SMS contendo todas as formas de pagamentos, incluindo CHAVE PIX, QRCODE ou BOLETO com vencimento em até 3 dias úteis. Diante do não pagamento na data prevista será acrescido juros de mora de 0,13% (treze centavos) ao dia sobre o valor total do débito calculado da data do vencimento até a data do efetivo pagamento. Multa moratória de 2% (dois por cento) calculada sobre o valor do débito, cobrada de uma única vez.</p>
  </div>

  <div style="margin-bottom: 10px;">
    <h4 style="margin: 0 0 4px; font-size: 12px; font-weight: bold; color: #1e3a8a;">CLÁUSULA 08 - RENOVAÇÃO DE CONTRATO</h4>
    <p style="text-align: justify; margin: 0;">Esse presente contrato de publicidade digital representado pelas partes jurídica/Física poderá ser prorrogado automaticamente na ausência de manifestação do contratante. Tendo previsto o cancelamento do seguinte contrato, é obrigatório a notificação com antecedência mínima de 30 (trinta) dias antes do vencimento por e-mail ou WhatsApp.</p>
  </div>

  <div style="margin-bottom: 10px;">
    <h4 style="margin: 0 0 4px; font-size: 12px; font-weight: bold; color: #1e3a8a;">CLÁUSULA 09 - RESCISÃO CONTRATUAL</h4>
    <p style="text-align: justify; margin: 0;">As partes poderão rescindir o presente contrato a qualquer momento, desde que seja cumprida pelo menos 50% do contrato firmado. Assim o contratado não perde por completo o investimento pensando no ponto referido. Em caso de QUEBRA DE CONTRATO subsequente a contratação ou sem o cumprimento dos 50% do referido contrato, será cobrado 25% do valor da mensalidade sobre os meses restantes. Em caso de cancelamento, o PARCEIRO se compromete a saldar e liquidar, eventuais débitos e pendências existentes e vencidas, no prazo máximo de 30 dias. Fica ciente o contratante que ao término do contrato todos os aparelhos fornecidos pela Sobre Mídia Designer serão devolvidos em perfeitas condições assim como foram instalados.</p>
  </div>

  <div style="margin-bottom: 10px; background-color: #f8fafc; padding: 8px; border-radius: 4px; border: 1px solid #e2e8f0;">
    <h4 style="margin: 0 0 4px; font-size: 12px; font-weight: bold; color: #1e3a8a;">POLÍTICA DE PRIVACIDADE</h4>
    <p style="text-align: justify; margin: 0; font-size: 11px;">Os dados fornecidos através do nosso cadastro serão utilizados unicamente para a elaboração de contrato. Não divulgamos ou utilizamos os dados fornecidos para qualquer outra finalidade sem a sua autorização. Nós da SOBRE MÍDIA DESIGNER temos como princípio a discrição, o respeito e o profissionalismo com nossos clientes.</p>
  </div>

  <div style="margin-bottom: 12px; border: 1px solid #d1d5db; padding: 8px 10px; border-radius: 4px; background-color: #f8fafc;">
    <h4 style="margin: 0 0 6px; font-size: 12px; font-weight: bold; color: #1e3a8a;">GRADE DE HORÁRIOS, VEICULAÇÃO E PAGAMENTO</h4>
    <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
      <tr>
        <td style="padding: 2px 4px; font-weight: bold; width: 35%;">Campanha / Identificação:</td>
        <td style="padding: 2px 4px;">{{TITULO_CAMPANHA}}</td>
      </tr>
      <tr>
        <td style="padding: 2px 4px; font-weight: bold;">Período de Veiculação:</td>
        <td style="padding: 2px 4px;">De {{DATA_INICIO}} a {{DATA_FIM}} ({{PERIODO_VEICULACAO}})</td>
      </tr>
      <tr>
        <td style="padding: 2px 4px; font-weight: bold;">Dias da Semana:</td>
        <td style="padding: 2px 4px;">{{DIAS_SEMANA}}</td>
      </tr>
      <tr>
        <td style="padding: 2px 4px; font-weight: bold;">Horário de Funcionamento:</td>
        <td style="padding: 2px 4px;">{{HORARIO_INICIO}} às {{HORARIO_FIM}}</td>
      </tr>
      <tr>
        <td style="padding: 2px 4px; font-weight: bold;">Pacote de Veiculação:</td>
        <td style="padding: 2px 4px;">{{PACOTE_VEICULACAO}}</td>
      </tr>
      <tr>
        <td style="padding: 2px 4px; font-weight: bold;">Quantidade de Telas / Sistemas:</td>
        <td style="padding: 2px 4px;">{{QUANTIDADE_TELAS}} sistema(s)</td>
      </tr>
      <tr>
        <td style="padding: 2px 4px; font-weight: bold;">Valor Mensal:</td>
        <td style="padding: 2px 4px;">{{VALOR_MENSAL}}</td>
      </tr>
      <tr>
        <td style="padding: 2px 4px; font-weight: bold;">Forma de Pagamento:</td>
        <td style="padding: 2px 4px;">{{FORMA_PAGAMENTO}}</td>
      </tr>
    </table>
  </div>

  <div style="margin-bottom: 16px;">
    <p style="text-align: justify; margin: 0 0 8px; font-size: 11px;">Autorizo a veiculação de material publicitário pelo prazo acima descrito, declarando que os arquivos e imagens foram conferidos e autorizados.</p>
    <p style="text-align: center; margin: 0 0 16px;">Local: {{LOCAL_ASSINATURA}}, Data: {{DATA_ASSINATURA}}</p>
    
    <div style="display: flex; justify-content: space-between; margin-top: 20px; padding-top: 14px;">
      <div style="width: 45%; text-align: center; border-top: 1px solid #111827; padding-top: 4px;">
        <p style="margin: 0; font-weight: bold; font-size: 11px;">SOBRE MÍDIA DESIGNER</p>
      </div>
      <div style="width: 45%; text-align: center; border-top: 1px solid #111827; padding-top: 4px;">
        <p style="margin: 0; font-weight: bold; font-size: 11px;">{{RAZAO_SOCIAL}} (CONTRATANTE)</p>
      </div>
    </div>
  </div>
</div>`;

export const CANONICAL_TEMPLATE_HTML_PARCEIRO = `<div class="contract-container" style="font-family: Arial, sans-serif; font-size: 12px; line-height: 1.45; color: #111827;">
  <div style="text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 8px; margin-bottom: 14px;">
    <p style="margin: 0; font-size: 11px; font-weight: bold; color: #1e3a8a;">SOBRE MÍDIA DESIGNER, Rua 17 de Dezembro, n°38 – CENTRO - Cachoerinha/PE, CEP 55380-000</p>
    <p style="margin: 2px 0; font-size: 11px; color: #4b5563;">Tel: (81) 94862-5948 | E-mail: sobremidiadesigner@gmail.com | Site: www.sobremidiadesigner.my.canva.site/tvcorporativa</p>
    <h3 style="margin: 8px 0 0; font-size: 14px; color: #111827; font-weight: bold; text-transform: uppercase;">CONTRATO DE PARCERIA ENTRE SOBRE MÍDIA &amp; ESTABELECIMENTO PARCEIRO</h3>
  </div>

  <div style="margin-bottom: 12px; background-color: #f9fafb; padding: 10px; border-radius: 4px; border: 1px solid #e5e7eb;">
    <h4 style="margin: 0 0 6px; font-size: 12px; font-weight: bold; color: #1e3a8a;">DADOS DO CONTRATANTE – AGÊNCIA DE MÍDIA</h4>
    <table style="width: 100%; font-size: 11px; border-collapse: collapse; margin-bottom: 8px;">
      <tr>
        <td style="padding: 2px 0; width: 50%;"><strong>Nome/Razão Social:</strong> Sobre Mídia Designer</td>
        <td style="padding: 2px 0; width: 50%;"><strong>Responsável:</strong> Jairan Santos</td>
      </tr>
      <tr>
        <td style="padding: 2px 0;"><strong>CPF/CNPJ:</strong> 18.141.748/0001-70</td>
        <td style="padding: 2px 0;"><strong>E-mail:</strong> sobremidiadesigner@gmail.com</td>
      </tr>
      <tr>
        <td style="padding: 2px 0;"><strong>Endereço:</strong> Av. Agamenon Magalhães, Nº 1019</td>
        <td style="padding: 2px 0;"><strong>Bairro:</strong> Maurício de Nassau</td>
      </tr>
      <tr>
        <td style="padding: 2px 0;"><strong>Cidade:</strong> Caruaru</td>
        <td style="padding: 2px 0;"><strong>UF:</strong> PE</td>
      </tr>
      <tr>
        <td style="padding: 2px 0;" colspan="2"><strong>Website:</strong> www.sobremidiadesigner.com.br</td>
      </tr>
    </table>

    <h4 style="margin: 8px 0 6px; font-size: 12px; font-weight: bold; color: #1e3a8a; border-top: 1px solid #e5e7eb; padding-top: 6px;">DADOS DA CONTRATADA - ESTABELECIMENTO PARCEIRO</h4>
    <table style="width: 100%; font-size: 11px; border-collapse: collapse;">
      <tr>
        <td style="padding: 2px 0; width: 50%;"><strong>Nome/Razão Social:</strong> {{RAZAO_SOCIAL}}</td>
        <td style="padding: 2px 0; width: 50%;"><strong>Responsável:</strong> {{RESPONSAVEL}}</td>
      </tr>
      <tr>
        <td style="padding: 2px 0;"><strong>CPF/CNPJ:</strong> {{CNPJ}}</td>
        <td style="padding: 2px 0;"><strong>Contato:</strong> {{TELEFONE}} / {{WHATSAPP}}</td>
      </tr>
      <tr>
        <td style="padding: 2px 0;"><strong>Endereço:</strong> {{ENDERECO_UNIDADE}}</td>
        <td style="padding: 2px 0;"><strong>Bairro:</strong> {{BAIRRO}}</td>
      </tr>
      <tr>
        <td style="padding: 2px 0;"><strong>Cidade:</strong> {{CIDADE}}</td>
        <td style="padding: 2px 0;"><strong>UF:</strong> {{UF}}</td>
      </tr>
      <tr>
        <td style="padding: 2px 0;"><strong>E-mail:</strong> {{EMAIL}}</td>
        <td style="padding: 2px 0;"><strong>Instagram:</strong> {{INSTAGRAM}}</td>
      </tr>
    </table>
  </div>

  <div style="margin-bottom: 10px;">
    <p style="text-align: justify; margin: 0 0 8px; font-size: 11.5px;">As partes acima identificadas têm, entre si, justo e acertado o Presente Contrato De Parceria Entre SOBRE MÍDIA DESIGNER e EMPRESA PARCEIRA, que se regerá pelas cláusulas seguintes.</p>
  </div>

  <div style="margin-bottom: 10px;">
    <h4 style="margin: 0 0 4px; font-size: 12px; font-weight: bold; color: #1e3a8a;">CLÁUSULA 01 – DO OBJETO</h4>
    <p style="text-align: justify; margin: 0;">O objeto do presente Contrato é a PARCERIA ENTRE A SOBRE MÍDIA E ESTABELECIMENTO COMERCIAL referente à instalação de um tela/monitor de mídia e um mini PC portátil, oferecido pela SOBRE MÍDIA ou monitor cedido pela CONTRATADA.</p>
  </div>

  <div style="margin-bottom: 10px;">
    <h4 style="margin: 0 0 4px; font-size: 12px; font-weight: bold; color: #1e3a8a;">CLÁUSULA 02 - SERVIÇOS REALIZADOS PELA SOBRE MÍDIA:</h4>
    <p style="text-align: justify; margin: 0;">O GESTOR DE MÍDIA, prospectara no comercio local, empresas que tenham interesse em anunciar e comunicar a sua marca, serviço ou produto nas TELAS E MONITORES DE MIDIA, instalado no estabelecimento comercial PARCEIRO, desde que o mesmo não se sinta prejudicado e não passe anúncios de seus concorrentes.</p>
  </div>

  <div style="margin-bottom: 10px;">
    <h4 style="margin: 0 0 4px; font-size: 12px; font-weight: bold; color: #1e3a8a;">CLÁUSULA 03 - OBRIGAÇÕES DO ESTABELECIMENTO PARCEIRO</h4>
    <p style="text-align: justify; margin: 0 0 4px;">O PARCEIRO deverá ceder o espaço em seu estabelecimento comercial onde será instalado as telas e monitores oferecida pelo SOBRE MÍDIA, devendo manter a tela ligada durante todo o período combinado no quadro abaixo: O PARCEIRO fica expressamente proibido de sintonizar a tela em outras programações daquela que lhe foi acordado.</p>
    <p style="text-align: justify; margin: 0 0 4px;"><strong>03. 1 -</strong> A internet será de responsabilidade do PARCEIRO.</p>
    <p style="text-align: justify; margin: 0 0 6px;"><strong>03. 2 -</strong> A energia elétrica é fornecida pelo PARCEIRO. Em troca, o ESTABELECIMENTO terá a gestão e o gerenciamento completo de mídias e conteúdos de comunicação visual totalmente gratuitos até o término do vigente contrato.</p>
    
    <div style="margin: 6px 0; border: 1px solid #d1d5db; padding: 6px 10px; border-radius: 4px; background-color: #f8fafc;">
      <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
        <tr>
          <td style="padding: 3px 6px; font-weight: bold; width: 35%;">Dias da Semana de veiculação:</td>
          <td style="padding: 3px 6px;">{{DIAS_SEMANA}}</td>
        </tr>
        <tr>
          <td style="padding: 3px 6px; font-weight: bold;">Faixa de horários diária:</td>
          <td style="padding: 3px 6px;">{{HORARIO_INICIO}} às {{HORARIO_FIM}}</td>
        </tr>
        <tr>
          <td style="padding: 3px 6px; font-weight: bold;">Dados do período de veiculação:</td>
          <td style="padding: 3px 6px;">De {{DATA_INICIO}} a {{DATA_FIM}}</td>
        </tr>
        <tr>
          <td style="padding: 3px 6px; font-weight: bold;">Quantidade de Telas / Monitores:</td>
          <td style="padding: 3px 6px;">{{QUANTIDADE_TELAS}} tela(s)</td>
        </tr>
      </table>
    </div>

    <p style="text-align: justify; margin: 4px 0;"><strong>03. 3 -</strong> É dever do ESTABELECIMENTO PARCEIRO informar a SOBRE MÍDIA sobre possíveis problemas, como: tela desligada, tela sem exibir vídeo, programações desatualizadas, dentre outros problemas que afetem a exibição da programação.</p>
    <p style="text-align: justify; margin: 4px 0 0;"><strong>03. 4 -</strong> O ESTABELECIMENTO PARCEIRO fica expressamente impedido de interferir de qualquer forma nas telas e demais equipamentos instalados pela SOBRE MÍDIA em seu estabelecimento, devendo zelar pela segurança dos equipamentos, como se fossem seus, durante a vigência do presente contrato.</p>
  </div>

  <div style="margin-bottom: 10px;">
    <h4 style="margin: 0 0 4px; font-size: 12px; font-weight: bold; color: #1e3a8a;">CLÁUSULA 04 - OBRIGAÇÕES DO GESTOR DE MÍDIA</h4>
    <p style="text-align: justify; margin: 0 0 4px;">A comercialização de espaços publicitários é de inteira responsabilidade da SOBRE MÍDIA e/ou seus parceiros, respeitando as regras do estabelecimento bem como as cláusulas estabelecidas no presente instrumento.</p>
    <p style="text-align: justify; margin: 0 0 4px;"><strong>4.1 -</strong> O GESTOR DE MÍDIA monitorará o funcionamento dos equipamentos instalados nas dependências do estabelecimento comercial do PARCEIRO , verificando registros de ocorrências e SOLUCIONANDO OS PROBLEMAS e intervindo remotamente quando necessário, para correções no software e no conteúdo executado em cada MONITOR .</p>
    <p style="text-align: justify; margin: 0 0 4px;"><strong>4.2 -</strong> A titularidade do software de controle de mídia, bem como todos os direitos dela decorrentes, será de responsabilidade da SOBRE MÍDIA , estando o PARCEIRO e seus colaboradores, expressamente proibidos de manusear, copiar ou fornecer a terceiros quaisquer informações relativas ao software.</p>
    <p style="text-align: justify; margin: 0;"><strong>4.3 -</strong> A comercialização de espaços de mídia será de responsabilidade da SOBRE MÍDIA, respeitando as condições previstas do estabelecimento: • É proibido apresentar conteúdo de cunho, ideológico, exploração sexual ou preconceituoso; • Não constranger os clientes com conteúdo sexual, racista ou sexista; • Respeitar a legislação vigente, seja no que diz respeito à propriedade intelectual e aos direitos autorais de conteúdos audiovisuais, seja no que diz respeito à outras normas e leis vigentes.</p>
  </div>

  <div style="margin-bottom: 10px;">
    <h4 style="margin: 0 0 4px; font-size: 12px; font-weight: bold; color: #1e3a8a;">CLÁUSULA 05 – GRADE DE PROGRAMAÇÃO</h4>
    <p style="text-align: justify; margin: 0;">Na grade de programação a SOBRE MÍDIA cederá espaço nas telas entorno da cidade e nos pontos onde a SOBRE MÍDIA possui uma ou mais telas ou monitores, veiculando seu anúncio de até 30 seg dentro de outros estabelecimentos comerciais, aumentando a sua visibilidade em nossa região e garantindo a entrega de suas mídis e conteúdos sem custos. A inserção das mídias será de responsabilidade do GESTOR DE MÍDIA.</p>
  </div>

  <div style="margin-bottom: 10px;">
    <h4 style="margin: 0 0 4px; font-size: 12px; font-weight: bold; color: #1e3a8a;">CLÁUSULA 06 - VIGÊNCIA E RESCISÃO</h4>
    <p style="text-align: justify; margin: 0 0 4px;">A vigência deste contrato iniciará no momento em que o operador instalar as telas no estabelecimento do PARCEIRO e vigorará pelo prazo de 6 meses com renovação automática para 12 meses se não houver comunicação ou desistência de ambas as partes. caso haja uma comunicação expressa por qualquer uma das partes para desistência ou quebra de contrato por qualquer motivo elencado nesta cláusula, ficará o ESTABELECIMENTO PARCEIRO automaticamente proibido de utilizar o software, produtos e outros equipamentos que sejam de titularidade da SOBRE MÍDIA , bem como, o GESTOR DE MÍDIA ficará automaticamente impedido de utilizar o nome do PARCEIRO no seu portfólio de clientes.</p>
    <p style="text-align: justify; margin: 0 0 4px;"><strong>6.1 -</strong> O presente contrato poderá ser rescindido mediante SOLICITAÇÃO EXPRESSA de uma das partes com o prazo mínimo de 30 (trinta) dias de antecedência. casos:</p>
    <p style="text-align: justify; margin: 0 0 4px; padding-left: 12px;"><strong>A)</strong> Quando qualquer uma das partes não tenha mais interesse na continuidade do contrato, devendo comunicar prévia e formalmente à outra parte, agendando a data e hora desejada de seu desligamento e devolução/ retirada dos equipamentos;</p>
    <p style="text-align: justify; margin: 0 0 4px; padding-left: 12px;"><strong>B)</strong> pelo descumprimento de qualquer das cláusulas previstas neste contrato; pelo ajuizamento de qualquer ação, contra uma parte, que venha a afetar a sua credibilidade ou idoneidade.</p>
  </div>

  <div style="margin-bottom: 16px;">
    <h4 style="margin: 0 0 4px; font-size: 12px; font-weight: bold; color: #1e3a8a;">CLÁUSULA 07 – CIÊNCIA DE CONTRATO</h4>
    <p style="text-align: justify; margin: 0 0 12px;">As partes elegem o Foro da Comarca da cidade de {{FORO_COMARCA}}, para dirimir qualquer demanda judicial relativa ao presente contrato, com exclusão de qualquer outro.</p>
    <p style="text-align: center; margin: 0 0 20px;">Local: {{LOCAL_ASSINATURA}}, Data: {{DATA_ASSINATURA}}</p>
    
    <div style="display: flex; justify-content: space-between; margin-top: 24px; padding-top: 16px;">
      <div style="width: 45%; text-align: center; border-top: 1px solid #111827; padding-top: 4px;">
        <p style="margin: 0; font-weight: bold; font-size: 11px;">SOBRE MÍDIA</p>
      </div>
      <div style="width: 45%; text-align: center; border-top: 1px solid #111827; padding-top: 4px;">
        <p style="margin: 0; font-weight: bold; font-size: 11px;">{{RAZAO_SOCIAL}} (PARCEIRO)</p>
      </div>
    </div>
  </div>
</div>`;

export const CANONICAL_TEMPLATE_HTML_GESTOR = `<div class="contract-container" style="font-family: Arial, sans-serif; font-size: 12px; line-height: 1.45; color: #111827;">
  <div style="text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 8px; margin-bottom: 14px;">
    <p style="margin: 0; font-size: 11px; font-weight: bold; color: #1e3a8a;">SOBRE MÍDIA DESIGNER LTDA., Av. Agamenon Magalhães, 1019 - Maurício de Nassau, Caruaru - PE, CEP 55012-140</p>
    <p style="margin: 2px 0; font-size: 11px; color: #4b5563;">Tel: (81) 99884-4677 | E-mail: sobremidiadesigner@gmail.com | Site: www.sobremidiadesigner.com.br</p>
    <h3 style="margin: 8px 0 0; font-size: 14px; color: #111827; font-weight: bold; text-transform: uppercase;">CONTRATO DE GESTÃO DE MÍDIA DIGITAL</h3>
    <p style="margin: 4px 0 0; font-size: 11px; font-weight: bold; color: #4b5563;">GESTOR DE MÍDIAS</p>
  </div>

  <div style="margin-bottom: 12px; background-color: #f9fafb; padding: 10px; border-radius: 4px; border: 1px solid #e5e7eb;">
    <h4 style="margin: 0 0 6px; font-size: 12px; font-weight: bold; color: #1e3a8a;">DADOS DAS PARTES</h4>
    <table style="width: 100%; font-size: 11px; border-collapse: collapse;">
      <tr>
        <td style="padding: 2px 0; width: 50%;"><strong>Contratante:</strong> SOBRE MÍDIA DESIGNER LTDA.</td>
        <td style="padding: 2px 0; width: 50%;"><strong>CNPJ:</strong> 44.899.400/0002-57</td>
      </tr>
      <tr>
        <td style="padding: 2px 0;"><strong>Gestor de Mídias:</strong> {{NOME_GESTOR}}</td>
        <td style="padding: 2px 0;"><strong>CPF/CNPJ:</strong> {{CPF_CNPJ}}</td>
      </tr>
      <tr>
        <td style="padding: 2px 0;"><strong>Endereço/Cidade:</strong> {{ENDERECO_UNIDADE}} {{CIDADE}}/{{UF}}</td>
        <td style="padding: 2px 0;"><strong>Contato:</strong> {{TELEFONE}} / {{EMAIL}}</td>
      </tr>
    </table>
  </div>

  <div style="margin-bottom: 10px;">
    <p style="text-align: justify; margin: 0 0 8px; font-size: 11.5px;">SOBRE MÍDIA DESIGNER LTDA. e o GESTOR DE MÍDIAS identificado no cadastro realizado na plataforma, resolvem estabelecer as seguintes condições para atuação na gestão da rede de mídia digital da SOBRE MÍDIA.</p>
  </div>

  <div style="margin-bottom: 10px;">
    <h4 style="margin: 0 0 4px; font-size: 12px; font-weight: bold; color: #1e3a8a;">1. OBJETO</h4>
    <p style="text-align: justify; margin: 0 0 4px;"><strong>1.1.</strong> O presente contrato estabelece as regras básicas para atuação do GESTOR DE MÍDIAS na operação da rede.</p>
    <p style="text-align: justify; margin: 0 0 4px;"><strong>1.2.</strong> A rede é composta por estabelecimentos parceiros, pontos comerciais e telas digitais da SOBRE MÍDIA.</p>
    <p style="text-align: justify; margin: 0;"><strong>1.3.</strong> O GESTOR atuará nos pontos e equipamentos que lhe forem atribuídos pela SOBRE MÍDIA.</p>
  </div>

  <div style="margin-bottom: 10px;">
    <h4 style="margin: 0 0 4px; font-size: 12px; font-weight: bold; color: #1e3a8a;">2. COMO FUNCIONA A REDE SOBRE MÍDIA</h4>
    <p style="text-align: justify; margin: 0 0 4px;"><strong>2.1.</strong> A SOBRE MÍDIA estabelece parcerias com estabelecimentos comerciais (PONTOS PARCEIROS).</p>
    <p style="text-align: justify; margin: 0 0 4px;"><strong>2.2.</strong> ANUNCIANTES contratam espaços de mídia para exibição de conteúdos publicitários.</p>
    <p style="text-align: justify; margin: 0;"><strong>2.3.</strong> O GESTOR participa da operação da rede, acompanhando os pontos, telas e ocorrências atribuídas.</p>
  </div>

  <div style="margin-bottom: 10px;">
    <h4 style="margin: 0 0 4px; font-size: 12px; font-weight: bold; color: #1e3a8a;">3. ATRIBUIÇÕES DO GESTOR</h4>
    <p style="text-align: justify; margin: 0 0 4px;"><strong>3.1.</strong> Acompanhar o funcionamento das telas e equipamentos e comunicar problemas técnicos ou danos.</p>
    <p style="text-align: justify; margin: 0;"><strong>3.2.</strong> Preservar equipamentos, materiais e credenciais e cumprir as políticas da SOBRE MÍDIA.</p>
  </div>

  <div style="margin-bottom: 10px;">
    <h4 style="margin: 0 0 4px; font-size: 12px; font-weight: bold; color: #1e3a8a;">4. POLÍTICAS DA REDE E LIMITES DE ATUAÇÃO</h4>
    <p style="text-align: justify; margin: 0 0 4px;"><strong>4.1. Conteúdo:</strong> Nenhum conteúdo deverá ser inserido/alterado sem autorização da SOBRE MÍDIA.</p>
    <p style="text-align: justify; margin: 0 0 4px;"><strong>4.2. Confidencialidade:</strong> Manter sigilo sobre informações comerciais, técnicas e operacionais.</p>
    <p style="text-align: justify; margin: 0;"><strong>4.3. Limites:</strong> O GESTOR não pode assinar contratos, alterar preços ou receber valores pela SOBRE MÍDIA.</p>
  </div>

  <div style="margin-bottom: 10px;">
    <h4 style="margin: 0 0 4px; font-size: 12px; font-weight: bold; color: #1e3a8a;">5. REMUNERAÇÃO, VIGÊNCIA E ACEITE</h4>
    <p style="text-align: justify; margin: 0 0 4px;"><strong>5.1.</strong> Remuneração conforme instrumento complementar específico. Este contrato provisório não gera comissão automática.</p>
    <p style="text-align: justify; margin: 0;"><strong>5.2.</strong> Vigência de {{DATA_INICIO}} a {{DATA_FIM}} para homologação técnica e testes do sistema SOBRE MÍDIA.</p>
  </div>

  <div style="margin-bottom: 16px;">
    <h4 style="margin: 0 0 8px; font-size: 12px; font-weight: bold; color: #1e3a8a;">ASSINATURAS E ANEXOS</h4>
    <p style="text-align: center; margin: 0 0 16px;">Local: {{LOCAL_ASSINATURA}}, Data: {{DATA_ASSINATURA}}</p>
    
    <div style="display: flex; justify-content: space-between; margin-top: 20px; padding-top: 14px;">
      <div style="width: 45%; text-align: center; border-top: 1px solid #111827; padding-top: 4px;">
        <p style="margin: 0; font-weight: bold; font-size: 11px;">SOBRE MÍDIA DESIGNER LTDA.</p>
        <p style="margin: 2px 0 0; font-size: 10px; color: #6b7280;">Assinatura Digital Autorizada</p>
      </div>
      <div style="width: 45%; text-align: center; border-top: 1px solid #111827; padding-top: 4px;">
        <p style="margin: 0; font-weight: bold; font-size: 11px;">{{NOME_GESTOR}} (GESTOR)</p>
        <p style="margin: 2px 0 0; font-size: 10px; color: #6b7280;">Assinatura Digital do Gestor</p>
      </div>
    </div>
  </div>
</div>`;

/**
 * Retorna o template oficial canônico completo por tipo de contrato.
 * Garante que ANUNCIANTE, PARCEIRO e GESTOR sempre nasçam completos.
 */
export function getCanonicalTemplateForTipo(tipo: 'ANUNCIANTE' | 'PARCEIRO' | 'GESTOR' | string): string {
  if (tipo === 'PARCEIRO' || tipo === 'PONTO_PARCEIRO') return CANONICAL_TEMPLATE_HTML_PARCEIRO;
  if (tipo === 'GESTOR' || tipo === 'GESTOR_MIDIA' || tipo === 'GESTOR_MIDIAS') return CANONICAL_TEMPLATE_HTML_GESTOR;
  return CANONICAL_TEMPLATE_HTML_ANUNCIANTE;
}

/**
 * Verifica se o HTML de template contém as cláusulas e estruturas completas
 * do tipo de contrato especificado, evitando stubs ou documentos incompletos.
 */
export function isTemplateCompleto(html?: string | null, tipo?: 'ANUNCIANTE' | 'PARCEIRO' | 'GESTOR' | string): boolean {
  if (!html || html.trim().length < 1500) return false;
  const t = (tipo || 'ANUNCIANTE').toUpperCase();
  if (t === 'PARCEIRO' || t === 'PONTO_PARCEIRO') {
    return (
      (html.includes('CLÁUSULA 01') || html.includes('DO OBJETO')) &&
      (html.includes('OBRIGAÇÕES DO ESTABELECIMENTO PARCEIRO') || html.includes('ESTABELECIMENTO PARCEIRO') || html.includes('PARCERIA')) &&
      (html.includes('GRADE DE PROGRAMAÇÃO') || html.includes('VIGÊNCIA E RESCISÃO') || html.includes('CIÊNCIA DE CONTRATO'))
    );
  }
  if (t === 'GESTOR' || t === 'GESTOR_MIDIA' || t === 'GESTOR_MIDIAS') {
    return (
      (html.includes('1. OBJETO') || html.includes('CONTRATO DE GESTÃO DE MÍDIA DIGITAL')) &&
      (html.includes('ATRIBUIÇÕES DO GESTOR') || html.includes('GESTOR DE MÍDIAS')) &&
      (html.includes('POLÍTICAS DA REDE') || html.includes('REMUNERAÇÃO, VIGÊNCIA E ACEITE'))
    );
  }
  return (
    (html.includes('CLÁUSULA 01 - NOSSO SERVIÇO') || html.includes('NOSSO SERVIÇO')) &&
    (html.includes('POLÍTICA DE PRIVACIDADE') || html.includes('GRADE DE HORÁRIOS')) &&
    (html.includes('RESCISÃO CONTRATUAL') || html.includes('RENOVAÇÃO DE CONTRATO'))
  );
}



/**
 * Preenche o template substituindo placeholders com dados reais.
 *
 * Política estrita:
 *   - Valida placeholders contra o catálogo canônico (bloqueia tokens desconhecidos).
 *   - Campo OBRIGATÓRIO ausente -> lança erro técnico claro.
 *   - Campo OPCIONAL ausente    -> substitui por string vazia (não inventa dados).
 *   - Nenhum {{PLACEHOLDER}} não resolvido permanecerá no documento final.
 */
export function preencherTemplate(
  templateHtml: string,
  dados: Record<string, string>,
  tipoContrato: 'ANUNCIANTE' | 'PARCEIRO' | 'GESTOR' = 'ANUNCIANTE'
): string {
  const validacao = validarPlaceholdersTemplate(templateHtml);
  if (!validacao.valido) {
    throw new Error(
      `Campo de contrato não reconhecido ou sem origem configurada: ${validacao.placeholdersDesconhecidos.map((p) => `{{${p}}}`).join(', ')}`
    );
  }

  let html = templateHtml;
  const obrigatorios = CAMPOS_OBRIGATORIOS[tipoContrato] || CAMPOS_OBRIGATORIOS.ANUNCIANTE;

  for (const ph of validacao.placeholdersValidos) {
    const valor = dados[ph];
    const temValor = valor !== undefined && valor !== null && String(valor).trim() !== '';

    if (!temValor) {
      if (obrigatorios.includes(ph)) {
        throw new Error(
          `Dado essencial ausente para contrato ${tipoContrato}: [${ph}]. ` +
          `Preencha os dados reais antes de gerar o documento.`
        );
      }
      html = html.replace(new RegExp(`\\{\\{${ph}\\}\\}`, 'g'), '');
    } else {
      html = html.replace(new RegExp(`\\{\\{${ph}\\}\\}`, 'g'), String(valor));
    }
  }

  // Garantia: verificar se sobrou qualquer placeholder {{...}} não resolvido
  const restantes = [...html.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].map((m) => m[1]);
  if (restantes.length > 0) {
    throw new Error(
      `Campo de contrato não reconhecido ou sem origem configurada: ${restantes.map((r) => `{{${r}}}`).join(', ')}`
    );
  }

  return html;
}

interface ElementoHtml {
  tag: string;
  text: string;
  isBold: boolean;
  level: number;
}

/** Extrai texto estruturado do HTML oficial do template. */
export function parseHtmlToElements(html: string): ElementoHtml[] {
  const elements: ElementoHtml[] = [];
  const tagStack: string[] = [];
  const fullRegex = /<(\/?)([ a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let match: RegExpExecArray | null;
  let lastIndex = 0;

  while ((match = fullRegex.exec(html)) !== null) {
    const isClosing = match[1] === '/';
    const tagName = match[2].toLowerCase();
    const matchIndex = match.index;

    if (matchIndex > lastIndex) {
      const textContent = html.slice(lastIndex, matchIndex).trim();
      if (textContent) {
        const cleanText = textContent.replace(/<[^>]+>/g, '').trim();
        if (cleanText) {
          const headerTag = tagStack.find((t) => ['h1', 'h2', 'h3', 'h4'].includes(t));
          elements.push({
            tag: headerTag || 'p',
            text: cleanText,
            isBold: tagStack.includes('strong') || tagStack.includes('b'),
            level: headerTag ? parseInt(headerTag.charAt(1), 10) : 0,
          });
        }
      }
    }

    if (isClosing) {
      const idx = tagStack.lastIndexOf(tagName);
      if (idx >= 0) tagStack.splice(idx, 1);
    } else {
      tagStack.push(tagName);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < html.length) {
    const textContent = html.slice(lastIndex).trim();
    if (textContent) {
      const cleanText = textContent.replace(/<[^>]+>/g, '').trim();
      if (cleanText) {
        const headerTag = tagStack.find((t) => ['h1', 'h2', 'h3', 'h4'].includes(t));
        elements.push({
          tag: headerTag || 'p',
          text: cleanText,
          isBold: tagStack.includes('strong') || tagStack.includes('b'),
          level: headerTag ? parseInt(headerTag.charAt(1), 10) : 0,
        });
      }
    }
  }

  return elements;
}

/**
 * Gera PDF REAL vetorial A4 a partir do texto juridico renderizado.
 */
export async function gerarPdfDoHtml(htmlRenderizado: string, numeroContrato: string, tipoContrato: string, versao: number): Promise<Uint8Array> {
  const elements = parseHtmlToElements(htmlRenderizado);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const marginX = 64;
  const marginTop = 96;
  const marginBottom = 72;
  const maxLineWidth = pageWidth - marginX * 2;

  doc.setFont('helvetica', 'normal');
  let y = pageHeight - marginTop;

  const desenharLinha = (text: string, size: number, bold: boolean, color: [number, number, number]) => {
    const linhas = doc.splitTextToSize(text, maxLineWidth) as string[];
    for (const linha of linhas) {
      if (y < marginBottom + 18) {
        doc.addPage('a4', 'portrait');
        y = pageHeight - marginTop;
      }
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      doc.setTextColor(color[0], color[1], color[2]);
      doc.text(linha, marginX, y);
      y -= size * 1.35;
    }
  };

  desenharLinha('SOBRE MIDIA - PLATAFORMA DIGITAL DE MIDIA', 14, true, [8, 79, 143]);
  desenharLinha(`Contrato: ${numeroContrato}  |  Tipo: ${tipoContrato}  |  Versao: ${versao}`, 8, false, [102, 102, 102]);
  y -= 10;

  for (const el of elements) {
    const isHeader = ['h1', 'h2', 'h3', 'h4'].includes(el.tag);
    const fontSize = el.tag === 'h1' ? 15 : el.tag === 'h2' ? 13 : el.tag === 'h3' ? 11 : 9.5;
    desenharLinha(el.text, fontSize, el.isBold || isHeader, isHeader ? [8, 79, 143] : [26, 26, 26]);
    if (isHeader) y -= 6;
  }

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(128, 128, 128);
    doc.text(`Pagina ${i} de ${totalPages}  |  SOBRE MIDIA DIGITAL SIGNAGE LTDA`, marginX, 28);
  }

  return new Uint8Array(doc.output('arraybuffer'));
}

/** Hash SHA-256 real do documento (hex). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Coleta TODOS os dados reais para gerar o documento.
 * Suporta as tres origens:
 *   - ANUNCIANTE + proposta  -> propostas + clientes + empresas
 *   - ANUNCIANTE + direto    -> clientes + empresas
 *   - PARCEIRO + ponto_id   -> pontos (sem exigir cliente_id ou empresa_id)
 */
export async function coletarDadosReais(contratoId: string): Promise<DadosDocumentoContrato> {
  const { data: contrato, error: ctrErr } = await supabase
    .from('contratos')
    .select(`
      *,
      proposta:propostas(*),
      cliente:clientes(*)
    `)
    .eq('id', contratoId)
    .single();

  if (ctrErr || !contrato) {
    throw new Error('Contrato nao encontrado.');
  }

  const tipoContrato = (contrato.tipo_contrato as 'ANUNCIANTE' | 'PARCEIRO' | 'GESTOR') || 'ANUNCIANTE';

  let empresa: any = null;
  if (contrato.empresa_id) {
    const { data: emp } = await supabase
      .from('empresas')
      .select('*')
      .eq('id', contrato.empresa_id)
      .maybeSingle();
    empresa = emp;
  } else if (contrato.cliente_id) {
    const { data: emp } = await supabase
      .from('empresas')
      .select('*')
      .eq('cliente_id', contrato.cliente_id)
      .maybeSingle();
    empresa = emp;
  }

  let template: any = null;
  if (contrato.template_id) {
    const { data: tpl } = await supabase
      .from('contrato_templates')
      .select('*')
      .eq('id', contrato.template_id)
      .maybeSingle();
    template = tpl;
  }

  // Se template não estiver vinculado ou se o HTML for stub, busca o template oficial rico ativo
  if (!template?.conteudo_html || template.conteudo_html.length < 200 || template.conteudo_html.includes('(preservado)')) {
    const { data: activeTpls } = await supabase
      .from('contrato_templates')
      .select('*')
      .eq('tipo_contrato', tipoContrato)
      .eq('ativo', true)
      .order('created_at', { ascending: true });

    const bestTpl = activeTpls?.find((t) => t.conteudo_html && t.conteudo_html.length > 200 && !t.conteudo_html.includes('(preservado)'));
    if (bestTpl) {
      template = bestTpl;
    } else {
      template = {
        id: template?.id || `tpl-${tipoContrato.toLowerCase()}-canonical`,
        nome: template?.nome || `Contrato de ${tipoContrato} — Oficial`,
        tipo_contrato: tipoContrato,
        versao: template?.versao || 1,
        ativo: true,
        conteudo_html: tipoContrato === 'PARCEIRO'
          ? CANONICAL_TEMPLATE_HTML_PARCEIRO
          : tipoContrato === 'GESTOR'
          ? CANONICAL_TEMPLATE_HTML_GESTOR
          : CANONICAL_TEMPLATE_HTML_ANUNCIANTE,
        pdf_anexo_key: template?.pdf_anexo_key || null,
      };
    }
  }

  // Contato: via empresa (ANUNCIANTE) quando empresa_id ou empresa.id disponível
  let contato: any = null;
  const targetEmpresaId = contrato.empresa_id || empresa?.id;
  if (targetEmpresaId) {
    const { data: ct } = await supabase
      .from('contatos')
      .select('*')
      .eq('empresa_id', targetEmpresaId)
      .order('is_principal', { ascending: false })
      .limit(1)
      .maybeSingle();
    contato = ct;
  }

  // Ponto Parceiro - fonte primaria para contratos PARCEIRO
  let ponto: any = null;
  if (contrato.ponto_id) {
    const { data: pt } = await supabase
      .from('pontos')
      .select('*')
      .eq('id', contrato.ponto_id)
      .maybeSingle();
    ponto = pt;
  }

  const { data: operadora } = await supabase
    .from('empresa_operadora')
    .select('*')
    .eq('id', contrato.empresa_operadora_id)
    .maybeSingle();

  const { data: itens } = await supabase
    .from('itens_contrato')
    .select('quantidade')
    .eq('contrato_id', contratoId);

  const quantidadeTelas = (itens || []).reduce((acc: number, item: any) => acc + (Number(item.quantidade) || 0), 0);

  return {
    contrato,
    proposta: contrato.proposta,
    empresa: empresa || (contrato as any).empresa,
    contato,
    ponto,
    template,
    operadora,
    quantidadeTelas,
  };
}

/**
 * Mapeia dados reais para os placeholders do template.
 * ANUNCIANTE: usa empresa + contato + proposta
 * PARCEIRO:   usa ponto como fonte primaria
 */
export function montarDadosTemplate(dados: DadosDocumentoContrato): Record<string, string> {
  const { contrato, proposta, empresa, contato, ponto } = dados;
  const tipoContrato = contrato?.tipo_contrato || 'ANUNCIANTE';

  let razaoSocial = '';
  let nomeFantasia = '';
  let cnpj = '';
  let responsavel = '';
  let logradouro = '';
  let numero = '';
  let bairro = '';
  let cidade = '';
  let estado = '';
  let cep = '';
  let telefone = '';
  let whatsapp = '';
  let email = '';
  let instagram = '';
  let website = '';
  let horarioInicio = '';
  let horarioFim = '';
  let diasSemana = '';

  if (tipoContrato === 'PARCEIRO' && ponto) {
    razaoSocial   = ponto.nome || ponto.razao_social || ponto.nome_fantasia || '';
    nomeFantasia  = ponto.nome_fantasia || ponto.nome || '';
    cnpj          = ponto.cnpj || '';
    responsavel   = ponto.responsavel_nome || ponto.representante_legal || '';
    logradouro    = ponto.logradouro || ponto.endereco || '';
    numero        = ponto.numero || '';
    bairro        = ponto.bairro || '';
    cidade        = ponto.cidade || '';
    estado        = ponto.estado || '';
    cep           = ponto.cep || '';
    telefone      = ponto.responsavel_telefone || ponto.telefone || '';
    whatsapp      = ponto.whatsapp || ponto.responsavel_telefone || '';
    email         = ponto.responsavel_email || ponto.email || '';
    instagram     = ponto.instagram || '';
    horarioInicio = ponto.horario_abertura || '';
    horarioFim    = ponto.horario_fechamento || '';
    diasSemana    = ponto.dias_funcionamento || '';
  } else {
    razaoSocial   = empresa?.razao_social || empresa?.nome_fantasia || '';
    nomeFantasia  = empresa?.nome_fantasia || empresa?.razao_social || '';
    cnpj          = empresa?.cnpj || '';
    responsavel   = contato?.nome || empresa?.representante_legal || '';
    logradouro    = empresa?.logradouro || '';
    numero        = empresa?.numero || '';
    bairro        = empresa?.bairro || '';
    cidade        = empresa?.cidade || '';
    estado        = empresa?.estado || '';
    cep           = empresa?.cep || '';
    telefone      = empresa?.telefone || contato?.telefone || '';
    email         = empresa?.email || contato?.email || '';
    instagram     = empresa?.instagram || '';
    website       = empresa?.website || empresa?.site || '';
  }

  const enderecoUnidade = [
    [logradouro, numero].filter(Boolean).join(', '),
    bairro,
    [cidade, estado].filter(Boolean).join('/'),
  ].filter(Boolean).join(' - ');

  const cidadeAssinatura = (cidade || empresa?.cidade || ponto?.cidade || 'Caruaru').trim();
  const estadoAssinatura = (estado || empresa?.estado || ponto?.estado || 'PE').trim().toUpperCase();
  const localAssinatura = estadoAssinatura ? `${cidadeAssinatura} / ${estadoAssinatura}` : cidadeAssinatura;

  return {
    RAZAO_SOCIAL:        razaoSocial,
    NOME_FANTASIA:       nomeFantasia,
    CNPJ:                cnpj,
    CPF_CNPJ:            cnpj,
    RESPONSAVEL:         responsavel,
    REPRESENTANTE_LEGAL: responsavel,
    NOME_GESTOR:         responsavel || razaoSocial || nomeFantasia,
    LOGRADOURO:          logradouro,
    NUMERO:              numero,
    BAIRRO:              bairro,
    CIDADE:              cidade,
    ESTADO:              estado,
    UF:                  estado,
    CEP:                 cep,
    ENDERECO_UNIDADE:    enderecoUnidade,
    NOME_UNIDADE:        nomeFantasia || razaoSocial,
    TELEFONE:            telefone,
    WHATSAPP:            whatsapp,
    EMAIL:               email,
    INSTAGRAM:           instagram,
    WEBSITE:             website,
    DIAS_SEMANA:         diasSemana,
    HORARIO_INICIO:      horarioInicio,
    HORARIO_FIM:         horarioFim,
    TITULO_CAMPANHA:     proposta?.titulo_campanha || '',
    PACOTE_VEICULACAO:   proposta?.pacote_veiculacao || proposta?.plano || '',
    PERIODO_VEICULACAO:  proposta?.periodo_veiculacao || '',
    VALOR_MENSAL:        FORMATO_MOEDA.format(Number(contrato?.valor_mensal) || 0),
    VALOR_A_VISTA:       FORMATO_MOEDA.format(Number(proposta?.valor_final) || 0),
    DESCONTO:            proposta?.desconto ? FORMATO_MOEDA.format(Number(proposta.desconto)) : '',
    ENTRADA:             proposta?.entrada ? FORMATO_MOEDA.format(Number(proposta.entrada)) : '',
    NUMERO_PARCELAS:     proposta?.numero_parcelas ? String(proposta.numero_parcelas) : '',
    PARCELAMENTO_CARTAO: proposta?.parcelamento_cartao || '',
    VALOR_POR_SISTEMA:   proposta?.valor_por_sistema ? FORMATO_MOEDA.format(Number(proposta.valor_por_sistema)) : '',
    FORMA_PAGAMENTO:     contrato?.forma_pagamento || '',
    DATA_VENCIMENTO_PRIMEIRA_FATURA: formatarData(proposta?.data_vencimento_primeira),
    QUANTIDADE_TELAS:    dados.quantidadeTelas > 0 ? String(dados.quantidadeTelas) : '',
    QTD_TVS:             proposta?.qtd_tvs ? String(proposta.qtd_tvs) : '',
    QTD_TOTENS:          proposta?.qtd_totens ? String(proposta.qtd_totens) : '',
    QTD_PAINEIS_LED:     proposta?.qtd_paineis_led ? String(proposta.qtd_paineis_led) : '',
    TOTAL_SISTEMAS:      dados.quantidadeTelas > 0 ? String(dados.quantidadeTelas) : '',
    DATA_INICIO:                  formatarData(contrato?.data_inicio),
    DATA_FIM:                     formatarData(contrato?.data_fim),
    DATA_INICIO_VEICULACAO:       formatarData(contrato?.data_inicio),
    DATA_FIM_VEICULACAO:          formatarData(contrato?.data_fim),
    DATA_ASSINATURA:              formatarDataExtensa(new Date()),
    LOCAL_ASSINATURA:             localAssinatura,
    FORO_COMARCA:                 cidade || empresa?.cidade || ponto?.cidade || 'Caruaru',
    NUMERO_CONTRATO:              contrato?.numero_contrato || '',
    VERSAO_CONTRATO:              String(contrato?.versao_atual || 1),
    TIPO_CONTRATO:                tipoContrato,
    ASSINATURA_SOBRE_MIDIA:  '',
    ASSINATURA_CONTRATANTE:  '',
    ASSINATURA_PARCEIRO:     '',
  };
}

/** Obtem URL presigned de download com autorizacao real via Edge Function. */
export async function obterUrlDownload(objectKey: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('get-download-url', {
    body: { objectKey },
  });
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Acesso negado ao documento.');
  }
  return data.signedUrl as string;
}

/** Baixa o documento real e dispara o download no dispositivo. */
export async function baixarDocumento(objectKey: string, fileName: string): Promise<void> {
  const signedUrl = await obterUrlDownload(objectKey);
  const res = await fetch(signedUrl);
  if (!res.ok) {
    throw new Error(`Falha no download do documento (${res.status}).`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
}

/** Abre o documento em nova aba. */
export async function visualizarDocumento(objectKey: string): Promise<void> {
  const signedUrl = await obterUrlDownload(objectKey);
  window.open(signedUrl, '_blank', 'noopener');
}

/** Registra auditoria de download do documento. */
export async function registrarDownloadDocumento(contratoId: string, tipoContrato: string, usuarioId: string, objectKey: string): Promise<void> {
  await supabase.from('contrato_auditoria').insert({
    contrato_id: contratoId,
    evento: 'DOCUMENTO_BAIXADO',
    usuario_id: usuarioId,
    tipo_contrato: tipoContrato || null,
    detalhes: { object_key: objectKey },
  });
}

/**
 * FLUXO COMPLETO DE GERACAO:
 * 1. Coleta dados reais (ANUNCIANTE: empresa/cliente; PARCEIRO: ponto)
 * 2. Renderiza template com politica obrigatorio/opcional
 * 3. Gera PDF vetorial (jsPDF)
 * 4. Compoe com anexo oficial do template, se existir
 * 5. Hash SHA-256
 * 6. Upload R2
 * 7. Snapshot contrato_versoes + status + auditoria
 */
export async function gerarDocumentoContrato(contratoId: string, usuarioId: string): Promise<ResultadoDocumento> {
  try {
    const dados = await coletarDadosReais(contratoId);
    const { contrato, template } = dados;

    const tipoContrato = (contrato.tipo_contrato as 'ANUNCIANTE' | 'PARCEIRO') || 'ANUNCIANTE';
    const dadosTemplate = montarDadosTemplate(dados);

    const htmlRenderizado = preencherTemplate(
      template.conteudo_html,
      dadosTemplate,
      tipoContrato
    );

    let pdfBytes = await gerarPdfDoHtml(htmlRenderizado, contrato.numero_contrato, tipoContrato, contrato.versao_atual || 1);

    if (template.pdf_anexo_key) {
      const signedUrl = await obterUrlDownload(template.pdf_anexo_key);
      const res = await fetch(signedUrl);
      if (!res.ok) throw new Error(`Anexo oficial do template indisponivel (${res.status}).`);
      const anexoBytes = new Uint8Array(await res.arrayBuffer());
      const anexoDoc = await PDFDocument.load(anexoBytes);
      const principalDoc = await PDFDocument.load(pdfBytes);
      const paginasAnexo = await principalDoc.copyPages(anexoDoc, anexoDoc.getPageIndices());
      for (const pagina of paginasAnexo) principalDoc.addPage(pagina);
      pdfBytes = new Uint8Array(await principalDoc.save());
    }

    const documentHash = await sha256Hex(pdfBytes);
    const novaVersao = contrato.versao_atual || 1;
    const objectKey = `tenants/${contrato.empresa_operadora_id}/contratos/${contrato.id}/v${novaVersao}/contrato_${contrato.numero_contrato}.pdf`;

    await uploadToR2(new Blob([pdfBytes], { type: 'application/pdf' }), objectKey, 'application/pdf', usuarioId);

    await supabase.from('contrato_versoes').insert({
      contrato_id: contrato.id,
      numero_versao: novaVersao,
      snapshot_dados: {
        html_renderizado: htmlRenderizado,
        document_hash: documentHash,
        pdf_object_key: objectKey,
        dados_template: dadosTemplate,
        versao_numero: novaVersao,
        template_id: template.id,
        gerado_em: new Date().toISOString(),
        timezone: 'America/Sao_Paulo',
        dados_fonte: {
          proposta_id: contrato.proposta_id,
          cliente_id: contrato.cliente_id,
          ponto_id: contrato.ponto_id,
          empresa_id: contrato.empresa_id,
          template_id: template.id,
          versao_atual: contrato.versao_atual,
          tipo_contrato: tipoContrato,
        },
      },
      motivo_alteracao: 'Geracao oficial de documento PDF real (vetorial) a partir do template oficial',
      pdf_url: objectKey,
      created_by: usuarioId,
    });

    const { error: updErr } = await supabase
      .from('contratos')
      .update({
        status_documento: 'GERADO',
        pdf_object_key: objectKey,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contrato.id);

    if (updErr) throw new Error(`Falha ao atualizar contrato: ${updErr.message}`);

    await supabase.from('contrato_auditoria').insert({
      contrato_id: contrato.id,
      evento: 'CONTRATO_DOCUMENTO_GERADO',
      usuario_id: usuarioId,
      tipo_contrato: tipoContrato,
      versao: novaVersao,
      detalhes: {
        object_key: objectKey,
        document_hash: documentHash,
        storage: 'r2',
        template_id: template.id,
        anexo_componido: !!template.pdf_anexo_key,
      },
    });

    return { success: true, objectKey, documentHash, versao: novaVersao };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao gerar o documento do contrato.' };
  }
}

/**
 * Cria envelope REAL de assinatura interna (ASSINADOR_INTERNO).
 * Resolve signatario de empresa (ANUNCIANTE) ou ponto (PARCEIRO).
 */
export async function criarEnvelopeInterno(contratoId: string, usuarioId?: string): Promise<{
  success: boolean;
  assinaturaId?: string;
  envelopeId?: string;
  signatarioNome?: string | null;
  signatarioEmail?: string | null;
  signatarioCpfCnpj?: string | null;
  error?: string;
}> {
  try {
    const { data: contrato, error: ctrErr } = await supabase
      .from('contratos')
      .select(`*, empresa:empresas(*, contatos:contatos(*))`)
      .eq('id', contratoId)
      .single();

    if (ctrErr || !contrato) return { success: false, error: 'Contrato nao encontrado.' };
    if (!contrato.pdf_object_key) return { success: false, error: 'Gere o documento do contrato antes de enviar para assinatura.' };
    if (contrato.status_documento === 'ASSINADO') return { success: false, error: 'Contrato ja assinado.' };
    if (contrato.status_documento !== 'GERADO') {
      return { success: false, error: `Documento com status ${contrato.status_documento} nao pode ser enviado para assinatura.` };
    }

    const signedUrl = await obterUrlDownload(contrato.pdf_object_key);
    const res = await fetch(signedUrl);
    if (!res.ok) return { success: false, error: 'PDF original indisponivel para hash.' };
    const pdfBytes = new Uint8Array(await res.arrayBuffer());
    const documentHash = await sha256Hex(pdfBytes);

    const empresa = contrato.empresa;
    const contatoEmp = empresa?.contatos?.[0];
    let signatarioNome: string | null = contatoEmp?.nome || empresa?.representante_legal || null;
    let signatarioEmail: string | null = empresa?.email || null;
    let signatarioCnpj: string | null = empresa?.cnpj || null;

    if (contrato.tipo_contrato === 'PARCEIRO' && contrato.ponto_id && !signatarioNome) {
      const { data: pt } = await supabase
        .from('pontos')
        .select('responsavel_nome, responsavel_email, cnpj')
        .eq('id', contrato.ponto_id)
        .maybeSingle();
      if (pt) {
        signatarioNome  = pt.responsavel_nome || null;
        signatarioEmail = pt.responsavel_email || null;
        signatarioCnpj  = pt.cnpj || null;
      }
    }

    const timestamp = Date.now().toString(36).toUpperCase();
    const randomBytes = new Uint8Array(8);
    crypto.getRandomValues(randomBytes);
    const randomPart = Array.from(randomBytes, (b) => b.toString(36).padStart(2, '0')).join('').substring(0, 12).toUpperCase();
    const envelopeId = `ENV-SM-${timestamp}-${randomPart}`;

    const { data: ass, error: assErr } = await supabase
      .from('assinaturas')
      .insert({
        empresa_operadora_id: contrato.empresa_operadora_id,
        contrato_id: contrato.id,
        provedor: 'ASSINADOR_INTERNO',
        status: 'ENVIADO',
        envelope_id: envelopeId,
        document_hash: documentHash,
        signatario_nome: signatarioNome,
        signatario_email: signatarioEmail,
        signatario_cpf_cnpj: signatarioCnpj,
        expira_em: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        pdf_original_key: contrato.pdf_object_key,
      })
      .select('id')
      .single();

    if (assErr || !ass) {
      return { success: false, error: `Falha ao criar envelope: ${assErr?.message}` };
    }

    await supabase.from('assinatura_eventos').insert({
      assinatura_id: ass.id,
      evento: 'ENVIADO',
      detalhes: {
        provedor: 'ASSINADOR_INTERNO',
        document_hash: documentHash,
        usuario_id: usuarioId || null,
        signatario: signatarioNome,
      },
    });

    await supabase
      .from('contratos')
      .update({
        status_documento: 'ENVIADO',
        status_workflow: 'AGUARDANDO_ASSINATURA',
        documento_enviado_em: new Date().toISOString(),
        assinatura_envelope_id: envelopeId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contrato.id);

    await supabase.from('contrato_auditoria').insert({
      contrato_id: contrato.id,
      evento: 'CONTRATO_ENVIADO_ASSINATURA',
      usuario_id: usuarioId || null,
      tipo_contrato: contrato.tipo_contrato,
      versao: contrato.versao_atual,
      detalhes: { envelope_id: envelopeId, assinatura_id: ass.id, document_hash: documentHash },
    });

    return {
      success: true,
      assinaturaId: ass.id,
      envelopeId,
      signatarioNome,
      signatarioEmail,
      signatarioCpfCnpj: signatarioCnpj,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao enviar para assinatura.' };
  }
}

/** Registra visualizacao real do envelope (RPC SECURITY DEFINER). */
export async function registrarVisualizacaoAssinatura(assinaturaId: string, ip?: string, userAgent?: string): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('fn_registrar_visualizacao_assinatura', {
    p_assinatura_id: assinaturaId,
    p_ip: ip || null,
    p_user_agent: userAgent || null,
  });
  const result = (data ?? null) as { success?: boolean; error?: string } | null;
  if (error || !result?.success) {
    return { success: false, error: error?.message || result?.error || 'Falha ao registrar visualizacao.' };
  }
  return { success: true };
}

export interface SignaturePlacement {
  pageIndex?: number; // Se indefinido, usa a última página (pages.length - 1)
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * COORDENADAS CALIBRADAS EMPIRICAMENTE — Gate 2-B.4.1
 *
 * Sistema de coordenadas: pdf-lib (origem canto inferior esquerdo, y cresce para cima).
 * jsPDF usa y com origem SUPERIOR e decresce, portanto:
 *   pdfLibY = pageHeight - jsPdfY
 *
 * ANUNCIANTE:
 *   A linha "___ CONTRATANTE" é renderizada no jsPDF y≈337.94
 *   Em pdf-lib: y ≈ 841.89 - 337.94 = 503.95
 *   A assinatura deve ficar ACIMA dessa linha: y = 510 (caixa de 45pt sobe até 555)
 *   x = 320 (lado direito — campo CONTRATANTE)
 *
 * PARCEIRO:
 *   A linha "PARCEIRO" é renderizada no jsPDF y≈371.61
 *   Em pdf-lib: y ≈ 841.89 - 371.61 = 470.28
 *   A assinatura deve ficar ACIMA dessa linha: y = 476
 *   x = 64 (lado esquerdo — campo PARCEIRO)
 *
 * pageIndex: ausente => usa sempre a última página (comportamento seguro para contratos de 1 a N páginas).
 */
export const SIGNATURE_PLACEMENTS: Record<'ANUNCIANTE' | 'PARCEIRO' | 'GESTOR' | 'DEFAULT', SignaturePlacement> = {
  ANUNCIANTE: {
    // Acima da linha "___ CONTRATANTE" no canto inferior direito
    x: 320,
    y: 510,
    width: 205,
    height: 45,
  },
  PARCEIRO: {
    // Acima da linha "___ PARCEIRO" no canto inferior esquerdo
    x: 64,
    y: 476,
    width: 200,
    height: 45,
  },
  GESTOR: {
    // Acima da linha "___ GESTOR OPERACIONAL" no canto inferior esquerdo
    x: 64,
    y: 476,
    width: 200,
    height: 45,
  },
  DEFAULT: {
    x: 310,
    y: 90,
    width: 220,
    height: 45,
  },
};

export interface DadosAssinatura {
  nome: string;
  email?: string;
  cpfCnpj?: string;
  signatureDataUrl?: string;
  method?: 'DRAWN' | 'TYPED';
}

/**
 * Assinatura REAL do documento via pdf-lib + RPC fn_assinar_contrato.
 * Aplica overlay visual no campo de assinatura existente sem adicionar página.
 */
export async function assinarDocumento(
  assinaturaId: string,
  dadosSignatario: DadosAssinatura,
  ip?: string,
  userAgent?: string,
  usuarioId?: string
): Promise<{ success: boolean; pdfAssinadoKey?: string; documentHash?: string; error?: string }> {
  try {
    const { data: ass, error: assErr } = await supabase
      .from('assinaturas')
      .select('*')
      .eq('id', assinaturaId)
      .single();

    if (assErr || !ass) return { success: false, error: 'Envelope de assinatura nao encontrado.' };
    if (ass.status === 'ASSINADO') return { success: false, error: 'Este documento ja foi assinado.' };
    if (!ass.pdf_original_key) return { success: false, error: 'Documento original indisponivel.' };

    const { data: contrato, error: ctrErr } = await supabase
      .from('contratos')
      .select('id, numero_contrato, empresa_operadora_id, versao_atual, tipo_contrato')
      .eq('id', ass.contrato_id)
      .single();

    if (ctrErr || !contrato) return { success: false, error: 'Contrato vinculado nao encontrado.' };

    const signedUrl = await obterUrlDownload(ass.pdf_original_key);
    const res = await fetch(signedUrl);
    if (!res.ok) return { success: false, error: 'Falha ao obter o documento original.' };
    const originalBytes = new Uint8Array(await res.arrayBuffer());

    // GATE 2-B.4: Validação de integridade do documento original (FAIL CLOSED)
    const downloadedHash = await sha256Hex(originalBytes);
    if (ass.document_hash && downloadedHash !== ass.document_hash) {
      return { success: false, error: 'O hash do documento original não corresponde ao registrado. Documento alterado ou corrompido.' };
    }

    const pdfDoc = await PDFDocument.load(originalBytes);
    const pages = pdfDoc.getPages();
    if (pages.length === 0) {
      return { success: false, error: 'Documento PDF vazio.' };
    }

    const tipoContrato = (contrato.tipo_contrato as 'ANUNCIANTE' | 'PARCEIRO') || 'ANUNCIANTE';
    const placement = SIGNATURE_PLACEMENTS[tipoContrato] || SIGNATURE_PLACEMENTS.DEFAULT;
    const targetPageIndex = placement.pageIndex !== undefined && placement.pageIndex < pages.length
      ? placement.pageIndex
      : pages.length - 1;
    const targetPage = pages[targetPageIndex];

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const agora = new Date();

    // Embed da imagem de assinatura (se fornecida via Canvas ou Typed pad)
    if (dadosSignatario.signatureDataUrl && dadosSignatario.signatureDataUrl.includes(',')) {
      try {
        const base64Data = dadosSignatario.signatureDataUrl.split(',')[1];
        let imgBytes: Uint8Array;
        if (typeof Buffer !== 'undefined') {
          imgBytes = new Uint8Array(Buffer.from(base64Data, 'base64'));
        } else {
          const binaryStr = atob(base64Data);
          imgBytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            imgBytes[i] = binaryStr.charCodeAt(i);
          }
        }
        const embeddedImg = await pdfDoc.embedPng(imgBytes);
        targetPage.drawImage(embeddedImg, {
          x: placement.x,
          y: placement.y,
          width: placement.width,
          height: placement.height,
        });
      } catch (imgErr) {
        console.warn('[contratoDocumentoService] Falha ao embutir imagem PNG, aplicando assinatura textual de fallback:', imgErr);
        targetPage.drawText(dadosSignatario.nome, {
          x: placement.x + 10,
          y: placement.y + 15,
          size: 11,
          font: boldFont,
          color: rgb(0.1, 0.1, 0.1),
        });
      }
    } else {
      // Fallback textual limpo quando não há imagem capturada
      targetPage.drawText(dadosSignatario.nome, {
        x: placement.x + 10,
        y: placement.y + 15,
        size: 11,
        font: boldFont,
        color: rgb(0.1, 0.1, 0.1),
      });
    }

    // Metadados da assinatura eletrônica sobre o campo do signatário
    targetPage.drawText(`Assinado digitalmente por: ${dadosSignatario.nome}`, {
      x: placement.x,
      y: placement.y - 10,
      size: 6.5,
      font: boldFont,
      color: rgb(0.15, 0.15, 0.15),
    });
    targetPage.drawText(`Data/Hora: ${agora.toLocaleString('pt-BR')} (UTC: ${agora.toISOString()})`, {
      x: placement.x,
      y: placement.y - 18,
      size: 5.5,
      font,
      color: rgb(0.35, 0.35, 0.35),
    });
    if (dadosSignatario.cpfCnpj) {
      targetPage.drawText(`Doc: ${dadosSignatario.cpfCnpj} · Método: ${dadosSignatario.method || 'ELETRÔNICA'}`, {
        x: placement.x,
        y: placement.y - 25,
        size: 5.5,
        font,
        color: rgb(0.35, 0.35, 0.35),
      });
    }

    const signedBytes = new Uint8Array(await pdfDoc.save());
    const signedHash = await sha256Hex(signedBytes);

    const signedObjectKey = `tenants/${contrato.empresa_operadora_id}/contratos/${contrato.id}/assinado_${contrato.numero_contrato}_v${contrato.versao_atual || 1}.pdf`;
    if (!usuarioId) {
      return { success: false, error: 'Usuario autenticado nao identificado para o upload do documento assinado.' };
    }
    await uploadToR2(new Blob([signedBytes], { type: 'application/pdf' }), signedObjectKey, 'application/pdf', usuarioId);

    const { data: rpcData, error: rpcErr } = await supabase.rpc('fn_assinar_contrato', {
      p_assinatura_id: assinaturaId,
      p_signatario_nome: dadosSignatario.nome || null,
      p_signatario_email: dadosSignatario.email || null,
      p_signatario_cpf_cnpj: dadosSignatario.cpfCnpj || null,
      p_pdf_assinado_key: signedObjectKey,
      p_document_hash: signedHash,
      p_ip: ip || null,
      p_user_agent: userAgent || null,
    });

    const rpcResult = (rpcData ?? null) as { success?: boolean; error?: string } | null;
    if (rpcErr || !rpcResult?.success) {
      return { success: false, error: rpcErr?.message || rpcResult?.error || 'Falha ao registrar a assinatura.' };
    }

    await supabase.from('assinatura_eventos').insert({
      assinatura_id: assinaturaId,
      evento: 'ASSINADO',
      detalhes: {
        method: dadosSignatario.method || 'DRAWN',
        document_hash: signedHash,
        ip: ip || null,
        user_agent: userAgent || null,
        signatario: dadosSignatario.nome,
        pdf_assinado_key: signedObjectKey,
      },
    });

    return { success: true, pdfAssinadoKey: signedObjectKey, documentHash: signedHash };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao assinar o documento.' };
  }
}

export const contratoDocumentoService = {
  gerarDocumentoContrato,
  criarEnvelopeInterno,
  registrarVisualizacaoAssinatura,
  assinarDocumento,
  obterUrlDownload,
  baixarDocumento,
  visualizarDocumento,
  registrarDownloadDocumento,
  coletarDadosReais,
  montarDadosTemplate,
  preencherTemplate,
};
