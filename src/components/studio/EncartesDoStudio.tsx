/**
 * F-231 — vitrine dos ENCARTES DE MERCADO no início do SOBRE MÍDIA Studio. Cada cartão é o encarte de verdade (o mesmo
 * desenho do Cartaz Digital, em miniatura), com as fotos dos produtos do catálogo compartilhado; "Editar encarte" abre
 * o editor do Cartaz Digital já montado com o modelo (trocar produtos, nomes e preços).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText, PenLine } from 'lucide-react';
import { TabloideCanvas } from '@/components/tabloide/TabloideCanvas';
import { CapaQueGira, useNaTela, type Slide } from '@/components/media/CapaQueGira';
import { coreografia, temAnimacao } from '@/lib/studio/animacao';
import { capaDoEncarte } from '@/lib/studio/capasEmVideo';
import type { Documento } from '@/lib/studio/documento';
import { configPadrao, propsDasPaginas } from '@/lib/tabloide/cartaz';
import { buscarNoCatalogo } from '@/lib/tabloide/imagens';
import { chaveCanonica } from '@/lib/tabloide/chave';
import { lerLista, type ImagemProduto, type ProdutoTabloide } from '@/lib/tabloide/parseProdutos';
import { CESTA_FARMACIA, CESTA_PADRAO, ENCARTES, ENCARTE_FORMATO, arranjoDoEncarte, configDoEncarte, gradeDoEncarte, type ModeloDeEncarte } from '@/lib/tabloide/encartes';
import { QUANTIDADE_PADRAO, quantidadeCompleta } from '@/lib/studio/gradeInteligente';
import { formatoPorId } from '@/lib/tabloide/temas';
import { logoSalvaDoStudio, seloDaLogo } from '@/lib/studio/logoDoStudio';
import { urlCompleta, type LogoDaPasta } from '@/lib/studio/logos';
import { documentoDoEncarteOficial, encartesDoSegmento } from '@/lib/studio/encartesOficiais';
import { PreviaDocumento } from '@/components/studio/PreviaDocumento';
import { SEGMENTOS_DE_OFERTA } from '@/lib/studio/segmentosDeOferta';
import { infoDaPasta } from '@/lib/studio/pastasDoSegmento';
import type { SegmentoDoStudio } from '@/lib/studio/palco';

/** F-279: o nome do exemplo sem o peso ("Pão de Forma Wickbold 500g" → "Pão de Forma Wickbold"), como está no catálogo das marcas */
export const nomeSemMedida = (nome: string) => nome.replace(/\s+\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l|cápsulas|comprimidos)\b|\s+(?:kg|un)\b/gi, '').trim();
/** F-279: foto do exemplo pelo nome e, se não houver, pelo nome sem o peso */
export const fotoDoExemplo = (fotos: Map<string, ImagemProduto> | undefined, nome: string) => fotos?.get(chaveCanonica(nome)) ?? fotos?.get(chaveCanonica(nomeSemMedida(nome))) ?? null;

/** Uma consulta só ao catálogo para todos os produtos de todos os encartes. */
export function useFotosDosEncartes() {
  const nomes = useMemo(() => [...new Set([...ENCARTES.map((e) => e.produtos), CESTA_PADRAO, CESTA_FARMACIA, ...SEGMENTOS_DE_OFERTA.map((s) => s.cesta)].flatMap((t) => lerLista(t).flatMap((p) => [p.nome, nomeSemMedida(p.nome)])))], []);
  return useQuery({ queryKey: ['studio-encartes-fotos'], queryFn: () => buscarNoCatalogo(nomes), staleTime: 10 * 60_000 });
}

/** F-232: a pasta "Encartes de Mercado" do catálogo do Studio (mesma grade das outras pastas). */
export const PASTA_ENCARTES = 'encartes-de-mercado';

/** F-259: capa da pasta Encartes de Farmácia: o encarte de farmácia com a cesta de exemplo da farmácia. */
export const CapaDaPastaDeFarmacia = ({ atraso = 0 }: { atraso?: number }) => <CapaDaPastaDoSegmento segmento="farmacia" atraso={atraso} />;
/** F-299 (pedido do dono): o encarte EM MOVIMENTO (a animação dele; sem ela, os elementos entram na ordem de leitura) */
export const encarteEmMovimento = (d: Documento): Documento => (temAnimacao(d) ? d : coreografia(d));
/** um slide de capa centrado na proporção dele (para capas que misturam encarte e palco) */
export const noCentro = (proporcao: string, conteudo: ReactNode) => (
  <div className="flex h-full w-full items-center justify-center"><div className="relative h-full max-w-full overflow-hidden" style={{ aspectRatio: proporcao }}>{conteudo}</div></div>
);
/**
 * F-299: os MODELOS DE ENCARTE do segmento, um por slide e em movimento, com a cesta de exemplo (capas que passam em loop).
 * `soEmPe`: só a versão em pé (para a capa que mistura com o palco).
 */
export function useSlidesDosEncartes(segmento: SegmentoDoStudio, soEmPe = false): Slide[] {
  const fotos = useFotosDosEncartes();
  return useMemo(() => {
    const cesta = lerLista(segmento === 'mercado' ? CESTA_PADRAO : infoDaPasta(segmento).cestaDaCapa).map((p) => ({ ...p, imagem: fotoDoExemplo(fotos.data, p.nome) }));
    const formatos = segmento === 'mercado' ? [undefined] : soEmPe ? (['9:16'] as const) : (['9:16', '16:9'] as const);
    // F-303 (pedido do dono): capa = o VÍDEO gravado do modelo (leve, toca no chip de vídeo); sem vídeo, o desenho ao vivo
    const gravadas = encartesDoSegmento(segmento).map((o) => ({ o, v: capaDoEncarte(o.id) }));
    if (gravadas.some((g) => g.v)) return gravadas.flatMap(({ o, v }) => (v ? [{ chave: `v-${o.id}`, video: v.video, imagem: v.poster }] : []));
    const oficiais: Slide[] = encartesDoSegmento(segmento).flatMap((o) => formatos.map((f) => ({
      chave: `${o.id}-${f ?? 'a4'}`,
      animada: () => noCentro(f === '16:9' ? '16 / 9' : f === '9:16' ? '9 / 16' : '1240 / 1754', <PreviaDocumento doc={encarteEmMovimento(documentoDoEncarteOficial(o, cesta, {}, f))} animar sempre className="h-full w-full" />),
    })));
    const doMercado: Slide[] = segmento === 'mercado' && !soEmPe ? ENCARTES.map((e) => ({ chave: e.id, animada: () => noCentro('1240 / 1754', <MiniaturaDoEncarte e={e} fotos={fotos.data} />) })) : [];
    return [...oficiais, ...doMercado];
  }, [fotos.data, segmento, soEmPe]);
}
/** F-299: capa da pasta Encartes de qualquer segmento: os modelos dele passando em loop, em movimento */
export function CapaDosEncartes({ segmento, atraso = 0 }: { segmento: SegmentoDoStudio; atraso?: number }) {
  return <CapaQueGira slides={useSlidesDosEncartes(segmento)} atraso={atraso} ajuste="contain" className="h-full w-full" />;
}

/** F-277: capa da pasta de encartes de qualquer segmento: o encarte dele com a cesta de exemplo dele. */
export function CapaDaPastaDoSegmento({ segmento, atraso = 0 }: { segmento: SegmentoDoStudio; atraso?: number }) {
  const fotos = useFotosDosEncartes();
  const slides = useMemo(() => {
    const cesta = lerLista(infoDaPasta(segmento).cestaDaCapa).map((p) => ({ ...p, imagem: fotoDoExemplo(fotos.data, p.nome) }));
    return encartesDoSegmento(segmento).flatMap((o) => (['9:16', '16:9'] as const).map((f) => ({ chave: `${o.id}-${f}`, animada: () => <PreviaDocumento doc={documentoDoEncarteOficial(o, cesta, {}, f)} sempre className="h-full" /> })));
  }, [fotos.data, segmento]);
  return <CapaQueGira slides={slides} atraso={atraso} ajuste="contain" className="h-full" style={{ aspectRatio: '9 / 16' }} />;
}

/** Capa da pasta: passa os encartes, 8 s cada, como todas as pastas do Studio (F-230). */
export function CapaDaPastaDeEncartes({ atraso = 0 }: { atraso?: number }) {
  const fotos = useFotosDosEncartes();
  const slides = useMemo(() => {
    // F-240: os encartes OFICIAIS (fundos do dono) também passam na capa, com a cesta de exemplo
    const cesta = lerLista(CESTA_PADRAO).map((p) => ({ ...p, imagem: fotoDoExemplo(fotos.data, p.nome) }));
    const oficiais = encartesDoSegmento('mercado').map((o) => ({ chave: o.id, animada: () => <PreviaDocumento doc={documentoDoEncarteOficial(o, cesta)} sempre className="h-full" /> }));
    return [...oficiais, ...ENCARTES.map((e) => ({ chave: e.id, animada: () => <MiniaturaDoEncarte e={e} fotos={fotos.data} /> }))];
  }, [fotos.data]);
  return <CapaQueGira slides={slides} atraso={atraso} ajuste="contain" className="h-full" style={{ aspectRatio: '1240 / 1754' }} />;
}

export function MiniaturaDoEncarte({ e, fotos, produtos: daPessoa, quantos = QUANTIDADE_PADRAO, logoEscolhida }: { e: ModeloDeEncarte; /** F-248: logo da pasta Logos */ logoEscolhida?: LogoDaPasta | null; fotos: Map<string, ImagemProduto> | undefined; /** F-233: os produtos que a pessoa colocou na pasta (já com as fotos) */ produtos?: ProdutoTabloide[]; /** F-244: quantos produtos mostrar */ quantos?: number }) {
  const caixa = useRef<HTMLDivElement>(null);
  const naTela = useNaTela(caixa, '400px');
  const formato = formatoPorId(ENCARTE_FORMATO);
  const pagina = useMemo(() => {
    const todos = daPessoa ?? lerLista(e.produtos).map((p) => ({ ...p, imagem: fotos?.get(chaveCanonica(p.nome)) ?? null }));
    // F-244: grade exata para a quantidade escolhida, sem fileira incompleta
    const n = quantidadeCompleta(quantos, todos.length);
    const produtos = todos.slice(0, n);
    const comGrade = { ...e, ...arranjoDoEncarte(e.layout, n), ...(logoEscolhida ? { logoUrl: urlCompleta(logoEscolhida.url) } : {}) };
    // F-235: com a logo 3D criada no Studio, o cabeçalho mostra a logo
    const logo = logoEscolhida ? null : logoSalvaDoStudio();
    const comLogo = logo ? { ...comGrade, logoCabecalhoId: logo.id } : comGrade;
    return propsDasPaginas({ formatoId: ENCARTE_FORMATO, temaId: e.temaId, segmentoId: e.segmento, grade: gradeDoEncarte(comGrade), produtos, config: configDoEncarte(comLogo, configPadrao()) }, logo ? [seloDaLogo(logo)] : [])[0];
  }, [e, fotos, daPessoa, quantos, logoEscolhida]);
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
