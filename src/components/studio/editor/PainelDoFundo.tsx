/**
 * F-308 (pedido do dono, 12/11/2026): o modelo é só o ponto de partida — a pessoa troca TUDO, inclusive o FUNDO da arte
 * (background): outro fundo da galeria, uma imagem dela (enviada do aparelho), só cor, e o MOVIMENTO do fundo. O mesmo
 * painel no editor de encartes e no palco de ofertas. Tocar no fundo da arte (fora dos elementos) abre este painel.
 */
import { useRef, useState } from 'react';
import { ImageOff, ImagePlus, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { uploadToR2 } from '@/lib/r2Upload';
import { MOVIMENTOS_DO_FUNDO, type Animacao, type TipoDeAnimacao } from '@/lib/studio/animacao';
import { cn } from '@/lib/utils';

export interface OpcaoDeFundo { id: string; nome: string; /** a imagem certa para cada formato (em pé ou deitado) */ src: string; grupo?: string }

/** Reduz a foto enviada (lado maior 1920 px, WebP) para o fundo ficar leve e nítido na TV. */
async function fotoLeve(arquivo: File): Promise<Blob> {
  const bmp = await createImageBitmap(arquivo);
  const k = Math.min(1, 1920 / Math.max(bmp.width, bmp.height));
  const tela = document.createElement('canvas');
  tela.width = Math.round(bmp.width * k); tela.height = Math.round(bmp.height * k);
  tela.getContext('2d')!.drawImage(bmp, 0, 0, tela.width, tela.height);
  bmp.close?.();
  const webp = await new Promise<Blob | null>((ok) => tela.toBlob(ok, 'image/webp', 0.86));
  return webp ?? (await new Promise<Blob>((ok, erro) => tela.toBlob((b) => (b ? ok(b) : erro(new Error('foto'))), 'image/jpeg', 0.88)));
}

export function PainelDoFundo({ atual, semImagem, animacao, opcoes, deitado, aoTrocar, aoSoCor, aoMover, aoRestaurar, cor }: {
  /** a imagem de fundo de agora (neste formato) */ atual: string | null; semImagem?: boolean;
  animacao?: Animacao | null; opcoes: OpcaoDeFundo[]; deitado: boolean;
  /** trocou de fundo: `id` do fundo da galeria (ou null = imagem enviada) e a imagem deste formato */
  aoTrocar: (o: { id: string | null; src: string }) => void;
  aoSoCor: () => void; aoMover: (a: TipoDeAnimacao | null) => void; aoRestaurar?: () => void;
  /** cor por baixo do fundo (aparece quando é "só cor") */ cor?: { valor: string; mudar: (v: string) => void };
}) {
  const { user } = useAuth();
  const arquivo = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const enviar = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { toast.error('Escolha uma imagem (foto, JPG, PNG ou WebP).'); return; }
    if (!user) { toast.error('Entre na sua conta para enviar o seu fundo.'); return; }
    setEnviando(true);
    try {
      const leve = await fotoLeve(f);
      const ext = leve.type === 'image/webp' ? 'webp' : 'jpg';
      const { publicUrl } = await uploadToR2(leve, `${user.id}/studio/fundos/${Date.now()}.${ext}`, leve.type, user.id, { preventOverwrite: true });
      aoTrocar({ id: null, src: publicUrl });
      toast.success('Fundo trocado. Ele fica guardado nesta arte.');
    } catch { toast.error('Não foi possível enviar a imagem. Tente de novo.'); }
    finally { setEnviando(false); }
  };
  const mov = (animacao?.tipo ?? null) as TipoDeAnimacao | null;
  const grupos = [...new Set(opcoes.map((o) => o.grupo ?? ''))];
  return (
    <div className="space-y-3" data-testid="painel-do-fundo">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => arquivo.current?.click()} disabled={enviando} className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[#5D1BFF] px-2 text-xs font-bold text-white hover:bg-[#8A2EFF] disabled:opacity-60" data-testid="fundo-enviar">
          {enviando ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <ImagePlus className="h-4 w-4 shrink-0" />}<span className="truncate">Usar minha imagem</span>
        </button>
        <button type="button" onClick={aoSoCor} className={cn('flex h-11 items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-semibold text-white hover:bg-white/5', semImagem ? 'border-[#FFD400]/70' : 'border-white/15')} data-testid="fundo-so-cor">
          <ImageOff className="h-4 w-4 shrink-0" /><span className="truncate">Só cor</span>
        </button>
        <input ref={arquivo} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void enviar(f); }} data-testid="fundo-arquivo" />
      </div>
      {semImagem && cor && (
        <label className="flex items-center justify-between gap-2 text-xs text-slate-300">Cor do fundo
          <input type="color" value={cor.valor.startsWith('#') ? cor.valor.slice(0, 7) : '#000000'} onChange={(e) => cor.mudar(e.target.value)} className="h-9 w-16 cursor-pointer rounded-lg border border-white/15 bg-transparent" data-testid="fundo-cor" />
        </label>
      )}

      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-slate-200">Movimento do fundo</p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Movimento do fundo">
          {MOVIMENTOS_DO_FUNDO.map((m) => (
            <button key={m.id ?? 'parado'} type="button" role="radio" aria-checked={mov === m.id} onClick={() => aoMover(m.id)} data-testid={`fundo-mov-${m.id ?? 'parado'}`}
              className={cn('h-9 rounded-full border px-3 text-xs font-semibold', mov === m.id ? 'border-[#FFD400] bg-[#FFD400]/15 text-[#FFD400]' : 'border-white/15 text-slate-200 hover:bg-white/5')}>{m.nome}</button>
          ))}
        </div>
      </div>

      {grupos.map((g) => (
        <div key={g || 'fundos'} className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-200">{g || 'Outros fundos'}</p>
          <div className={cn('grid gap-1.5', deitado ? 'grid-cols-2' : 'grid-cols-3')}>
            {opcoes.filter((o) => (o.grupo ?? '') === g).map((o) => {
              const ativo = !semImagem && atual === o.src;
              return (
                <button key={o.id} type="button" onClick={() => aoTrocar({ id: o.id, src: o.src })} title={o.nome} aria-label={`Usar o fundo ${o.nome}`} aria-pressed={ativo} data-testid="fundo-opcao"
                  className={cn('overflow-hidden rounded-lg border-2 bg-black', ativo ? 'border-[#FFD400]' : 'border-white/10 hover:border-[#8A2EFF]')}>
                  <img src={o.src} alt="" loading="lazy" className={cn('w-full object-cover', deitado ? 'aspect-video' : 'aspect-[9/16]')} />
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {aoRestaurar && (
        <button type="button" onClick={aoRestaurar} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-white/15 text-xs font-semibold text-slate-200 hover:bg-white/5" data-testid="fundo-original">
          <RotateCcw className="h-3.5 w-3.5" />Voltar ao fundo do modelo
        </button>
      )}
    </div>
  );
}
