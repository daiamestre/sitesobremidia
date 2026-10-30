/**
 * SOBRE MÍDIA STUDIO — painéis do editor de camadas (F-221): PROPRIEDADES da camada escolhida (texto, fonte, cor,
 * degradê, contorno, sombra, fundo, foto com zoom/enquadramento/filtros, forma, selo, lista) e a lista de CAMADAS
 * (ordem, mostrar/ocultar, travar, duplicar, apagar).
 */
import type { ReactNode } from 'react';
import {
  AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, Circle, Copy, Eye, EyeOff, FlipHorizontal, Image as ImageIcon,
  List, Lock, LockOpen, Square, Ticket, Trash2, Type,
} from 'lucide-react';
import { FONTES_STUDIO, fonteDoStudio } from '@/lib/studio/fontes';
import type { Camada, CamadaForma, CamadaImagem, CamadaItens, CamadaSelo, CamadaTexto, Degrade, Documento, Sombra } from '@/lib/studio/documento';
import { cn } from '@/lib/utils';

export const campo = 'w-full rounded-lg border border-white/10 bg-[#0f0428] px-2.5 py-1.5 text-sm text-white placeholder:text-slate-500 focus:border-[#8A2EFF] focus:outline-none';
const Rot = ({ t, children, className }: { t: string; children: ReactNode; className?: string }) => (
  <label className={cn('block space-y-1', className)}><span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t}</span>{children}</label>
);
/** input de cor só aceita #rrggbb: cores com transparência mostram a base */
const hex = (c: string | null | undefined) => (c && /^#[0-9a-f]{6}/i.test(c) ? c.slice(0, 7) : '#000000');
function Cor({ t, valor, onChange }: { t: string; valor: string; onChange: (v: string) => void }) {
  return <Rot t={t}><input type="color" value={hex(valor)} onChange={(e) => onChange(e.target.value)} className="h-9 w-full cursor-pointer rounded-lg border border-white/10 bg-transparent" /></Rot>;
}
function Num({ t, valor, onChange, min, max, passo = 1 }: { t: string; valor: number; onChange: (v: number) => void; min?: number; max?: number; passo?: number }) {
  return <Rot t={t}><input type="number" value={Math.round(valor * 100) / 100} min={min} max={max} step={passo} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(v); }} className={campo} /></Rot>;
}
function Faixa({ t, valor, onChange, min, max, passo = 1, sufixo = '' }: { t: string; valor: number; onChange: (v: number) => void; min: number; max: number; passo?: number; sufixo?: string }) {
  return <Rot t={`${t} (${Math.round(valor * 100) / 100}${sufixo})`}><input type="range" min={min} max={max} step={passo} value={valor} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#8A2EFF]" /></Rot>;
}
function Chave({ t, ligado, onChange }: { t: string; ligado: boolean; onChange: (v: boolean) => void }) {
  return <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-200"><input type="checkbox" checked={ligado} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[#8A2EFF]" />{t}</label>;
}
const Grupo = ({ t, children }: { t: string; children: ReactNode }) => (
  <div className="space-y-2 border-t border-white/5 pt-3"><p className="text-[11px] font-bold text-[#B04DFF]">{t}</p>{children}</div>
);

function EditorDegrade({ d, cor, onChange }: { d: Degrade | null | undefined; cor: string; onChange: (d: Degrade | null) => void }) {
  return (
    <>
      <Chave t="Degradê" ligado={!!d} onChange={(v) => onChange(v ? { de: hex(cor), para: '#ffffff', angulo: 90 } : null)} />
      {d && (
        <div className="grid grid-cols-3 gap-2">
          <Cor t="De" valor={d.de} onChange={(v) => onChange({ ...d, de: v })} />
          <Cor t="Meio" valor={d.meio ?? d.de} onChange={(v) => onChange({ ...d, meio: v })} />
          <Cor t="Para" valor={d.para} onChange={(v) => onChange({ ...d, para: v })} />
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
        <div className="grid grid-cols-2 gap-2">
          <Cor t="Cor" valor={s.cor} onChange={(v) => onChange({ ...s, cor: v })} />
          <Faixa t="Desfoque" valor={s.desfoque} min={0} max={120} onChange={(v) => onChange({ ...s, desfoque: v })} />
          <Faixa t="Deslocar →" valor={s.dx} min={-60} max={60} onChange={(v) => onChange({ ...s, dx: v })} />
          <Faixa t="Deslocar ↓" valor={s.dy} min={-60} max={60} onChange={(v) => onChange({ ...s, dy: v })} />
        </div>
      )}
    </>
  );
}

interface PropsProps {
  c: Camada;
  doc: Documento;
  mudar: (patch: Partial<Camada>) => void;
  onTrocarImagem: () => void;
  textoRef?: React.Ref<HTMLTextAreaElement>;
}

export function PainelPropriedades({ c, doc, mudar, onTrocarImagem, textoRef }: PropsProps) {
  const m = <T extends Camada>(p: Partial<T>) => mudar(p as Partial<Camada>);
  return (
    <div className="space-y-3 text-sm" data-testid="studio-propriedades">
      {c.tipo === 'texto' && <PropsTexto c={c} m={m} textoRef={textoRef} />}
      {c.tipo === 'forma' && <PropsForma c={c} m={m} />}
      {c.tipo === 'imagem' && <PropsImagem c={c} m={m} onTrocar={onTrocarImagem} />}
      {c.tipo === 'selo' && <PropsSelo c={c} m={m} />}
      {c.tipo === 'itens' && <PropsItens c={c} m={m} />}
      <Grupo t="Posição e tamanho">
        <div className="grid grid-cols-4 gap-2">
          <Num t="X" valor={c.x} onChange={(v) => mudar({ x: v })} />
          <Num t="Y" valor={c.y} onChange={(v) => mudar({ y: v })} />
          <Num t="Largura" valor={c.w} min={8} onChange={(v) => mudar({ w: Math.max(8, v) })} />
          <Num t="Altura" valor={c.h} min={8} onChange={(v) => mudar({ h: Math.max(8, v) })} />
        </div>
        <Faixa t="Girar" valor={c.rot} min={-180} max={180} sufixo="°" onChange={(v) => mudar({ rot: v })} />
        <Faixa t="Transparência" valor={Math.round(c.opacidade * 100)} min={0} max={100} sufixo="%" onChange={(v) => mudar({ opacidade: v / 100 })} />
        <div className="grid grid-cols-6 gap-1" aria-label="Alinhar na arte">
          {([['Esquerda', { x: 0 }], ['Centro', { x: Math.round((tamanho(doc).w - c.w) / 2) }], ['Direita', { x: tamanho(doc).w - c.w }],
            ['Topo', { y: 0 }], ['Meio', { y: Math.round((tamanho(doc).h - c.h) / 2) }], ['Base', { y: tamanho(doc).h - c.h }]] as const).map(([n, p]) => (
            <button key={n} type="button" onClick={() => mudar(p)} className="rounded-md border border-white/10 py-1 text-[10px] text-slate-200 hover:bg-white/5">{n}</button>
          ))}
        </div>
      </Grupo>
      <Grupo t="Efeitos"><EditorSombra s={c.sombra} onChange={(s) => mudar({ sombra: s })} /></Grupo>
    </div>
  );
}
const tamanho = (d: Documento) => (d.formato === '16:9' ? { w: 1920, h: 1080 } : { w: 1080, h: 1920 });

function PropsTexto({ c, m, textoRef }: { c: CamadaTexto; m: (p: Partial<CamadaTexto>) => void; textoRef?: React.Ref<HTMLTextAreaElement> }) {
  const f = fonteDoStudio(c.fonte);
  return (
    <>
      <Rot t="Texto"><textarea ref={textoRef} value={c.texto} onChange={(e) => m({ texto: e.target.value })} rows={3} className={cn(campo, 'resize-y')} data-testid="studio-texto" /></Rot>
      <div className="grid grid-cols-[1fr_88px] gap-2">
        <Rot t="Fonte">
          <select value={c.fonte} onChange={(e) => m({ fonte: e.target.value, peso: undefined })} className={campo} data-testid="studio-fonte">
            {FONTES_STUDIO.map((x) => <option key={x.id} value={x.id} className="bg-[#140632]">{x.nome}</option>)}
          </select>
        </Rot>
        <Num t="Tamanho" valor={c.tamanho} min={8} max={600} onChange={(v) => m({ tamanho: Math.max(8, v) })} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {f.pesos.length > 1 && (
          <select value={c.peso ?? Math.max(...f.pesos)} onChange={(e) => m({ peso: Number(e.target.value) })} className={cn(campo, 'w-auto')} aria-label="Peso">
            {f.pesos.map((p) => <option key={p} value={p} className="bg-[#140632]">{p === 900 ? 'Black' : p >= 800 ? 'Extra negrito' : p >= 700 ? 'Negrito' : p >= 600 ? 'Seminegrito' : 'Médio'}</option>)}
          </select>
        )}
        {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([a, I]) => (
          <button key={a} type="button" onClick={() => m({ alinhamento: a })} aria-pressed={c.alinhamento === a} aria-label={`Alinhar ${a}`}
            className={cn('rounded-md border p-1.5', c.alinhamento === a ? 'border-[#8A2EFF] bg-[#5D1BFF]/40' : 'border-white/10 hover:bg-white/5')}><I className="h-4 w-4" /></button>
        ))}
        <button type="button" onClick={() => m({ italico: !c.italico })} aria-pressed={c.italico} className={cn('rounded-md border px-2 py-1 text-xs italic', c.italico ? 'border-[#8A2EFF] bg-[#5D1BFF]/40' : 'border-white/10')}>I</button>
        <button type="button" onClick={() => m({ maiusculas: !c.maiusculas })} aria-pressed={c.maiusculas} className={cn('rounded-md border px-2 py-1 text-xs', c.maiusculas ? 'border-[#8A2EFF] bg-[#5D1BFF]/40' : 'border-white/10')}>AA</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Cor t="Cor do texto" valor={c.cor} onChange={(v) => m({ cor: v })} />
        {c.corUltimaLinha !== undefined && c.corUltimaLinha !== null
          ? <Cor t="Cor da última linha" valor={c.corUltimaLinha} onChange={(v) => m({ corUltimaLinha: v })} />
          : <button type="button" onClick={() => m({ corUltimaLinha: '#ffd21f' })} className="self-end rounded-lg border border-white/10 py-2 text-[11px] text-slate-300 hover:bg-white/5">Última linha em outra cor</button>}
      </div>
      {c.corUltimaLinha && <button type="button" onClick={() => m({ corUltimaLinha: null })} className="text-[11px] text-slate-400 hover:text-white">Todas as linhas na mesma cor</button>}
      <div className="grid grid-cols-2 gap-2">
        <Faixa t="Espaço entre letras" valor={c.espacamento} min={-0.1} max={0.5} passo={0.01} onChange={(v) => m({ espacamento: v })} />
        <Faixa t="Altura da linha" valor={c.entrelinha} min={0.7} max={2} passo={0.05} onChange={(v) => m({ entrelinha: v })} />
      </div>
      <Grupo t="Estilo do texto">
        <EditorDegrade d={c.degrade} cor={c.cor} onChange={(d) => m({ degrade: d })} />
        <Chave t="Contorno" ligado={!!c.contorno} onChange={(v) => m({ contorno: v ? { cor: '#000000', largura: Math.max(2, Math.round(c.tamanho * 0.03)) } : null })} />
        {c.contorno && <div className="grid grid-cols-2 gap-2"><Cor t="Cor do contorno" valor={c.contorno.cor} onChange={(v) => m({ contorno: { ...c.contorno!, cor: v } })} /><Faixa t="Espessura" valor={c.contorno.largura} min={1} max={40} onChange={(v) => m({ contorno: { ...c.contorno!, largura: v } })} /></div>}
        <Chave t="Caixa / pílula atrás" ligado={!!c.fundo} onChange={(v) => m({ fundo: v ? { cor: '#ffd21f', raio: 40, margem: Math.round(c.tamanho * 0.8) } : null })} />
        {c.fundo && <div className="grid grid-cols-3 gap-2"><Cor t="Cor" valor={c.fundo.cor} onChange={(v) => m({ fundo: { ...c.fundo!, cor: v } })} /><Num t="Cantos" valor={c.fundo.raio} min={0} onChange={(v) => m({ fundo: { ...c.fundo!, raio: v } })} /><Num t="Margem" valor={c.fundo.margem} min={0} onChange={(v) => m({ fundo: { ...c.fundo!, margem: v } })} /></div>}
      </Grupo>
    </>
  );
}

function PropsForma({ c, m }: { c: CamadaForma; m: (p: Partial<CamadaForma>) => void }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-1">
        {([['retangulo', 'Retângulo', Square], ['elipse', 'Círculo / elipse', Circle]] as const).map(([f, n, I]) => (
          <button key={f} type="button" onClick={() => m({ forma: f })} aria-pressed={c.forma === f} className={cn('flex items-center justify-center gap-1.5 rounded-md border py-1.5 text-xs', c.forma === f ? 'border-[#8A2EFF] bg-[#5D1BFF]/40' : 'border-white/10')}><I className="h-3.5 w-3.5" />{n}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Cor t="Cor" valor={c.cor} onChange={(v) => m({ cor: v })} />
        <button type="button" onClick={() => m({ cor: 'rgba(0,0,0,0)', degrade: null })} className="self-end rounded-lg border border-white/10 py-2 text-[11px] text-slate-300 hover:bg-white/5">Sem preenchimento</button>
      </div>
      <EditorDegrade d={c.degrade} cor={c.cor} onChange={(d) => m({ degrade: d })} />
      {c.forma === 'retangulo' && <Faixa t="Cantos arredondados" valor={c.raio} min={0} max={Math.round(Math.min(c.w, c.h) / 2)} onChange={(v) => m({ raio: v })} />}
      <Faixa t="Inclinação" valor={c.inclinacao} min={-45} max={45} sufixo="°" onChange={(v) => m({ inclinacao: v })} />
      <Chave t="Borda" ligado={!!c.borda} onChange={(v) => m({ borda: v ? { cor: '#ffffff', largura: 6 } : null })} />
      {c.borda && <div className="grid grid-cols-2 gap-2"><Cor t="Cor da borda" valor={c.borda.cor} onChange={(v) => m({ borda: { ...c.borda!, cor: v } })} /><Faixa t="Espessura" valor={c.borda.largura} min={1} max={60} onChange={(v) => m({ borda: { ...c.borda!, largura: v } })} /></div>}
    </>
  );
}

function PropsImagem({ c, m, onTrocar }: { c: CamadaImagem; m: (p: Partial<CamadaImagem>) => void; onTrocar: () => void }) {
  return (
    <>
      <button type="button" onClick={onTrocar} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 py-2.5 text-sm text-slate-200 hover:border-[#FFD400] hover:text-[#FFD400]"><ImageIcon className="h-4 w-4" />Trocar pela minha foto</button>
      <Faixa t="Zoom" valor={c.zoom} min={1} max={4} passo={0.05} sufixo="x" onChange={(v) => m({ zoom: v })} />
      <div className="grid grid-cols-2 gap-2">
        <Faixa t="Enquadrar ↔" valor={c.focoX} min={0} max={100} sufixo="%" onChange={(v) => m({ focoX: v })} />
        <Faixa t="Enquadrar ↕" valor={c.focoY} min={0} max={100} sufixo="%" onChange={(v) => m({ focoY: v })} />
      </div>
      <Grupo t="Ajustes da foto">
        <Faixa t="Brilho" valor={c.brilho} min={30} max={200} sufixo="%" onChange={(v) => m({ brilho: v })} />
        <Faixa t="Contraste" valor={c.contraste} min={30} max={200} sufixo="%" onChange={(v) => m({ contraste: v })} />
        <Faixa t="Saturação" valor={c.saturacao} min={0} max={250} sufixo="%" onChange={(v) => m({ saturacao: v })} />
        <Faixa t="Desfoque" valor={c.desfoque} min={0} max={30} onChange={(v) => m({ desfoque: v })} />
        <Faixa t="Cantos arredondados" valor={c.raio} min={0} max={Math.round(Math.min(c.w, c.h) / 2)} onChange={(v) => m({ raio: v })} />
        <div className="flex gap-2">
          <button type="button" onClick={() => m({ espelhar: !c.espelhar })} className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-white/10 py-1.5 text-xs hover:bg-white/5"><FlipHorizontal className="h-3.5 w-3.5" />Espelhar</button>
          <button type="button" onClick={() => m({ brilho: 100, contraste: 100, saturacao: 100, desfoque: 0, zoom: 1, focoX: 50, focoY: 50 })} className="flex-1 rounded-md border border-white/10 py-1.5 text-xs hover:bg-white/5">Restaurar ajustes</button>
        </div>
      </Grupo>
    </>
  );
}

function PropsSelo({ c, m }: { c: CamadaSelo; m: (p: Partial<CamadaSelo>) => void }) {
  return (
    <>
      <div className="grid grid-cols-4 gap-2">
        <Rot t="Topo"><input className={campo} value={c.topo} maxLength={12} onChange={(e) => m({ topo: e.target.value })} /></Rot>
        <Rot t="Valor"><input className={campo} value={c.valor} maxLength={8} onChange={(e) => m({ valor: e.target.value })} /></Rot>
        <Rot t="Sufixo"><input className={campo} value={c.sufixo} maxLength={4} onChange={(e) => m({ sufixo: e.target.value })} /></Rot>
        <Rot t="Base"><input className={campo} value={c.base} maxLength={12} onChange={(e) => m({ base: e.target.value })} /></Rot>
      </div>
      <Rot t="Fonte do valor"><select value={c.fonte} onChange={(e) => m({ fonte: e.target.value })} className={campo}>{FONTES_STUDIO.map((x) => <option key={x.id} value={x.id} className="bg-[#140632]">{x.nome}</option>)}</select></Rot>
      <div className="grid grid-cols-3 gap-2">
        <Cor t="Fundo" valor={c.cor} onChange={(v) => m({ cor: v })} />
        <Cor t="Texto" valor={c.corTexto} onChange={(v) => m({ corTexto: v })} />
        <Cor t="Aro" valor={c.borda} onChange={(v) => m({ borda: v })} />
      </div>
    </>
  );
}

function PropsItens({ c, m }: { c: CamadaItens; m: (p: Partial<CamadaItens>) => void }) {
  return (
    <>
      <Rot t="Itens (um por linha)"><textarea value={c.itens.join('\n')} rows={3} onChange={(e) => m({ itens: e.target.value.split('\n').slice(0, 6) })} className={cn(campo, 'resize-y')} /></Rot>
      <div className="grid grid-cols-[1fr_88px] gap-2">
        <Rot t="Fonte"><select value={c.fonte} onChange={(e) => m({ fonte: e.target.value })} className={campo}>{FONTES_STUDIO.map((x) => <option key={x.id} value={x.id} className="bg-[#140632]">{x.nome}</option>)}</select></Rot>
        <Num t="Tamanho" valor={c.tamanho} min={10} max={160} onChange={(v) => m({ tamanho: Math.max(10, v) })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Cor t="Texto" valor={c.cor} onChange={(v) => m({ cor: v })} />
        <Cor t="Ícone" valor={c.destaque} onChange={(v) => m({ destaque: v })} />
      </div>
      <Chave t="Um embaixo do outro" ligado={c.vertical} onChange={(v) => m({ vertical: v })} />
    </>
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
  return (
    <ul className="max-h-72 space-y-1 overflow-y-auto pr-1" data-testid="studio-camadas">
      {lista.map((c) => {
        const I = ICONE[c.tipo];
        const ativa = c.id === sel;
        return (
          <li key={c.id} className={cn('flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs', ativa ? 'border-[#22d3ee] bg-[#22d3ee]/10' : 'border-white/5 bg-white/[0.03] hover:bg-white/5')}>
            <button type="button" onClick={() => onSelecionar(c.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-slate-100">
              <I className="h-3.5 w-3.5 shrink-0 text-[#B04DFF]" /><span className="truncate">{c.tipo === 'texto' ? (c.texto.split('\n')[0] || c.nome) : c.nome}</span>
            </button>
            {ativa && <>
              <button type="button" title="Trazer para a frente" onClick={() => mover(c.id, 'cima')} className="rounded p-1 hover:bg-white/10"><ArrowUp className="h-3.5 w-3.5" /></button>
              <button type="button" title="Mandar para trás" onClick={() => mover(c.id, 'baixo')} className="rounded p-1 hover:bg-white/10"><ArrowDown className="h-3.5 w-3.5" /></button>
              <button type="button" title="Para a frente de tudo" onClick={() => mover(c.id, 'topo')} className="rounded p-1 hover:bg-white/10"><ChevronsUp className="h-3.5 w-3.5" /></button>
              <button type="button" title="Para trás de tudo" onClick={() => mover(c.id, 'fundo')} className="rounded p-1 hover:bg-white/10"><ChevronsDown className="h-3.5 w-3.5" /></button>
              <button type="button" title="Duplicar" onClick={() => duplicar(c.id)} className="rounded p-1 hover:bg-white/10"><Copy className="h-3.5 w-3.5" /></button>
              <button type="button" title="Apagar" onClick={() => apagar(c.id)} className="rounded p-1 text-rose-300 hover:bg-white/10"><Trash2 className="h-3.5 w-3.5" /></button>
            </>}
            <button type="button" title={c.visivel ? 'Ocultar' : 'Mostrar'} onClick={() => mudar(c.id, { visivel: !c.visivel })} className="rounded p-1 text-slate-300 hover:bg-white/10">{c.visivel ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}</button>
            <button type="button" title={c.bloqueada ? 'Destravar' : 'Travar'} onClick={() => mudar(c.id, { bloqueada: !c.bloqueada })} className="rounded p-1 text-slate-300 hover:bg-white/10">{c.bloqueada ? <Lock className="h-3.5 w-3.5 text-[#FFD400]" /> : <LockOpen className="h-3.5 w-3.5" />}</button>
          </li>
        );
      })}
    </ul>
  );
}
