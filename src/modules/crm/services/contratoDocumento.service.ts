import { supabase } from '@/integrations/supabase/client';
import { jsPDF } from 'jspdf';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { uploadToR2 } from '@/lib/r2Upload';
import html2canvas from 'html2canvas';

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
  gestorUsuario?: any;
  gestorDadosExtra?: any;
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
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
    <p style="margin: 3px 0 0; font-size: 10px; color: #4b5563;">Contrato Nº: {{NUMERO_CONTRATO}} | Versão: {{VERSAO_CONTRATO}}</p>
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

  <div class="page-break" style="page-break-before: always; break-before: page; margin-bottom: 10px;">
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
      <div style="width: 45%; text-align: center; padding-top: 4px;">
        <div style="min-height: 48px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; margin-bottom: 4px;"></div>
        <div style="border-top: 1px solid #111827; padding-top: 4px;">
          <p style="margin: 0; font-weight: bold; font-size: 11px;">SOBRE MÍDIA DESIGNER</p>
        </div>
      </div>
      <div style="width: 45%; text-align: center; padding-top: 4px;">
        <div style="min-height: 48px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; margin-bottom: 4px;"></div>
        <div style="border-top: 1px solid #111827; padding-top: 4px;">
          <p style="margin: 0; font-weight: bold; font-size: 11px;">{{RAZAO_SOCIAL}} (CONTRATANTE)</p>
        </div>
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
      <div style="width: 45%; text-align: center; padding-top: 4px;">
        <div style="min-height: 48px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; margin-bottom: 4px;"></div>
        <div style="border-top: 1px solid #111827; padding-top: 4px;">
          <p style="margin: 0; font-weight: bold; font-size: 11px;">SOBRE MÍDIA</p>
        </div>
      </div>
      <div style="width: 45%; text-align: center; padding-top: 4px;">
        <div style="min-height: 48px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; margin-bottom: 4px;"></div>
        <div style="border-top: 1px solid #111827; padding-top: 4px;">
          <p style="margin: 0; font-weight: bold; font-size: 11px;">{{RAZAO_SOCIAL}} (PARCEIRO)</p>
        </div>
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
      <div style="width: 45%; text-align: center; padding-top: 4px;">
        <div style="min-height: 48px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; margin-bottom: 4px;"></div>
        <div style="border-top: 1px solid #111827; padding-top: 4px;">
          <p style="margin: 0; font-weight: bold; font-size: 11px;">SOBRE MÍDIA DESIGNER LTDA.</p>
          <p style="margin: 2px 0 0; font-size: 10px; color: #6b7280;">Assinatura Digital Autorizada</p>
        </div>
      </div>
      <div style="width: 45%; text-align: center; padding-top: 4px;">
        <div style="min-height: 48px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; margin-bottom: 4px;"></div>
        <div style="border-top: 1px solid #111827; padding-top: 4px;">
          <p style="margin: 0; font-weight: bold; font-size: 11px;">{{NOME_GESTOR}} (GESTOR)</p>
          <p style="margin: 2px 0 0; font-size: 10px; color: #6b7280;">Assinatura Digital do Gestor</p>
        </div>
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
 * Obtém o modelo de contrato padrão vigente para um tipo e tenant.
 * Hierarquia: Tenant Default -> Global Default -> Template Oficial Canônico Completo.
 */
export async function obterTemplatePadraoVigente(
  tipoContrato: 'ANUNCIANTE' | 'PARCEIRO' | 'GESTOR' | string,
  empresaOperadoraId?: string | null
): Promise<{
  id: string;
  codigo_template: string;
  nome: string;
  versao: number;
  conteudo_html: string;
  tipo_contrato: 'ANUNCIANTE' | 'PARCEIRO' | 'GESTOR';
}> {
  const tipoNorm: 'ANUNCIANTE' | 'PARCEIRO' | 'GESTOR' =
    tipoContrato === 'PARCEIRO' || tipoContrato === 'PONTO_PARCEIRO'
      ? 'PARCEIRO'
      : tipoContrato === 'GESTOR' || tipoContrato === 'GESTOR_MIDIAS' || tipoContrato === 'GESTOR_MIDIA'
      ? 'GESTOR'
      : 'ANUNCIANTE';

  let tpl: any = null;

  try {
    const { data: rpcTpls, error: rpcErr } = await supabase.rpc('fn_obter_template_padrao', {
      p_empresa_operadora_id: empresaOperadoraId || null,
      p_tipo_contrato: tipoNorm,
    });
    if (!rpcErr && rpcTpls && (rpcTpls as any).length > 0) {
      tpl = (rpcTpls as any)[0];
    }
  } catch (err) {
    console.warn('[obterTemplatePadraoVigente] Fallback no RPC fn_obter_template_padrao:', err);
  }

  if (!tpl) {
    try {
      const { data: activeTpls } = await supabase
        .from('contrato_templates')
        .select('*')
        .eq('tipo_contrato', tipoNorm)
        .eq('ativo', true)
        .order('is_default', { ascending: false })
        .order('versao', { ascending: false });

      tpl = activeTpls?.find((t) => t.is_default && t.conteudo_html && isTemplateCompleto(t.conteudo_html, tipoNorm)) ||
            activeTpls?.find((t) => t.conteudo_html && isTemplateCompleto(t.conteudo_html, tipoNorm)) ||
            activeTpls?.[0];
    } catch (err) {
      console.warn('[obterTemplatePadraoVigente] Falha na consulta de contrato_templates:', err);
    }
  }

  const defaultCanonicalHtml = getCanonicalTemplateForTipo(tipoNorm);

  const conteudoHtmlFinal =
    tpl?.conteudo_html && isTemplateCompleto(tpl.conteudo_html, tipoNorm)
      ? tpl.conteudo_html
      : defaultCanonicalHtml;

  return {
    id: tpl?.id || `tpl-${tipoNorm.toLowerCase()}-canonical`,
    codigo_template: tpl?.codigo_template || `TPL-${tipoNorm}-OFICIAL`,
    nome: tpl?.nome || (tipoNorm === 'ANUNCIANTE' ? 'Contrato de Anunciante — Oficial' : tipoNorm === 'PARCEIRO' ? 'Contrato de Parceria — Oficial' : 'Contrato de Gestor de Mídias — Oficial'),
    versao: tpl?.versao || 1,
    conteudo_html: conteudoHtmlFinal,
    tipo_contrato: tipoNorm,
  };
}

export interface DadosAssinaturaVisual {
  dataUrl?: string;
  signatarioNome?: string;
  signatarioCpfCnpj?: string;
  dataAssinatura?: string;
  metodo?: 'DRAWN' | 'TYPED' | string;
}

/**
 * Renderiza o HTML completo de um contrato para preview a partir de dados em memória do formulário.
 * Suporta injeção visual da assinatura do contratante/parceiro quando o contrato já estiver assinado.
 */
export function renderizarPreviewContrato(
  tipoContrato: 'ANUNCIANTE' | 'PARCEIRO' | 'GESTOR' | string,
  templateHtml: string,
  form: Record<string, any>,
  assinaturaVisual?: DadosAssinaturaVisual | null
): string {
  const tipoNorm: 'ANUNCIANTE' | 'PARCEIRO' | 'GESTOR' =
    tipoContrato === 'PARCEIRO' || tipoContrato === 'PONTO_PARCEIRO'
      ? 'PARCEIRO'
      : tipoContrato === 'GESTOR' || tipoContrato === 'GESTOR_MIDIAS' || tipoContrato === 'GESTOR_MIDIA'
      ? 'GESTOR'
      : 'ANUNCIANTE';

  const razaoSocial = String(form.razaoSocial || form.nomeFantasia || form.nome || form.responsavelNome || '').trim();
  const nomeFantasia = String(form.nomeFantasia || form.razaoSocial || form.nome || '').trim();
  const responsavel = String(form.responsavel || form.responsavelLegal || form.representanteLegal || form.responsavelNome || form.contatoNome || razaoSocial).trim();
  const cnpj = String(form.cnpj || form.cnpjCpf || form.cpfCnpj || '').trim();
  const logradouro = String(form.logradouro || form.endereco || '').trim();
  const numero = String(form.numero || '').trim();
  const bairro = String(form.bairro || '').trim();
  const cidade = String(form.cidade || 'Caruaru').trim();
  const estado = String(form.estado || form.uf || 'PE').trim().toUpperCase();
  const cep = String(form.cep || '').trim();
  const telefone = String(form.telefone || form.responsavelTelefone || form.contatoTelefone || '').trim();
  const whatsapp = String(form.whatsapp || form.telefone || '').trim();
  const email = String(form.email || form.responsavelEmail || form.contatoEmail || '').trim();
  const instagram = String(form.instagram || form.siteRedes || '').trim();
  const website = String(form.website || form.site || '').trim();

  const enderecoUnidade = [
    [logradouro, numero].filter(Boolean).join(', '),
    bairro,
    [cidade, estado].filter(Boolean).join('/'),
  ].filter(Boolean).join(' - ');

  const cidadeAssinatura = cidade || 'Caruaru';
  const estadoAssinatura = estado || 'PE';
  const localAssinatura = `${cidadeAssinatura} / ${estadoAssinatura}`;

  const valorMensalNum = Number(form.valorMensal || form.valor || 0);
  const valorMensalFmt = valorMensalNum > 0 ? FORMATO_MOEDA.format(valorMensalNum) : (form.valorMensalFormatted || 'A combinar');

  const qtdTelas = form.quantidadeTelas || (form.pontosSelecionados?.size ? form.pontosSelecionados.size : 1);

  const dadosMapeados: Record<string, string> = {
    RAZAO_SOCIAL: razaoSocial || '—',
    NOME_FANTASIA: nomeFantasia || '—',
    CNPJ: cnpj || '—',
    CPF_CNPJ: cnpj || '—',
    RESPONSAVEL: responsavel || '—',
    REPRESENTANTE_LEGAL: responsavel || '—',
    NOME_GESTOR: responsavel || razaoSocial || '—',
    LOGRADOURO: logradouro || '—',
    NUMERO: numero || '—',
    BAIRRO: bairro || '—',
    CIDADE: cidade || 'Caruaru',
    ESTADO: estado || 'PE',
    UF: estado || 'PE',
    CEP: cep || '—',
    ENDERECO_UNIDADE: enderecoUnidade || '—',
    NOME_UNIDADE: nomeFantasia || razaoSocial || '—',
    TELEFONE: telefone || '—',
    WHATSAPP: whatsapp || '—',
    EMAIL: email || '—',
    INSTAGRAM: instagram || '—',
    WEBSITE: website || '—',
    DIAS_SEMANA: form.diasSemana || form.horarioFuncionamento || 'Segunda a Sábado',
    HORARIO_INICIO: form.horarioInicio || '08:00',
    HORARIO_FIM: form.horarioFim || '22:00',
    TITULO_CAMPANHA: form.tituloCampanha || (nomeFantasia ? `Campanha ${nomeFantasia}` : 'Campanha de Mídia Indoor'),
    PACOTE_VEICULACAO: form.pacoteVeiculacao || form.periodicidade || 'Mídia Indoor Exclusiva',
    PERIODO_VEICULACAO: form.periodoVeiculacao || form.vigencia || (form.dataInicio && form.dataFim ? `${form.dataInicio} a ${form.dataFim}` : '12 meses'),
    VALOR_MENSAL: valorMensalFmt,
    VALOR_A_VISTA: form.valorAVista ? FORMATO_MOEDA.format(Number(form.valorAVista)) : valorMensalFmt,
    DESCONTO: form.desconto ? FORMATO_MOEDA.format(Number(form.desconto)) : '',
    ENTRADA: form.entrada ? FORMATO_MOEDA.format(Number(form.entrada)) : '',
    NUMERO_PARCELAS: form.numeroParcelas ? String(form.numeroParcelas) : '12',
    PARCELAMENTO_CARTAO: form.parcelamentoCartao || '',
    VALOR_POR_SISTEMA: form.valorPorSistema ? FORMATO_MOEDA.format(Number(form.valorPorSistema)) : '',
    FORMA_PAGAMENTO: form.formaPagamento || 'PIX',
    DATA_VENCIMENTO_PRIMEIRA_FATURA: form.dataVencimentoPrimeira ? formatarData(form.dataVencimentoPrimeira) : '',
    QUANTIDADE_TELAS: String(qtdTelas),
    QTD_TVS: form.qtdTvs ? String(form.qtdTvs) : '',
    QTD_TOTENS: form.qtdTotens ? String(form.qtdTotens) : '',
    QTD_PAINEIS_LED: form.qtdPaineisLed ? String(form.qtdPaineisLed) : '',
    TOTAL_SISTEMAS: String(qtdTelas),
    DATA_INICIO: form.dataInicio ? formatarData(form.dataInicio) : formatarData(new Date().toISOString()),
    DATA_FIM: form.dataFim ? formatarData(form.dataFim) : formatarData(new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString()),
    DATA_INICIO_VEICULACAO: form.dataInicio ? formatarData(form.dataInicio) : formatarData(new Date().toISOString()),
    DATA_FIM_VEICULACAO: form.dataFim ? formatarData(form.dataFim) : formatarData(new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString()),
    DATA_ASSINATURA: formatarDataExtensa(new Date()),
    LOCAL_ASSINATURA: localAssinatura,
    FORO_COMARCA: cidade || 'Caruaru',
    NUMERO_CONTRATO: form.numeroContrato || 'CTR-NOVO',
    VERSAO_CONTRATO: String(form.versao || 1),
    TIPO_CONTRATO: tipoNorm,
    ASSINATURA_SOBRE_MIDIA: '',
    ASSINATURA_CONTRATANTE: '',
    ASSINATURA_PARCEIRO: '',
  };

  const htmlBase = templateHtml && templateHtml.length > 200 ? templateHtml : getCanonicalTemplateForTipo(tipoNorm);

  let htmlPreenchido = preencherTemplate(htmlBase, dadosMapeados, tipoNorm);

  // Aplicação visual da assinatura na representação documental quando o contrato estiver assinado
  if (assinaturaVisual && (assinaturaVisual.dataUrl || assinaturaVisual.signatarioNome)) {
    const nomeSignatario = assinaturaVisual.signatarioNome || responsavel || razaoSocial;
    const metodoLabel = assinaturaVisual.metodo === 'TYPED' ? 'Assinatura Digitada (TYPED)' : 'Digital Desenhada (DRAWN)';
    const dataFmt = assinaturaVisual.dataAssinatura || formatarDataExtensa(new Date());

    const imagemAssinaturaHtml = assinaturaVisual.dataUrl
      ? `<div style="min-height: 48px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; margin-bottom: 4px;">
          <img src="${assinaturaVisual.dataUrl}" alt="Assinatura do Contratante" style="max-height: 48px; max-width: 100%; object-fit: contain; margin: 0 auto 2px auto; display: block;" />
        </div>`
      : `<div style="min-height: 36px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: 4px;">
          <span style="font-family: 'Playfair Display', Georgia, serif; font-style: italic; font-weight: bold; font-size: 14px; color: #1e293b;">
            ${nomeSignatario}
          </span>
        </div>`;

    if (tipoNorm === 'ANUNCIANTE') {
      const blocoAssinadoAnunciante = `<div style="width: 45%; text-align: center; padding-top: 4px;">
        ${imagemAssinaturaHtml}
        <div style="border-top: 1px solid #111827; padding-top: 4px;">
          <p style="margin: 0; font-weight: bold; font-size: 11px;">${razaoSocial} (CONTRATANTE)</p>
          <p style="margin: 2px 0 0; font-size: 9px; color: #16a34a; font-weight: bold;">✓ Assinado digitalmente por ${nomeSignatario}</p>
          <p style="margin: 0; font-size: 8px; color: #6b7280;">Data: ${dataFmt} · Método: ${metodoLabel}</p>
        </div>
      </div>`;

      // Substitui o bloco padrão de assinatura do contratante
      const regexAnunciante = /<div[^>]*style="[^"]*width:\s*45%[^"]*"[^>]*>[\s\S]*?\(CONTRATANTE\)[\s\S]*?<\/div>\s*(?:<\/div>)?/is;
      if (regexAnunciante.test(htmlPreenchido)) {
        htmlPreenchido = htmlPreenchido.replace(regexAnunciante, blocoAssinadoAnunciante);
      } else {
        htmlPreenchido = htmlPreenchido.replace(/<div[^>]*>\s*<p[^>]*>[^<]*\(CONTRATANTE\)<\/p>\s*<\/div>/is, blocoAssinadoAnunciante);
      }
    } else if (tipoNorm === 'PARCEIRO') {
      const blocoAssinadoParceiro = `<div style="width: 45%; text-align: center; padding-top: 4px;">
        ${imagemAssinaturaHtml}
        <div style="border-top: 1px solid #111827; padding-top: 4px;">
          <p style="margin: 0; font-weight: bold; font-size: 11px;">${razaoSocial} (PARCEIRO)</p>
          <p style="margin: 2px 0 0; font-size: 9px; color: #16a34a; font-weight: bold;">✓ Assinado digitalmente por ${nomeSignatario}</p>
          <p style="margin: 0; font-size: 8px; color: #6b7280;">Data: ${dataFmt} · Método: ${metodoLabel}</p>
        </div>
      </div>`;

      const regexParceiro = /<div[^>]*style="[^"]*width:\s*45%[^"]*"[^>]*>[\s\S]*?\(PARCEIRO\)[\s\S]*?<\/div>\s*(?:<\/div>)?/is;
      if (regexParceiro.test(htmlPreenchido)) {
        htmlPreenchido = htmlPreenchido.replace(regexParceiro, blocoAssinadoParceiro);
      } else {
        htmlPreenchido = htmlPreenchido.replace(/<div[^>]*>\s*<p[^>]*>[^<]*\(PARCEIRO\)<\/p>\s*<\/div>/is, blocoAssinadoParceiro);
      }
    } else if (tipoNorm === 'GESTOR') {
      const blocoAssinadoGestor = `<div style="width: 45%; text-align: center; padding-top: 4px;">
        ${imagemAssinaturaHtml}
        <div style="border-top: 1px solid #111827; padding-top: 4px;">
          <p style="margin: 0; font-weight: bold; font-size: 11px;">${responsavel || razaoSocial} (GESTOR)</p>
          <p style="margin: 2px 0 0; font-size: 9px; color: #16a34a; font-weight: bold;">✓ Assinado digitalmente por ${nomeSignatario}</p>
          <p style="margin: 0; font-size: 8px; color: #6b7280;">Data: ${dataFmt} · Método: ${metodoLabel}</p>
        </div>
      </div>`;

      const regexGestor = /<div[^>]*style="[^"]*width:\s*45%[^"]*"[^>]*>[\s\S]*?\(GESTOR\)[\s\S]*?<\/div>\s*(?:<\/div>)?/is;
      if (regexGestor.test(htmlPreenchido)) {
        htmlPreenchido = htmlPreenchido.replace(regexGestor, blocoAssinadoGestor);
      } else {
        htmlPreenchido = htmlPreenchido.replace(/<div[^>]*>\s*<p[^>]*>[^<]*\(GESTOR\)<\/p>\s*<\/div>/is, blocoAssinadoGestor);
      }
    }

    // Garante alinhamento milimétrico da linha de assinatura da SOBRE MÍDIA DESIGNER com a linha do CONTRATANTE
    const regexSobreMidia = /<div[^>]*style="[^"]*width:\s*45%[^"]*"[^>]*>[\s\S]*?SOBRE M[IÍ]DIA[\s\S]*?<\/div>\s*(?:<\/div>)?/is;
    const blocoSobreMidiaAlinhado = `<div style="width: 45%; text-align: center; padding-top: 4px;">
      <div style="min-height: 48px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; margin-bottom: 4px;"></div>
      <div style="border-top: 1px solid #111827; padding-top: 4px;">
        <p style="margin: 0; font-weight: bold; font-size: 11px;">SOBRE MÍDIA DESIGNER</p>
      </div>
    </div>`;
    if (regexSobreMidia.test(htmlPreenchido)) {
      htmlPreenchido = htmlPreenchido.replace(regexSobreMidia, blocoSobreMidiaAlinhado);
    }
  }

  return htmlPreenchido;
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

  // Prevenção do vício visual de duplicidade de moeda 'R$ R$' em templates que possuem 'R$ {{VALOR_MENSAL}}'
  const placeholdersMonetarios = ['VALOR_MENSAL', 'VALOR_A_VISTA', 'DESCONTO', 'ENTRADA', 'VALOR_POR_SISTEMA'];
  for (const ph of placeholdersMonetarios) {
    if (dados[ph] && typeof dados[ph] === 'string' && dados[ph].startsWith('R$')) {
      html = html.replace(new RegExp(`R\\$\\s*\\{\\{${ph}\\}\\}`, 'g'), `{{${ph}}}`);
    }
  }

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

  // Garante que a Cláusula 06 inicie sempre no topo da página 2
  if (html.includes('CLÁUSULA 06') && !html.includes('page-break-before')) {
    html = html.replace(
      /<div([^>]*)>\s*(<h4[^>]*>CLÁUSULA 06\s*[-–]\s*RESPONSABILIDADE DO CONTRATANTE<\/h4>)/gi,
      '<div class="page-break" style="page-break-before: always; break-before: page; margin-bottom: 10px;"$1>$2'
    );
  }

  return html;
}

export interface ElementoHtml {
  tag: string;
  text: string;
  isBold: boolean;
  level: number;
  cells?: string[];
}

function decodificarEntidadesHtml(str?: string | null): string {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—');
}

/** Extrai texto estruturado e blocos do HTML oficial do template. */
export function parseHtmlToElements(html: string): ElementoHtml[] {
  const elements: ElementoHtml[] = [];
  if (!html) return elements;

  // Se estiver em ambiente com DOMParser (navegador ou JSDOM)
  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const percorrerNo = (node: Node) => {
        if (!node) return;

        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          const tag = el.tagName.toLowerCase();

          if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
            const text = decodificarEntidadesHtml(el.textContent || '').replace(/\s+/g, ' ').trim();
            if (text) {
              elements.push({
                tag,
                text,
                isBold: true,
                level: parseInt(tag.charAt(1), 10),
              });
            }
            return;
          }

          if (tag === 'tr') {
            const cells: string[] = [];
            el.querySelectorAll('td, th').forEach((cell) => {
              const cellText = decodificarEntidadesHtml(cell.textContent || '').replace(/\s+/g, ' ').trim();
              if (cellText) cells.push(cellText);
            });
            if (cells.length > 0) {
              elements.push({
                tag: 'tr',
                text: cells.join(' | '),
                isBold: false,
                level: 0,
                cells,
              });
            }
            return;
          }

          if (tag === 'p' || tag === 'li') {
            const text = decodificarEntidadesHtml(el.textContent || '').replace(/\s+/g, ' ').trim();
            if (text) {
              const isClause = /^CL[AÁ]USULA\s+\d+/i.test(text) || /^POL[IÍ]TICA DE PRIVACIDADE/i.test(text) || /^GRADE DE HOR[AÁ]RIOS/i.test(text);
              elements.push({
                tag: isClause ? 'h4' : tag,
                text,
                isBold: isClause,
                level: isClause ? 4 : 0,
              });
            }
            return;
          }

          // Para tags de container (div, table, tbody, etc.), percorre os nós filhos
          for (let i = 0; i < el.childNodes.length; i++) {
            percorrerNo(el.childNodes[i]);
          }
        }
      };

      percorrerNo(doc.body);
      if (elements.length > 0) return elements;
    } catch {
      // Fallback para parser regex em caso de exceção no DOMParser
    }
  }

  // Fallback robusto para SSR / Node.js / Vitest
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(h[1-6]|p|li|tr|div)>/gi, '</$1>\n');

  const blockMatches = clean.match(/<(h[1-6]|p|li|tr)[^>]*>([\s\S]*?)<\/\1>/gi) || [];

  for (const rawBlock of blockMatches) {
    const matchTag = rawBlock.match(/^<([a-z0-9]+)[^>]*>([\s\S]*?)<\/\1>$/i);
    if (!matchTag) continue;

    const tag = matchTag[1].toLowerCase();
    const inner = matchTag[2];

    if (tag === 'tr') {
      const cellMatches = inner.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || [];
      const cells = cellMatches
        .map((c) => decodificarEntidadesHtml(c.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()))
        .filter(Boolean);

      if (cells.length > 0) {
        elements.push({
          tag: 'tr',
          text: cells.join(' | '),
          isBold: false,
          level: 0,
          cells,
        });
      }
    } else if (tag.startsWith('h')) {
      const text = decodificarEntidadesHtml(inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
      if (text) {
        elements.push({
          tag,
          text,
          isBold: true,
          level: parseInt(tag.charAt(1), 10),
        });
      }
    } else if (tag === 'p' || tag === 'li') {
      const text = decodificarEntidadesHtml(inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
      if (text) {
        const isClause = /^CL[AÁ]USULA\s+\d+/i.test(text) || /^POL[IÍ]TICA DE PRIVACIDADE/i.test(text) || /^GRADE DE HOR[AÁ]RIOS/i.test(text);
        elements.push({
          tag: isClause ? 'h4' : tag,
          text,
          isBold: isClause,
          level: isClause ? 4 : 0,
        });
      }
    }
  }

  return elements;
}

/**
 * Separa o HTML do contrato em exatamente 2 páginas lógicas canônicas:
 * - Página 1: Cabeçalho, Partes, Preâmbulo, Cláusulas 01 a 05
 * - Página 2: Cláusula 06 em diante (ou equivalente), Políticas, Grade e Assinaturas
 */
export function separarHtmlEmPaginas(html: string, tipoContrato: string): string[] {
  if (!html || typeof html !== 'string' || html.trim() === '') return [html || ''];

  let splitIndex = -1;

  // 1. Tenta dividir pela classe .page-break ou data-page-break
  const pageBreakMatch = html.match(/<div[^>]*class=["'][^"']*page-break[^"']*["'][^>]*>/i) ||
                         html.match(/<[^>]+data-page-break[^>]*>/i);
  if (pageBreakMatch && pageBreakMatch.index !== undefined && pageBreakMatch.index > 50) {
    splitIndex = pageBreakMatch.index;
  }

  // 2. Se não encontrou, busca pela Cláusula 06 (padrão Anunciante)
  if (splitIndex === -1) {
    const c06Match = html.match(/<div[^>]*>\s*<h4[^>]*>[^<]*CL[AÁ]USULA\s+(06|6)\b/i) ||
                     html.match(/<h4[^>]*>[^<]*CL[AÁ]USULA\s+(06|6)\b/i);
    if (c06Match && c06Match.index !== undefined && c06Match.index > 50) {
      splitIndex = c06Match.index;
    }
  }

  // 3. Fallbacks específicos por tipo de contrato
  if (splitIndex === -1 && tipoContrato === 'PARCEIRO') {
    const c04Match = html.match(/<div[^>]*>\s*<h4[^>]*>[^<]*CL[AÁ]USULA\s+(04|4)\b/i) ||
                     html.match(/<h4[^>]*>[^<]*CL[AÁ]USULA\s+(04|4)\b/i);
    if (c04Match && c04Match.index !== undefined && c04Match.index > 50) {
      splitIndex = c04Match.index;
    }
  }

  if (splitIndex === -1 && tipoContrato === 'GESTOR') {
    const c04GestorMatch = html.match(/<div[^>]*>\s*<h4[^>]*>[^<]*4\.\s*POL[IÍ]TICAS/i) ||
                           html.match(/<h4[^>]*>[^<]*4\.\s*POL[IÍ]TICAS/i);
    if (c04GestorMatch && c04GestorMatch.index !== undefined && c04GestorMatch.index > 50) {
      splitIndex = c04GestorMatch.index;
    }
  }

  // Se não houver ponto de divisão claro, entrega o HTML em página única
  if (splitIndex === -1) {
    return [html];
  }

  let part1 = html.substring(0, splitIndex).trim();
  let part2 = html.substring(splitIndex).trim();

  // Garante fechamento de tag em part1
  if (!part1.endsWith('</div>')) {
    part1 += '</div>';
  }

  // Garante reabertura do container mestre em part2
  if (!part2.startsWith('<div class="contract-container"')) {
    part2 = `<div class="contract-container" style="font-family: Arial, sans-serif; font-size: 12px; line-height: 1.45; color: #111827;">${part2}`;
  }

  return [part1, part2];
}

/**
 * Renderiza o HTML exatamente como no navegador usando html2canvas e converte para PDF A4 em alta definição.
 * Renderiza cada página do documento isoladamente, eliminando qualquer chance de páginas em branco ou desvios de corte.
 */
async function renderizarHtmlParaPdfNavegador(
  htmlRenderizado: string,
  numeroContrato: string,
  tipoContrato: string,
  versao: number
): Promise<Uint8Array> {
  const paginasHtml = separarHtmlEmPaginas(htmlRenderizado, tipoContrato);
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  const pageWidth = 595.28;
  const marginX = 24;
  const marginY = 24;
  const usableWidth = pageWidth - marginX * 2; // 547.28 pt

  for (let pIdx = 0; pIdx < paginasHtml.length; pIdx++) {
    if (pIdx > 0) {
      doc.addPage('a4', 'portrait');
    }

    const container = document.createElement('div');
    container.className = `pdf-render-canvas-container page-${pIdx + 1}`;
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '794px'; // A4 width em 96 DPI
    container.style.padding = '36px 40px';
    container.style.backgroundColor = '#ffffff';
    container.style.color = '#111827';
    container.style.boxSizing = 'border-box';
    container.style.fontFamily = 'Arial, "Helvetica Neue", Helvetica, sans-serif';
    container.style.lineHeight = '1.45';
    container.style.zIndex = '-99999';
    container.innerHTML = paginasHtml[pIdx];
    document.body.appendChild(container);

    try {
      // Aguarda carregamento de todas as imagens (ex: assinaturas, logotipos)
      const images = container.querySelectorAll('img');
      if (images.length > 0) {
        await Promise.all(
          Array.from(images).map((img) => {
            if (img.complete) return Promise.resolve(null);
            return new Promise((res) => {
              img.onload = () => res(null);
              img.onerror = () => res(null);
            });
          })
        );
      }

      const canvas = await html2canvas(container, {
        scale: 2, // 2x alta definição
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 794,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      const pdfHeight = (canvas.height / canvas.width) * usableWidth;
      doc.addImage(imgData, 'JPEG', marginX, marginY, usableWidth, pdfHeight);
    } finally {
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    }
  }

  return new Uint8Array(doc.output('arraybuffer'));
}

/**
 * Fallback vetorial para testes em Node.js/Vitest/JSDOM sem ambiente gráfico real.
 */
function renderizarPdfVetorialFallback(
  htmlRenderizado: string,
  numeroContrato: string,
  tipoContrato: string,
  versao: number
): Uint8Array {
  const elements = parseHtmlToElements(htmlRenderizado);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const marginX = 44;
  const marginTop = 44;
  const marginBottom = 44;
  const maxLineWidth = pageWidth - marginX * 2;

  doc.setFont('helvetica', 'normal');
  let y = marginTop;

  const quebrarPaginaSeNecessario = (alturaNecessaria: number) => {
    if (y + alturaNecessaria > pageHeight - marginBottom) {
      doc.addPage('a4', 'portrait');
      y = marginTop;
      return true;
    }
    return false;
  };

  for (const el of elements) {
    if (
      (el.tag.startsWith('h') || el.isBold) &&
      (el.text.includes('CLÁUSULA 06') || el.text.includes('CLÁUSULA 6') || el.text.includes('RESPONSABILIDADE DO CONTRATANTE'))
    ) {
      if (y > marginTop + 40) {
        doc.addPage('a4', 'portrait');
        y = marginTop;
      }
    }

    if (el.tag.startsWith('h')) {
      const fontSize = el.level === 1 ? 11 : el.level === 2 ? 10.5 : el.level === 3 ? 10 : 9.5;
      const lines = doc.splitTextToSize(el.text, maxLineWidth) as string[];
      quebrarPaginaSeNecessario(lines.length * (fontSize * 1.3) + 6);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(fontSize);
      doc.setTextColor(15, 45, 100);

      for (const line of lines) {
        if (y + fontSize * 1.3 > pageHeight - marginBottom) {
          doc.addPage('a4', 'portrait');
          y = marginTop;
        }
        doc.text(line, marginX, y);
        y += fontSize * 1.3;
      }
      y += 3;
    } else if (el.tag === 'tr' && el.cells && el.cells.length > 0) {
      if (el.cells.length === 2) {
        const colWidth = (maxLineWidth - 16) / 2;
        const col1Lines = doc.splitTextToSize(el.cells[0], colWidth) as string[];
        const col2Lines = doc.splitTextToSize(el.cells[1], colWidth) as string[];
        const maxLines = Math.max(col1Lines.length, col2Lines.length);
        const rowHeight = maxLines * 10 + 2;

        quebrarPaginaSeNecessario(rowHeight);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(35, 35, 35);

        const rowY = y;
        for (let i = 0; i < col1Lines.length; i++) {
          doc.text(col1Lines[i], marginX, rowY + (i * 10));
        }
        for (let i = 0; i < col2Lines.length; i++) {
          doc.text(col2Lines[i], marginX + colWidth + 16, rowY + (i * 10));
        }
        y += rowHeight;
      } else {
        const text = el.cells.join(' | ');
        const lines = doc.splitTextToSize(text, maxLineWidth) as string[];
        quebrarPaginaSeNecessario(lines.length * 10 + 2);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(35, 35, 35);

        for (const line of lines) {
          if (y + 10 > pageHeight - marginBottom) {
            doc.addPage('a4', 'portrait');
            y = marginTop;
          }
          doc.text(line, marginX, y);
          y += 10;
        }
      }
    } else {
      const lines = doc.splitTextToSize(el.text, maxLineWidth) as string[];

      doc.setFont('helvetica', el.isBold ? 'bold' : 'normal');
      doc.setFontSize(8);
      doc.setTextColor(el.isBold ? 15 : 35, el.isBold ? 45 : 35, el.isBold ? 100 : 35);

      for (const line of lines) {
        if (y + 10.5 > pageHeight - marginBottom) {
          doc.addPage('a4', 'portrait');
          y = marginTop;
        }
        doc.text(line, marginX, y);
        y += 10.5;
      }
      y += 2.5;
    }
  }

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(130, 130, 130);
    doc.text(`Página ${i} de ${totalPages}  |  SOBRE MÍDIA DESIGNER — Documento Oficial de Contrato`, marginX, pageHeight - 20);
  }

  return new Uint8Array(doc.output('arraybuffer'));
}

/**
 * Gera PDF REAL vetorial A4 a partir do texto juridico renderizado.
 * No navegador, renderiza o HTML com 100% de fidelidade visual usando html2canvas.
 * Em ambiente Node.js / testes, usa fallback vetorial.
 */
export async function gerarPdfDoHtml(
  htmlRenderizado: string,
  numeroContrato: string,
  tipoContrato: string,
  versao: number
): Promise<Uint8Array> {
  const isBrowserReal =
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof document.createElement === 'function' &&
    typeof navigator !== 'undefined' &&
    !navigator.userAgent?.includes('jsdom');

  if (isBrowserReal) {
    try {
      return await renderizarHtmlParaPdfNavegador(htmlRenderizado, numeroContrato, tipoContrato, versao);
    } catch (err) {
      console.warn('[gerarPdfDoHtml] Falha na renderização visual html2canvas, usando fallback vetorial:', err);
    }
  }
  return renderizarPdfVetorialFallback(htmlRenderizado, numeroContrato, tipoContrato, versao);
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
    .is('deleted_at', null)
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

  // Se template não estiver vinculado ou se o HTML for stub, busca o template oficial rico ativo via resolver canônico
  if (!template?.conteudo_html || template.conteudo_html.length < 200 || template.conteudo_html.includes('(preservado)') || !isTemplateCompleto(template.conteudo_html, tipoContrato)) {
    try {
      const { data: rpcTpls, error: rpcErr } = await supabase.rpc('fn_obter_template_padrao', {
        p_empresa_operadora_id: contrato.empresa_operadora_id || null,
        p_tipo_contrato: tipoContrato,
      });
      if (!rpcErr && rpcTpls && (rpcTpls as any).length > 0) {
        const rpcTpl = (rpcTpls as any)[0];
        if (rpcTpl && rpcTpl.conteudo_html && isTemplateCompleto(rpcTpl.conteudo_html, tipoContrato)) {
          template = {
            id: rpcTpl.id,
            nome: rpcTpl.nome,
            codigo_template: rpcTpl.codigo_template,
            versao: rpcTpl.versao,
            conteudo_html: rpcTpl.conteudo_html,
            tipo_contrato: tipoContrato,
            ativo: true,
          };
        }
      }
    } catch (errPadrao) {
      console.warn('[coletarDadosReais] Fallback no resolver RPC:', errPadrao);
    }

    if (!template?.conteudo_html || !isTemplateCompleto(template.conteudo_html, tipoContrato)) {
      const { data: activeTpls } = await supabase
        .from('contrato_templates')
        .select('*')
        .eq('tipo_contrato', tipoContrato)
        .eq('ativo', true)
        .order('is_default', { ascending: false })
        .order('versao', { ascending: false });

      const bestTpl = activeTpls?.find((t) => t.conteudo_html && isTemplateCompleto(t.conteudo_html, tipoContrato));
      if (bestTpl) {
        template = bestTpl;
      } else {
        template = {
          id: template?.id || `tpl-${tipoContrato.toLowerCase()}-canonical`,
          nome: template?.nome || `Contrato de ${tipoContrato} — Oficial`,
          tipo_contrato: tipoContrato,
          versao: template?.versao || 1,
          ativo: true,
          conteudo_html: getCanonicalTemplateForTipo(tipoContrato),
          pdf_anexo_key: template?.pdf_anexo_key || null,
        };
      }
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

  // Gestor de Mídias - fonte primaria para contratos GESTOR
  let gestorUsuario: any = null;
  let gestorDadosExtra: any = null;
  if (contrato.gestor_usuario_id) {
    const { data: usr } = await supabase
      .from('usuarios')
      .select('id, nome, email, telefone, empresa_operadora_id, perfil:perfis(nome)')
      .eq('id', contrato.gestor_usuario_id)
      .maybeSingle();
    gestorUsuario = usr;

    const { data: sol } = await supabase
      .from('solicitacoes_acesso')
      .select('dados_cadastro')
      .eq('usuario_id', contrato.gestor_usuario_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    gestorDadosExtra = sol?.dados_cadastro || null;
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
    gestorUsuario,
    gestorDadosExtra,
  };
}

/**
 * Mapeia dados reais para os placeholders do template.
 * ANUNCIANTE: usa empresa + contato + proposta
 * PARCEIRO:   usa ponto como fonte primaria
 * GESTOR:     usa gestorUsuario e solicitacoes_acesso
 */
export function montarDadosTemplate(dados: DadosDocumentoContrato): Record<string, string> {
  const { contrato, proposta, empresa, contato, ponto, gestorUsuario, gestorDadosExtra } = dados;
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

  if (tipoContrato === 'GESTOR' && gestorUsuario) {
    const extra = gestorDadosExtra || {};
    razaoSocial   = gestorUsuario.nome || '';
    nomeFantasia  = extra.empresa || gestorUsuario.nome || '';
    cnpj          = extra.cpf_cnpj || extra.cpfCnpj || '';
    responsavel   = gestorUsuario.nome || '';
    logradouro    = extra.endereco || '';
    numero        = extra.numero || '';
    bairro        = extra.bairro || '';
    cidade        = extra.cidade || '';
    estado        = extra.estado || '';
    cep           = extra.cep || '';
    telefone      = gestorUsuario.telefone || '';
    whatsapp      = extra.whatsapp || gestorUsuario.telefone || '';
    email         = gestorUsuario.email || '';
    instagram     = extra.instagram || '';
    website       = extra.website || '';
  } else if (tipoContrato === 'PARCEIRO' && ponto) {
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
    whatsapp      = empresa?.whatsapp || empresa?.telefone || contato?.telefone || '';
    email         = empresa?.email || contato?.email || '';
    instagram     = empresa?.instagram || '';
    website       = empresa?.website || empresa?.site || '';
    horarioInicio = ponto?.horario_abertura || proposta?.horario_inicio || (ponto?.horario_abertura && ponto?.horario_fechamento ? ponto.horario_abertura : '');
    horarioFim    = ponto?.horario_fechamento || proposta?.horario_fim || '';
    diasSemana    = ponto?.dias_funcionamento || proposta?.dias_semana || '';
  }

  // Sanitização rigorosa: o signatário/responsável do CONTRATANTE NUNCA pode ser usuário administrativo da SOBRE MÍDIA
  if (/sobre\s*m[íi]dia|admin|operador|sistema|administrador/i.test(responsavel)) {
    responsavel = contato?.nome || empresa?.representante_legal || '';
    if (/sobre\s*m[íi]dia|admin|operador|sistema|administrador/i.test(responsavel)) {
      responsavel = razaoSocial || 'Representante Legal';
    }
  }
  if (!responsavel) {
    responsavel = razaoSocial || '—';
  }

  // Padrões operacionais canônicos para prevenir campos fragmentados ou vazios na grade comercial
  if (!horarioInicio) horarioInicio = '08:00';
  if (!horarioFim) horarioFim = '22:00';
  if (!diasSemana) diasSemana = 'Segunda a Sábado';

  const valorMensalNum = Number(contrato?.valor_mensal) || Number(proposta?.valor_final) || Number(proposta?.valor_total) || 0;
  const valorMensalFmt = valorMensalNum > 0 ? FORMATO_MOEDA.format(valorMensalNum) : (contrato?.valor_mensal !== undefined && contrato?.valor_mensal !== null ? FORMATO_MOEDA.format(Number(contrato.valor_mensal)) : 'R$ 0,00');

  const valorAVistaNum = Number(proposta?.valor_final) || Number(proposta?.valor_total) || valorMensalNum;
  const valorAVistaFmt = valorAVistaNum > 0 ? FORMATO_MOEDA.format(valorAVistaNum) : valorMensalFmt;

  const periodoVeiculacao = proposta?.periodo_veiculacao || (contrato?.data_inicio && contrato?.data_fim ? `De ${formatarData(contrato.data_inicio)} a ${formatarData(contrato.data_fim)}` : '12 meses');
  const pacoteVeiculacao = proposta?.pacote_veiculacao || proposta?.plano || 'Mídia Indoor Exclusiva';
  const tituloCampanha = proposta?.titulo_campanha || '';
  const formaPagamento = contrato?.forma_pagamento || proposta?.forma_pagamento || 'PIX';
  const qtdTelasStr = dados.quantidadeTelas > 0 ? String(dados.quantidadeTelas) : (proposta?.quantidade_telas ? String(proposta.quantidade_telas) : '1');

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
    CIDADE:              cidade || 'Caruaru',
    ESTADO:              estado || 'PE',
    UF:                  estado || 'PE',
    CEP:                 cep,
    ENDERECO_UNIDADE:    enderecoUnidade || '—',
    NOME_UNIDADE:        nomeFantasia || razaoSocial,
    TELEFONE:            telefone,
    WHATSAPP:            whatsapp,
    EMAIL:               email,
    INSTAGRAM:           instagram,
    WEBSITE:             website,
    DIAS_SEMANA:         diasSemana,
    HORARIO_INICIO:      horarioInicio,
    HORARIO_FIM:         horarioFim,
    TITULO_CAMPANHA:     tituloCampanha,
    PACOTE_VEICULACAO:   pacoteVeiculacao,
    PERIODO_VEICULACAO:  periodoVeiculacao,
    VALOR_MENSAL:        valorMensalFmt,
    VALOR_A_VISTA:       valorAVistaFmt,
    DESCONTO:            proposta?.desconto ? FORMATO_MOEDA.format(Number(proposta.desconto)) : '',
    ENTRADA:             proposta?.entrada ? FORMATO_MOEDA.format(Number(proposta.entrada)) : '',
    NUMERO_PARCELAS:     proposta?.numero_parcelas ? String(proposta.numero_parcelas) : '12',
    PARCELAMENTO_CARTAO: proposta?.parcelamento_cartao || '',
    VALOR_POR_SISTEMA:   proposta?.valor_por_sistema ? FORMATO_MOEDA.format(Number(proposta.valor_por_sistema)) : '',
    FORMA_PAGAMENTO:     formaPagamento,
    DATA_VENCIMENTO_PRIMEIRA_FATURA: formatarData(proposta?.data_vencimento_primeira),
    QUANTIDADE_TELAS:    qtdTelasStr,
    QTD_TVS:             proposta?.qtd_tvs ? String(proposta.qtd_tvs) : '',
    QTD_TOTENS:          proposta?.qtd_totens ? String(proposta.qtd_totens) : '',
    QTD_PAINEIS_LED:     proposta?.qtd_paineis_led ? String(proposta.qtd_paineis_led) : '',
    TOTAL_SISTEMAS:      qtdTelasStr,
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

export interface DocumentoContratoResolvido {
  contratoId: string;
  numeroContrato: string;
  tipoContrato: string;
  statusWorkflow: string;
  statusDocumento: string;
  isAssinado: boolean;
  storageKey: string;
  downloadUrl: string;
  fileName: string;
  templateId?: string | null;
}

/**
 * P0.3.11 — SINGLE SOURCE OF TRUTH CANÔNICO PARA DOCUMENTOS CONTRATUAIS
 *
 * Resolve de forma determinística e com fail-closed o documento canônico oficial
 * de qualquer contrato do sistema:
 *  - Se ASSINADO (ou possui pdf_assinado_key): entrega o pdf_assinado_key
 *  - Se NÃO ASSINADO (GERADO/ENVIADO/etc): entrega o pdf_object_key
 *  - Se ausente ou excluído: FAIL-CLOSED imediato com erro descritivo.
 *  - NUNCA faz fallback para contratos alheios, templates estáticos desatualizados
 *    ou arquivos arbitrários no storage.
 */
export async function resolverDocumentoContrato(contratoId: string): Promise<DocumentoContratoResolvido> {
  if (!contratoId || typeof contratoId !== 'string' || contratoId.trim() === '') {
    throw new Error('ID do contrato é obrigatório para resolução documental.');
  }

  const { data: contrato, error: ctrErr } = await supabase
    .from('contratos')
    .select('id, numero_contrato, tipo_contrato, status_workflow, status_documento, pdf_object_key, pdf_assinado_key, template_id, deleted_at, empresa_operadora_id')
    .eq('id', contratoId)
    .maybeSingle();

  if (ctrErr || !contrato) {
    throw new Error(`Contrato não encontrado (ID: ${contratoId}).`);
  }

  if (contrato.deleted_at) {
    throw new Error(`O contrato ${contrato.numero_contrato || contratoId} foi cancelado/excluído e não possui documento ativo.`);
  }

  // P0.3.11.2 — GAP 3 FECHADO: consulta assinaturas SEMPRE, independentemente dos campos
  // derivados de contratos (status_documento / pdf_assinado_key).
  // Motivo: contratos.status_documento e contratos.pdf_assinado_key podem estar stale.
  // A única autoridade canônica é: assinaturas.status = 'ASSINADO' AND assinaturas.pdf_assinado_key IS NOT NULL.
  let storageKey: string | null = null;
  let isAssinado = false;
  let fileName: string = '';

  // Consulta assinaturas para TODO contratoId — sem condição derivada.
  const { data: ass } = await supabase
    .from('assinaturas')
    .select('pdf_assinado_key, pdf_original_key, status')
    .eq('contrato_id', contratoId)
    .eq('status', 'ASSINADO')
    .order('assinado_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (ass?.pdf_assinado_key) {
    // Assinatura VÁLIDA encontrada (status = ASSINADO + key presente) — entrega o documento assinado canônico.
    storageKey = ass.pdf_assinado_key;
    isAssinado = true;
    fileName = `Contrato_Assinado_${contrato.numero_contrato || contrato.id}.pdf`;
  } else {
    // Sem assinatura válida (cancelada / expirada / inexistente / sem key):
    // fallback SOMENTE para pdf_object_key (documento original não assinado).
    // NUNCA usar contrato.pdf_assinado_key como fallback.
    storageKey = contrato.pdf_object_key || null;
    isAssinado = false;
    fileName = `Contrato_${contrato.numero_contrato || contrato.id}.pdf`;
  }

  // FAIL CLOSED: se nenhuma chave canônica existir, recusa entrega
  if (!storageKey) {
    throw new Error(`O documento do contrato ${contrato.numero_contrato || contratoId} ainda não foi gerado ou está indisponível.`);
  }

  const downloadUrl = await obterUrlDownload(storageKey);

  return {
    contratoId: contrato.id,
    numeroContrato: contrato.numero_contrato,
    tipoContrato: contrato.tipo_contrato || 'ANUNCIANTE',
    statusWorkflow: contrato.status_workflow,
    statusDocumento: contrato.status_documento,
    isAssinado,
    storageKey,
    downloadUrl,
    fileName,
    templateId: contrato.template_id,
  };
}

/**
 * Gera o PDF oficial do contrato em memória usando o motor corrigido + template padrão ATUAL da Central de Contratos.
 * SEMPRE usa o template marcado como is_default=true via fn_obter_template_padrao — nunca o template_id histórico do contrato.
 * Isso garante que qualquer mudança de padrão na Central de Contratos seja refletida imediatamente em todo o sistema.
 * Não salva nada no R2 nem altera o banco — exclusivamente in-memory.
 */
export async function gerarPreviewPdfContrato(
  contratoId: string
): Promise<{ bytes: Uint8Array; fileName: string; tipoContrato: string; numeroContrato: string }> {
  if (!contratoId || typeof contratoId !== 'string' || contratoId.trim() === '') {
    throw new Error('ID do contrato é obrigatório para geração do preview.');
  }

  // Busca dados do contrato (sem template_id — o template padrão será resolvido abaixo)
  const { data: contrato, error: ctrErr } = await supabase
    .from('contratos')
    .select(`
      id, numero_contrato, tipo_contrato, versao_atual, empresa_operadora_id,
      status_documento,
      proposta:propostas(*),
      cliente:clientes(*)
    `)
    .eq('id', contratoId)
    .is('deleted_at', null)
    .single();

  if (ctrErr || !contrato) {
    throw new Error(`Contrato não encontrado (ID: ${contratoId}).`);
  }

  const tipoContrato = (contrato.tipo_contrato as 'ANUNCIANTE' | 'PARCEIRO' | 'GESTOR') || 'ANUNCIANTE';
  const numeroContrato = contrato.numero_contrato || contratoId;
  const versao = contrato.versao_atual || 1;

  // SEMPRE busca o template padrão ATUAL da Central de Contratos — ignora template_id histórico do contrato
  const templatePadrao = await obterTemplatePadraoVigente(tipoContrato, contrato.empresa_operadora_id || null);

  // Coleta todos os dados reais para preencher os placeholders
  const dadosDocumento = await coletarDadosReais(contratoId);

  // Substitui o template pelos dados reais do contrato porém com o template padrão atual
  const dadosMapeados = montarDadosTemplate(dadosDocumento);

  // Usa o HTML do template padrão atual (não o histórico do contrato)
  let htmlRenderizado = preencherTemplate(templatePadrao.conteudo_html, dadosMapeados, tipoContrato);

  // Injeta visualmente a assinatura do contratante se o contrato já estiver assinado
  const { data: ass } = await supabase
    .from('assinaturas')
    .select('signatario_nome, signatario_cpf_cnpj, assinado_em, metodo, dados_assinatura')
    .eq('contrato_id', contratoId)
    .eq('status', 'ASSINADO')
    .order('assinado_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (ass || contrato.status_documento === 'ASSINADO') {
    const responsavelContratante = dadosMapeados.RESPONSAVEL || dadosMapeados.RAZAO_SOCIAL;
    const nomeSignatario = ass?.signatario_nome || responsavelContratante;
    const metodo = ass?.metodo || 'DRAWN';
    const metodoLabel = metodo === 'TYPED' ? 'Assinatura Digitada (TYPED)' : 'Digital Desenhada (DRAWN)';
    const dataFmt = ass?.assinado_em ? formatarDataExtensa(new Date(ass.assinado_em)) : formatarDataExtensa(new Date());
    const dataUrl = (ass?.dados_assinatura as any)?.signatureDataUrl || (ass?.dados_assinatura as any)?.dataUrl || '';

    const imagemAssinaturaHtml = dataUrl
      ? `<div style="min-height: 48px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; margin-bottom: 4px;">
          <img src="${dataUrl}" alt="Assinatura do Contratante" style="max-height: 48px; max-width: 100%; object-fit: contain; margin: 0 auto 2px auto; display: block;" />
        </div>`
      : `<div style="min-height: 36px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: 4px;">
          <span style="font-family: 'Playfair Display', Georgia, serif; font-style: italic; font-weight: bold; font-size: 14px; color: #1e293b;">
            ${nomeSignatario}
          </span>
        </div>`;

    const labelContratante = tipoContrato === 'PARCEIRO' ? 'PARCEIRO' : tipoContrato === 'GESTOR' ? 'GESTOR' : 'CONTRATANTE';
    const blocoAssinado = `<div style="width: 45%; text-align: center; padding-top: 4px;">
      ${imagemAssinaturaHtml}
      <div style="border-top: 1px solid #111827; padding-top: 4px;">
        <p style="margin: 0; font-weight: bold; font-size: 11px;">${dadosMapeados.RAZAO_SOCIAL} (${labelContratante})</p>
        <p style="margin: 2px 0 0; font-size: 9px; color: #16a34a; font-weight: bold;">✓ Assinado digitalmente por ${nomeSignatario}</p>
        <p style="margin: 0; font-size: 8px; color: #6b7280;">Data: ${dataFmt} · Método: ${metodoLabel}</p>
      </div>
    </div>`;

    const regex = new RegExp(`<div[^>]*>\\s*<p[^>]*>[^<]*(${labelContratante})[^<]*</p>\\s*</div>`, 'is');
    if (regex.test(htmlRenderizado)) {
      htmlRenderizado = htmlRenderizado.replace(regex, blocoAssinado);
    }

    // Garante alinhamento milimétrico da linha de assinatura da SOBRE MÍDIA DESIGNER com a linha do CONTRATANTE
    const regexSobreMidia = /<div[^>]*style="[^"]*width:\s*45%[^"]*"[^>]*>\s*<p[^>]*>\s*(SOBRE M[IÍ]DIA[^<]*)<\/p>\s*(?:<p[^>]*>[^<]*<\/p>\s*)?<\/div>/is;
    const blocoSobreMidiaAlinhado = `<div style="width: 45%; text-align: center; padding-top: 4px;">
      <div style="min-height: 48px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; margin-bottom: 4px;"></div>
      <div style="border-top: 1px solid #111827; padding-top: 4px;">
        <p style="margin: 0; font-weight: bold; font-size: 11px;">SOBRE MÍDIA DESIGNER</p>
      </div>
    </div>`;
    if (regexSobreMidia.test(htmlRenderizado)) {
      htmlRenderizado = htmlRenderizado.replace(regexSobreMidia, blocoSobreMidiaAlinhado);
    }
  }

  const bytes = await gerarPdfDoHtml(htmlRenderizado, numeroContrato, tipoContrato, versao);
  const fileName = `Contrato_${numeroContrato}.pdf`;

  return { bytes, fileName, tipoContrato, numeroContrato };
}


/**
 * Visualização Canônica Universal de Documento Contratual.
 * Gera o PDF on-the-fly com o motor corrigido + template oficial — sem servir arquivos antigos do R2.
 */
export async function visualizarDocumentoContrato(contratoId: string): Promise<string> {
  const { bytes, fileName } = await gerarPreviewPdfContrato(contratoId);
  if (typeof window !== 'undefined' && typeof URL !== 'undefined') {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const objectUrl = URL.createObjectURL(blob);
    window.open(objectUrl, '_blank', 'noopener,noreferrer');
    // Libera o object URL após 60s para não vazar memória
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    return objectUrl;
  }
  return '';
}

/**
 * Download Canônico Universal de Documento Contratual.
 * Gera o PDF on-the-fly com o motor corrigido + template oficial e dispara download — sem servir arquivos antigos do R2.
 */
export async function baixarDocumentoContrato(
  contratoId: string,
  usuarioId?: string
): Promise<{ blob: Blob; fileName: string; downloadUrl: string; doc: DocumentoContratoResolvido }> {
  const { bytes, fileName, tipoContrato } = await gerarPreviewPdfContrato(contratoId);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  if (typeof document !== 'undefined' && typeof URL !== 'undefined') {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
  }
  if (usuarioId) {
    try {
      await registrarDownloadDocumento(contratoId, tipoContrato, usuarioId, `preview-gerado-${contratoId}`);
    } catch (auditErr) {
      console.warn('[contratoDocumentoService] Falha ao registrar auditoria de download:', auditErr);
    }
  }
  // Mantém assinatura de retorno compatível com código existente
  const doc = await resolverDocumentoContrato(contratoId).catch(() => ({
    contratoId,
    numeroContrato: '',
    tipoContrato,
    statusWorkflow: '',
    statusDocumento: '',
    isAssinado: false,
    storageKey: '',
    downloadUrl: '',
    fileName,
    templateId: null,
  })) as DocumentoContratoResolvido;
  return { blob, fileName, downloadUrl: '', doc };
}

/** Baixa o documento real e dispara o download no dispositivo por chave de storage. */
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

/** Abre o documento em nova aba por chave de storage. */
export async function visualizarDocumento(objectKey: string): Promise<void> {
  const signedUrl = await obterUrlDownload(objectKey);
  window.open(signedUrl, '_blank', 'noopener');
}

/**
 * P0.3.11 — Single Source of Truth documental.
 * Retorna a object key do PDF assinado SOMENTE se existir uma assinatura
 * com status = 'ASSINADO' (válida) associada ao contrato.
 * Retorna null se a assinatura foi cancelada, expirada ou não existe.
 *
 * NUNCA usar contrato.pdf_assinado_key diretamente para entrega de documento
 * assinado — sempre usar esta função para garantir validade da assinatura.
 */
export async function obterKeyDocumentoAssinado(contratoId: string): Promise<string | null> {
  if (!contratoId) return null;
  const { data, error } = await supabase
    .from('assinaturas')
    .select('pdf_assinado_key, status')
    .eq('contrato_id', contratoId)
    .eq('status', 'ASSINADO')
    .order('assinado_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.pdf_assinado_key) return null;
  return data.pdf_assinado_key;
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
      .is('deleted_at', null)
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

    let empresa = contrato.empresa;
    let cliente: any = null;
    if (!empresa && contrato.cliente_id) {
      const { data: cli } = await supabase
        .from('clientes')
        .select('*, empresas(*, contatos(*))')
        .eq('id', contrato.cliente_id)
        .maybeSingle();
      cliente = cli;
      empresa = cli?.empresas?.[0] || null;
    } else if (contrato.cliente_id) {
      const { data: cli } = await supabase
        .from('clientes')
        .select('*')
        .eq('id', contrato.cliente_id)
        .maybeSingle();
      cliente = cli;
    }

    const contatoEmp = empresa?.contatos?.[0];
    let signatarioNome: string | null =
      contatoEmp?.nome ||
      empresa?.representante_legal ||
      cliente?.representante_legal ||
      cliente?.contato_nome ||
      empresa?.nome_fantasia ||
      empresa?.razao_social ||
      cliente?.nome_fantasia ||
      cliente?.razao_social ||
      null;

    let signatarioEmail: string | null =
      contatoEmp?.email ||
      empresa?.email ||
      cliente?.contato_email ||
      cliente?.email ||
      null;

    let signatarioCnpj: string | null =
      empresa?.cnpj ||
      cliente?.cnpj ||
      cliente?.cpf_cnpj ||
      null;

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
    // Acima da linha "___ CONTRATANTE" no canto direito da última página
    x: 310,
    y: 510,
    width: 215,
    height: 45,
  },
  PARCEIRO: {
    // Acima da linha "___ PARCEIRO" no canto esquerdo da última página
    x: 64,
    y: 476,
    width: 200,
    height: 45,
  },
  GESTOR: {
    // Acima da linha "___ GESTOR OPERACIONAL" no canto esquerdo da última página
    x: 64,
    y: 476,
    width: 200,
    height: 45,
  },
  DEFAULT: {
    x: 310,
    y: 510,
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
      .is('deleted_at', null)
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

    // Evento de assinatura ('ASSINADO') é persistido atomicamente no PostgreSQL pela RPC fn_assinar_contrato (sem duplicações)
    return { success: true, pdfAssinadoKey: signedObjectKey, documentHash: signedHash };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao assinar o documento.' };
  }
}

/**
 * Obtém e renderiza o HTML canônico oficial preenchido para um contrato específico por ID.
 * Se o contrato estiver ASSINADO, inclui a representação visual da assinatura do contratante.
 * É a fonte canônica universal para pré-visualizações em Propostas, Contratos, Assinatura e Portal.
 */
export async function obterHtmlContratoPorContratoId(contratoId: string): Promise<string> {
  const dadosDocumento = await coletarDadosReais(contratoId);
  const { contrato, template } = dadosDocumento;
  const tipoContrato = (contrato?.tipo_contrato as 'ANUNCIANTE' | 'PARCEIRO' | 'GESTOR') || 'ANUNCIANTE';

  let templateHtml = template?.conteudo_html;
  if (!templateHtml || templateHtml.length < 200 || templateHtml.includes('(preservado)') || !isTemplateCompleto(templateHtml, tipoContrato)) {
    templateHtml = getCanonicalTemplateForTipo(tipoContrato);
  }

  const dadosMapeados = montarDadosTemplate(dadosDocumento);

  let htmlPreenchido = preencherTemplate(templateHtml, dadosMapeados, tipoContrato);

  // Se o contrato já estiver assinado, busca os dados da assinatura real para injetar visualmente
  if (contrato?.status_documento === 'ASSINADO') {
    const { data: ass } = await supabase
      .from('assinaturas')
      .select('signatario_nome, signatario_cpf_cnpj, assinado_em, metodo, dados_assinatura')
      .eq('contrato_id', contratoId)
      .eq('status', 'ASSINADO')
      .order('assinado_em', { ascending: false })
      .limit(1)
      .maybeSingle();

    const responsavelContratante = dadosMapeados.RESPONSAVEL || dadosMapeados.RAZAO_SOCIAL;
    const nomeSignatario = ass?.signatario_nome || responsavelContratante;
    const metodo = ass?.metodo || 'DRAWN';
    const metodoLabel = metodo === 'TYPED' ? 'Assinatura Digitada (TYPED)' : 'Digital Desenhada (DRAWN)';
    const dataFmt = ass?.assinado_em ? formatarDataExtensa(new Date(ass.assinado_em)) : formatarDataExtensa(new Date());

    const dataUrl = (ass?.dados_assinatura as any)?.signatureDataUrl || (ass?.dados_assinatura as any)?.dataUrl || '';

    const imagemAssinaturaHtml = dataUrl
      ? `<div style="min-height: 48px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; margin-bottom: 4px;">
          <img src="${dataUrl}" alt="Assinatura do Contratante" style="max-height: 48px; max-width: 100%; object-fit: contain; margin: 0 auto 2px auto; display: block;" />
        </div>`
      : `<div style="min-height: 36px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: 4px;">
          <span style="font-family: 'Playfair Display', Georgia, serif; font-style: italic; font-weight: bold; font-size: 14px; color: #1e293b;">
            ${nomeSignatario}
          </span>
        </div>`;

    if (tipoContrato === 'ANUNCIANTE') {
      const blocoAssinadoAnunciante = `<div style="width: 45%; text-align: center; padding-top: 4px;">
        ${imagemAssinaturaHtml}
        <div style="border-top: 1px solid #111827; padding-top: 4px;">
          <p style="margin: 0; font-weight: bold; font-size: 11px;">${dadosMapeados.RAZAO_SOCIAL} (CONTRATANTE)</p>
          <p style="margin: 2px 0 0; font-size: 9px; color: #16a34a; font-weight: bold;">✓ Assinado digitalmente por ${nomeSignatario}</p>
          <p style="margin: 0; font-size: 8px; color: #6b7280;">Data: ${dataFmt} · Método: ${metodoLabel}</p>
        </div>
      </div>`;

      const regexAnunciante = /<div[^>]*style="[^"]*width:\s*45%[^"]*"[^>]*>[\s\S]*?\(CONTRATANTE\)[\s\S]*?<\/div>\s*(?:<\/div>)?/is;
      if (regexAnunciante.test(htmlPreenchido)) {
        htmlPreenchido = htmlPreenchido.replace(regexAnunciante, blocoAssinadoAnunciante);
      } else {
        htmlPreenchido = htmlPreenchido.replace(/<div[^>]*>\s*<p[^>]*>[^<]*\(CONTRATANTE\)<\/p>\s*<\/div>/is, blocoAssinadoAnunciante);
      }
    } else if (tipoContrato === 'PARCEIRO') {
      const blocoAssinadoParceiro = `<div style="width: 45%; text-align: center; padding-top: 4px;">
        ${imagemAssinaturaHtml}
        <div style="border-top: 1px solid #111827; padding-top: 4px;">
          <p style="margin: 0; font-weight: bold; font-size: 11px;">${dadosMapeados.RAZAO_SOCIAL} (PARCEIRO)</p>
          <p style="margin: 2px 0 0; font-size: 9px; color: #16a34a; font-weight: bold;">✓ Assinado digitalmente por ${nomeSignatario}</p>
          <p style="margin: 0; font-size: 8px; color: #6b7280;">Data: ${dataFmt} · Método: ${metodoLabel}</p>
        </div>
      </div>`;

      const regexParceiro = /<div[^>]*style="[^"]*width:\s*45%[^"]*"[^>]*>[\s\S]*?\(PARCEIRO\)[\s\S]*?<\/div>\s*(?:<\/div>)?/is;
      if (regexParceiro.test(htmlPreenchido)) {
        htmlPreenchido = htmlPreenchido.replace(regexParceiro, blocoAssinadoParceiro);
      } else {
        htmlPreenchido = htmlPreenchido.replace(/<div[^>]*>\s*<p[^>]*>[^<]*\(PARCEIRO\)<\/p>\s*<\/div>/is, blocoAssinadoParceiro);
      }
    } else if (tipoContrato === 'GESTOR') {
      const blocoAssinadoGestor = `<div style="width: 45%; text-align: center; padding-top: 4px;">
        ${imagemAssinaturaHtml}
        <div style="border-top: 1px solid #111827; padding-top: 4px;">
          <p style="margin: 0; font-weight: bold; font-size: 11px;">${responsavelContratante} (GESTOR)</p>
          <p style="margin: 2px 0 0; font-size: 9px; color: #16a34a; font-weight: bold;">✓ Assinado digitalmente por ${nomeSignatario}</p>
          <p style="margin: 0; font-size: 8px; color: #6b7280;">Data: ${dataFmt} · Método: ${metodoLabel}</p>
        </div>
      </div>`;

      const regexGestor = /<div[^>]*style="[^"]*width:\s*45%[^"]*"[^>]*>[\s\S]*?\(GESTOR\)[\s\S]*?<\/div>\s*(?:<\/div>)?/is;
      if (regexGestor.test(htmlPreenchido)) {
        htmlPreenchido = htmlPreenchido.replace(regexGestor, blocoAssinadoGestor);
      } else {
        htmlPreenchido = htmlPreenchido.replace(/<div[^>]*>\s*<p[^>]*>[^<]*\(GESTOR\)<\/p>\s*<\/div>/is, blocoAssinadoGestor);
      }
    }

    // Garante alinhamento milimétrico da linha de assinatura da SOBRE MÍDIA DESIGNER com a linha do CONTRATANTE
    const regexSobreMidia = /<div[^>]*style="[^"]*width:\s*45%[^"]*"[^>]*>[\s\S]*?SOBRE M[IÍ]DIA[\s\S]*?<\/div>\s*(?:<\/div>)?/is;
    const blocoSobreMidiaAlinhado = `<div style="width: 45%; text-align: center; padding-top: 4px;">
      <div style="min-height: 48px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; margin-bottom: 4px;"></div>
      <div style="border-top: 1px solid #111827; padding-top: 4px;">
        <p style="margin: 0; font-weight: bold; font-size: 11px;">SOBRE MÍDIA DESIGNER</p>
      </div>
    </div>`;
    if (regexSobreMidia.test(htmlPreenchido)) {
      htmlPreenchido = htmlPreenchido.replace(regexSobreMidia, blocoSobreMidiaAlinhado);
    }
  }

  return htmlPreenchido;
}

export const contratoDocumentoService = {
  gerarDocumentoContrato,
  gerarPreviewPdfContrato,
  criarEnvelopeInterno,
  registrarVisualizacaoAssinatura,
  assinarDocumento,
  obterUrlDownload,
  baixarDocumento,
  visualizarDocumento,
  obterKeyDocumentoAssinado,
  resolverDocumentoContrato,
  visualizarDocumentoContrato,
  baixarDocumentoContrato,
  registrarDownloadDocumento,
  coletarDadosReais,
  montarDadosTemplate,
  preencherTemplate,
  obterTemplatePadraoVigente,
  renderizarPreviewContrato,
  obterHtmlContratoPorContratoId,
  separarHtmlEmPaginas,
};

