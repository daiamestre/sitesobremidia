/**
 * F-292 — GALERIA DE PRODUTOS POR SEGMENTO (pedido do dono): ao lado do botão "Tocar" do palco e no cartão "Adicionar produto",
 * abre todos os produtos com foto do catálogo, separados por segmento (hortifrúti, açougue, frios, bebidas, adega, mercearia,
 * limpeza, beleza, pet, suplementos, eletrônicos, moda…). O cliente escolhe o segmento, procura, digita o preço (e o "de", se for
 * promoção) e toca em "Adicionar" em cada produto: ele entra na lista com a foto certa, na hora.
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { tabelaTabloide } from '@/lib/tabloide/db';
import { lerValor, type ImagemProduto } from '@/lib/tabloide/parseProdutos';
import { cn } from '@/lib/utils';

/** os segmentos da galeria: o filtro no catálogo (segmento do produto, com os nomes que as lojas usam) */
export const SEGMENTOS_DA_GALERIA: Array<{ id: string; nome: string; filtro: string }> = [
  { id: 'hortifruti', nome: 'Hortifrúti', filtro: 'segmento.eq.hortifruti' },
  { id: 'acougue', nome: 'Açougue', filtro: 'segmento.ilike.*açougue*,segmento.ilike.*acougue*,segmento.ilike.*carne*,segmento.ilike.*frango*,segmento.ilike.*aves*,segmento.ilike.*bovin*,segmento.ilike.*suín*' },
  { id: 'frios', nome: 'Frios e laticínios', filtro: 'segmento.ilike.*frios*,segmento.ilike.*embutid*,segmento.ilike.*laticín*,segmento.ilike.*queijo*,segmento.ilike.*iogurte*,segmento.ilike.*manteiga*' },
  { id: 'mercearia', nome: 'Mercearia', filtro: 'segmento.ilike.*mercearia*,segmento.ilike.*macarr*,segmento.ilike.*massa*,segmento.ilike.*molho*,segmento.ilike.*tempero*,segmento.ilike.*conserva*,segmento.ilike.*alimentos*,segmento.ilike.*grãos*,segmento.ilike.*arroz*,segmento.ilike.*óleo*' },
  { id: 'cafe', nome: 'Café e matinais', filtro: 'segmento.ilike.*café*,segmento.ilike.*cafe*,segmento.ilike.*matinai*,segmento.ilike.*achocolat*,segmento.ilike.*cereal*' },
  { id: 'biscoitos', nome: 'Biscoitos e doces', filtro: 'segmento.ilike.*biscoit*,segmento.ilike.*snack*,segmento.ilike.*salgadinh*,segmento.ilike.*doce*,segmento.ilike.*chocolate*,segmento.ilike.*bomboni*' },
  { id: 'bebidas', nome: 'Bebidas', filtro: 'segmento.ilike.*água*,segmento.ilike.*suco*,segmento.ilike.*refri*,segmento.ilike.*refresco*,segmento.ilike.*energétic*,segmento.ilike.*isotônic*' },
  { id: 'adega', nome: 'Adega', filtro: 'segmento.ilike.*vinho*,segmento.ilike.*cerveja*,segmento.ilike.*whisk*,segmento.ilike.*espumante*,segmento.ilike.*drink*,segmento.ilike.*vodka*,segmento.ilike.*gin*,segmento.ilike.*rum*,segmento.ilike.*cachaça*,segmento.ilike.*licor*,segmento.ilike.*destilad*' },
  { id: 'padaria', nome: 'Padaria', filtro: 'segmento.ilike.*padaria*,segmento.ilike.*pães*,segmento.ilike.*paes*,segmento.ilike.*bolo*,segmento.ilike.*panific*' },
  { id: 'limpeza', nome: 'Limpeza', filtro: 'segmento.ilike.*limpeza*,segmento.ilike.*amaciante*,segmento.ilike.*lava*,segmento.ilike.*sabão*,segmento.ilike.*desinfet*,segmento.ilike.*detergent*' },
  { id: 'beleza', nome: 'Beleza e higiene', filtro: 'segmento.ilike.*fragrân*,segmento.ilike.*perfum*,segmento.ilike.*beleza*,segmento.ilike.*higien*,segmento.ilike.*cabelo*,segmento.ilike.*maquiag*,segmento.ilike.*desodorant*,segmento.ilike.*shampoo*' },
  { id: 'farmacia', nome: 'Farmácia', filtro: 'segmento.ilike.*farmác*,segmento.ilike.*medicament*,segmento.ilike.*vitamin*,segmento.ilike.*saúde*' },
  { id: 'pet', nome: 'Pet', filtro: 'segmento.ilike.*pet*,segmento.ilike.*ração*,segmento.ilike.*cães*,segmento.ilike.*gatos*' },
  { id: 'suplementos', nome: 'Suplementos', filtro: 'segmento.ilike.*whey*,segmento.ilike.*suplement*,segmento.ilike.*proteín*,segmento.ilike.*creatina*,segmento.ilike.*pré-treino*' },
  { id: 'eletronicos', nome: 'Eletrônicos', filtro: 'segmento.ilike.*eletrônic*,segmento.ilike.*eletronic*,credito.ilike.*multilaser*' },
  { id: 'moda', nome: 'Moda', filtro: 'segmento.eq.moda,credito.ilike.*malwee*,credito.ilike.*olympikus*' },
];

interface ProdutoDaGaleria { nome: string; imagem_url: string; credito: string | null }

export function GaleriaDeProdutos({ aberto, aoFechar, aoAdicionar, segmentoInicial }: {
  aberto: boolean; aoFechar: () => void;
  /** entra na lista: o nome, o preço (e o "de"), com a foto já certa */
  aoAdicionar: (p: { nome: string; preco: number; precoDe: number | null; imagem: ImagemProduto }) => void;
  segmentoInicial?: string;
}) {
  const [seg, setSeg] = useState(() => SEGMENTOS_DA_GALERIA.find((s) => s.id === segmentoInicial)?.id ?? SEGMENTOS_DA_GALERIA[0].id);
  const [busca, setBusca] = useState('');
  const [itens, setItens] = useState<ProdutoDaGaleria[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [precos, setPrecos] = useState<Record<string, { por: string; de: string }>>({});
  const [adicionados, setAdicionados] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    setCarregando(true);
    const t = setTimeout(async () => {
      const filtro = SEGMENTOS_DA_GALERIA.find((s) => s.id === seg)?.filtro ?? '';
      let q = tabelaTabloide('tabloide_catalogo').select('nome, imagem_url, credito').eq('fonte', 'MARCA').is('cliente_id', null).or(filtro).order('nome').limit(120);
      if (busca.trim().length >= 2) q = q.ilike('nome', `%${busca.trim()}%`);
      const { data } = await q;
      if (!vivo) return;
      const vistos = new Set<string>();
      setItens(((data ?? []) as ProdutoDaGaleria[]).filter((p) => p.imagem_url && !vistos.has(p.nome.toLowerCase()) && vistos.add(p.nome.toLowerCase())));
      setCarregando(false);
    }, busca ? 300 : 0);
    return () => { vivo = false; clearTimeout(t); };
  }, [aberto, seg, busca]);

  const adicionar = (p: ProdutoDaGaleria) => {
    const v = precos[p.nome] ?? { por: '', de: '' };
    const preco = lerValor(v.por);
    if (preco == null) { toast.error(`Digite o preço de "${p.nome}".`); return; }
    const de = v.de.trim() ? lerValor(v.de) : null;
    aoAdicionar({ nome: p.nome, preco, precoDe: de != null && de > preco ? de : null, imagem: { url: p.imagem_url, fonte: 'MARCA', credito: p.credito ?? undefined } });
    setAdicionados((a) => new Set(a).add(p.nome));
    toast.success(`"${p.nome}" entrou na lista.`);
  };
  const lista = useMemo(() => itens, [itens]);

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="max-h-[92dvh] max-w-4xl overflow-y-auto border-white/10 bg-[#0f0428] text-white" data-testid="galeria-de-produtos">
        <DialogHeader>
          <DialogTitle>Produtos por segmento</DialogTitle>
          <DialogDescription className="text-slate-400">Escolha o segmento, digite o preço e toque em Adicionar. A foto já vem certa.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Segmento">
          {SEGMENTOS_DA_GALERIA.map((s) => (
            <button key={s.id} type="button" role="tab" aria-selected={seg === s.id} onClick={() => setSeg(s.id)} data-testid={`galeria-seg-${s.id}`}
              className={cn('h-8 shrink-0 rounded-full px-3 text-xs font-semibold', seg === s.id ? 'bg-[#5D1BFF] text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10')}>{s.nome}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2">
          <Search className="h-4 w-4 text-slate-400" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar neste segmento (ex.: picanha, Coca-Cola, alface)" className="h-10 w-full bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none" data-testid="galeria-busca" />
        </label>
        {carregando ? <p className="flex items-center gap-2 py-8 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Carregando produtos…</p>
          : !lista.length ? <p className="py-8 text-center text-sm text-slate-400">Nenhum produto com foto neste segmento{busca ? ' para essa busca' : ''}.</p> : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" data-testid="galeria-lista">
              {lista.map((p) => {
                const v = precos[p.nome] ?? { por: '', de: '' };
                const ja = adicionados.has(p.nome);
                return (
                  <li key={p.nome} className="flex flex-col gap-1.5 rounded-xl border border-white/10 bg-[#14062f] p-2" data-testid="galeria-produto">
                    <span className="flex h-24 items-center justify-center overflow-hidden rounded-lg bg-white"><img src={p.imagem_url} alt="" loading="lazy" className="h-full w-full object-contain" crossOrigin="anonymous" referrerPolicy="no-referrer" /></span>
                    <span className="line-clamp-2 min-h-[2.2em] text-[11px] font-semibold leading-tight text-white">{p.nome}</span>
                    <div className="grid grid-cols-2 gap-1">
                      <input inputMode="decimal" value={v.de} onChange={(e) => setPrecos((x) => ({ ...x, [p.nome]: { ...v, de: e.target.value } }))} placeholder="De (opc.)" aria-label={`Preço de (promoção) de ${p.nome}`} className="h-9 rounded-md border border-white/10 bg-black/30 px-1.5 text-xs text-white placeholder:text-slate-500" />
                      <input inputMode="decimal" value={v.por} onChange={(e) => setPrecos((x) => ({ ...x, [p.nome]: { ...v, por: e.target.value } }))} placeholder="Preço" aria-label={`Preço de ${p.nome}`} className="h-9 rounded-md border border-white/10 bg-black/30 px-1.5 text-xs font-bold text-white placeholder:text-slate-500" data-testid="galeria-preco" />
                    </div>
                    <button type="button" onClick={() => adicionar(p)} className={cn('flex h-9 items-center justify-center gap-1 rounded-lg text-xs font-bold', ja ? 'bg-[#25D366]/20 text-[#7dffb0]' : 'bg-[#5D1BFF] text-white hover:bg-[#8A2EFF]')} data-testid="galeria-adicionar">
                      <Plus className="h-4 w-4" />{ja ? 'Adicionado (de novo?)' : 'Adicionar'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
      </DialogContent>
    </Dialog>
  );
}
