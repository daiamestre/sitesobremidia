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
        .select('id, acao, created_at:data_hora, status_novo, observacoes')
        .eq('usuario_id', usuarioId)
        .order('data_hora', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data as HistoricoItem[]) ?? [];
    } catch {
      return [];
    }
  },

  /**
   * F-169: nome e telefone do próprio usuário. Telefone é OPCIONAL (em branco = sem telefone); a função (perfil) nunca muda
   * por aqui e o e-mail só muda com autorização (solicitarTrocaEmail). A gravação é feita pelo banco (RPC).
   */
  async atualizarPerfil(payload: PerfilPayload): Promise<{ error: string | null }> {
    if (!payload.nome || payload.nome.trim().length < 3) {
      return { error: 'Informe o nome (mínimo 3 letras).' };
    }
    const tel = (payload.telefone ?? '').trim();
    if (tel && tel.replace(/\D/g, '').length < 8) {
      return { error: 'Telefone incompleto: informe com DDD ou deixe em branco.' };
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Sessão inválida.' };

    const { error } = await supabase.rpc('perfil_atualizar_dados' as never, { p_nome: payload.nome.trim(), p_telefone: tel || null } as never);
    if (error) return { error: error.message };
    return { error: null };
  },

  /** Nome do estabelecimento do anunciante (é o nome das boas-vindas do portal). */
  async atualizarNomeEstabelecimento(nome: string): Promise<{ error: string | null }> {
    if (nome.trim().length < 2) return { error: 'Informe o nome do estabelecimento (mínimo 2 letras).' };
    const { error } = await supabase.rpc('perfil_atualizar_nome_estabelecimento' as never, { p_nome: nome.trim() } as never);
    return { error: error ? error.message : null };
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

  /** F-134: foto de capa (só aparece em "Meu Perfil"). Fica na pasta do próprio usuário no balde avatars. */
  async uploadCapa(file: File): Promise<{ url: string | null; error: string | null }> {
    const MAX = 8 * 1024 * 1024;
    if (file.size > MAX) return { url: null, error: 'Imagem muito grande (máx. 8MB).' };
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return { url: null, error: 'Formato inválido. Use JPG, PNG ou WEBP.' };
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { url: null, error: 'Sessão inválida.' };
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${user.id}/capa-${Date.now()}.${ext}`;
    try {
      const { data: antes } = await supabase.from('usuarios').select('capa_url').eq('id', user.id).maybeSingle();
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw new Error(upErr.message);
      const url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
      const { error: updErr } = await supabase.from('usuarios').update({ capa_url: url } as never).eq('id', user.id);
      if (updErr) return { url: null, error: updErr.message };
      // a capa anterior não fica ocupando espaço
      const antiga = ((antes as { capa_url?: string | null } | null)?.capa_url || '').split('/avatars/')[1];
      if (antiga) await supabase.storage.from('avatars').remove([decodeURIComponent(antiga.split('?')[0])]).catch(() => undefined);
      return { url, error: null };
    } catch (e: any) {
      return { url: null, error: e?.message || 'Falha no envio da capa.' };
    }
  },

  async removerCapa(): Promise<{ error: string | null }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Sessão inválida.' };
    const { data: u } = await supabase.from('usuarios').select('capa_url').eq('id', user.id).maybeSingle();
    const antiga = ((u as { capa_url?: string | null } | null)?.capa_url || '').split('/avatars/')[1];
    const { error } = await supabase.from('usuarios').update({ capa_url: null } as never).eq('id', user.id);
    if (error) return { error: error.message };
    if (antiga) await supabase.storage.from('avatars').remove([decodeURIComponent(antiga.split('?')[0])]).catch(() => undefined);
    return { error: null };
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

  /** F-169: o e-mail só muda com autorização — o Owner/ADM recebem o pedido na Central e decidem. */
  async solicitarTrocaEmail(novoEmail: string): Promise<{ error: string | null }> {
    const email = novoEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'E-mail inválido.' };
    const { error } = await supabase.rpc('perfil_solicitar_troca_email' as never, { p_novo_email: email } as never);
    return { error: error ? error.message : null };
  },

  /** Pedido de troca de e-mail aguardando autorização (ou null). */
  async trocaEmailPendente(): Promise<{ id: string; novo_email: string | null; criado_em: string } | null> {
    const { data, error } = await supabase.rpc('perfil_troca_email_pendente' as never);
    if (error || !data) return null;
    return data as unknown as { id: string; novo_email: string | null; criado_em: string };
  },

  async cancelarTrocaEmail(): Promise<{ error: string | null }> {
    const { error } = await supabase.rpc('perfil_cancelar_troca_email' as never);
    return { error: error ? error.message : null };
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
