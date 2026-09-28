import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { CalendarPlus, Info, Loader2, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { financeiroService, Cobranca } from '../../services/financeiro.service';
import { useToast } from '@/hooks/use-toast';
import { situacaoCobranca } from '@/lib/situacaoCobranca';

interface EditReceivableModalProps {
  isOpen: boolean;
  onClose: () => void;
  cobranca: Cobranca;
  onSuccess: () => void;
}

/** Dados completos da cobrança, lidos do banco ao abrir (a lista pode não trazer tudo). */
interface Detalhes {
  status: string;
  competencia_date: string | null;
  valor_pago: number;
  created_at: string | null;
  public_identifier: string | null;
  codigo_operacional: string | null;
  inter_pix_valor_recebido: number | null;
  cliente_nome: string | null;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const nomeMes = (ym: string) => {
  const [a, m] = ym.split('-').map(Number);
  return a && m ? `${MESES[m - 1]} de ${a}` : ym;
};
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export function EditReceivableModal({ isOpen, onClose, cobranca, onSuccess }: EditReceivableModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [det, setDet] = useState<Detalhes | null>(null);

  const [valor, setValor] = useState<number>(Number(cobranca.valor) || 0);
  const [vencimento, setVencimento] = useState<string>(
    cobranca.data_vencimento ? String(cobranca.data_vencimento).substring(0, 10) : ''
  );
  const [competencia, setCompetencia] = useState<string>('');
  const [descricao, setDescricao] = useState(cobranca.notes || '');
  const [metodo, setMetodo] = useState(cobranca.metodo_cobranca || 'PIX');
  const [metodosGateway, setMetodosGateway] = useState<string[]>(cobranca.metodos_gateway || ['PIX', 'BOLETO']);

  useEffect(() => {
    if (!isOpen) return;
    setValor(Number(cobranca.valor) || 0);
    setVencimento(cobranca.data_vencimento ? String(cobranca.data_vencimento).substring(0, 10) : '');
    setDescricao(cobranca.notes || '');
    setMetodo(cobranca.metodo_cobranca || 'PIX');
    setMetodosGateway(cobranca.metodos_gateway || ['PIX', 'BOLETO']);
    setDet(null);
    (async () => {
      const { data } = await supabase
        .from('contas_receber')
        .select('status, competencia_date, valor_pago, created_at, public_identifier, codigo_operacional, inter_pix_valor_recebido, cliente:clientes(empresas(nome_fantasia, razao_social))')
        .eq('id', cobranca.id)
        .maybeSingle();
      if (!data) return;
      const d = data as any;
      const emp = Array.isArray(d.cliente?.empresas) ? d.cliente.empresas[0] : d.cliente?.empresas;
      setDet({
        status: d.status, competencia_date: d.competencia_date, valor_pago: Number(d.valor_pago || 0),
        created_at: d.created_at, public_identifier: d.public_identifier, codigo_operacional: d.codigo_operacional,
        inter_pix_valor_recebido: d.inter_pix_valor_recebido != null ? Number(d.inter_pix_valor_recebido) : null,
        cliente_nome: emp?.nome_fantasia || emp?.razao_social || null,
      });
      setCompetencia(String(d.competencia_date || cobranca.data_vencimento || '').slice(0, 7));
    })();
  }, [isOpen, cobranca]);

  const competenciaOriginal = String(det?.competencia_date || '').slice(0, 7);
  const outroMes = !!competencia && !!competenciaOriginal && competencia !== competenciaOriginal;
  const valorPago = det?.valor_pago ?? Number(cobranca.valor_pago || 0);
  const situacao = det ? situacaoCobranca(det.status, cobranca.data_vencimento) : null;

  const handleSubmit = async () => {
    if (!valor || valor <= 0) {
      toast({ title: 'Valor inválido', description: 'Informe um valor maior que zero.', variant: 'destructive' });
      return;
    }
    if (!vencimento) {
      toast({ title: 'Vencimento inválido', description: 'Informe a data de vencimento.', variant: 'destructive' });
      return;
    }
    if (metodosGateway.length === 0) {
      toast({ title: 'Forma de pagamento', description: 'Selecione pelo menos uma forma de pagamento aceita.', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);

    if (outroMes) {
      // Cobrança do novo mês: a original fica como está
      const res = await financeiroService.criarCobrancaDeOutroMes(cobranca.id, {
        competencia, vencimento, valor, descricao, metodoCobranca: metodo, metodosGateway,
      });
      setIsSubmitting(false);
      if (res.success) {
        toast({ title: `Cobrança de ${nomeMes(competencia)} criada`, description: `${res.codigo ?? ''} — a cobrança de ${nomeMes(competenciaOriginal)} continua como estava.` });
        onSuccess();
      } else {
        toast({ title: 'Não foi possível criar a cobrança', description: res.error, variant: 'destructive' });
      }
      return;
    }

    if (valor < valorPago) {
      setIsSubmitting(false);
      toast({ title: 'Valor inválido', description: `O valor total não pode ser menor que o já pago (${brl(valorPago)}).`, variant: 'destructive' });
      return;
    }
    const res = await financeiroService.updateReceivable(cobranca.id, {
      valor, dataVencimento: vencimento, descricao, metodoCobranca: metodo, metodosGateway, competencia,
    } as any);
    setIsSubmitting(false);
    if (res.success) {
      toast({ title: 'Cobrança atualizada', description: 'O link de pagamento já mostra os dados novos (PIX/boleto gerados de novo).' });
      onSuccess();
    } else {
      toast({ title: 'Erro ao atualizar', description: res.error, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-white/10 text-white max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar cobrança</DialogTitle>
          <DialogDescription className="text-slate-400">
            {det?.codigo_operacional || cobranca.codigo_operacional}
            {det?.cliente_nome ? ` · ${det.cliente_nome}` : ''}
          </DialogDescription>
        </DialogHeader>

        {/* Resumo da cobrança */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs">
          <div>
            <p className="text-slate-500">Situação</p>
            {situacao ? <span className={`mt-0.5 inline-block rounded-md border px-1.5 py-0.5 font-semibold ${situacao.cor}`}>{situacao.texto}</span> : <Loader2 className="h-3 w-3 animate-spin" />}
          </div>
          <div>
            <p className="text-slate-500">Mês da cobrança</p>
            <p className="font-medium text-slate-200">{competenciaOriginal ? nomeMes(competenciaOriginal) : '—'}</p>
          </div>
          <div>
            <p className="text-slate-500">Já pago</p>
            <p className="font-medium text-slate-200">{brl(valorPago)}</p>
          </div>
          <div>
            <p className="text-slate-500">Recebido pelo Inter</p>
            <p className="font-medium text-slate-200">{det?.inter_pix_valor_recebido != null ? brl(det.inter_pix_valor_recebido) : '—'}</p>
          </div>
        </div>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Mês da cobrança</Label>
              <Input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)}
                className="bg-slate-950 border-white/10 text-white [&::-webkit-calendar-picker-indicator]:filter-[invert(1)]" />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Valor total (R$)</Label>
              <Input type="number" value={valor} onChange={(e) => setValor(Number(e.target.value))}
                min={outroMes ? 0.01 : valorPago} step="0.01" className="bg-slate-950 border-white/10 text-white" />
              {!outroMes && valorPago > 0 && <p className="text-[10px] text-amber-400">Mínimo: {brl(valorPago)} (já pago)</p>}
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Vencimento</Label>
              <Input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)}
                className="bg-slate-950 border-white/10 text-white [&::-webkit-calendar-picker-indicator]:filter-[invert(1)]" />
            </div>
          </div>

          {outroMes && (
            <div className="flex gap-2 rounded-xl border border-primary/40 bg-primary/10 p-3 text-sm text-slate-200" data-testid="aviso-outro-mes">
              <CalendarPlus className="h-4 w-4 flex-shrink-0 mt-0.5 text-primary" />
              <p>
                Será criada uma <strong>nova cobrança de {nomeMes(competencia)}</strong> com estes dados (novo código e novo link de pagamento).
                A cobrança de {nomeMes(competenciaOriginal)} continua exatamente como está{situacao ? ` (${situacao.texto.toLowerCase()})` : ''}.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-slate-300">Descrição / observações</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Mensalidade de mídia digital"
              className="bg-slate-950 border-white/10 text-white" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Forma prevista</Label>
              <Select value={metodo} onValueChange={setMetodo}>
                <SelectTrigger className="bg-slate-950 border-white/10 text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-900 border-white/10 text-white">
                  <SelectItem value="PIX">PIX</SelectItem>
                  <SelectItem value="BOLETO">Boleto bancário</SelectItem>
                  <SelectItem value="CARTAO">Cartão de crédito</SelectItem>
                  <SelectItem value="TRANSFERENCIA">Transferência</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Formas aceitas no link de pagamento</Label>
              <div className="flex gap-6 pt-2">
                {(['PIX', 'BOLETO'] as const).map((m) => (
                  <div key={m} className="flex items-center gap-2">
                    <Checkbox id={`${m}-allowed`} checked={metodosGateway.includes(m)}
                      onCheckedChange={(checked) => setMetodosGateway((prev) => checked ? [...new Set([...prev, m])] : prev.filter((x) => x !== m))}
                      className="border-white/20 data-[state=checked]:bg-primary" />
                    <Label htmlFor={`${m}-allowed`} className="text-sm font-normal text-slate-300 cursor-pointer">{m === 'PIX' ? 'PIX' : 'Boleto bancário'}</Label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {!outroMes && (
            <p className="flex gap-2 text-xs text-slate-400">
              <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              Mudou valor, vencimento ou formas? O PIX e o boleto antigos são substituídos e o cliente passa a ver os dados novos no link.
              Se ele pagar pelo código antigo, o pagamento ainda é reconhecido.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-white/10">
          <Button variant="ghost" onClick={onClose} className="text-slate-300 hover:text-white hover:bg-white/5">Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : outroMes ? <CalendarPlus className="h-4 w-4 mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            {outroMes ? `Criar cobrança de ${nomeMes(competencia)}` : 'Salvar alterações'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
