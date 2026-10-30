import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { CAMERAS, type EdicaoCena } from '../../../supabase/functions/_shared/studio/contrato.ts';

const FONTES: { id: EdicaoCena['fonte']; nome: string }[] = [
  { id: 'anton', nome: 'Anton (condensada)' }, { id: 'bebas', nome: 'Bebas Neue' }, { id: 'montserrat', nome: 'Montserrat Black' },
  { id: 'fira-condensed', nome: 'Fira Condensed' }, { id: 'poppins', nome: 'Poppins' },
];
const POSICOES: { id: EdicaoCena['texto_pos']; nome: string }[] = [
  { id: 'esquerda', nome: 'Esquerda' }, { id: 'direita', nome: 'Direita' }, { id: 'centro', nome: 'Centro' }, { id: 'topo', nome: 'Topo' }, { id: 'base', nome: 'Base' },
];
const sel = 'h-9 w-full rounded-md border border-white/10 bg-white/5 px-2 text-sm text-white';

function Linha({ rotulo, valor, children }: { rotulo: string; valor?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400"><Label>{rotulo}</Label>{valor && <span className="text-slate-300">{valor}</span>}</div>
      {children}
    </div>
  );
}

/** Camadas editáveis de uma cena. Preço não é editável aqui: vem sempre do cadastro do produto no pedido. */
export function EditorCena({ edicao, onChange, temPreco, temRecorte }: { edicao: EdicaoCena; onChange: (e: EdicaoCena) => void; temPreco: boolean; temRecorte: boolean }) {
  const m = (c: Partial<EdicaoCena>) => onChange({ ...edicao, ...c });
  return (
    <div className="grid gap-4 sm:grid-cols-2" data-testid="studio-editor">
      <Linha rotulo="Título"><Input className="border-white/10 bg-white/5 text-white" maxLength={70} value={edicao.titulo} onChange={(e) => m({ titulo: e.target.value })} /></Linha>
      <Linha rotulo="Subtítulo"><Input className="border-white/10 bg-white/5 text-white" maxLength={90} value={edicao.subtitulo} onChange={(e) => m({ subtitulo: e.target.value })} /></Linha>
      <Linha rotulo="Posição do texto">
        <select className={sel} value={edicao.texto_pos} onChange={(e) => m({ texto_pos: e.target.value as EdicaoCena['texto_pos'] })}>{POSICOES.map((p) => <option key={p.id} value={p.id} className="bg-slate-900">{p.nome}</option>)}</select>
      </Linha>
      <Linha rotulo="Fonte do título">
        <select className={sel} value={edicao.fonte} onChange={(e) => m({ fonte: e.target.value as EdicaoCena['fonte'] })}>{FONTES.map((p) => <option key={p.id} value={p.id} className="bg-slate-900">{p.nome}</option>)}</select>
      </Linha>
      <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2 sm:col-span-2">
        <span className="text-xs text-slate-300">Mostrar o preço do produto {temPreco ? '' : '(este produto não tem preço)'}</span>
        <Switch checked={edicao.mostrar_preco && temPreco} disabled={!temPreco} onCheckedChange={(v) => m({ mostrar_preco: v })} />
      </div>
      {temRecorte && (
        <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2 sm:col-span-2">
          <span className="text-xs text-slate-300">Produto recortado (desligue para usar a foto inteira em moldura)</span>
          <Switch checked={edicao.usar_recorte} onCheckedChange={(v) => m({ usar_recorte: v })} />
        </div>
      )}
      <Linha rotulo="Produto · horizontal" valor={`${edicao.produto_x}%`}><Slider min={0} max={100} step={1} value={[edicao.produto_x]} onValueChange={([v]) => m({ produto_x: v })} /></Linha>
      <Linha rotulo="Produto · vertical" valor={`${edicao.produto_y}%`}><Slider min={0} max={100} step={1} value={[edicao.produto_y]} onValueChange={([v]) => m({ produto_y: v })} /></Linha>
      <Linha rotulo="Produto · tamanho" valor={`${edicao.produto_altura}%`}><Slider min={10} max={95} step={1} value={[edicao.produto_altura]} onValueChange={([v]) => m({ produto_altura: v })} /></Linha>
      <Linha rotulo="Escurecer o fundo" valor={`${Math.round(edicao.escurecer_fundo * 100)}%`}><Slider min={0} max={0.8} step={0.05} value={[edicao.escurecer_fundo]} onValueChange={([v]) => m({ escurecer_fundo: v })} /></Linha>
      <Linha rotulo="Fundo · enquadramento horizontal" valor={`${edicao.fundo_x}%`}><Slider min={0} max={100} step={1} value={[edicao.fundo_x]} onValueChange={([v]) => m({ fundo_x: v })} /></Linha>
      <Linha rotulo="Fundo · enquadramento vertical" valor={`${edicao.fundo_y}%`}><Slider min={0} max={100} step={1} value={[edicao.fundo_y]} onValueChange={([v]) => m({ fundo_y: v })} /></Linha>
      <div className="grid grid-cols-3 gap-3 sm:col-span-2">
        {([['cor_destaque', 'Destaque'], ['cor_texto', 'Texto'], ['cor_selo', 'Selo do preço']] as const).map(([k, nome]) => (
          <Linha key={k} rotulo={nome}>
            <input type="color" aria-label={nome} className="h-9 w-full cursor-pointer rounded-md border border-white/10 bg-transparent" value={edicao[k]} onChange={(e) => m({ [k]: e.target.value.toUpperCase() } as Partial<EdicaoCena>)} />
          </Linha>
        ))}
      </div>
      <Linha rotulo="Duração da cena" valor={`${edicao.duracao_s} s`}><Slider min={2} max={30} step={0.5} value={[edicao.duracao_s]} onValueChange={([v]) => m({ duracao_s: v })} /></Linha>
      <Linha rotulo="Movimento de câmera">
        <select className={sel} value={edicao.camera} onChange={(e) => m({ camera: e.target.value as EdicaoCena['camera'] })}>{CAMERAS.map((c) => <option key={c.id} value={c.id} className="bg-slate-900">{c.nome}</option>)}</select>
      </Linha>
    </div>
  );
}
