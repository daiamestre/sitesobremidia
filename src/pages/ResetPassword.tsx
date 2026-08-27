import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Lock, AlertCircle, CheckCircle } from 'lucide-react';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [tokenValidated, setTokenValidated] = useState(false);
  const [tokenInvalid, setTokenInvalid] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const token = searchParams.get('token');
  const email = searchParams.get('email');

  useEffect(() => {
    if (!token || !email) {
      setTokenInvalid(true);
      return;
    }

    const validateToken = async () => {
      try {
        // [FIX 20261102] supabase-js v2 NÃO suporta `query` em invoke():
        // os parâmetros nunca chegavam à Edge Function (validação sempre
        // falhava). GET com query string explícita, como a função espera.
        const base = ((import.meta.env.VITE_SUPABASE_URL as string) || '').replace(/\/$/, '');
        const res = await fetch(
          `${base}/functions/v1/handle-password-reset?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`,
          {
            method: 'GET',
            headers: {
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string}`,
            },
          }
        );
        const data = await res.json().catch(() => null);

        if (!res.ok || !data?.ok || !data?.valid) {
          setTokenInvalid(true);
        } else {
          setTokenValidated(true);
        }
      } catch {
        setTokenInvalid(true);
      }
    };

    validateToken();
  }, [token, email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token || !email) {
      toast({
        title: 'Link inválido',
        description: 'Token ou e-mail ausentes. Solicite uma nova recuperação.',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: 'Senhas não coincidem',
        description: 'As duas senhas devem ser iguais.',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: 'Senha muito curta',
        description: 'A senha deve ter pelo menos 6 caracteres.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('handle-password-reset', {
        method: 'POST',
        body: { token, email: email.toLowerCase(), newPassword },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data?.ok) {
        throw new Error(data?.error || 'Erro ao redefinir senha');
      }

      toast({
        title: 'Senha alterada!',
        description: 'Sua senha foi redefinida com sucesso. Redirecionando para o login...',
      });

      setTimeout(() => navigate('/auth'), 3000);
    } catch (err: any) {
      toast({
        title: 'Erro ao redefinir senha',
        description: err.message || 'Tente novamente ou solicite um novo link.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (tokenInvalid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md glass animate-fade-in">
          <CardHeader className="text-center">
            <Logo className="justify-center mb-4" size="lg" />
            <CardTitle className="text-2xl font-display text-destructive">Link Inválido ou Expirado</CardTitle>
            <CardDescription className="text-muted-foreground">
              Este link de recuperação não é mais válido. Solicite um novo.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <Button onClick={() => navigate('/auth/forgot-password')} className="w-full">
              Solicitar novo link
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!tokenValidated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md glass animate-fade-in">
          <CardContent className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
          <CardTitle className="text-2xl font-display">Nova Senha</CardTitle>
          <CardDescription className="text-muted-foreground">
            Digite sua nova senha abaixo
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">Nova Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="new-password"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pl-10"
                  required
                  autoComplete="new-password"
                  minLength={6}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar Nova Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Digite novamente"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10"
                  required
                  autoComplete="new-password"
                />
              </div>
            </div>
            <Button type="submit" className="w-full gradient-primary" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Redefinindo...
                </>
              ) : (
                'Redefinir Senha'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}