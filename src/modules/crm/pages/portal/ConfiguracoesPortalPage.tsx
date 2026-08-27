import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings, Loader2, Lock, Palette, ShieldCheck, Eye, EyeOff, UserCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

/**
 * SOBRE MÍDIA — Configurações do Portal do Anunciante
 * Perfil do usuário + segurança da conta (troca de senha própria).
 * Sem dados técnicos de dispositivo e sem financeiro global (missão §44).
 */
export default function ConfiguracoesPortalPage() {
  const { usuario, user } = useAuth();

  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [salvandoSenha, setSalvandoSenha] = useState(false);

  // Confirmação reautenticada da senha atual antes de trocar
  const trocarSenha = async () => {
    if (novaSenha.length < 8 || !/[a-z]/.test(novaSenha) || !/[A-Z]/.test(novaSenha) || !/\d/.test(novaSenha) || !/[^A-Za-z0-9]/.test(novaSenha)) {
      toast.error('A nova senha precisa ter 8+ caracteres com maiúscula, minúscula, número e símbolo.');
      return;
    }
    if (novaSenha !== confirmar) {
      toast.error('As senhas não coincidem.');
      return;
    }

    setSalvandoSenha(true);
    try {
      if (!user?.email) throw new Error('Sessão inválida.');

      // Reautenticação para operações sensíveis de conta
      const { error: reErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: senhaAtual,
      });
      if (reErr) throw new Error('Senha atual incorreta.');

      const { error: updErr } = await supabase.auth.updateUser({ password: novaSenha });
      if (updErr) throw new Error(updErr.message);

      toast.success('Senha atualizada com sucesso!');
      setSenhaAtual('');
      setNovaSenha('');
      setConfirmar('');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao atualizar senha.');
    } finally {
      setSalvandoSenha(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" /> Configurações
        </h1>
        <p className="text-sm text-slate-400 mt-1">Seu perfil e a segurança da sua conta.</p>
      </div>

      {/* Perfil */}
      <Card className="border-white/10 bg-white/[0.02]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserCircle2 className="h-5 w-5 text-sky-400" />
            Meu perfil
          </CardTitle>
          <CardDescription>Dados da sua conta de acesso.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-slate-500">Nome</Label>
              <p className="text-sm font-medium">{usuario?.nome}</p>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Login</Label>
              <p className="text-sm font-medium">{usuario?.email}</p>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Perfil</Label>
              <p className="text-sm"><Badge variant="outline" className="border-white/10">{usuario?.perfil?.nome ?? '—'}</Badge></p>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Telefone</Label>
              <p className="text-sm">{usuario?.telefone || '—'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Segurança */}
      <Card className="border-white/10 bg-white/[0.02]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lock className="h-5 w-5 text-emerald-400" />
            Segurança — alterar senha
          </CardTitle>
          <CardDescription>
            Use uma senha forte e exclusiva. Recomendamos trocá-la periodicamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 max-w-md">
            <div className="space-y-1.5">
              <Label>Senha atual</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type={mostrar ? 'text' : 'password'}
                  value={senhaAtual}
                  onChange={(e) => setSenhaAtual(e.target.value)}
                  className="pl-10 pr-10"
                  autoComplete="current-password"
                />
                <button type="button" onClick={() => setMostrar(!mostrar)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label="Mostrar/ocultar">
                  {mostrar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nova senha</Label>
                <Input type={mostrar ? 'text' : 'password'} value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} autoComplete="new-password" />
              </div>
              <div className="space-y-1.5">
                <Label>Confirmar nova senha</Label>
                <Input type={mostrar ? 'text' : 'password'} value={confirmar} onChange={(e) => setConfirmar(e.target.value)} autoComplete="new-password" />
              </div>
            </div>
            <Button onClick={trocarSenha} disabled={salvandoSenha}>
              {salvandoSenha ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
              Atualizar senha
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Identidade visual */}
      <Card className="border-white/10 bg-white/[0.02]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Palette className="h-5 w-5 text-purple-400" />
            Identidade visual
          </CardTitle>
          <CardDescription>Logo, cores e fontes usadas nos seus criativos.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link to="/portal/brand-kit">
            <Button variant="outline">Abrir Brand Kit</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
