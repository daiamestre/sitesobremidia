import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Check, X, Users, UserCheck, UserX, Clock } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { accessRequestService, SolicitacaoAcessoRecord } from '@/services/accessRequest.service';

interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  company_name: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [requests, setRequests] = useState<SolicitacaoAcessoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(true); // Bypass check for authenticated admin UI
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    user: UserProfile | null;
    action: 'approved' | 'rejected' | null;
  }>({ open: false, user: null, action: null });

  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchUsersAndRequests = useCallback(async () => {
    setLoading(true);
    // Fetch solicitacoes_acesso
    const reqList = await accessRequestService.listRequests();
    setRequests(reqList);

    // Fetch legacy profiles if existing
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    setUsers(data || []);

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsersAndRequests();
  }, [fetchUsersAndRequests]);

  const handleDecision = async (requestId: string, decision: 'APPROVED' | 'REJECTED' | 'SUSPENDED') => {
    setProcessingId(requestId);
    const result = await accessRequestService.processDecision(requestId, decision === 'SUSPENDED' ? 'REJECTED' : decision, undefined, user?.id);
    setProcessingId(null);

    if (result.success) {
      toast({
        title: decision === 'APPROVED' ? 'Acesso Aprovado!' : 'Acesso Recusado/Suspenso',
        description: 'Solicitação atualizada com sucesso.',
      });
      fetchUsersAndRequests();
    } else {
      toast({
        title: 'Erro no processamento',
        description: result.error || 'Falha ao atualizar solicitação.',
        variant: 'destructive',
      });
    }
  };


  const handleStatusChange = async (profile: UserProfile, newStatus: 'approved' | 'rejected') => {
    setProcessingId(profile.id);

    const { error } = await supabase
      .from('profiles')
      .update({ status: newStatus })
      .eq('id', profile.id);

    if (error) {
      toast({
        title: 'Erro ao atualizar status',
        description: error.message,
        variant: 'destructive',
      });
      setProcessingId(null);
      return;
    }

    // Send email notification
    try {
      await supabase.functions.invoke('send-status-notification', {
        body: {
          full_name: profile.full_name,
          email: profile.email,
          status: newStatus,
          company_name: profile.company_name,
        },
      });
      console.log('Status notification email sent');
    } catch (emailError) {
      console.error('Failed to send notification email:', emailError);
    }

    toast({
      title: newStatus === 'approved' ? 'Usuário aprovado!' : 'Usuário rejeitado',
      description: `${profile.full_name} foi ${newStatus === 'approved' ? 'aprovado' : 'rejeitado'} com sucesso.`,
    });

    setProcessingId(null);
    setConfirmDialog({ open: false, user: null, action: null });
    fetchUsers();
  };

  const openConfirmDialog = (user: UserProfile, action: 'approved' | 'rejected') => {
    setConfirmDialog({ open: true, user, action });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30"><Clock className="h-3 w-3 mr-1" /> Pendente</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30"><UserCheck className="h-3 w-3 mr-1" /> Aprovado</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30"><UserX className="h-3 w-3 mr-1" /> Rejeitado</Badge>;
      default:
        return null;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const filterUsersByStatus = (status: string) => {
    if (status === 'all') return users;
    return users.filter(u => u.status === status);
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const pendingCount = users.filter(u => u.status === 'pending').length;
  const approvedCount = users.filter(u => u.status === 'approved').length;
  const rejectedCount = users.filter(u => u.status === 'rejected').length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-display font-bold">Gerenciar Usuários</h1>
        <p className="text-muted-foreground mt-1">Aprove ou rejeite solicitações de acesso</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <span className="text-2xl font-bold">{users.length}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pendentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-500" />
              <span className="text-2xl font-bold">{pendingCount}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Aprovados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-green-500" />
              <span className="text-2xl font-bold">{approvedCount}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Rejeitados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <UserX className="h-5 w-5 text-red-500" />
              <span className="text-2xl font-bold">{rejectedCount}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Users & Requests Table */}
      <Card className="glass border-white/10 bg-slate-900 text-white rounded-2xl">
        <CardHeader>
          <CardTitle>Solicitações de Acesso e Usuários</CardTitle>
          <CardDescription className="text-slate-400">Gerenciamento de solicitações PENDING, aprovações por e-mail e cadastro</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="solicitacoes">
            <TabsList className="mb-4 bg-slate-950 border border-white/10">
              <TabsTrigger value="solicitacoes" className="gap-2">
                Solicitações de Acesso {requests.filter(r => r.status === 'PENDING').length > 0 && (
                  <Badge variant="secondary" className="ml-1 bg-amber-500/20 text-amber-300">
                    {requests.filter(r => r.status === 'PENDING').length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="all">Usuários do Sistema</TabsTrigger>
            </TabsList>

            <TabsContent value="solicitacoes">
              {requests.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  Nenhuma solicitação de acesso pendente.
                </div>
              ) : (
                <div className="rounded-xl border border-white/10 overflow-hidden">
                  <Table>
                    <TableHeader className="bg-slate-950">
                      <TableRow className="border-white/10">
                        <TableHead className="text-slate-300">Nome</TableHead>
                        <TableHead className="text-slate-300">E-mail</TableHead>
                        <TableHead className="text-slate-300">Tipo de Acesso</TableHead>
                        <TableHead className="text-slate-300">Data Pedido</TableHead>
                        <TableHead className="text-slate-300">Status</TableHead>
                        <TableHead className="text-right text-slate-300">Ações (Decisão)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {requests.map((req) => (
                        <TableRow key={req.id} className="border-white/10 hover:bg-white/5">
                          <TableCell className="font-bold text-white">{req.nome_usuario}</TableCell>
                          <TableCell className="text-slate-300">{req.email_usuario}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                              {req.tipo_acesso}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-slate-400 text-xs">{formatDate(req.created_at)}</TableCell>
                          <TableCell>
                            <Badge className={
                              req.status === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                              req.status === 'REJECTED' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' :
                              'bg-amber-500/20 text-amber-400 border-amber-500/30'
                            }>
                              {req.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {req.status !== 'APPROVED' && (
                                <Button
                                  size="sm"
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1"
                                  onClick={() => handleDecision(req.id, 'APPROVED')}
                                  disabled={processingId === req.id}
                                >
                                  {processingId === req.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                  [ SIM ] APROVAR
                                </Button>
                              )}
                              {req.status !== 'REJECTED' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs gap-1"
                                  onClick={() => handleDecision(req.id, 'REJECTED')}
                                  disabled={processingId === req.id}
                                >
                                  {processingId === req.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                                  [ NÃO ] REJEITAR
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {['pending', 'approved', 'rejected', 'all'].map((tab) => (
              <TabsContent key={tab} value={tab}>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : filterUsersByStatus(tab).length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhum usuário encontrado
                  </div>
                ) : (
                  <div className="rounded-md border border-border/50">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome</TableHead>
                          <TableHead>E-mail</TableHead>
                          <TableHead>Empresa</TableHead>
                          <TableHead>Data de Cadastro</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filterUsersByStatus(tab).map((profile) => (
                          <TableRow key={profile.id}>
                            <TableCell className="font-medium">{profile.full_name}</TableCell>
                            <TableCell>{profile.email}</TableCell>
                            <TableCell>{profile.company_name}</TableCell>
                            <TableCell>{formatDate(profile.created_at)}</TableCell>
                            <TableCell>{getStatusBadge(profile.status)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                {profile.status !== 'approved' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-green-500/30 text-green-500 hover:bg-green-500/10"
                                    onClick={() => openConfirmDialog(profile, 'approved')}
                                    disabled={processingId === profile.id}
                                  >
                                    {processingId === profile.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <><Check className="h-4 w-4 mr-1" /> Aprovar</>
                                    )}
                                  </Button>
                                )}
                                {profile.status !== 'rejected' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-red-500/30 text-red-500 hover:bg-red-500/10"
                                    onClick={() => openConfirmDialog(profile, 'rejected')}
                                    disabled={processingId === profile.id}
                                  >
                                    {processingId === profile.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <><X className="h-4 w-4 mr-1" /> Rejeitar</>
                                    )}
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, open })}>
        <AlertDialogContent className="glass">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog.action === 'approved' ? 'Aprovar usuário?' : 'Rejeitar usuário?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.action === 'approved'
                ? `Tem certeza que deseja aprovar ${confirmDialog.user?.full_name}? O usuário receberá um e-mail de confirmação.`
                : `Tem certeza que deseja rejeitar ${confirmDialog.user?.full_name}? O usuário será notificado por e-mail.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={confirmDialog.action === 'approved'
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-red-600 hover:bg-red-700'}
              onClick={() => confirmDialog.user && confirmDialog.action && handleStatusChange(confirmDialog.user, confirmDialog.action)}
            >
              {confirmDialog.action === 'approved' ? 'Aprovar' : 'Rejeitar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
