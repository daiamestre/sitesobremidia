import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LifeBuoy, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { customerPortalService } from '../../services/customerPortal.service';

export function CustomerSupportTickets({ clienteId, empresaOperadoraId }: { clienteId: string; empresaOperadoraId: string }) {
  const { toast } = useToast();
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!titulo || !descricao) return;
    setCreating(true);
    const res = await customerPortalService.createSupportTicket({
      empresaOperadoraId,
      contratoId: '',
      assunto: titulo,
      descricao,
      prioridade: 'NORMAL',
      createdBy: clienteId,
    });
    setCreating(false);

    if (res.success) {
      toast({ title: 'Chamado Aberto com Sucesso!', description: 'SLA de resposta: até 24 horas.' });
      setTitulo('');
      setDescricao('');
    }
  };

  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <LifeBuoy className="h-4 w-4 text-blue-400" /> Central de Atendimento & Suporte
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-3 text-xs">
        <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-2">
          <span className="text-white font-semibold block">Abrir Novo Chamado</span>
          <input
            type="text"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Assunto do chamado..."
            className="w-full p-2 rounded-lg bg-slate-900 border border-white/10 text-white text-xs placeholder:text-slate-600 focus:outline-none"
          />
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Descreva sua solicitação..."
            className="w-full p-2 rounded-lg bg-slate-900 border border-white/10 text-white text-xs placeholder:text-slate-600 focus:outline-none"
            rows={2}
          />
          <div className="flex justify-end">
            <Button size="sm" disabled={creating} onClick={handleCreate} className="bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-xs gap-1">
              <Plus className="h-3.5 w-3.5" /> Enviar Chamado
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
