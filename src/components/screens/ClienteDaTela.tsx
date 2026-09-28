import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/**
 * F-105 — Cliente dono da tela. Com o vínculo, a tela é desativada automaticamente quando o
 * cliente atrasa 4 dias ou mais e reativada assim que o pagamento é confirmado pelo banco.
 * O botão "Tela Ativa" continua funcionando à mão.
 */
export function ClienteDaTela({ screenId, clienteId, bloqueadaPorAtraso, onAlterado }: {
  screenId: string;
  clienteId: string | null;
  bloqueadaPorAtraso: boolean;
  onAlterado: () => void;
}) {
  const clientes = useQuery({
    queryKey: ['clientes-para-tela'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('empresas')
        .select('cliente_id, nome_fantasia, razao_social')
        .not('cliente_id', 'is', null)
        .order('nome_fantasia', { ascending: true })
        .limit(1000);
      if (error) throw error;
      const vistos = new Set<string>();
      return (data ?? [])
        .filter((e) => e.cliente_id && !vistos.has(e.cliente_id) && vistos.add(e.cliente_id))
        .map((e) => ({ id: e.cliente_id as string, nome: (e.nome_fantasia || e.razao_social || 'Cliente').trim() }));
    },
  });

  const salvar = async (valor: string) => {
    const novo = valor === 'nenhum' ? null : valor;
    const { data, error } = await supabase.from('screens').update({ cliente_id: novo } as never).eq('id', screenId).select('id');
    if (error || !data?.length) {
      toast.error(error?.message || 'Sem permissão para alterar esta tela.');
      return;
    }
    toast.success(novo ? 'Cliente vinculado. A tela segue o pagamento desse cliente.' : 'Tela sem cliente vinculado.');
    onAlterado();
  };

  return (
    <div className="space-y-2 rounded-lg border p-3 bg-muted/20" data-testid="cliente-da-tela">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-primary" />
        <Label className="text-sm font-medium">Cliente desta tela</Label>
      </div>
      <Select value={clienteId ?? 'nenhum'} onValueChange={salvar} disabled={clientes.isLoading}>
        <SelectTrigger><SelectValue placeholder="Escolha o cliente" /></SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value="nenhum">Sem cliente (não bloqueia por atraso)</SelectItem>
          {(clientes.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Com 4 dias ou mais de atraso, a tela é desativada sozinha. Quando o banco confirma o pagamento, ela volta na hora.
      </p>
      {bloqueadaPorAtraso && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-red-500">
          <AlertTriangle className="h-3.5 w-3.5" /> Desativada automaticamente por atraso de pagamento.
        </p>
      )}
    </div>
  );
}
