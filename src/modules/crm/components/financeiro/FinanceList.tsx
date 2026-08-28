import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DollarSign, Eye, Plus, Edit, Link, MessageCircle } from 'lucide-react';
import { ContaReceberCompleta } from '../../services/financeiro.service';
import { NewReceivableModal } from './NewReceivableModal';
import { EditReceivableModal } from './EditReceivableModal';
import { useToast } from '@/hooks/use-toast';

interface FinanceListProps {
  contas: ContaReceberCompleta[];
  onSelectConta: (conta: ContaReceberCompleta) => void;
  onRefresh?: () => void;
}

export function FinanceList({ contas, onSelectConta, onRefresh }: FinanceListProps) {
  const { toast } = useToast();
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [editingConta, setEditingConta] = useState<ContaReceberCompleta | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  // Computed metrics for dashboard cards
  const totalAReceber = contas.filter(c => c.status !== 'CANCELADO').reduce((acc, c) => acc + Number(c.saldo || 0), 0);
  
  const abertos = contas.filter(c => c.status === 'PENDENTE');
  const abertosValor = abertos.reduce((acc, c) => acc + Number(c.saldo || 0), 0);
  
  const emCobranca = contas.filter(c => c.status === 'PENDENTE' || c.status === 'VENCIDO'); // Simplify as needed
  const emCobrancaValor = emCobranca.reduce((acc, c) => acc + Number(c.saldo || 0), 0);
  
  const recebidos = contas.filter(c => c.status === 'PAGO' || c.status === 'PARCIAL');
  const recebidoValor = recebidos.reduce((acc, c) => acc + Number(c.valor_pago || 0), 0);
  
  const inadimplentes = contas.filter(c => c.status === 'VENCIDO');
  const inadimplentesValor = inadimplentes.reduce((acc, c) => acc + Number(c.saldo || 0), 0);

  const bloqueados = contas.filter(c => c.status === 'CANCELADO'); // As placeholder for Bloqueados

  const filteredContas = filterStatus 
    ? (filterStatus === 'TODOS' ? contas : contas.filter(c => {
        if (filterStatus === 'ABERTO') return c.status === 'PENDENTE';
        if (filterStatus === 'COBRANCA') return c.status === 'PENDENTE' || c.status === 'VENCIDO';
        if (filterStatus === 'INADIMPLENTES') return c.status === 'VENCIDO';
        if (filterStatus === 'BLOQUEADOS') return c.status === 'CANCELADO'; // Needs real logic if separate
        if (filterStatus === 'RECEBIDO') return c.status === 'PAGO' || c.status === 'PARCIAL';
        return true;
      }))
    : contas;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PAGO':
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Pago</Badge>;
      case 'PARCIAL':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Parcial</Badge>;
      case 'VENCIDO':
        return <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30">Vencido</Badge>;
      case 'CANCELADO':
        return <Badge className="bg-slate-700 text-slate-300">Cancelado</Badge>;
      default:
        return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Pendente</Badge>;
    }
  };

  const generateWhatsAppLink = (conta: ContaReceberCompleta) => {
    const urlPublica = `${window.location.origin}/cobranca/${conta.numero_documento}/${conta.public_token}`;
    const text = `Olá, ${conta.cliente?.empresas?.[0]?.nome_fantasia || conta.cliente?.empresas?.[0]?.razao_social || 'Cliente'}!\nSua cobrança da SOBRE MÍDIA${conta.competencia ? ` referente à competência ${conta.competencia}` : ''} está disponível.\n\nValor: R$ ${Number(conta.saldo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\nVencimento: ${new Date(conta.vencimento).toLocaleDateString('pt-BR')}\n\nAcesse sua cobrança:\n${urlPublica}\n\nEm caso de dúvidas, estamos à disposição.`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  };

  const handleCardClick = (status: string) => {
    setFilterStatus(filterStatus === status ? null : status);
  };

  return (
    <>
      <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
        <CardHeader className="pb-3 border-b border-white/10">
          <CardTitle className="text-base font-bold text-white flex items-center justify-between">
            <span className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-emerald-400" />
              Contas a Receber ({contas.length})
            </span>
            <Button size="sm" onClick={() => setIsNewModalOpen(true)} className="gap-2 bg-primary/20 text-primary hover:bg-primary/30">
              <Plus className="h-4 w-4" /> Nova Cobrança
            </Button>
          </CardTitle>
        </CardHeader>
      <CardContent className="pt-4 space-y-6">
        
        {/* Dashboard Cards - Interactive */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div 
            onClick={() => handleCardClick('TODOS')}
            className={`p-3 rounded-xl border cursor-pointer transition-all ${filterStatus === 'TODOS' || !filterStatus ? 'bg-primary/20 border-primary/50' : 'bg-slate-950/60 border-white/5 hover:border-white/20'}`}
          >
            <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">Total a Receber</span>
            <strong className="text-white text-sm font-bold block mt-1">R$ {totalAReceber.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
            <span className="text-[10px] text-slate-500 mt-1 block">{contas.length} cobranças</span>
          </div>

          <div 
            onClick={() => handleCardClick('ABERTO')}
            className={`p-3 rounded-xl border cursor-pointer transition-all ${filterStatus === 'ABERTO' ? 'bg-amber-500/20 border-amber-500/50' : 'bg-slate-950/60 border-white/5 hover:border-white/20'}`}
          >
            <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">Em Aberto</span>
            <strong className="text-amber-400 text-sm font-bold block mt-1">R$ {abertosValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
            <span className="text-[10px] text-slate-500 mt-1 block">{abertos.length} dentro do vencimento</span>
          </div>

          <div 
            onClick={() => handleCardClick('COBRANCA')}
            className={`p-3 rounded-xl border cursor-pointer transition-all ${filterStatus === 'COBRANCA' ? 'bg-orange-500/20 border-orange-500/50' : 'bg-slate-950/60 border-white/5 hover:border-white/20'}`}
          >
            <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">Em Cobrança</span>
            <strong className="text-orange-400 text-sm font-bold block mt-1">R$ {emCobrancaValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
            <span className="text-[10px] text-slate-500 mt-1 block">{emCobranca.length} na régua</span>
          </div>

          <div 
            onClick={() => handleCardClick('INADIMPLENTES')}
            className={`p-3 rounded-xl border cursor-pointer transition-all ${filterStatus === 'INADIMPLENTES' ? 'bg-rose-500/20 border-rose-500/50' : 'bg-slate-950/60 border-white/5 hover:border-white/20'}`}
          >
            <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">Inadimplentes</span>
            <strong className="text-rose-400 text-sm font-bold block mt-1">R$ {inadimplentesValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
            <span className="text-[10px] text-slate-500 mt-1 block">{inadimplentes.length} ultrapassaram a régua</span>
          </div>

          <div 
            onClick={() => handleCardClick('BLOQUEADOS')}
            className={`p-3 rounded-xl border cursor-pointer transition-all ${filterStatus === 'BLOQUEADOS' ? 'bg-purple-500/20 border-purple-500/50' : 'bg-slate-950/60 border-white/5 hover:border-white/20'}`}
          >
            <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">Bloqueados</span>
            <strong className="text-purple-400 text-sm font-bold block mt-1">Suspensos</strong>
            <span className="text-[10px] text-slate-500 mt-1 block">{bloqueados.length} contratos inativos</span>
          </div>

          <div 
            onClick={() => handleCardClick('RECEBIDO')}
            className={`p-3 rounded-xl border cursor-pointer transition-all ${filterStatus === 'RECEBIDO' ? 'bg-emerald-500/20 border-emerald-500/50' : 'bg-slate-950/60 border-white/5 hover:border-white/20'}`}
          >
            <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">Recebido</span>
            <strong className="text-emerald-400 text-sm font-bold block mt-1">R$ {recebidoValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
            <span className="text-[10px] text-slate-500 mt-1 block">{recebidos.length} baixas realizadas</span>
          </div>
        </div>

        {filteredContas.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs">Nenhum título encontrado para o filtro selecionado.</div>
        ) : (
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-950">
                <TableRow className="border-white/10">
                  <TableHead className="text-slate-300">Cliente / Ref</TableHead>
                  <TableHead className="text-slate-300">Vencimento</TableHead>
                  <TableHead className="text-slate-300">Saldo a Receber</TableHead>
                  <TableHead className="text-slate-300">Situação</TableHead>
                  <TableHead className="text-right text-slate-300">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContas.map((c) => (
                  <TableRow key={c.id} className="border-white/10 hover:bg-white/5">
                    <TableCell>
                      <strong className="text-white block font-mono text-xs">{c.cliente?.empresas?.[0]?.nome_fantasia || 'Cliente'}</strong>
                      <span className="text-[11px] text-slate-400">{c.numero_documento}</span>
                    </TableCell>
                    <TableCell className="text-xs text-slate-300">
                      {new Date(c.vencimento).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell className="text-xs font-bold text-emerald-400">
                      R$ {Number(c.saldo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>{getStatusBadge(c.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Visualizar Detalhes"
                          onClick={() => onSelectConta(c)}
                          className="h-7 px-2 text-slate-300 hover:text-white hover:bg-white/10"
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          <span className="hidden xl:inline text-xs">Visualizar</span>
                        </Button>
                        
                        {c.status !== 'CANCELADO' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Editar Cobrança"
                            onClick={() => setEditingConta(c)}
                            className="h-7 px-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                          >
                            <Edit className="h-4 w-4 mr-1" />
                            <span className="hidden xl:inline text-xs">Editar</span>
                          </Button>
                        )}
                        
                        {c.public_token && c.public_enabled && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Pré-visualizar como Cliente"
                              onClick={() => window.open(`${window.location.origin}/cobranca/${c.numero_documento}/${c.public_token}`, '_blank')}
                              className="h-7 px-2 text-primary hover:text-primary hover:bg-primary/10"
                            >
                              <Link className="h-4 w-4 mr-1" />
                              <span className="hidden xl:inline text-xs">Pré-visualizar</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Enviar por WhatsApp"
                              onClick={() => window.open(generateWhatsAppLink(c), '_blank')}
                              className="h-7 px-2 text-green-400 hover:text-green-300 hover:bg-green-500/10"
                            >
                              <MessageCircle className="h-4 w-4 mr-1" />
                              <span className="hidden xl:inline text-xs">WhatsApp</span>
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      </Card>
      
      <NewReceivableModal 
        isOpen={isNewModalOpen} 
        onClose={() => setIsNewModalOpen(false)} 
        onSuccess={() => {
          setIsNewModalOpen(false);
          if (onRefresh) onRefresh();
        }} 
      />

      {editingConta && (
        <EditReceivableModal
          isOpen={true}
          onClose={() => setEditingConta(null)}
          cobranca={editingConta as any}
          onSuccess={() => {
            setEditingConta(null);
            if (onRefresh) onRefresh();
          }}
        />
      )}
    </>
  );
}
