import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FileText, Calendar, DollarSign, CreditCard, AlertTriangle, CheckCircle2, XCircle, Clock, Eye, Download, PenLine } from 'lucide-react';
import { customerPortalDataService } from '../../services/customerPortalData.service';
import { contratoDocumentoService } from '../../services/contratoDocumento.service';
import { ContratoDetalhePortal } from '../../types/portal.types';
import { formatCurrency } from '@/utils/formatters';

export default function ContratoVigentePage() {
  const { usuario } = useAuth();
  const { toast } = useToast();
  const [contrato, setContrato] = useState<ContratoDetalhePortal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSigning, setIsSigning] = useState(false);

  useEffect(() => {
    if (usuario?.cliente_id) {
      fetchContrato(usuario.cliente_id);
    }
  }, [usuario?.cliente_id]);

  const fetchContrato = async (clienteId: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await customerPortalDataService.getContratoVigente(clienteId);
      setContrato(data);
    } catch (err: any) {
      console.error('Erro ao buscar contrato:', err);
      setError('Não foi possível carregar o contrato.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ASSINADO':
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30"><CheckCircle2 className="h-3 w-3 mr-1" /> Assinado</Badge>;
      case 'GERADO':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30"><FileText className="h-3 w-3 mr-1" /> Gerado</Badge>;
      case 'ENVIADO':
        return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30"><Clock className="h-3 w-3 mr-1" /> Enviado</Badge>;
      case 'CANCELADO':
        return <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30"><XCircle className="h-3 w-3 mr-1" /> Cancelado</Badge>;
      default:
        return <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">{status}</Badge>;
    }
  };

  const getWorkflowBadge = (status?: string) => {
    switch (status) {
      case 'VIGENTE':
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30"><CheckCircle2 className="h-3 w-3 mr-1" /> Vigente</Badge>;
      case 'AGUARDANDO_ASSINATURA':
        return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30"><Clock className="h-3 w-3 mr-1" /> Aguardando Assinatura</Badge>;
      case 'EXPIRADO':
        return <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30"><AlertTriangle className="h-3 w-3 mr-1" /> Expirado</Badge>;
      default:
        return status ? <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">{status}</Badge> : null;
    }
  };

  const handleVisualizar = async () => {
    if (!contrato?.pdf_object_key) return;
    try {
      await contratoDocumentoService.visualizarDocumento(contrato.pdf_object_key);
    } catch (err: any) {
      toast({ title: 'Erro', description: err?.message || 'Não foi possível abrir o documento.', variant: 'destructive' });
    }
  };

  const handleBaixar = async () => {
    if (!contrato?.pdf_object_key) return;
    try {
      await contratoDocumentoService.baixarDocumento(contrato.pdf_object_key, `Contrato_${contrato.numero_contrato}.pdf`);
      if (usuario?.id) {
        await contratoDocumentoService.registrarDownloadDocumento(contrato.id, '', usuario.id, contrato.pdf_object_key);
      }
      toast({ title: 'Download iniciado', description: 'Documento do contrato baixado.' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err?.message || 'Não foi possível baixar o documento.', variant: 'destructive' });
    }
  };

  const handleVisualizarAssinado = async () => {
    if (!contrato?.pdf_assinado_key) return;
    try {
      await contratoDocumentoService.visualizarDocumento(contrato.pdf_assinado_key);
    } catch (err: any) {
      toast({ title: 'Erro', description: err?.message || 'Não foi possível abrir o documento assinado.', variant: 'destructive' });
    }
  };

  const handleAssinar = async () => {
    if (!contrato?.assinatura_envelope_id || !usuario?.id) return;
    setIsSigning(true);
    try {
      const { digitalSignatureService } = await import('../../services/digitalSignature.service');
      const envelope = await digitalSignatureService.findByEnvelopeId(contrato.assinatura_envelope_id);
      const resultado = await digitalSignatureService.signDocument(
        contrato.assinatura_envelope_id,
        usuario.id,
        {
          nome: envelope?.signatario_nome || usuario.nome || '',
          email: envelope?.signatario_email || usuario.email || '',
          cpfCnpj: envelope?.signatario_cpf_cnpj || '',
        }
      );
      if (resultado.success) {
        toast({ title: 'Documento Assinado!', description: 'Sua assinatura eletrônica foi registrada.' });
        if (usuario.cliente_id) fetchContrato(usuario.cliente_id);
      } else {
        toast({ title: 'Erro na assinatura', description: resultado.error || 'Falha ao assinar.', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Erro na assinatura', description: err?.message || 'Falha ao assinar.', variant: 'destructive' });
    } finally {
      setIsSigning(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
        <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" /> Contrato Vigente
          </h2>
          <p className="text-slate-400 text-sm mt-1">Detalhes do seu contrato ativo</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
        <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" /> Contrato Vigente
          </h2>
        </div>
        <div className="text-center py-12 text-slate-400 bg-slate-900/50 rounded-xl border border-white/10">
          {error}
        </div>
      </div>
    );
  }

  if (!contrato) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
        <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" /> Contrato Vigente
          </h2>
          <p className="text-slate-400 text-sm mt-1">Detalhes do seu contrato ativo</p>
        </div>
        <div className="text-center py-12 text-slate-400 bg-slate-900/50 rounded-xl border border-white/10">
          <FileText className="h-12 w-12 mx-auto text-slate-600 mb-4" />
          <p className="text-lg font-medium">Nenhum contrato vigente encontrado</p>
          <p className="text-sm mt-2">Seu contrato pode estar em processo de assinatura ou não foi formalizado ainda.</p>
        </div>
      </div>
    );
  }

  const isVigente = contrato.vigente;
  const diasRestantes = contrato.dias_restantes;

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
      {/* Header */}
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" /> Contrato Vigente
            </h2>
            <p className="text-slate-400 text-sm mt-1">Número: <strong className="text-white">{contrato.numero_contrato}</strong></p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {getStatusBadge(contrato.status_documento)}
            {contrato.status_workflow && getWorkflowBadge(contrato.status_workflow)}
            {!isVigente && (
              <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> {diasRestantes > 0 ? `Expira em ${diasRestantes} dias` : 'Expirado'}
              </Badge>
            )}
            {isVigente && (
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Vigente
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Informações Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border border-white/10 bg-slate-900/80">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
              <Calendar className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">Início</span>
              <strong className="text-lg font-bold text-white">{new Date(contrato.data_inicio).toLocaleDateString('pt-BR')}</strong>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Calendar className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">Fim</span>
              <strong className="text-lg font-bold text-white">{new Date(contrato.data_fim).toLocaleDateString('pt-BR')}</strong>
              {isVigente && (
                <span className="text-xs text-emerald-400 ml-2">{diasRestantes} dias restantes</span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <DollarSign className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">Valor Mensal</span>
              <strong className="text-lg font-bold text-white">{formatCurrency(contrato.valor_mensal)}</strong>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <CreditCard className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">Pagamento</span>
              <strong className="text-lg font-bold text-white">{contrato.forma_pagamento}</strong>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Limites do Contrato */}
      {(contrato.max_pontos || contrato.max_telas) && (
        <Card className="border border-white/10 bg-slate-900/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              Limites Contratuais
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {contrato.max_pontos !== null && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Pontos Permitidos</span>
                  <span className="font-bold text-white">{contrato.max_pontos}</span>
                </div>
                <div className="h-2 bg-slate-950 rounded-full overflow-hidden border border-white/10">
                  <div 
                    className="bg-gradient-to-r from-primary to-purple-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (contrato.max_pontos > 0 ? 50 : 0))}%` }}
                  />
                </div>
              </div>
            )}
            {contrato.max_telas !== null && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Telas Permitidas</span>
                  <span className="font-bold text-white">{contrato.max_telas}</span>
                </div>
                <div className="h-2 bg-slate-950 rounded-full overflow-hidden border border-white/10">
                  <div 
                    className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (contrato.max_telas > 0 ? 50 : 0))}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Itens do Contrato */}
      <Card className="border border-white/10 bg-slate-900/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Itens do Contrato
          </CardTitle>
          <CardDescription className="text-slate-400 text-xs">Serviços e quantidades contratadas</CardDescription>
        </CardHeader>
        <CardContent>
          {contrato.itens && contrato.itens.length > 0 ? (
            <div className="space-y-3">
              {contrato.itens.map((item, index) => (
                <div key={index} className="p-4 rounded-xl border border-white/10 bg-slate-950/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex-1">
                    <p className="font-bold text-white">{item.servico_nome}</p>
                    <p className="text-xs text-slate-400">Quantidade: {item.quantidade} × {formatCurrency(item.valor_unitario)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg text-emerald-400">{formatCurrency(item.valor_total)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center py-6 text-slate-400">Nenhum item detalhado no contrato.</p>
          )}
        </CardContent>
      </Card>

      {/* Documento do Contrato */}
      <Card className="border border-white/10 bg-slate-900/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Documento do Contrato
          </CardTitle>
          <CardDescription className="text-slate-400 text-xs">Acesse, baixe e assine o documento oficial</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!contrato.pdf_object_key && !contrato.pdf_assinado_key ? (
            <p className="text-center py-6 text-slate-400">O documento ainda não foi gerado. Aguarde a formalização do contrato.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                {contrato.pdf_object_key && (
                  <>
                    <Button onClick={handleVisualizar} variant="outline" className="border-white/10 bg-slate-950/50 text-white hover:bg-slate-800">
                      <Eye className="h-4 w-4 mr-2" /> Visualizar Contrato
                    </Button>
                    <Button onClick={handleBaixar} variant="outline" className="border-white/10 bg-slate-950/50 text-white hover:bg-slate-800">
                      <Download className="h-4 w-4 mr-2" /> Baixar Contrato
                    </Button>
                  </>
                )}
                {contrato.pdf_assinado_key && (
                  <>
                    <Button onClick={handleVisualizarAssinado} variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20">
                      <Eye className="h-4 w-4 mr-2" /> Ver Documento Assinado
                    </Button>
                    <Button
                      onClick={async () => {
                        try {
                          await contratoDocumentoService.baixarDocumento(contrato.pdf_assinado_key!, `Contrato_Assinado_${contrato.numero_contrato}.pdf`);
                          if (usuario?.id) {
                            await contratoDocumentoService.registrarDownloadDocumento(contrato.id, contrato.tipo_contrato || '', usuario.id, contrato.pdf_assinado_key!);
                          }
                          toast({ title: 'Download iniciado', description: 'Documento assinado baixado.' });
                        } catch (err: any) {
                          toast({ title: 'Erro', description: err?.message || 'Não foi possível baixar o documento assinado.', variant: 'destructive' });
                        }
                      }}
                      variant="outline"
                      className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                    >
                      <Download className="h-4 w-4 mr-2" /> Baixar PDF Assinado
                    </Button>
                  </>
                )}
              </div>
              {contrato.status_documento === 'ENVIADO' && contrato.assinatura_envelope_id && (
                <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10">
                  <p className="text-sm text-amber-300 font-semibold mb-2">Este contrato aguarda a sua assinatura eletrônica.</p>
                  <Button onClick={handleAssinar} disabled={isSigning} className="bg-gradient-to-r from-primary to-purple-500 text-white">
                    {isSigning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <PenLine className="h-4 w-4 mr-2" />}
                    Assinar Digitalmente
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Vigência */}
      <Card className="border border-white/10 bg-slate-900/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-400" />
            Status de Vigência
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            <div className="p-4 rounded-xl bg-slate-950/50 border border-white/10">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Início da Vigência</p>
              <p className="font-bold text-white">{new Date(contrato.data_inicio).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-950/50 border border-white/10">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Fim da Vigência</p>
              <p className="font-bold text-white">{new Date(contrato.data_fim).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
            </div>
            <div className={`p-4 rounded-xl ${isVigente ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-rose-500/10 border-rose-500/30'}`}>
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Status Atual</p>
              <p className={`font-bold ${isVigente ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isVigente ? `VIGENTE (${diasRestantes} dias)` : 'EXPIRADO'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}