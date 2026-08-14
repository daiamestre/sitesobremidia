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

interface SignatureRequest {
  action: "create" | "view" | "sign" | "download";
  contratoId: string;
  usuarioId?: string;
  envelopeId?: string;
  clienteId?: string;
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
 * Gera token seguro para acesso à assinatura (32 bytes hex)
 */
function generateSecureToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Gera um ID de envelope real (baseado em timestamp + random criptográfico)
 */
function generateEnvelopeId(): string {
  const timestamp = Date.now().toString(36);
  const randomBytes = new Uint8Array(8);
  crypto.getRandomValues(randomBytes);
  const random = Array.from(randomBytes, b => b.toString(36).padStart(2, "0")).join("").substring(0, 12);
  return `ENV-SM-${timestamp}-${random}`.toUpperCase();
}

/**
 * Cria um PDF assinado adicionando uma página de assinatura ao PDF original
 */
async function createSignedPDF(
  originalPdfBytes: Uint8Array,
  dadosAssinatura: {
    signatarioNome: string;
    signatarioEmail: string;
    signatarioCpf: string;
    assinadoEm: string;
    documentHash: string;
    numeroContrato: string;
  }
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalPdfBytes);

  // Cria página de assinatura
  const signaturePage = pdfDoc.addPage([595.3, 841.9]);
  const pageWidth = 595.3;
  const marginX = 72;
  let yPos = 841.9 - 72;

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Título
  signaturePage.drawText("PÁGINA DE ASSINATURA DIGITAL", {
    x: marginX,
    y: yPos,
    size: 14,
    font: boldFont,
    color: rgb(0.03, 0.31, 0.56),
  });
  yPos -= 30;

  // Dados do signatário
  const fields: Array<[string, string]> = [
    ["Contrato", dadosAssinatura.numeroContrato],
    ["Nome do Signatário", dadosAssinatura.signatarioNome],
    ["E-mail", dadosAssinatura.signatarioEmail],
    ["CPF/CNPJ", dadosAssinatura.signatarioCpf || "N/I"],
    ["Data da Assinatura", new Date(dadosAssinatura.assinadoEm).toLocaleString("pt-BR")],
    ["Hash do Documento Original (SHA-256)", dadosAssinatura.documentHash],
    ["Provedor", "ASSINADOR INTERNO SOBRE MÍDIA"],
    ["Carimbo do Tempo", `UTC — ${new Date(dadosAssinatura.assinadoEm).toISOString()}`],
  ];

  for (const [label, value] of fields) {
    signaturePage.drawText(`${label}:`, {
      x: marginX,
      y: yPos,
      size: 9,
      font: boldFont,
      color: rgb(0.2, 0.2, 0.2),
    });
    signaturePage.drawText(value, {
      x: marginX + 80,
      y: yPos,
      size: 9,
      font: font,
      color: rgb(0.3, 0.3, 0.3),
      maxWidth: pageWidth - marginX * 2 - 80,
    });
    yPos -= 18;
  }

  yPos -= 20;

  // Linha de assinatura
  signaturePage.drawLine({
    start: { x: marginX, y: yPos },
    end: { x: pageWidth - marginX, y: yPos },
    thickness: 0.5,
    color: rgb(0.3, 0.3, 0.3),
  });
  yPos -= 20;

  signaturePage.drawText("________________________________________", {
    x: marginX + 40,
    y: yPos,
    size: 12,
    font: font,
    color: rgb(0.3, 0.3, 0.3),
  });
  yPos -= 16;

  signaturePage.drawText(`${dadosAssinatura.signatarioNome} (assinatura)`, {
    x: marginX + 50,
    y: yPos,
    size: 9,
    font: font,
    color: rgb(0.4, 0.4, 0.4),
  });

  signaturePage.drawText(
    "Este documento foi assinado eletronicamente com carimbo do tempo. " +
    "A integridade do conteúdo original é garantida pelo hash SHA-256 registrado.",
    {
      x: marginX,
      y: 40,
      size: 7,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
      maxWidth: pageWidth - marginX * 2,
    }
  );

  const modifiedPdfBytes = await pdfDoc.save();
  return new Uint8Array(modifiedPdfBytes);
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { action, contratoId, usuarioId, envelopeId, clienteId }: SignatureRequest = await req.json();

    if (!action || !contratoId) {
      return new Response(
        JSON.stringify({ error: "action e contratoId são obrigatórios." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Busca contrato com dados relacionados
    const { data: contrato, error: ctrError } = await supabase
      .from("contratos")
      .select(`
        id,
        numero_contrato,
        empresa_operadora_id,
        cliente_id,
        representante_id,
        proposta_id,
        tipo_contrato,
        pdf_object_key,
        status_documento,
        status_workflow,
        valor_mensal,
        forma_pagamento,
        assinatura_id,
        versao_atual,
        proposta:propostas(*),
        empresa:empresas(razao_social, nome_fantasia, cnpj, representante_legal, logradouro, numero, cidade, estado, email, whatsapp)
      `)
      .eq("id", contratoId)
      .single();

    if (ctrError || !contrato) {
      return new Response(
        JSON.stringify({ error: "Contrato não encontrado." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- ACTION: CREATE ----
    if (action === "create") {
      if (!contrato.pdf_object_key || contrato.status_documento !== "GERADO") {
        return new Response(
          JSON.stringify({ error: "Contrato precisa ter o PDF gerado antes de enviar para assinatura." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Busca o cliente para obter dados do signatário
      const { data: cliente } = await supabase
        .from("clientes")
        .select(`*, empresas:empresas(*, contatos:contatos(*))`)
        .eq("id", contrato.cliente_id)
        .single();

      const empresa = cliente?.empresas?.[0];
      const contato = empresa?.contatos?.[0];

      // Busca o PDF original do storage para calcular hash real
      const { data: pdfFile } = await supabase.storage
        .from("contratos")
        .download(contrato.pdf_object_key);

      if (!pdfFile) {
        return new Response(
          JSON.stringify({ error: "PDF do contrato não encontrado no storage." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const pdfBytes = new Uint8Array(await pdfFile.arrayBuffer());
      const documentHash = await sha256Hex(pdfBytes);

      // Cria envelope real
      const envelopeIdReal = generateEnvelopeId();
      const secureToken = generateSecureToken();
      const now = new Date().toISOString();

      const signatarioNome = contato?.nome || empresa?.representante_legal || "Representante Legal";
      const signatarioEmail = empresa?.email || cliente?.email || "";
      const signatarioCpf = empresa?.cnpj || cliente?.cpf_cnpj || "";

      const { data: assinatura, error: assError } = await supabase
        .from("assinaturas")
        .insert({
          empresa_operadora_id: contrato.empresa_operadora_id,
          contrato_id: contrato.id,
          provedor: "ASSINADOR_INTERNO",
          status: "ENVIADO",
          envelope_id: envelopeIdReal,
          document_hash: documentHash,
          signatario_nome: signatarioNome,
          signatario_email: signatarioEmail,
          signatario_cpf_cnpj: signatarioCpf,
          secure_token: secureToken,
          expira_em: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          pdf_original_key: contrato.pdf_object_key,
        })
        .select("id, envelope_id, document_hash")
        .single();

      if (assError || !assinatura) {
        return new Response(
          JSON.stringify({ error: `Falha ao criar envelope: ${assError?.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Registra evento ENVIADO
      await supabase.from("assinatura_eventos").insert({
        assinatura_id: assinatura.id,
        evento: "ENVIADO",
        detalhes: {
          provedor: "ASSINADOR_INTERNO",
          signatario: signatarioNome,
          document_hash: documentHash,
          usuario_id: usuarioId,
        },
      });

      // Atualiza contrato com status ENVIADO e link para assinatura
      await supabase
        .from("contratos")
        .update({
          status_documento: "ENVIADO",
          status_workflow: "AGUARDANDO_ASSINATURA",
          assinatura_id: assinatura.id,
          updated_at: now,
        })
        .eq("id", contrato.id);

      // Auditoria
      await supabase.from("contrato_auditoria").insert({
        contrato_id: contrato.id,
        evento: "CONTRATO_ENVIADO_ASSINATURA",
        usuario_id: usuarioId,
        tipo_contrato: contrato.tipo_contrato,
        detalhes: {
          assinatura_id: assinatura.id,
          envelope_id: envelopeIdReal,
          document_hash: documentHash,
        },
      });

      await supabase.from("assinatura_auditoria").insert({
        empresa_operadora_id: contrato.empresa_operadora_id,
        evento: "CONTRATO_ENVIADO_ASSINATURA",
        usuario_id: usuarioId,
        detalhes: {
          contrato_id: contrato.id,
          envelope_id: envelopeIdReal,
          document_hash: documentHash,
        },
      });

      // Gera URL assinada para preview do PDF original
      const { data: signedUrlData } = await supabase.storage
        .from("contratos")
        .createSignedUrl(contrato.pdf_object_key, 3600);

      // Envia notificação por email
      try {
        await supabase.functions.invoke("send-email", {
          body: {
            to: signatarioEmail,
            subject: `Contrato ${contrato.numero_contrato} pronto para assinatura`,
            html: `
              <div style="font-family: Arial, sans-serif; background: #0f172a; color: #fff; padding: 30px; border-radius: 12px;">
                <h2 style="color: #0284c7;">Contrato ${contrato.numero_contrato} — Assinatura Digital</h2>
                <p>Olá <strong>${signatarioNome}</strong>,</p>
                <p>Seu contrato está pronto para assinatura digital.</p>
                <p><strong>Hash do documento (SHA-256):</strong> <code style="color: #38bdf8;">${documentHash}</code></p>
                <p>Acesse o documento e assine utilizando o token seguro:</p>
                <p><code style="display: block; background: #1e293b; padding: 10px; border-radius: 4px; font-size: 12px; word-break: break-all;">${secureToken}</code></p>
                <a href="${Deno.env.get("PUBLIC_APP_URL") || "https://plataforma.sobremidia.com.br"}/representantes/assinaturas" style="display: inline-block; padding: 12px 24px; background: #0284c7; color: #fff; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 15px;">Acessar Assinatura</a>
              </div>
            `,
          },
        });
      } catch (emailErr) {
        console.warn("[contract-signature-flow] Falha no envio de email:", emailErr);
      }

      return new Response(
        JSON.stringify({
          success: true,
          assinaturaId: assinatura.id,
          envelopeId: envelopeIdReal,
          documentHash,
          secureToken,
          signatarioNome,
          signatarioEmail,
          downloadUrl: signedUrlData?.signedUrl,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- ACTION: VIEW ----
    if (action === "view") {
      if (!envelopeId) {
        return new Response(
          JSON.stringify({ error: "envelopeId é obrigatório para visualização." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: ass } = await supabase
        .from("assinaturas")
        .select("*")
        .eq("envelope_id", envelopeId)
        .single();

      if (!ass) {
        return new Response(
          JSON.stringify({ error: "Envelope de assinatura não encontrado." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Atualiza status para VISUALIZADO
      const novoStatus = ass.status === "ENVIADO" ? "VISUALIZADO" : ass.status;
      await supabase
        .from("assinaturas")
        .update({
          status: novoStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", ass.id);

      // Registra evento VISUALIZADO
      await supabase.from("assinatura_eventos").insert({
        assinatura_id: ass.id,
        evento: "VISUALIZADO",
        detalhes: { cliente_id: clienteId, usuario_id: usuarioId },
      });

      // Gera URL assinada para download do PDF original
      const { data: signedUrlData } = await supabase.storage
        .from("contratos")
        .createSignedUrl(ass.pdf_original_key, 3600);

      return new Response(
        JSON.stringify({
          success: true,
          status: novoStatus,
          envelopeId,
          documentHash: ass.document_hash,
          downloadUrl: signedUrlData?.signedUrl,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- ACTION: SIGN ----
    if (action === "sign") {
      if (!envelopeId || !usuarioId) {
        return new Response(
          JSON.stringify({ error: "envelopeId e usuarioId são obrigatórios para assinar." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: ass, error: assError } = await supabase
        .from("assinaturas")
        .select("*")
        .eq("envelope_id", envelopeId)
        .single();

      if (assError || !ass) {
        return new Response(
          JSON.stringify({ error: "Envelope de assinatura não encontrado." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (ass.status === "ASSINADO") {
        return new Response(
          JSON.stringify({ error: "Este documento já foi assinado." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Busca o PDF original do storage
      const { data: pdfFile } = await supabase.storage
        .from("contratos")
        .download(ass.pdf_original_key);

      if (!pdfFile) {
        return new Response(
          JSON.stringify({ error: "PDF original não encontrado no storage." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const originalPdfBytes = new Uint8Array(await pdfFile.arrayBuffer());

      // Cria o PDF assinado (com página de assinatura adicional)
      const signedPdfBytes = await createSignedPDF(originalPdfBytes, {
        signatarioNome: ass.signatario_nome || "Signatário",
        signatarioEmail: ass.signatario_email || "",
        signatarioCpf: ass.signatario_cpf_cnpj || "",
        assinadoEm: new Date().toISOString(),
        documentHash: ass.document_hash,
        numeroContrato: contrato.numero_contrato,
      });

      // Calcula hash do PDF assinado
      const signedDocumentHash = await sha256Hex(signedPdfBytes);

      // Upload do PDF assinado para storage
      const signedObjectKey = `tenants/${contrato.empresa_operadora_id}/contratos/${contrato.id}/signed_${contrato.numero_contrato}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from("contratos")
        .upload(signedObjectKey, signedPdfBytes, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (uploadError) {
        return new Response(
          JSON.stringify({ error: `Falha no upload do PDF assinado: ${uploadError.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const now = new Date().toISOString();

      // Atualiza assinatura com status ASSINADO e PDF assinado
      await supabase
        .from("assinaturas")
        .update({
          status: "ASSINADO",
          assinado_em: now,
          pdf_assinado_key: signedObjectKey,
          signed_document_hash: signedDocumentHash,
          updated_at: now,
        })
        .eq("id", ass.id);

      // Registra evento ASSINADO
      await supabase.from("assinatura_eventos").insert({
        assinatura_id: ass.id,
        evento: "ASSINADO",
        detalhes: {
          usuario_id: usuarioId,
          signed_document_hash: signedDocumentHash,
          signed_pdf_key: signedObjectKey,
          ip_address: req.headers.get("cf-connecting-ip") || "unknown",
          user_agent: req.headers.get("user-agent") || "unknown",
        },
      });

      // Atualiza contrato com status ASSINADO e pdf_assinado_key
      await supabase
        .from("contratos")
        .update({
          status_documento: "ASSINADO",
          status_workflow: "PAGAMENTO_CONFIRMADO",
          pdf_assinado_key: signedObjectKey,
          signed_at: now,
          updated_at: now,
        })
        .eq("id", contrato.id);

      // Auditoria
      await supabase.from("contrato_auditoria").insert({
        contrato_id: contrato.id,
        evento: "CONTRATO_ASSINADO",
        usuario_id: usuarioId,
        tipo_contrato: contrato.tipo_contrato,
        versao: contrato.versao_atual || 1,
        detalhes: {
          assinatura_id: ass.id,
          envelope_id: ass.envelope_id,
          signed_document_hash: signedDocumentHash,
          signed_pdf_key: signedObjectKey,
          signatario: ass.signatario_nome,
        },
      });

      await supabase.from("assinatura_auditoria").insert({
        empresa_operadora_id: contrato.empresa_operadora_id,
        evento: "CONTRATO_ASSINADO_SUCESSO",
        usuario_id: usuarioId,
        detalhes: {
          contrato_id: contrato.id,
          envelope_id: ass.envelope_id,
          signed_document_hash: signedDocumentHash,
          signed_pdf_key: signedObjectKey,
        },
      });

      // Gera URL assinada para download do PDF assinado
      const { data: signedUrlData } = await supabase.storage
        .from("contratos")
        .createSignedUrl(signedObjectKey, 3600);

      return new Response(
        JSON.stringify({
          success: true,
          assinaturaId: ass.id,
          envelopeId: ass.envelope_id,
          signedDocumentHash,
          signedPdfKey: signedObjectKey,
          signedDownloadUrl: signedUrlData?.signedUrl,
          status: "ASSINADO",
          assinadoEm: now,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- ACTION: DOWNLOAD ----
    if (action === "download") {
      if (!envelopeId) {
        return new Response(
          JSON.stringify({ error: "envelopeId é obrigatório para download." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: ass } = await supabase
        .from("assinaturas")
        .select("*")
        .eq("envelope_id", envelopeId)
        .single();

      if (!ass) {
        return new Response(
          JSON.stringify({ error: "Envelope de assinatura não encontrado." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Decide qual PDF servir: o assinado se existir, senão o original
      const keyToDownload = ass.pdf_assinado_key || ass.pdf_original_key;
      if (!keyToDownload) {
        return new Response(
          JSON.stringify({ error: "Nenhum PDF disponível para download." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: signedUrlData } = await supabase.storage
        .from("contratos")
        .createSignedUrl(keyToDownload, 3600);

      // Registra evento de download
      await supabase.from("assinatura_eventos").insert({
        assinatura_id: ass.id,
        evento: "VALIDADO",
        detalhes: {
          acao: "download",
          usuario_id: usuarioId,
          arquivo_key: keyToDownload,
          is_signed: !!ass.pdf_assinado_key,
        },
      });

      return new Response(
        JSON.stringify({
          success: true,
          downloadUrl: signedUrlData?.signedUrl,
          fileName: keyToDownload.split("/").pop(),
          status: ass.status,
          isSigned: !!ass.pdf_assinado_key,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Ação inválida. Use: create, view, sign, download." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[contract-signature-flow] Erro:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
