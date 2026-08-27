import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, useParams } from 'react-router-dom';
import { clienteService, ClienteCompleto } from '../services/cliente.service';
import { useAuth } from '@/contexts/AuthContext';
import { useRbac } from '@/hooks/useRbac';
import { usePermissoesRepresentantes } from '@/hooks/usePermissoesRepresentantes';
import { representantesGerenciaService, RepresentanteGerencia } from '@/services/representantesGerencia.service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Building2, Mail, MapPin, Pencil, Phone, Trash2, User, Loader2, FileCheck, UserCog, RefreshCw } from 'lucide-react';

export default function ClienteDetalhePage() {
  const [repCodigo, setRepCodigo] = useState<string | null>(null);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { isOwner } = useRbac();
  const permissoes = usePermissoesRepresentantes();

  const [cliente, setCliente] = useState<ClienteCompleto | null>(null);
  const [loading, setLoading] = useState(true);
  const [inactivating, setInactivating] = useState(false);

  // Reatribuição de representante (auditada pela RPC reassinar_cliente_representante)
  const [dialogReassignAberto, setDialogReassignAberto] = useState(false);
  const [representantesDisponiveis, setRepresentantesDisponiveis] = useState<RepresentanteGerencia[]>([]);
  const [carregandoRepresentantes, setCarregandoRepresentantes] = useState(false);
  const [novoRepresentanteId, setNovoRepresentanteId] = useState<string>('');
  const [reassignando, setReassignando] = useState(false);

  const podeReassign = isOwner || permissoes.podeEditarClientes;

  const load = useCallback(async (clienteId: string) => {
    setLoading(true);
    const data = await clienteService.findById(clienteId);
    setLoading(false);

    if (!data) {
      toast({
        title: 'Cliente não encontrado',
        description: 'O registro não existe ou você não tem permissão para visualizá-lo.',
        variant: 'destructive',
      });
      navigate('/representantes/clientes');
      return;
    }
    setCliente(data);

    // URL legada (UUID) → URL canônica pelo código operacional do cliente
    if (data.codigo_cliente && id && /^\d{1,9}$/.test(id) === false && /^[0-9a-f]{8}-/i.test(id)) {
      navigate(`/representantes/clientes/${data.codigo_cliente}`, { replace: true });
    }
  }, [navigate, toast, id]);

  useEffect(() => {
    (async () => {
      try {
        if (!cliente?.representante_id) return;
        const { data } = await supabase.from('representantes').select('codigo_publico').eq('id', cliente.representante_id).maybeSingle();
        setRepCodigo(data?.codigo_publico ?? null);
      } catch { /* ignore */ }
    })();
  }, [cliente?.representante_id]);

useEffect(() => {
    if (!id) return;
    load(id);
  }, [id, load]);

  const abrirReassign = async () => {
    setDialogReassignAberto(true);
    setCarregandoRepresentantes(true);
    setNovoRepresentanteId(cliente?.representante_id ?? '');
    try {
      const lista = await representantesGerenciaService.listarRepresentantes();
      setRepresentantesDisponiveis(lista);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao carregar representantes.';
      toast({ title: 'Erro ao carregar representantes', description: msg, variant: 'destructive' });
      setDialogReassignAberto(false);
    } finally {
      setCarregandoRepresentantes(false);
    }
  };

  const confirmarReassign = async () => {
    if (!cliente) return;
    setReassignando(true);
    const res = await representantesGerenciaService.reassinarCliente(
      cliente.id,
      novoRepresentanteId || null,
    );
    setReassignando(false);
    if (!res.success) {
      toast({ title: 'Erro ao reatribuir', description: res.error, variant: 'destructive' });
      return;
    }
    const novoRep = representantesDisponiveis.find((r) => r.id === novoRepresentanteId);
    toast({
      title: 'Cliente reatribuído',
      description: novoRep
        ? `Agora responsável: ${novoRep.nome}.`
        : 'Cliente removido da carteira de representantes.',
    });
    setDialogReassignAberto(false);
    if (id) await load(id);
  };

  const handleInactivate = async () => {
    if (!cliente) return;
    setInactivating(true);
    const emp = cliente.empresas?.[0];
    const result = await clienteService.softDelete(cliente.id, 'Inativado pelo representante', user?.id);
    setInactivating(false);

    if (result.success) {
      toast({
        title: 'Cliente Inativado',
        description: `O cliente ${emp?.nome_fantasia || cliente.codigo_cliente} foi inativado (Soft Delete).`,
      });
      navigate('/representantes/clientes');
    } else {
      toast({
        title: 'Erro ao inativar',
        description: result.error || 'Falha ao inativar cliente.',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!cliente) return null;

  const emp = cliente.empresas?.[0];
  const contatoPrincipal = emp?.contatos?.find((c) => c.is_principal) ?? emp?.contatos?.[0];
  const endereco = [emp?.logradouro, emp?.numero, emp?.complemento, emp?.bairro].filter(Boolean).join(', ');
  const enderecoCompleto = [endereco, emp?.cep].filter(Boolean).join(' - ');

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/20 rounded-xl text-primary border border-primary/30">
                <Building2 className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-white">
                    {emp?.nome_fantasia || 'Cliente sem nome'}
                  </h2>
                  <Badge className={
                    cliente.status === 'ACTIVE' || cliente.status === 'ATIVO' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                    cliente.status === 'PROSPECT' || cliente.status === 'NEGOCIACAO' ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' :
                    'bg-amber-500/20 text-amber-400 border-amber-500/30'
                  }>
                    {cliente.status}
                  </Badge>
                </div>
                <p className="text-slate-300 text-sm mt-0.5">
                  {emp?.razao_social} • CNPJ {emp?.cnpj}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="font-mono text-primary bg-primary/15 border border-primary/30 rounded-lg px-2 py-0.5">
                Código #{cliente.codigo_cliente}
              </span>
              <span>Cadastro: {new Date(cliente.created_at).toLocaleDateString('pt-BR')}</span>
              <span>Atualização: {new Date(cliente.updated_at).toLocaleDateString('pt-BR')}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => navigate('/representantes/clientes')}
              className="border-white/10 text-slate-300 hover:text-white rounded-xl gap-2"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
            <Button
              onClick={() => navigate(`/representantes/clientes/editar/${cliente.codigo_cliente ?? cliente.id}`)}
              className="gradient-primary glow-primary font-bold rounded-xl gap-2 shadow-xl hover:scale-105 transition-all"
            >
              <Pencil className="h-4 w-4" /> Editar
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Dados Cadastrais */}
        <Card className="border border-white/10 bg-slate-900/70 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardHeader className="border-b border-white/10">
            <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" /> Dados Cadastrais
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs">Informações da Pessoa Jurídica</CardDescription>
          </CardHeader>
          <CardContent className="pt-5 space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] uppercase text-slate-500 font-bold">Segmento</p>
                <p className="text-slate-200">{emp?.segmento || 'Não informado'}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase text-slate-500 font-bold">Telefone Fixo</p>
                <p className="text-slate-200">{emp?.telefone || 'N/A'}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase text-slate-500 font-bold">Representante Legal</p>
                <p className="text-slate-200">{emp?.representante_legal || 'Não informado'}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase text-slate-500 font-bold">Cargo</p>
                <p className="text-slate-200">{emp?.cargo_representante || 'N/A'}</p>
              </div>
            </div>

            <div>
              <p className="text-[11px] uppercase text-slate-500 font-bold flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Endereço
              </p>
              <p className="text-slate-200">
                {enderecoCompleto || 'Não informado'}
                {emp?.cidade && <span className="block text-slate-400">{emp.cidade}/{emp.estado}</span>}
              </p>
            </div>

            <div>
              <p className="text-[11px] uppercase text-slate-500 font-bold">Observações</p>
              <p className="text-slate-300 whitespace-pre-wrap">{emp?.observacoes || 'Sem observações.'}</p>
            </div>
          </CardContent>
        </Card>

        {/* Canais de Comunicação */}
        <Card className="border border-white/10 bg-slate-900/70 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardHeader className="border-b border-white/10">
            <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
              <Phone className="h-5 w-5 text-primary" /> Canais de Comunicação
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs">Contatos diretos da empresa</CardDescription>
          </CardHeader>
          <CardContent className="pt-5 space-y-3 text-sm">
            <div className="p-3 rounded-xl bg-slate-950/60 border border-white/10 flex items-center gap-3">
              <Mail className="h-4 w-4 text-slate-400 shrink-0" />
              <div>
                <p className="text-[11px] uppercase text-slate-500 font-bold">E-mail Corporativo</p>
                <p className="text-slate-200 break-all">{emp?.email || '-'}</p>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/60 border border-white/10 flex items-center gap-3">
              <Phone className="h-4 w-4 text-slate-400 shrink-0" />
              <div>
                <p className="text-[11px] uppercase text-slate-500 font-bold">WhatsApp Comercial</p>
                <p className="text-slate-200">{emp?.whatsapp || '-'}</p>
              </div>
            </div>

            <div className="pt-2">
              <h4 className="text-xs font-bold text-primary uppercase flex items-center gap-2 mb-2">
                <User className="h-4 w-4" /> Contatos
              </h4>
              {emp?.contatos && emp.contatos.length > 0 ? (
                <div className="space-y-2">
                  {emp.contatos.map((c) => (
                    <div key={c.id} className="p-3 rounded-xl bg-slate-950/60 border border-white/10 flex justify-between items-center">
                      <div>
                        <p className="font-bold text-white flex items-center gap-2">
                          {c.nome}
                          {c.is_principal && <Badge className="bg-primary/20 text-primary text-[10px]">Principal</Badge>}
                        </p>
                        <p className="text-xs text-slate-400">
                          {c.cargo}{contatoPrincipal?.id === c.id && (c.email || c.telefone) ? ' • ' : ''}
                          {c.email || ''}{c.email && c.telefone ? ' • ' : ''}{c.telefone || ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">Nenhum contato cadastrado.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rodapé de ações */}
      <div className="flex justify-end gap-2">
        {podeReassign && (
          <Button
            variant="outline"
            className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10 text-xs h-9 gap-2"
            onClick={abrirReassign}
          >
            <UserCog className="h-3.5 w-3.5" />
            Reatribuir Representante
          </Button>
        )}
        <Button
          variant="outline"
          className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs h-9 gap-2"
          onClick={handleInactivate}
          disabled={inactivating}
        >
          {inactivating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          Inativar Cliente
        </Button>
        <Button
          variant="outline"
          className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 text-xs h-9 gap-2"
          onClick={() => toast({
            title: 'Propostas e Contratos',
            description: 'Crie o atendimento no formulário comercial para gerar proposta e contrato deste cliente.',
          })}
        >
          <FileCheck className="h-3.5 w-3.5" />
          Propostas & Contratos
        </Button>
      </div>

      {/* DIALOG REATRIBUIR REPRESENTANTE */}
      <Dialog open={dialogReassignAberto} onOpenChange={setDialogReassignAberto}>
        <DialogContent className="bg-slate-950 border-white/10 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5 text-purple-400" /> Reatribuir Representante
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Alterar o representante responsável pelo cliente{' '}
              <strong className="text-white">{emp?.nome_fantasia || `#${cliente.codigo_cliente}`}</strong>.
              A operação é auditada ({'CLIENTE_REPRESENTANTE_CHANGED'}).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-slate-900 border border-white/10 text-xs">
              <span className="text-slate-400 block">Representante atual</span>
              <strong className="text-white">
                {cliente.representante?.usuario?.nome ??
                  (repCodigo ? `REP ${repCodigo}` : 'Sem representante')}
              </strong>
            </div>
            {carregandoRepresentantes ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-2">
                <Select value={novoRepresentanteId} onValueChange={setNovoRepresentanteId}>
                  <SelectTrigger className="bg-slate-900 border-white/10 text-white rounded-xl h-10 text-sm">
                    <SelectValue placeholder="Selecione o representante" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-950 border-white/10 text-white max-h-72 overflow-y-auto">
                    <SelectItem value="">Sem representante</SelectItem>
                    {representantesDisponiveis.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.nome}
                        {!r.ativo ? ' (inativo)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-slate-500">
                  Somente representantes do mesmo tenant podem ser selecionados (validação no backend).
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-white/10 text-slate-300 rounded-xl text-xs"
              onClick={() => setDialogReassignAberto(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmarReassign}
              disabled={reassignando || carregandoRepresentantes || novoRepresentanteId === (cliente?.representante_id ?? '')}
              className="bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs gap-1.5"
            >
              {reassignando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Confirmar reatribuição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}