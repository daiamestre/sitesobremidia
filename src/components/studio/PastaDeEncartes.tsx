/**
 * F-233 — a PASTA "Encartes de Mercado" do SOBRE MÍDIA Studio, aberta.
 * À esquerda, "Seus produtos" (ProdutosComFotos): produto e preço, código de barras, nome/"de"/"por" e fotos reais
 * automáticas. À direita, os 12 encartes já mostram os produtos da pessoa, ao vivo. "Editar encarte" abre o editor
 * completo do Cartaz Digital com esses produtos.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileText, FolderOpen, PenLine } from 'lucide-react';
import { ENCARTES } from '@/lib/tabloide/encartes';
import { infoDaPasta, pastaDeOfertasDe } from '@/lib/studio/pastasDoSegmento';
import { MiniaturaDoEncarte, encarteEmMovimento, useFotosDosEncartes } from './EncartesDoStudio';
import { PainelDeProdutos, useProdutosComFotos } from './ProdutosComFotos';
import { EncarteOficialCartao, enderecoDoEditorDoEncarte } from './EncarteOficial';
import { toast } from 'sonner';
import { documentoDoEncarteOficial, encartesDoSegmento } from '@/lib/studio/encartesOficiais';
import { PreviaDocumento } from './PreviaDocumento';
import { EscolhaDeModelo } from './GaleriaDeModelos';
import { capaDoEncarte } from '@/lib/studio/capasEmVideo';
import { VideoDaCapa } from './VideoDaCapa';
import type { SegmentoDoStudio } from '@/lib/studio/palco';
import { gravarLogoDoEncarte, lerLogoDoEncarte, type LogoDaPasta } from '@/lib/studio/logos';
import { EscolherLogo } from './PastaDeLogos';

export { CHAVE_PRODUTOS_DO_ENCARTE } from './ProdutosComFotos';

/** F-259: a mesma pasta serve ao mercado e à farmácia (encartes, lista de produtos e cesta de exemplo de cada um) */
export function PastaDeEncartes({ segmento = 'mercado' }: { segmento?: SegmentoDoStudio }) {
  const navegar = useNavigate();
  const mercado = segmento === 'mercado';
  // F-277: cada segmento com a sua lista de produtos e a sua cesta de exemplo
  const info = infoDaPasta(segmento);
  const s = useProdutosComFotos(info.cesta, info.chave);
  const oficiais = encartesDoSegmento(segmento);
  // F-296 (pedido do dono): GALERIA DE MODELOS — o cliente escolhe qual modelo do segmento quer editar (cada um dono de si)
  // F-298 (pedido do dono): o modelo se escolhe ANTES da edição; o escolhido vai no endereço (?modelo=) e a edição não mostra a galeria
  const chaveModelo = `studio-encarte-modelo-${segmento}`;
  const [params, setParams] = useSearchParams();
  const local = useLocation();
  const doLink = params.get('modelo');
  const temEscolha = oficiais.length + (mercado ? ENCARTES.length : 0) > 1;
  const escolhendoModelo = temEscolha && !oficiais.some((o) => o.id === doLink);
  const [ultimo] = useState<string | undefined>(() => { try { return localStorage.getItem(chaveModelo) ?? undefined; } catch { return undefined; } });
  const modeloId = oficiais.some((o) => o.id === doLink) ? doLink! : (ultimo && oficiais.some((o) => o.id === ultimo) ? ultimo : oficiais[0]?.id ?? '');
  useEffect(() => { if (!escolhendoModelo) try { localStorage.setItem(chaveModelo, modeloId); } catch { /* sem armazenamento */ } }, [chaveModelo, modeloId, escolhendoModelo]);
  // F-299 (pedido do dono): "Editar este modelo" vai DIRETO para a tela de edição do encarte (o voltar do editor traz para a
  // página do modelo, com a lista de produtos); se a arte não couber na sessão, abre a página do modelo
  const escolherModelo = (id: string) => {
    const o = oficiais.find((x) => x.id === id);
    if (!o) return;
    try { localStorage.setItem(chaveModelo, id); } catch { /* sem armazenamento */ }
    s.gravar(s.produtos);
    setParams((p) => { p.set('modelo', id); return p; });
    try { navegar(enderecoDoEditorDoEncarte(o, s.produtos, s.quantos)); }
    catch { toast.error('Não foi possível abrir o editor (a imagem da logo é grande demais). Ajuste aqui e toque em Editar.'); }
  };
  const modelo = oficiais.find((o) => o.id === modeloId) ?? oficiais[0];
  // F-303: na escolha, cada modelo passa o VÍDEO gravado (leve); sem vídeo, o desenho ao vivo com os produtos da pessoa
  const capas = useMemo(() => oficiais.map((o) => ({ id: o.id, nome: o.nome.replace(/^Ofertas – /, ''), previa: capaDoEncarte(o.id) ? <VideoDaCapa capa={capaDoEncarte(o.id)!} /> : <PreviaDocumento doc={encarteEmMovimento(documentoDoEncarteOficial(o, s.produtos.slice(0, 8), { quantos: 8 }, '9:16'))} animar sempre className="h-full w-full" /> })), [oficiais, s.produtos]);
  const editar = (id: string) => { s.gravar(s.produtos); navegar(`/studio/encarte/${id}`); };
  // os encartes de mercado mostram os produtos da pessoa; açougue e hortifruti mantêm os exemplos deles (fotos do catálogo)
  const fotosDoCatalogo = useFotosDosEncartes();
  // F-248: cada encarte pode trocar a logo pela pasta Logos
  const [logos, setLogos] = useState<Record<string, LogoDaPasta | null>>(() => Object.fromEntries(ENCARTES.map((e) => [e.id, lerLogoDoEncarte(e.id)])));
  const [trocandoLogo, setTrocandoLogo] = useState<string | null>(null);
  const escolherLogo = (id: string, l: LogoDaPasta | null) => { gravarLogoDoEncarte(id, l); setLogos((a) => ({ ...a, [id]: l })); setTrocandoLogo(null); };

  const trocaDeLogo = trocandoLogo && <EscolherLogo titulo="Logo do encarte" aoEscolher={(l) => escolherLogo(trocandoLogo, l)} aoRestaurar={() => escolherLogo(trocandoLogo, null)} aoFechar={() => setTrocandoLogo(null)} />;

  // F-298: ao abrir a pasta, primeiro os MODELOS (com a amostra já com os produtos); tocou num, abre a edição
  if (escolhendoModelo) return (
    <>
      <EscolhaDeModelo titulo={info.tituloEncartes} voltar={`/studio/pasta/${pastaDeOfertasDe(segmento)}`} descricao="Escolha o modelo de encarte para editar · cada modelo guarda o que foi feito nele" itens={capas} ultimo={ultimo} aoEscolher={escolherModelo}>
        {mercado && ENCARTES.map((e) => (
          <article key={e.id} role="listitem" className="flex min-w-0 flex-col rounded-2xl border-2 border-white/10 bg-[#140632] p-2 transition hover:border-[#8A2EFF]/70 sm:p-2.5" data-testid="studio-encarte-card">
            <button type="button" onClick={() => editar(e.id)} aria-label={`Editar o encarte ${e.nome}`} className="block w-full overflow-hidden rounded-xl text-left">
              <MiniaturaDoEncarte e={e} fotos={fotosDoCatalogo.data} produtos={e.segmento === 'mercado' ? s.produtos : undefined} quantos={s.quantos} logoEscolhida={logos[e.id]} />
            </button>
            <div className="flex-1 pt-2">
              <h2 className="line-clamp-2 text-sm font-bold leading-tight text-white">{e.nome.replace(/ – Encarte Grande$/, '')}</h2>
              <p className="flex items-center gap-1 text-[11px] text-slate-400"><FileText className="h-3 w-3 shrink-0" />{e.segmento === 'mercado' ? 'com os seus produtos' : e.segmento === 'acougue' ? 'açougue (cortes de exemplo)' : 'hortifruti (exemplo)'}</p>
            </div>
            <button type="button" onClick={() => editar(e.id)} className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[#5D1BFF] px-2 text-sm font-bold text-white transition hover:bg-[#8A2EFF]" data-testid="studio-editar-encarte">
              <PenLine className="h-4 w-4 shrink-0" /><span className="truncate">Editar este modelo</span>
            </button>
            <button type="button" onClick={() => setTrocandoLogo(e.id)} className="mt-1.5 h-9 w-full rounded-xl border border-white/15 text-xs font-semibold text-white hover:bg-white/5" data-testid="studio-trocar-logo">Trocar logo</button>
          </article>
        ))}
      </EscolhaDeModelo>
      {trocaDeLogo}
    </>
  );

  return (
    <div className="space-y-4" data-testid="studio-pasta-encartes-aberta">
      <div className="flex flex-wrap items-center gap-3">
        <Link to={temEscolha ? local.pathname : `/studio/pasta/${pastaDeOfertasDe(segmento)}`} className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5" data-testid="encarte-voltar-aos-modelos"><ArrowLeft className="h-4 w-4" />Modelos</Link>
        <div className="mr-auto min-w-0">
          <h1 className="flex items-center gap-2 truncate text-xl font-black text-white"><FolderOpen className="h-5 w-5 shrink-0 text-[#FFD400]" />{info.tituloEncartes}</h1>
          <p className="text-xs text-slate-400">{!mercado ? info.descricao : `Supermercados · ${ENCARTES.length} encartes A4 · coloque os seus produtos e escolha quantos mostrar: a grade se organiza sozinha`}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <PainelDeProdutos s={s} destaques={0} />
        <div className="min-w-0 space-y-4">
        {/* F-240: encartes OFICIAIS (fundos prontos do dono): os produtos se organizam sozinhos, com a logo e os contatos */}
        <section className="space-y-2" aria-label="Encartes oficiais">
          {modelo && <EncarteOficialCartao key={modelo.id} e={modelo} produtos={s.produtos} quantos={s.quantos} aoGravar={() => s.gravar(s.produtos)} />}
        </section>
        </div>
      </div>
      {trocaDeLogo}
    </div>
  );
}
