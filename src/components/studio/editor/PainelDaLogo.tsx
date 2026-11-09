/**
 * F-288 — EDIÇÃO COMPLETA DA LOGO 3D (pedido do dono): ao tocar na logo (qualquer parte dela), a lateral mostra:
 *  - cada texto da logo (OFERTAS, DE FARMÁCIA, SAÚDE COM DESCONTO…) com campo para trocar, cor, borda, tamanho e "mostrar";
 *  - "Separar palavras": cada palavra vira um texto próprio, que se move sozinho;
 *  - "Adicionar texto na logo": textos novos, no mesmo estilo, que o cliente cria como quiser;
 *  - o CÍRCULO: ícones prontos (cruz, trigo, taça…) ou a logo do cliente (pasta Logos, galeria ou arquivos), e o tamanho dele;
 *  - a cor da fita/aro da logo (tom).
 * Serve para o palco de ofertas e para o editor de encartes: quem usa passa como mudar, adicionar e tirar camadas.
 */
import { useState } from 'react';
import { Eye, EyeOff, ImagePlus, Move, Plus, Repeat, Scissors, Trash2 } from 'lucide-react';
import { imagem, texto, type Camada, type CamadaImagem, type CamadaTexto, type Documento } from '@/lib/studio/documento';
import { ICONES_DO_CIRCULO, PREFIXO_TEXTO_NOVO, ehCamadaDaLogo } from '@/lib/studio/logoEditavel';
import { cn } from '@/lib/utils';
import { Cor, Faixa, campo } from './Paineis';

/** F-288: a GALERIA DE ÍCONES por segmento (farmácia, saúde, hortifrúti, academia, mercado, Black Friday…) */
export function GaleriaDeIcones({ atual, aoEscolher }: { atual?: string; aoEscolher: (src: string) => void }) {
  const [grupo, setGrupo] = useState(() => ICONES_DO_CIRCULO.find((g) => g.icones.some((i) => i.src === atual))?.id ?? ICONES_DO_CIRCULO[0].id);
  const g = ICONES_DO_CIRCULO.find((x) => x.id === grupo) ?? ICONES_DO_CIRCULO[0];
  return (
    <div className="space-y-1.5" data-testid="galeria-de-icones">
      <div className="flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Segmento dos ícones">
        {ICONES_DO_CIRCULO.map((x) => <button key={x.id} type="button" role="tab" aria-selected={x.id === grupo} onClick={() => setGrupo(x.id)} className={cn('h-7 shrink-0 rounded-full px-2.5 text-[11px] font-semibold', x.id === grupo ? 'bg-[#5D1BFF] text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10')}>{x.nome}</button>)}
      </div>
      <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={`Ícones de ${g.nome}`}>
        {g.icones.map((i) => (
          <button key={i.id} type="button" role="radio" aria-checked={atual === i.src} title={i.nome} onClick={() => aoEscolher(i.src)}
            className={cn('flex aspect-square items-center justify-center rounded-lg border bg-[#2a1458] p-1', atual === i.src ? 'border-[3px] border-[#FFD400]' : 'border-white/10 hover:border-white/30')} data-testid="logo-icone">
            <img src={i.src} alt={i.nome} className="h-full w-full object-contain" />
          </button>
        ))}
      </div>
    </div>
  );
}

const ROTULO: Record<string, string> = { 'Logo – OFERTAS': 'Texto grande', 'Logo – faixa': 'Texto da fita', 'Logo – frase': 'Frase de baixo', 'Logo – ícone esquerdo': 'Ícone da esquerda', 'Logo – ícone direito': 'Ícone da direita' };
const PREFIXO_ICONE_NOVO = 'Logo – ícone ';

export interface PainelDaLogoProps {
  doc: Documento;
  mudar: (nome: string, patch: Partial<Camada>) => void;
  adicionar: (c: Camada) => void;
  tirar: (nome: string) => void;
  /** abre a escolha da logo do cliente para o círculo (pasta Logos, galeria ou arquivos) */
  porLogoNoCirculo: () => void;
  /** seleciona o elemento na tela (para arrastar e girar) */
  selecionar?: (nome: string) => void;
}

/** a logo em camadas está nesta arte? */
export const temLogoEmCamadas = (doc: Documento | null | undefined) => !!doc?.camadas.some((c) => c.nome === 'Logo – base');

export function PainelDaLogo({ doc, mudar, adicionar, tirar, porLogoNoCirculo, selecionar }: PainelDaLogoProps) {
  const base = doc.camadas.find((c) => c.nome === 'Logo – base') as CamadaImagem | undefined;
  const circulo = doc.camadas.find((c) => c.nome === 'Logo no círculo') as CamadaImagem | undefined;
  const textos = doc.camadas.filter((c): c is CamadaTexto => c.tipo === 'texto' && ehCamadaDaLogo(c.nome));
  const proximo = () => { let n = 1; while (doc.camadas.some((c) => c.nome === `${PREFIXO_TEXTO_NOVO}${n}`)) n++; return `${PREFIXO_TEXTO_NOVO}${n}`; };
  const molde = textos.find((t) => t.nome === 'Logo – faixa') ?? textos[0];
  const icones = doc.camadas.filter((c): c is CamadaImagem => c.tipo === 'imagem' && c.nome.startsWith(PREFIXO_ICONE_NOVO));
  const [trocandoIcone, setTrocandoIcone] = useState<string | null>(null);
  const novoIcone = (src: string) => {
    if (!base) return;
    let n = 1; while (doc.camadas.some((c) => c.nome === `${PREFIXO_ICONE_NOVO}${n}`)) n++;
    const nome = `${PREFIXO_ICONE_NOVO}${n}`, lado = base.h * 0.26;
    adicionar({ ...imagem(nome, src, base.x + base.w / 2 - lado / 2, base.y + base.h * 0.04, lado, lado, { ajuste: 'conter' }), animacao: { tipo: 'zoom', atraso: 0.1, duracao: 0.6, depois: null } });
    setTrocandoIcone(null);
    selecionar?.(nome);
  };

  const novoTexto = () => {
    if (!base) return;
    const nome = proximo();
    const tam = Math.round(base.h * 0.09);
    const t = texto(nome, 'NOVO TEXTO', base.x + base.w * 0.1, 0, base.w * 0.8, { fonte: molde?.fonte ?? 'anton', tamanho: tam, alinhamento: 'center', cor: '#ffffff', contorno: molde?.contorno ?? { cor: '#000000', largura: Math.max(2, Math.round(tam * 0.06)) }, entrelinha: 1, espacamento: 0.04, caber: true });
    adicionar({ ...t, y: base.y + base.h - t.h * 0.2, animacao: { tipo: 'subir', atraso: 0.4, duracao: 0.6, depois: null } });
    selecionar?.(nome);
  };
  /** cada palavra vira um texto próprio, lado a lado, no mesmo lugar e estilo */
  const separar = (t: CamadaTexto) => {
    const palavras = t.texto.split(/\s+/).filter(Boolean);
    if (palavras.length < 2) return;
    const total = palavras.reduce((s, p) => s + p.length + 1, 0);
    let x = t.x;
    let n = 1;
    for (const p of palavras) {
      while (doc.camadas.some((c) => c.nome === `${PREFIXO_TEXTO_NOVO}${n}`)) n++;
      const w = (t.w * (p.length + 1)) / total;
      const { id: _id, ...resto } = t;
      adicionar({ ...resto, id: `${PREFIXO_TEXTO_NOVO}${n}`, nome: `${PREFIXO_TEXTO_NOVO}${n}`, texto: p, x, w, alinhamento: 'center', caber: true } as Camada);
      x += w; n++;
    }
    mudar(t.nome, { visivel: false });
  };

  return (
    <div className="space-y-3" data-testid="painel-da-logo">
      {/* O CÍRCULO da logo: ícone ou a logo do cliente */}
      {circulo && (
        <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-2.5">
          <p className="text-xs font-bold text-white">Círculo da logo</p>
          <GaleriaDeIcones atual={circulo.src} aoEscolher={(src) => mudar('Logo no círculo', { src, ajuste: 'conter', visivel: true } as Partial<Camada>)} />
          <button type="button" onClick={porLogoNoCirculo} className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-[#5D1BFF] text-xs font-semibold text-white hover:bg-[#8A2EFF]" data-testid="logo-circulo-sua-logo">
            <ImagePlus className="h-4 w-4" />Pôr sua logo (pasta Logos, galeria ou arquivos)
          </button>
          <Faixa t="Tamanho no círculo" valor={Math.round(circulo.w)} min={Math.round((base?.h ?? 600) * 0.08)} max={Math.round((base?.h ?? 600) * 0.4)} sufixo="px"
            onChange={(v) => mudar('Logo no círculo', { x: circulo.x + (circulo.w - v) / 2, y: circulo.y + (circulo.h - v) / 2, w: v, h: v })} />
        </div>
      )}

      {/* OS ÍCONES soltos da logo (comprimidos, trigo, taças…) e os que o cliente adiciona */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-white">Ícones da logo</p>
        {icones.map((i) => (
          <div key={i.nome} className={cn('space-y-2 rounded-xl border border-white/10 bg-black/20 p-2.5', !i.visivel && 'opacity-60')} data-testid="logo-icone-camada">
            <div className="flex items-center gap-1">
              <img src={i.src} alt="" className="h-9 w-9 rounded-md bg-[#2a1458] object-contain p-0.5" />
              <span className="mr-auto truncate text-[11px] font-semibold text-slate-300">{ROTULO[i.nome] ?? i.nome.replace('Logo – ', '')}</span>
              <button type="button" onClick={() => setTrocandoIcone(trocandoIcone === i.nome ? null : i.nome)} title="Trocar pela galeria de ícones" aria-label="Trocar ícone" className="rounded-md p-1.5 text-slate-200 hover:bg-white/10" data-testid="logo-trocar-icone"><Repeat className="h-4 w-4" /></button>
              {selecionar && <button type="button" onClick={() => selecionar(i.nome)} title="Mover, girar e aumentar na tela" aria-label="Mover na tela" className="rounded-md p-1.5 text-slate-200 hover:bg-white/10"><Move className="h-4 w-4" /></button>}
              <button type="button" onClick={() => mudar(i.nome, { visivel: !i.visivel })} title={i.visivel ? 'Esconder' : 'Mostrar'} aria-label={i.visivel ? 'Esconder' : 'Mostrar'} className="rounded-md p-1.5 text-slate-200 hover:bg-white/10">{i.visivel ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>
              {/^Logo – ícone \d+$/.test(i.nome) && <button type="button" onClick={() => tirar(i.nome)} title="Apagar este ícone" aria-label="Apagar este ícone" className="rounded-md p-1.5 text-rose-300 hover:bg-rose-500/15"><Trash2 className="h-4 w-4" /></button>}
            </div>
            {trocandoIcone === i.nome && <GaleriaDeIcones atual={i.src} aoEscolher={(src) => { mudar(i.nome, { src, visivel: true } as Partial<Camada>); setTrocandoIcone(null); }} />}
            <div className="grid grid-cols-2 gap-2">
              <Faixa t="Tamanho" valor={Math.round(i.w)} min={Math.round((base?.h ?? 600) * 0.08)} max={Math.round((base?.h ?? 600) * 0.7)} sufixo="px" onChange={(v) => mudar(i.nome, { x: i.x + (i.w - v) / 2, y: i.y + (i.h - v) / 2, w: v, h: v })} />
              <Faixa t="Girar" valor={Math.round(i.rot)} min={-180} max={180} sufixo="°" onChange={(v) => mudar(i.nome, { rot: v })} />
            </div>
            <Faixa t="Cor (tom)" valor={i.matiz ?? 0} min={-180} max={180} sufixo="°" onChange={(v) => mudar(i.nome, { matiz: v } as Partial<Camada>)} />
          </div>
        ))}
        {trocandoIcone === '+' ? <GaleriaDeIcones aoEscolher={novoIcone} /> : (
          <button type="button" onClick={() => setTrocandoIcone('+')} className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#B04DFF]/60 text-xs font-semibold text-white hover:bg-[#5D1BFF]/20" data-testid="logo-adicionar-icone">
            <Plus className="h-4 w-4" />Adicionar ícone na logo (galeria por segmento)
          </button>
        )}
      </div>

      {/* OS TEXTOS da logo */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-white">Textos da logo</p>
        {textos.map((t) => (
          <div key={t.nome} className={cn('space-y-2 rounded-xl border border-white/10 bg-black/20 p-2.5', !t.visivel && 'opacity-60')} data-testid="logo-texto">
            <div className="flex items-center gap-1">
              <span className="mr-auto truncate text-[11px] font-semibold text-slate-300">{ROTULO[t.nome] ?? t.nome.replace('Logo – ', '')}</span>
              {selecionar && <button type="button" onClick={() => selecionar(t.nome)} title="Mover, girar e aumentar na tela" aria-label="Mover na tela" className="rounded-md p-1.5 text-slate-200 hover:bg-white/10"><Move className="h-4 w-4" /></button>}
              {t.texto.trim().includes(' ') && <button type="button" onClick={() => separar(t)} title="Separar as palavras (cada uma se move sozinha)" aria-label="Separar palavras" className="rounded-md p-1.5 text-slate-200 hover:bg-white/10" data-testid="logo-separar"><Scissors className="h-4 w-4" /></button>}
              <button type="button" onClick={() => mudar(t.nome, { visivel: !t.visivel })} title={t.visivel ? 'Esconder' : 'Mostrar'} aria-label={t.visivel ? 'Esconder' : 'Mostrar'} className="rounded-md p-1.5 text-slate-200 hover:bg-white/10">{t.visivel ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>
              {t.nome.startsWith(PREFIXO_TEXTO_NOVO) && <button type="button" onClick={() => tirar(t.nome)} title="Apagar este texto" aria-label="Apagar este texto" className="rounded-md p-1.5 text-rose-300 hover:bg-rose-500/15"><Trash2 className="h-4 w-4" /></button>}
            </div>
            <input value={t.texto} onChange={(e) => mudar(t.nome, { texto: e.target.value })} className={cn(campo, 'font-bold')} aria-label={`Texto: ${ROTULO[t.nome] ?? t.nome}`} data-testid="logo-texto-campo" />
            <details className="rounded-lg bg-white/[.03] px-2 py-1.5">
              <summary className="cursor-pointer text-[11px] font-semibold text-slate-200">Cor e borda do texto</summary>
              <div className="space-y-2 pt-2">
              <Cor t="Cor" valor={t.degrade?.de ?? t.cor} onChange={(v) => mudar(t.nome, { cor: v, degrade: null })} doc={doc} />
              <Cor t="Borda" valor={t.contorno?.cor ?? '#000000'} onChange={(v) => mudar(t.nome, { contorno: { cor: v, largura: t.contorno?.largura || Math.max(2, Math.round(t.tamanho * 0.05)) }, sombra: t.sombra ? { ...t.sombra, cor: v } : t.sombra })} doc={doc} />
              </div>
            </details>
            <Faixa t="Tamanho" valor={Math.round(t.tamanho)} min={8} max={Math.max(60, Math.round(t.tamanho * 2))} sufixo="px" onChange={(v) => mudar(t.nome, { tamanho: v })} />
          </div>
        ))}
        <button type="button" onClick={novoTexto} className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#B04DFF]/60 text-xs font-semibold text-white hover:bg-[#5D1BFF]/20" data-testid="logo-adicionar-texto">
          <Plus className="h-4 w-4" />Adicionar texto na logo
        </button>
      </div>

      {/* a cor da fita e do aro */}
      {base && <Faixa t="Cor da fita e do aro (tom)" valor={base.matiz ?? 0} min={-180} max={180} sufixo="°" onChange={(v) => mudar('Logo – base', { matiz: v } as Partial<Camada>)} />}
    </div>
  );
}
