import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { contratoService, ContratoTemplateRecord, ContratoCompleto } from '../services/contrato.service';
import { contratoDocumentoService } from '../services/contratoDocumento.service';
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

  const handlePreviewOfficial = (tipo: 'ANUNCIANTE' | 'PARCEIRO') => {
    const pdf = getOfficialPdfForTipoContrato(tipo);
    if (pdf) window.open(pdf.publicPath, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadOfficial = (tipo: 'ANUNCIANTE' | 'PARCEIRO') => {
    const pdf = getOfficialPdfForTipoContrato(tipo);
    if (pdf) { const a = document.createElement('a'); a.href = pdf.publicPath; a.download = pdf.fileName; a.click(); }
  };

  const renderFilledContractHTML = () => {
    if (!selectedTemplate) return '';
    const tipoContrato = contratoExistente?.tipo_contrato || selectedTemplate.tipo_contrato;
    const isParceiro = tipoContrato === 'PARCEIRO';

    if (!proposta && !cliente && !contratoExistente && !ponto) {
      return '<div style="padding:16px;text-align:center;color:#94a3b8">Preview oficial disponivel via PDF.</div>';
    }

    const quantidadeTelasReal = quantidadeTelas > 0 ? String(quantidadeTelas) : '';
    let tituloCampanha = '';
    if (proposta) {
      if (proposta.titulo_campanha) tituloCampanha = proposta.titulo_campanha;
      else if (proposta.observacoes) {
        const m = proposta.observacoes.match(/\[Campanha:\s*(.+?)\]/);
        tituloCampanha = m?.[1] || '';
      }
    }

    const dataInicio = contratoExistente?.data_inicio
      ? new Date(contratoExistente.data_inicio).toLocaleDateString('pt-BR')
      : new Date().toLocaleDateString('pt-BR');
    const dataFim = contratoExistente?.data_fim
      ? new Date(contratoExistente.data_fim).toLocaleDateString('pt-BR')
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR');

    let dados: Record<string, string>;

    if (isParceiro && ponto) {
      // ORIGEM C: PONTO PARCEIRO — usa dados do ponto como fonte primária
      const enderecoPonto = [
        [ponto.logradouro || ponto.endereco, ponto.numero].filter(Boolean).join(', '),
        ponto.bairro,
        [ponto.cidade, ponto.estado].filter(Boolean).join('/'),
      ].filter(Boolean).join(' - ');

      dados = {
        RAZAO_SOCIAL: ponto.nome || ponto.razao_social || ponto.nome_fantasia || '',
        NOME_FANTASIA: ponto.nome_fantasia || ponto.nome || '',
        CNPJ: ponto.cnpj || '',
        CPF_CNPJ: ponto.cnpj || '',
        RESPONSAVEL: ponto.responsavel_nome || ponto.representante_legal || '',
        REPRESENTANTE_LEGAL: ponto.responsavel_nome || ponto.representante_legal || '',
        LOGRADOURO: ponto.logradouro || ponto.endereco || '',
        NUMERO: ponto.numero || '',
        BAIRRO: ponto.bairro || '',
        CIDADE: ponto.cidade || '',
        ESTADO: ponto.estado || '',
        UF: ponto.estado || '',
        CEP: ponto.cep || '',
        TELEFONE: ponto.responsavel_telefone || ponto.telefone || '',
        WHATSAPP: ponto.whatsapp || ponto.responsavel_telefone || '',
        EMAIL: ponto.responsavel_email || ponto.email || '',
        INSTAGRAM: ponto.instagram || '',
        ENDERECO_UNIDADE: enderecoPonto,
        NOME_UNIDADE: ponto.nome_fantasia || ponto.nome || '',
        HORARIO_INICIO: ponto.horario_abertura || '',
        HORARIO_FIM: ponto.horario_fechamento || '',
        DIAS_SEMANA: ponto.dias_funcionamento || '',
        FORO_COMARCA: ponto.cidade || '',
        LOCAL_ASSINATURA: ponto.cidade || '',
        DATA_INICIO: dataInicio,
        DATA_FIM: dataFim,
        DATA_ASSINATURA: new Date().toLocaleDateString('pt-BR'),
        QUANTIDADE_TELAS: quantidadeTelasReal,
        ASSINATURA_SOBRE_MIDIA: '',
        ASSINATURA_PARCEIRO: '',
      };
    } else {
      // ORIGEM A/B: ANUNCIANTE — usa dados de empresa/contato/proposta
      const emp = cliente?.empresas?.[0];
      const ct = emp?.contatos?.[0];
      const enderecoUnidade = (emp?.logradouro && emp?.numero)
        ? `${emp.logradouro}, ${emp.numero}`
        : (emp?.logradouro || '');

      dados = {
        RAZAO_SOCIAL: emp?.razao_social || emp?.nome_fantasia || '',
        NOME_FANTASIA: emp?.nome_fantasia || emp?.razao_social || '',
        CNPJ: emp?.cnpj || '',
        CPF_CNPJ: emp?.cnpj || '',
        CIDADE: emp?.cidade || '',
        ESTADO: emp?.estado || '',
        UF: emp?.estado || '',
        CEP: emp?.cep || '',
        LOGRADOURO: emp?.logradouro || '',
        NUMERO: emp?.numero || '',
        BAIRRO: emp?.bairro || '',
        RESPONSAVEL: ct?.nome || emp?.representante_legal || '',
        REPRESENTANTE_LEGAL: ct?.nome || emp?.representante_legal || '',
        TELEFONE: emp?.telefone || ct?.telefone || '',
        EMAIL: emp?.email || ct?.email || '',
        INSTAGRAM: emp?.instagram || '',
        WEBSITE: emp?.website || emp?.site || '',
        TITULO_CAMPANHA: tituloCampanha,
        QUANTIDADE_TELAS: quantidadeTelasReal,
        TOTAL_SISTEMAS: quantidadeTelasReal,
        VALOR_MENSAL: new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(Number(proposta?.valor_final || contratoExistente?.valor_mensal || 0)),
        FORMA_PAGAMENTO: proposta?.forma_pagamento || contratoExistente?.forma_pagamento || '',
        DATA_INICIO: dataInicio,
        DATA_FIM: dataFim,
        DATA_INICIO_VEICULACAO: dataInicio,
        DATA_FIM_VEICULACAO: dataFim,
        DATA_ASSINATURA: new Date().toLocaleDateString('pt-BR'),
        LOCAL_ASSINATURA: emp?.cidade || '',
        ENDERECO_UNIDADE: enderecoUnidade,
        NOME_UNIDADE: emp?.nome_fantasia || emp?.razao_social || '',
        NUMERO_PARCELAS: proposta?.numero_parcelas ? String(proposta.numero_parcelas) : '',
        ASSINATURA_SOBRE_MIDIA: '',
        ASSINATURA_CONTRATANTE: '',
      };
    }

    let html = selectedTemplate.conteudo_html;
    Object.entries(dados).forEach(([key, value]) => {
      html = html.replace(new RegExp(`{{${key}}}`, 'g'), value);
    });
    // Substituir qualquer placeholder residual por vazio (campos opcionais)
    html = html.replace(/\{\{[A-Z_0-9]+\}\}/g, '');
    return html;
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
    const result = await contratoService.getContractDownloadUrl(contratoExistente.id);
    if (result.success && result.downloadUrl) {
      try {
        await contratoDocumentoService.baixarDocumento(contratoExistente.pdf_object_key || '', result.fileName || `Contrato_${contratoExistente.numero_contrato}.pdf`);
        if (user && contratoExistente.tipo_contrato) {
          await contratoDocumentoService.registrarDownloadDocumento(contratoExistente.id, contratoExistente.tipo_contrato, user.id, contratoExistente.pdf_object_key || '');
        }
        toast({ title: 'Download iniciado' });
      } catch (err: any) {
        toast({ title: 'Erro no Download', description: err?.message, variant: 'destructive' });
      }
    } else {
      toast({ title: 'Erro no Download', description: result.error, variant: 'destructive' });
    }
  };

  const handleViewPDF = async () => {
    if (!contratoExistente?.id) return;
    const result = await contratoService.getContractDownloadUrl(contratoExistente.id);
    if (result.success && result.downloadUrl) {
      window.open(result.downloadUrl, '_blank', 'noopener,noreferrer');
    } else {
      toast({ title: 'Erro na Visualizacao', description: result.error, variant: 'destructive' });
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
                  onClick={() => { const tpl = templates.find(t => t.tipo_contrato === 'ANUNCIANTE'); if (tpl) handleSelectModel(tpl); }}
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
                  onClick={() => { const tpl = templates.find(t => t.tipo_contrato === 'PARCEIRO'); if (tpl) handleSelectModel(tpl); }}
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
                Texto juridico preenchido automaticamente com dados reais do banco.
                {hasPDFGenerated && contratoExistente?.pdf_object_key && (
                  <span className="ml-2 text-emerald-400">Documento PDF ja gerado no storage</span>
                )}
              </CardDescription>
            </div>
            <Badge className="bg-primary/20 text-primary border-primary/30">Status: {docStatus}</Badge>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div
              className="p-6 rounded-xl bg-slate-950/90 border border-white/10 text-slate-200 text-sm leading-relaxed max-h-[400px] overflow-y-auto shadow-inner"
              dangerouslySetInnerHTML={{ __html: renderFilledContractHTML() }}
            />
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
