import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { accessRequestService, SolicitacaoAcessoRecord } from '@/services/accessRequest.service';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ShieldCheck, CheckCircle2, XCircle, AlertTriangle, Loader2 } from 'lucide-react';

export default function AdminSolicitacaoAprovacao() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const actionParam = searchParams.get('action'); // 'approve' | 'reject'
  const tokenParam = searchParams.get('token') || undefined;

  const [request, setRequest] = useState<SolicitacaoAcessoRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');
  const [isAdminUser, setIsAdminUser] = useState(false);

  useEffect(() => {
    async function init() {
      // 1. Verifica se usuário logado é ADMIN
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setIsAdminUser(false);
      } else {
        const { data: usr } = await supabase
          .from('usuarios')
          .select('*, perfil:perfis(*)')
          .eq('id', session.user.id)
          .maybeSingle();

        if (usr?.perfil?.nome === 'ADMIN') {
          setIsAdminUser(true);
        } else {
          setIsAdminUser(false);
        }
      }

      // 2. Carrega dados da solicitação pelo ID
      if (id) {
        const { data, error } = await supabase
          .from('solicitacoes_acesso')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (!error && data) {
          setRequest(data as SolicitacaoAcessoRecord);
        }
      }

      setLoading(false);
    }

    init();
  }, [id]);

  const handleApprove = async () => {
    if (!id) return;
    setProcessing(true);

    const { data: { session } } = await supabase.auth.getSession();
    const result = await accessRequestService.processDecision(id, 'APPROVED', undefined, session?.user?.id, tokenParam);
    setProcessing(false);

    if (result.success) {
      toast({
        title: 'Solicitação Aprovada!',
        description: 'O cadastro foi liberado e o usuário foi notificado por e-mail.',
      });
      navigate('/dashboard/admin/users');
    } else {
      toast({
        title: 'Erro na Aprovação',
        description: result.error || 'Falha ao processar ação.',
        variant: 'destructive',
      });
    }
  };

  const handleReject = async () => {
    if (!id) return;
    setProcessing(true);

    const { data: { session } } = await supabase.auth.getSession();
    const result = await accessRequestService.processDecision(id, 'REJECTED', motivoRejeicao, session?.user?.id, tokenParam);
    setProcessing(false);

    if (result.success) {
      toast({
        title: 'Solicitação Rejeitada',
        description: 'A solicitação foi recusada com sucesso.',
      });
      navigate('/dashboard/admin/users');
    } else {
      toast({
        title: 'Erro na Rejeição',
        description: result.error || 'Falha ao processar ação.',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
        <Card className="max-w-md w-full border-white/10 bg-slate-900 text-white rounded-2xl">
          <CardHeader className="text-center">
            <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto mb-2" />
            <CardTitle>Solicitação não encontrada</CardTitle>
            <CardDescription className="text-slate-400">
              O link informado é inválido ou a solicitação foi removida.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={() => navigate('/auth')} variant="outline">Voltar para o Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <Card className="max-w-lg w-full border-white/10 bg-slate-900/90 backdrop-blur-xl text-white rounded-2xl shadow-2xl">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto p-3 rounded-full bg-primary/10 border border-primary/20 text-primary w-fit mb-2">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl font-display font-extrabold">
            Aprovação de Cadastro Administrativo
          </CardTitle>
          <CardDescription className="text-slate-300">
            Validação de permissão para novo acesso à plataforma SOBRE MÍDIA.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Card com Detalhes da Solicitação */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 uppercase font-semibold">Tipo de Acesso</span>
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                {request.tipo_acesso}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-slate-400">Nome Solicitante</p>
              <p className="text-base font-bold text-white">{request.nome_usuario}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">E-mail Cadastrado</p>
              <p className="text-sm font-semibold text-slate-200">{request.email_usuario}</p>
            </div>
            {request.telefone && (
              <div>
                <p className="text-xs text-slate-400">Telefone / WhatsApp</p>
                <p className="text-sm text-slate-300">{request.telefone}</p>
              </div>
            )}
            <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs text-slate-400">
              <span>Status Atual:</span>
              <Badge className={
                request.status === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                request.status === 'REJECTED' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' :
                'bg-amber-500/20 text-amber-400 border-amber-500/30'
              }>
                {request.status}
              </Badge>
            </div>
          </div>

          {/* Se a solicitação já tiver sido processada */}
          {request.status !== 'PENDING' ? (
            <div className="p-4 rounded-xl bg-slate-950/40 border border-white/5 text-center space-y-2">
              <p className="text-sm text-slate-300">
                Esta solicitação já foi concluída com status <strong className="text-white">{request.status}</strong>.
              </p>
              <Button onClick={() => navigate('/dashboard/admin/users')} className="w-full mt-2">
                Ir para o Painel de Controle
              </Button>
            </div>
          ) : !isAdminUser ? (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm text-center space-y-3">
              <p>Você precisa estar logado com uma conta de <strong>Administrador</strong> para autorizar solicitações de cadastro.</p>
              <Button onClick={() => navigate(`/auth?redirect=/admin/solicitacoes/${id}`)} className="w-full gradient-primary">
                Fazer Login como Administrador
              </Button>
            </div>
          ) : actionParam === 'reject' ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">Motivo da Rejeição (Opcional)</label>
                <Input
                  placeholder="Ex: Dados incompletos ou área sem cobertura."
                  value={motivoRejeicao}
                  onChange={(e) => setMotivoRejeicao(e.target.value)}
                  className="bg-slate-950 border-white/10 text-white"
                />
              </div>
              <div className="flex gap-3">
                <Button onClick={handleReject} disabled={processing} className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold gap-2">
                  {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                  Confirmar Rejeição
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-300 text-center">
                Confirma a aprovação deste cadastro para liberar o acesso à plataforma?
              </p>
              <div className="flex gap-3">
                <Button onClick={handleApprove} disabled={processing} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2">
                  {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  CONFIRMAR APROVAÇÃO
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
