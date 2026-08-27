import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Users, Plus, Loader2, KeyRound, Copy, ShieldCheck, Mail,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { corporateUsersService, type PerfilCorporativo } from '@/services/corporateUsers.service';

interface MembroEquipe {
  usuario_id: string;
  nome: string;
  email: string;
  telefone?: string | null;
  ativo: boolean;
  perfil: string;
  status?: string | null;
  must_change_password?: boolean;
  created_at?: string;
}

/**
 * SOBRE MÍDIA — Minha Equipe (missão §39)
 * O anunciante administra usuários adicionais da PRÓPRIA empresa:
 * provisionamento com senha automática (gerada no backend), perfis
 * CLIENTE/ANUNCIANTE e escopo fixado no cliente do chamador.
 * Credenciais nunca são compartilhadas.
 */
export default function MinhaEquipePage() {
  const qc = useQueryClient();
  const { usuario } = useAuth();

  const [dialogConvidar, setDialogConvidar] = useState(false);
  const [form, setForm] = useState({ nome: '', email: '', telefone: '', perfilId: '' });
  const [enviando, setEnviando] = useState(false);
  const [credencial, setCredencial] = useState<{ email: string; senha: string } | null>(null);

  const { data: equipe = [], isLoading } = useQuery({
    queryKey: ['minha-equipe'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('listar_equipe_cliente');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as MembroEquipe[];
    },
  });

  const { data: perfis = [] } = useQuery({
    queryKey: ['perfis-equipe'],
    queryFn: async (): Promise<PerfilCorporativo[]> => {
      const { data, error } = await supabase
        .from('perfis')
        .select('id, nome, descricao, ativo')
        .eq('ativo', true)
        .in('nome', ['CLIENTE', 'ANUNCIANTE']);
      if (error) return [];
      return (data ?? []) as PerfilCorporativo[];
    },
  });

  const provisionar = async () => {
    if (form.nome.trim().length < 3) return toast.error('Informe o nome completo.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return toast.error('Informe um e-mail válido.');
    if (!form.perfilId) return toast.error('Selecione o perfil.');

    setEnviando(true);
    const r = await corporateUsersService.criarUsuario({
      nome: form.nome.trim(),
      email: form.email.trim(),
      telefone: form.telefone.trim() || undefined,
      perfilId: form.perfilId,
      // Escopo travado no próprio cliente (revalidado server-side na RPC)
      clienteId: usuario?.cliente_id ?? undefined,
    });
    setEnviando(false);

    if (!r.success) {
      toast.error(r.error ?? 'Erro ao provisionar usuário.');
      return;
    }
    setDialogConvidar(false);
    setForm({ nome: '', email: '', telefone: '', perfilId: '' });
    setCredencial({ email: form.email.trim(), senha: r.senha_inicial ?? '' });
    qc.invalidateQueries({ queryKey: ['minha-equipe'] });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> Minha Equipe
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Usuários da sua empresa. Cada membro recebe login e senha próprios —
            nunca compartilhe credenciais.
          </p>
        </div>
        <Button onClick={() => setDialogConvidar(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Adicionar Pessoa
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <Card className="border-white/10 bg-white/[0.02]">
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-white/10">
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3 hidden sm:table-cell">Login</th>
                  <th className="px-4 py-3">Perfil</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {equipe.map((m) => (
                  <tr key={m.usuario_id} className="border-b border-white/5 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium">{m.nome}</p>
                      <p className="text-xs text-slate-500 sm:hidden">{m.email}</p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-slate-400">{m.email}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="border-white/10 text-slate-300">{m.perfil}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {m.must_change_password ? (
                        <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-[10px]">
                          troca pendente
                        </Badge>
                      ) : m.ativo ? (
                        <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-[10px]">ativo</Badge>
                      ) : (
                        <Badge variant="outline" className="border-slate-600 text-slate-400 text-[10px]">inativo</Badge>
                      )}
                    </td>
                  </tr>
                ))}
                {equipe.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                      Nenhum usuário adicional ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Provisionamento */}
      <Dialog open={dialogConvidar} onOpenChange={setDialogConvidar}>
        <DialogContent className="bg-slate-900 border-white/10 text-slate-200 max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar pessoa à equipe</DialogTitle>
            <DialogDescription>
              Uma senha inicial forte será gerada automaticamente pelo sistema e exibida
              uma única vez para você entregar ao novo membro.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome completo *</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="bg-slate-950 border-slate-700" />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail de login *</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="qualquer-email@dominio.com"
                  className="pl-10 bg-slate-950 border-slate-700"
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Gmail, Outlook, Hotmail ou e-mail empresarial — qualquer endereço válido.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} className="bg-slate-950 border-slate-700" />
            </div>
            <div className="space-y-1.5">
              <Label>Perfil *</Label>
              <select
                value={form.perfilId}
                onChange={(e) => setForm({ ...form, perfilId: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg bg-slate-950 border border-slate-700"
              >
                <option value="">Selecione…</option>
                {perfis.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogConvidar(false)}>Cancelar</Button>
            <Button onClick={provisionar} disabled={enviando}>
              {enviando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <KeyRound className="h-4 w-4 mr-2" />}
              Provisionar acesso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Senha inicial única */}
      <Dialog open={!!credencial} onOpenChange={(o) => !o && setCredencial(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-500" />
              Acesso criado para {credencial?.email}
            </DialogTitle>
            <DialogDescription>Senha inicial gerada automaticamente:</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="p-3 rounded-lg bg-muted border font-mono text-center text-lg tracking-wider select-all">
              {credencial?.senha}
            </div>
            <p className="text-xs text-muted-foreground">
              Copie agora — não será exibida novamente. A troca será obrigatória no primeiro login.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={async () => {
                try {
                  await navigator.clipboard.writeText(credencial?.senha ?? '');
                  toast.success('Senha copiada.');
                } catch { toast.error('Não foi possível copiar.'); }
              }}>
                <Copy className="h-4 w-4 mr-1" /> Copiar
              </Button>
              <Button className="flex-1" onClick={() => setCredencial(null)}>Concluir</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
