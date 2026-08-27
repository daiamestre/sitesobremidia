import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { accessRequestService } from '@/services/accessRequest.service';
import { resolverPortalSolicitado, podeAcessarPortal, rotuloPortal, type PortalEntrada } from '@/lib/portalAccess';
import { Loader2, Mail, Lock, User, Building, ShieldAlert } from 'lucide-react';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
});

const signUpSchema = z.object({
  fullName: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  companyName: z.string().min(2, 'Nome da empresa deve ter pelo menos 2 caracteres'),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
});

export default function Auth() {
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('login');
  
  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  // Sign up form
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  
  const { signIn, signUp, user, isApproved, profile, workspaceRoute, solicitacaoStatus, perfilNome } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const location = useLocation();

  // ============================================================
  // VALIDAÇÃO DA PORTA DE ENTRADA × RBAC REAL
  // ?role=/rota só declara QUAL portal se pretende entrar;
  // a autorização é o perfil REAL carregado do banco (signIn.role).
  // Sem redirecionamento silencioso: tela de negação explícita.
  // ============================================================
  const [portalNegado, setPortalNegado] = useState<{ portal: PortalEntrada; meuPortal: string } | null>(null);

  const validarPortalSolicitado = (roleParam: string | null | undefined, roleReal: string | null | undefined): boolean => {
    setPortalNegado(null);
    const portal = resolverPortalSolicitado(roleParam, location.pathname);
    if (!portal) return true; // porta sem portal declarado (corporativo genérico)
    if (podeAcessarPortal(portal, roleReal)) return true;
    setPortalNegado({ portal, meuPortal: workspaceRoute || '/dashboard' });
    return false;
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    if (tabParam === 'signup' || tabParam === 'register') {
      setActiveTab('signup');
    } else if (tabParam === 'login') {
      setActiveTab('login');
    }

    const redirect = params.get('redirect');
    const roleParam = params.get('role');

    if (user && isApproved) {
      // VALIDAÇÃO DA PORTA: portal solicitado × perfil REAL do banco
      if (!validarPortalSolicitado(roleParam, perfilNome)) return; // tela de negação
      const target = redirect || (roleParam === 'gestor' ? '/dashboard' : workspaceRoute) || '/dashboard';
      navigate(target, { replace: true });
    }
  }, [user, isApproved, navigate, location.search, location.pathname, workspaceRoute, perfilNome]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = loginSchema.safeParse({ email: loginEmail, password: loginPassword });
    if (!result.success) {
      toast({
        title: 'Erro de validação',
        description: result.error.errors[0].message,
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    const { error, role, routeRedirect } = await signIn(loginEmail, loginPassword);
    setIsLoading(false);

    if (error) {
      toast({
        title: 'Erro ao entrar',
        description: error.message === 'Invalid login credentials'
          ? 'E-mail ou senha incorretos'
          : error.message,
        variant: 'destructive',
      });
    } else {
      const params = new URLSearchParams(location.search);
      const redirect = params.get('redirect');
      const roleParam = params.get('role');

      // VALIDAÇÃO DA PORTA DE ENTRADA × PERFIL REAL (sem redirect silencioso)
      if (!validarPortalSolicitado(roleParam, role)) {
        setIsLoading(false);
        return;
      }

      const targetDestination = redirect || (roleParam === 'gestor' ? '/dashboard' : routeRedirect) || '/dashboard';
      navigate(targetDestination, { replace: true });
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = signUpSchema.safeParse({
      fullName,
      companyName,
      email: signUpEmail,
      password: signUpPassword,
    });
    
    if (!result.success) {
      toast({
        title: 'Erro de validação',
        description: result.error.errors[0].message,
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    const { error, data } = await signUp(signUpEmail, signUpPassword, fullName, companyName);
    
    if (error) {
      setIsLoading(false);
      const errorMessage = error.message.includes('already registered')
        ? 'Este e-mail já está cadastrado'
        : error.message;
      
      toast({
        title: 'Erro ao criar conta',
        description: errorMessage,
        variant: 'destructive',
      });
    } else {
      // FLUXO B — CADASTRO PÚBLICO:
      // 1. Supabase Auth cria a identidade (acima);
      // 2. Solicitação de acesso PENDING em solicitacoes_acesso;
      // 3. O trigger trg_solicitacao_acesso_notifica_owner envia ao OWNER:
      //    mensagem IN_APP na Central de Comunicação + e-mail via Communication Core.
      const roleParam = new URLSearchParams(location.search).get('role');
      const tipoAcesso = roleParam === 'anunciantes' ? 'ANUNCIANTE' : 'GESTOR_TELAS';
      let requestId: string | undefined;
      let rawToken: string | undefined;
      try {
        const result = await accessRequestService.createRequest({
          tipoAcesso,
          nomeUsuario: fullName,
          emailUsuario: signUpEmail,
          authUserId: data?.user?.id,
          dadosCadastro: { empresa: companyName },
        });
        requestId = result.requestId;
        rawToken = result.rawToken;
      } catch (reqError) {
        console.error('Falha ao registrar solicitação de acesso:', reqError);
      }

      // E-mail de confirmação ao USUÁRIO + auditoria (o aviso ao OWNER é
      // enviado pelo trigger oficial no banco — sem duplicação).
      if (requestId && rawToken) {
        try {
          await supabase.functions.invoke('send-approval-notification', {
            body: {
              request_id: requestId,
              raw_token: rawToken,
              nome_usuario: fullName,
              email_usuario: signUpEmail,
              tipo_acesso: tipoAcesso,
              empresa_nome: companyName,
            },
          });
        } catch (notificationError) {
          console.error('Falha ao enviar notificação de aprovação:', notificationError);
        }
      }
      
      setIsLoading(false);
      toast({
        title: 'Conta criada com sucesso!',
        description: 'Seu cadastro está AGUARDANDO APROVAÇÃO. O OWNER foi notificado na Central de Comunicação e por e-mail.',
      });
      setActiveTab('login');
    }
  };

  // Mostrar mensagem de negação de acesso se usuário existe mas não está aprovado
  if (user && !isApproved) {
    const statusMessage = 
      solicitacaoStatus === 'REJECTED' ? 'Seu cadastro não possui autorização para acesso.' :
      solicitacaoStatus === 'SUSPENDED' ? 'Seu acesso está temporariamente suspenso.' :
      'Seu cadastro está aguardando aprovação da administração.';

  // ============================================================
  // TELA DE NEGAÇÃO — portal solicitado não compatível com o perfil REAL
  // (sem redirecionamento silencioso; sem expor arquitetura interna)
  // ============================================================
  if (portalNegado) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md glass animate-fade-in border-red-500/20 bg-slate-900 text-white rounded-2xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 p-3 rounded-2xl bg-red-500/15 text-red-400 border border-red-500/25 w-fit">
              <ShieldAlert className="h-10 w-10" />
            </div>
            <CardTitle className="text-2xl font-display text-white">Acesso não autorizado</CardTitle>
            <CardDescription className="text-slate-300 pt-3 text-sm leading-relaxed">
              Este usuário não possui permissão para acessar o {rotuloPortal(portalNegado.portal)}.
              <br />
              Seu perfil atual não possui acesso a este portal.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={() => navigate(portalNegado.meuPortal, { replace: true })}
              className="w-full gradient-primary text-white font-bold"
            >
              Ir para meu portal
            </Button>
            <Button
              variant="outline"
              onClick={() => setPortalNegado(null)}
              className="w-full bg-slate-950 border-white/10 text-white hover:bg-slate-800"
            >
              Voltar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md glass animate-fade-in border-white/10 bg-slate-900 text-white rounded-2xl">
          <CardHeader className="text-center">
            <Logo className="justify-center mb-4" size="lg" />
            <CardTitle className="text-2xl font-display text-white">Acesso Não Liberado</CardTitle>
            <CardDescription className="text-slate-300 pt-2 text-sm font-medium">
              {statusMessage}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-slate-400 text-center">
              Administração notificada em <strong className="text-white">sobremidiadesigner@gmail.com</strong>.
            </p>
            <Button 
              onClick={() => {
                supabase.auth.signOut();
                navigate('/auth');
              }} 
              variant="outline" 
              className="w-full bg-slate-950 border-white/10 text-white hover:bg-slate-800"
            >
              Voltar / Entrar com outra conta
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
      </div>

      <Card className="w-full max-w-md glass animate-fade-in relative z-10">
        <CardHeader className="text-center">
          <Logo className="justify-center mb-4" size="lg" />
          <CardTitle className="text-2xl font-display">Bem-vindo</CardTitle>
          <CardDescription className="text-muted-foreground">
            Plataforma profissional de Digital Signage
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar Conta</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">E-mail</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => navigate('/auth/forgot-password')}
                    className="text-sm text-primary hover:underline"
                  >
                    Esqueci minha senha
                  </button>
                </div>
                <Button type="submit" className="w-full gradient-primary" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Entrando...
                    </>
                  ) : (
                    'Entrar'
                  )}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="full-name">Nome Completo</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="full-name"
                      type="text"
                      placeholder="Seu nome completo"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company-name">Nome da Empresa</Label>
                  <div className="relative">
                    <Building className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="company-name"
                      type="text"
                      placeholder="Nome da sua empresa"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">E-mail</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={signUpEmail}
                      onChange={(e) => setSignUpEmail(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="Mínimo 6 caracteres"
                      value={signUpPassword}
                      onChange={(e) => setSignUpPassword(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full gradient-primary" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Criando conta...
                    </>
                  ) : (
                    'Criar Conta'
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
