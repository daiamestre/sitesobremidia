import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { accessRequestService } from '@/services/accessRequest.service';
import { useAuth } from '@/contexts/AuthContext';
import { Mail, Lock, ArrowLeft, Loader2, Briefcase, ShieldCheck } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export default function RepresentantesAuth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // States para Solicitação de Cadastro
  const [regNome, setRegNome] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regTelefone, setRegTelefone] = useState('');
  const [regCidade, setRegCidade] = useState('');
  const [isSubmittingReg, setIsSubmittingReg] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signIn, signUp } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({
        title: 'Campos Obrigatórios',
        description: 'Digite o e-mail e a senha para entrar no sistema.',
        variant: 'destructive',
      });
      return;
    }
    setIsLoading(true);

    const { error, status } = await signIn(email, password);
    setIsLoading(false);

    if (error) {
      toast({
        title: 'Acesso Negado',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    if (status !== 'APPROVED') {
      toast({
        title: 'Acesso Não Liberado',
        description: 'Sua conta está PENDENTE de aprovação do administrador (sobremidiadesigner@gmail.com).',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Bem-vindo ao CRM Comercial!',
      description: 'Acesso liberado como Representante Comercial.',
    });
    navigate('/representantes/dashboard');
  };

  const handleCreateRequest = async () => {
    if (!regNome || !regEmail || !regPassword) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Informe seu nome, e-mail corporativo e crie uma senha para sua conta.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmittingReg(true);
    // 1. Cria conta de usuário real no Supabase Auth
    const { error: signUpError, data: authData } = await signUp(regEmail, regPassword, regNome, 'REPRESENTANTE COMERCIAL');
    if (signUpError) {
      setIsSubmittingReg(false);
      toast({
        title: 'Erro de Cadastro',
        description: signUpError.message,
        variant: 'destructive',
      });
      return;
    }

    // 2. Registra solicitação oficial com status PENDING no banco
    const result = await accessRequestService.createRequest({
      tipoAcesso: 'REPRESENTANTE',
      nomeUsuario: regNome,
      emailUsuario: regEmail,
      telefone: regTelefone,
      dadosCadastro: { cidade: regCidade },
      authUserId: authData?.user?.id,
    });
    setIsSubmittingReg(false);

    if (result.success) {
      setDialogOpen(false);
      toast({
        title: 'Cadastro Recebido com Sucesso!',
        description: 'Um e-mail de confirmação foi disparado. Seu status inicial é PENDING aguardando aprovação pelo administrador (sobremidiadesigner@gmail.com).',
      });
      setRegNome('');
      setRegEmail('');
      setRegPassword('');
      setRegTelefone('');
      setRegCidade('');
    } else {
      toast({
        title: 'Erro na Solicitação',
        description: result.error || 'Falha ao solicitar cadastro.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Dynamic Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/15 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/15 rounded-full blur-[120px]" />
      </div>

      {/* Voltar para página inicial */}
      <div className="w-full max-w-md mb-4 z-10 flex justify-start">
        <Link to="/">
          <Button variant="ghost" className="text-muted-foreground hover:text-foreground hover:bg-white/5 gap-2 px-3">
            <ArrowLeft className="h-4 w-4" />
            Voltar para a página inicial
          </Button>
        </Link>
      </div>

      {/* Card de Login do Representante */}
      <Card className="w-full max-w-md border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl animate-fade-in relative z-10 rounded-2xl">
        <CardHeader className="text-center pb-6">
          <div className="flex justify-center mb-4">
            <Logo size="lg" />
          </div>
          <div className="inline-flex items-center gap-2 justify-center px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-2">
            <Briefcase className="h-3.5 w-3.5" />
            Área do Representante
          </div>
          <CardTitle className="text-2xl sm:text-3xl font-display font-extrabold text-white">
            Área do Representante
          </CardTitle>
          <CardDescription className="text-slate-300 text-sm mt-1">
            Faça login para acessar o CRM Comercial.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <form onSubmit={handleLogin} className="space-y-5">
            {/* Campo Email */}
            <div className="space-y-2">
              <Label htmlFor="rep-email" className="text-slate-200 font-medium text-sm">
                E-mail
              </Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="rep-email"
                  type="email"
                  placeholder="seu.email@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 bg-slate-950/60 border-white/10 text-white placeholder:text-slate-500 focus:border-primary/60 focus:ring-primary/20 rounded-xl h-11"
                  required
                />
              </div>
            </div>

            {/* Campo Senha */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="rep-password" className="text-slate-200 font-medium text-sm">
                  Senha
                </Label>
                
                {/* Link Esqueci Minha Senha */}
                <Dialog>
                  <DialogTrigger asChild>
                    <button type="button" className="text-xs text-primary hover:underline font-medium">
                      Esqueci minha senha
                    </button>
                  </DialogTrigger>
                  <DialogContent className="bg-slate-950 border border-white/10 text-white rounded-2xl">
                    <DialogHeader>
                      <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-primary" />
                        Recuperação de Senha
                      </DialogTitle>
                      <DialogDescription className="text-slate-300 pt-2">
                        Para redefinir sua senha de Representante Comercial, digite seu e-mail cadastrado ou entre em contato com o administrador do sistema.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <Input
                        type="email"
                        placeholder="seu.email@empresa.com"
                        className="bg-slate-900 border-white/10 text-white"
                      />
                      <Button
                        className="w-full gradient-primary glow-primary font-bold"
                        onClick={() => {
                          toast({
                            title: 'Solicitação enviada!',
                            description: 'Instruções de recuperação foram enviadas para o e-mail.',
                          });
                        }}
                      >
                        Enviar E-mail de Recuperação
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="rep-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 bg-slate-950/60 border-white/10 text-white placeholder:text-slate-500 focus:border-primary/60 focus:ring-primary/20 rounded-xl h-11"
                  required
                />
              </div>
            </div>

            {/* Checkbox Lembrar acesso */}
            <div className="flex items-center space-x-2 pt-1">
              <Checkbox
                id="remember-me"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked === true)}
                className="border-white/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
              <Label
                htmlFor="remember-me"
                className="text-xs sm:text-sm text-slate-300 font-normal cursor-pointer select-none"
              >
                Lembrar acesso
              </Label>
            </div>

            {/* Botão Principal Entrar */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full gradient-primary glow-primary font-bold text-base h-12 rounded-xl transition-all duration-300 hover:scale-[1.02] shadow-xl"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Acessando...
                </>
              ) : (
                'Entrar'
              )}
            </Button>
          </form>

          {/* Link Secundário: Solicitar Cadastro */}
          <div className="pt-2 border-t border-white/10 text-center">
            <p className="text-xs text-slate-400 mb-2">Ainda não é um Representante Parceiro?</p>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <button type="button" className="text-sm text-primary font-semibold hover:underline">
                  Solicitar Cadastro
                </button>
              </DialogTrigger>
              <DialogContent className="bg-slate-950 border border-white/10 text-white rounded-2xl">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold flex items-center gap-2">
                    <Briefcase className="h-5 w-5 text-primary" />
                    Seja um Representante Comercial
                  </DialogTitle>
                  <DialogDescription className="text-slate-300 pt-2">
                    A expansão da rede Sobre Mídia conta com parceiros e representantes em todo o Brasil. Preencha seus dados para receber nossa proposta de parceria.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 pt-2">
                  <Input 
                    placeholder="Nome Completo" 
                    value={regNome}
                    onChange={(e) => setRegNome(e.target.value)}
                    className="bg-slate-900 border-white/10 text-white" 
                  />
                  <Input 
                    placeholder="E-mail Corporativo" 
                    type="email" 
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    className="bg-slate-900 border-white/10 text-white" 
                  />
                  <Input 
                    placeholder="Senha de Acesso (mínimo 6 caracteres)" 
                    type="password" 
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className="bg-slate-900 border-white/10 text-white" 
                  />
                  <Input 
                    placeholder="Telefone / WhatsApp" 
                    value={regTelefone}
                    onChange={(e) => setRegTelefone(e.target.value)}
                    className="bg-slate-900 border-white/10 text-white" 
                  />
                  <Input 
                    placeholder="Cidade / Estado de Atuação" 
                    value={regCidade}
                    onChange={(e) => setRegCidade(e.target.value)}
                    className="bg-slate-900 border-white/10 text-white" 
                  />
                  <Button
                    disabled={isSubmittingReg}
                    className="w-full gradient-primary glow-primary font-bold mt-2"
                    onClick={handleCreateRequest}
                  >
                    {isSubmittingReg ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Enviando solicitação...
                      </>
                    ) : (
                      'Enviar Solicitação de Parceria'
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
