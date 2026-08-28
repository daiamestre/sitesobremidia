import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { perfilService, HistoricoItem } from '@/services/perfil.service';
import { validarSenhaNova, forcaSenha } from '@/lib/passwordPolicy';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  UserCircle2, Mail, Phone, ShieldCheck, Lock, LogOut, Upload, Trash2, Eye, EyeOff,
  History, Smartphone, Bell, Building2, Users, Loader2, CheckCircle2, AlertTriangle, Save,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export type PerfilVariante = 'ANUNCIANTE' | 'REPRESENTANTE' | 'GESTOR' | 'OWNER' | 'ADMIN';

interface Props {
  variante: PerfilVariante;
  titulo?: string;
  subtitulo?: string;
}

export default function MeuPerfilBase({ variante, titulo, subtitulo }: Props) {
  const { usuario, user, refreshUserData, signOut } = useAuth();
  const navigate = useNavigate();

  const [nome, setNome] = useState(usuario?.nome || '');
  const [telefone, setTelefone] = useState(usuario?.telefone || '');
  const [emailNovo, setEmailNovo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [salvandoAvatar, setSalvandoAvatar] = useState(false);
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [sessaoInfo, setSessaoInfo] = useState<string>('');

  // senha
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [salvandoSenha, setSalvandoSenha] = useState(false);

  // email flow
  const [salvandoEmail, setSalvandoEmail] = useState(false);

  useEffect(() => {
    setNome(usuario?.nome || '');
    setTelefone(usuario?.telefone || '');
  }, [usuario]);

  useEffect(() => {
    if (usuario?.id) {
      perfilService.listarHistorico(usuario.id).then(setHistorico);
      perfilService.buscarSessoes().then(s => {
        if (s) setSessaoInfo(`${navigator.userAgent.slice(0,80)} • último acesso ${new Date().toLocaleString('pt-BR')}`);
        else setSessaoInfo(navigator.userAgent.slice(0,80));
      });
    }
  }, [usuario?.id]);

  const handleSalvar = async () => {
    if (!nome.trim() || nome.trim().length < 3) { toast.error('Nome completo é obrigatório (mín. 3).'); return; }
    if (!telefone.trim() || telefone.trim().length < 8) { toast.error('WhatsApp/telefone é obrigatório.'); return; }
    setSalvando(true);
    const r = await perfilService.atualizarPerfil({ nome: nome.trim(), telefone: telefone.trim() });
    setSalvando(false);
    if (r.error) { toast.error(r.error); return; }
    toast.success('Perfil atualizado!');
    await refreshUserData();
  };

  const handleAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setSalvandoAvatar(true);
    const r = await perfilService.uploadAvatar(f);
    setSalvandoAvatar(false);
    if (r.error) toast.error(r.error);
    else { toast.success('Foto atualizada!'); await refreshUserData(); }
    e.target.value = '';
  };

  const handleRemoverAvatar = async () => {
    setSalvandoAvatar(true);
    const r = await perfilService.removerAvatar();
    setSalvandoAvatar(false);
    if (r.error) toast.error(r.error);
    else { toast.success('Foto removida.'); await refreshUserData(); }
  };

  const handleTrocarSenha = async () => {
    const v = validarSenhaNova(novaSenha);
    if (!v.valida) { toast.error(v.motivo); return; }
    if (novaSenha !== confirmar) { toast.error('Confirmação não coincide.'); return; }
    setSalvandoSenha(true);
    const r = await perfilService.alterarSenha(senhaAtual, novaSenha);
    setSalvandoSenha(false);
    if (r.error) toast.error(r.error);
    else {
      toast.success('Senha alterada!');
      setSenhaAtual(''); setNovaSenha(''); setConfirmar('');
    }
  };

  const handleEmail = async () => {
    if (!emailNovo.trim()) { toast.error('Informe o novo e-mail.'); return; }
    setSalvandoEmail(true);
    const r = await perfilService.solicitarAlteracaoEmail(emailNovo.trim());
    setSalvandoEmail(false);
    if (r.error) toast.error(r.error);
    else { toast.success('Confirmação enviada para o novo e-mail. Verifique sua caixa de entrada.'); setEmailNovo(''); }
  };

  const handleEncerrarOutras = async () => {
    const r = await perfilService.encerrarOutrasSessoes();
    if (r.error) toast.error(r.error); else toast.success('Outras sessões encerradas.');
  };

  const forca = forcaSenha(novaSenha);
  const varianteLabel: Record<string,string> = {
    ANUNCIANTE: 'Anunciante', REPRESENTANTE: 'Representante', GESTOR: 'Gestor de Mídias', OWNER: 'Owner', ADMIN: 'Administrador'
  };

  // campos restritos por variante
  const showEmpresa = variante === 'ANUNCIANTE' || variante === 'OWNER' || variante === 'ADMIN';
  const showRepresentanteInfo = variante === 'REPRESENTANTE';
  const canEditEmpresa = false; // empresa é somente leitura para todos exceto fluxos especiais

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl">
        <h1 className="text-2xl font-bold flex items-center gap-2 text-white">
          <UserCircle2 className="h-6 w-6 text-primary" /> {titulo || 'Meu Perfil'}
        </h1>
        <p className="text-sm text-slate-400 mt-1">{subtitulo || `Área pessoal — ${varianteLabel[variante]}`}</p>
      </div>

      <Card className="border-white/10 bg-white/[0.03] overflow-hidden">
        <CardContent className="p-6 flex flex-col sm:flex-row gap-6 items-center">
          <div className="relative">
            <Avatar className="h-24 w-24 border-2 border-white/10">
              <AvatarImage src={usuario?.avatar_url || undefined} alt={usuario?.nome} />
              <AvatarFallback className="text-xl bg-gradient-to-br from-primary to-purple-600 text-white">{(usuario?.nome || 'U').charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            {salvandoAvatar && <Loader2 className="absolute inset-0 m-auto h-6 w-6 animate-spin text-white" />}
          </div>
          <div className="flex-1 text-center sm:text-left">
            <p className="text-lg font-bold text-white">{usuario?.nome}</p>
            <p className="text-sm text-slate-400 flex items-center justify-center sm:justify-start gap-2"><Mail className="h-3 w-3"/>{user?.email || usuario?.email} <Badge variant="outline" className="border-white/10 text-[10px]">{varianteLabel[variante]}</Badge></p>
            {usuario?.is_owner && <Badge className="mt-2 bg-amber-500/20 text-amber-300 border-amber-500/30">Owner — autonomia total</Badge>}
            <div className="flex gap-2 mt-3 justify-center sm:justify-start">
              <label className="inline-flex">
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleAvatar} disabled={salvandoAvatar} />
                <Button size="sm" variant="outline" className="gap-2" disabled={salvandoAvatar} asChild>
                  <span><Upload className="h-4 w-4"/> {usuario?.avatar_url ? 'Substituir' : 'Adicionar'} foto</span>
                </Button>
              </label>
              {usuario?.avatar_url && (
                <Button size="sm" variant="outline" className="gap-2 border-rose-500/30 text-rose-400" onClick={handleRemoverAvatar} disabled={salvandoAvatar}>
                  <Trash2 className="h-4 w-4"/> Remover
                </Button>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-2">JPG/PNG/WEBP/GIF • máx 5MB • associada somente ao seu usuário (RLS)</p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="dados" className="w-full">
        <TabsList className="bg-slate-900/50 border border-white/10 flex flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="dados" className="gap-2 data-[state=active]:bg-white/10"><UserCircle2 className="h-4 w-4"/> Informações pessoais</TabsTrigger>
          <TabsTrigger value="seguranca" className="gap-2 data-[state=active]:bg-white/10"><Lock className="h-4 w-4"/> Segurança</TabsTrigger>
          <TabsTrigger value="sessoes" className="gap-2 data-[state=active]:bg-white/10"><Smartphone className="h-4 w-4"/> Sessões</TabsTrigger>
          <TabsTrigger value="prefs" className="gap-2 data-[state=active]:bg-white/10"><Bell className="h-4 w-4"/> Preferências</TabsTrigger>
          <TabsTrigger value="historico" className="gap-2 data-[state=active]:bg-white/10"><History className="h-4 w-4"/> Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="dados" className="mt-4 space-y-4">
          <Card className="border-white/10 bg-white/[0.02]">
            <CardHeader><CardTitle className="flex items-center gap-2"><UserCircle2 className="h-5 w-5 text-sky-400"/> Dados de contato</CardTitle><CardDescription>Campos obrigatórios validados no frontend e no backend. Não é permitido alterar tenant, cliente ou permissões por aqui.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Nome completo *</Label>
                  <Input value={nome} onChange={e=>setNome(e.target.value)} placeholder="Seu nome" className="bg-slate-950 border-white/10" />
                </div>
                <div className="space-y-1.5">
                  <Label>E-mail (login) *</Label>
                  <Input value={user?.email || usuario?.email || ''} disabled className="bg-slate-900 border-white/10" />
                  <p className="text-[11px] text-slate-500">Para alterar, use o fluxo seguro abaixo em Segurança.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>WhatsApp / Telefone *</Label>
                  <Input value={telefone} onChange={e=>setTelefone(e.target.value)} placeholder="(11) 99999-9999" className="bg-slate-950 border-white/10" />
                </div>
                <div className="space-y-1.5">
                  <Label>Perfil / Função</Label>
                  <Input value={varianteLabel[variante]} disabled className="bg-slate-900 border-white/10" />
                </div>
                {showEmpresa && (
                  <div className="space-y-1.5">
                    <Label>Empresa operadora</Label>
                    <div className="flex items-center gap-2 text-sm text-slate-300 border border-white/10 rounded-md px-3 py-2 bg-slate-900">
                      <Building2 className="h-4 w-4 text-slate-500"/><span className="truncate">{usuario?.empresa_operadora_id || '—'}</span>
                      <Badge variant="outline" className="ml-auto border-white/10 text-[10px]">somente leitura</Badge>
                    </div>
                  </div>
                )}
                {showRepresentanteInfo && (
                  <div className="space-y-1.5">
                    <Label>CPF/CNPJ</Label>
                    <Input value={(usuario as any)?.cpf_cnpj || '—'} disabled className="bg-slate-900 border-white/10" />
                  </div>
                )}
                {variante==='ANUNCIANTE' && usuario?.cliente_id && (
                  <div className="space-y-1.5">
                    <Label>Cliente vinculado</Label>
                    <Input value={usuario.cliente_id} disabled className="bg-slate-900 border-white/10 font-mono text-xs" />
                  </div>
                )}
              </div>

              <Separator className="bg-white/10"/>

              <div className="flex items-center gap-3">
                <Button onClick={handleSalvar} disabled={salvando} className="gap-2">
                  {salvando ? <Loader2 className="h-4 w-4 animate-spin"/> : <Save className="h-4 w-4"/>} Salvar alterações
                </Button>
                {salvando && <span className="text-xs text-slate-400">salvando…</span>}
              </div>

              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 flex gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5"/>
                <p className="text-xs text-amber-200/80">Você não pode alterar tenant, cliente_id, role, empresa_operadora_id ou permissões. Campos estruturais são somente leitura e protegidos por RLS.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seguranca" className="mt-4 space-y-4">
          <Card className="border-white/10 bg-white/[0.02]">
            <CardHeader><CardTitle className="flex items-center gap-2"><Lock className="h-5 w-5 text-emerald-400"/> Alterar senha</CardTitle><CardDescription>Use a política oficial (mín. 6 caracteres). Reautenticação obrigatória.</CardDescription></CardHeader>
            <CardContent className="space-y-4 max-w-xl">
              <div className="space-y-1.5">
                <Label>Senha atual</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500"/>
                  <Input type={mostrar?'text':'password'} value={senhaAtual} onChange={e=>setSenhaAtual(e.target.value)} className="pl-10 pr-10 bg-slate-950 border-white/10" autoComplete="current-password"/>
                  <button type="button" onClick={()=>setMostrar(!mostrar)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">{mostrar?<EyeOff className="h-4 w-4"/>:<Eye className="h-4 w-4"/>}</button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Nova senha</Label>
                  <Input type={mostrar?'text':'password'} value={novaSenha} onChange={e=>setNovaSenha(e.target.value)} className="bg-slate-950 border-white/10" autoComplete="new-password"/>
                  {novaSenha && (
                    <div className="flex items-center gap-2 text-xs">
                      <div className={`h-1.5 flex-1 rounded ${forca.cor}`}/>
                      <span className="text-slate-500">{forca.rotulo}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Confirmar nova senha</Label>
                  <Input type={mostrar?'text':'password'} value={confirmar} onChange={e=>setConfirmar(e.target.value)} className="bg-slate-950 border-white/10" autoComplete="new-password"/>
                </div>
              </div>
              <Button onClick={handleTrocarSenha} disabled={salvandoSenha} className="gap-2">
                {salvandoSenha?<Loader2 className="h-4 w-4 animate-spin"/>:<ShieldCheck className="h-4 w-4"/>} Atualizar senha
              </Button>
              <p className="text-xs text-slate-500">Após a troca, sua sessão é renovada automaticamente.</p>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/[0.02]">
            <CardHeader><CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5 text-sky-400"/> Alterar e-mail (fluxo seguro)</CardTitle><CardDescription>Envia confirmação para o novo endereço. O login atual não quebra.</CardDescription></CardHeader>
            <CardContent className="space-y-3 max-w-xl">
              <div className="flex gap-2">
                <Input value={emailNovo} onChange={e=>setEmailNovo(e.target.value)} placeholder="novo@email.com" className="bg-slate-950 border-white/10"/>
                <Button onClick={handleEmail} disabled={salvandoEmail} className="gap-2">{salvandoEmail?<Loader2 className="h-4 w-4 animate-spin"/>:<Mail className="h-4 w-4"/>} Solicitar</Button>
              </div>
              <p className="text-xs text-slate-500">O e-mail de cadastro (usuarios.email) permanece íntegro até a confirmação via Supabase Auth.</p>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/[0.02]">
            <CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-400"/> Recuperação</CardTitle></CardHeader>
            <CardContent>
              <Button variant="outline" onClick={()=>navigate('/auth/forgot-password')}>Esqueci minha senha</Button>
              <p className="text-xs text-slate-500 mt-2">Usa o fluxo oficial de reset com autorização e sem misturar perfis.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessoes" className="mt-4 space-y-4">
          <Card className="border-white/10 bg-white/[0.02]">
            <CardHeader><CardTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5 text-purple-400"/> Sessões e dispositivos</CardTitle><CardDescription>Sessão atual e controle de acesso.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3 rounded-xl bg-slate-950/60 border border-white/10">
                <p className="text-sm font-medium text-white">Sessão atual</p>
                <p className="text-xs text-slate-400 break-all">{sessaoInfo || '—'}</p>
                <p className="text-xs text-slate-500 mt-1">Usuário: {user?.email} • Perfil: {varianteLabel[variante]}</p>
              </div>
              <Button variant="outline" className="gap-2" onClick={handleEncerrarOutras}><LogOut className="h-4 w-4"/> Encerrar outras sessões</Button>
              <p className="text-xs text-slate-500">Se o Supabase Auth suportar, encerra sessões em outros dispositivos.</p>
              <Separator className="bg-white/10"/>
              <div className="flex items-center gap-2 text-xs text-slate-400"><Users className="h-4 w-4"/> Último acesso registrado no histórico abaixo.</div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prefs" className="mt-4 space-y-4">
          <Card className="border-white/10 bg-white/[0.02]">
            <CardHeader><CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5 text-amber-400"/> Preferências & Notificações</CardTitle><CardDescription>Quando aplicável, suas preferências são salvas somente para sua conta.</CardDescription></CardHeader>
            <CardContent>
              <p className="text-sm text-slate-300">Notificações do sistema, avisos comerciais e alertas.</p>
              <p className="text-xs text-slate-500 mt-2">Infraestrutura: quando houver backend (profiles/preferences), esta seção persiste via RLS (apenas seu usuário). Atualmente exibe o canal central de comunicação.</p>
              <Button variant="outline" className="mt-3" onClick={()=>navigate(variante==='ANUNCIANTE'? '/portal/central' : variante==='REPRESENTANTE'? '/representantes/central' : variante==='GESTOR'? '/dashboard/central' : '/workspace/central')}>Abrir Central</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico" className="mt-4 space-y-4">
          <Card className="border-white/10 bg-white/[0.02]">
            <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-5 w-5 text-slate-400"/> Histórico de alterações</CardTitle><CardDescription>Últimas ações vinculadas à sua conta.</CardDescription></CardHeader>
            <CardContent>
              {historico.length===0 ? <p className="text-sm text-slate-500">Nenhum registro recente.</p> : (
                <div className="space-y-2">
                  {historico.map(h=>(
                    <div key={h.id} className="p-3 rounded-lg bg-slate-950/60 border border-white/10 flex justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">{h.acao}</p>
                        <p className="text-xs text-slate-500">{h.observacoes || '—'}</p>
                      </div>
                      <span className="text-xs text-slate-500 shrink-0">{new Date(h.created_at).toLocaleString('pt-BR')}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
