import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, MapPin, Loader2, CheckSquare, Square, ArrowUpDown, Tv } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { prospeccaoService, type PontoParaAnunciar } from '@/services/prospeccao.service';

// ──────────────────────────────────────────────────────────────────────
// SELEÇÃO DE PONTOS PARCEIROS (missão §7–§8)
// Lista server-side (RPC listar_pontos_para_anunciar — tenant-safe).
// A autorização FINAL é a RPC selecionar_pontos_prospeccao no backend;
// esta lista é apenas interface — nunca fonte de verdade (missão §9).
// ──────────────────────────────────────────────────────────────────────

type Ordenacao = 'nome' | 'telas' | 'cidade';

interface Props {
  value: Set<string>;
  onChange: (next: Set<string>) => void;
}

export function SelecaoPontosParceiros({ value, onChange }: Props) {
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<Ordenacao>('nome');

  const { data: pontos = [], isLoading, error } = useQuery({
    queryKey: ['prospeccao-pontos-disponiveis'],
    queryFn: () => prospeccaoService.listarPontosDisponiveis(),
    staleTime: 30_000,
  });

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const lista = !q
      ? pontos
      : pontos.filter((p) =>
          [p.nome, p.categoria, p.cidade, p.estado, p.bairro]
            .some((v) => (v ?? '').toLowerCase().includes(q))
        );
    const arr = [...lista];
    if (ordem === 'nome') arr.sort((a, b) => a.nome.localeCompare(b.nome));
    if (ordem === 'telas') arr.sort((a, b) => b.quantidade_telas - a.quantidade_telas);
    if (ordem === 'cidade') arr.sort((a, b) => (a.cidade ?? '').localeCompare(b.cidade ?? ''));
    return arr;
  }, [pontos, busca, ordem]);

  const toggle = (id: string) => {
    const next = new Set(value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando pontos parceiros…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-300">
        Falha ao carregar pontos: {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Pesquisar estabelecimento…"
            className="pl-9 bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
          />
        </div>
        <button
          type="button"
          onClick={() => setOrdem(ordem === 'nome' ? 'telas' : ordem === 'telas' ? 'cidade' : 'nome')}
          className="h-11 px-4 rounded-xl border border-white/10 text-slate-300 text-xs flex items-center gap-2 hover:bg-white/5 transition-colors"
          title="Alternar ordenação"
        >
          <ArrowUpDown className="h-4 w-4" />
          {ordem === 'nome' ? 'A–Z' : ordem === 'telas' ? 'Mais telas' : 'Cidade'}
        </button>
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-emerald-400 font-semibold">
          {value.size} ponto{value.size === 1 ? '' : 's'} selecionado{value.size === 1 ? '' : 's'}
        </span>
        {value.size > 0 && (
          <button type="button" onClick={() => onChange(new Set())} className="text-slate-400 hover:text-slate-200 underline">
            Limpar seleção
          </button>
        )}
      </div>

      {filtrados.length === 0 ? (
        <div className="text-center py-10 text-slate-400 bg-slate-900/50 rounded-xl border border-white/10">
          <MapPin className="h-10 w-10 mx-auto mb-3 text-slate-600" />
          <p>Nenhum ponto parceiro disponível{busca ? ' para esta busca' : ''}.</p>
          <p className="text-xs mt-1 text-slate-500">Novos pontos aparecem aqui assim que cadastrados.</p>
        </div>
      ) : (
        <div className="max-h-[320px] overflow-y-auto space-y-2 pr-1">
          {filtrados.map((p) => (
            <PontoRow
              key={p.ponto_id}
              ponto={p}
              selected={value.has(p.ponto_id)}
              onToggle={() => toggle(p.ponto_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PontoRow({ ponto, selected, onToggle }: { ponto: PontoParaAnunciar; selected: boolean; onToggle: () => void }) {
  return (
    <label
      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
        selected
          ? 'border-emerald-500/40 bg-emerald-500/5'
          : 'border-white/10 bg-slate-900/60 hover:bg-white/[0.04]'
      }`}
    >
      <input type="checkbox" checked={selected} onChange={onToggle} className="h-4 w-4 accent-emerald-500" />
      {ponto.foto_url ? (
        <img src={ponto.foto_url} alt={ponto.nome} className="h-10 w-10 rounded-lg object-cover border border-white/10" />
      ) : (
        <div className="h-10 w-10 rounded-lg bg-slate-950 border border-white/10 flex items-center justify-center">
          <MapPin className="h-4 w-4 text-slate-600" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-white truncate">{ponto.nome}</p>
        <p className="text-[11px] text-slate-500 truncate">
          {[ponto.bairro, ponto.cidade, ponto.estado].filter(Boolean).join(' · ') || 'Local não informado'}
        </p>
      </div>
      <Badge variant="outline" className="border-white/10 text-slate-300 text-[10px] gap-1 shrink-0">
        <Tv className="h-3 w-3" /> {ponto.quantidade_telas} tela{ponto.quantidade_telas === 1 ? '' : 's'}
      </Badge>
      {selected ? (
        <CheckSquare className="h-4 w-4 text-emerald-400 shrink-0" />
      ) : (
        <Square className="h-4 w-4 text-slate-700 shrink-0" />
      )}
    </label>
  );
}
