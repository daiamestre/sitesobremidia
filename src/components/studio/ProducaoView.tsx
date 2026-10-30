import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, Bot, Check, CheckCircle2, Clapperboard, Download, Film, ListVideo, Loader2, RefreshCcw, Save, Send, ShieldCheck, Sparkles, ThumbsDown, ThumbsUp, Wand2, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  aprovarPlano, cancelar, decidirImagem, entregar, obterProducao, pedirImagem, pedirMontagem, pedirReplanejar, salvarEdicao, tentarDeNovo, type Producao,
} from '@/lib/studio/api';
import { CAMERAS, ROTULO, validarEdicao, type EdicaoCena, type Estado, type PedidoStudio } from '../../../supabase/functions/_shared/studio/contrato.ts';
import { dadosDaCena } from '../../../supabase/functions/_shared/studio/layout.ts';
import { ESTADOS_EM_ANDAMENTO, SeloEstado, SeloRotulo, StudioFundo, StudioMarca, nomeDoEstado } from './comum';
import { EditorCena } from './EditorCena';
import { PreviaCena } from './PreviaCena';

const LINHA_DO_TEMPO: { id: string; nome: string; estados: Estado[] }[] = [
  { id: 'pedido', nome: 'Pedido', estados: ['recebido'] },
  { id: 'plano', nome: 'Agentes planejam', estados: ['planejando'] },
  { id: 'aprovar_plano', nome: 'Você aprova o plano', estados: ['aguardando_aprovacao_plano'] },
  { id: 'imagens', nome: 'Cenários gerados', estados: ['gerando_imagens'] },
  { id: 'aprovar_imagens', nome: 'Você aprova e edita', estados: ['aguardando_aprovacao_imagens'] },
  { id: 'montagem', nome: 'Montagem', estados: ['montando'] },
  { id: 'qualidade', nome: 'Conferência', estados: ['conferindo', 'reprovado'] },
  { id: 'pronto', nome: 'Pronto', estados: ['pronto'] },
  { id: 'entregue', nome: 'Nas suas mídias', estados: ['entregue'] },
];
const AGENTES: Record<string, string> = {
  produtos: 'Especialista em Produtos', diretor: 'Diretor Criativo', roteirista: 'Roteirista Publicitário', fotografia: 'Diretor de Fotografia',
  prompts: 'Especialista em Prompts', imagem: 'Gerador de Imagens', montagem: 'Montador de Vídeo', qualidade: 'Controle de Qualidade', usuario: 'Você', distribuicao: 'Distribuição',
};
const EDITAVEL: Estado[] = ['aguardando_aprovacao_imagens', 'pronto', 'entregue', 'reprovado'];

function pedidoDa(p: Producao): PedidoStudio {
  return { briefing: p.briefing, produtos: p.produtos, formato: p.formato, duracao_s: p.duracao_s, cenas: p.cenas_qtd, tipo: p.tipo };
}

function Secao({ titulo, icone: Icone, children, acao }: { titulo: string; icone: typeof Film; children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-violet-200"><Icone className="h-4 w-4" />{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

export function ProducaoView({ id, base, areaEquipe }: { id: string; base: string; areaEquipe: boolean }) {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const consulta = useQuery({
    queryKey: ['studio-producao', id],
    queryFn: () => obterProducao(id),
    refetchInterval: (q) => (ESTADOS_EM_ANDAMENTO.includes((q.state.data as { producao: Producao | null } | undefined)?.producao?.estado as Estado) ? 4000 : false),
  });
  const p = consulta.data?.producao ?? null;
  const etapas = consulta.data?.etapas ?? [];
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [ajustePlano, setAjustePlano] = useState('');
  const [instrucoes, setInstrucoes] = useState<Record<string, string>>({});
  const [vendo, setVendo] = useState<Record<string, number>>({});
  const [edicoes, setEdicoes] = useState<Record<string, EdicaoCena>>({});
  const [ordem, setOrdem] = useState<number[]>([]);
  const [cenaEditada, setCenaEditada] = useState<number | null>(null);
  const [sujo, setSujo] = useState(false);

  // carrega a edição salva quando a produção muda de versão (sem apagar o que o usuário está editando)
  useEffect(() => {
    if (!p || sujo) return;
    setEdicoes(p.edicoes ?? {});
    const nums = p.plano?.cenas.map((c) => c.numero) ?? [];
    setOrdem(p.ordem?.length ? p.ordem : nums);
    setCenaEditada((c) => c ?? nums[0] ?? null);
  }, [p?.id, p?.edicao_versao, p?.plano_versao, p?.estado]); // eslint-disable-line react-hooks/exhaustive-deps

  const pedido = useMemo(() => (p ? pedidoDa(p) : null), [p]);

  if (consulta.isLoading) return <StudioFundo className="p-10"><p className="text-sm text-slate-400">Carregando a produção…</p></StudioFundo>;
  if (!p || !pedido) return <StudioFundo className="p-10"><p className="text-sm text-slate-300">Produção não encontrada.</p><Link to={base} className="text-amber-300 underline">Voltar ao Studio</Link></StudioFundo>;

  const recarregar = () => { void qc.invalidateQueries({ queryKey: ['studio-producao', id] }); void qc.invalidateQueries({ queryKey: ['studio-producoes'] }); void qc.invalidateQueries({ queryKey: ['studio-cota'] }); };
  const agir = async (nome: string, f: () => Promise<unknown>, ok?: string) => {
    setOcupado(nome);
    try { await f(); if (ok) toast.success(ok); recarregar(); } catch (e) { toast.error((e as Error).message || 'Não foi possível concluir.'); } finally { setOcupado(null); }
  };

  const idxAtual = LINHA_DO_TEMPO.findIndex((x) => x.estados.includes(p.estado));
  const cenasPlano = p.plano?.cenas ?? [];
  const cenaPorNumero = (n: number) => cenasPlano.find((c) => c.numero === n);
  const fundoDe = (n: number, versao?: number) => {
    const s = p.cenas?.[String(n)];
    const v = s?.versoes?.find((x) => x.versao === (versao ?? s.escolhida)) ?? s?.versoes?.at(-1);
    return v?.url ?? null;
  };
  const todasAprovadas = cenasPlano.length > 0 && cenasPlano.every((c) => p.cenas?.[String(c.numero)]?.escolhida != null);
  const editavel = EDITAVEL.includes(p.estado);
  const errosEdicao = Object.entries(edicoes).flatMap(([k, e]) => validarEdicao(e).map((x) => `Cena ${k}: ${x}`));
  const qcRel = p.resultado?.qc;

  return (
    <StudioFundo className="p-4 sm:p-6 md:p-10">
      <div className="mx-auto max-w-6xl space-y-6" data-testid="studio-producao">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StudioMarca />
          <Button variant="ghost" className="text-slate-300 hover:bg-white/5 hover:text-white" onClick={() => navegar(base)}><ArrowLeft className="mr-2 h-4 w-4" /> Studio</Button>
        </div>

        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2"><SeloEstado estado={p.estado} /><SeloRotulo tipo={p.tipo} /><span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold text-slate-300 ring-1 ring-white/10">{p.formato}</span></div>
          <h1 className="text-2xl font-black text-white sm:text-3xl">{p.titulo}</h1>
          <p className="text-xs text-slate-500">Custo até agora: {p.custo_neurons} neurons (gratuito, dentro da cota diária) · criado em {new Date(p.criado_em).toLocaleString('pt-BR')}</p>
        </header>

        {/* linha do tempo da produção */}
        <ol className="flex gap-1 overflow-x-auto pb-1" aria-label="Linha do tempo da produção">
          {LINHA_DO_TEMPO.map((x, i) => (
            <li key={x.id} className={cn('min-w-[92px] flex-1 rounded-lg px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wide ring-1',
              i < idxAtual || p.estado === 'entregue' ? 'bg-violet-500/20 text-violet-100 ring-violet-400/30' : i === idxAtual ? 'bg-amber-400 text-black ring-amber-400' : 'bg-white/[0.03] text-slate-500 ring-white/5')}>
              {x.nome}
            </li>
          ))}
        </ol>

        {(p.estado === 'erro' || p.estado === 'reprovado' || p.erro) && (
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">
            <p className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{p.erro ?? nomeDoEstado(p.estado)}</p>
            {p.estado === 'erro' && <Button size="sm" className="bg-rose-500 text-white hover:bg-rose-400" disabled={!!ocupado} onClick={() => agir('tentar', () => tentarDeNovo(p.id), 'Retomando de onde parou (sem custo extra).')}><RefreshCcw className="mr-2 h-4 w-4" />Tentar de novo</Button>}
          </div>
        )}

        {ESTADOS_EM_ANDAMENTO.includes(p.estado) && (
          <div className="flex items-center gap-3 rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4 text-sm text-violet-100">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>{p.estado === 'montando' || p.estado === 'conferindo' ? 'Montando e conferindo o vídeo (alguns minutos). Pode sair desta página: o resultado fica salvo aqui.' : `${nomeDoEstado(p.estado)}… esta página se atualiza sozinha.`}</span>
          </div>
        )}

        {p.plano && (
          <Secao titulo="Plano criativo e storyboard" icone={Sparkles} acao={p.estado === 'aguardando_aprovacao_plano' && (
            <Button className="bg-amber-400 font-bold text-black hover:bg-amber-300" disabled={!!ocupado} onClick={() => agir('aprovar', () => aprovarPlano(p.id), 'Plano aprovado. Gerando os cenários…')} data-testid="studio-aprovar-plano">
              {ocupado === 'aprovar' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Aprovar plano e gerar cenários
            </Button>
          )}>
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-2 lg:col-span-2">
                <p className="text-lg font-bold text-white">{p.plano.conceito}</p>
                <p className="text-sm text-slate-300"><span className="text-slate-500">Estilo:</span> {p.plano.estilo_visual}</p>
                <p className="text-sm text-slate-300"><span className="text-slate-500">Linguagem:</span> {p.plano.linguagem}</p>
                <p className="whitespace-pre-line text-sm text-slate-400">{p.plano.roteiro}</p>
              </div>
              <div className="flex flex-wrap content-start gap-2" aria-label="Paleta">
                {p.plano.paleta.map((c) => <span key={c} className="flex items-center gap-1.5 rounded-full bg-black/30 py-1 pl-1 pr-2 text-[10px] text-slate-300"><span className="h-5 w-5 rounded-full ring-1 ring-white/20" style={{ background: c }} />{c}</span>)}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {cenasPlano.map((c) => {
                const pr = c.produto_id ? p.produtos.find((x) => x.id === c.produto_id) : null;
                return (
                  <div key={c.numero} className="space-y-1.5 rounded-xl border border-white/10 bg-black/30 p-3 text-xs">
                    <div className="flex items-center justify-between"><span className="font-black text-amber-300">CENA {c.numero}</span><span className="text-slate-400">{c.duracao_s} s</span></div>
                    <p className="font-bold uppercase text-white">{c.titulo}</p>
                    {c.subtitulo && <p className="text-amber-200/80">{c.subtitulo}</p>}
                    <p className="text-slate-400">{pr ? `Produto: ${pr.nome}` : 'Abertura / fechamento'}</p>
                    <p className="text-slate-500">🎥 {CAMERAS.find((k) => k.id === c.camera)?.nome} · {c.lente}</p>
                    <p className="text-slate-500">💡 {c.iluminacao}</p>
                    <p className="text-slate-500">🖼 {c.enquadramento}</p>
                  </div>
                );
              })}
            </div>
            {p.estado === 'aguardando_aprovacao_plano' && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Textarea className="min-h-16 border-white/10 bg-white/5 text-white" placeholder="Quer mudar algo? Ex.: deixe mais alegre, use luz dourada, termine com a fachada da loja." value={ajustePlano} maxLength={600} onChange={(e) => setAjustePlano(e.target.value)} />
                <Button variant="outline" className="shrink-0 border-white/15 bg-transparent text-slate-200 hover:bg-white/5" disabled={!!ocupado || ajustePlano.trim().length < 5}
                  onClick={() => agir('replanejar', () => pedirReplanejar(p.id, ajustePlano.trim()), 'Ajuste enviado aos agentes.').then(() => setAjustePlano(''))}>
                  <RefreshCcw className="mr-2 h-4 w-4" /> Pedir ajuste
                </Button>
              </div>
            )}
          </Secao>
        )}

        {cenasPlano.some((c) => (p.cenas?.[String(c.numero)]?.versoes ?? []).length > 0) && (
          <Secao titulo="Cenas · aprove, rejeite ou gere de novo" icone={Clapperboard}>
            <p className="text-xs text-slate-400">O cenário é criado pela IA. O produto é a sua foto real e o preço é aplicado pelo sistema. Aprove uma versão por cena para liberar a montagem.</p>
            <div className="grid gap-6 lg:grid-cols-2">
              {(ordem.length ? ordem : cenasPlano.map((c) => c.numero)).map((n) => {
                const c = cenaPorNumero(n);
                const s = p.cenas?.[String(n)];
                if (!c || !s) return null;
                const versaoVista = vendo[String(n)] ?? s.escolhida ?? s.versoes.at(-1)?.versao;
                const v = s.versoes.find((x) => x.versao === versaoVista);
                const ed = edicoes[String(n)];
                return (
                  <div key={n} className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="flex items-center justify-between text-xs"><span className="font-black text-amber-300">CENA {n}</span>
                      {s.escolhida != null ? <span className="flex items-center gap-1 text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> versão {s.escolhida} aprovada</span> : <span className="text-slate-400">aguardando aprovação</span>}
                    </div>
                    {ed && <PreviaCena dados={dadosDaCena(pedido, c, ed, v?.url ?? null, p.rotulo)} />}
                    <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Versões desta cena">
                      {s.versoes.map((x) => (
                        <button key={x.versao} type="button" onClick={() => setVendo((m) => ({ ...m, [String(n)]: x.versao }))}
                          className={cn('relative h-14 w-20 shrink-0 overflow-hidden rounded-md ring-2', x.versao === versaoVista ? 'ring-amber-400' : 'ring-transparent opacity-70 hover:opacity-100')} aria-label={`Ver versão ${x.versao}`}>
                          <img src={x.url} alt="" className="h-full w-full object-cover" />
                          <span className={cn('absolute bottom-0 left-0 right-0 text-center text-[9px] font-bold', x.decisao === 'aprovada' ? 'bg-emerald-500 text-black' : x.decisao === 'rejeitada' ? 'bg-rose-500 text-white' : 'bg-black/70 text-white')}>v{x.versao}</span>
                        </button>
                      ))}
                      {s.gerar && <span className="flex h-14 w-20 shrink-0 items-center justify-center rounded-md bg-white/5"><Loader2 className="h-4 w-4 animate-spin text-violet-300" /></span>}
                    </div>
                    {v && editavel && (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" className="bg-emerald-500 text-black hover:bg-emerald-400" disabled={!!ocupado || v.decisao === 'aprovada'} onClick={() => agir(`ap${n}`, () => decidirImagem(p.id, n, v.versao, 'aprovada'))}><ThumbsUp className="mr-1.5 h-3.5 w-3.5" />Aprovar v{v.versao}</Button>
                        <Button size="sm" variant="outline" className="border-white/15 bg-transparent text-slate-200 hover:bg-white/5" disabled={!!ocupado || v.decisao === 'rejeitada'} onClick={() => agir(`rj${n}`, () => decidirImagem(p.id, n, v.versao, 'rejeitada'))}><ThumbsDown className="mr-1.5 h-3.5 w-3.5" />Rejeitar</Button>
                      </div>
                    )}
                    {editavel && (
                      <div className="flex gap-2">
                        <input className="h-9 min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-3 text-xs text-white placeholder:text-slate-500" placeholder="Instrução (opcional): mais gelo, luz mais quente…" maxLength={300}
                          value={instrucoes[String(n)] ?? ''} onChange={(e) => setInstrucoes((m) => ({ ...m, [String(n)]: e.target.value }))} />
                        <Button size="sm" variant="outline" className="shrink-0 border-violet-400/40 bg-transparent text-violet-200 hover:bg-violet-500/10" disabled={!!ocupado || !!s.gerar}
                          onClick={() => agir(`gn${n}`, () => pedirImagem(p.id, n, instrucoes[String(n)] ?? ''), 'Gerando uma nova versão (cota grátis).').then(() => setInstrucoes((m) => ({ ...m, [String(n)]: '' })))}>
                          <Wand2 className="mr-1.5 h-3.5 w-3.5" />Gerar de novo
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Secao>
        )}

        {editavel && cenasPlano.length > 0 && cenaEditada != null && edicoes[String(cenaEditada)] && (
          <Secao titulo="Editor · textos, cores, posição e ordem" icone={Film} acao={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="border-white/15 bg-transparent text-slate-200 hover:bg-white/5" disabled={!sujo || !!ocupado || errosEdicao.length > 0}
                onClick={() => agir('salvar', () => salvarEdicao(p.id, edicoes, ordem), 'Nova versão da edição salva.').then(() => setSujo(false))}>
                <Save className="mr-2 h-4 w-4" />Salvar versão {p.edicao_versao + 1}
              </Button>
              <Button className="bg-gradient-to-r from-amber-400 to-orange-500 font-bold text-black hover:opacity-90" disabled={!todasAprovadas || sujo || !!ocupado} title={!todasAprovadas ? 'Aprove uma imagem em cada cena' : sujo ? 'Salve a edição antes' : undefined}
                onClick={() => agir('montar', () => pedirMontagem(p.id), p.tipo === 'imagens' ? 'Gerando as artes finais…' : 'Montagem iniciada!')} data-testid="studio-montar">
                {ocupado === 'montar' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Film className="mr-2 h-4 w-4" />}{p.tipo === 'imagens' ? 'Gerar artes finais' : 'Montar vídeo'}
              </Button>
            </div>
          }>
            <div className="flex flex-wrap gap-2" aria-label="Ordem das cenas">
              {ordem.map((n, i) => (
                <div key={n} className={cn('flex items-center gap-1 rounded-lg px-2 py-1 text-xs ring-1', n === cenaEditada ? 'bg-amber-400 text-black ring-amber-400' : 'bg-white/5 text-slate-200 ring-white/10')}>
                  <button type="button" className="px-1 font-bold" onClick={() => setCenaEditada(n)}>Cena {n}</button>
                  <button type="button" aria-label={`Mover cena ${n} para antes`} disabled={i === 0} className="disabled:opacity-30" onClick={() => { setOrdem((o) => { const x = [...o]; [x[i - 1], x[i]] = [x[i], x[i - 1]]; return x; }); setSujo(true); }}><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button type="button" aria-label={`Mover cena ${n} para depois`} disabled={i === ordem.length - 1} className="disabled:opacity-30" onClick={() => { setOrdem((o) => { const x = [...o]; [x[i + 1], x[i]] = [x[i], x[i + 1]]; return x; }); setSujo(true); }}><ArrowDown className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <PreviaCena dados={dadosDaCena(pedido, cenaPorNumero(cenaEditada)!, edicoes[String(cenaEditada)], fundoDe(cenaEditada), p.rotulo)} />
              <EditorCena edicao={edicoes[String(cenaEditada)]}
                temPreco={!!p.produtos.find((x) => x.id === cenaPorNumero(cenaEditada)?.produto_id)?.preco_centavos}
                temRecorte={!!p.produtos.find((x) => x.id === cenaPorNumero(cenaEditada)?.produto_id)?.fotos?.[0]?.recorte_url}
                onChange={(e) => { setEdicoes((m) => ({ ...m, [String(cenaEditada)]: e })); setSujo(true); }} />
            </div>
            {errosEdicao.length > 0 && <ul className="space-y-1 rounded-lg bg-rose-500/10 p-3 text-xs text-rose-200">{errosEdicao.map((e) => <li key={e}>• {e}</li>)}</ul>}
            <p className="text-[11px] text-slate-500">Duração total: {ordem.reduce((s, n) => s + (edicoes[String(n)]?.duracao_s ?? 0), 0)} s. O preço não é editável aqui: ele vem do cadastro do produto no pedido.</p>
          </Secao>
        )}

        {(p.resultado?.video_url || p.resultado?.imagem_url) && (
          <Secao titulo="Resultado" icone={Send}>
            <div className="grid gap-6 lg:grid-cols-5">
              <div className="lg:col-span-3">
                {p.resultado.video_url
                  ? <video src={p.resultado.video_url} controls playsInline className="w-full rounded-xl bg-black ring-1 ring-white/10" style={{ aspectRatio: p.formato.replace(':', ' / ') }} poster={p.resultado.miniatura_url} />
                  : <img src={p.resultado.imagem_url} alt="Arte final" className="w-full rounded-xl ring-1 ring-white/10" />}
                <p className="mt-2 text-[11px] text-slate-400">{ROTULO[p.tipo]} · {p.resultado.largura}×{p.resultado.altura}</p>
              </div>
              <div className="space-y-4 lg:col-span-2">
                {qcRel && (
                  <div className={cn('rounded-xl border p-3', qcRel.aprovado ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-rose-500/30 bg-rose-500/5')}>
                    <p className="mb-2 flex items-center gap-2 text-sm font-bold text-white"><ShieldCheck className="h-4 w-4" />Controle de qualidade: {qcRel.aprovado ? 'aprovado' : 'reprovado'}</p>
                    <ul className="space-y-1 text-[11px]">
                      {qcRel.verificacoes.map((v) => (
                        <li key={v.nome} className={cn('flex gap-1.5', v.ok ? 'text-emerald-200' : v.bloqueia === false ? 'text-amber-200' : 'text-rose-200')}>
                          {v.ok ? <Check className="h-3.5 w-3.5 shrink-0" /> : <X className="h-3.5 w-3.5 shrink-0" />}<span><b>{v.nome}</b>{v.bloqueia === false ? ' (informativo)' : ''}: {v.detalhe}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {p.resultado.video_url && <a href={p.resultado.video_url} download className="inline-flex items-center rounded-md bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"><Download className="mr-1.5 h-3.5 w-3.5" />Baixar MP4</a>}
                  {p.resultado.imagens?.map((u, i) => <a key={u} href={u} download className="inline-flex items-center rounded-md bg-white/5 px-3 py-2 text-xs text-slate-200 hover:bg-white/10"><Download className="mr-1.5 h-3.5 w-3.5" />Cena {i + 1} (PNG)</a>)}
                </div>
                {p.estado === 'pronto' && (
                  <Button className="w-full bg-emerald-500 font-bold text-black hover:bg-emerald-400" disabled={!!ocupado} onClick={() => agir('entregar', () => entregar(p.id, null), areaEquipe ? 'Enviado para as mídias.' : 'Enviado para Minhas Mídias (passa pela análise antes de ir às telas).')} data-testid="studio-entregar">
                    <Send className="mr-2 h-4 w-4" />{areaEquipe ? 'Enviar para as mídias' : 'Enviar para Minhas Mídias'}
                  </Button>
                )}
                {p.estado === 'entregue' && (
                  <div className="space-y-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-100">
                    <p className="font-semibold">Está nas suas mídias.{!areaEquipe && ' Ele passa pela análise de conteúdo antes de ir às telas.'}</p>
                    <div className="flex flex-wrap gap-2">
                      <Link to={areaEquipe ? '/dashboard/medias' : '/portal/assets'} className="inline-flex items-center rounded-md bg-white/10 px-3 py-1.5 font-semibold text-white hover:bg-white/15">Ver mídias</Link>
                      <Link to={areaEquipe ? '/dashboard/playlists' : '/portal/playlists'} className="inline-flex items-center rounded-md bg-amber-400 px-3 py-1.5 font-semibold text-black hover:bg-amber-300"><ListVideo className="mr-1.5 h-3.5 w-3.5" />Adicionar a uma playlist</Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Secao>
        )}

        <Secao titulo="Painel dos agentes" icone={Bot}>
          {etapas.length === 0 && <p className="text-xs text-slate-500">Os registros aparecem conforme os agentes trabalham.</p>}
          <ol className="max-h-80 space-y-1.5 overflow-y-auto pr-1 text-xs">
            {etapas.map((e) => (
              <li key={e.id} className={cn('flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2', e.estado === 'erro' ? 'bg-rose-500/10 text-rose-200' : e.estado === 'substituida' ? 'bg-white/[0.02] text-slate-500 line-through' : 'bg-white/[0.04] text-slate-200')}>
                <span><b>{AGENTES[e.agente] ?? e.agente}</b> <span className="text-slate-500">· {e.chave.replace(/^usuario:/, '')}</span></span>
                <span className="text-slate-500">{e.modelo ? `${e.modelo.split('/').pop()} · ` : ''}{e.neurons ? `${e.neurons} neurons · ` : ''}{e.tentativas > 1 ? `${e.tentativas} tentativas · ` : ''}{new Date(e.criado_em).toLocaleTimeString('pt-BR')}</span>
              </li>
            ))}
          </ol>
        </Secao>

        {!['entregue', 'cancelado'].includes(p.estado) && (
          <div className="text-right">
            <Button variant="ghost" size="sm" className="text-slate-500 hover:bg-white/5 hover:text-rose-300" disabled={!!ocupado} onClick={() => { if (window.confirm('Cancelar esta produção?')) void agir('cancelar', () => cancelar(p.id), 'Produção cancelada.'); }}>Cancelar produção</Button>
          </div>
        )}
      </div>
    </StudioFundo>
  );
}
