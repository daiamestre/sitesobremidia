import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Loader2, MapPin, Monitor, Plus, Search, Store } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import type { CommerceDatabase } from '@/types/customerPortalDb';
import { precoTela } from '@/lib/enviarImagem';

// ──────────────────────────────────────────────────────────────────────
// F-119 — SALA DE PONTOS PARCEIROS (OWNER/ADMIN)
// Cartões iguais aos do portal do anunciante (foto, nome, local, telas, valor). Clicar abre a edição completa
// (capa, fotos, dados, endereço, estrutura/público, comercial e as telas do ponto).
// "Novo Ponto Parceiro" abre o MESMO cadastro completo (7 etapas) usado pelo representante.
// ──────────────────────────────────────────────────────────────────────

export interface PontoParceiroRow {
  id: string;
  nome: string;
  categoria?: string | null;
  foto_url?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  quantidade_telas: number;
  valor_anuncio?: number | null;
  periodicidade?: string | null;
  disponibilidade: 'DISPONIVEL' | 'RESERVADO' | 'INDISPONIVEL';
  ativo: boolean;
}

const db = supabase as unknown as SupabaseClient<CommerceDatabase>;

export default function PontosParceirosPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const base = location.pathname.startsWith('/dashboard') ? '/dashboard' : '/workspace';
  const [busca, setBusca] = useState('');

  const { data: pontos = [], isLoading, error } = useQuery({
    queryKey: ['pontos-parceiros'],
    queryFn: async () => {
      const { data, error } = await db.from('pontos').select('*').is('deleted_at', null).order('nome');
      if (error) throw new Error(error.message);
      return data as unknown as PontoParceiroRow[];
    },
  });

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return pontos;
    return pontos.filter((p) => [p.nome, p.categoria, p.cidade, p.estado, p.bairro].some((v) => (v ?? '').toLowerCase().includes(q)));
  }, [pontos, busca]);

  const novoPonto = () => navigate(`${base}/prospeccao/ponto-parceiro`, { state: { voltarPara: `${base}/pontos-parceiros` } });

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-12" data-testid="sala-pontos-parceiros">
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-900/80 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white"><Store className="h-6 w-6 text-primary" /> Pontos parceiros</h1>
          <p className="mt-1 text-sm text-slate-400">Toque em um ponto para editar tudo: fotos, dados, endereço, estrutura, público e as telas dele.</p>
        </div>
        <Button onClick={novoPonto} className="w-full gap-2 sm:w-auto" data-testid="botao-novo-ponto">
          <Plus className="h-4 w-4" /> Novo Ponto Parceiro
        </Button>
      </div>

      <div className="relative sm:max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, categoria ou cidade…" className="pl-9" />
      </div>

      {isLoading ? (
        <Loader2 className="mx-auto my-16 h-8 w-8 animate-spin text-primary" />
      ) : error ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="space-y-2 py-10 text-center">
            <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
            <p className="font-semibold">Falha ao carregar pontos</p>
            <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
          </CardContent>
        </Card>
      ) : !filtrados.length ? (
        <p className="rounded-xl border border-white/10 bg-slate-900/50 py-12 text-center text-slate-400">
          Nenhum ponto parceiro{busca ? ' para esta busca' : ' cadastrado'}.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="cartoes-pontos">
          {filtrados.map((p) => (
            <Link key={p.id} to={`${base}/pontos-parceiros/${p.id}`} data-testid="cartao-ponto"
              className={`group overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80 transition-colors hover:border-primary/50 ${!p.ativo ? 'opacity-60' : ''}`}>
              <div className="relative aspect-[16/9] bg-slate-800">
                {p.foto_url
                  ? <img src={p.foto_url} alt={p.nome} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  : <Store className="absolute inset-0 m-auto h-10 w-10 text-slate-600" />}
                {p.categoria && <Badge className="absolute left-3 top-3 border-0 bg-slate-950/80 text-white">{p.categoria}</Badge>}
                {(!p.ativo || p.disponibilidade !== 'DISPONIVEL') && (
                  <Badge className="absolute right-3 top-3 border-0 bg-amber-500 text-white">{!p.ativo ? 'Inativo' : p.disponibilidade === 'RESERVADO' ? 'Reservado' : 'Indisponível'}</Badge>
                )}
              </div>
              <div className="space-y-1.5 p-4">
                <p className="font-semibold text-white">{p.nome}</p>
                <p className="flex items-center gap-1 text-xs text-slate-400"><MapPin className="h-3.5 w-3.5 flex-shrink-0" /> {[p.bairro, p.cidade].filter(Boolean).join(', ') || 'Endereço não informado'}</p>
                <div className="flex items-center justify-between pt-1 text-xs">
                  <span className="flex items-center gap-1 text-slate-400"><Monitor className="h-3.5 w-3.5" /> {p.quantidade_telas} {p.quantidade_telas === 1 ? 'tela' : 'telas'}</span>
                  <span className="font-semibold text-slate-200">
                    {p.valor_anuncio != null && Number(p.valor_anuncio) > 0 && <span className="font-normal text-slate-500">a partir de </span>}
                    {precoTela(p.valor_anuncio)}{p.valor_anuncio != null && Number(p.valor_anuncio) > 0 && <span className="font-normal text-slate-500">/mês</span>}
                  </span>
                </div>
                <span className="mt-2 flex w-full items-center justify-center rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground group-hover:bg-primary/90">
                  Editar ponto e telas
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
