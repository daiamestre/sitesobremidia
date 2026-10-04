import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Loader2, MonitorSmartphone, Palette, Save, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { uploadToR2 } from '@/lib/r2Upload';
import { perfilService } from '@/services/perfil.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

/**
 * Minha Marca — Brand Kit do Gestor de Mídias (F-103).
 * O gestor trabalha como afiliado: logo, cores e nome da empresa dele aparecem no
 * Player Android quando ELE faz login no aparelho (tabela gestor_marcas).
 * F-144: a foto de capa é a mesma do perfil (usuarios.capa_url) e só aparece aqui e em "Meu Perfil" — não vai para o
 * Player. Sem logo, o Player usa a foto de perfil do usuário.
 */
interface Marca {
  nome_marca: string;
  slogan: string | null;
  logo_url: string | null;
  cor_primaria: string;
  cor_secundaria: string;
  usar_no_player: boolean;
}

const PADRAO: Marca = { nome_marca: '', slogan: '', logo_url: null, cor_primaria: '#7C3AED', cor_secundaria: '#0F172A', usar_no_player: true };
const HEX = /^#[0-9A-Fa-f]{6}$/;

export default function MinhaMarca() {
  const { usuario, empresaOperadoraId, refreshUserData } = useAuth();
  const qc = useQueryClient();
  const [m, setM] = useState<Marca>(PADRAO);
  const [enviando, setEnviando] = useState(false);
  const [salvandoCapa, setSalvandoCapa] = useState(false);
  const capa = usuario?.capa_url || null;
  const fotoDePerfil = usuario?.avatar_url && /^https:\/\//.test(usuario.avatar_url) ? usuario.avatar_url : null;
  /** O que o Player mostra: o logo da marca; sem logo, a foto de perfil. */
  const imagemDaMarca = m.logo_url || fotoDePerfil;

  const enviarCapa = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setSalvandoCapa(true);
    const r = await perfilService.uploadCapa(arquivo);
    setSalvandoCapa(false);
    if (r.error) toast.error(r.error);
    else { toast.success('Foto de capa atualizada.'); await refreshUserData(); }
  };

  const removerCapa = async () => {
    setSalvandoCapa(true);
    const r = await perfilService.removerCapa();
    setSalvandoCapa(false);
    if (r.error) toast.error(r.error);
    else { toast.success('Foto de capa removida.'); await refreshUserData(); }
  };

  const atual = useQuery({
    queryKey: ['minha-marca', usuario?.id],
    enabled: !!usuario?.id,
    queryFn: async (): Promise<Marca | null> => {
      const { data, error } = await supabase.from('gestor_marcas' as never)
        .select('nome_marca, slogan, logo_url, cor_primaria, cor_secundaria, usar_no_player')
        .eq('usuario_id', usuario!.id).maybeSingle();
      if (error) throw error;
      return data as Marca | null;
    },
  });

  useEffect(() => { if (atual.data) setM({ ...PADRAO, ...atual.data, slogan: atual.data.slogan ?? '' }); }, [atual.data]);

  const salvar = useMutation({
    mutationFn: async () => {
      const tenant = empresaOperadoraId || usuario?.empresa_operadora_id;
      if (!usuario?.id || !tenant) throw new Error('Sessão inválida.');
      const { error } = await supabase.from('gestor_marcas' as never).upsert({
        usuario_id: usuario.id,
        empresa_operadora_id: tenant,
        nome_marca: m.nome_marca.trim(),
        slogan: m.slogan?.trim() || null,
        logo_url: m.logo_url,
        cor_primaria: m.cor_primaria,
        cor_secundaria: m.cor_secundaria,
        usar_no_player: m.usar_no_player,
      } as never, { onConflict: 'usuario_id' });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success('Marca salva. Ela aparece no Player na próxima vez que você entrar nele.');
      qc.invalidateQueries({ queryKey: ['minha-marca'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const enviarLogo = async (arquivo: File | undefined) => {
    if (!arquivo || !usuario?.id) return;
    if (!/^image\/(png|jpeg|webp)$/.test(arquivo.type)) { toast.error('Use uma imagem PNG, JPG ou WEBP.'); return; }
    if (arquivo.size > 3 * 1024 * 1024) { toast.error('A imagem deve ter até 3 MB.'); return; }
    setEnviando(true);
    try {
      const ext = arquivo.type === 'image/png' ? 'png' : arquivo.type === 'image/webp' ? 'webp' : 'jpg';
      const r = await uploadToR2(arquivo, `${usuario.id}/marca/logo-${Date.now()}.${ext}`, arquivo.type, usuario.id);
      if (!/^https:\/\//.test(r.publicUrl)) throw new Error('Endereço público do logo indisponível.');
      setM((x) => ({ ...x, logo_url: r.publicUrl }));
      toast.success('Logo enviado. Clique em "Salvar marca".');
    } catch (e) {
      toast.error((e as Error).message || 'Falha ao enviar o logo.');
    } finally {
      setEnviando(false);
    }
  };

  const valido = m.nome_marca.trim().length >= 2 && HEX.test(m.cor_primaria) && HEX.test(m.cor_secundaria);

  if (atual.isLoading) return <Loader2 className="mx-auto my-16 h-6 w-6 animate-spin text-muted-foreground" />;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground"><Palette className="h-6 w-6 text-primary" /> Minha Marca</h1>
        <p className="text-sm text-muted-foreground">
          Personalize com a marca da sua empresa de gestão de mídia. Quando você entrar no Player Android com o seu login,
          o aparelho mostra o seu logo e as suas cores.
        </p>
      </div>

      {/* F-144: capa + imagem da marca, como no perfil. A capa só aparece aqui e em "Meu Perfil". */}
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/80" data-testid="cabecalho-marca">
        <div className="relative h-36 w-full sm:h-48 md:h-56" data-testid="capa-marca">
          {capa
            ? <img src={capa} alt="Foto de capa" className="h-full w-full object-cover" />
            : <div className="h-full w-full bg-gradient-to-r from-primary/40 via-primary/15 to-transparent" />}
          <div className="absolute right-3 top-3 flex flex-wrap justify-end gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-950/70 px-3 py-2 text-sm text-white hover:bg-slate-950/90">
              {salvandoCapa ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {capa ? 'Trocar capa' : 'Adicionar capa'}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={salvandoCapa}
                onChange={(e) => { enviarCapa(e.target.files?.[0]); e.target.value = ''; }} data-testid="input-capa-marca" />
            </label>
            {capa && (
              <Button type="button" size="sm" variant="secondary" className="gap-2 bg-slate-950/70 text-rose-300 hover:bg-slate-950/90"
                onClick={removerCapa} disabled={salvandoCapa} aria-label="Remover foto de capa">
                <Trash2 className="h-4 w-4" /> Remover
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-4 px-5 pb-4">
          <div className="-mt-10 flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-card bg-muted shadow-lg" data-testid="imagem-da-marca">
            {imagemDaMarca
              ? <img src={imagemDaMarca} alt="Imagem da marca" className={m.logo_url ? 'h-full w-full object-contain' : 'h-full w-full object-cover'} />
              : <ImagePlus className="h-7 w-7 text-muted-foreground" />}
          </div>
          <div className="min-w-0 flex-1 pt-3">
            <p className="truncate text-lg font-bold text-foreground">{m.nome_marca || usuario?.nome || 'Sua marca'}</p>
            <p className="text-xs text-muted-foreground">
              A foto de capa aparece só aqui e no seu perfil. No Player aparecem o logo e as cores
              {m.logo_url ? '.' : fotoDePerfil ? ' — sem logo, o Player usa a sua foto de perfil.' : ' — envie um logo ou coloque uma foto de perfil.'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <form className="space-y-5 rounded-2xl border border-border/60 bg-card/80 p-5"
          onSubmit={(e) => { e.preventDefault(); if (valido) salvar.mutate(); }}>
          <div className="space-y-2">
            <Label>Logo da empresa (imagem que aparece no Player)</Label>
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-muted/30">
                {m.logo_url ? <img src={m.logo_url} alt="Logo" className="h-full w-full object-contain" /> : <ImagePlus className="h-6 w-6 text-muted-foreground" />}
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm hover:bg-muted/40">
                  {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  {m.logo_url ? 'Trocar logo' : 'Enviar logo'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={enviando}
                    onChange={(e) => enviarLogo(e.target.files?.[0])} />
                </label>
                {m.logo_url && (
                  <Button type="button" variant="ghost" size="sm" className="gap-1 text-red-400" onClick={() => setM((x) => ({ ...x, logo_url: null }))}>
                    <Trash2 className="h-4 w-4" /> Remover
                  </Button>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">PNG com fundo transparente fica melhor. Até 3 MB. Sem logo, o Player mostra a sua foto de perfil.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mm-nome">Nome da empresa</Label>
            <Input id="mm-nome" value={m.nome_marca} maxLength={80} onChange={(e) => setM((x) => ({ ...x, nome_marca: e.target.value }))}
              placeholder="Ex.: Mídia Norte Publicidade" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mm-slogan">Frase (opcional)</Label>
            <Input id="mm-slogan" value={m.slogan ?? ''} maxLength={120} onChange={(e) => setM((x) => ({ ...x, slogan: e.target.value }))}
              placeholder="Ex.: Sua marca em todas as telas" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {([['cor_primaria', 'Cor principal'], ['cor_secundaria', 'Cor de fundo']] as const).map(([campo, rotulo]) => (
              <div key={campo} className="space-y-2">
                <Label htmlFor={`mm-${campo}`}>{rotulo}</Label>
                <div className="flex items-center gap-2">
                  <input id={`mm-${campo}`} type="color" value={m[campo]} onChange={(e) => setM((x) => ({ ...x, [campo]: e.target.value.toUpperCase() }))}
                    className="h-10 w-12 cursor-pointer rounded-md border border-border/60 bg-transparent" />
                  <Input value={m[campo]} maxLength={7} onChange={(e) => setM((x) => ({ ...x, [campo]: e.target.value }))} className="font-mono" />
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Usar minha marca no Player</p>
              <p className="text-xs text-muted-foreground">Desligado, o Player mostra a marca SOBRE MÍDIA.</p>
            </div>
            <Switch checked={m.usar_no_player} onCheckedChange={(v) => setM((x) => ({ ...x, usar_no_player: v }))} aria-label="Usar minha marca no Player" />
          </div>
          <Button type="submit" disabled={!valido || salvar.isPending || enviando} className="w-full gap-2">
            {salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar marca
          </Button>
        </form>

        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground"><MonitorSmartphone className="h-4 w-4" /> Como aparece no Player</p>
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-border/60 shadow-lg"
            style={{ backgroundColor: HEX.test(m.cor_secundaria) ? m.cor_secundaria : '#0F172A' }} data-testid="previa-marca-player">
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              {imagemDaMarca
                ? <img src={imagemDaMarca} alt="" className="max-h-[38%] max-w-[55%] object-contain" />
                : <span className="text-3xl font-black tracking-tight text-white/90">{m.nome_marca || 'SUA MARCA'}</span>}
              {imagemDaMarca && m.nome_marca && <span className="text-lg font-bold text-white">{m.nome_marca}</span>}
              {m.slogan && <span className="text-sm text-white/70">{m.slogan}</span>}
              <span className="mt-2 h-1 w-24 rounded-full" style={{ backgroundColor: HEX.test(m.cor_primaria) ? m.cor_primaria : '#7C3AED' }} />
              <span className="text-xs text-white/60">Sincronizando mídias…</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Aparece na abertura do aplicativo, na escolha da tela, durante a sincronização, na tela de espera e no aviso de suspensão.
            Os anúncios continuam em tela cheia. A foto de capa não aparece no Player.
          </p>
        </div>
      </div>
    </div>
  );
}
