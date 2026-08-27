import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, ArrowLeft, ShieldCheck } from 'lucide-react';

/**
 * SOBRE MÍDIA — Esqueci minha senha (missão §8/§9)
 * NÃO redefine nada automaticamente: registra uma SOLICITAÇÃO DE SEGURANÇA
 * (PASSWORD_RESET_REQUEST) que aparece na Central de Comunicação para
 * Owner/Admin autorizar. Resposta anti-enumeração por design.
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast({
        title: 'E-mail obrigatório',
        description: 'Informe seu e-mail de login para solicitar a redefinição.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      // Fluxo com AUTORIZAÇÃO: cria solicitação PENDENTE + notifica Owner/Admin.
      const { error } = await supabase.rpc('solicitar_reset_senha', {
        p_email: email.trim(),
      });
      if (error) throw new Error(error.message);

      setEnviado(true);
    } catch (err: any) {
      toast({
        title: 'Erro ao registrar solicitação',
        description: err?.message || 'Tente novamente mais tarde.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
      </div>

      <Card className="w-full max-w-md glass animate-fade-in relative z-10">
        <CardHeader className="text-center">
          <Logo className="justify-center mb-4" size="lg" />
          <CardTitle className="text-2xl font-display">Recuperar Senha</CardTitle>
          <CardDescription className="text-muted-foreground">
            Informe seu e-mail de login para solicitar a redefinição
          </CardDescription>
        </CardHeader>
        <CardContent>
          {enviado ? (
            <div className="space-y-4 text-center py-2">
              <ShieldCheck className="h-12 w-12 text-emerald-500 mx-auto" />
              <div className="space-y-1">
                <p className="font-medium">Solicitação registrada!</p>
                <p className="text-sm text-muted-foreground">
                  Sua solicitação de redefinição foi enviada para análise do administrador.
                  Após a autorização, você receberá uma senha temporária.
                </p>
              </div>
              <Button variant="outline" onClick={() => navigate('/auth')} className="w-full">
                Voltar para o login
              </Button>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">E-mail</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="reset-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      required
                      autoComplete="email"
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full gradient-primary" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    'Solicitar redefinição de senha'
                  )}
                </Button>
              </form>
              <p className="mt-3 text-xs text-muted-foreground text-center">
                A redefinição passa por aprovação do administrador da sua empresa —
                nenhuma senha é alterada automaticamente.
              </p>
              <div className="mt-4 text-center">
                <button
                  onClick={() => navigate('/auth')}
                  className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Voltar para login
                </button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
