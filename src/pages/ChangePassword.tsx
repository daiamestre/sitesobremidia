import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { MIN_SENHA, validarSenhaNova, forcaSenha } from '@/lib/passwordPolicy';
import { Loader2, Lock, ShieldCheck, Eye, EyeOff, CheckCircle2 } from 'lucide-react';

/**
 * SOBRE MÍDIA — Troca Obrigatória de Senha (primeiro acesso)
 *
 * BUG P0 corrigido:
 *  - VALIDADE (mínimo 6 caracteres — contrato idêntico ao Supabase Auth)
 *    é separada da FORÇA (apenas informativa). A barra nunca bloqueia.
 *  - Erros reais do GoTrue são exibidos ao usuário.
 *  - Ordem garantida: UPDATE AUTH OK → limpar flag → refresh estado → portal.
 *  - Sessão preservada (sem logout); re-login NÃO volta a exigir troca.
 */
export default function ChangePassword() {
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAuthenticated, loading, usuario, workspaceRoute, refreshUserData } = useAuth();

  // Sem sessão → login. Com sessão normal (sem flag) → destino do perfil.
  useEffect(() => {
    if (!loading && !isAuthenticated) navigate('/auth', { replace: true });
  }, [loading, isAuthenticated, navigate]);

  useEffect(() => {
    if (!loading && isAuthenticated && usuario && !usuario.must_change_password && !concluido) {
      navigate(workspaceRoute || '/auth', { replace: true });
    }
  }, [loading, isAuthenticated, usuario, workspaceRoute, navigate, concluido]);

  const validacao = validarSenhaNova(novaSenha);
  const senhaValida = validacao.valida;
  const senhasCoincidem = novaSenha === confirmar;
  const podeEnviar = senhaValida && senhasCoincidem && !isLoading && !concluido;

  // Força INFORMATIVA — nunca bloqueia
  const forca = forcaSenha(novaSenha);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!senhaValida) {
      toast({ title: 'Senha inválida', description: validacao.motivo, variant: 'destructive' });
      return;
    }
    if (!senhasCoincidem) {
      toast({ title: 'As senhas não coincidem.', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      // 1. Troca REAL da credencial no Supabase Auth (mecanismo oficial,
      //    usuário já autenticado; sessão permanece válida)
      const { error: updErr } = await supabase.auth.updateUser({ password: novaSenha });
      if (updErr) {
        console.error('[ChangePassword] updateUser falhou:', {
          code: updErr.name || 'GoTrueError',
          message: updErr.message,
          contexto: 'primeiro_acesso',
        });
        throw new Error(
          updErr.message ||
            'Não foi possível atualizar sua senha. Verifique os requisitos ou tente novamente.',
        );
      }

      // 2. SOMENTE APÓS sucesso no Auth: desliga a obrigatoriedade
      //    no registro corporativo (RPC server-side, sem senha envolvida)
      const { error: rpcErr } = await supabase.rpc('concluir_troca_senha_obrigatoria');
      if (rpcErr) {
        console.error('[ChangePassword] RPC concluir_troca_senha_obrigatoria:', rpcErr.message);
        // Não bloqueia o usuário: o flag será reavaliado no próximo fetch;
        // mas registramos para auditoria.
      }

      // 3. Atualiza o estado global ANTES de navegar (elimina corrida com
      //    o guard RequireApproval e garante que re-login não pedirá troca)
      await refreshUserData();

      setConcluido(true);
      toast({
        title: 'Senha definida com sucesso',
        description: 'Sua senha inicial foi invalidada. Bem-vindo(a)!',
      });

      navigate(workspaceRoute || '/portal', { replace: true });
    } catch (err: any) {
      toast({
        title: 'Não foi possível atualizar sua senha',
        description: err?.message || 'Verifique os requisitos ou tente novamente.',
        variant: 'destructive',
      });
      // Botão volta a ficar disponível para nova tentativa
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
      </div>

      <Card className="w-full max-w-md glass animate-fade-in relative z-10 border-white/10 bg-slate-900/80 text-slate-100">
        <CardHeader className="text-center">
          <Logo className="justify-center mb-4" size="lg" />
          <CardTitle className="text-2xl font-display flex items-center justify-center gap-2">
            <ShieldCheck className="h-6 w-6 text-emerald-400" />
            Defina sua nova senha
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Por segurança, troque a senha inicial antes de continuar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="nova-senha">Nova senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="nova-senha"
                  type={mostrar ? 'text' : 'password'}
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  className="pl-10 pr-10"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setMostrar(!mostrar)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={mostrar ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {mostrar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* FORÇA — apenas informativa */}
              <div className="flex gap-1 mt-2" aria-hidden>
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    data-testid={`forca-barra-${i}`}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      forca.score >= i ? forca.cor : 'bg-white/10'
                    }`}
                  />
                ))}
              </div>
              {novaSenha.length > 0 && (
                <p className="text-xs" data-testid="forca-rotulo">
                  Força: <span className="font-medium">{forca.rotulo}</span>
                  {senhaValida && (
                    <span className="text-emerald-400 inline-flex items-center gap-1 ml-2">
                      <CheckCircle2 className="h-3 w-3" /> Senha válida
                    </span>
                  )}
                </p>
              )}
              {!senhaValida && novaSenha.length > 0 && validacao.motivo && (
                <p className="text-xs text-amber-400">{validacao.motivo}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Mínimo de {MIN_SENHA} caracteres. Letras, números e símbolos são aceitos livremente.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmar-senha">Confirmar nova senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmar-senha"
                  type={mostrar ? 'text' : 'password'}
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                  className="pl-10"
                  autoComplete="new-password"
                  required
                />
              </div>
              {confirmar.length > 0 && !senhasCoincidem && (
                <p className="text-xs text-rose-400">As senhas não coincidem.</p>
              )}
            </div>

            <Button
              type="submit"
              disabled={!podeEnviar}
              data-testid="btn-definir-senha"
              className="w-full gradient-primary"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Definir nova senha'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
