/**
 * F-257 — REGRA DO DONO: o produto entra por um campo só, com todas as perguntas: nome, marca, sabor, peso, preço e promoção.
 * Ao adicionar, a linha vai para a caixa de produtos, que continua podendo ser editada. Studio (Seus produtos, Palco) e Cartaz Digital.
 */
import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { CAMPOS_VAZIOS, UNIDADES_DO_CAMPO, linhaDoCampo, type CamposDoProduto } from '@/lib/tabloide/produtoCompleto';
import { cn } from '@/lib/utils';

export function NovoProduto({ aoAdicionar, escuro = false }: { aoAdicionar: (linha: string) => void; /** painel de fundo escuro do Studio */ escuro?: boolean }) {
  const [c, setC] = useState<CamposDoProduto>(CAMPOS_VAZIOS);
  const [erros, setErros] = useState<string[]>([]);
  const primeiro = useRef<HTMLInputElement>(null);
  const mudar = (x: Partial<CamposDoProduto>) => { setC((a) => ({ ...a, ...x })); setErros([]); };
  // F-279 (regra do dono): o produto SEMPRE entra; só o nome é preciso. O que faltar aparece depois, no aviso vermelho da lista
  const adicionar = () => {
    if (!c.nome.trim()) { setErros(['Escreva o nome do produto.']); primeiro.current?.focus(); return; }
    setErros([]);
    aoAdicionar(linhaDoCampo(c));
    setC({ ...CAMPOS_VAZIOS, unidade: c.unidade });
    primeiro.current?.focus();
  };
  const campo = cn('h-9 w-full min-w-0 rounded-md border px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary', escuro ? 'border-white/15 bg-black/30 text-white placeholder:text-slate-500' : 'border-input bg-background');
  const rotulo = cn('block min-w-0 text-[11px] font-semibold', escuro ? 'text-slate-300' : 'text-muted-foreground');
  const noEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } };
  return (
    <fieldset className={cn('space-y-2 rounded-lg border p-2', escuro ? 'border-[#FFD400]/40 bg-black/20' : 'bg-muted/30')} data-testid="novo-produto" onKeyDown={noEnter}>
      <legend className={cn('px-1 text-sm font-bold', escuro && 'text-[#FFD400]')}>Adicionar produto</legend>
      <div className="grid grid-cols-2 gap-2">
        <label className={cn(rotulo, 'col-span-2')}>Nome do produto
          <input ref={primeiro} className={campo} value={c.nome} onChange={(e) => mudar({ nome: e.target.value })} placeholder="Ex.: Biscoito Maizena" data-testid="novo-nome" maxLength={80} />
        </label>
        <label className={rotulo}>Marca
          <input className={campo} value={c.marca} onChange={(e) => mudar({ marca: e.target.value })} placeholder="Ex.: Vitarella" data-testid="novo-marca" maxLength={40} />
        </label>
        <label className={rotulo}>Sabor ou tipo <span className="font-normal opacity-70">(opcional)</span>
          <input className={campo} value={c.sabor} onChange={(e) => mudar({ sabor: e.target.value })} placeholder="Ex.: Tradicional" data-testid="novo-sabor" maxLength={40} />
        </label>
        <label className={rotulo}>Peso ou volume
          <input className={campo} value={c.quantidade} inputMode="decimal" onChange={(e) => mudar({ quantidade: e.target.value })} placeholder="Ex.: 350" data-testid="novo-quantidade" maxLength={8} />
        </label>
        <label className={rotulo}>Medida
          <select className={campo} value={c.unidade} onChange={(e) => mudar({ unidade: e.target.value })} data-testid="novo-unidade">
            {UNIDADES_DO_CAMPO.map((u) => <option key={u.valor} value={u.valor} className="text-black">{u.nome}</option>)}
          </select>
        </label>
        <label className={cn(rotulo, 'col-span-2 flex items-center gap-2')}>
          <input type="checkbox" className="h-4 w-4" checked={c.promocao} onChange={(e) => mudar({ promocao: e.target.checked })} data-testid="novo-promocao" /> É promoção?
          <span className="ml-3 flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={!!c.integral} onChange={(e) => mudar({ integral: e.target.checked })} data-testid="novo-integral" /> É integral? <span className="font-normal opacity-70">(leite, pão, iogurte, fitness)</span></span>
        </label>
        {c.promocao && (
          <label className={rotulo}>De (R$)
            <input className={campo} value={c.de} inputMode="decimal" onChange={(e) => mudar({ de: e.target.value })} placeholder="49,00" data-testid="novo-de" maxLength={10} />
          </label>
        )}
        <label className={cn(rotulo, !c.promocao && 'col-span-2')}>{c.promocao ? 'Por (R$)' : 'Preço (R$)'}
          <input className={campo} value={c.preco} inputMode="decimal" onChange={(e) => mudar({ preco: e.target.value })} placeholder="39,00" data-testid="novo-preco" maxLength={10} />
        </label>
      </div>
      {erros.length > 0 && (
        <ul role="alert" className="text-xs font-semibold text-red-500 motion-safe:animate-pulse" data-testid="novo-erros">{erros.map((e) => <li key={e}>{e}</li>)}</ul>
      )}
      <button type="button" onClick={adicionar} className="flex w-full items-center justify-center gap-1 rounded-md bg-primary py-2 text-sm font-bold text-primary-foreground hover:brightness-110" data-testid="novo-adicionar">
        <Plus className="h-4 w-4" /> Adicionar à lista
      </button>
    </fieldset>
  );
}
