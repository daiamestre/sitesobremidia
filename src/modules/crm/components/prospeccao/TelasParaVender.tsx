import { useQuery } from '@tanstack/react-query';
import { Loader2, Monitor } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

/**
 * F-113 — No cadastro do anunciante, o representante (ou OWNER/ADMIN) escolhe as TELAS de cada ponto parceiro.
 * O sistema soma o valor das telas; o valor final é editável na etapa de negociação.
 * A gravação final é a RPC fn_registrar_telas_anunciante (valida ponto, tenant e papel no servidor).
 */
export interface TelaParaVender { id: string; name: string; ponto_id: string; local_instalacao: string | null; foto_local_url: string | null; tamanho_polegadas: number | null; valor_anuncio: number | null }
export type EscolhaDeTelas = Record<string, string[]>;

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function useTelasParceirasDosPontos(pontoIds: string[]) {
  const chave = [...pontoIds].sort();
  return useQuery({
    queryKey: ['telas-para-vender', chave],
    enabled: chave.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<TelaParaVender[]> => {
      const { data, error } = await supabase
        .from('screens')
        .select('id, name, ponto_id, local_instalacao, foto_local_url, tamanho_polegadas, valor_anuncio' as never)
        .eq('tipo_tela' as never, 'PARCEIRA' as never)
        .in('ponto_id' as never, chave as never)
        .order('name');
      if (error) throw error;
      return (data ?? []) as unknown as TelaParaVender[];
    },
  });
}

/** Soma o valor mensal das telas escolhidas (só de pontos ainda selecionados). */
export function totalDasTelas(telas: TelaParaVender[], escolha: EscolhaDeTelas, pontos: Set<string>): number {
  const ids = new Set(Object.entries(escolha).filter(([p]) => pontos.has(p)).flatMap(([, t]) => t));
  return Math.round(telas.filter((t) => ids.has(t.id)).reduce((s, t) => s + Number(t.valor_anuncio ?? 0), 0) * 100) / 100;
}

/** Formato da RPC: [{ ponto, telas: [...] }] só com pontos selecionados que têm tela escolhida. */
export function selecaoParaEnvio(escolha: EscolhaDeTelas, pontos: Set<string>) {
  return Object.entries(escolha).filter(([p, t]) => pontos.has(p) && t.length > 0).map(([ponto, telas]) => ({ ponto, telas }));
}

/** Pontos recém-selecionados entram com todas as telas marcadas. */
export function completarEscolha(escolha: EscolhaDeTelas, telas: TelaParaVender[], pontos: Set<string>): EscolhaDeTelas | null {
  let mudou = false;
  const nova = { ...escolha };
  for (const p of pontos) {
    if (nova[p]) continue;
    const doPonto = telas.filter((t) => t.ponto_id === p);
    if (!doPonto.length) continue;
    nova[p] = doPonto.map((t) => t.id);
    mudou = true;
  }
  return mudou ? nova : null;
}

export function TelasParaVender({ pontos, nomes, telas, carregando, escolha, onChange }: {
  pontos: Set<string>; nomes: Record<string, string>; telas: TelaParaVender[]; carregando: boolean;
  escolha: EscolhaDeTelas; onChange: (e: EscolhaDeTelas) => void;
}) {
  if (!pontos.size) return null;
  if (carregando) return <p className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Carregando as telas dos pontos…</p>;
  const total = totalDasTelas(telas, escolha, pontos);
  const alternar = (ponto: string, tela: string) => {
    const atual = escolha[ponto] ?? [];
    onChange({ ...escolha, [ponto]: atual.includes(tela) ? atual.filter((x) => x !== tela) : [...atual, tela] });
  };

  return (
    <div className="space-y-3" data-testid="telas-para-vender">
      <p className="text-xs font-bold uppercase text-primary">Em quais telas o anúncio vai passar</p>
      {[...pontos].map((p) => {
        const doPonto = telas.filter((t) => t.ponto_id === p);
        const escolhidas = escolha[p] ?? [];
        const sub = doPonto.filter((t) => escolhidas.includes(t.id)).reduce((s, t) => s + Number(t.valor_anuncio ?? 0), 0);
        return (
          <div key={p} className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold text-white">{nomes[p] ?? 'Ponto parceiro'}</p>
              {doPonto.length > 0 && <span className="flex-shrink-0 text-xs text-emerald-400">{brl(sub)}/mês</span>}
            </div>
            {doPonto.length === 0 ? (
              <p className="text-xs text-amber-400">Este ponto ainda não tem telas cadastradas; o valor dele entra só na negociação.</p>
            ) : (
              <div className="space-y-1.5">
                {doPonto.map((t) => (
                  <label key={t.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2 ${escolhidas.includes(t.id) ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-white/10'}`}>
                    <input type="checkbox" className="h-4 w-4 accent-emerald-500" checked={escolhidas.includes(t.id)} onChange={() => alternar(p, t.id)} />
                    {t.foto_local_url
                      ? <img src={t.foto_local_url} alt="" className="h-9 w-12 flex-shrink-0 rounded object-cover" />
                      : <span className="flex h-9 w-12 flex-shrink-0 items-center justify-center rounded bg-slate-900"><Monitor className="h-4 w-4 text-slate-600" /></span>}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-white">{t.local_instalacao ?? t.name}</span>
                      {t.tamanho_polegadas ? <span className="block text-[11px] text-slate-500">{t.tamanho_polegadas}"</span> : null}
                    </span>
                    <span className="flex-shrink-0 text-xs text-slate-300">{brl(Number(t.valor_anuncio ?? 0))}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3" data-testid="total-telas-vendidas">
        <span className="text-sm text-slate-300">Valor calculado pelas telas</span>
        <span className="text-lg font-bold text-emerald-400">{brl(total)}/mês</span>
      </div>
      <p className="text-[11px] text-slate-500">Na próxima etapa o valor mensal já vem preenchido com este total, e você pode ajustar.</p>
    </div>
  );
}
