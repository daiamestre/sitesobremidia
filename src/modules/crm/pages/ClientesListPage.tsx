import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { clienteService, ClienteCompleto, rotaCliente } from '../services/cliente.service';
import { Cliente360Modal } from '../components/Cliente360Modal';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, Building2, MapPin, Trash2, Loader2, FileCheck, Eye, Pencil } from 'lucide-react';

export default function ClientesListPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { empresaOperadoraId, representante, user, isOwner } = useAuth();

  const [clientes, setClientes] = useState<ClienteCompleto[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selected360Cliente, setSelected360Cliente] = useState<ClienteCompleto | null>(null);

  const fetchClientes = useCallback(async () => {
    setLoading(true);
    const data = await clienteService.findAll(empresaOperadoraId || undefined, isOwner ? undefined : representante?.id || undefined);
    setClientes(data);
    setLoading(false);
  }, [empresaOperadoraId, representante?.id, isOwner]);

  useEffect(() => {
    fetchClientes();
  }, [fetchClientes]);

  const handleInactivate = async (id: string, name: string) => {
    setDeletingId(id);
    const result = await clienteService.softDelete(id, 'Inativado pelo representante', user?.id);
    setDeletingId(null);

    if (result.success) {
      toast({
        title: 'Cliente Inativado',
        description: `O cliente ${name} foi inativado com sucesso (Soft Delete).`,
      });
      fetchClientes();
    } else {
      toast({
        title: 'Erro ao inativar',
        description: result.error || 'Falha ao inativar cliente.',
        variant: 'destructive',
      });
    }
  };

  const handleNavigateToContratos = async (clienteId: string) => {
    // Busca proposta mais recente do cliente
    const { data: prop } = await supabase
      .from('propostas')
      .select('id')
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (prop?.id) {
      navigate(`/representantes/contratos/selecionar/${prop.id}`);
    } else {
      toast({
        title: 'Sem proposta vinculada',
        description: 'Crie um atendimento comercial no formulário antes de selecionar o contrato.',
        variant: 'destructive',
      });
    }
  };

  const filteredClientes = clientes.filter((c) => {
    const emp = c.empresas?.[0];
    if (!emp) return false;
    const term = searchTerm.toLowerCase();
    return (
      (emp?.nome_fantasia || '').toLowerCase().includes(term) ||
      (emp?.razao_social || '').toLowerCase().includes(term) ||
      (emp?.cnpj || '').includes(term) ||
      (emp?.cidade || '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-white">
              Carteira de Clientes
            </h2>
            <Badge className="bg-primary/20 text-primary border-primary/30 ml-2">
              {clientes.length} Cadastrados
            </Badge>
          </div>
          <p className="text-slate-300 text-sm">
            Gerenciamento real de clientes, empresas, unidades e contatos do PostgreSQL.
          </p>
        </div>

        <Button
          onClick={() => navigate('/representantes/clientes/novo')}
          className="gradient-primary glow-primary font-bold text-sm px-5 py-2.5 rounded-xl shadow-xl hover:scale-105 transition-all gap-2"
        >
          <Plus className="h-4 w-4" />
          + Cadastrar Novo Cliente
        </Button>
      </div>

      {/* Main Table Card */}
      <Card className="border border-white/10 bg-slate-900/70 backdrop-blur-xl shadow-xl rounded-2xl">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4">
          <div>
            <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Clientes & Empresas Cadastradas
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs">
              Conexão direta com Supabase PostgreSQL (Tabelas clientes, empresas e contatos)
            </CardDescription>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por nome, CNPJ ou cidade..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-slate-950/80 border-white/10 text-white rounded-xl h-10 text-xs"
            />
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredClientes.length === 0 ? (
            <div className="text-center py-12 text-slate-400 space-y-3">
              <p>Nenhum cliente comercial encontrado no banco de dados.</p>
              <Button onClick={() => navigate('/representantes/clientes/novo')} variant="outline" className="border-white/10 text-white">
                Cadastrar Primeiro Cliente
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-950">
                  <TableRow className="border-white/10">
                    <TableHead className="text-slate-300">Cód / Nome Fantasia</TableHead>
                    <TableHead className="text-slate-300">CNPJ / Razão Social</TableHead>
                    <TableHead className="text-slate-300">Cidade / Estado</TableHead>
                    <TableHead className="text-slate-300">Contato Principal</TableHead>
                    <TableHead className="text-slate-300">Status</TableHead>
                    <TableHead className="text-right text-slate-300">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClientes.map((cliente) => {
                    const emp = cliente.empresas?.[0];
                    const ct = emp?.contatos?.[0];
                    const nomeFantasia = emp?.nome_fantasia || 'Sem nome';
                    const segmento = emp?.segmento || 'Geral';
                    const cnpj = emp?.cnpj || 'N/A';
                    const razaoSocial = emp?.razao_social || 'N/A';
                    const cidadeEstado = emp?.cidade ? `${emp.cidade}/${emp.estado}` : 'N/I';
                    const contatoNome = ct?.nome || emp?.representante_legal || 'N/A';
                    const contatoInfo = emp?.whatsapp || emp?.email || 'N/A';
                    return (
                      <TableRow key={cliente.id} className="border-white/10 hover:bg-white/5 cursor-pointer" onClick={() => navigate(rotaCliente(cliente))}>
                        <TableCell>
                          <div className="font-bold text-white text-sm flex items-center gap-1">
                            <span className="text-xs text-primary font-mono mr-1">#{cliente.codigo_cliente}</span>
                            {nomeFantasia}
                          </div>
                          <span className="text-xs text-slate-400">{segmento}</span>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs text-slate-200 font-semibold">{cnpj}</div>
                          <div className="text-xs text-slate-400 truncate max-w-[180px]">{razaoSocial}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs text-slate-300 flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-slate-400" />
                            {cidadeEstado}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs text-slate-200 font-medium">{contatoNome}</div>
                          <div className="text-[11px] text-slate-400">{contatoInfo}</div>
                        </TableCell>
                        <TableCell>
                          <Badge className={
                            cliente.status === 'ACTIVE' || cliente.status === 'ATIVO' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                            cliente.status === 'PROSPECT' || cliente.status === 'NEGOCIACAO' ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' :
                            'bg-amber-500/20 text-amber-400 border-amber-500/30'
                          }>
                            {cliente.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-primary/30 text-primary hover:bg-primary/10 text-xs h-8 px-2.5 gap-1"
                              onClick={() => setSelected360Cliente(cliente)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Visão 360º
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              className="border-sky-500/30 text-sky-400 hover:bg-sky-500/10 text-xs h-8 px-2.5 gap-1"
                              onClick={() => navigate(`/representantes/clientes/editar/${cliente.codigo_cliente ?? cliente.id}`)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Editar
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 text-xs h-8 px-2.5 gap-1"
                              onClick={() => handleNavigateToContratos(cliente.id)}
                            >
                              <FileCheck className="h-3.5 w-3.5" />
                              Contrato
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs h-8 px-2"
                              onClick={() => handleInactivate(cliente.id, nomeFantasia)}
                              disabled={deletingId === cliente.id}
                            >
                              {deletingId === cliente.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* MODAL DA VISÃO 360 DE ACORDO COM O PROTOCOLO FASE 8.4-B.1 */}
      <Cliente360Modal
        cliente={selected360Cliente}
        isOpen={!!selected360Cliente}
        onClose={() => setSelected360Cliente(null)}
      />
    </div>
  );
}
