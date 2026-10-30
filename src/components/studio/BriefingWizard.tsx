import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, ImagePlus, Loader2, Plus, Rocket, Scissors, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { criarProducao, enviarFotoProduto } from '@/lib/studio/api';
import {
  CATEGORIAS, CUSTO, FORMATOS, LIMITES, OBJETIVOS, ROTULO, TONS, formatarPreco, precoEmCentavos, validarPedido,
  type Formato, type FotoProduto, type PedidoStudio, type TipoProducao,
} from '../../../supabase/functions/_shared/studio/contrato.ts';
import { StudioFundo, StudioMarca, StudioSemAcesso, useEscopoStudio } from './comum';
import { OPCOES_CRIACAO } from './StudioCentral';

interface ProdutoForm { id: string; nome: string; marca: string; preco: string; promo: string; unidade: string; fotos: FotoProduto[]; enviando: boolean }
const PRESET: Record<string, Partial<{ tipo: TipoProducao; formato: Formato; duracao_s: number; cenas: number; objetivo: string; categoria: string }>> = {
  produto: { tipo: 'video_montado', formato: '16:9', duracao_s: 10, cenas: 3, objetivo: 'Vender um produto' },
  promocional: { tipo: 'video_montado', formato: '16:9', duracao_s: 15, cenas: 4, objetivo: 'Divulgar ofertas' },
  ofertas: { tipo: 'video_montado', formato: '16:9', duracao_s: 20, cenas: 5, objetivo: 'Divulgar ofertas' },
  institucional: { tipo: 'video_montado', formato: '16:9', duracao_s: 15, cenas: 4, objetivo: 'Fortalecer a marca', categoria: 'Institucional' },
  redes: { tipo: 'video_montado', formato: '9:16', duracao_s: 15, cenas: 4, objetivo: 'Divulgar ofertas' },
  telas: { tipo: 'video_montado', formato: '16:9', duracao_s: 15, cenas: 4, objetivo: 'Divulgar ofertas' },
  arte: { tipo: 'imagens', formato: '16:9', duracao_s: 6, cenas: 2, objetivo: 'Vender um produto' },
  cinematografica: { tipo: 'video_montado', formato: '16:9', duracao_s: 30, cenas: 6, objetivo: 'Lançamento' },
};
const PASSOS = ['Campanha', 'Produtos', 'Oferta e loja', 'Formato', 'Revisão'];
const novoProduto = (n: number): ProdutoForm => ({ id: `p${n}`, nome: '', marca: '', preco: '', promo: '', unidade: '', fotos: [], enviando: false });

function Campo({ rotulo, dica, children, className }: { rotulo: string; dica?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-xs font-semibold uppercase tracking-wider text-slate-300">{rotulo}</Label>
      {children}
      {dica && <p className="text-[11px] text-slate-500">{dica}</p>}
    </div>
  );
}
const estiloCampo = 'border-white/10 bg-white/5 text-white placeholder:text-slate-500 focus-visible:ring-amber-400';

export function BriefingWizard({ base }: { base: string }) {
  const [params] = useSearchParams();
  const modo = params.get('modo') ?? 'promocional';
  const preset = PRESET[modo] ?? PRESET.promocional;
  const opcao = OPCOES_CRIACAO.find((o) => o.id === modo);
  const navegar = useNavigate();
  const { user } = useAuth();
  const escopo = useEscopoStudio();

  const [passo, setPasso] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [b, setB] = useState({
    titulo: '', objetivo: preset.objetivo ?? OBJETIVOS[0], categoria: preset.categoria ?? '', segmento: '', ideia: '', tom: TONS[0] as string, publico: '',
    estabelecimento: '', marca: '', condicoes: '', periodo: '', texto_publicitario: '',
  });
  const [produtos, setProdutos] = useState<ProdutoForm[]>([novoProduto(1)]);
  const [formato, setFormato] = useState<Formato>(preset.formato ?? '16:9');
  const [tipo, setTipo] = useState<TipoProducao>(preset.tipo ?? 'video_montado');
  const [duracao, setDuracao] = useState(preset.duracao_s ?? 15);
  const [cenas, setCenas] = useState(preset.cenas ?? 4);
  const institucional = modo === 'institucional';

  const pedido: PedidoStudio = useMemo(() => ({
    briefing: {
      titulo: b.titulo.trim(), objetivo: b.objetivo, categoria: b.categoria, segmento: b.segmento.trim() || null, ideia: b.ideia.trim(), tom: b.tom,
      publico: b.publico.trim() || null, estabelecimento: b.estabelecimento.trim() || null, marca: b.marca.trim() || null,
      condicoes: b.condicoes.trim() || null, periodo: b.periodo.trim() || null, texto_publicitario: b.texto_publicitario.trim() || null,
    },
    produtos: produtos.map((p) => ({
      id: p.id, nome: p.nome.trim(), marca: p.marca.trim() || null, unidade: p.unidade.trim() || null, fotos: p.fotos,
      preco_centavos: p.preco.trim() ? precoEmCentavos(p.preco) ?? -1 : null,
      preco_promo_centavos: p.promo.trim() ? precoEmCentavos(p.promo) ?? -1 : null,
    })),
    formato, duracao_s: duracao, cenas, tipo,
  }), [b, produtos, formato, duracao, cenas, tipo]);

  const erros = validarPedido(pedido);
  const errosDoPasso = (i: number) => erros.filter((e) => (
    i === 0 ? /nome à campanha|objetivo|categoria|tom|ideia/.test(e)
      : i === 1 ? /^Produto|produto/.test(e)
        : i === 2 ? /campo (estabelecimento|marca|condicoes|periodo|texto_publicitario|publico)/.test(e)
          : i === 3 ? /Formato|duração|cenas|Cada cena|Tipo/.test(e) : true));
  const fotosEnviando = produtos.some((p) => p.enviando);

  const mudarProduto = (i: number, campo: Partial<ProdutoForm>) => setProdutos((l) => l.map((p, k) => (k === i ? { ...p, ...campo } : p)));
  const adicionarFoto = async (i: number, arquivo: File | undefined) => {
    if (!arquivo || !user) return;
    mudarProduto(i, { enviando: true });
    try {
      const foto = await enviarFotoProduto(user.id, arquivo);
      setProdutos((l) => l.map((p, k) => (k === i ? { ...p, fotos: [...p.fotos, foto].slice(0, LIMITES.fotosPorProduto), enviando: false } : p)));
      toast.success(foto.recorte_url ? 'Foto enviada e fundo removido.' : 'Foto enviada. O fundo não é liso: ela entra numa moldura, sem ser alterada.');
    } catch (e) {
      mudarProduto(i, { enviando: false });
      toast.error((e as Error).message || 'Não foi possível enviar a foto.');
    }
  };

  const criar = async () => {
    if (!user || erros.length) return;
    setEnviando(true);
    try {
      const id = await criarProducao(user.id, pedido);
      toast.success('Pedido recebido! Os agentes começaram a planejar.');
      navegar(`${base}/${id}`);
    } catch (e) {
      toast.error((e as Error).message || 'Não foi possível criar a produção.');
      setEnviando(false);
    }
  };

  const bloqueio = escopo.data && (!escopo.data.pronto ? 'ativacao' : !escopo.data.pode ? 'perfil' : null);
  if (bloqueio) return <StudioFundo className="p-6 md:p-10"><StudioMarca /><div className="mt-8"><StudioSemAcesso motivo={bloqueio} /></div></StudioFundo>;

  const neuronsEstimados = 450 + cenas * CUSTO.neuronsPorImagemSchnell + produtos.filter((p) => p.fotos.length).length * 120;

  return (
    <StudioFundo className="p-4 sm:p-6 md:p-10">
      <div className="mx-auto max-w-4xl space-y-6" data-testid="studio-briefing">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StudioMarca />
          <Button variant="ghost" className="text-slate-300 hover:bg-white/5 hover:text-white" onClick={() => navegar(base)}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">{opcao?.titulo ?? 'Nova produção'}</p>
          <h1 className="text-2xl font-black text-white sm:text-3xl">Briefing inteligente</h1>
        </div>

        <ol className="grid grid-cols-5 gap-1.5" aria-label="Etapas do briefing">
          {PASSOS.map((nome, i) => (
            <li key={nome}>
              <button type="button" onClick={() => setPasso(i)} className={cn('w-full rounded-lg px-1 py-2 text-[10px] font-semibold uppercase tracking-wide transition sm:text-xs',
                i === passo ? 'bg-amber-400 text-black' : i < passo ? 'bg-violet-500/25 text-violet-100' : 'bg-white/5 text-slate-400')} aria-current={i === passo ? 'step' : undefined}>
                <span className="sm:hidden" aria-label={nome}>{i + 1}</span><span className="hidden sm:inline">{i + 1}. {nome}</span>
              </button>
            </li>
          ))}
        </ol>
        <p className="-mt-3 text-xs font-semibold text-amber-300 sm:hidden">Etapa {passo + 1} de {PASSOS.length}: {PASSOS[passo]}</p>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
          {passo === 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="Nome da campanha" className="sm:col-span-2"><Input className={estiloCampo} value={b.titulo} maxLength={80} placeholder="Ex.: Fim de semana gelado" onChange={(e) => setB({ ...b, titulo: e.target.value })} /></Campo>
              <Campo rotulo="Objetivo">
                <select className={cn('h-10 w-full rounded-md border px-3 text-sm', estiloCampo)} value={b.objetivo} onChange={(e) => setB({ ...b, objetivo: e.target.value })}>
                  {OBJETIVOS.map((o) => <option key={o} className="bg-slate-900">{o}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Categoria comercial">
                <select className={cn('h-10 w-full rounded-md border px-3 text-sm', estiloCampo)} value={b.categoria} onChange={(e) => setB({ ...b, categoria: e.target.value })}>
                  <option value="" className="bg-slate-900">Escolha…</option>
                  {CATEGORIAS.map((o) => <option key={o} className="bg-slate-900">{o}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Segmento (opcional)" dica="Ex.: adega, conveniência, distribuidora."><Input className={estiloCampo} value={b.segmento} onChange={(e) => setB({ ...b, segmento: e.target.value })} /></Campo>
              <Campo rotulo="Público desejado (opcional)"><Input className={estiloCampo} value={b.publico} onChange={(e) => setB({ ...b, publico: e.target.value })} /></Campo>
              <Campo rotulo="O que você quer anunciar?" className="sm:col-span-2" dica="Descreva com suas palavras: clima, produto, chamada. Não precisa escrever o preço aqui.">
                <Textarea className={cn('min-h-28', estiloCampo)} value={b.ideia} maxLength={LIMITES.ideia} placeholder="Ex.: vídeo para a TV da adega chamando para levar cerveja gelada e gelo para o fim de semana, clima de bar à noite."
                  onChange={(e) => setB({ ...b, ideia: e.target.value })} />
              </Campo>
              <Campo rotulo="Tom da comunicação" className="sm:col-span-2">
                <div className="flex flex-wrap gap-2">
                  {TONS.map((t) => (
                    <button key={t} type="button" onClick={() => setB({ ...b, tom: t })} className={cn('rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition', b.tom === t ? 'bg-amber-400 text-black ring-amber-400' : 'bg-white/5 text-slate-300 ring-white/10 hover:ring-violet-400/50')}>{t}</button>
                  ))}
                </div>
              </Campo>
            </div>
          )}

          {passo === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-slate-400">O preço que você digitar é o preço que vai para a tela — aplicado pelo sistema e conferido no vídeo final. A IA nunca escreve preços. {institucional && 'Em anúncio institucional o preço é opcional.'}</p>
              {produtos.map((p, i) => (
                <div key={p.id} className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-white">{institucional ? 'Serviço / destaque' : 'Produto'} {i + 1}</p>
                    {produtos.length > 1 && <Button variant="ghost" size="sm" className="text-rose-300 hover:bg-rose-500/10" onClick={() => setProdutos((l) => l.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-6">
                    <Campo rotulo="Nome" className="sm:col-span-3"><Input className={estiloCampo} value={p.nome} maxLength={60} onChange={(e) => mudarProduto(i, { nome: e.target.value })} /></Campo>
                    <Campo rotulo="Marca (opcional)" className="sm:col-span-3"><Input className={estiloCampo} value={p.marca} onChange={(e) => mudarProduto(i, { marca: e.target.value })} /></Campo>
                    <Campo rotulo="Preço (R$)" className="sm:col-span-2" dica={p.preco && precoEmCentavos(p.preco) ? `Vai aparecer: R$ ${formatarPreco(precoEmCentavos(p.preco)!).completo}` : undefined}>
                      <Input className={estiloCampo} inputMode="decimal" placeholder="19,90" value={p.preco} onChange={(e) => mudarProduto(i, { preco: e.target.value })} />
                    </Campo>
                    <Campo rotulo="Preço promocional" className="sm:col-span-2" dica={p.promo && precoEmCentavos(p.promo) ? `Destaque: R$ ${formatarPreco(precoEmCentavos(p.promo)!).completo}` : 'Opcional, menor que o preço.'}>
                      <Input className={estiloCampo} inputMode="decimal" placeholder="16,90" value={p.promo} onChange={(e) => mudarProduto(i, { promo: e.target.value })} />
                    </Campo>
                    <Campo rotulo="Unidade" className="sm:col-span-2"><Input className={estiloCampo} placeholder="cada, kg, pacote" value={p.unidade} maxLength={12} onChange={(e) => mudarProduto(i, { unidade: e.target.value })} /></Campo>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {p.fotos.map((f, k) => (
                      <div key={f.path} className="relative h-24 w-24 overflow-hidden rounded-lg bg-[conic-gradient(#222_25%,#333_0_50%,#222_0_75%,#333_0)] bg-[length:16px_16px] ring-1 ring-white/10">
                        <img src={f.recorte_url || f.url} alt={`Foto ${k + 1} de ${p.nome || 'produto'}`} className="h-full w-full object-contain" />
                        {f.recorte_url && <span className="absolute bottom-1 left-1 flex items-center gap-0.5 rounded bg-emerald-500/90 px-1 text-[9px] font-bold text-black"><Scissors className="h-2.5 w-2.5" />recorte</span>}
                        <button type="button" aria-label="Remover foto" className="absolute right-1 top-1 rounded bg-black/70 p-0.5 text-white" onClick={() => mudarProduto(i, { fotos: p.fotos.filter((_, j) => j !== k) })}><Trash2 className="h-3 w-3" /></button>
                      </div>
                    ))}
                    {p.fotos.length < LIMITES.fotosPorProduto && (
                      <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/20 text-[11px] text-slate-400 hover:border-amber-400 hover:text-amber-300">
                        {p.enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                        {p.enviando ? 'Enviando…' : 'Foto real'}
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={p.enviando} onChange={(e) => { void adicionarFoto(i, e.target.files?.[0]); e.target.value = ''; }} />
                      </label>
                    )}
                    <p className="max-w-xs text-[11px] text-slate-500">Foto do produto em fundo liso (branco ou de uma cor só) sai recortada e flutua no cenário. A embalagem e o rótulo nunca são alterados.</p>
                  </div>
                </div>
              ))}
              {produtos.length < LIMITES.produtos && (
                <Button variant="outline" className="border-white/15 bg-transparent text-slate-200 hover:bg-white/5" onClick={() => setProdutos((l) => [...l, novoProduto(Math.max(...l.map((x) => Number(x.id.slice(1)))) + 1)])}>
                  <Plus className="mr-2 h-4 w-4" /> Adicionar produto
                </Button>
              )}
            </div>
          )}

          {passo === 2 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="Nome do estabelecimento" dica="Aparece no rodapé, como você escrever. Deixe vazio para não aparecer."><Input className={estiloCampo} value={b.estabelecimento} onChange={(e) => setB({ ...b, estabelecimento: e.target.value })} /></Campo>
              <Campo rotulo="Marca da campanha (opcional)"><Input className={estiloCampo} value={b.marca} onChange={(e) => setB({ ...b, marca: e.target.value })} /></Campo>
              <Campo rotulo="Condições da oferta" dica="Ex.: Enquanto durarem os estoques."><Input className={estiloCampo} value={b.condicoes} onChange={(e) => setB({ ...b, condicoes: e.target.value })} /></Campo>
              <Campo rotulo="Período da campanha" dica="Ex.: Sexta a domingo."><Input className={estiloCampo} value={b.periodo} onChange={(e) => setB({ ...b, periodo: e.target.value })} /></Campo>
              <Campo rotulo="Texto publicitário (opcional)" className="sm:col-span-2" dica="Se você tiver uma frase pronta, os agentes a usam como base."><Textarea className={estiloCampo} value={b.texto_publicitario} onChange={(e) => setB({ ...b, texto_publicitario: e.target.value })} /></Campo>
            </div>
          )}

          {passo === 3 && (
            <div className="space-y-6">
              <Campo rotulo="Proporção">
                <div className="grid grid-cols-3 gap-3">
                  {FORMATOS.map((f) => (
                    <button key={f.id} type="button" onClick={() => setFormato(f.id)} className={cn('flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition', formato === f.id ? 'border-amber-400 bg-amber-400/10' : 'border-white/10 bg-white/[0.02] hover:border-violet-400/50')}>
                      <span className={cn('rounded-sm border-2', formato === f.id ? 'border-amber-400' : 'border-slate-500', f.id === '16:9' ? 'h-7 w-12' : f.id === '9:16' ? 'h-12 w-7' : 'h-9 w-9')} />
                      <span className="text-xs font-semibold text-white">{f.id}</span>
                      <span className="hidden text-[10px] text-slate-400 sm:block">{f.nome}</span>
                    </button>
                  ))}
                </div>
              </Campo>
              <Campo rotulo="Tipo de produção">
                <div className="grid gap-2 sm:grid-cols-2">
                  {(['video_montado', 'imagens'] as TipoProducao[]).map((t) => (
                    <button key={t} type="button" onClick={() => setTipo(t)} className={cn('rounded-xl border p-3 text-left transition', tipo === t ? 'border-amber-400 bg-amber-400/10' : 'border-white/10 bg-white/[0.02]')}>
                      <p className="text-sm font-bold text-white">{t === 'video_montado' ? 'Vídeo (MP4)' : 'Artes (PNG)'}</p>
                      <p className="text-[11px] text-slate-400">{ROTULO[t]}</p>
                    </button>
                  ))}
                  <div className="cursor-not-allowed rounded-xl border border-white/5 bg-white/[0.01] p-3 opacity-50 sm:col-span-2" aria-disabled="true">
                    <p className="text-sm font-bold text-white">Vídeo gerado por IA</p>
                    <p className="text-[11px] text-slate-400">Indisponível: aguardando provedor de vídeo e orçamento.</p>
                  </div>
                </div>
              </Campo>
              <div className="grid gap-6 sm:grid-cols-2">
                <Campo rotulo={tipo === 'imagens' ? `Variações de arte: ${cenas}` : `Duração: ${duracao} s`} dica={tipo === 'imagens' ? undefined : `${cenas} cenas · ≈ ${(duracao / cenas).toFixed(1)} s por cena`}>
                  {tipo === 'imagens'
                    ? <Slider min={1} max={4} step={1} value={[cenas]} onValueChange={([v]) => { setCenas(v); setDuracao(Math.max(LIMITES.duracaoMin, v * 3)); }} />
                    : <Slider min={LIMITES.duracaoMin} max={LIMITES.duracaoMax} step={1} value={[duracao]} onValueChange={([v]) => setDuracao(v)} />}
                </Campo>
                {tipo !== 'imagens' && (
                  <Campo rotulo={`Quantidade de cenas: ${cenas}`}>
                    <Slider min={LIMITES.cenasMin} max={LIMITES.cenasMax} step={1} value={[cenas]} onValueChange={([v]) => setCenas(v)} />
                  </Campo>
                )}
              </div>
            </div>
          )}

          {passo === 4 && (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-black/30 p-4"><p className="text-xs uppercase tracking-wider text-slate-500">Campanha</p><p className="font-bold text-white">{b.titulo || '—'}</p><p className="text-slate-400">{b.objetivo} · {b.categoria || '—'} · {b.tom}</p></div>
                <div className="rounded-xl bg-black/30 p-4"><p className="text-xs uppercase tracking-wider text-slate-500">Produção</p><p className="font-bold text-white">{ROTULO[tipo]}</p><p className="text-slate-400">{formato} · {tipo === 'imagens' ? `${cenas} arte(s)` : `${duracao} s em ${cenas} cenas`}</p></div>
              </div>
              <div className="rounded-xl bg-black/30 p-4">
                <p className="mb-2 text-xs uppercase tracking-wider text-slate-500">Preços que vão para a tela (exatos)</p>
                {pedido.produtos.map((p) => (
                  <p key={p.id} className="flex justify-between gap-2 border-b border-white/5 py-1 last:border-0">
                    <span className="text-slate-200">{p.nome || '—'} <span className="text-slate-500">({p.fotos.length} foto{p.fotos.length === 1 ? '' : 's'})</span></span>
                    <span className="font-bold text-amber-300">{p.preco_promo_centavos && p.preco_promo_centavos > 0 ? `de R$ ${p.preco_centavos && p.preco_centavos > 0 ? formatarPreco(p.preco_centavos).completo : '?'} por R$ ${formatarPreco(p.preco_promo_centavos).completo}` : p.preco_centavos && p.preco_centavos > 0 ? `R$ ${formatarPreco(p.preco_centavos).completo}` : 'sem preço'}</span>
                  </p>
                ))}
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-emerald-100">
                <p className="font-semibold">Custo: gratuito, dentro da cota diária</p>
                <p className="text-xs text-emerald-200/70">Estimativa ≈ {neuronsEstimados} neurons da infraestrutura de IA já contratada (cota grátis de 10.000/dia). Nenhuma etapa paga é usada. Você aprova o plano antes de qualquer imagem.</p>
              </div>
            </div>
          )}

          {errosDoPasso(passo).length > 0 && (
            <ul className="mt-4 space-y-1 rounded-lg bg-rose-500/10 p-3 text-xs text-rose-200">{errosDoPasso(passo).map((e) => <li key={e}>• {e}</li>)}</ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" className="text-slate-300 hover:bg-white/5 hover:text-white" disabled={passo === 0} onClick={() => setPasso((p) => p - 1)}><ArrowLeft className="mr-2 h-4 w-4" /> Anterior</Button>
          {passo < PASSOS.length - 1
            ? <Button className="bg-amber-400 font-bold text-black hover:bg-amber-300" onClick={() => setPasso((p) => p + 1)}>Próximo <ArrowRight className="ml-2 h-4 w-4" /></Button>
            : (
              <Button className="bg-gradient-to-r from-amber-400 to-orange-500 font-bold text-black hover:opacity-90" disabled={enviando || fotosEnviando || erros.length > 0} onClick={criar} data-testid="studio-criar">
                {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : erros.length ? <Check className="mr-2 h-4 w-4" /> : <Rocket className="mr-2 h-4 w-4" />}
                {erros.length ? `Faltam ${erros.length} ajuste(s)` : 'Criar com IA'}
              </Button>
            )}
        </div>
      </div>
    </StudioFundo>
  );
}
