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
  History, Smartphone, Bell, Building2, Users, Loader2, CheckCircle2, AlertTriangle, Save, Pencil, X, Clock,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export type PerfilVariante = 'ANUNCIANTE' | 'REPRESENTANTE' | 'GESTOR' | 'OWNER' | 'ADMIN';

interface Props {
  variante: PerfilVariante;
  titulo?: string;
  subtitulo?: string;
}

export default function MeuPerfilBase({ variante, titulo, subtitulo }: Props) {
  const { usuario, user, refreshUserData, signOut, isOwner, perfilNome } = useAuth();
  const navigate = useNavigate();

  const [nome, setNome] = useState(usuario?.nome || '');
  const [telefone, setTelefone] = useState(usuario?.telefone || '');
  const [emailNovo, setEmailNovo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [salvandoAvatar, setSalvandoAvatar] = useState(false);
  const [salvandoCapa, setSalvandoCapa] = useState(false);
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [sessaoInfo, setSessaoInfo] = useState<string>('');

  // senha
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [salvandoSenha, setSalvandoSenha] = useState(false);

  // email flow (F-169: pedido com autorização do Owner/ADM)
  const [salvandoEmail, setSalvandoEmail] = useState(false);
  const [emailPendente, setEmailPendente] = useState<{ id: string; novo_email: string | null; criado_em: string } | null>(null);

  // F-169: nome no topo do perfil (aparece nas boas-vindas) e nome do estabelecimento (anunciante)
  const [editandoNome, setEditandoNome] = useState(false);
  const [nomeTopo, setNomeTopo] = useState('');
  const [estabelecimento, setEstabelecimento] = useState('');
  const [estabelecimentoOriginal, setEstabelecimentoOriginal] = useState('');
  const [salvandoEstab, setSalvandoEstab] = useState(false);
  const [empresaOperadoraNome, setEmpresaOperadoraNome] = useState('');

  useEffect(() => {
    setNome(usuario?.nome || '');
    setTelefone(usuario?.telefone || '');
  }, [usuario]);

  const temEstabelecimento = !!usuario?.cliente_id && (variante === 'ANUNCIANTE');
  useEffect(() => {
    if (!temEstabelecimento || !usuario?.cliente_id) return;
    supabase.from('empresas').select('nome_fantasia, razao_social').eq('cliente_id', usuario.cliente_id).limit(1)
      .then(({ data }) => {
        const e = (Array.isArray(data) ? data[0] : null) as { nome_fantasia?: string | null; razao_social?: string | null } | null;
        const n = (e?.nome_fantasia || e?.razao_social || '').trim();
        setEstabelecimento(n); setEstabelecimentoOriginal(n);
      });
  }, [temEstabelecimento, usuario?.cliente_id]);

  // F-170: mostra o NOME da empresa operadora, nunca o código interno
  useEffect(() => {
    if (!usuario?.empresa_operadora_id) return;
    supabase.from('empresa_operadora').select('nome, nome_fantasia').eq('id', usuario.empresa_operadora_id).limit(1)
      .then(({ data }) => {
        const e = (Array.isArray(data) ? data[0] : null) as { nome?: string | null; nome_fantasia?: string | null } | null;
        setEmpresaOperadoraNome((e?.nome_fantasia || e?.nome || '').trim());
      });
  }, [usuario?.empresa_operadora_id]);

  useEffect(() => {
    if (usuario?.id) perfilService.trocaEmailPendente().then(setEmailPendente);
  }, [usuario?.id]);

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
    if (telefone.trim() && telefone.replace(/\D/g, '').length < 8) { toast.error('Telefone incompleto: informe com DDD ou deixe em branco.'); return; }
    setSalvando(true);
    const r = await perfilService.atualizarPerfil({ nome: nome.trim(), telefone: telefone.trim() });
    setSalvando(false);
    if (r.error) { toast.error(r.error); return; }
    toast.success('Perfil atualizado!');
    await refreshUserData();
  };

  // nome no topo do perfil (mesmo salvamento do formulário)
  const abrirEdicaoDoNome = () => { setNomeTopo(usuario?.nome || ''); setEditandoNome(true); };
  const salvarNomeDoTopo = async () => {
    if (nomeTopo.trim().length < 3) { toast.error('Informe o nome (mínimo 3 letras).'); return; }
    setSalvando(true);
    const r = await perfilService.atualizarPerfil({ nome: nomeTopo.trim(), telefone: telefone.trim() || null });
    setSalvando(false);
    if (r.error) { toast.error(r.error); return; }
    toast.success('Nome atualizado!');
    setEditandoNome(false);
    await refreshUserData();
  };

  const salvarEstabelecimento = async () => {
    setSalvandoEstab(true);
    const r = await perfilService.atualizarNomeEstabelecimento(estabelecimento);
    setSalvandoEstab(false);
    if (r.error) { toast.error(r.error); return; }
    setEstabelecimentoOriginal(estabelecimento.trim());
    toast.success('Nome do estabelecimento atualizado!');
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

  // F-134: capa do perfil (dono e administrador)
  const handleCapa = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setSalvandoCapa(true);
    const r = await perfilService.uploadCapa(f);
    setSalvandoCapa(false);
    if (r.error) toast.error(r.error);
    else { toast.success('Capa atualizada!'); await refreshUserData(); }
    e.target.value = '';
  };

  const handleRemoverCapa = async () => {
    setSalvandoCapa(true);
    const r = await perfilService.removerCapa();
    setSalvandoCapa(false);
    if (r.error) toast.error(r.error);
    else { toast.success('Capa removida.'); await refreshUserData(); }
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
    const r = await perfilService.solicitarTrocaEmail(emailNovo.trim());
    setSalvandoEmail(false);
    if (r.error) { toast.error(r.error); return; }
    toast.success('Pedido enviado ao Owner/ADM. Você será avisado quando for decidido.');
    setEmailNovo('');
    setEmailPendente(await perfilService.trocaEmailPendente());
  };

  const handleCancelarEmail = async () => {
    const r = await perfilService.cancelarTrocaEmail();
    if (r.error) { toast.error(r.error); return; }
    setEmailPendente(null);
    toast.success('Pedido de troca de e-mail cancelado.');
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
  // F-134: foto de capa para dono e administrador. F-144: também para o gestor de mídias (é a mesma capa de "Minha Marca").
  const temCapa = !!usuario?.is_owner || isOwner || perfilNome === 'OWNER' || perfilNome === 'ADMIN' || perfilNome === 'GESTOR' || variante === 'OWNER' || variante === 'ADMIN' || variante === 'GESTOR';
  const capa = temCapa ? usuario?.capa_url || null : null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl">
        <h1 className="text-2xl font-bold flex items-center gap-2 text-white">
          <UserCircle2 className="h-6 w-6 text-primary" /> {titulo || 'Meu Perfil'}
        </h1>
        <p className="text-sm text-slate-400 mt-1">{subtitulo || `Área pessoal — ${varianteLabel[variante]}`}</p>
      </div>

      <Card className="border-white/10 bg-white/[0.03] overflow-hidden">
        {temCapa && (
          <div className="relative h-36 w-full sm:h-48 md:h-56" data-testid="capa-perfil">
            {capa
              ? <img src={capa} alt="Capa do perfil" className="h-full w-full object-cover" />
              : <div className="h-full w-full bg-gradient-to-r from-primary/40 via-purple-700/40 to-slate-900" aria-hidden="true" />}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" aria-hidden="true" />
            {salvandoCapa && <Loader2 className="absolute inset-0 m-auto h-7 w-7 animate-spin text-white" />}
            <div className="absolute right-3 top-3 flex gap-2">
              <label className="inline-flex">
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleCapa} disabled={salvandoCapa} data-testid="input-capa" />
                <Button size="sm" variant="secondary" className="gap-2 bg-slate-950/70 text-white hover:bg-slate-950/90" disabled={salvandoCapa} asChild>
                  <span><Upload className="h-4 w-4" /> {capa ? 'Trocar capa' : 'Adicionar capa'}</span>
                </Button>
              </label>
              {capa && (
                <Button size="sm" variant="secondary" className="gap-2 bg-slate-950/70 text-rose-300 hover:bg-slate-950/90" onClick={handleRemoverCapa} disabled={salvandoCapa} aria-label="Remover capa" data-testid="remover-capa">
                  <Trash2 className="h-4 w-4" /> <span className="hidden sm:inline">Remover</span>
                </Button>
              )}
            </div>
          </div>
        )}
        <CardContent className={`p-6 flex flex-col sm:flex-row gap-6 items-center ${temCapa ? 'sm:items-end' : ''}`}>
          <div className={`relative ${temCapa ? '-mt-16 sm:-mt-20' : ''}`}>
            <Avatar className={`border-white/10 ${temCapa ? 'h-28 w-28 border-4 border-slate-950 shadow-xl sm:h-32 sm:w-32' : 'h-24 w-24 border-2'}`}>
              <AvatarImage src={usuario?.avatar_url || undefined} alt={usuario?.nome} />
              <AvatarFallback className="text-xl bg-gradient-to-br from-primary to-purple-600 text-white">{(usuario?.nome || 'U').charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            {salvandoAvatar && <Loader2 className="absolute inset-0 m-auto h-6 w-6 animate-spin text-white" />}
          </div>
          <div className="flex-1 text-center sm:text-left">
            {editandoNome ? (
              <div className="flex flex-col sm:flex-row items-center gap-2 justify-center sm:justify-start" data-testid="editor-nome-topo">
                <Input value={nomeTopo} onChange={(e) => setNomeTopo(e.target.value)} maxLength={120} autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') salvarNomeDoTopo(); if (e.key === 'Escape') setEditandoNome(false); }}
                  placeholder="Como você quer ser chamado" className="bg-slate-950 border-white/10 max-w-xs" data-testid="nome-topo" />
                <div className="flex gap-2">
                  <Button size="sm" onClick={salvarNomeDoTopo} disabled={salvando} className="gap-1" data-testid="salvar-nome-topo">
                    {salvando ? <Loader2 className="h-4 w-4 animate-spin"/> : <Save className="h-4 w-4"/>} Salvar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditandoNome(false)} className="gap-1"><X className="h-4 w-4"/> Cancelar</Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <p className="text-lg font-bold text-white" data-testid="nome-no-topo">{usuario?.nome}</p>
                <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-slate-300" onClick={abrirEdicaoDoNome} data-testid="alterar-nome-topo" aria-label="Alterar nome">
                  <Pencil className="h-3.5 w-3.5"/> Alterar nome
                </Button>
              </div>
            )}
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
            <p className="text-[11px] text-slate-500 mt-2">
              O nome acima aparece nas mensagens de boas-vindas. Foto: JPG, PNG, WEBP ou GIF, até 5 MB — aparece no círculo do cabeçalho.
              {temCapa && ' Capa: JPG, PNG ou WEBP, até 8 MB (ideal 1600×400) — aparece só aqui no perfil.'}
            </p>
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
            <CardHeader><CardTitle className="flex items-center gap-2"><UserCircle2 className="h-5 w-5 text-sky-400"/> Dados de contato</CardTitle><CardDescription>Você pode mudar seu nome e telefone. O e-mail muda com autorização do Owner/ADM. A função não pode ser alterada.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Nome completo *</Label>
                  <Input value={nome} onChange={e=>setNome(e.target.value)} placeholder="Seu nome" className="bg-slate-950 border-white/10" />
                </div>
                <div className="space-y-1.5">
                  <Label>E-mail (login) *</Label>
                  <Input value={user?.email || usuario?.email || ''} disabled className="bg-slate-900 border-white/10" />
                  <p className="text-[11px] text-slate-500">Para trocar, peça a autorização logo abaixo.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>WhatsApp / Telefone <span className="text-slate-500 font-normal">(opcional)</span></Label>
                  <Input value={telefone} onChange={e=>setTelefone(e.target.value)} placeholder="(11) 99999-9999" className="bg-slate-950 border-white/10" />
                </div>
                <div className="space-y-1.5">
                  <Label>Perfil / Função</Label>
                  <Input value={varianteLabel[variante]} disabled className="bg-slate-900 border-white/10" />
                </div>
                {temEstabelecimento && (
                  <div className="space-y-1.5 md:col-span-2" data-testid="campo-estabelecimento">
                    <Label>Nome do estabelecimento (aparece nas boas-vindas do portal)</Label>
                    <div className="flex gap-2">
                      <Input value={estabelecimento} onChange={(e) => setEstabelecimento(e.target.value)} maxLength={120} placeholder="Nome do seu estabelecimento" className="bg-slate-950 border-white/10" data-testid="nome-estabelecimento" />
                      <Button variant="outline" onClick={salvarEstabelecimento} disabled={salvandoEstab || estabelecimento.trim().length < 2 || estabelecimento.trim() === estabelecimentoOriginal} className="gap-2" data-testid="salvar-estabelecimento">
                        {salvandoEstab ? <Loader2 className="h-4 w-4 animate-spin"/> : <Save className="h-4 w-4"/>} Salvar nome
                      </Button>
                    </div>
                  </div>
                )}
                {showEmpresa && (
                  <div className="space-y-1.5">
                    <Label>Empresa operadora</Label>
                    <div className="flex items-center gap-2 text-sm text-slate-300 border border-white/10 rounded-md px-3 py-2 bg-slate-900">
                      <Building2 className="h-4 w-4 text-slate-500"/><span className="truncate" data-testid="empresa-operadora-nome">{empresaOperadoraNome || '—'}</span>
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
                <p className="text-xs text-amber-200/80">Sua função (perfil) e as permissões da conta não podem ser alteradas por aqui.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/[0.02]" data-testid="troca-de-email">
            <CardHeader><CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5 text-sky-400"/> Trocar e-mail (precisa de autorização)</CardTitle><CardDescription>Seu e-mail é obrigatório. Para trocar, o Owner/ADM recebem o pedido na Central e decidem. Enquanto isso o e-mail atual continua valendo.</CardDescription></CardHeader>
            <CardContent className="space-y-3 max-w-xl">
              {emailPendente ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2" data-testid="troca-email-pendente">
                  <p className="text-sm text-amber-200 flex items-center gap-2"><Clock className="h-4 w-4"/> Aguardando autorização do Owner/ADM</p>
                  <p className="text-xs text-slate-300">Novo e-mail pedido: <strong>{emailPendente.novo_email || '—'}</strong> · {new Date(emailPendente.criado_em).toLocaleString('pt-BR')}</p>
                  <Button size="sm" variant="outline" onClick={handleCancelarEmail} data-testid="cancelar-troca-email">Cancelar pedido</Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input value={emailNovo} onChange={e=>setEmailNovo(e.target.value)} placeholder="novo@email.com" type="email" className="bg-slate-950 border-white/10" data-testid="novo-email"/>
                  <Button onClick={handleEmail} disabled={salvandoEmail || !emailNovo.trim()} className="gap-2" data-testid="pedir-troca-email">{salvandoEmail?<Loader2 className="h-4 w-4 animate-spin"/>:<Mail className="h-4 w-4"/>} Pedir autorização</Button>
                </div>
              )}
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
                  <Input type={mostrar?'text':'password'} value={senhaAtual} onChange={e=>setSenhaAtual(e.target.value)} className="pl-10 pr-10 bg-slate-950 border-white/10" autoComplete="current-password" autoCapitalize="none" autoCorrect="off" spellCheck={false}/>
                  <button type="button" onClick={()=>setMostrar(!mostrar)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">{mostrar?<EyeOff className="h-4 w-4"/>:<Eye className="h-4 w-4"/>}</button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Nova senha</Label>
                  <Input type={mostrar?'text':'password'} value={novaSenha} onChange={e=>setNovaSenha(e.target.value)} className="bg-slate-950 border-white/10" autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck={false}/>
                  {novaSenha && (
                    <div className="flex items-center gap-2 text-xs">
                      <div className={`h-1.5 flex-1 rounded ${forca.cor}`}/>
                      <span className="text-slate-500">{forca.rotulo}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Confirmar nova senha</Label>
                  <Input type={mostrar?'text':'password'} value={confirmar} onChange={e=>setConfirmar(e.target.value)} className="bg-slate-950 border-white/10" autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck={false}/>
                </div>
              </div>
              <Button onClick={handleTrocarSenha} disabled={salvandoSenha} className="gap-2">
                {salvandoSenha?<Loader2 className="h-4 w-4 animate-spin"/>:<ShieldCheck className="h-4 w-4"/>} Atualizar senha
              </Button>
              <p className="text-xs text-slate-500">Após a troca, sua sessão é renovada automaticamente.</p>
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
