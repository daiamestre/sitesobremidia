import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Monitor, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/** F-194 — envia uma imagem de capa (tela ou cartão) para avatars/<usuario>/capas-telas/ e devolve o endereço público. */
export async function enviarImagemDeCapa(usuarioId: string, arquivo: File, prefixo: string): Promise<string> {
  if (!arquivo.type.startsWith('image/')) throw new Error('Escolha uma imagem (JPG, PNG ou WEBP).');
  if (arquivo.size > 5 * 1024 * 1024) throw new Error('A imagem pode ter até 5 MB.');
  const ext = (arquivo.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const caminho = `${usuarioId}/capas-telas/${prefixo}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('avatars').upload(caminho, arquivo, { upsert: true, contentType: arquivo.type });
  if (error) throw error;
  return supabase.storage.from('avatars').getPublicUrl(caminho).data.publicUrl;
}

/** Capa da tela na criação/edição: mostra a imagem (ou a capa padrão) e deixa trocar ou tirar. */
export function CapaDaTela({ usuarioId, valor, onMudar, emPe, compacto }: {
  usuarioId?: string; valor: string | null; onMudar: (url: string | null) => void; emPe?: boolean;
  /** F-194: versão pequena para o topo da janela, ao lado do título. */
  compacto?: boolean;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const escolher = async (f: File) => {
    if (!usuarioId) return;
    setEnviando(true);
    try { onMudar(await enviarImagemDeCapa(usuarioId, f, 'tela')); toast.success('Capa escolhida.'); }
    catch (e) { toast.error(`Não foi possível enviar a capa: ${(e as Error).message}`); }
    finally { setEnviando(false); }
  };
  if (compacto) {
    return (
      <div className="flex flex-shrink-0 items-center gap-1.5" data-testid="capa-da-tela">
        <button type="button" disabled={enviando || !usuarioId} onClick={() => entrada.current?.click()} data-testid="escolher-capa"
          title={valor ? 'Trocar imagem de capa' : 'Colocar imagem de capa'}
          className={`group relative h-12 w-20 overflow-hidden rounded-lg border border-cyan-400/40 shadow-[0_0_10px_rgba(34,211,238,0.25)] disabled:opacity-60 ${valor ? '' : 'bg-gradient-to-br from-violet-600/70 via-indigo-900/70 to-slate-900'}`}>
          {valor ? <img src={valor} alt="Capa da tela" className="h-full w-full object-cover" />
            : <span className="flex h-full w-full items-center justify-center"><Monitor className="h-5 w-5 text-violet-200" /></span>}
          <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-[10px] font-semibold text-white opacity-90 group-hover:opacity-100">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ImagePlus className="mr-1 h-3.5 w-3.5" />Capa</>}
          </span>
        </button>
        {valor && (
          <button type="button" onClick={() => onMudar(null)} title="Tirar capa" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
        <input ref={entrada} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void escolher(f); }} />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3" data-testid="capa-da-tela">
      <div className={`relative flex-shrink-0 overflow-hidden rounded-lg border border-border ${emPe ? 'h-24 w-14' : 'h-14 w-24'} ${valor ? '' : 'bg-gradient-to-br from-violet-600/60 via-indigo-900/60 to-slate-900'}`}>
        {valor ? <img src={valor} alt="Capa da tela" className="h-full w-full object-cover" />
          : <div className="flex h-full w-full items-center justify-center"><Monitor className="h-6 w-6 text-violet-200" /></div>}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-xs text-muted-foreground">Imagem que aparece no cartão da tela. Sem imagem, fica a capa padrão.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={enviando || !usuarioId} onClick={() => entrada.current?.click()} data-testid="escolher-capa"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-60">
            {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
            {valor ? 'Trocar capa' : 'Colocar capa'}
          </button>
          {valor && (
            <button type="button" onClick={() => onMudar(null)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted">
              <Trash2 className="h-3.5 w-3.5" /> Tirar
            </button>
          )}
        </div>
      </div>
      <input ref={entrada} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void escolher(f); }} />
    </div>
  );
}
