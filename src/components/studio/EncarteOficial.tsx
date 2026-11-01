/**
 * F-240 — ENCARTE OFICIAL (fundo pronto do dono) na pasta "Encartes de Mercado". Os produtos de "Seus produtos" se
 * organizam sozinhos nas colunas do fundo (Mega Oferta: lado vermelho e lado azul); no lugar do "SUA LOGO AQUI" o cliente
 * põe a logo ou foto dele (PNG sem fundo, logo redonda ou vetor ficam soltas, como a logo "MEGA OFERTA"; com fundo, vão
 * num cartão); no rodapé amarelo, telefone e endereço. "Editar e publicar" abre o editor do Studio com a arte pronta.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clapperboard, ImagePlus, MapPin, Monitor, PenLine, Phone, Smartphone, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PreviaDocumento } from '@/components/studio/PreviaDocumento';
import { enderecoDaArtePronta } from '@/lib/studio/artePronta';
import { animarTudo, temAnimacao } from '@/lib/studio/animacao';
import { documentoDoEncarteOficial, formatosDoEncarte, maxDeProdutos, PASTA_ENCARTES_OFICIAIS, type DadosDoEncarte, type EncarteOficial as Encarte, type LogoDoCliente } from '@/lib/studio/encartesOficiais';
import type { Documento, FormatoDoc } from '@/lib/studio/documento';
import { cn } from '@/lib/utils';
import { logoSalvaDoStudio } from '@/lib/studio/logoDoStudio';
import { CHAVE_ARTE_PARA_VIDEO } from '@/lib/studio/video/linha';
import type { ProdutoTabloide } from '@/lib/tabloide/parseProdutos';

const CHAVE_DADOS = 'studio-encarte-oficial-dados';
const campo = 'h-9 w-full rounded-lg border border-white/10 bg-black/30 px-2 text-sm text-white placeholder:text-slate-500 focus:border-[#B04DFF] focus:outline-none';

function lerDados(): DadosDoEncarte {
  try { return JSON.parse(localStorage.getItem(CHAVE_DADOS) ?? '{}') as DadosDoEncarte; } catch { return {}; }
}

function carregar(src: string) {
  return new Promise<HTMLImageElement>((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => erro(new Error('Não foi possível abrir a imagem.')); i.src = src; });
}

/**
 * Prepara a logo: reduz para até 800 px (PNG) e descobre se ela é "recortada" — sem fundo (a borda é quase toda
 * transparente: PNG sem fundo, logo redonda) ou vetor (SVG).
 */
export async function prepararLogo(arquivo: Blob, tipo = arquivo.type): Promise<LogoDoCliente> {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await carregar(url);
    const lw = img.naturalWidth || 600, lh = img.naturalHeight || 600;
    const k = Math.min(1, 800 / Math.max(lw, lh));
    const w = Math.max(1, Math.round(lw * k)), h = Math.max(1, Math.round(lh * k));
    const tela = document.createElement('canvas');
    tela.width = w; tela.height = h;
    const ctx = tela.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, w, h);
    return { url: tela.toDataURL('image/png'), largura: w, altura: h, recortada: tipo === 'image/svg+xml' || bordaTransparente(ctx, w, h) };
  } finally { URL.revokeObjectURL(url); }
}

/** Mais da metade dos pontos da borda transparentes = sem fundo (inclui logo redonda, que só toca a borda em 4 pontos). */
function bordaTransparente(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const d = ctx.getImageData(0, 0, w, h).data;
  const alfa = (x: number, y: number) => d[(y * w + x) * 4 + 3];
  let total = 0, vazios = 0;
  const passo = Math.max(1, Math.round(Math.max(w, h) / 120));
  for (let x = 0; x < w; x += passo) for (const y of [0, h - 1]) { total++; if (alfa(x, y) < 16) vazios++; }
  for (let y = 0; y < h; y += passo) for (const x of [0, w - 1]) { total++; if (alfa(x, y) < 16) vazios++; }
  return total > 0 && vazios / total >= 0.5;
}

export function EncarteOficialCartao({ e, produtos, aoGravar }: { e: Encarte; produtos: ProdutoTabloide[]; aoGravar: () => void }) {
  const navegar = useNavigate();
  const [dados, setDados] = useState<DadosDoEncarte>(lerDados);
  const arquivo = useRef<HTMLInputElement>(null);
  useEffect(() => { try { localStorage.setItem(CHAVE_DADOS, JSON.stringify(dados)); } catch { /* logo grande demais para guardar: segue sem lembrar */ } }, [dados]);
  // F-240: o mesmo encarte em pé (9:16) e deitado (16:9); o editor recebe os dois
  const formatos = useMemo(() => formatosDoEncarte(e), [e]);
  const [formato, setFormato] = useState<FormatoDoc>(formatos[0]);
  const docs = useMemo(() => Object.fromEntries(formatos.map((f) => [f, documentoDoEncarteOficial(e, produtos, dados, f)])) as Partial<Record<FormatoDoc, Documento>>, [e, formatos, produtos, dados]);
  const doc = docs[formato] ?? docs[formatos[0]]!;
  const deitado = doc.formato === '16:9';
  const max = maxDeProdutos(e);
  const logo3d = logoSalvaDoStudio();

  const escolher = async (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(f.type)) { toast.error('Use uma imagem PNG, JPG, WEBP ou SVG.'); return; }
    try { setDados((d) => ({ ...d, logo: null })); const l = await prepararLogo(f); setDados((d) => ({ ...d, logo: l })); toast.success(l.recortada ? 'Logo sem fundo: fica solta no encarte, como a logo MEGA OFERTA.' : 'Imagem com fundo: entra num cartão com borda.'); }
    catch (err) { toast.error((err as Error).message); }
  };
  const usarLogo3d = async () => {
    if (!logo3d) return;
    try { const b = await (await fetch(logo3d.url)).blob(); setDados((d) => ({ ...d, logo: null })); const l = await prepararLogo(b, 'image/png'); setDados((d) => ({ ...d, logo: l })); }
    catch { toast.error('Não foi possível usar a logo 3D.'); }
  };
  const nome = `${e.nome.split(' – ')[0]} – encarte`;
  const pasta = { chave: PASTA_ENCARTES_OFICIAIS, nome: 'Encartes de Mercado', segmento: 'supermercados' };
  const editar = () => {
    aoGravar();
    try { navegar(enderecoDaArtePronta({ docs, formato: doc.formato, nome, pasta, voltar: `/studio/pasta/${PASTA_ENCARTES_OFICIAIS}` })); }
    catch { toast.error('Não foi possível abrir o editor (a imagem da logo é grande demais). Use uma logo menor.'); }
  };
  const video = () => {
    aoGravar();
    try { sessionStorage.setItem(CHAVE_ARTE_PARA_VIDEO, JSON.stringify({ doc: temAnimacao(doc) ? doc : animarTudo(doc), nome })); navegar('/studio/video'); }
    catch { toast.error('Não foi possível abrir o editor de vídeo.'); }
  };

  return (
    <article className={cn('sm-cartao-luz grid gap-4 rounded-xl p-3', deitado ? 'grid-cols-1' : 'md:grid-cols-[minmax(0,300px)_1fr]')} data-testid="studio-encarte-oficial">
      <PreviaDocumento key={doc.formato} doc={doc} sempre className={cn('w-full overflow-hidden rounded-lg', deitado && 'max-w-[720px]')} />
      <div className="flex min-w-0 flex-col gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-bold text-white"><Sparkles className="h-4 w-4 text-[#FFD400]" />{e.nome} <span className="rounded bg-[#FFD400]/15 px-1.5 text-[10px] font-semibold text-[#FFD400]">OFICIAL</span></p>
          {formatos.length > 1 && (
            <div className="my-2 inline-grid grid-cols-2 gap-1 rounded-xl bg-black/30 p-1" role="radiogroup" aria-label="Formato do encarte">
              {formatos.map((f) => (
                <button key={f} type="button" role="radio" aria-checked={formato === f} onClick={() => setFormato(f)} data-testid="encarte-oficial-formato"
                  className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold', formato === f ? 'bg-[#5D1BFF] text-white' : 'text-slate-300 hover:bg-white/5')}>
                  {f === '16:9' ? <Monitor className="h-3.5 w-3.5" /> : <Smartphone className="h-3.5 w-3.5" />}{f === '16:9' ? 'TV deitada' : 'TV em pé'}
                </button>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-400">Os seus produtos se organizam sozinhos nos dois lados ({Math.min(produtos.length, max)} de até {max}){produtos.length > max ? ` — os ${produtos.length - max} últimos ficam de fora` : ''}.</p>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-200">Sua logo (no lugar de "SUA LOGO AQUI")</p>
          <div className="flex flex-wrap items-center gap-2">
            <input ref={arquivo} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(ev) => { void escolher(ev.target.files?.[0]); ev.target.value = ''; }} data-testid="encarte-logo-arquivo" />
            <button type="button" onClick={() => arquivo.current?.click()} className="flex h-9 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-xs font-semibold text-white hover:bg-white/5"><ImagePlus className="h-4 w-4" />{dados.logo ? 'Trocar logo ou foto' : 'Adicionar logo ou foto'}</button>
            {logo3d && <button type="button" onClick={() => void usarLogo3d()} className="flex h-9 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-xs text-slate-200 hover:bg-white/5"><Sparkles className="h-4 w-4 text-[#FFD400]" />Usar minha Logo 3D</button>}
            {dados.logo && <button type="button" onClick={() => setDados((d) => ({ ...d, logo: null }))} className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Tirar a logo"><Trash2 className="h-4 w-4" />Tirar</button>}
          </div>
          <p className="text-[11px] text-slate-500">PNG sem fundo, logo redonda ou vetor (SVG) ficam soltos, como a logo MEGA OFERTA. Foto ou logo com fundo entram num cartão com borda.</p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-slate-300"><span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />Telefone / WhatsApp</span>
            <input value={dados.telefone ?? ''} onChange={(ev) => setDados((d) => ({ ...d, telefone: ev.target.value.slice(0, 40) }))} placeholder="(11) 99999-1234" className={campo} data-testid="encarte-telefone" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-300"><span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />Endereço</span>
            <input value={dados.endereco ?? ''} onChange={(ev) => setDados((d) => ({ ...d, endereco: ev.target.value.slice(0, 90) }))} placeholder="Rua, número – bairro – cidade" className={campo} data-testid="encarte-endereco" />
          </label>
        </div>

        <div className="mt-auto flex flex-wrap gap-2">
          <button type="button" onClick={editar} className="flex h-10 items-center gap-1.5 rounded-lg bg-[#5D1BFF] px-4 text-sm font-semibold text-white hover:bg-[#8A2EFF]" data-testid="encarte-oficial-editar"><PenLine className="h-4 w-4" />Editar e publicar</button>
          <button type="button" onClick={video} className="flex h-10 items-center gap-1.5 rounded-lg border border-white/15 px-4 text-sm text-white hover:bg-white/5"><Clapperboard className="h-4 w-4" />Criar vídeo</button>
        </div>
      </div>
    </article>
  );
}
