/**
 * SOBRE MÍDIA STUDIO — ferramentas do editor de camadas (F-221, reorganizado no F-224 para tablet e celular).
 * Cada elemento escolhido mostra BOTÕES grandes (Texto, Cor, Formatar, Ajustes, Enquadrar, Efeitos, Posição…) e cada
 * botão abre um CARTÃO compacto com os controles daquele assunto, com o valor em % ao lado de cada régua.
 * Também a lista de CAMADAS (ordem, mostrar/ocultar, travar, duplicar, apagar).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, Circle, Copy, Crop, Eye, EyeOff, Image as ImageIcon, Layers,
  Clapperboard, Film, List, Lock, LockOpen, Minus, Move, Palette, PaintBucket, Plus, Shapes, Sparkles, Square, SunMedium, Ticket, Trash2, Type, Pilcrow,
} from 'lucide-react';
import { FONTES_STUDIO, fonteDoStudio } from '@/lib/studio/fontes';
import { PALETA, corHex, coresDoDocumento, coresRecentes, lembrarCor } from '@/lib/studio/cores';
import { ANIMACOES, duracaoDoVideo, type TipoDeAnimacao } from '@/lib/studio/animacao';
import type { Camada, CamadaForma, CamadaImagem, CamadaItens, CamadaSelo, CamadaTexto, Degrade, Documento, Sombra } from '@/lib/studio/documento';
import { cn } from '@/lib/utils';

export const campo = 'w-full rounded-lg border border-white/10 bg-[#0f0428] px-2.5 py-2 text-sm text-white placeholder:text-slate-500 focus:border-[#8A2EFF] focus:outline-none';
const Rot = ({ t, children, className }: { t: string; children: ReactNode; className?: string }) => (
  <label className={cn('block space-y-1', className)}><span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t}</span>{children}</label>
);
const hex = (c: string | null | undefined) => corHex(c) ?? '#000000';

/** Cor: amostra (abre a paleta do aparelho), código e bolinhas com as últimas cores usadas, as da arte e a paleta. */
function Cor({ t, valor, onChange, doc }: { t: string; valor: string; onChange: (v: string) => void; doc?: Documento }) {
  const [recentes, setRecentes] = useState(coresRecentes);
  const espera = useRef<ReturnType<typeof setTimeout>>();
  const guardar = (c: string) => { lembrarCor(c); setRecentes(coresRecentes()); };
  const escolher = (c: string) => { onChange(c); guardar(c); };
  useEffect(() => () => clearTimeout(espera.current), []);
  const atual = corHex(valor);
  const daArte = doc ? coresDoDocumento(doc).filter((c) => !recentes.includes(c)) : [];
  const Bolinha = ({ c }: { c: string }) => (
    <button type="button" onClick={() => escolher(c)} aria-label={`Cor ${c}`} title={c}
      className={cn('h-7 w-7 shrink-0 rounded-full border-2 transition', atual === c ? 'border-[#22d3ee] scale-110' : 'border-white/20 hover:scale-110')} style={{ background: c }} />
  );
  return (
    <div className="space-y-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t}</span>
      <div className="flex items-center gap-2">
        <input type="color" value={hex(valor)} aria-label={t}
          onChange={(e) => { const v = e.target.value; onChange(v); clearTimeout(espera.current); espera.current = setTimeout(() => guardar(v), 700); }}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-white/15 bg-transparent" />
        <input value={atual ?? valor} onChange={(e) => { const v = e.target.value.trim(); if (/^#[0-9a-f]{6}$/i.test(v)) escolher(v.toLowerCase()); }}
          maxLength={7} aria-label={`${t} (código)`} className={cn(campo, 'w-24 font-mono uppercase')} />
      </div>
      {recentes.length > 0 && <div className="flex flex-wrap gap-1.5" aria-label="Últimas cores usadas">{recentes.map((c) => <Bolinha key={`r${c}`} c={c} />)}</div>}
      {daArte.length > 0 && <div className="flex flex-wrap gap-1.5" aria-label="Cores da arte">{daArte.map((c) => <Bolinha key={`a${c}`} c={c} />)}</div>}
      <div className="flex flex-wrap gap-1.5" aria-label="Paleta">{PALETA.map((c) => <Bolinha key={`p${c}`} c={c} />)}</div>
    </div>
  );
}
function Num({ t, valor, onChange, min, max, passo = 1 }: { t: string; valor: number; onChange: (v: number) => void; min?: number; max?: number; passo?: number }) {
  return <Rot t={t}><input type="number" inputMode="decimal" value={Math.round(valor * 100) / 100} min={min} max={max} step={passo} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(v); }} className={campo} /></Rot>;
}
/** Tamanho com − e + (fácil no dedo). */
function Tamanho({ valor, onChange, min = 8, max = 600 }: { valor: number; onChange: (v: number) => void; min?: number; max?: number }) {
  const passo = valor >= 100 ? 10 : valor >= 40 ? 4 : 2;
  const v = (n: number) => onChange(Math.min(max, Math.max(min, Math.round(n))));
  return (
    <div className="space-y-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Tamanho</span>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => v(valor - passo)} aria-label="Diminuir" className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 hover:bg-white/5"><Minus className="h-4 w-4" /></button>
        <input type="number" inputMode="numeric" value={Math.round(valor)} onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) v(n); }} className={cn(campo, 'w-16 text-center')} aria-label="Tamanho" />
        <button type="button" onClick={() => v(valor + passo)} aria-label="Aumentar" className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 hover:bg-white/5"><Plus className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
/** Régua com o nome à esquerda e o valor (em %, °, px…) à direita. */
function Faixa({ t, valor, onChange, min, max, passo = 1, sufixo = '', mostrar }: { t: string; valor: number; onChange: (v: number) => void; min: number; max: number; passo?: number; sufixo?: string; mostrar?: string }) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-[11px] font-semibold text-slate-300">{t}<span className="rounded-md bg-[#5D1BFF]/30 px-1.5 py-0.5 font-mono text-[11px] text-white">{mostrar ?? `${Math.round(valor * 100) / 100}${sufixo}`}</span></span>
      <input type="range" min={min} max={max} step={passo} value={valor} onChange={(e) => onChange(Number(e.target.value))} className="h-7 w-full cursor-pointer accent-[#8A2EFF]" aria-label={t} />
    </label>
  );
}
function Chave({ t, ligado, onChange }: { t: string; ligado: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={ligado} onClick={() => onChange(!ligado)}
      className={cn('flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm', ligado ? 'border-[#8A2EFF] bg-[#5D1BFF]/25 text-white' : 'border-white/10 text-slate-300 hover:bg-white/5')}>
      {t}<span className={cn('relative h-5 w-9 rounded-full transition', ligado ? 'bg-[#8A2EFF]' : 'bg-white/15')}><span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', ligado ? 'left-[18px]' : 'left-0.5')} /></span>
    </button>
  );
}
const Grupo = ({ t, children }: { t: string; children: ReactNode }) => (
  <div className="space-y-2 border-t border-white/5 pt-3 first:border-0 first:pt-0"><p className="text-[11px] font-bold text-[#B04DFF]">{t}</p>{children}</div>
);
const Segmento = ({ ativo, onClick, children, rotulo }: { ativo: boolean; onClick: () => void; children: ReactNode; rotulo: string }) => (
  <button type="button" onClick={onClick} aria-pressed={ativo} aria-label={rotulo} title={rotulo}
    className={cn('flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border text-xs', ativo ? 'border-[#8A2EFF] bg-[#5D1BFF]/40 text-white' : 'border-white/10 text-slate-200 hover:bg-white/5')}>{children}</button>
);

function EditorDegrade({ d, cor, onChange }: { d: Degrade | null | undefined; cor: string; onChange: (d: Degrade | null) => void }) {
  return (
    <>
      <Chave t="Degradê" ligado={!!d} onChange={(v) => onChange(v ? { de: hex(cor), para: '#ffffff', angulo: 90 } : null)} />
      {d && (
        <div className="space-y-2">
          <Cor t="Cor inicial" valor={d.de} onChange={(v) => onChange({ ...d, de: v })} />
          <Cor t="Cor final" valor={d.para} onChange={(v) => onChange({ ...d, para: v })} />
          <Faixa t="Ângulo" valor={d.angulo} min={0} max={360} sufixo="°" onChange={(v) => onChange({ ...d, angulo: v })} />
        </div>
      )}
    </>
  );
}

function EditorSombra({ s, onChange }: { s: Sombra | null | undefined; onChange: (s: Sombra | null) => void }) {
  return (
    <>
      <Chave t="Sombra / brilho (neon)" ligado={!!s} onChange={(v) => onChange(v ? { cor: 'rgba(0,0,0,.45)', desfoque: 24, dx: 0, dy: 8 } : null)} />
      {s && (
        <div className="space-y-2">
          <Cor t="Cor da sombra" valor={s.cor} onChange={(v) => onChange({ ...s, cor: v })} />
          <Faixa t="Desfoque" valor={s.desfoque} min={0} max={120} sufixo="px" onChange={(v) => onChange({ ...s, desfoque: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Faixa t="Deslocar →" valor={s.dx} min={-60} max={60} sufixo="px" onChange={(v) => onChange({ ...s, dx: v })} />
            <Faixa t="Deslocar ↓" valor={s.dy} min={-60} max={60} sufixo="px" onChange={(v) => onChange({ ...s, dy: v })} />
          </div>
        </div>
      )}
    </>
  );
}

// ───────────────────────────────────────────────────────────── botões de cada tipo de elemento
export type Aba = 'texto' | 'cor' | 'formatar' | 'efeitos' | 'ajustes' | 'enquadrar' | 'forma' | 'posicao' | 'camadas' | 'fundo' | 'animar' | 'video';
export interface DefAba { id: Aba; nome: string; I: typeof Type }
const A = (id: Aba, nome: string, I: typeof Type): DefAba => ({ id, nome, I });

/** Os cartões que cada tipo de elemento oferece (o primeiro abre sozinho ao escolher o elemento). */
export function abasDe(c: Camada | null): DefAba[] {
  const fim = [A('animar', 'Animar', Clapperboard), A('efeitos', 'Efeitos', Sparkles), A('posicao', 'Posição', Move), A('camadas', 'Camadas', Layers)];
  if (!c) return [A('fundo', 'Fundo', PaintBucket), A('video', 'Vídeo', Film), A('camadas', 'Camadas', Layers)];
  switch (c.tipo) {
    case 'texto': return [A('texto', 'Texto', Type), A('cor', 'Cor', Palette), A('formatar', 'Formatar', Pilcrow), ...fim];
    case 'imagem': return [A('ajustes', 'Ajustes', SunMedium), A('enquadrar', 'Enquadrar', Crop), ...fim];
    case 'forma': return [A('cor', 'Cor', Palette), A('forma', 'Formato', Shapes), ...fim];
    case 'selo': return [A('texto', 'Texto', Type), A('cor', 'Cor', Palette), ...fim];
    case 'itens': return [A('texto', 'Itens', List), A('cor', 'Cor', Palette), ...fim];
  }
}

interface CartaoProps {
  aba: Aba;
  c: Camada | null;
  doc: Documento;
  mudar: (patch: Partial<Camada>) => void;
  mudarFundo: (cor: string) => void;
  mover: (para: 'cima' | 'baixo' | 'topo' | 'fundo') => void;
  camadas: ReactNode;
  /** cartão do vídeo (ver animação, criar, salvar e publicar) — montado pelo editor */
  video?: ReactNode;
  textoRef?: React.Ref<HTMLTextAreaElement>;
}

/** O cartão do botão escolhido. */
export function CartaoDaAba({ aba, c, doc, mudar, mudarFundo, mover, camadas, video, textoRef }: CartaoProps) {
  if (aba === 'camadas') return <>{camadas}</>;
  if (aba === 'video') return <>{video}</>;
  if (aba === 'animar' && c) return <AnimarCamada c={c} doc={doc} mudar={mudar} />;
  if (aba === 'fundo' || !c) return <Cor t="Cor de fundo da arte" valor={doc.fundo} onChange={mudarFundo} doc={doc} />;
  const m = <T extends Camada>(p: Partial<T>) => mudar(p as Partial<Camada>);
  if (aba === 'posicao') return <PropsPosicao c={c} doc={doc} mudar={mudar} mover={mover} />;
  if (aba === 'efeitos') {
    return (
      <div className="space-y-3">
        {c.tipo === 'texto' && <EfeitosTexto c={c} m={m} />}
        <EditorSombra s={c.sombra} onChange={(s) => mudar({ sombra: s })} />
      </div>
    );
  }
  switch (c.tipo) {
    case 'texto': return aba === 'cor' ? <CorTexto c={c} m={m} doc={doc} /> : aba === 'formatar' ? <FormatarTexto c={c} m={m} /> : <PropsTexto c={c} m={m} textoRef={textoRef} />;
    case 'imagem': return aba === 'enquadrar' ? <EnquadrarImagem c={c} m={m} /> : <AjustesImagem c={c} m={m} />;
    case 'forma': return aba === 'forma' ? <FormatoForma c={c} m={m} /> : <CorForma c={c} m={m} doc={doc} />;
    case 'selo': return aba === 'cor' ? <CorSelo c={c} m={m} doc={doc} /> : <PropsSelo c={c} m={m} />;
    case 'itens': return aba === 'cor' ? <CorItens c={c} m={m} doc={doc} /> : <PropsItens c={c} m={m} />;
  }
}

/** F-225: movimento do elemento no vídeo (como as animações do Canva). */
function AnimarCamada({ c, doc, mudar }: { c: Camada; doc: Documento; mudar: (p: Partial<Camada>) => void }) {
  const a = c.animacao ?? null;
  const total = duracaoDoVideo(doc);
  const escolher = (tipo: TipoDeAnimacao | null) => mudar({ animacao: tipo ? { tipo, atraso: a?.atraso ?? 0.3, duracao: a?.duracao ?? 0.8 } : null });
  const opcoes = ANIMACOES.filter((x) => !x.so || x.so.includes(c.tipo));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-1.5" role="radiogroup" aria-label="Animação">
        <Segmento ativo={!a} onClick={() => escolher(null)} rotulo="Sem animação">Nenhuma</Segmento>
        {opcoes.map((x) => (
          <Segmento key={x.id} ativo={a?.tipo === x.id} onClick={() => escolher(x.id)} rotulo={x.nome}><span className="truncate">{x.nome}</span></Segmento>
        ))}
      </div>
      {a && (
        <>
          <Faixa t="Começa em" valor={a.atraso} min={0} max={Math.max(0, total - 0.5)} passo={0.1} mostrar={`${a.atraso.toFixed(1)} s`} onChange={(v) => mudar({ animacao: { ...a, atraso: v } })} />
          {!ANIMACOES.find((x) => x.id === a.tipo)?.continua && <Faixa t="Velocidade da entrada" valor={a.duracao} min={0.2} max={3} passo={0.1} mostrar={`${a.duracao.toFixed(1)} s`} onChange={(v) => mudar({ animacao: { ...a, duracao: v } })} />}
        </>
      )}
      <p className="text-[11px] text-slate-400">A arte continua sendo uma imagem. Com animação, use o botão <b>Vídeo</b> (toque fora dos elementos) para ver o movimento e criar o vídeo.</p>
    </div>
  );
}

function PropsPosicao({ c, doc, mudar, mover }: { c: Camada; doc: Documento; mudar: (p: Partial<Camada>) => void; mover: CartaoProps['mover'] }) {
  const { w: W, h: H } = doc.formato === '16:9' ? { w: 1920, h: 1080 } : { w: 1080, h: 1920 };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1.5" aria-label="Alinhar na arte">
        {([['Esquerda', { x: 0 }], ['Centro', { x: Math.round((W - c.w) / 2) }], ['Direita', { x: W - c.w }],
          ['Topo', { y: 0 }], ['Meio', { y: Math.round((H - c.h) / 2) }], ['Base', { y: H - c.h }]] as const).map(([n, p]) => (
          <button key={n} type="button" onClick={() => mudar(p)} className="h-10 rounded-lg border border-white/10 text-xs text-slate-200 hover:bg-white/5">{n}</button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-1.5" aria-label="Ordem">
        <Segmento ativo={false} onClick={() => mover('topo')} rotulo="Para a frente de tudo"><ChevronsUp className="h-4 w-4" /></Segmento>
        <Segmento ativo={false} onClick={() => mover('cima')} rotulo="Trazer para a frente"><ArrowUp className="h-4 w-4" /></Segmento>
        <Segmento ativo={false} onClick={() => mover('baixo')} rotulo="Mandar para trás"><ArrowDown className="h-4 w-4" /></Segmento>
        <Segmento ativo={false} onClick={() => mover('fundo')} rotulo="Para trás de tudo"><ChevronsDown className="h-4 w-4" /></Segmento>
      </div>
      <Faixa t="Girar" valor={c.rot} min={-180} max={180} sufixo="°" onChange={(v) => mudar({ rot: v })} />
      <Faixa t="Transparência" valor={Math.round(c.opacidade * 100)} min={0} max={100} sufixo="%" onChange={(v) => mudar({ opacidade: v / 100 })} />
      <div className="grid grid-cols-4 gap-1.5">
        <Num t="X" valor={c.x} onChange={(v) => mudar({ x: v })} />
        <Num t="Y" valor={c.y} onChange={(v) => mudar({ y: v })} />
        <Num t="Largura" valor={c.w} min={8} onChange={(v) => mudar({ w: Math.max(8, v) })} />
        <Num t="Altura" valor={c.h} min={8} onChange={(v) => mudar({ h: Math.max(8, v) })} />
      </div>
    </div>
  );
}

const Fonte = ({ valor, onChange }: { valor: string; onChange: (v: string) => void }) => (
  <Rot t="Fonte">
    <select value={valor} onChange={(e) => onChange(e.target.value)} className={campo} data-testid="studio-fonte">
      {FONTES_STUDIO.map((x) => <option key={x.id} value={x.id} className="bg-[#140632]">{x.nome}</option>)}
    </select>
  </Rot>
);

function PropsTexto({ c, m, textoRef }: { c: CamadaTexto; m: (p: Partial<CamadaTexto>) => void; textoRef?: React.Ref<HTMLTextAreaElement> }) {
  const f = fonteDoStudio(c.fonte);
  return (
    <div className="space-y-3">
      <Rot t="Texto"><textarea ref={textoRef} value={c.texto} onChange={(e) => m({ texto: e.target.value })} rows={3} className={cn(campo, 'resize-y text-base')} data-testid="studio-texto" /></Rot>
      <Fonte valor={c.fonte} onChange={(v) => m({ fonte: v, peso: undefined })} />
      <div className="flex flex-wrap items-end gap-3">
        <Tamanho valor={c.tamanho} onChange={(v) => m({ tamanho: v })} />
        {f.pesos.length > 1 && (
          <Rot t="Peso" className="min-w-[130px] flex-1">
            <select value={c.peso ?? Math.max(...f.pesos)} onChange={(e) => m({ peso: Number(e.target.value) })} className={campo} aria-label="Peso">
              {f.pesos.map((p) => <option key={p} value={p} className="bg-[#140632]">{p === 900 ? 'Black' : p >= 800 ? 'Extra negrito' : p >= 700 ? 'Negrito' : p >= 600 ? 'Seminegrito' : 'Médio'}</option>)}
            </select>
          </Rot>
        )}
      </div>
    </div>
  );
}

function CorTexto({ c, m, doc }: { c: CamadaTexto; m: (p: Partial<CamadaTexto>) => void; doc: Documento }) {
  const duas = c.corUltimaLinha !== undefined && c.corUltimaLinha !== null;
  return (
    <div className="space-y-3">
      <Cor t={duas ? 'Cor das primeiras linhas' : 'Cor do texto'} valor={c.cor} onChange={(v) => m({ cor: v })} doc={doc} />
      <Chave t="Última linha em outra cor" ligado={duas} onChange={(v) => m({ corUltimaLinha: v ? '#ffd21f' : null })} />
      {duas && <Cor t="Cor da última linha" valor={c.corUltimaLinha!} onChange={(v) => m({ corUltimaLinha: v })} doc={doc} />}
      <EditorDegrade d={c.degrade} cor={c.cor} onChange={(d) => m({ degrade: d })} />
      {c.degrade && <p className="text-[11px] text-amber-200">Com o degradê ligado, ele manda na cor do texto. Desligue para usar uma cor só.</p>}
    </div>
  );
}

function FormatarTexto({ c, m }: { c: CamadaTexto; m: (p: Partial<CamadaTexto>) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {([['left', AlignLeft, 'Alinhar à esquerda'], ['center', AlignCenter, 'Centralizar'], ['right', AlignRight, 'Alinhar à direita']] as const).map(([a, I, r]) => (
          <Segmento key={a} ativo={c.alinhamento === a} onClick={() => m({ alinhamento: a })} rotulo={r}><I className="h-4 w-4" /></Segmento>
        ))}
        <Segmento ativo={c.italico} onClick={() => m({ italico: !c.italico })} rotulo="Itálico"><span className="text-sm italic">I</span></Segmento>
        <Segmento ativo={c.maiusculas} onClick={() => m({ maiusculas: !c.maiusculas })} rotulo="Tudo maiúsculo"><span className="text-xs font-bold">AA</span></Segmento>
      </div>
      <Faixa t="Espaço entre letras" valor={c.espacamento} min={-0.1} max={0.5} passo={0.01} mostrar={`${Math.round(c.espacamento * 100)}%`} onChange={(v) => m({ espacamento: v })} />
      <Faixa t="Altura da linha" valor={c.entrelinha} min={0.7} max={2} passo={0.05} mostrar={`${Math.round(c.entrelinha * 100)}%`} onChange={(v) => m({ entrelinha: v })} />
    </div>
  );
}

function EfeitosTexto({ c, m }: { c: CamadaTexto; m: (p: Partial<CamadaTexto>) => void }) {
  return (
    <>
      <Chave t="Contorno" ligado={!!c.contorno} onChange={(v) => m({ contorno: v ? { cor: '#000000', largura: Math.max(2, Math.round(c.tamanho * 0.03)) } : null })} />
      {c.contorno && <div className="space-y-2"><Cor t="Cor do contorno" valor={c.contorno.cor} onChange={(v) => m({ contorno: { ...c.contorno!, cor: v } })} /><Faixa t="Espessura" valor={c.contorno.largura} min={1} max={40} sufixo="px" onChange={(v) => m({ contorno: { ...c.contorno!, largura: v } })} /></div>}
      <Chave t="Caixa / pílula atrás" ligado={!!c.fundo} onChange={(v) => m({ fundo: v ? { cor: '#ffd21f', raio: 40, margem: Math.round(c.tamanho * 0.8) } : null })} />
      {c.fundo && <div className="space-y-2"><Cor t="Cor da caixa" valor={c.fundo.cor} onChange={(v) => m({ fundo: { ...c.fundo!, cor: v } })} /><Faixa t="Cantos" valor={c.fundo.raio} min={0} max={120} sufixo="px" onChange={(v) => m({ fundo: { ...c.fundo!, raio: v } })} /><Faixa t="Margem" valor={c.fundo.margem} min={0} max={160} sufixo="px" onChange={(v) => m({ fundo: { ...c.fundo!, margem: v } })} /></div>}
    </>
  );
}

function CorForma({ c, m, doc }: { c: CamadaForma; m: (p: Partial<CamadaForma>) => void; doc: Documento }) {
  return (
    <div className="space-y-3">
      <Cor t="Cor" valor={c.cor} onChange={(v) => m({ cor: v })} doc={doc} />
      <button type="button" onClick={() => m({ cor: 'rgba(0,0,0,0)', degrade: null })} className="h-10 w-full rounded-lg border border-white/10 text-xs text-slate-300 hover:bg-white/5">Sem preenchimento</button>
      <EditorDegrade d={c.degrade} cor={c.cor} onChange={(d) => m({ degrade: d })} />
    </div>
  );
}

function FormatoForma({ c, m }: { c: CamadaForma; m: (p: Partial<CamadaForma>) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        <Segmento ativo={c.forma === 'retangulo'} onClick={() => m({ forma: 'retangulo' })} rotulo="Retângulo"><Square className="h-4 w-4" />Retângulo</Segmento>
        <Segmento ativo={c.forma === 'elipse'} onClick={() => m({ forma: 'elipse' })} rotulo="Círculo"><Circle className="h-4 w-4" />Círculo</Segmento>
      </div>
      {c.forma === 'retangulo' && <Faixa t="Cantos arredondados" valor={c.raio} min={0} max={Math.round(Math.min(c.w, c.h) / 2)} sufixo="px" onChange={(v) => m({ raio: v })} />}
      <Faixa t="Inclinação" valor={c.inclinacao} min={-45} max={45} sufixo="°" onChange={(v) => m({ inclinacao: v })} />
      <Chave t="Borda" ligado={!!c.borda} onChange={(v) => m({ borda: v ? { cor: '#ffffff', largura: 6 } : null })} />
      {c.borda && <div className="space-y-2"><Cor t="Cor da borda" valor={c.borda.cor} onChange={(v) => m({ borda: { ...c.borda!, cor: v } })} /><Faixa t="Espessura" valor={c.borda.largura} min={1} max={60} sufixo="px" onChange={(v) => m({ borda: { ...c.borda!, largura: v } })} /></div>}
    </div>
  );
}

function AjustesImagem({ c, m }: { c: CamadaImagem; m: (p: Partial<CamadaImagem>) => void }) {
  return (
    <div className="space-y-2">
      <Faixa t="Brilho" valor={c.brilho} min={30} max={200} sufixo="%" onChange={(v) => m({ brilho: v })} />
      <Faixa t="Contraste" valor={c.contraste} min={30} max={200} sufixo="%" onChange={(v) => m({ contraste: v })} />
      <Faixa t="Saturação" valor={c.saturacao} min={0} max={250} sufixo="%" onChange={(v) => m({ saturacao: v })} />
      <Faixa t="Desfoque" valor={c.desfoque} min={0} max={30} sufixo="px" onChange={(v) => m({ desfoque: v })} />
      <button type="button" onClick={() => m({ brilho: 100, contraste: 100, saturacao: 100, desfoque: 0 })} className="h-10 w-full rounded-lg border border-white/10 text-xs hover:bg-white/5">Restaurar ajustes</button>
    </div>
  );
}

function EnquadrarImagem({ c, m }: { c: CamadaImagem; m: (p: Partial<CamadaImagem>) => void }) {
  return (
    <div className="space-y-2">
      <Faixa t="Zoom" valor={c.zoom} min={1} max={4} passo={0.05} mostrar={`${Math.round(c.zoom * 100)}%`} onChange={(v) => m({ zoom: v })} />
      <Faixa t="Enquadrar ↔" valor={c.focoX} min={0} max={100} sufixo="%" onChange={(v) => m({ focoX: v })} />
      <Faixa t="Enquadrar ↕" valor={c.focoY} min={0} max={100} sufixo="%" onChange={(v) => m({ focoY: v })} />
      <Faixa t="Cantos arredondados" valor={c.raio} min={0} max={Math.round(Math.min(c.w, c.h) / 2)} sufixo="px" onChange={(v) => m({ raio: v })} />
      <button type="button" onClick={() => m({ zoom: 1, focoX: 50, focoY: 50 })} className="h-10 w-full rounded-lg border border-white/10 text-xs hover:bg-white/5">Centralizar a foto</button>
    </div>
  );
}

function PropsSelo({ c, m }: { c: CamadaSelo; m: (p: Partial<CamadaSelo>) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Rot t="Topo"><input className={campo} value={c.topo} maxLength={12} onChange={(e) => m({ topo: e.target.value })} /></Rot>
        <Rot t="Valor"><input className={campo} value={c.valor} maxLength={8} onChange={(e) => m({ valor: e.target.value })} /></Rot>
        <Rot t="Sufixo"><input className={campo} value={c.sufixo} maxLength={4} onChange={(e) => m({ sufixo: e.target.value })} /></Rot>
        <Rot t="Base"><input className={campo} value={c.base} maxLength={12} onChange={(e) => m({ base: e.target.value })} /></Rot>
      </div>
      <Fonte valor={c.fonte} onChange={(v) => m({ fonte: v })} />
    </div>
  );
}
function CorSelo({ c, m, doc }: { c: CamadaSelo; m: (p: Partial<CamadaSelo>) => void; doc: Documento }) {
  return (
    <div className="space-y-3">
      <Cor t="Fundo do selo" valor={c.cor} onChange={(v) => m({ cor: v })} doc={doc} />
      <Cor t="Texto do selo" valor={c.corTexto} onChange={(v) => m({ corTexto: v })} doc={doc} />
      <Cor t="Aro" valor={c.borda} onChange={(v) => m({ borda: v })} doc={doc} />
    </div>
  );
}

function PropsItens({ c, m }: { c: CamadaItens; m: (p: Partial<CamadaItens>) => void }) {
  return (
    <div className="space-y-3">
      <Rot t="Itens (um por linha)"><textarea value={c.itens.join('\n')} rows={3} onChange={(e) => m({ itens: e.target.value.split('\n').slice(0, 6) })} className={cn(campo, 'resize-y text-base')} /></Rot>
      <Fonte valor={c.fonte} onChange={(v) => m({ fonte: v })} />
      <Tamanho valor={c.tamanho} min={10} max={160} onChange={(v) => m({ tamanho: v })} />
      <Chave t="Um embaixo do outro" ligado={c.vertical} onChange={(v) => m({ vertical: v })} />
    </div>
  );
}
function CorItens({ c, m, doc }: { c: CamadaItens; m: (p: Partial<CamadaItens>) => void; doc: Documento }) {
  return (
    <div className="space-y-3">
      <Cor t="Cor do texto" valor={c.cor} onChange={(v) => m({ cor: v })} doc={doc} />
      <Cor t="Cor do ícone" valor={c.destaque} onChange={(v) => m({ destaque: v })} doc={doc} />
    </div>
  );
}

const ICONE: Record<Camada['tipo'], typeof Type> = { texto: Type, forma: Square, imagem: ImageIcon, selo: Ticket, itens: List };

interface CamadasProps {
  doc: Documento; sel: string | null; onSelecionar: (id: string) => void;
  mudar: (id: string, p: Partial<Camada>) => void; mover: (id: string, para: 'cima' | 'baixo' | 'topo' | 'fundo') => void;
  duplicar: (id: string) => void; apagar: (id: string) => void;
}

/** Lista de camadas: a de cima aparece primeiro (como no Photoshop/Canva). */
export function PainelCamadas({ doc, sel, onSelecionar, mudar, mover, duplicar, apagar }: CamadasProps) {
  const lista = [...doc.camadas].reverse();
  const B = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-white/10';
  return (
    <ul className="max-h-80 space-y-1 overflow-y-auto pr-1" data-testid="studio-camadas">
      {lista.map((c) => {
        const I = ICONE[c.tipo];
        const ativa = c.id === sel;
        return (
          <li key={c.id} className={cn('rounded-lg border px-2 py-1 text-xs', ativa ? 'border-[#22d3ee] bg-[#22d3ee]/10' : 'border-white/5 bg-white/[0.03] hover:bg-white/5')}>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => onSelecionar(c.id)} className="flex min-h-8 min-w-0 flex-1 items-center gap-1.5 text-left text-slate-100">
                <I className="h-4 w-4 shrink-0 text-[#B04DFF]" /><span className="truncate">{c.tipo === 'texto' ? (c.texto.split('\n')[0] || c.nome) : c.nome}</span>
              </button>
              <button type="button" title={c.visivel ? 'Ocultar' : 'Mostrar'} aria-label={c.visivel ? 'Ocultar' : 'Mostrar'} onClick={() => mudar(c.id, { visivel: !c.visivel })} className={cn(B, 'text-slate-300')}>{c.visivel ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>
              <button type="button" title={c.bloqueada ? 'Destravar' : 'Travar'} aria-label={c.bloqueada ? 'Destravar' : 'Travar'} onClick={() => mudar(c.id, { bloqueada: !c.bloqueada })} className={cn(B, 'text-slate-300')}>{c.bloqueada ? <Lock className="h-4 w-4 text-[#FFD400]" /> : <LockOpen className="h-4 w-4" />}</button>
            </div>
            {ativa && (
              <div className="mt-1 flex justify-end gap-1 border-t border-white/5 pt-1">
                <button type="button" title="Trazer para a frente" aria-label="Trazer para a frente" onClick={() => mover(c.id, 'cima')} className={B}><ArrowUp className="h-4 w-4" /></button>
                <button type="button" title="Mandar para trás" aria-label="Mandar para trás" onClick={() => mover(c.id, 'baixo')} className={B}><ArrowDown className="h-4 w-4" /></button>
                <button type="button" title="Duplicar" aria-label="Duplicar" onClick={() => duplicar(c.id)} className={B}><Copy className="h-4 w-4" /></button>
                <button type="button" title="Excluir" aria-label="Excluir" onClick={() => apagar(c.id)} className={cn(B, 'text-rose-300')}><Trash2 className="h-4 w-4" /></button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
