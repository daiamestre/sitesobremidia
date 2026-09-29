import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2, MapPin, Monitor, Store } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { brl, pontosParceirosService } from './pontosParceiros';

/** F-107 — Pontos parceiros onde o anunciante pode anunciar. */
export default function PontosParceirosPage() {
  const q = useQuery({ queryKey: ['portal-pontos-parceiros'], queryFn: pontosParceirosService.listar });

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-12">
      <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white"><Store className="h-6 w-6 text-primary" /> Pontos parceiros</h1>
        <p className="mt-1 text-sm text-slate-400">Escolha um ponto, veja as informações e anuncie a sua mídia nas telas dele.</p>
      </div>

      {q.isLoading ? (
        <Loader2 className="mx-auto my-16 h-8 w-8 animate-spin text-primary" />
      ) : q.isError ? (
        <p className="rounded-xl border border-white/10 bg-slate-900/50 py-12 text-center text-slate-400">Não foi possível carregar os pontos parceiros.</p>
      ) : !q.data?.length ? (
        <p className="rounded-xl border border-white/10 bg-slate-900/50 py-12 text-center text-slate-400">Nenhum ponto parceiro disponível no momento.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="lista-pontos-parceiros">
          {q.data.map((p) => (
            <Link key={p.id} to={`/portal/pontos-parceiros/${p.id}`}
              className="group overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80 transition-colors hover:border-primary/50">
              <div className="relative aspect-[16/9] bg-slate-800">
                {p.foto_url
                  ? <img src={p.foto_url} alt={p.nome} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  : <Store className="absolute inset-0 m-auto h-10 w-10 text-slate-600" />}
                {p.categoria && <Badge className="absolute left-3 top-3 border-0 bg-slate-950/80 text-white">{p.categoria}</Badge>}
                {p.meus_anuncios > 0 && (
                  <Badge className="absolute right-3 top-3 gap-1 border-0 bg-emerald-500 text-white"><CheckCircle2 className="h-3 w-3" /> Você anuncia aqui</Badge>
                )}
              </div>
              <div className="space-y-1.5 p-4">
                <p className="font-semibold text-white">{p.nome}</p>
                <p className="flex items-center gap-1 text-xs text-slate-400"><MapPin className="h-3.5 w-3.5" /> {[p.bairro, p.cidade].filter(Boolean).join(', ')}</p>
                <div className="flex items-center justify-between pt-1 text-xs">
                  <span className="flex items-center gap-1 text-slate-400"><Monitor className="h-3.5 w-3.5" /> {p.quantidade_telas ?? p.telas_conectadas} {(p.quantidade_telas ?? 0) === 1 ? 'tela' : 'telas'}</span>
                  <span className="font-semibold text-slate-200">{Number(p.valor_anuncio) === 0 ? 'Tem tela grátis' : <>{brl(p.valor_anuncio)}<span className="font-normal text-slate-500">/mês</span></>}</span>
                </div>
                <span className="mt-2 flex w-full items-center justify-center rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground group-hover:bg-primary/90">
                  Ver ponto para anunciar
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
