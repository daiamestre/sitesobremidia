import { useEffect, useState } from 'react';
import { Building2, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { MapaDoBrasil } from './MapaDoBrasil';

/**
 * F-148 — "Nossos Clientes" e "Rede SOBRE MÍDIA" na página inicial (sem login).
 * Só aparecem clientes que o dono/administrador autorizou, e só nome, logo, cidade e UF (fn_rede_publica).
 * Sem cliente autorizado, a seção inteira não aparece.
 */
interface ClientePublico { nome: string; logo: string | null; cidade: string | null; uf: string | null }
interface RedePublicaDados { clientes: ClientePublico[]; por_uf: Array<{ uf: string; clientes: number; cidades: number }> }

export function RedePublica() {
  const [dados, setDados] = useState<RedePublicaDados | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const { data, error } = await supabase.rpc('fn_rede_publica' as never);
        if (!vivo || error || !data) return;
        const d = data as unknown as RedePublicaDados;
        if (Array.isArray(d.clientes) && d.clientes.length > 0) setDados({ clientes: d.clientes, por_uf: Array.isArray(d.por_uf) ? d.por_uf : [] });
      } catch { /* página inicial segue sem a seção */ }
    })();
    return () => { vivo = false; };
  }, []);

  if (!dados) return null;
  const cidades = new Set(dados.clientes.map((c) => `${c.cidade ?? ''}/${c.uf ?? ''}`).filter((x) => x !== '/')).size;

  return (
    <>
      <section className="container mx-auto px-4 py-8 sm:py-12" data-testid="nossos-clientes">
        <div className="mb-8 text-center">
          <h2 className="mb-3 font-display text-2xl font-bold text-white sm:text-3xl">Nossos Clientes</h2>
          <p className="text-slate-400">Empresas que anunciam e operam com a SOBRE MÍDIA</p>
        </div>
        <ul className="mx-auto flex flex-wrap justify-center gap-4" style={{ maxWidth: 1100 }}>
          {dados.clientes.map((c, i) => (
            <li key={`${c.nome}-${i}`} className="flex w-[calc(50%-0.5rem)] flex-col items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-center backdrop-blur-md sm:w-48">
              <div className="flex h-16 w-full items-center justify-center">
                {c.logo
                  ? <img src={c.logo} alt={`Logo de ${c.nome}`} loading="lazy" className="max-h-16 max-w-full object-contain" />
                  : <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/15 text-primary"><Building2 className="h-7 w-7" /></span>}
              </div>
              <span className="line-clamp-2 text-sm font-semibold text-white">{c.nome}</span>
              {(c.cidade || c.uf) && <span className="flex items-center gap-1 text-xs text-slate-400"><MapPin className="h-3 w-3" />{[c.cidade, c.uf].filter(Boolean).join(' · ')}</span>}
            </li>
          ))}
        </ul>
      </section>

      {dados.por_uf.length > 0 && (
        <section className="container mx-auto px-4 py-8 sm:py-12" data-testid="rede-sobre-midia">
          <div className="mb-8 text-center">
            <h2 className="mb-3 font-display text-2xl font-bold text-white sm:text-3xl">Rede SOBRE MÍDIA</h2>
            <p className="text-slate-400">
              {dados.clientes.length} {dados.clientes.length === 1 ? 'cliente' : 'clientes'} em {cidades} {cidades === 1 ? 'cidade' : 'cidades'} e {dados.por_uf.length} {dados.por_uf.length === 1 ? 'estado' : 'estados'}
            </p>
          </div>
          <MapaDoBrasil presenca={dados.por_uf.map((u) => ({ uf: u.uf, total: u.clientes, detalhe: `${u.cidades} ${u.cidades === 1 ? 'cidade' : 'cidades'}` }))} rotulo="clientes" />
        </section>
      )}
    </>
  );
}
