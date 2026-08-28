import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, AlertCircle, Clock, FileText, Calendar, CreditCard, Receipt, FileSignature, AlertTriangle, MessageCircle, ExternalLink } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PagamentoPublico {
  id: string;
  valor_pago: number;
  data_liquidacao: string;
  meio_pagamento: string;
  transacao_id_externo: string;
}

interface PublicBillingData {
  id: string;
  numero_documento: string;
  codigo_operacional: string;
  public_identifier: string;
  competencia: string;
  vencimento: string;
  valor_original: number;
  valor_pago: number;
  saldo: number;
  status: string;
  numero_parcela: number | null;
  total_parcelas: number | null;
  metodo: string;
  recorrencia: string;
  observacoes: string;
  cliente_nome: string;
  cliente_documento: string;
  empresa_nome: string;
  empresa_documento: string;
  contrato_codigo: string;
  contrato_tipo: string;
  servico_faturado: string;
  pagamentos: PagamentoPublico[];
}

export default function PaginaCobranca() {
  const { codigo, identificador } = useParams<{ codigo: string; identificador: string }>();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PublicBillingData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBilling() {
      if (!codigo || !identificador) {
        setError('Link de cobrança inválido.');
        setLoading(false);
        return;
      }

      try {
        const { data: result, error: rpcError } = await supabase.rpc('rpc_get_public_billing', {
          p_codigo: codigo,
          p_identifier: identificador,
        });

        if (rpcError) {
          console.error('Error fetching billing:', rpcError);
          setError('Cobrança não encontrada ou acesso negado.');
        } else {
          setData(result as unknown as PublicBillingData);
        }
      } catch (err) {
        console.error('Unexpected error:', err);
        setError('Ocorreu um erro ao carregar a cobrança.');
      } finally {
        setLoading(false);
      }
    }

    fetchBilling();
  }, [codigo, identificador]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full border-red-200 shadow-lg">
          <CardContent className="pt-6 flex flex-col items-center text-center space-y-4">
            <AlertCircle className="w-16 h-16 text-red-500" />
            <h2 className="text-2xl font-bold text-gray-900">Acesso Negado</h2>
            <p className="text-gray-600 font-medium">404 - {error}</p>
            <p className="text-sm text-gray-500">Por favor, verifique se a URL está correta ou entre em contato com o suporte caso acredite ser um erro.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Derived values
  const isPaid = data.status === 'PAGO' || data.saldo <= 0;
  const isCanceled = data.status === 'CANCELADO' || data.status === 'CANCELADA';
  const dataVenc = new Date(data.vencimento);
  const dataHoje = new Date();
  const isOverdue = !isPaid && !isCanceled && (data.status === 'VENCIDO' || dataVenc < dataHoje);
  
  let diasAtraso = 0;
  if (isOverdue) {
    diasAtraso = differenceInDays(dataHoje, dataVenc);
  }

  const statusColor = isPaid 
    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
    : isCanceled
    ? 'text-gray-700 bg-gray-50 border-gray-200'
    : isOverdue 
    ? 'text-red-700 bg-red-50 border-red-200' 
    : 'text-blue-700 bg-blue-50 border-blue-200';

  const StatusIcon = isPaid ? CheckCircle2 : isCanceled ? AlertCircle : isOverdue ? AlertTriangle : Clock;
  
  const formatMoney = (val: number | null | undefined) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
  };
  
  const formatDate = (val: string | null | undefined) => {
    if (!val) return '—';
    return format(new Date(val), 'dd/MM/yyyy');
  };

  const getStatusText = () => {
    if (isCanceled) return 'CANCELADA';
    if (isPaid) return 'PAGA';
    if (isOverdue) return 'ATRASADA';
    if (data.status === 'PARCIAL' || (data.valor_pago > 0 && data.saldo > 0)) return 'PAGA PARCIALMENTE';
    return 'EM ABERTO';
  };

  const statusText = getStatusText();

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* =======================
            CABEÇALHO 
        ======================= */}
        <div className="text-center space-y-2 mb-10">
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 uppercase">
            {data.empresa_nome || 'SOBRE MÍDIA'}
          </h1>
          <h2 className="text-xl font-medium text-gray-700">Cobrança</h2>
          <div className="mt-4 flex flex-col items-center gap-1">
            <span className="text-lg font-semibold text-primary">{data.cliente_nome}</span>
            <span className="text-md text-gray-600 font-mono bg-gray-100 px-3 py-1 rounded-md border border-gray-200">
              {data.codigo_operacional}
            </span>
            <span className="text-sm text-gray-500 font-mono mt-1">
              Ref: {data.public_identifier}
            </span>
          </div>
          
          <div className="mt-6 flex justify-center">
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border font-bold text-sm uppercase tracking-wider shadow-sm ${statusColor}`}>
              <StatusIcon className="w-5 h-5" />
              {statusText}
            </div>
          </div>
        </div>

        {/* =======================
            RESUMO FINANCEIRO 
        ======================= */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border shadow-sm">
            <CardContent className="p-4 flex flex-col">
              <span className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-1">Valor original</span>
              <span className="text-2xl font-bold text-gray-900">{formatMoney(data.valor_original)}</span>
            </CardContent>
          </Card>
          <Card className="border shadow-sm">
            <CardContent className="p-4 flex flex-col">
              <span className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-1">Valor pago</span>
              <span className="text-2xl font-bold text-emerald-600">{formatMoney(data.valor_pago)}</span>
            </CardContent>
          </Card>
          <Card className={`border shadow-sm ${!isPaid && !isCanceled ? 'ring-2 ring-primary ring-offset-2' : ''}`}>
            <CardContent className="p-4 flex flex-col">
              <span className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-1">Saldo em aberto</span>
              <span className="text-2xl font-bold text-primary">{formatMoney(data.saldo)}</span>
            </CardContent>
          </Card>
          <Card className={`border shadow-sm ${isOverdue ? 'bg-red-50 border-red-200' : ''}`}>
            <CardContent className="p-4 flex flex-col">
              <span className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-1">Vencimento</span>
              <span className={`text-2xl font-bold ${isOverdue ? 'text-red-700' : 'text-gray-900'}`}>{formatDate(data.vencimento)}</span>
              {isOverdue && diasAtraso > 0 && (
                <span className="text-xs font-semibold text-red-600 mt-1">{diasAtraso} {diasAtraso === 1 ? 'dia' : 'dias'} de atraso</span>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* COLUNA ESQUERDA - DADOS DA COBRANÇA */}
          <div className="lg:col-span-2 space-y-8">
            {/* =======================
                DADOS DA COBRANÇA
            ======================= */}
            <Card className="shadow-md border-gray-200 overflow-hidden">
              <CardHeader className="bg-gray-50 border-b border-gray-100 pb-4">
                <CardTitle className="text-lg flex items-center gap-2 text-gray-800">
                  <FileText className="w-5 h-5 text-primary" />
                  Dados da Cobrança
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <dl className="divide-y divide-gray-100 text-sm">
                  <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4 hover:bg-gray-50 transition-colors">
                    <dt className="text-gray-500 font-medium">Cliente</dt>
                    <dd className="sm:col-span-2 font-semibold text-gray-900">{data.cliente_nome}</dd>
                  </div>
                  <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4 hover:bg-gray-50 transition-colors">
                    <dt className="text-gray-500 font-medium">Contrato</dt>
                    <dd className="sm:col-span-2 font-medium text-gray-900 flex items-center gap-2">
                      <FileSignature className="w-4 h-4 text-gray-400" />
                      {data.contrato_codigo || 'Sem contrato vinculado'}
                    </dd>
                  </div>
                  <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4 hover:bg-gray-50 transition-colors">
                    <dt className="text-gray-500 font-medium">Tipo de contrato</dt>
                    <dd className="sm:col-span-2 text-gray-900">{data.contrato_tipo || '—'}</dd>
                  </div>
                  <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4 hover:bg-gray-50 transition-colors">
                    <dt className="text-gray-500 font-medium">Serviço faturado</dt>
                    <dd className="sm:col-span-2 text-gray-900">{data.servico_faturado || 'Serviço de mídia/publicidade contratado'}</dd>
                  </div>
                  <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4 hover:bg-gray-50 transition-colors">
                    <dt className="text-gray-500 font-medium">Parcela</dt>
                    <dd className="sm:col-span-2 text-gray-900">
                      {data.numero_parcela ? `${data.numero_parcela} de ${data.total_parcelas || '1'}` : 'Única'}
                    </dd>
                  </div>
                  <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4 hover:bg-gray-50 transition-colors">
                    <dt className="text-gray-500 font-medium">Documento</dt>
                    <dd className="sm:col-span-2 text-gray-900">{data.numero_documento || data.codigo_operacional}</dd>
                  </div>
                  <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4 hover:bg-gray-50 transition-colors">
                    <dt className="text-gray-500 font-medium">Competência</dt>
                    <dd className="sm:col-span-2 text-gray-900 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      {data.competencia ? format(new Date(data.competencia), 'MMMM / yyyy', { locale: ptBR }).toUpperCase() : '—'}
                    </dd>
                  </div>
                  <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4 hover:bg-gray-50 transition-colors">
                    <dt className="text-gray-500 font-medium">Método Previsto</dt>
                    <dd className="sm:col-span-2 text-gray-900 flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-gray-400" />
                      {data.metodo || 'PIX'}
                    </dd>
                  </div>
                  <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4 hover:bg-gray-50 transition-colors">
                    <dt className="text-gray-500 font-medium">Recorrência</dt>
                    <dd className="sm:col-span-2 text-gray-900">{data.recorrencia || '—'}</dd>
                  </div>
                  {data.observacoes && (
                    <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4 hover:bg-gray-50 transition-colors bg-amber-50/30">
                      <dt className="text-gray-500 font-medium">Observações</dt>
                      <dd className="sm:col-span-2 text-gray-900 italic">{data.observacoes}</dd>
                    </div>
                  )}
                </dl>
              </CardContent>
            </Card>

            {/* =======================
                HISTÓRICO DE PAGAMENTOS
            ======================= */}
            <Card className="shadow-md border-gray-200">
              <CardHeader className="bg-gray-50 border-b border-gray-100 pb-4">
                <CardTitle className="text-lg flex items-center gap-2 text-gray-800">
                  <Receipt className="w-5 h-5 text-primary" />
                  Pagamentos Registrados
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {data.pagamentos && data.pagamentos.length > 0 ? (
                  <div className="space-y-6">
                    <div className="relative border-l-2 border-gray-200 ml-3 space-y-6">
                      {data.pagamentos.map((pag, index) => (
                        <div key={pag.id || index} className="relative pl-6">
                          <div className="absolute w-3 h-3 bg-emerald-500 rounded-full -left-[7px] top-1.5 ring-4 ring-white" />
                          <div className="bg-white border rounded-lg p-4 shadow-sm hover:shadow transition-shadow">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <span className="font-bold text-lg text-gray-900">{formatMoney(pag.valor_pago)}</span>
                                <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {format(new Date(pag.data_liquidacao), "dd 'de' MMM, yyyy 'às' HH:mm", { locale: ptBR })}
                                </div>
                              </div>
                              <span className="px-2.5 py-1 rounded-md bg-gray-100 text-xs font-semibold text-gray-700 uppercase border">
                                {pag.meio_pagamento || 'NÃO DEFINIDO'}
                              </span>
                            </div>
                            {pag.transacao_id_externo && (
                              <div className="mt-3 pt-3 border-t text-xs text-gray-500 font-mono">
                                ID Transação: {pag.transacao_id_externo}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg border">
                      <div className="text-sm text-gray-600 font-medium">Total Pago Registrado:</div>
                      <div className="text-lg font-bold text-emerald-600">{formatMoney(data.valor_pago)}</div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center bg-gray-50 rounded-lg border border-dashed border-gray-300">
                    <Receipt className="w-10 h-10 text-gray-300 mb-3" />
                    <p className="text-gray-500 font-medium">Nenhum pagamento registrado para esta cobrança.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* COLUNA DIREITA - AÇÕES E PAGAMENTO */}
          <div className="space-y-8">
            
            {/* =======================
                PAGAMENTO ONLINE
            ======================= */}
            {!isPaid && !isCanceled && (
              <Card className="border-primary shadow-lg overflow-hidden relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-primary" />
                <CardHeader className="bg-primary/5 pb-4">
                  <CardTitle className="text-lg flex items-center gap-2 text-primary">
                    <CreditCard className="w-5 h-5" />
                    Pagar Online
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-lg p-5 flex flex-col items-center text-center gap-3">
                    <AlertCircle className="w-8 h-8 text-blue-600 mb-2 opacity-80" />
                    <p className="font-semibold text-sm">Integração Bancária em Configuração</p>
                    <p className="text-xs text-blue-700/80 leading-relaxed">
                      O pagamento automático (PIX / Boleto bancário via Banco Inter) estará disponível nesta página logo após a ativação oficial do gateway financeiro.
                    </p>
                    <p className="text-xs font-medium text-blue-800 bg-blue-100/50 px-3 py-2 rounded-md w-full mt-2">
                      Por favor, efetue o pagamento diretamente na conta informada pela equipe e envie o comprovante pelo atendimento.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* =======================
                ATENDIMENTO
            ======================= */}
            <Card className="shadow-md border-gray-200">
              <CardHeader className="bg-gray-50 border-b border-gray-100 pb-4">
                <CardTitle className="text-lg flex items-center gap-2 text-gray-800">
                  <MessageCircle className="w-5 h-5 text-gray-600" />
                  Atendimento
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Ficou com alguma dúvida sobre esta cobrança ou precisa renegociar? Entre em contato com a nossa equipe financeira oficial.
                  </p>
                  <div className="bg-gray-50 border p-4 rounded-lg">
                    <div className="text-sm font-semibold text-gray-900 mb-1">SOBRE MÍDIA FINANCEIRO</div>
                    <div className="text-sm text-gray-600 flex items-center gap-2">
                      Atendimento via WhatsApp / E-mail
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>
        </div>
      </div>
    </div>
  );
}
