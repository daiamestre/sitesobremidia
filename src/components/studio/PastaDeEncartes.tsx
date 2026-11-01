/**
 * F-233 — a PASTA "Encartes de Mercado" do SOBRE MÍDIA Studio, aberta.
 * À esquerda, "Seus produtos" (ProdutosComFotos): produto e preço, código de barras, nome/"de"/"por" e fotos reais
 * automáticas. À direita, os 12 encartes já mostram os produtos da pessoa, ao vivo. "Editar encarte" abre o editor
 * completo do Cartaz Digital com esses produtos.
 */
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, FolderOpen, PenLine } from 'lucide-react';
import { ENCARTES } from '@/lib/tabloide/encartes';
import { MiniaturaDoEncarte, useFotosDosEncartes } from './EncartesDoStudio';
import { PainelDeProdutos, useProdutosComFotos } from './ProdutosComFotos';
import { EncarteOficialCartao } from './EncarteOficial';
import { ENCARTES_OFICIAIS } from '@/lib/studio/encartesOficiais';

export { CHAVE_PRODUTOS_DO_ENCARTE } from './ProdutosComFotos';

export function PastaDeEncartes() {
  const navegar = useNavigate();
  const s = useProdutosComFotos();
  const editar = (id: string) => { s.gravar(s.produtos); navegar(`/studio/encarte/${id}`); };
  // os encartes de mercado mostram os produtos da pessoa; açougue e hortifruti mantêm os exemplos deles (fotos do catálogo)
  const fotosDoCatalogo = useFotosDosEncartes();

  return (
    <div className="space-y-4" data-testid="studio-pasta-encartes-aberta">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/studio" className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5"><ArrowLeft className="h-4 w-4" />Modelos</Link>
        <div className="mr-auto min-w-0">
          <h1 className="flex items-center gap-2 truncate text-xl font-black text-white"><FolderOpen className="h-5 w-5 shrink-0 text-[#FFD400]" />Encartes de Mercado</h1>
          <p className="text-xs text-slate-400">Supermercados · {ENCARTES.length} encartes A4 · coloque os seus produtos e escolha quantos mostrar: a grade se organiza sozinha</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <PainelDeProdutos s={s} destaques={0} />
        <div className="min-w-0 space-y-4">
        {/* F-240: encartes OFICIAIS (fundos prontos do dono): os produtos se organizam sozinhos, com a logo e os contatos */}
        <section className="space-y-2" aria-label="Encartes oficiais">
          {ENCARTES_OFICIAIS.map((o) => <EncarteOficialCartao key={o.id} e={o} produtos={s.produtos} quantos={s.quantos} aoGravar={() => s.gravar(s.produtos)} />)}
        </section>
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" aria-label="Encartes com os seus produtos" data-testid="studio-encartes">
          {ENCARTES.map((e) => (
            <article key={e.id} className="sm-cartao-luz flex flex-col overflow-hidden rounded-xl p-2.5" data-testid="studio-encarte-card">
              <button type="button" onClick={() => editar(e.id)} aria-label={`Editar o encarte ${e.nome}`} className="block w-full text-left">
                <MiniaturaDoEncarte e={e} fotos={fotosDoCatalogo.data} produtos={e.segmento === 'mercado' ? s.produtos : undefined} quantos={s.quantos} />
              </button>
              <p className="mt-2 line-clamp-2 text-xs font-semibold leading-tight text-white">{e.nome.replace(/ – Encarte Grande$/, '')}</p>
              <p className="flex items-center gap-1 text-[10px] text-slate-400"><FileText className="h-3 w-3" />{e.segmento === 'mercado' ? 'com os seus produtos' : e.segmento === 'acougue' ? 'açougue (cortes de exemplo)' : 'hortifruti (exemplo)'}</p>
              <button type="button" onClick={() => editar(e.id)} className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-[#5D1BFF] py-1.5 text-xs font-semibold text-white transition hover:bg-[#8A2EFF]" data-testid="studio-editar-encarte">
                <PenLine className="h-3.5 w-3.5" />Editar encarte
              </button>
            </article>
          ))}
        </section>
        </div>
      </div>
    </div>
  );
}
