import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { contratoService, ContratoTemplateRecord, ContratoCompleto } from '../services/contrato.service';
import { clienteService, ClienteCompleto } from '../services/cliente.service';
import { supabase } from '@/integrations/supabase/client';
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
  Send
} from 'lucide-react';

export default function ContratoSelectionPage() {
  const { propostaId } = useParams<{ propostaId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const [proposta, setProposta] = useState<any>(null);
  const [cliente, setCliente] = useState<ClienteCompleto | null>(null);
  const [templates, setTemplates] = useState<ContratoTemplateRecord[]>([]);
  const [contratoExistente, setContratoExistente] = useState<ContratoCompleto | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectingType, setSelectingType] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<ContratoTemplateRecord | null>(null);
  const [mode, setMode] = useState<'SELECTION' | 'PREVIEW'>('SELECTION');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const loadData = useCallback(async () => {
    if (!propostaId) return;
    setLoading(true);

    const { data: propData } = await supabase
      .from('propostas')
      .select(`*, cliente:clientes(*), representante:representantes(*, usuario:usuarios(nome, email))`)
      .eq('id', propostaId)
      .maybeSingle();

    if (propData) {
      setProposta(propData);
      const cliData = await clienteService.findById(propData.cliente_id);
      setCliente(cliData);
    }

    const tplList = await contratoService.fetchTemplates();
    setTemplates(tplList);

    const existingCtr = await contratoService.findByPropostaId(propostaId);
    if (existingCtr && existingCtr.tipo_contrato) {
      setContratoExistente(existingCtr);
      const matchedTpl = tplList.find(t => t.tipo_contrato === existingCtr.tipo_contrato);
      if (matchedTpl) {
        setSelectedTemplate(matchedTpl);
        setMode('PREVIEW');
      }
    }

    setLoading(false);
  }, [propostaId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelectModel = async (tpl: ContratoTemplateRecord) => {
    if (!propostaId || !user) return;
    setSelectingType(tpl.tipo_contrato);

    const result = await contratoService.selectContractModel({
      propostaId,
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
      toast({
        title: 'Modelo de Contrato Selecionado!',
        description: `Contrato de ${tpl.tipo_contrato} atrelado à proposta com sucesso.`,
      });
      loadData();
    } else {
      toast({
        title: 'Erro na seleção',
        description: result.error || 'Falha ao vincular modelo de contrato.',
        variant: 'destructive',
      });
    }
  };

  const renderFilledContractHTML = () => {
    if (!selectedTemplate || !proposta) return '';
    const emp = cliente?.empresas?.[0];
    const ct = emp?.contatos?.[0];

    let html = selectedTemplate.conteudo_html;
    html = html.replace(/\{\{RAZAO_SOCIAL\}\}/g, emp?.razao_social || emp?.nome_fantasia || 'EMPRESA CONTRATANTE');
    html = html.replace(/\{\{CNPJ\}\}/g, emp?.cnpj || '00.000.000/0001-00');
    html = html.replace(/\{\{CIDADE\}\}/g, emp?.cidade || 'São Paulo');
    html = html.replace(/\{\{ESTADO\}\}/g, emp?.estado || 'SP');
    html = html.replace(/\{\{REPRESENTANTE_LEGAL\}\}/g, ct?.nome || emp?.representante_legal || 'Representante Legal');
    html = html.replace(/\{\{TITULO_CAMPANHA\}\}/g, proposta.observacoes?.split('|')[0]?.replace('[Campanha: ', '') || 'Campanha de Mídia');
    html = html.replace(/\{\{QUANTIDADE_TELAS\}\}/g, '4');
    html = html.replace(/\{\{VALOR_MENSAL\}\}/g, new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(proposta.valor_final || 0));
    html = html.replace(/\{\{FORMA_PAGAMENTO\}\}/g, proposta.forma_pagamento || 'PIX');
    html = html.replace(/\{\{DATA_INICIO\}\}/g, new Date().toLocaleDateString('pt-BR'));
    html = html.replace(/\{\{DATA_FIM\}\}/g, new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR'));
    html = html.replace(/\{\{ENDERECO_UNIDADE\}\}/g, emp?.logradouro ? `${emp.logradouro}, ${emp.numero}` : 'Av. Paulista, 1000');
    html = html.replace(/\{\{NOME_UNIDADE\}\}/g, 'Unidade Matriz - Ponto Comercial');
    return html;
  };

  const handleGeneratePDF = async () => {
    if (!contratoExistente?.id || !user) {
      toast({ title: 'Erro', description: 'Registro de contrato não localizado.', variant: 'destructive' });
      return;
    }

    setIsGeneratingPdf(true);
    const htmlContent = renderFilledContractHTML();
    const result = await contratoService.generateContractPDF(contratoExistente.id, htmlContent, user.id);
    setIsGeneratingPdf(false);

    if (result.success) {
      toast({
        title: 'Contrato PDF Gerado com Sucesso!',
        description: 'Artefato definitivo armazenado no Cloudflare R2 Storage.',
      });
      loadData();
    } else {
      toast({
        title: 'Erro na geração',
        description: result.error || 'Falha ao salvar PDF no R2.',
        variant: 'destructive',
      });
    }
  };

  const handleCancelContract = async () => {
    if (!contratoExistente?.id || !user) return;
    const result = await contratoService.cancelContract(contratoExistente.id, 'Cancelado a pedido do representante comercial.', user.id);
    if (result.success) {
      toast({ title: 'Contrato Cancelado', description: 'Status do contrato alterado para CANCELADO.' });
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

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in pb-12">
      {/* Top Banner */}
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2.5 rounded-xl bg-primary/15 text-primary">
              <FileCheck className="h-6 w-6" />
            </div>
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">
              Módulo de Contratos
            </h2>
            <Badge className="bg-primary/20 text-primary border-primary/30 ml-2">
              FASE 7.4-B
            </Badge>
          </div>
          <p className="text-slate-300 text-xs">
            Seleção Manual do Modelo de Contrato ➔ Preenchimento Automático ➔ Geração no R2 Storage
          </p>
        </div>

        <Button variant="outline" onClick={() => navigate('/representantes/clientes')} className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs">
          <ArrowLeft className="h-4 w-4" />
          Voltar para Carteira
        </Button>
      </div>

      {/* DADOS RESUMIDOS DA PROPOSTA */}
      <Card className="border border-white/10 bg-slate-900/70 backdrop-blur-xl shadow-xl rounded-2xl">
        <CardHeader className="pb-3 border-b border-white/10">
          <CardTitle className="text-base font-bold text-white flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Proposta Aprovada: {proposta?.numero_proposta}
            </span>
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
              {proposta?.status}
            </Badge>
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
              <span className="text-slate-400 block">Representante Responsável:</span>
              <strong className="text-slate-200">{proposta?.representante?.usuario?.nome || 'Equipe Comercial'}</strong>
            </div>
            <div>
              <span className="text-slate-400 block">Validade:</span>
              <strong className="text-amber-400">{proposta?.validade_dias} Dias</strong>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* MODO 1: SELEÇÃO MANUAL DO CONTRATO */}
      {mode === 'SELECTION' && (
        <div className="space-y-4">
          <div className="text-center py-2">
            <h3 className="text-lg font-bold text-white">Escolha o Modelo de Contrato Comercial</h3>
            <p className="text-xs text-slate-400">A decisão pertence exclusivamente ao representante comercial responsável pelo atendimento.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl hover:border-primary/50 transition-all group relative overflow-hidden flex flex-col justify-between">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-3 rounded-2xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-bold text-white">Card 01: Contrato de Anunciante</CardTitle>
                    <Badge variant="outline" className="border-blue-500/30 text-blue-400 bg-blue-500/10 text-[10px] mt-1">
                      Modelo Comercial Padrão
                    </Badge>
                  </div>
                </div>
                <CardDescription className="text-slate-300 text-xs leading-relaxed pt-2">
                  Contrato utilizado para clientes que contratam veiculação de publicidade e campanhas na rede de telas da SOBRE MÍDIA.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-2 pb-6">
                <Button
                  onClick={() => {
                    const tpl = templates.find(t => t.tipo_contrato === 'ANUNCIANTE');
                    if (tpl) handleSelectModel(tpl);
                  }}
                  disabled={selectingType === 'ANUNCIANTE'}
                  className="w-full gradient-primary glow-primary font-bold rounded-xl h-11 shadow-lg gap-2"
                >
                  {selectingType === 'ANUNCIANTE' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  <span>Selecionar Contrato de Anunciante</span>
                </Button>
              </CardContent>
            </Card>

            <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl hover:border-emerald-500/50 transition-all group relative overflow-hidden flex flex-col justify-between">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <Handshake className="h-6 w-6" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-bold text-white">Card 02: Contrato de Parceria</CardTitle>
                    <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-[10px] mt-1">
                      Cessão de Espaço Físico
                    </Badge>
                  </div>
                </div>
                <CardDescription className="text-slate-300 text-xs leading-relaxed pt-2">
                  Contrato utilizado para estabelecimentos parceiros que cedem espaço físico para instalação dos pontos de exibição da SOBRE MÍDIA.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-2 pb-6">
                <Button
                  onClick={() => {
                    const tpl = templates.find(t => t.tipo_contrato === 'PARCEIRO');
                    if (tpl) handleSelectModel(tpl);
                  }}
                  disabled={selectingType === 'PARCEIRO'}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl h-11 shadow-lg gap-2"
                >
                  {selectingType === 'PARCEIRO' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  <span>Selecionar Contrato de Parceria</span>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* MODO 2: PREVIEW DO CONTRATO PREENCHIDO */}
      {mode === 'PREVIEW' && selectedTemplate && (
        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl rounded-2xl">
          <CardHeader className="border-b border-white/10 pb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                <FileCheck className="h-5 w-5 text-emerald-400" />
                Pré-visualização do Contrato ({selectedTemplate.nome})
              </CardTitle>
              <CardDescription className="text-slate-400 text-xs">
                Texto jurídico imutável preenchido automaticamente com dados da proposta e do cliente.
              </CardDescription>
            </div>
            <Badge className="bg-primary/20 text-primary border-primary/30">
              Status Documento: {contratoExistente?.status_documento || 'RASCUNHO'}
            </Badge>
          </CardHeader>

          <CardContent className="pt-6 space-y-6">
            <div 
              className="p-6 rounded-xl bg-slate-950/90 border border-white/10 text-slate-200 text-sm leading-relaxed max-h-[400px] overflow-y-auto space-y-4 shadow-inner"
              dangerouslySetInnerHTML={{ __html: renderFilledContractHTML() }}
            />

            <div className="pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setMode('SELECTION')}
                  className="border-slate-700 text-slate-300 rounded-xl text-xs gap-1.5"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Voltar
                </Button>

                <Button 
                  variant="outline" 
                  onClick={() => setMode('SELECTION')}
                  className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 rounded-xl text-xs gap-1.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Trocar Contrato
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  onClick={handleCancelContract}
                  className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10 rounded-xl text-xs gap-1.5"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Cancelar
                </Button>

                <Button 
                  onClick={handleGeneratePDF}
                  disabled={isGeneratingPdf}
                  className="gradient-primary glow-primary font-bold rounded-xl text-xs px-6 h-10 gap-2 shadow-xl"
                >
                  {isGeneratingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  <span>Gerar PDF Definitivo</span>
                </Button>

                {contratoExistente && (
                  <Button 
                    onClick={() => navigate(`/representantes/pi/novo/${propostaId}`)}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs px-6 h-10 gap-2 shadow-xl hover:scale-105 transition-all"
                  >
                    <Send className="h-4 w-4" />
                    <span>Avançar para Pedido de Inserção (PI)</span>
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
