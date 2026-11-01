import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileText } from 'lucide-react';
import { TabloideEditor } from '@/components/tabloide/TabloideEditor';
import { useClienteModalidade } from '@/modules/crm/hooks/useClienteModalidade';
import { meuSaldo } from '@/lib/studioai/api';
import { encartePorId } from '@/lib/tabloide/encartes';
import { CHAVE_PRODUTOS_DO_ENCARTE } from '@/components/studio/PastaDeEncartes';
import { logoSalvaDoStudio } from '@/lib/studio/logoDoStudio';

/**
 * F-231 — editar um ENCARTE DE MERCADO dentro do SOBRE MÍDIA Studio: é o editor do Cartaz Digital (mesmas opções:
 * produtos, temas, datas, sua logo, empresa, fontes, postar, salvar em "Meus cartazes") já montado com o modelo.
 * Anunciante usa as regras do portal; a equipe, as do painel.
 */
export default function EncarteStudioPage() {
  const { encarteId } = useParams();
  const modelo = encartePorId(encarteId);
  // F-233: os produtos colocados na pasta (encartes de mercado) entram no editor
  const daPasta = (() => { try { return sessionStorage.getItem(CHAVE_PRODUTOS_DO_ENCARTE); } catch { return null; } })();
  const comProdutos = modelo && daPasta && modelo.segmento === 'mercado' ? { ...modelo, produtos: daPasta } : modelo;
  // F-235: a logo 3D criada no Studio vai para o cabeçalho
  const logo = logoSalvaDoStudio();
  const encarte = comProdutos && logo ? { ...comProdutos, logoCabecalhoId: logo.id } : comProdutos;
  const saldo = useQuery({ queryKey: ['studio-ai-saldo'], queryFn: meuSaldo, staleTime: 30_000 });
  const { cliente } = useClienteModalidade();
  if (!encarte) return <div className="p-10 text-sm text-slate-300">Encarte não encontrado. <Link to="/studio" className="text-[#FFD400] hover:underline">Voltar aos modelos</Link></div>;
  if (saldo.isLoading) return <p className="p-10 text-sm text-slate-400">Abrindo o encarte…</p>;
  const anunciante = !!saldo.data?.cliente;
  return (
    <div className="space-y-3" data-testid="studio-encarte-editor">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/studio" className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/5"><ArrowLeft className="h-4 w-4" />Modelos</Link>
        <h1 className="flex items-center gap-2 text-lg font-bold text-white"><FileText className="h-5 w-5 text-[#FFD400]" />{encarte.nome}</h1>
        <p className="w-full text-xs text-slate-400 sm:w-auto">Troque os produtos, nomes e preços na lista e toque em <b>Montar cartaz</b>. Use um leitor de código de barras para trazer o produto com a foto certa.</p>
      </div>
      <div className="rounded-2xl bg-background p-2 text-foreground sm:p-3">
        <TabloideEditor
          key={encarte.id}
          encarte={encarte}
          contexto={anunciante ? 'portal' : 'painel'}
          clienteId={anunciante ? cliente?.id ?? saldo.data?.cliente ?? null : null}
          empresaPadrao={anunciante ? cliente?.nome_fantasia || cliente?.razao_social || '' : ''}
          logoPadrao={anunciante ? cliente?.brand_logo_url ?? null : null}
        />
      </div>
    </div>
  );
}
