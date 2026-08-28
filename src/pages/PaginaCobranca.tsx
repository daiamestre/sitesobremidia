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
    <div className="min-h-screen bg-gradient-to-br from-[#1B003A] to-[#090014] text-[#F2F2F2] py-8 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* =======================
            CABEÇALHO 
        ======================= */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-xl font-extrabold tracking-widest text-[#FFFFFF] uppercase">
              {data.empresa_nome || 'SOBRE MÍDIA'}
            </h1>
            <h2 className="text-sm font-medium text-gray-400 mt-1">Sua cobrança</h2>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="block text-sm font-bold text-[#FFFFFF]">{data.cliente_nome}</span>
              <span className="block text-xs text-gray-400 font-mono mt-0.5">
                {data.codigo_operacional}
              </span>
            </div>
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border ${statusColor}`}>
              <StatusIcon className="w-3.5 h-3.5" />
              {statusText}
            </div>
          </div>
        </div>

        {/* =======================
            HERO E RESUMO (Inspirado no Card Nuvem Pago)
        ======================= */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card Esquerdo: Hero Saldo */}
          <div className="bg-[#14002E] border border-white/5 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-medium text-gray-400 mb-1">
                {isPaid ? 'Cobrança quitada' : 'Saldo em aberto'}
              </h3>
              <div className={`text-4xl sm:text-5xl font-extrabold tracking-tight mb-2 ${isPaid ? 'text-[#25D366]' : 'text-[#FFFFFF]'}`}>
                {formatMoney(isPaid ? data.valor_pago : data.saldo)}
              </div>
              {!isPaid && !isCanceled && (
                <div className="text-sm text-gray-400 flex items-center gap-2 mt-4">
                  <Calendar className="w-4 h-4" />
                  Vencimento em <span className="font-semibold text-[#FFFFFF]">{formatDate(data.vencimento)}</span>
                </div>
              )}
              {isOverdue && diasAtraso > 0 && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#FFD400]/10 border border-[#FFD400]/20 text-[#FFD400] text-xs font-bold mt-3">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {diasAtraso} {diasAtraso === 1 ? 'dia' : 'dias'} em atraso
                </div>
              )}
            </div>
          </div>

          {/* Card Direito: Valores Secundários */}
          <div className="bg-[#14002E] border border-white/5 rounded-3xl p-6 shadow-xl flex flex-col justify-center space-y-4">
            <div className="bg-white/5 rounded-2xl p-4 flex justify-between items-center">
              <div>
                <span className="block text-xs font-medium text-gray-400 mb-1">Valor original</span>
                <span className="block text-lg font-bold text-[#FFFFFF]">{formatMoney(data.valor_original)}</span>
              </div>
            </div>
            
            <div className="bg-white/5 rounded-2xl p-4 flex justify-between items-center">
              <div>
                <span className="block text-xs font-medium text-gray-400 mb-1">Valor pago</span>
                <span className="block text-lg font-bold text-[#25D366]">{formatMoney(data.valor_pago)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-4">
          
          {/* =======================
              DADOS DA COBRANÇA
          ======================= */}
          <div className="lg:col-span-7 bg-[#14002E] border border-white/5 rounded-3xl overflow-hidden shadow-xl">
            <div className="px-6 py-5 border-b border-white/5">
              <h3 className="text-base font-bold text-[#FFFFFF]">
                Dados da Cobrança
              </h3>
            </div>
            <div className="p-0">
              <dl className="divide-y divide-white/5 text-sm">
                {[
                  { label: 'Cliente', value: data.cliente_nome },
                  { label: 'Contrato', value: data.contrato_codigo || 'Sem contrato vinculado' },
                  { label: 'Tipo de contrato', value: data.contrato_tipo || '—' },
                  { label: 'Serviço faturado', value: data.servico_faturado || 'Serviço de mídia' },
                  { label: 'Parcela', value: data.numero_parcela ? `${data.numero_parcela} de ${data.total_parcelas || '1'}` : 'Única' },
                  { label: 'Documento', value: data.numero_documento || data.codigo_operacional },
                  { label: 'Competência', value: data.competencia ? format(new Date(data.competencia), 'MMMM / yyyy', { locale: ptBR }) : '—' },
                  { label: 'Método Previsto', value: data.metodo || 'PIX' },
                  { label: 'Recorrência', value: data.recorrencia || '—' }
                ].map((item, idx) => (
                  <div key={idx} className="px-6 py-3.5 flex justify-between items-center hover:bg-white/[0.02] transition-colors">
                    <dt className="text-gray-400 font-medium text-xs">{item.label}</dt>
                    <dd className="font-medium text-[#FFFFFF] text-xs text-right max-w-[60%] truncate">
                      {item.value}
                    </dd>
                  </div>
                ))}
                
                {data.observacoes && (
                  <div className="px-6 py-4 bg-white/5">
                    <dt className="text-gray-400 font-medium text-xs mb-1">Observações</dt>
                    <dd className="text-[#FFFFFF] text-xs italic">{data.observacoes}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>

          {/* COLUNA DIREITA - AÇÕES E HISTÓRICO */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* =======================
                HISTÓRICO DE PAGAMENTOS
            ======================= */}
            <div className="bg-[#14002E] border border-white/5 rounded-3xl overflow-hidden shadow-xl">
              <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center">
                <h3 className="text-base font-bold text-[#FFFFFF]">
                  Pagamentos
                </h3>
              </div>
              <div className="p-2">
                {data.pagamentos && data.pagamentos.length > 0 ? (
                  <div className="flex flex-col">
                    {data.pagamentos.map((pag, index) => (
                      <div key={pag.id || index} className="p-4 hover:bg-white/[0.02] rounded-2xl transition-colors flex justify-between items-center">
                        <div className="flex flex-col gap-1">
                          <span className="text-[#5D1BFF] text-xs font-medium">Link #{pag.transacao_id_externo?.slice(-4) || '000'}</span>
                          <span className="text-xs text-gray-400">{pag.meio_pagamento || 'PIX'}</span>
                          <div className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#25D366]/10 text-[#25D366] text-[10px] font-bold w-fit border border-[#25D366]/20">
                            Aprovado
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-xs text-gray-400">
                            {format(new Date(pag.data_liquidacao), "dd MMM", { locale: ptBR })}
                          </span>
                          <span className="text-sm font-bold text-[#FFFFFF]">{formatMoney(pag.valor_pago)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                    <Receipt className="w-8 h-8 text-gray-600 mb-3" />
                    <p className="text-gray-400 text-xs font-medium">Nenhum pagamento registrado.</p>
                  </div>
                )}
              </div>
            </div>

            {/* =======================
                PAGAMENTO ONLINE
            ======================= */}
            {!isPaid && !isCanceled && (
              <div className="bg-[#5D1BFF] rounded-3xl overflow-hidden shadow-2xl relative">
                <div className="px-6 py-6 flex flex-col gap-3">
                  <h3 className="text-base font-bold text-[#FFFFFF]">
                    Pagamento online
                  </h3>
                  <div className="bg-white/10 rounded-2xl p-4">
                    <p className="font-bold text-[#FFFFFF] text-xs mb-1">Em configuração</p>
                    <p className="text-[11px] text-[#FFFFFF]/80 leading-relaxed mb-3">
                      O pagamento automático (PIX/Boleto) estará disponível em breve.
                    </p>
                    <div className="text-[10px] font-medium text-[#FFFFFF] bg-black/20 px-3 py-2 rounded-lg">
                      Efetue o pagamento na conta informada pela equipe e envie o comprovante.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* =======================
                ATENDIMENTO
            ======================= */}
            <div className="bg-[#14002E] border border-white/5 rounded-3xl overflow-hidden shadow-xl">
              <div className="p-6">
                <h3 className="text-sm font-bold text-[#FFFFFF] mb-2">
                  Precisa de ajuda?
                </h3>
                <p className="text-[11px] text-gray-400 leading-relaxed mb-4">
                  Dúvidas ou renegociação? Entre em contato.
                </p>
                <div className="bg-white/5 border border-white/5 p-4 rounded-2xl flex justify-between items-center hover:bg-white/10 transition-colors cursor-pointer">
                  <div>
                    <div className="text-xs font-bold text-[#FFFFFF]">SOBRE MÍDIA</div>
                    <div className="text-[10px] font-medium text-gray-400 mt-0.5">WhatsApp / E-mail</div>
                  </div>
                  <MessageCircle className="w-4 h-4 text-[#8A2EFF]" />
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
