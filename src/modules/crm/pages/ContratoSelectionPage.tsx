import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { contratoService, ContratoTemplateRecord, ContratoCompleto } from '../services/contrato.service';
import { contratoDocumentoService, getCanonicalTemplateForTipo, isTemplateCompleto, CANONICAL_TEMPLATE_HTML_ANUNCIANTE, CANONICAL_TEMPLATE_HTML_PARCEIRO } from '../services/contratoDocumento.service';
import { clienteService, ClienteCompleto } from '../services/cliente.service';
import { supabase } from '@/integrations/supabase/client';
import { getOfficialPdfForTipoContrato } from '../services/contractResolver.service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  FileText,
  CheckCircle2,
  ArrowLeft,
  Loader2,
  ShieldCheck,
  Handshake,
  RotateCcw,
  XCircle,
  FileCheck,
  Send,
  Download,
  Eye,
  AlertCircle
} from 'lucide-react';

export default function ContratoSelectionPage() {
  const { propostaId } = useParams<{ propostaId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const clienteIdParam = searchParams.get('clienteId');
  const pontoIdParam = searchParams.get('pontoId');
  // Suporte a contratoId direto (ORIGEM B e C - sem proposta)
  const contratoIdParam = searchParams.get('contratoId');

  const [proposta, setProposta] = useState<any>(null);
  const [cliente, setCliente] = useState<ClienteCompleto | null>(null);
  const [quantidadeTelas, setQuantidadeTelas] = useState(0);
  const [templates, setTemplates] = useState<ContratoTemplateRecord[]>([]);
  const [contratoExistente, setContratoExistente] = useState<ContratoCompleto | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectingType, setSelectingType] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<ContratoTemplateRecord | null>(null);
  const [mode, setMode] = useState<'SELECTION' | 'PREVIEW'>('SELECTION');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isSendingSignature, setIsSendingSignature] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const [ponto, setPonto] = useState<any>(null);

  // P0.3.5 — Preview canônico: idêntico ao PDF gerado (fonte única de verdade)
  const [canonicalHtml, setCanonicalHtml] = useState<string>('');
  const [loadingCanonical, setLoadingCanonical] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const tplList = await contratoService.fetchTemplates();
    setTemplates(tplList);

    // ORIGEM A: propostaId - fluxo comercial legado
    if (propostaId && propostaId !== 'direto') {
      const { data: propData } = await supabase
        .from('propostas')
        .select(`*, cliente:clientes(*), representante:representantes(*, usuario:usuarios(nome, email))`)
        .eq('id', propostaId)
        .maybeSingle();
      if (propData) {
        setProposta(propData);
        const cliData = await clienteService.findById(propData.cliente_id);
        setCliente(cliData);
        const existingCtr = await contratoService.findByPropostaId(propostaId);
        if (existingCtr && existingCtr.tipo_contrato) {
          setContratoExistente(existingCtr);
          const matchedTpl = tplList.find(t => t.tipo_contrato === existingCtr.tipo_contrato);
          if (matchedTpl) { setSelectedTemplate(matchedTpl); setMode('PREVIEW'); }
          const { data: itens } = await supabase.from('itens_contrato').select('quantidade').eq('contrato_id', existingCtr.id);
          const totalTelas = (itens || []).reduce((acc: number, item: any) => acc + (Number(item.quantidade) || 0), 0);
          setQuantidadeTelas(totalTelas);
        }
      } else if (clienteIdParam) {
        const cliData = await clienteService.findById(clienteIdParam);
        setCliente(cliData);
      }
    // ORIGEM B e C: contratoId direto - cadastro sem proposta
    } else if (contratoIdParam) {
      const ctr = await contratoService.findByContratoId(contratoIdParam);
      if (ctr) {
        setContratoExistente(ctr);
        if (ctr.tipo_contrato) {
          const matchedTpl = tplList.find(t => t.tipo_contrato === ctr.tipo_contrato);
          if (matchedTpl) { setSelectedTemplate(matchedTpl); setMode('PREVIEW'); }
        }
        // Carrega cliente se ANUNCIANTE
        if (ctr.cliente_id) {
          const cliData = await clienteService.findById(ctr.cliente_id);
          setCliente(cliData);
        }
        // Carrega ponto se PARCEIRO
        if (ctr.ponto_id) {
          const { data: pontoData } = await supabase
            .from('pontos')
            .select('*')
            .eq('id', ctr.ponto_id)
            .maybeSingle();
          if (pontoData) setPonto(pontoData);
        }
        const { data: itens } = await supabase.from('itens_contrato').select('quantidade').eq('contrato_id', ctr.id);
        const totalTelas = (itens || []).reduce((acc: number, item: any) => acc + (Number(item.quantidade) || 0), 0);
        setQuantidadeTelas(totalTelas);
      } else {
        toast({ title: 'Contrato nao encontrado', description: `ID: ${contratoIdParam}`, variant: 'destructive' });
      }
    } else if (clienteIdParam) {
      const cliData = await clienteService.findById(clienteIdParam);
      setCliente(cliData);
      const { data: existingCtr } = await supabase
        .from('contratos')
        .select('id')
        .eq('cliente_id', clienteIdParam)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingCtr?.id) {
        const fullCtr = await contratoService.findByContratoId(existingCtr.id);
        if (fullCtr) {
          setContratoExistente(fullCtr);
          if (fullCtr.tipo_contrato) {
            const matchedTpl = tplList.find(t => t.tipo_contrato === fullCtr.tipo_contrato);
            if (matchedTpl) { setSelectedTemplate(matchedTpl); setMode('PREVIEW'); }
          }
          const { data: itens } = await supabase.from('itens_contrato').select('quantidade').eq('contrato_id', fullCtr.id);
          const totalTelas = (itens || []).reduce((acc: number, item: any) => acc + (Number(item.quantidade) || 0), 0);
          setQuantidadeTelas(totalTelas);
        }
      }
    } else if (pontoIdParam) {
      const { data: pontoData } = await supabase
        .from('pontos')
        .select('*')
        .eq('id', pontoIdParam)
        .maybeSingle();
      if (pontoData) setPonto(pontoData);
      const { data: existingCtr } = await supabase
        .from('contratos')
        .select('id')
        .eq('ponto_id', pontoIdParam)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingCtr?.id) {
        const fullCtr = await contratoService.findByContratoId(existingCtr.id);
        if (fullCtr) {
          setContratoExistente(fullCtr);
          if (fullCtr.tipo_contrato) {
            const matchedTpl = tplList.find(t => t.tipo_contrato === fullCtr.tipo_contrato);
            if (matchedTpl) { setSelectedTemplate(matchedTpl); setMode('PREVIEW'); }
          }
          const { data: itens } = await supabase.from('itens_contrato').select('quantidade').eq('contrato_id', fullCtr.id);
          const totalTelas = (itens || []).reduce((acc: number, item: any) => acc + (Number(item.quantidade) || 0), 0);
          setQuantidadeTelas(totalTelas);
        }
      }
    }

    setLoading(false);
  }, [propostaId, contratoIdParam, clienteIdParam, pontoIdParam]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // P0.3.5 — Carrega HTML canônico sempre que o contrato existente mudar.
  // Usa obterHtmlContratoPorContratoId → coletarDadosReais → montarDadosTemplate → preencherTemplate
  // Mesma cadeia usada por gerarDocumentoContrato e AssinaturaContratoDialog.
  useEffect(() => {
    if (!contratoExistente?.id) {
      setCanonicalHtml('');
      return;
    }
    setLoadingCanonical(true);
    contratoDocumentoService
      .obterHtmlContratoPorContratoId(contratoExistente.id)
      .then((html) => {
        setCanonicalHtml(html);
      })
      .catch((err) => {
        console.warn('[ContratoSelectionPage] Falha ao carregar HTML canônico, usando fallback local:', err);
        setCanonicalHtml('');
      })
      .finally(() => setLoadingCanonical(false));
  }, [contratoExistente?.id]);

  const handleSelectModel = async (tpl: ContratoTemplateRecord) => {
    if (!user) return;
    setSelectingType(tpl.tipo_contrato);
    const clienteId = (proposta as any)?.cliente_id || clienteIdParam || cliente?.id || null;
    const pontoId = pontoIdParam || null;
    const result = await contratoService.selectContractModel({
      propostaId: (propostaId && propostaId !== 'direto') ? propostaId : null,
      clienteId,
      pontoId,
      contratoId: contratoIdParam || contratoExistente?.id || null,
      tipoContrato: tpl.tipo_contrato,
      templateId: tpl.id,
      templateNome: tpl.nome,
      templateVersao: tpl.versao,
      usuarioResponsavelId: user.id,
    });
    setSelectingType(null);
    if (result.success) {
      setSelectedTemplate(tpl);
      setMode('PREVIEW');
      toast({ title: 'Modelo de Contrato Selecionado!', description: `Contrato de ${tpl.tipo_contrato} vinculado com sucesso.` });
      loadData();
    } else {
      toast({ title: 'Erro na selecao', description: result.error || 'Falha ao vincular modelo.', variant: 'destructive' });
    }
  };

  const handlePreviewOfficial = async (tipo: 'ANUNCIANTE' | 'PARCEIRO') => {
    try {
      // Usa o template padrão já carregado do banco (is_default=true)
      const tpl = templates.find(t => t.tipo_contrato === tipo && t.is_default && t.conteudo_html && t.conteudo_html.length > 200)
             || templates.find(t => t.tipo_contrato === tipo && t.conteudo_html && t.conteudo_html.length > 200);
      if (!tpl) {
        toast({ title: 'Template não encontrado', description: `Nenhum template padrão de ${tipo} disponível.`, variant: 'destructive' });
        return;
      }
      const { gerarPdfDoHtml, preencherTemplate } = await import('../services/contratoDocumento.service');
      const htmlRenderizado = preencherTemplate(tpl.conteudo_html, {}, tipo as 'ANUNCIANTE' | 'PARCEIRO' | 'GESTOR');
      const bytes = await gerarPdfDoHtml(htmlRenderizado, `MODELO-${tipo}`, tipo, tpl.versao || 1);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch (err: any) {
      toast({ title: 'Erro', description: err?.message || 'Falha ao gerar preview.', variant: 'destructive' });
    }
  };

  const handleDownloadOfficial = async (tipo: 'ANUNCIANTE' | 'PARCEIRO') => {
    try {
      const tpl = templates.find(t => t.tipo_contrato === tipo && t.is_default && t.conteudo_html && t.conteudo_html.length > 200)
             || templates.find(t => t.tipo_contrato === tipo && t.conteudo_html && t.conteudo_html.length > 200);
      if (!tpl) {
        toast({ title: 'Template não encontrado', description: `Nenhum template padrão de ${tipo} disponível.`, variant: 'destructive' });
        return;
      }
      const { gerarPdfDoHtml, preencherTemplate } = await import('../services/contratoDocumento.service');
      const htmlRenderizado = preencherTemplate(tpl.conteudo_html, {}, tipo as 'ANUNCIANTE' | 'PARCEIRO' | 'GESTOR');
      const bytes = await gerarPdfDoHtml(htmlRenderizado, `MODELO-${tipo}`, tipo, tpl.versao || 1);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `Contrato_${tipo}_Oficial.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
    } catch (err: any) {
      toast({ title: 'Erro', description: err?.message || 'Falha ao baixar PDF.', variant: 'destructive' });
    }
  };

  const renderFilledContractHTML = () => {
    if (!selectedTemplate) return '';
    const tipoContrato = (contratoExistente?.tipo_contrato || selectedTemplate.tipo_contrato || 'ANUNCIANTE') as 'ANUNCIANTE' | 'PARCEIRO' | 'GESTOR';

    if (!proposta && !cliente && !contratoExistente && !ponto) {
      return '<div style="padding:16px;text-align:center;color:#94a3b8">Preview oficial disponivel via PDF.</div>';
    }

    const emp = cliente?.empresas?.[0];
    const ct = emp?.contatos?.[0];

    const formMock: Record<string, any> = {
      razaoSocial: emp?.razao_social || emp?.nome_fantasia || ponto?.nome || ponto?.razao_social || '',
      nomeFantasia: emp?.nome_fantasia || emp?.razao_social || ponto?.nome_fantasia || ponto?.nome || '',
      cnpj: emp?.cnpj || ponto?.cnpj || '',
      responsavel: ct?.nome || emp?.representante_legal || ponto?.responsavel_nome || ponto?.representante_legal || '',
      logradouro: emp?.logradouro || ponto?.logradouro || ponto?.endereco || '',
      numero: emp?.numero || ponto?.numero || '',
      bairro: emp?.bairro || ponto?.bairro || '',
      cidade: emp?.cidade || ponto?.cidade || 'Caruaru',
      estado: emp?.estado || ponto?.estado || 'PE',
      cep: emp?.cep || ponto?.cep || '',
      telefone: emp?.telefone || ct?.telefone || ponto?.responsavel_telefone || ponto?.telefone || '',
      whatsapp: emp?.whatsapp || ponto?.whatsapp || '',
      email: emp?.email || ct?.email || ponto?.responsavel_email || ponto?.email || '',
      instagram: emp?.instagram || ponto?.instagram || '',
      website: emp?.website || emp?.site || ponto?.website || '',
      diasSemana: ponto?.dias_funcionamento || proposta?.dias_semana || 'Segunda a Sábado',
      horarioInicio: ponto?.horario_abertura || proposta?.horario_inicio || '08:00',
      horarioFim: ponto?.horario_fechamento || proposta?.horario_fim || '22:00',
      tituloCampanha: proposta?.titulo_campanha || (emp?.nome_fantasia ? `Campanha ${emp.nome_fantasia}` : 'Campanha de Mídia Indoor'),
      pacoteVeiculacao: proposta?.pacote_veiculacao || proposta?.plano || 'Mídia Indoor Exclusiva',
      periodoVeiculacao: proposta?.periodo_veiculacao || (contratoExistente?.data_inicio && contratoExistente?.data_fim ? `De ${new Date(contratoExistente.data_inicio).toLocaleDateString('pt-BR')} a ${new Date(contratoExistente.data_fim).toLocaleDateString('pt-BR')}` : '12 meses'),
      valorMensal: Number(contratoExistente?.valor_mensal) || Number(proposta?.valor_final) || Number(proposta?.valor_total) || 0,
      formaPagamento: contratoExistente?.forma_pagamento || proposta?.forma_pagamento || 'PIX',
      quantidadeTelas: quantidadeTelas > 0 ? quantidadeTelas : (proposta?.quantidade_telas ? Number(proposta.quantidade_telas) : 1),
      dataInicio: contratoExistente?.data_inicio ? new Date(contratoExistente.data_inicio).toISOString() : new Date().toISOString(),
      dataFim: contratoExistente?.data_fim ? new Date(contratoExistente.data_fim).toISOString() : new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
      numeroContrato: contratoExistente?.numero_contrato || 'CTR-NOVO',
      versao: contratoExistente?.versao_atual || 1,
    };

    return contratoDocumentoService.renderizarPreviewContrato(
      tipoContrato,
      selectedTemplate.conteudo_html,
      formMock,
      contratoExistente?.status_documento === 'ASSINADO'
        ? {
            signatarioNome: contratoExistente?.assinado_por || formMock.responsavel || formMock.razaoSocial,
            dataAssinatura: contratoExistente?.documento_assinado_em ? new Date(contratoExistente.documento_assinado_em).toLocaleDateString('pt-BR') : undefined,
          }
        : null
    );
  };



  const handleGeneratePDF = async () => {
    if (!contratoExistente?.id || !user) {
      toast({ title: 'Erro', description: 'Registro de contrato nao localizado.', variant: 'destructive' });
      return;
    }
    if (['GERADO', 'ENVIADO', 'ASSINADO'].includes(contratoExistente.status_documento || '')) {
      const result = await contratoService.getContractDownloadUrl(contratoExistente.id);
      if (result.success && result.downloadUrl) {
        setDownloadUrl(result.downloadUrl);
        toast({ title: 'Documento Disponivel', description: `PDF do contrato ${contratoExistente.numero_contrato} ja foi gerado.` });
      } else {
        toast({ title: 'Erro', description: result.error || 'Falha ao localizar documento.', variant: 'destructive' });
      }
      return;
    }
    if (contratoExistente.status_documento === 'CANCELADO') {
      toast({ title: 'Contrato Cancelado', description: 'Um contrato cancelado nao pode ter documento regenerado.', variant: 'destructive' });
      return;
    }
    setIsGeneratingPdf(true);
    const result = await contratoService.generateContractPDF(contratoExistente.id, user.id);
    setIsGeneratingPdf(false);
    if (result.success) {
      setDownloadUrl(result.signedDownloadUrl || null);
      toast({ title: 'Contrato PDF Gerado!', description: 'Hash: ' + (result.documentHash || 'N/I').substring(0, 16) + '...' });
      loadData();
    } else {
      toast({ title: 'Erro na geracao', description: result.error || 'Falha ao gerar PDF.', variant: 'destructive' });
    }
  };

  const handleDownloadPDF = async () => {
    if (!contratoExistente?.id) return;
    try {
      await contratoDocumentoService.baixarDocumentoContrato(contratoExistente.id, user?.id);
      toast({ title: 'Download iniciado' });
    } catch (err: any) {
      toast({ title: 'Erro no Download', description: err?.message || 'Não foi possível baixar o documento.', variant: 'destructive' });
    }
  };

  const handleViewPDF = async () => {
    if (!contratoExistente?.id) return;
    try {
      await contratoDocumentoService.visualizarDocumentoContrato(contratoExistente.id);
    } catch (err: any) {
      toast({ title: 'Erro na Visualizacao', description: err?.message || 'Não foi possível abrir o documento.', variant: 'destructive' });
    }
  };

  const handleSendForSignature = async () => {
    if (!contratoExistente?.id || !user) {
      toast({ title: 'Erro', description: 'Registro de contrato nao localizado.', variant: 'destructive' });
      return;
    }
    setIsSendingSignature(true);
    const result = await contratoService.enviarParaAssinatura(contratoExistente.id, user.id);
    setIsSendingSignature(false);
    if (result.success) {
      toast({ title: 'Contrato Enviado para Assinatura!', description: `Envelope ${result.envelopeId} criado.` });
      loadData();
    } else {
      toast({ title: 'Erro no envio', description: result.error, variant: 'destructive' });
    }
  };

  const handleCancelContract = async () => {
    if (!contratoExistente?.id || !user) return;
    const result = await contratoService.cancelContract(contratoExistente.id, 'Cancelado a pedido do representante.', user.id);
    if (result.success) {
      toast({ title: 'Contrato Cancelado' });
      loadData();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const emp = cliente?.empresas?.[0];
  const docStatus = contratoExistente?.status_documento || 'RASCUNHO';
  const hasPDFGenerated = docStatus === 'GERADO' || docStatus === 'ENVIADO' || docStatus === 'ASSINADO';
  const envelopeEnviado = !!contratoExistente?.assinatura_envelope_id || docStatus === 'ENVIADO';
  const piNavId = contratoExistente?.id || '';

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2.5 rounded-xl bg-primary/15 text-primary">
              <FileCheck className="h-6 w-6" />
            </div>
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">Modulo de Contratos</h2>
            <Badge className="bg-primary/20 text-primary border-primary/30 ml-2">FASE 7.4-B</Badge>
          </div>
          <p className="text-slate-300 text-xs">Selecao do Modelo de Contrato &rarr; Preenchimento Automatico &rarr; Geracao PDF &rarr; Assinatura Digital</p>
        </div>
        <Button variant="outline" onClick={() => {
          const basePath = window.location.pathname.startsWith('/workspace') ? '/workspace' : '/representantes';
          navigate(`${basePath}/contratos`);
        }} className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs">
          <ArrowLeft className="h-4 w-4" />
          Voltar para Contratos
        </Button>
      </div>

      {/* Proposta card - somente quando proposta existe */}
      {proposta && (
        <Card className="border border-white/10 bg-slate-900/70 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardHeader className="pb-3 border-b border-white/10">
            <CardTitle className="text-base font-bold text-white flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Proposta Aprovada: {proposta?.numero_proposta}
              </span>
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">{proposta?.status}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block">Cliente / Empresa:</span>
                <strong className="text-white font-bold">{emp?.nome_fantasia || emp?.razao_social || 'N/A'}</strong>
                <span className="text-slate-500 block text-[11px]">{emp?.cnpj}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Valor Mensal:</span>
                <strong className="text-emerald-400 font-bold text-sm">
                  R$ {Number(proposta?.valor_final || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </strong>
                <span className="text-slate-500 block text-[11px]">{proposta?.forma_pagamento}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Representante:</span>
                <strong className="text-slate-200">{proposta?.representante?.usuario?.nome || 'Equipe Comercial'}</strong>
              </div>
              <div>
                <span className="text-slate-400 block">Validade:</span>
                <strong className="text-amber-400">{proposta?.validade_dias} Dias</strong>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Card contrato direto - sem proposta */}
      {!proposta && contratoExistente && (
        <Card className="border border-white/10 bg-slate-900/70 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardHeader className="pb-3 border-b border-white/10">
            <CardTitle className="text-base font-bold text-white flex items-center justify-between">
              <span className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-400" />
                Contrato de Cadastro Direto: {contratoExistente.numero_contrato}
              </span>
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">{contratoExistente.tipo_contrato}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block">Tipo:</span>
                <strong className="text-white font-bold">{contratoExistente.tipo_contrato}</strong>
              </div>
              <div>
                <span className="text-slate-400 block">Valor Mensal:</span>
                <strong className="text-emerald-400 font-bold text-sm">
                  R$ {Number(contratoExistente.valor_mensal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block">Status Documento:</span>
                <strong className="text-primary">{contratoExistente.status_documento || 'RASCUNHO'}</strong>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {mode === 'SELECTION' && (
        <div className="space-y-4">
          <div className="text-center py-2">
            <h3 className="text-lg font-bold text-white">Escolha o Modelo de Contrato Comercial</h3>
            <p className="text-xs text-slate-400">A decisao pertence ao representante comercial responsavel pelo atendimento.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl hover:border-primary/50 transition-all flex flex-col justify-between">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-3 rounded-2xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-bold text-white">Contrato de Anunciante</CardTitle>
                    <Badge variant="outline" className="border-blue-500/30 text-blue-400 bg-blue-500/10 text-[10px] mt-1">Modelo Comercial Padrao</Badge>
                  </div>
                </div>
                <CardDescription className="text-slate-300 text-xs leading-relaxed pt-2">
                  Para clientes que contratam veiculacao de publicidade e campanhas na rede de telas da SOBRE MIDIA.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-2 pb-6 space-y-2">
                <Button
                  onClick={() => {
                    const tpl = templates.find(t => t.tipo_contrato === 'ANUNCIANTE' && t.conteudo_html && t.conteudo_html.length > 200 && !t.conteudo_html.includes('(preservado)')) || templates.find(t => t.tipo_contrato === 'ANUNCIANTE');
                    if (tpl) handleSelectModel(tpl);
                  }}
                  disabled={selectingType === 'ANUNCIANTE'}
                  className="w-full gradient-primary glow-primary font-bold rounded-xl h-11 shadow-lg gap-2"
                >
                  {selectingType === 'ANUNCIANTE' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  <span>Selecionar Contrato de Anunciante</span>
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handlePreviewOfficial('ANUNCIANTE')} className="flex-1 border-white/10 text-slate-300 rounded-xl text-xs gap-1"><Eye className="h-3.5 w-3.5"/> Pre-visualizar</Button>
                  <Button variant="outline" size="sm" onClick={() => handleDownloadOfficial('ANUNCIANTE')} className="flex-1 border-white/10 text-slate-300 rounded-xl text-xs gap-1"><Download className="h-3.5 w-3.5"/> Baixar PDF</Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl hover:border-emerald-500/50 transition-all flex flex-col justify-between">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <Handshake className="h-6 w-6" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-bold text-white">Contrato de Parceria</CardTitle>
                    <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-[10px] mt-1">Cessao de Espaco Fisico</Badge>
                  </div>
                </div>
                <CardDescription className="text-slate-300 text-xs leading-relaxed pt-2">
                  Para estabelecimentos parceiros que cedem espaco fisico para instalacao dos pontos de exibicao da SOBRE MIDIA.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-2 pb-6 space-y-2">
                <Button
                  onClick={() => {
                    const tpl = templates.find(t => t.tipo_contrato === 'PARCEIRO' && t.conteudo_html && t.conteudo_html.length > 200 && !t.conteudo_html.includes('(preservado)')) || templates.find(t => t.tipo_contrato === 'PARCEIRO');
                    if (tpl) handleSelectModel(tpl);
                  }}
                  disabled={selectingType === 'PARCEIRO'}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl h-11 shadow-lg gap-2"
                >
                  {selectingType === 'PARCEIRO' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  <span>Selecionar Contrato de Parceria</span>
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handlePreviewOfficial('PARCEIRO')} className="flex-1 border-white/10 text-slate-300 rounded-xl text-xs gap-1"><Eye className="h-3.5 w-3.5"/> Pre-visualizar</Button>
                  <Button variant="outline" size="sm" onClick={() => handleDownloadOfficial('PARCEIRO')} className="flex-1 border-white/10 text-slate-300 rounded-xl text-xs gap-1"><Download className="h-3.5 w-3.5"/> Baixar PDF</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {mode === 'PREVIEW' && selectedTemplate && (
        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl rounded-2xl">
          <CardHeader className="border-b border-white/10 pb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                <FileCheck className="h-5 w-5 text-emerald-400" />
                Pre-visualizacao do Contrato ({selectedTemplate.nome})
              </CardTitle>
              <CardDescription className="text-slate-400 text-xs">
                Texto jurídico preenchido com dados reais do banco — idêntico ao PDF oficial gerado.
                {hasPDFGenerated && contratoExistente?.pdf_object_key && (
                  <span className="ml-2 text-emerald-400">Documento PDF ja gerado no storage</span>
                )}
              </CardDescription>
            </div>
            <Badge className="bg-primary/20 text-primary border-primary/30">Status: {docStatus}</Badge>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            {/* P0.3.5 — Preview canônico: idêntico ao PDF que será gerado */}
            {loadingCanonical ? (
              <div className="p-6 rounded-xl bg-slate-950/90 border border-white/10 flex items-center justify-center min-h-[200px] gap-3 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Carregando pré-visualização oficial...</span>
              </div>
            ) : (
              <div
                className="p-6 rounded-xl bg-slate-950/90 border border-white/10 text-slate-200 text-sm leading-relaxed max-h-[400px] overflow-y-auto shadow-inner"
                dangerouslySetInnerHTML={{
                  __html: canonicalHtml || renderFilledContractHTML()
                }}
              />
            )}
            <div className="pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => { setMode('SELECTION'); setDownloadUrl(null); }} className="border-slate-700 text-slate-300 rounded-xl text-xs gap-1.5">
                  <ArrowLeft className="h-3.5 w-3.5" /> Voltar
                </Button>
                <Button variant="outline" onClick={() => setMode('SELECTION')} className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 rounded-xl text-xs gap-1.5">
                  <RotateCcw className="h-3.5 w-3.5" /> Trocar Contrato
                </Button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {!hasPDFGenerated && (
                  <Button variant="outline" onClick={handleCancelContract} className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10 rounded-xl text-xs gap-1.5">
                    <XCircle className="h-3.5 w-3.5" /> Cancelar
                  </Button>
                )}
                {hasPDFGenerated && (
                  <>
                    <Button variant="outline" size="sm" onClick={handleViewPDF} className="border-slate-500/30 text-slate-300 rounded-xl text-xs gap-1">
                      <Eye className="h-3.5 w-3.5" /> Visualizar
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleDownloadPDF} className="border-cyan-500/30 text-cyan-400 rounded-xl text-xs gap-1">
                      <Download className="h-3.5 w-3.5" /> Baixar PDF
                    </Button>
                  </>
                )}
                {!hasPDFGenerated && docStatus === 'RASCUNHO' && (
                  <Button onClick={handleGeneratePDF} disabled={isGeneratingPdf} className="gradient-primary glow-primary font-bold rounded-xl text-xs px-6 h-10 gap-2 shadow-xl">
                    {isGeneratingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    <span>Gerar PDF Definitivo</span>
                  </Button>
                )}
                {docStatus === 'GERADO' && !envelopeEnviado && (
                  <Button onClick={handleSendForSignature} disabled={isSendingSignature} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs px-6 h-10 gap-2 shadow-xl">
                    {isSendingSignature ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    <span>Enviar para Assinatura</span>
                  </Button>
                )}
                {docStatus === 'ENVIADO' && !contratoExistente?.pdf_assinado_key && (
                  <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">
                    Aguardando assinatura do cliente no portal
                  </Badge>
                )}
                {contratoExistente && (contratoExistente.status_documento === 'ASSINADO' || contratoExistente.pdf_assinado_key) && (
                  <Button
                    variant="outline" size="sm"
                    onClick={async () => {
                      if (!contratoExistente?.id) return;
                      const result = await contratoService.getSignedDocumentDownloadUrl(contratoExistente.id);
                      if (result.success && result.downloadUrl) window.open(result.downloadUrl, '_blank', 'noopener,noreferrer');
                      else toast({ title: 'Erro', description: result.error, variant: 'destructive' });
                    }}
                    className="border-emerald-500/30 text-emerald-400 rounded-xl text-xs gap-1"
                  >
                    <Download className="h-3.5 w-3.5" /> Ver PDF Assinado
                  </Button>
                )}
                {contratoExistente && contratoExistente.status_documento !== 'ASSINADO' && contratoExistente.status_documento !== 'CANCELADO' && piNavId && (
                  <Button
                    onClick={() => {
                      const basePath = window.location.pathname.startsWith('/workspace') ? '/workspace' : '/representantes';
                      navigate(`${basePath}/pi/novo/${piNavId}`);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs px-6 h-10 gap-2 shadow-xl hover:scale-105 transition-all"
                  >
                    <Send className="h-4 w-4" />
                    <span>Avancar para Pedido de Insercao (PI)</span>
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
