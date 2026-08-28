import { supabase } from '@/integrations/supabase/client';

export interface PerfilPayload {
  nome: string;
  telefone?: string | null;
}

export interface HistoricoItem {
  id: string;
  acao: string;
  created_at: string;
  status_novo?: string | null;
  observacoes?: string | null;
}

export const perfilService = {
  async buscarSessoes() {
    const { data } = await supabase.auth.getSession();
    return data.session;
  },

  async listarHistorico(usuarioId: string): Promise<HistoricoItem[]> {
    try {
      const { data, error } = await supabase
        .from('auditoria_logs')
        .select('id, acao, created_at, status_novo, observacoes')
        .eq('usuario_id', usuarioId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data as HistoricoItem[]) ?? [];
    } catch {
      return [];
    }
  },

  async atualizarPerfil(payload: PerfilPayload): Promise<{ error: string | null }> {
    // validação frontend redundante com backend
    if (!payload.nome || payload.nome.trim().length < 3) {
      return { error: 'Nome completo é obrigatório (mín. 3 caracteres).' };
    }
    if (!payload.telefone || payload.telefone.trim().length < 8) {
      return { error: 'WhatsApp/telefone é obrigatório.' };
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Sessão inválida.' };

    // Tentativa direta via RLS (usuário só pode alterar próprio registro)
    const { error } = await supabase
      .from('usuarios')
      .update({
        nome: payload.nome.trim(),
        telefone: payload.telefone.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (error) {
      return { error: error.message };
    }

    // Log de auditoria leve (best effort)
    try {
      const { data: u } = await supabase.from('usuarios').select('empresa_operadora_id').eq('id', user.id).maybeSingle();
      if (u) {
        await supabase.from('auditoria_logs').insert({
          empresa_operadora_id: (u as any).empresa_operadora_id,
          usuario_id: user.id,
          entidade_tipo: 'USUARIO',
          entidade_id: user.id,
          acao: 'PERFIL_ATUALIZADO',
          status_novo: 'ACTIVE',
          observacoes: `Perfil atualizado: nome=${payload.nome.trim()}`,
        } as any);
      }
    } catch (_e) {
      // best effort — ignora falha de auditoria
    }
    return { error: null };
  },

  async uploadAvatar(file: File): Promise<{ url: string | null; error: string | null }> {
    const MAX = 5 * 1024 * 1024;
    if (file.size > MAX) return { url: null, error: 'Imagem muito grande (máx. 5MB).' };
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return { url: null, error: 'Formato inválido. Use JPG, PNG, WEBP ou GIF.' };
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { url: null, error: 'Sessão inválida.' };

    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;

    // Garante bucket avatars existente (idempotente)
    try {
      // Supabase storage bucket criação exige service_role; tentamos e ignoramos falha se já existe
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, {
        upsert: true,
        contentType: file.type,
      });
      if (upErr) throw new Error(upErr.message);
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      const url = pub.publicUrl;

      const { error: updErr } = await supabase.from('usuarios').update({ avatar_url: url }).eq('id', user.id);
      if (updErr) return { url: null, error: updErr.message };
      return { url, error: null };
    } catch (e: any) {
      return { url: null, error: e?.message || 'Falha no upload.' };
    }
  },

  async removerAvatar(): Promise<{ error: string | null }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Sessão inválida.' };
    const { data: u } = await supabase.from('usuarios').select('avatar_url').eq('id', user.id).maybeSingle();
    const url = (u as any)?.avatar_url as string | undefined;
    if (url) {
      try {
        // tenta extrair path após /avatars/
        const m = url.split('/avatars/');
        if (m[1]) {
          const path = decodeURIComponent(m[1].split('?')[0]);
          await supabase.storage.from('avatars').remove([path]);
        }
      } catch (_e) {
        // ignora falha na remoção do storage
      }
    }
    const { error } = await supabase.from('usuarios').update({ avatar_url: null }).eq('id', user.id);
    if (error) return { error: error.message };
    return { error: null };
  },

  async solicitarAlteracaoEmail(novoEmail: string): Promise<{ error: string | null }> {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(novoEmail.trim())) return { error: 'E-mail inválido.' };
    const { error } = await supabase.auth.updateUser({ email: novoEmail.trim() });
    if (error) return { error: error.message };
    return { error: null };
  },

  async alterarSenha(senhaAtual: string, novaSenha: string): Promise<{ error: string | null }> {
    // usa política oficial: min 6
    const { validarSenhaNova } = await import('@/lib/passwordPolicy');
    const v = validarSenhaNova(novaSenha);
    if (!v.valida) return { error: v.motivo || 'Senha inválida.' };
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return { error: 'Sessão inválida.' };
    // reautentica
    const { error: reErr } = await supabase.auth.signInWithPassword({ email: user.email, password: senhaAtual });
    if (reErr) return { error: 'Senha atual incorreta.' };
    const { error: updErr } = await supabase.auth.updateUser({ password: novaSenha });
    if (updErr) return { error: updErr.message };
    return { error: null };
  },

  async encerrarOutrasSessoes(): Promise<{ error: string | null }> {
    // Supabase goTrue permite signOut escopo global
    try {
      // @ts-expect-error - scope others may not be typed in older client
      const { error } = await supabase.auth.signOut({ scope: 'others' } as any);
      if (error) return { error: error.message };
      return { error: null };
    } catch (e: any) {
      return { error: e?.message || 'Falha ao encerrar sessões.' };
    }
  },
};
