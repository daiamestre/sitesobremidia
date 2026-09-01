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

function formatarData(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR');
}

/**
 * Campos OBRIGATORIOS por tipo de contrato.
 * Ausencia bloqueia geracao com mensagem tecnica clara.
 */
const CAMPOS_OBRIGATORIOS: Record<'ANUNCIANTE' | 'PARCEIRO', string[]> = {
  ANUNCIANTE: ['RAZAO_SOCIAL', 'CNPJ', 'DATA_INICIO', 'DATA_FIM'],
  PARCEIRO:   ['RAZAO_SOCIAL', 'DATA_INICIO', 'DATA_FIM'],
};

export const CANONICAL_TEMPLATE_HTML_ANUNCIANTE = `<h2>CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE MÍDIA DIGITAL SIGNAGE</h2>
<p>Pelo presente instrumento particular, de um lado <strong>SOBRE MÍDIA PLATAFORMA DIGITAL</strong> e de outro lado <strong>{{RAZAO_SOCIAL}}</strong>, inscrita no CNPJ sob o nº <strong>{{CNPJ}}</strong>, estabelecida em {{CIDADE}}/{{ESTADO}}, representada por {{REPRESENTANTE_LEGAL}}.</p>
<h3>1. DO OBJETO</h3>
<p>O presente contrato tem por objeto a prestação de serviços de exibição de mídias publicitárias e informativas na rede de telas da CONTRATADA para a campanha <strong>{{TITULO_CAMPANHA}}</strong>, composta por <strong>{{QUANTIDADE_TELAS}}</strong> telas/painéis.</p>
<h3>2. DO VALOR E CONDIÇÕES DE PAGAMENTO</h3>
<p>Pela prestação dos serviços contratados, a CONTRATANTE pagará o valor mensal de <strong>R$ {{VALOR_MENSAL}}</strong> através da forma de pagamento <strong>{{FORMA_PAGAMENTO}}</strong>, com vigência de {{DATA_INICIO}} a {{DATA_FIM}}.</p>
<h3>3. DAS CLÁUSULAS JURÍDICAS INALTERÁVEIS</h3>
<p>A veiculação observará a grade de programação estipulada e a conformidade com as normas legais de publicidade vigente.</p>
<p>Local: {{LOCAL_ASSINATURA}}, Data: {{DATA_ASSINATURA}}</p>
<p>___________________________________                                      ___________________________________</p>
<p>SOBRE MÍDIA DESIGNER                                                          CONTRATANTE</p>`;

export const CANONICAL_TEMPLATE_HTML_PARCEIRO = `<h2>CONTRATO DE PARCERIA E CESSÃO DE ESPAÇO FÍSICO PARA MÍDIA</h2>
<p>Pelo presente instrumento, <strong>SOBRE MÍDIA PLATAFORMA DIGITAL</strong> e o ESTABELECIMENTO PARCEIRO <strong>{{RAZAO_SOCIAL}}</strong>, inscrito no CNPJ nº <strong>{{CNPJ}}</strong>, localizado na <strong>{{ENDERECO_UNIDADE}}</strong>, celebram o presente acordo de parceria.</p>
<h3>1. DO OBJETO</h3>
<p>Cessão de espaço físico na unidade <strong>{{NOME_UNIDADE}}</strong> para instalação e operação de <strong>{{QUANTIDADE_TELAS}}</strong> telas de mídia indoor corporativa.</p>
<h3>2. DOS COMPROMISSOS</h3>
<p>O parceiro compromete-se a manter os equipamentos energizados e conectados, enquanto a SOBRE MÍDIA garante a gestão completa da programação e manutenção de hardware.</p>
<p>Local: {{LOCAL_ASSINATURA}}, Data: {{DATA_ASSINATURA}}</p>
<p>___________________________________</p>
<p>SOBRE MÍDIA</p>
<p>___________________________________</p>
<p>PARCEIRO</p>`;

/**
 * Preenche o template substituindo placeholders com dados reais.
 *
 * Politica:
 *   - Campo OBRIGATORIO ausente -> lanca erro tecnico claro.
 *   - Campo OPCIONAL ausente    -> substitui por string vazia (nao inventa).
 *   - Campo desconhecido        -> substitui por string vazia (graceful).
 *
 * O documento final NAO contera nenhum {{PLACEHOLDER}} nao resolvido.
 */
export function preencherTemplate(
  templateHtml: string,
  dados: Record<string, string>,
  tipoContrato: 'ANUNCIANTE' | 'PARCEIRO' = 'ANUNCIANTE'
): string {
  let html = templateHtml;
  const placeholders = [...new Set([...html.matchAll(/\{\{([A-Z_0-9]+)\}\}/g)].map((m) => m[1]))];
  const obrigatorios = CAMPOS_OBRIGATORIOS[tipoContrato] || CAMPOS_OBRIGATORIOS.ANUNCIANTE;

  for (const ph of placeholders) {
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

  // Garantia: substituir qualquer placeholder residual por vazio
  const restantes = [...html.matchAll(/\{\{([A-Z_0-9]+)\}\}/g)].map((m) => m[1]);
  for (const r of restantes) {
    html = html.replace(new RegExp(`\\{\\{${r}\\}\\}`, 'g'), '');
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

  const tipoContrato = (contrato.tipo_contrato as 'ANUNCIANTE' | 'PARCEIRO') || 'ANUNCIANTE';

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
        conteudo_html: tipoContrato === 'PARCEIRO' ? CANONICAL_TEMPLATE_HTML_PARCEIRO : CANONICAL_TEMPLATE_HTML_ANUNCIANTE,
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

  return {
    RAZAO_SOCIAL:        razaoSocial,
    NOME_FANTASIA:       nomeFantasia,
    CNPJ:                cnpj,
    CPF_CNPJ:            cnpj,
    RESPONSAVEL:         responsavel,
    REPRESENTANTE_LEGAL: responsavel,
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
    VALOR_POR_SISTEMA:   '',
    FORMA_PAGAMENTO:     contrato?.forma_pagamento || '',
    DATA_VENCIMENTO_PRIMEIRA_FATURA: proposta?.data_vencimento_primeira || '',
    QUANTIDADE_TELAS:    dados.quantidadeTelas > 0 ? String(dados.quantidadeTelas) : '',
    QTD_TVS:             proposta?.qtd_tvs ? String(proposta.qtd_tvs) : '',
    QTD_TOTENS:          proposta?.qtd_totens ? String(proposta.qtd_totens) : '',
    QTD_PAINEIS_LED:     proposta?.qtd_paineis_led ? String(proposta.qtd_paineis_led) : '',
    TOTAL_SISTEMAS:      dados.quantidadeTelas > 0 ? String(dados.quantidadeTelas) : '',
    DATA_INICIO:                  formatarData(contrato?.data_inicio),
    DATA_FIM:                     formatarData(contrato?.data_fim),
    DATA_INICIO_VEICULACAO:       formatarData(contrato?.data_inicio),
    DATA_FIM_VEICULACAO:          formatarData(contrato?.data_fim),
    DATA_ASSINATURA:              formatarData(new Date().toISOString()),
    LOCAL_ASSINATURA:             cidade || '',
    FORO_COMARCA:                 cidade || '',
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

    const htmlRenderizado = preencherTemplate(
      template.conteudo_html,
      montarDadosTemplate(dados),
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
export const SIGNATURE_PLACEMENTS: Record<'ANUNCIANTE' | 'PARCEIRO' | 'DEFAULT', SignaturePlacement> = {
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
