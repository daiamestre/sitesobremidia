import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PublicBillingData {
  id: string;
  numero_documento: string;
  competencia: string;
  vencimento: string;
  valor_original: number;
  valor_pago: number;
  desconto: number;
  juros: number;
  multa: number;
  saldo: number;
  status: string;
  cliente_nome: string;
  cliente_documento: string;
  empresa_nome: string;
  empresa_documento: string;
}

export default function PaginaCobranca() {
  const { codigo, token } = useParams<{ codigo: string; token: string }>();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PublicBillingData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBilling() {
      if (!codigo || !token) {
        setError('Link de cobrança inválido.');
        setLoading(false);
        return;
      }

      try {
        const { data: result, error: rpcError } = await supabase.rpc('rpc_get_public_billing', {
          p_codigo: codigo,
          p_token: token,
        });

        if (rpcError) {
          console.error('Error fetching billing:', rpcError);
          setError('Cobrança não encontrada ou indisponível.');
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
  }, [codigo, token]);

  const copyPix = () => {
    // TODO: Connect to actual PIX payload from backend when ready
    navigator.clipboard.writeText('payload_pix_aqui');
    alert('Código PIX copiado!');
  };

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
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 flex flex-col items-center text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Ops!</h2>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPaid = data.status === 'PAGO';
  const isOverdue = data.status === 'VENCIDO' || (new Date(data.vencimento) < new Date() && !isPaid);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">
        
        {/* Header / Brand */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{data.empresa_nome}</h1>
          <p className="text-sm text-gray-500">CNPJ: {data.empresa_documento}</p>
        </div>

        {/* Status Banner */}
        {isPaid ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center gap-3 text-emerald-800">
            <CheckCircle2 className="w-6 h-6" />
            <div>
              <h3 className="font-semibold">Pagamento Confirmado</h3>
              <p className="text-sm opacity-90">Obrigado! Sua cobrança foi recebida com sucesso.</p>
            </div>
          </div>
        ) : isOverdue ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3 text-red-800">
            <AlertCircle className="w-6 h-6" />
            <div>
              <h3 className="font-semibold">Cobrança Vencida</h3>
              <p className="text-sm opacity-90">Por favor, regularize sua situação para evitar suspensão dos serviços.</p>
            </div>
          </div>
        ) : (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3 text-blue-800">
            <Clock className="w-6 h-6" />
            <div>
              <h3 className="font-semibold">Cobrança em Aberto</h3>
              <p className="text-sm opacity-90">Vencimento: {format(new Date(data.vencimento), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Fatura Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Detalhes da Cobrança</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Fatura</span>
                <span className="font-medium">{data.numero_documento}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Competência</span>
                <span className="font-medium">{data.competencia}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Vencimento</span>
                <span className="font-medium">{format(new Date(data.vencimento), 'dd/MM/yyyy')}</span>
              </div>
              <div className="flex justify-between pb-2">
                <span className="text-muted-foreground">Status</span>
                <span className="font-medium">{data.status}</span>
              </div>
            </CardContent>
          </Card>

          {/* Cliente Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Dados do Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col border-b pb-2">
                <span className="text-muted-foreground text-sm">Sacado</span>
                <span className="font-medium">{data.cliente_nome}</span>
              </div>
              <div className="flex flex-col pb-2">
                <span className="text-muted-foreground text-sm">CPF/CNPJ</span>
                <span className="font-medium">{data.cliente_documento}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Payment Section */}
        {!isPaid && (
          <Card className="border-primary/20 shadow-md">
            <CardContent className="pt-6">
              <div className="text-center mb-6">
                <p className="text-sm text-muted-foreground uppercase tracking-wider mb-1">Valor a Pagar</p>
                <p className="text-4xl font-bold text-gray-900">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(data.saldo)}
                </p>
              </div>

              <div className="bg-gray-100 p-6 rounded-lg flex flex-col items-center gap-4">
                <p className="font-medium text-gray-700">Pague com PIX</p>
                <div className="w-48 h-48 bg-white p-2 rounded-lg border shadow-sm flex items-center justify-center">
                  {/* QRCode placeholder */}
                  <div className="text-center text-muted-foreground text-sm p-4 border-2 border-dashed border-gray-300 w-full h-full rounded flex items-center justify-center">
                    [ QRCode PIX ]
                  </div>
                </div>
                
                <Button onClick={copyPix} className="w-full sm:w-auto" size="lg">
                  <Copy className="w-4 h-4 mr-2" />
                  Copiar Código PIX
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
}
