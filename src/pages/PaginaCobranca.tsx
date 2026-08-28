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
    ? 'text-[#25D366] bg-[#25D366]/10 border-[#25D366]/30 shadow-[0_0_15px_rgba(37,211,102,0.2)]'
    : isCanceled
    ? 'text-[#F2F2F2] bg-white/5 border-white/10'
    : isOverdue 
    ? 'text-[#FFD400] bg-[#FFD400]/10 border-[#FFD400]/30 shadow-[0_0_15px_rgba(255,212,0,0.2)]' 
    : 'text-[#8A2EFF] bg-[#8A2EFF]/10 border-[#8A2EFF]/30 shadow-[0_0_15px_rgba(138,46,255,0.2)]';

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
    <div className="min-h-screen bg-[#22004A] text-[#F2F2F2] py-10 px-4 sm:px-6 lg:px-8 font-sans relative overflow-hidden">
      {/* Background Glow Effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-[#5D1BFF] rounded-full blur-[120px] opacity-20 pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-[#8A2EFF] rounded-full blur-[150px] opacity-10 pointer-events-none"></div>

      <div className="max-w-4xl mx-auto space-y-8 relative z-10">
        
        {/* =======================
            CABEÇALHO 
        ======================= */}
        <div className="text-center space-y-3 mb-10">
          <h1 className="text-3xl font-extrabold tracking-widest text-[#FFFFFF] uppercase drop-shadow-md">
            {data.empresa_nome || 'SOBRE MÍDIA'}
          </h1>
          <h2 className="text-lg font-medium text-[#F2F2F2]/80 uppercase tracking-wider">Sua cobrança</h2>
          
          <div className="mt-4 flex flex-col items-center gap-2">
            <span className="text-2xl font-bold text-[#FFFFFF]">{data.cliente_nome}</span>
            <span className="text-sm text-[#F2F2F2]/70 font-mono bg-[#1B003A]/60 px-4 py-1.5 rounded-md border border-[#5D1BFF]/30 backdrop-blur-sm">
              {data.codigo_operacional}
            </span>
          </div>
          
          <div className="mt-8 flex justify-center">
            <div className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-full border font-bold text-sm uppercase tracking-wider backdrop-blur-md transition-all duration-300 hover:scale-105 ${statusColor}`}>
              <StatusIcon className="w-5 h-5" />
              {statusText}
            </div>
          </div>
        </div>

        {/* =======================
            HERO FINANCEIRO 
        ======================= */}
        <div className="bg-[#1B003A]/60 backdrop-blur-xl border border-[#5D1BFF]/30 rounded-2xl p-8 sm:p-12 text-center shadow-2xl relative overflow-hidden group hover:border-[#8A2EFF]/50 transition-colors duration-500">
          <div className="absolute inset-0 bg-gradient-to-b from-[#5D1BFF]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          
          <h3 className="text-sm font-semibold uppercase tracking-widest text-[#F2F2F2]/70 mb-2">
            {isPaid ? 'Cobrança quitada' : 'Saldo em aberto'}
          </h3>
          
          <div className={`text-5xl sm:text-7xl font-extrabold tracking-tight mb-4 drop-shadow-lg ${isPaid ? 'text-[#25D366]' : 'text-[#FFFFFF]'}`}>
            {formatMoney(isPaid ? data.valor_pago : data.saldo)}
          </div>
          
          {!isPaid && !isCanceled && (
            <div className="flex flex-col items-center justify-center gap-2 mt-6">
              <div className="text-lg text-[#F2F2F2]/90 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#8A2EFF]" />
                Vencimento: <span className="font-semibold text-[#FFFFFF]">{formatDate(data.vencimento)}</span>
              </div>
              
              {isOverdue && diasAtraso > 0 && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#FFD400]/10 border border-[#FFD400]/20 text-[#FFD400] text-sm font-bold mt-2">
                  <AlertTriangle className="w-4 h-4" />
                  {diasAtraso} {diasAtraso === 1 ? 'dia' : 'dias'} em atraso
                </div>
              )}
            </div>
          )}
        </div>

        {/* =======================
            RESUMO FINANCEIRO (CARDS)
        ======================= */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-[#1B003A]/40 backdrop-blur-md border border-white/10 hover:border-[#5D1BFF]/40 transition-colors shadow-lg">
            <CardContent className="p-5 flex flex-col justify-center text-center h-full">
              <span className="text-xs font-semibold text-[#F2F2F2]/60 uppercase tracking-wider mb-2">Valor original</span>
              <span className="text-xl font-bold text-[#FFFFFF]">{formatMoney(data.valor_original)}</span>
            </CardContent>
          </Card>
          
          <Card className="bg-[#1B003A]/40 backdrop-blur-md border border-white/10 hover:border-[#25D366]/40 transition-colors shadow-lg">
            <CardContent className="p-5 flex flex-col justify-center text-center h-full">
              <span className="text-xs font-semibold text-[#F2F2F2]/60 uppercase tracking-wider mb-2">Valor pago</span>
              <span className="text-xl font-bold text-[#25D366] drop-shadow-[0_0_8px_rgba(37,211,102,0.3)]">{formatMoney(data.valor_pago)}</span>
            </CardContent>
          </Card>
          
          <Card className={`bg-[#1B003A]/60 backdrop-blur-md border transition-colors shadow-lg ${!isPaid && !isCanceled ? 'border-[#8A2EFF]/50 shadow-[0_0_20px_rgba(138,46,255,0.15)]' : 'border-white/10'}`}>
            <CardContent className="p-5 flex flex-col justify-center text-center h-full">
              <span className="text-xs font-semibold text-[#F2F2F2]/60 uppercase tracking-wider mb-2">Saldo em aberto</span>
              <span className={`text-xl font-bold ${isPaid ? 'text-[#F2F2F2]/50' : 'text-[#FFFFFF]'}`}>{formatMoney(data.saldo)}</span>
            </CardContent>
          </Card>
          
          <Card className={`bg-[#1B003A]/40 backdrop-blur-md border transition-colors shadow-lg ${isOverdue ? 'border-[#FFD400]/40 shadow-[0_0_15px_rgba(255,212,0,0.1)]' : 'border-white/10 hover:border-[#5D1BFF]/40'}`}>
            <CardContent className="p-5 flex flex-col justify-center text-center h-full">
              <span className="text-xs font-semibold text-[#F2F2F2]/60 uppercase tracking-wider mb-2">Vencimento</span>
              <span className={`text-xl font-bold ${isOverdue ? 'text-[#FFD400]' : 'text-[#FFFFFF]'}`}>{formatDate(data.vencimento)}</span>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-4">
          {/* COLUNA ESQUERDA - DADOS DA COBRANÇA */}
          <div className="lg:col-span-2 space-y-8">
            {/* =======================
                DADOS DA COBRANÇA
            ======================= */}
            <div className="bg-[#1B003A]/40 backdrop-blur-lg border border-white/10 rounded-2xl overflow-hidden shadow-xl">
              <div className="bg-white/5 border-b border-white/5 px-6 py-5">
                <h3 className="text-lg font-bold flex items-center gap-3 text-[#FFFFFF]">
                  <FileText className="w-5 h-5 text-[#8A2EFF]" />
                  Dados da Cobrança
                </h3>
              </div>
              <div className="p-0">
                <dl className="divide-y divide-white/5 text-sm">
                  {[
                    { label: 'Cliente', value: data.cliente_nome },
                    { label: 'Contrato', value: data.contrato_codigo || 'Sem contrato vinculado', icon: FileSignature },
                    { label: 'Tipo de contrato', value: data.contrato_tipo || '—' },
                    { label: 'Serviço faturado', value: data.servico_faturado || 'Serviço de mídia/publicidade contratado' },
                    { label: 'Parcela', value: data.numero_parcela ? `${data.numero_parcela} de ${data.total_parcelas || '1'}` : 'Única' },
                    { label: 'Documento', value: data.numero_documento || data.codigo_operacional },
                    { label: 'Competência', value: data.competencia ? format(new Date(data.competencia), 'MMMM / yyyy', { locale: ptBR }).toUpperCase() : '—', icon: Calendar },
                    { label: 'Vencimento', value: formatDate(data.vencimento) },
                    { label: 'Método Previsto', value: data.metodo || 'PIX', icon: CreditCard },
                    { label: 'Recorrência', value: data.recorrencia || '—' },
                    { label: 'Status', value: statusText }
                  ].map((item, idx) => (
                    <div key={idx} className="px-6 py-4 grid grid-cols-1 sm:grid-cols-3 gap-2 hover:bg-white/5 transition-colors">
                      <dt className="text-[#F2F2F2]/60 font-medium">{item.label}</dt>
                      <dd className="sm:col-span-2 font-medium text-[#FFFFFF] flex items-center gap-2">
                        {item.icon && <item.icon className="w-4 h-4 text-[#5D1BFF]" />}
                        {item.value}
                      </dd>
                    </div>
                  ))}
                  
                  {data.observacoes && (
                    <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-3 gap-2 bg-[#5D1BFF]/10 border-l-2 border-[#8A2EFF]">
                      <dt className="text-[#F2F2F2]/80 font-medium">Observações</dt>
                      <dd className="sm:col-span-2 text-[#FFFFFF] italic">{data.observacoes}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>

            {/* =======================
                HISTÓRICO DE PAGAMENTOS
            ======================= */}
            <div className="bg-[#1B003A]/40 backdrop-blur-lg border border-white/10 rounded-2xl overflow-hidden shadow-xl">
              <div className="bg-white/5 border-b border-white/5 px-6 py-5">
                <h3 className="text-lg font-bold flex items-center gap-3 text-[#FFFFFF]">
                  <Receipt className="w-5 h-5 text-[#8A2EFF]" />
                  Histórico de Pagamentos
                </h3>
              </div>
              <div className="p-6">
                {data.pagamentos && data.pagamentos.length > 0 ? (
                  <div className="space-y-6">
                    <div className="relative border-l border-white/10 ml-3 space-y-6">
                      {data.pagamentos.map((pag, index) => (
                        <div key={pag.id || index} className="relative pl-6 group">
                          <div className="absolute w-3 h-3 bg-[#25D366] rounded-full -left-[6px] top-1.5 shadow-[0_0_10px_rgba(37,211,102,0.8)]" />
                          <div className="bg-white/5 border border-white/10 rounded-xl p-5 hover:bg-white/10 transition-colors">
                            <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4 mb-2">
                              <div>
                                <span className="font-bold text-xl text-[#FFFFFF]">{formatMoney(pag.valor_pago)}</span>
                                <div className="text-sm text-[#F2F2F2]/60 mt-1 flex items-center gap-1.5">
                                  <Clock className="w-3.5 h-3.5" />
                                  {format(new Date(pag.data_liquidacao), "dd 'de' MMM, yyyy 'às' HH:mm", { locale: ptBR })}
                                </div>
                              </div>
                              <span className="self-start px-3 py-1 rounded-md bg-white/10 text-xs font-bold text-[#F2F2F2] uppercase tracking-wider border border-white/10">
                                {pag.meio_pagamento || 'NÃO DEFINIDO'}
                              </span>
                            </div>
                            {pag.transacao_id_externo && (
                              <div className="mt-4 pt-3 border-t border-white/5 text-xs text-[#F2F2F2]/50 font-mono">
                                ID Transação: {pag.transacao_id_externo}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-center bg-white/5 rounded-xl border border-dashed border-white/10">
                    <Receipt className="w-12 h-12 text-[#F2F2F2]/20 mb-4" />
                    <p className="text-[#F2F2F2]/60 font-medium">Nenhum pagamento registrado para esta cobrança.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* COLUNA DIREITA - AÇÕES E PAGAMENTO */}
          <div className="space-y-8">
            
            {/* =======================
                PAGAMENTO ONLINE
            ======================= */}
            {!isPaid && !isCanceled && (
              <div className="bg-[#1B003A]/60 backdrop-blur-xl border border-[#5D1BFF]/40 rounded-2xl overflow-hidden shadow-2xl relative group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#5D1BFF] via-[#8A2EFF] to-[#B04DFF]" />
                <div className="bg-white/5 border-b border-white/5 px-6 py-5">
                  <h3 className="text-lg font-bold flex items-center gap-3 text-[#FFFFFF]">
                    <CreditCard className="w-5 h-5 text-[#8A2EFF]" />
                    Pagamento online
                  </h3>
                </div>
                <div className="p-6">
                  <div className="bg-white/5 border border-white/10 rounded-xl p-5 flex flex-col items-center text-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                      <AlertCircle className="w-6 h-6 text-[#F2F2F2]/80" />
                    </div>
                    <div className="space-y-2">
                      <p className="font-bold text-[#FFFFFF] text-sm">Integração Bancária em Configuração</p>
                      <p className="text-xs text-[#F2F2F2]/70 leading-relaxed">
                        O pagamento automático (PIX / Boleto bancário via Banco Inter) estará disponível nesta página logo após a ativação oficial do gateway financeiro.
                      </p>
                    </div>
                    <div className="text-xs font-medium text-[#F2F2F2] bg-[#5D1BFF]/20 border border-[#5D1BFF]/30 px-4 py-3 rounded-lg w-full mt-2">
                      Por favor, efetue o pagamento diretamente na conta informada pela equipe e envie o comprovante pelo atendimento.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* =======================
                ATENDIMENTO
            ======================= */}
            <div className="bg-[#1B003A]/40 backdrop-blur-lg border border-white/10 rounded-2xl overflow-hidden shadow-xl">
              <div className="bg-white/5 border-b border-white/5 px-6 py-5">
                <h3 className="text-lg font-bold flex items-center gap-3 text-[#FFFFFF]">
                  <MessageCircle className="w-5 h-5 text-[#8A2EFF]" />
                  Precisa de ajuda?
                </h3>
              </div>
              <div className="p-6">
                <div className="space-y-5">
                  <p className="text-sm text-[#F2F2F2]/70 leading-relaxed">
                    Ficou com alguma dúvida sobre esta cobrança ou precisa renegociar? Entre em contato com a nossa equipe financeira oficial.
                  </p>
                  <div className="bg-white/5 border border-white/10 p-5 rounded-xl transition-colors hover:bg-white/10">
                    <div className="text-sm font-bold text-[#FFFFFF] mb-1">SOBRE MÍDIA FINANCEIRO</div>
                    <div className="text-xs font-medium text-[#F2F2F2]/60">
                      Atendimento via WhatsApp / E-mail
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
