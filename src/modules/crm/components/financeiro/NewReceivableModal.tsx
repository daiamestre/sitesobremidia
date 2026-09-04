import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { financeiroService } from '../../services/financeiro.service';
import { clienteService, type ClienteCompleto } from '../../services/cliente.service';
import { contratoService, type ContratoCompleto } from '../../services/contrato.service';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';

interface NewReceivableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function NewReceivableModal({ isOpen, onClose, onSuccess }: NewReceivableModalProps) {
  const { toast } = useToast();
  const { empresaOperadoraId } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [loadingDados, setLoadingDados] = useState(false);
  const [clientes, setClientes] = useState<ClienteCompleto[]>([]);
  const [todosContratos, setTodosContratos] = useState<ContratoCompleto[]>([]);
  
  const [clienteId, setClienteId] = useState('');
  const [contratoId, setContratoId] = useState('');
  const [preferenciaCliente, setPreferenciaCliente] = useState<'PIX' | 'BOLETO'>('PIX');
  const [valor, setValor] = useState('');
  const [vencimento, setVencimento] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [metodosGateway, setMetodosGateway] = useState<string[]>(['PIX', 'BOLETO']);

  useEffect(() => {
    if (!isOpen) return;
    async function carregarDados() {
      setLoadingDados(true);
      try {
        const [listaClientes, listaContratos] = await Promise.all([
          clienteService.findAll(empresaOperadoraId || undefined),
          contratoService.findAll()
        ]);
        setClientes(listaClientes || []);
        setTodosContratos(listaContratos || []);
      } catch (err) {
        console.error('Erro ao carregar dados do modal de cobrança:', err);
      } finally {
        setLoadingDados(false);
      }
    }
    carregarDados();
  }, [isOpen, empresaOperadoraId]);

  const contratosFiltrados = clienteId
    ? todosContratos.filter(c => c.cliente_id === clienteId)
    : todosContratos;

  const gatewayRadioValue = metodosGateway.includes('PIX') && metodosGateway.includes('BOLETO') ? 'PIX_BOLETO' : metodosGateway.includes('PIX') ? 'PIX' : 'BOLETO';
  const handleGatewayRadio = (v: string) => {
    if (v === 'PIX') setMetodosGateway(['PIX']);
    else if (v === 'BOLETO') setMetodosGateway(['BOLETO']);
    else setMetodosGateway(['PIX', 'BOLETO']);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empresaOperadoraId) return;

    if (!clienteId) {
      toast({ title: 'Atenção', description: 'Selecione o cliente devedor', variant: 'destructive' });
      return;
    }
    if (!valor || Number(valor) <= 0) {
      toast({ title: 'Atenção', description: 'Informe um valor válido para a cobrança.', variant: 'destructive' });
      return;
    }
    if (metodosGateway.length === 0) {
      toast({ title: 'Atenção', description: 'Selecione pelo menos uma forma de pagamento para a cobrança.', variant: 'destructive' });
      return;
    }

    // Resolver contrato ID do cliente caso não esteja selecionado explicitamente
    let targetContratoId = contratoId;
    if (!targetContratoId && contratosFiltrados.length > 0) {
      targetContratoId = contratosFiltrados[0].id;
    }

    setLoading(true);
    const res = await financeiroService.createCobranca({
      empresaOperadoraId,
      clienteId,
      contratoId: targetContratoId || undefined,
      valor: Number(valor),
      dataVencimento: vencimento,
      metodosGateway,
      metodoCobranca: preferenciaCliente
    } as any);
    setLoading(false);

    if (res.success) {
      toast({ title: 'Sucesso', description: 'Cobrança manual gerada com sucesso!' });
      onSuccess();
      onClose();
    } else {
      toast({ title: 'Erro', description: res.error || 'Falha ao gerar cobrança.', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-slate-900 border-white/10 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Cobrança Manual</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Seleção de Cliente */}
          <div className="space-y-2">
            <Label className="text-slate-200">Cliente (Anunciante) *</Label>
            {loadingDados ? (
              <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando carteira de clientes...
              </div>
            ) : (
              <Select value={clienteId} onValueChange={(val) => { setClienteId(val); setContratoId(''); }}>
                <SelectTrigger className="bg-slate-950 border-white/10 text-white">
                  <SelectValue placeholder="Selecione o cliente..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-white/10 text-white max-h-60">
                  {clientes.map((c) => {
                    const empresa = (c.empresas as any)?.[0] || (c.empresas as any);
                    const nome = empresa?.nome_fantasia || empresa?.razao_social || `Cliente #${c.codigo_cliente}`;
                    return (
                      <SelectItem key={c.id} value={c.id}>
                        {nome} (Cód: {c.codigo_cliente})
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Seleção de Contrato Vinculado */}
          <div className="space-y-2">
            <Label className="text-slate-200">Contrato Vinculado</Label>
            <Select value={contratoId} onValueChange={setContratoId} disabled={!clienteId || contratosFiltrados.length === 0}>
              <SelectTrigger className="bg-slate-950 border-white/10 text-white">
                <SelectValue placeholder={!clienteId ? "Selecione o cliente primeiro" : contratosFiltrados.length === 0 ? "Nenhum contrato ativo encontrado" : "Selecione o contrato (opcional)..."} />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-white/10 text-white max-h-60">
                {contratosFiltrados.map((ctr) => (
                  <SelectItem key={ctr.id} value={ctr.id}>
                    Nº {ctr.numero_contrato} ({ctr.tipo_contrato || 'ANUNCIANTE'}) — Status: {ctr.status_workflow}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Valor */}
          <div className="space-y-2">
            <Label className="text-slate-200">Valor da Cobrança (R$) *</Label>
            <Input 
              type="number"
              step="0.01"
              value={valor} 
              onChange={(e) => setValor(e.target.value)}
              placeholder="0.00"
              className="bg-slate-950 border-white/10 text-white font-mono"
              required
            />
          </div>

          {/* Vencimento */}
          <div className="space-y-2">
            <Label className="text-slate-200">Data de Vencimento *</Label>
            <Input 
              type="date"
              value={vencimento} 
              onChange={(e) => setVencimento(e.target.value)}
              className="bg-slate-950 border-white/10 text-white"
              required
            />
          </div>

          {/* Preferência de Pagamento do Cliente */}
          <div className="space-y-2 pt-2 border-t border-white/10">
            <Label className="text-slate-200">Preferência de pagamento do cliente</Label>
            <Select value={preferenciaCliente} onValueChange={(val) => setPreferenciaCliente(val as 'PIX' | 'BOLETO')}>
              <SelectTrigger className="bg-slate-950 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-white/10 text-white">
                <SelectItem value="PIX">PIX (Instantâneo)</SelectItem>
                <SelectItem value="BOLETO">Boleto Bancário (Banco Inter)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Formas de Pagamento Oferecidas ao Cliente */}
          <div className="space-y-2 pt-2">
            <Label className="text-slate-200">Formas de pagamento oferecidas no Portal Público *</Label>
            <p className="text-[11px] text-slate-400">Define quais gateways o cliente poderá utilizar para quitar a fatura.</p>
            <RadioGroup value={gatewayRadioValue} onValueChange={handleGatewayRadio} className="flex flex-col gap-2 mt-1">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="PIX" id="nr-pix" />
                <Label htmlFor="nr-pix" className="cursor-pointer text-sm font-normal text-slate-200">Somente PIX (QR Code)</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="BOLETO" id="nr-boleto" />
                <Label htmlFor="nr-boleto" className="cursor-pointer text-sm font-normal text-slate-200">Somente Boleto (Código de Barras)</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="PIX_BOLETO" id="nr-both" />
                <Label htmlFor="nr-both" className="cursor-pointer text-sm font-normal text-slate-200">PIX + Boleto (Ambas as opções ativas)</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={loading} className="gap-2 bg-primary text-white">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Gerar Cobrança
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

