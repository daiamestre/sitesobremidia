import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface GenerateContractRequest {
  contratoId: string;
  usuarioId: string;
}

interface HtmlElement {
  tag: string;
  text: string;
  isBold: boolean;
  level: number;
}

/**
 * Extrai o texto e estrutura de um HTML simples, retornando elementos com formatação
 */
function parseHtmlToElements(html: string): HtmlElement[] {
  const elements: HtmlElement[] = [];
  const tagRegex = /<(\/?)([a-z][a-z0-9]*)\b([^>]*)>(.*?)/gi;
  const textRegex = />([^<]+)</g;

  const tagStack: string[] = [];
  let lastIndex = 0;

  // Estratégia: processar tag por tag
  const fullRegex = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let match: RegExpExecArray | null;

  while ((match = fullRegex.exec(html)) !== null) {
    const fullMatch = match[0];
    const isClosing = match[1] === "/";
    const tagName = match[2].toLowerCase();
    const matchIndex = match.index;

    // Capturar texto entre o último ponto e essa tag
    if (matchIndex > lastIndex) {
      const textContent = html.slice(lastIndex, matchIndex).trim();
      if (textContent) {
        // Remover tags HTML embutidas no texto (caso aninhadas)
        const cleanText = textContent.replace(/<[^>]+>/g, "").trim();
        if (cleanText) {
          const isBold = tagStack.includes("strong") || tagStack.includes("b");
          const level = tagStack.filter(t => t === "h1" || t === "h2" || t === "h3" || t === "h4").length;
          const headerTag = tagStack.find(t => ["h1","h2","h3","h4"].includes(t));

          elements.push({
            tag: headerTag || "p",
            text: cleanText,
            isBold,
            level: headerTag ? parseInt(headerTag.charAt(1)) : level,
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

    lastIndex = matchIndex + fullMatch.length;
  }

  // Capturar texto restante após a última tag
  if (lastIndex < html.length) {
    const textContent = html.slice(lastIndex).trim();
    if (textContent) {
      const cleanText = textContent.replace(/<[^>]+>/g, "").trim();
      if (cleanText) {
        const isBold = tagStack.includes("strong") || tagStack.includes("b");
        const headerTag = tagStack.find(t => ["h1","h2","h3","h4"].includes(t));
        elements.push({
          tag: headerTag || "p",
          text: cleanText,
          isBold,
          level: headerTag ? parseInt(headerTag.charAt(1)) : 0,
        });
      }
    }
  }

  return elements;
}

/**
 * Renderiza o HTML do contrato substituindo placeholders com dados reais do banco.
 * NÃO usa valores fallback — falha se algum dado essencial estiver ausente.
 */
function renderContractHTML(template: string, dados: Record<string, string>): string {
  let html = template;
  for (const [key, value] of Object.entries(dados)) {
    if (!value) {
      throw new Error(`[renderContractHTML] Placeholder ${key} não foi preenchido. Dado essencial ausente.`);
    }
    html = html.replace(new RegExp(`{{${key}}}`, "g"), value);
  }
  return html;
}

/**
 * Calcula SHA-256 de um ArrayBuffer retornando hex string
 */
async function sha256Hex(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data.buffer as ArrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Cria um PDF real a partir do HTML renderizado do contrato.
 * Usa pdf-lib para gerar um documento PDF vetorial (texto selecionável).
 */
async function createContractPDF(
  htmlContent: string,
  contractNumber: string,
  contractType: string,
  versao: number
): Promise<Uint8Array> {
  const elements = parseHtmlToElements(htmlContent);
  const pdfDoc = await PDFDocument.create();
  const pageWidth = 595.3;
  const pageHeight = 841.9;
  const marginX = 72;
  const marginTop = 72;
  const marginBottom = 72;
  const lineHeight = 16;
  const fontSizeH1 = 16;
  const fontSizeH2 = 14;
  const fontSizeH3 = 12;
  const fontSizeP = 10;

  const pages: any[] = [];
  let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
  pages.push(currentPage);
  let yPos = pageHeight - marginTop;

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const lightFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const addElement = (el: HtmlElement) => {
    const isHeader = ["h1", "h2", "h3", "h4"].includes(el.tag);
    const fontSize = el.tag === "h2" ? fontSizeH2 : el.tag === "h3" ? fontSizeH3 : el.tag === "h1" ? fontSizeH1 : fontSizeP;
    const fontToUse = (el.isBold || isHeader) ? boldFont : font;

    // Quebrar texto em linhas
    const words = el.text.split(" ");
    const maxLineWidth = pageWidth - marginX * 2;
    let currentLine = "";
    const lines: string[] = [];

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const textWidth = (fontToUse as any).widthOfText(testLine, { size: fontSize });
      if (textWidth > maxLineWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);

    for (const line of lines) {
      if (yPos < marginBottom + lineHeight) {
        currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
        pages.push(currentPage);
        yPos = pageHeight - marginTop;
      }
      const textColor = isHeader ? rgb(0.03, 0.31, 0.56) : rgb(0.1, 0.1, 0.1);
      const fontForLine = (el.isBold || isHeader) ? boldFont : font;
      currentPage.drawText(line, {
        x: marginX,
        y: yPos,
        size: fontSize,
        font: fontForLine,
        color: textColor,
      });
      yPos -= lineHeight * (isHeader ? 1.3 : 1);
    }

    // Espaço extra após headers
    if (isHeader) yPos -= 4;
  };

  // Processar todos os elementos, incluindo o header institucional
  const headerElements: HtmlElement[] = [
    { tag: "h2", text: "SOBRE MÍDIA — PLATAFORMA DIGITAL DE MÍDIA", isBold: true, level: 2 },
  ];

  // Adicionar header
  const headerColor = rgb(0.03, 0.31, 0.56);
  currentPage.drawText("SOBRE MÍDIA — PLATAFORMA DIGITAL DE MÍDIA", {
    x: marginX,
    y: yPos,
    size: 14,
    font: boldFont,
    color: headerColor,
  });
  yPos -= 20;

  currentPage.drawText(`Contrato: ${contractNumber} | Tipo: ${contractType} | Versão: ${versao}`, {
    x: marginX,
    y: yPos,
    size: 8,
    font: font,
    color: rgb(0.4, 0.4, 0.4),
  });
  yPos -= 24;

  // Adicionar todos os elementos do contrato
  for (const el of elements) {
    addElement(el);
  }

  yPos -= 10;

  // Footer com numeração de página
  const totalPages = pages.length;
  for (let i = 0; i < pages.length; i++) {
    const pg = pages[i];
    pg.drawText(`Página ${i + 1} de ${totalPages} | SOBRE MÍDIA DIGITAL SIGNAGE LTDA`, {
      x: marginX,
      y: 20,
      size: 7,
      font: lightFont,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  const pdfBytes = await pdfDoc.save();
  return new Uint8Array(pdfBytes);
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // [SECURITY HARDENING] JWT obrigatório: o usuário é derivado do token,
    // NUNCA aceito do corpo (anti-IDOR). usuarioId do body é ignorado.
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!jwt) {
      return new Response(
        JSON.stringify({ error: "Autenticacao obrigatoria." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } }
    );
    const { data: authData, error: authError } = await userSupabase.auth.getUser(jwt);
    if (authError || !authData?.user?.id) {
      return new Response(
        JSON.stringify({ error: "Token invalido." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const usuarioId = authData.user.id;

    const { contratoId }: GenerateContractRequest = await req.json();

    if (!contratoId) {
      return new Response(
        JSON.stringify({ error: "contratoId é obrigatório." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // [SECURITY] Escopo de leitura com o JWT do usuário (RLS aplica):
    // só consegue prosseguir se a própria RLS devolver o contrato.
    const { data: ownedCheck } = await userSupabase
      .from("contratos")
      .select("id")
      .eq("id", contratoId)
      .maybeSingle();
    if (!ownedCheck) {
      return new Response(
        JSON.stringify({ error: "Contrato não encontrado ou sem permissão." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Busca o contrato com todos os dados relacionados
    const { data: contrato, error: ctrError } = await supabase
      .from("contratos")
      .select(`
        id,
        numero_contrato,
        empresa_operadora_id,
        cliente_id,
        empresa_id,
        representante_id,
        proposta_id,
        tipo_contrato,
        template_id,
        template_nome,
        template_versao,
        versao_atual,
        valor_mensal,
        forma_pagamento,
        data_inicio,
        data_fim,
        observacoes,
        proposta:propostas(*),
        cliente:clientes(*),
        empresa:empresas(*),
        template:contrato_templates(*)
      `)
      .eq("id", contratoId)
      .single();

    if (ctrError || !contrato) {
      return new Response(
        JSON.stringify({ error: "Contrato não encontrado." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!contrato.template?.conteudo_html) {
      return new Response(
        JSON.stringify({ error: "Template de contrato não encontrado ou inativo." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Busca contatos da empresa
    const { data: contatos } = await supabase
      .from("contatos")
      .select("*")
      .eq("cliente_id", contrato.cliente_id)
      .limit(1);

    const contato = contatos?.[0];

    // 3. Busca empresa completa (já vem via join acima)
    const empresa = contrato.empresa;
    const proposta = contrato.proposta;
    const representante = contrato.representante_id 
      ? await supabase.from("representantes")
          .select("*, usuario:usuarios(nome, email)")
          .eq("id", contrato.representante_id)
          .single()
          .then(r => r.data)
      : null;

    // 4. Busca operadora
    const { data: operadora } = await supabase
      .from("empresa_operadora")
      .select("*")
      .eq("id", contrato.empresa_operadora_id)
      .single();

    // 5. Busca pontos/campanhas relacionadas
    const { data: pis } = await supabase
      .from("pedidos_insercao")
      .select(`
        id,
        pi_locais!inner(tela_id, unidade_id)
      `)
      .eq("contrato_id", contratoId)
      .limit(1);

    const quantidadeTelas = proposta?.quantidade_telas 
      || pis?.[0]?.pi_locais?.length 
      || proposta?.observacoes?.match(/tela[s]?\s*(\d+)/i)?.[1]
      || "1";

    // 6. Prepara dados reais para preencher o template
    const dadosTemplate: Record<string, string> = {
      RAZAO_SOCIAL: empresa?.razao_social || empresa?.nome_fantasia || "",
      CNPJ: empresa?.cnpj || "",
      CIDADE: empresa?.cidade || "",
      ESTADO: empresa?.estado || "",
      REPRESENTANTE_LEGAL: contato?.nome || empresa?.representante_legal || "",
      TITULO_CAMPANHA: proposta?.titulo_campanha || proposta?.observacoes?.match(/\[Campanha:\s*(.+?)\]/)?.[1] || "Campanha de Mídia Digital",
      QUANTIDADE_TELAS: quantidadeTelas,
      VALOR_MENSAL: new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 2,
      }).format(Number(contrato.valor_mensal || 0)),
      FORMA_PAGAMENTO: contrato.forma_pagamento || "PIX",
      DATA_INICIO: new Date(contrato.data_inicio || Date.now()).toLocaleDateString("pt-BR"),
      DATA_FIM: new Date(contrato.data_fim || Date.now()).toLocaleDateString("pt-BR"),
      ENDERECO_UNIDADE: empresa?.logradouro && empresa?.numero 
        ? `${empresa.logradouro}, ${empresa.numero}` 
        : `${empresa?.logradouro || ""}${empresa?.numero ? ", " + empresa.numero : ""}`,
      NOME_UNIDADE: empresa?.nome_fantasia || empresa?.razao_social || "",
    };

    // 7. Renderiza o HTML com dados reais (VALIDAÇÃO — falha se dado essencial estiver vazio)
    const htmlContent = renderContractHTML(contrato.template.conteudo_html, dadosTemplate);

    // 8. Gera PDF REAL usando pdf-lib
    const novaVersao = (contrato.versao_atual || 1);
    const pdfBytes = await createContractPDF(
      htmlContent,
      contrato.numero_contrato,
      contrato.tipo_contrato || "ANUNCIANTE",
      novaVersao
    );

    // 9. Calcula hash do documento
    const documentHash = await sha256Hex(pdfBytes);

    // 10. Define Object Key no storage
    const objectKey = `tenants/${contrato.empresa_operadora_id}/contratos/${contrato.id}/v${novaVersao}/contrato_${contrato.numero_contrato}.pdf`;

    // 11. Faz upload REAL do PDF para o bucket 'contratos' no Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("contratos")
      .upload(objectKey, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      return new Response(
        JSON.stringify({ error: `Falha no upload do PDF para storage: ${uploadError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 12. Salva snapshot imutável em contrato_versoes com o PDF real
    await supabase.from("contrato_versoes").insert({
      contrato_id: contrato.id,
      numero_versao: novaVersao,
      snapshot_dados: {
        contrato,
        htmlContent,
        empresa,
        contato,
        representante: representante,
        operadora,
      },
      motivo_alteracao: "Geração oficial de contrato PDF no módulo de Contratos — versão real",
      pdf_url: objectKey,
      created_by: usuarioId,
    });

    // 13. Atualiza status do contrato
    await supabase
      .from("contratos")
      .update({
        status_documento: "GERADO",
        pdf_object_key: objectKey,
        versao_atual: novaVersao,
        updated_at: new Date().toISOString(),
      })
      .eq("id", contrato.id);

    // 14. Registra Log de Auditoria: CONTRATO_PDF_GERADO
    await supabase.from("contrato_auditoria").insert({
      contrato_id: contrato.id,
      evento: "CONTRATO_PDF_GERADO",
      usuario_id: usuarioId,
      tipo_contrato: contrato.tipo_contrato,
      versao: novaVersao,
      detalhes: {
        object_key: objectKey,
        document_hash: documentHash,
        storage_bucket: "contratos",
      },
    });

    // 15. Gera URL assinada para download (válida por 1 hora)
    const { data: signedUrlData } = await supabase.storage
      .from("contratos")
      .createSignedUrl(objectKey, 3600);

    return new Response(
      JSON.stringify({
        success: true,
        contratoId: contrato.id,
        numeroContrato: contrato.numero_contrato,
        objectKey,
        documentHash,
        versao: novaVersao,
        signedUrl: signedUrlData?.signedUrl,
        status: "GERADO",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[generate-contract-pdf] Erro:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno ao gerar contrato." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
