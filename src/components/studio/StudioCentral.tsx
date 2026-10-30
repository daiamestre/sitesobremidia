import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Building2, Clapperboard, Film, Image as ImageIcon, Lock, Megaphone, MonitorPlay, Package, PenTool, Smartphone, Sparkles, Wand2, Gauge,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { listarProducoes, minhaCota, provedores, type Producao } from '@/lib/studio/api';
import { ESTADOS_EM_ANDAMENTO, SeloEstado, SeloRotulo, StudioFundo, StudioMarca, StudioSemAcesso, miniaturaDa, useEscopoStudio } from './comum';

export interface OpcaoCriacao {
  id: string;
  titulo: string;
  descricao: string;
  icone: typeof Package;
  bloqueio?: string;
}

/** Central de criação: cada opção abre o briefing com um ponto de partida. Nada aparece como disponível se não existe. */
export const OPCOES_CRIACAO: OpcaoCriacao[] = [
  { id: 'produto', titulo: 'Anúncio de produto', descricao: 'Seu produto real num cenário publicitário com preço exato.', icone: Package },
  { id: 'promocional', titulo: 'Vídeo promocional', descricao: 'Vídeo de 15 s com cenas, movimento e chamada.', icone: Film },
  { id: 'ofertas', titulo: 'Campanha de ofertas', descricao: 'Vários produtos e preços em sequência.', icone: Megaphone },
  { id: 'institucional', titulo: 'Anúncio institucional', descricao: 'Apresente sua marca, sem preço.', icone: Building2 },
  { id: 'redes', titulo: 'Vídeo para redes sociais', descricao: 'Vertical 9:16 para stories, reels e status.', icone: Smartphone },
  { id: 'telas', titulo: 'Conteúdo para telas digitais', descricao: 'Horizontal 16:9 pronto para as TVs.', icone: MonitorPlay },
  { id: 'arte', titulo: 'Arte publicitária', descricao: 'Imagem PNG em alta resolução para tela ou impressão.', icone: ImageIcon },
  { id: 'cinematografica', titulo: 'Campanha cinematográfica', descricao: '30 s, 6 cenas, linguagem de cinema.', icone: Clapperboard },
  { id: 'modelo', titulo: 'Modelo editável no Canva', descricao: 'Modelos mestres do Canva preenchidos com seus dados.', icone: PenTool, bloqueio: 'Aguardando a integração Canva do proprietário. Toda produção já pode ser editada aqui no Studio.' },
  { id: 'video_ia', titulo: 'Vídeo gerado por IA', descricao: 'Movimento real gerado por provedor de vídeo.', icone: Wand2, bloqueio: 'Aguardando a escolha do provedor de vídeo e do orçamento. Hoje o Studio entrega "vídeo montado a partir de imagens".' },
];

export function StudioCentral({ base }: { base: string }) {
  const escopo = useEscopoStudio();
  const lista = useQuery({
    queryKey: ['studio-producoes'],
    queryFn: listarProducoes,
    enabled: escopo.data?.pronto === true && escopo.data.pode,
    refetchInterval: (q) => ((q.state.data as Producao[] | undefined)?.some((p) => ESTADOS_EM_ANDAMENTO.includes(p.estado)) ? 5000 : false),
  });
  const cota = useQuery({ queryKey: ['studio-cota'], queryFn: minhaCota, enabled: escopo.data?.pronto === true && escopo.data.pode });
  const prov = useQuery({ queryKey: ['studio-provedores'], queryFn: provedores, staleTime: 300_000 });

  if (escopo.isLoading) return <StudioFundo className="p-10"><p className="text-sm text-slate-400">Carregando o Studio…</p></StudioFundo>;
  if (escopo.data && !escopo.data.pronto) return <StudioFundo className="p-6 md:p-10"><StudioMarca /><div className="mt-8"><StudioSemAcesso motivo="ativacao" /></div></StudioFundo>;
  if (escopo.data && !escopo.data.pode) return <StudioFundo className="p-6 md:p-10"><StudioMarca /><div className="mt-8"><StudioSemAcesso motivo="perfil" /></div></StudioFundo>;

  return (
    <StudioFundo className="p-4 sm:p-6 md:p-10" >
      <div data-testid="studio-central" className="space-y-10">
        <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4">
            <StudioMarca />
            <h1 className="max-w-2xl text-3xl font-black leading-[1.05] tracking-tight text-white sm:text-4xl md:text-5xl">
              Do seu produto a um <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500 bg-clip-text text-transparent">anúncio de cinema</span> para as telas.
            </h1>
            <p className="max-w-xl text-sm text-slate-400 sm:text-base">
              Conte a ideia, envie a foto do produto e o preço. Os agentes de IA planejam o roteiro e criam os cenários. Você aprova cada etapa. O preço é aplicado pelo sistema, exatamente como você digitou.
            </p>
          </div>
          <div className="grid w-full max-w-sm grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-center" aria-label="Cota de hoje">
            {(['plano', 'imagem', 'montagem'] as const).map((m) => (
              <div key={m}>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">{m === 'plano' ? 'Planos' : m === 'imagem' ? 'Imagens' : 'Montagens'}</p>
                <p className="text-lg font-bold text-white">{cota.data?.[m] ? `${cota.data[m].limite - cota.data[m].usado}` : '—'}</p>
                <p className="text-[10px] text-slate-500">restantes hoje</p>
              </div>
            ))}
            <p className="col-span-3 flex items-center justify-center gap-1 text-[10px] text-slate-500"><Gauge className="h-3 w-3" /> Gratuito na cota diária da infraestrutura de IA já contratada</p>
          </div>
        </header>

        <section aria-labelledby="studio-criar" className="space-y-4">
          <h2 id="studio-criar" className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-violet-300"><Sparkles className="h-4 w-4" /> Central de criação</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {OPCOES_CRIACAO.map((o) => {
              const Icone = o.icone;
              const conteudo = (
                <div className={cn('group relative h-full overflow-hidden rounded-2xl border p-4 transition',
                  o.bloqueio ? 'cursor-not-allowed border-white/5 bg-white/[0.02] opacity-60' : 'border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.01] hover:-translate-y-0.5 hover:border-violet-400/50 hover:shadow-lg hover:shadow-violet-900/40')}>
                  <span className={cn('mb-3 flex h-10 w-10 items-center justify-center rounded-xl', o.bloqueio ? 'bg-white/5 text-slate-500' : 'bg-violet-500/15 text-violet-300 group-hover:bg-amber-400 group-hover:text-black')}>
                    {o.bloqueio ? <Lock className="h-5 w-5" /> : <Icone className="h-5 w-5" />}
                  </span>
                  <p className="font-bold text-white">{o.titulo}</p>
                  <p className="mt-1 text-xs text-slate-400">{o.bloqueio ?? o.descricao}</p>
                </div>
              );
              return o.bloqueio
                ? <div key={o.id} title={o.bloqueio} aria-disabled="true">{conteudo}</div>
                : <Link key={o.id} to={`${base}/novo?modo=${o.id}`} className="focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-2xl">{conteudo}</Link>;
            })}
          </div>
        </section>

        <section aria-labelledby="studio-producoes" className="space-y-4">
          <h2 id="studio-producoes" className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-violet-300"><Film className="h-4 w-4" /> Minhas produções</h2>
          {lista.isLoading && <p className="text-sm text-slate-500">Carregando…</p>}
          {lista.error && <p className="text-sm text-rose-300">Não foi possível carregar as produções.</p>}
          {lista.data?.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-400">Nenhuma produção ainda. Escolha uma opção acima para começar.</div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {lista.data?.map((p) => {
              const mini = miniaturaDa(p);
              return (
                <Link key={p.id} to={`${base}/${p.id}`} className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition hover:border-amber-400/50">
                  <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-black">
                    {mini ? <img src={mini} alt="" loading="lazy" className={cn('h-full transition duration-500 group-hover:scale-105', p.formato === '16:9' ? 'w-full object-cover' : 'object-contain')} />
                      : <Clapperboard className="h-8 w-8 text-slate-700" />}
                    <span className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">{p.formato}</span>
                  </div>
                  <div className="space-y-2 p-3">
                    <p className="truncate font-semibold text-white">{p.titulo}</p>
                    <div className="flex flex-wrap items-center gap-1.5"><SeloEstado estado={p.estado} /><SeloRotulo tipo={p.tipo} /></div>
                    <p className="text-[11px] text-slate-500">{new Date(p.criado_em).toLocaleString('pt-BR')}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="studio-provedores" className="space-y-3">
          <h2 id="studio-provedores" className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Ferramentas de IA e situação</h2>
          {!prov.data && <p className="text-xs text-slate-500">A situação dos provedores aparece quando o orquestrador estiver publicado.</p>}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {prov.data?.map((x) => (
              <div key={x.id} className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', x.disponivel ? 'bg-emerald-400' : 'bg-slate-600')} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-200">{x.nome}</p>
                  <p className="text-[11px] text-slate-500">{x.disponivel ? x.custoTexto : x.motivo}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </StudioFundo>
  );
}
