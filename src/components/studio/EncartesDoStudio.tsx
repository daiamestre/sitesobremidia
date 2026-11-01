/**
 * F-231 — vitrine dos ENCARTES DE MERCADO no início do SOBRE MÍDIA Studio. Cada cartão é o encarte de verdade (o mesmo
 * desenho do Cartaz Digital, em miniatura), com as fotos dos produtos do catálogo compartilhado; "Editar encarte" abre
 * o editor do Cartaz Digital já montado com o modelo (trocar produtos, nomes e preços).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText, PenLine } from 'lucide-react';
import { TabloideCanvas } from '@/components/tabloide/TabloideCanvas';
import { CapaQueGira, useNaTela } from '@/components/media/CapaQueGira';
import { configPadrao, propsDasPaginas } from '@/lib/tabloide/cartaz';
import { buscarNoCatalogo } from '@/lib/tabloide/imagens';
import { chaveCanonica } from '@/lib/tabloide/chave';
import { lerLista, type ImagemProduto, type ProdutoTabloide } from '@/lib/tabloide/parseProdutos';
import { CESTA_MERCADO, ENCARTES, ENCARTE_FORMATO, configDoEncarte, gradeDoEncarte, type ModeloDeEncarte } from '@/lib/tabloide/encartes';
import { formatoPorId } from '@/lib/tabloide/temas';
import { logoSalvaDoStudio, seloDaLogo } from '@/lib/studio/logoDoStudio';
import { ENCARTES_OFICIAIS, documentoDoEncarteOficial } from '@/lib/studio/encartesOficiais';
import { PreviaDocumento } from '@/components/studio/PreviaDocumento';

/** Uma consulta só ao catálogo para todos os produtos de todos os encartes. */
export function useFotosDosEncartes() {
  const nomes = useMemo(() => [...new Set(ENCARTES.flatMap((e) => lerLista(e.produtos).map((p) => p.nome)))], []);
  return useQuery({ queryKey: ['studio-encartes-fotos'], queryFn: () => buscarNoCatalogo(nomes), staleTime: 10 * 60_000 });
}

/** F-232: a pasta "Encartes de Mercado" do catálogo do Studio (mesma grade das outras pastas). */
export const PASTA_ENCARTES = 'encartes-de-mercado';

/** Capa da pasta: passa os encartes, 8 s cada, como todas as pastas do Studio (F-230). */
export function CapaDaPastaDeEncartes({ atraso = 0 }: { atraso?: number }) {
  const fotos = useFotosDosEncartes();
  const slides = useMemo(() => {
    // F-240: os encartes OFICIAIS (fundos do dono) também passam na capa, com a cesta de exemplo
    const cesta = lerLista(CESTA_MERCADO).slice(0, 8).map((p) => ({ ...p, imagem: fotos.data?.get(chaveCanonica(p.nome)) ?? null }));
    const oficiais = ENCARTES_OFICIAIS.map((o) => ({ chave: o.id, animada: () => <PreviaDocumento doc={documentoDoEncarteOficial(o, cesta)} sempre className="h-full" /> }));
    return [...oficiais, ...ENCARTES.map((e) => ({ chave: e.id, animada: () => <MiniaturaDoEncarte e={e} fotos={fotos.data} /> }))];
  }, [fotos.data]);
  return <CapaQueGira slides={slides} atraso={atraso} ajuste="contain" className="h-full" style={{ aspectRatio: '1240 / 1754' }} />;
}

export function MiniaturaDoEncarte({ e, fotos, produtos: daPessoa }: { e: ModeloDeEncarte; fotos: Map<string, ImagemProduto> | undefined; /** F-233: os produtos que a pessoa colocou na pasta (já com as fotos) */ produtos?: ProdutoTabloide[] }) {
  const caixa = useRef<HTMLDivElement>(null);
  const naTela = useNaTela(caixa, '400px');
  const formato = formatoPorId(ENCARTE_FORMATO);
  const pagina = useMemo(() => {
    const produtos = daPessoa ?? lerLista(e.produtos).map((p) => ({ ...p, imagem: fotos?.get(chaveCanonica(p.nome)) ?? null }));
    // F-235: com a logo 3D criada no Studio, o cabeçalho mostra a logo
    const logo = logoSalvaDoStudio();
    const comLogo = logo ? { ...e, logoCabecalhoId: logo.id } : e;
    return propsDasPaginas({ formatoId: ENCARTE_FORMATO, temaId: e.temaId, segmentoId: e.segmento, grade: gradeDoEncarte(e), produtos, config: configDoEncarte(comLogo, configPadrao()) }, logo ? [seloDaLogo(logo)] : [])[0];
  }, [e, fotos, daPessoa]);
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLargura(el.clientWidth));
    ro.observe(el);
    setLargura(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={caixa} className="relative overflow-hidden rounded-lg bg-black" style={{ width: '100%', aspectRatio: `${formato.largura} / ${formato.altura}` }}>
      {naTela && largura > 0 && (
        <div aria-hidden className="absolute left-0 top-0 origin-top-left" style={{ width: formato.largura, height: formato.altura, transform: `scale(${largura / formato.largura})` }}>
          <TabloideCanvas {...pagina} />
        </div>
      )}
    </div>
  );
}

export function EncartesDoStudio({ titulo = true }: { titulo?: boolean }) {
  const fotos = useFotosDosEncartes();
  return (
    <section aria-labelledby="titulo-encartes" className="space-y-3" data-testid="studio-encartes">
      {titulo && (
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="titulo-encartes" className="flex items-center gap-2 text-base font-bold text-white"><span className="h-5 w-1 rounded bg-[#FFD400]" />Encartes de mercado</h2>
          <p className="text-xs text-slate-400">15 produtos com foto real, 3 em destaque com "de/por". Troque produtos, nomes e preços — a foto do produto vem sozinha.</p>
        </div>
      </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {ENCARTES.map((e) => (
          <article key={e.id} className="sm-cartao-luz flex flex-col overflow-hidden rounded-xl p-2.5" data-testid="studio-encarte-card">
            <Link to={`/studio/encarte/${e.id}`} aria-label={`Editar o encarte ${e.nome}`}><MiniaturaDoEncarte e={e} fotos={fotos.data} /></Link>
            <p className="mt-2 line-clamp-2 text-xs font-semibold leading-tight text-white" title={e.nome}>{e.nome.replace(/ – Encarte Grande$/, '')}</p>
            <p className="flex items-center gap-1 text-[10px] text-slate-400"><FileText className="h-3 w-3" />Encarte grande · A4</p>
            <Link to={`/studio/encarte/${e.id}`} className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-[#5D1BFF] py-1.5 text-xs font-semibold text-white transition hover:bg-[#8A2EFF]" data-testid="studio-editar-encarte">
              <PenLine className="h-3.5 w-3.5" />Editar encarte
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
