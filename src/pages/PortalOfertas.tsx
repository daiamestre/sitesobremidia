/**
 * Cartaz Digital (F-179) — página pública de ofertas de uma loja (/ofertas/:slug), sem login.
 * Mostra só o que o dono mandou mostrar e os cartazes que ele publicou e ainda estão valendo.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, MapPin, Phone, Store } from 'lucide-react';
import { lerPortal, type LojaDoPortal } from '@/lib/tabloide/perfil';
import { segmentoPorId, SEGMENTOS } from '@/lib/tabloide/temas';

const dm = (iso: string | null) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
const comHttp = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);
const soDigitos = (t: string) => t.replace(/\D/g, '');

export default function PortalOfertas() {
  const { slug = '' } = useParams();
  const [loja, setLoja] = useState<LojaDoPortal | null | undefined>(undefined);

  useEffect(() => {
    let ativo = true;
    setLoja(undefined);
    void lerPortal(slug.toLowerCase()).then((l) => { if (ativo) setLoja(l); }).catch(() => { if (ativo) setLoja(null); });
    return () => { ativo = false; };
  }, [slug]);

  const nome = loja?.empresa.nome || 'Ofertas';
  useEffect(() => { if (loja) document.title = `${nome} — ofertas`; }, [loja, nome]);

  if (loja === undefined) return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando as ofertas…</div>;

  if (loja === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-slate-950 p-6 text-center text-slate-200" data-testid="portal-nao-encontrado">
        <Store className="h-10 w-10 text-slate-500" />
        <h1 className="text-xl font-bold">Página de ofertas não encontrada</h1>
        <p className="text-sm text-slate-400">Confira o endereço com a loja.</p>
      </div>
    );
  }

  const e = loja.empresa;
  const whats = e.whatsapp ? soDigitos(e.whatsapp) : '';
  const segmentos = loja.segmentos.filter((s) => SEGMENTOS.some((x) => x.id === s)).map((s) => segmentoPorId(s).nome);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100" data-testid="portal-ofertas">
      <div role="banner" className="border-b border-slate-800 bg-slate-900">
        <div className="mx-auto max-w-5xl p-4"><div className="flex flex-wrap items-center gap-4">
          {loja.logo && <img src={loja.logo} alt={`Logo ${nome}`} className="h-16 w-16 rounded-full bg-white object-contain p-1" />}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold" data-testid="portal-nome">{nome}</h1>
            {e.slogan && <p className="text-sm text-slate-300">{e.slogan}</p>}
            {segmentos.length > 0 && <p className="mt-1 text-xs text-slate-400">{segmentos.join(' · ')}</p>}
          </div>
          {whats && (
            <a href={`https://wa.me/${whats.length <= 11 ? `55${whats}` : whats}`} target="_blank" rel="noreferrer" className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
              Chamar no WhatsApp
            </a>
          )}
        </div></div>
      </div>

      <main className="mx-auto max-w-5xl space-y-6 p-4">
        {loja.cartazes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-700 p-10 text-center text-slate-400" data-testid="portal-sem-ofertas">Nenhuma oferta publicada no momento. Volte em breve!</p>
        ) : loja.cartazes.map((c, n) => (
          <article key={c.id} className="space-y-2" data-testid="portal-cartaz">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">{c.nome}</h2>
              {(dm(c.inicio) || dm(c.fim)) && <span className="text-xs text-slate-400">{dm(c.inicio) && dm(c.fim) ? `Válido de ${dm(c.inicio)} a ${dm(c.fim)}` : dm(c.fim) ? `Válido até ${dm(c.fim)}` : `A partir de ${dm(c.inicio)}`}</span>}
            </div>
            {c.imagens.map((url, i) => (
              <img key={url} src={url} alt={`${c.nome}${c.imagens.length > 1 ? ` — página ${i + 1}` : ''}`} loading={n === 0 ? 'eager' : 'lazy'} className="w-full rounded-xl border border-slate-800" />
            ))}
          </article>
        ))}
      </main>

      <div role="contentinfo" className="border-t border-slate-800 bg-slate-900">
        <div className="mx-auto max-w-5xl space-y-1.5 p-4 text-sm text-slate-300">
          {(e.telefone || e.whatsapp) && <p className="flex items-center gap-2"><Phone className="h-4 w-4 shrink-0" /> {[e.legenda, [e.telefone, e.whatsapp && `WhatsApp ${e.whatsapp}`].filter(Boolean).join(' · ')].filter(Boolean).join(': ')}</p>}
          {e.endereco && <p className="flex items-center gap-2"><MapPin className="h-4 w-4 shrink-0" /> {e.endereco}</p>}
          {(e.pagamento || e.obsPagamento) && <p>{[e.pagamento, e.obsPagamento].filter(Boolean).join(' — ')}</p>}
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            {e.instagram && <a className="underline" href={`https://instagram.com/${e.instagram.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')}`} target="_blank" rel="noreferrer">Instagram</a>}
            {e.facebook && <a className="underline" href={comHttp(e.facebook)} target="_blank" rel="noreferrer">Facebook</a>}
            {e.website && <a className="underline" href={comHttp(e.website)} target="_blank" rel="noreferrer">Site</a>}
          </p>
          <p className="pt-2 text-xs text-slate-500">Imagens meramente ilustrativas. Ofertas válidas conforme cada cartaz.</p>
        </div>
      </div>
    </div>
  );
}
