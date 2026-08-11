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
import { Loader2, Mail, Lock, User, Building } from 'lucide-react';
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
  
  const { signIn, signUp, user, isApproved, profile, workspaceRoute, solicitacaoStatus } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    if (tabParam === 'signup' || tabParam === 'register') {
      setActiveTab('signup');
    } else if (tabParam === 'login') {
      setActiveTab('login');
    }

    const redirect = params.get('redirect');

    if (user && isApproved) {
      // Redireciona para o workspace correspondente se não houver parametro de redirecionamento explicito
      navigate(redirect || workspaceRoute || '/dashboard', { replace: true });
    }
  }, [user, isApproved, navigate, location.search, workspaceRoute]);

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
    const { error, routeRedirect } = await signIn(loginEmail, loginPassword);
    setIsLoading(false);

    if (error) {
      toast({
        title: 'Erro ao entrar',
        description: error.message === 'Invalid login credentials' 
          ? 'E-mail ou senha incorretos' 
          : error.message,
        variant: 'destructive',
      });
    } else if (routeRedirect) {
      navigate(routeRedirect, { replace: true });
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
      // Registra solicitação de acesso de Gestor de Telas
      try {
        await accessRequestService.createRequest({
          tipoAcesso: 'GESTOR_TELAS',
          nomeUsuario: fullName,
          emailUsuario: signUpEmail,
          authUserId: data?.user?.id,
          dadosCadastro: { empresa: companyName },
        });
      } catch (reqError) {
        console.error('Falha ao registrar solicitação de acesso:', reqError);
      }
      
      setIsLoading(false);
      toast({
        title: 'Conta criada com sucesso!',
        description: 'Seu cadastro ficou PENDENTE de aprovação. O administrador (sobremidiadesigner@gmail.com) recebeu um e-mail para autorização.',
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
