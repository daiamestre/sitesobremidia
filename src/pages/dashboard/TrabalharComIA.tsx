/**
 * F-223 — "Trabalhar com IA": a pessoa pede em português (relatório de telas, cobranças, oportunidades…) e o agente da
 * SOBRE MÍDIA responde usando as ferramentas do sistema, com os modelos GRÁTIS (Groq → Google AI Studio → OpenRouter).
 * Ações como "criar cobrança" aparecem num cartão e só acontecem depois do "Confirmar".
 * F-266 (MG-AUT-07): virou a CENTRAL DE COMANDO — também pede produções reais ao Studio (arte, vídeo, campanha) e mostra
 * cada produção num cartão com a situação REAL lida do banco (com o login da pessoa), o que falta ela fazer e o link do Studio.
 */
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Check, Clapperboard, ExternalLink, Loader2, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Markdown } from '@/lib/markdownSimples';
import { cn } from '@/lib/utils';
import { situacaoDaProducao } from '../../../supabase/functions/_shared/agente/studio.ts';

type ProducaoResumo = ReturnType<typeof situacaoDaProducao>;

interface Mensagem { role: 'user' | 'assistant'; content: string; provedor?: string; ferramentas?: string[]; producoes?: ProducaoResumo[]; links?: Array<{ rotulo: string; url: string }> }
interface Acao { id: string; tipo: string; resumo: string; status: string; criado_em: string }

const SUGESTOES = [
  'Relatório completo das telas de hoje: quais estão fora do ar?',
  'Resumo financeiro deste mês',
  'Quais cobranças estão vencidas?',
  'Analise os dados e me mostre novas oportunidades de venda',
  'Crie um vídeo de 15 segundos para a farmácia … divulgando …',
  'Como estão as minhas produções do Studio?',
  'Monte um encarte de supermercado com: Arroz Tio João 5kg 24,90; Feijão Kicaldo 1kg 7,99 …',
  'Transforme a minha última arte em um vídeo de 15 segundos',
  'Crie uma cobrança de R$ 150,00 para a empresa … com vencimento dia …',
];
const CHAVE = 'trabalhar-com-ia-conversa';
const NOME_DA_FERRAMENTA: Record<string, string> = {
  relatorio_telas: 'telas', resumo_financeiro: 'financeiro', listar_cobrancas: 'cobranças', buscar_cliente: 'clientes', oportunidades: 'oportunidades', propor_cobranca: 'nova cobrança',
  criar_producao: 'Studio (nova produção)', listar_producoes: 'Studio', situacao_da_producao: 'Studio',
  montar_encarte: 'encarte oficial', listar_minhas_artes: 'biblioteca', animar_arte: 'editor de vídeo',
};
const FINAIS = ['pronto', 'entregue', 'reprovado', 'erro', 'cancelado'];

/** Cartão de uma produção do Studio: estado REAL, relido a cada 10 s enquanto não termina (nunca "pronto" antes da hora). */
function CartaoProducao({ inicial }: { inicial: ProducaoResumo }) {
  const q = useQuery({
    queryKey: ['central-producao', inicial.id],
    queryFn: async () => {
      const { data } = await (supabase as unknown as { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: Parameters<typeof situacaoDaProducao>[0] | null }> } } } })
        .from('studio_producoes').select('id, titulo, estado, erro, tipo, formato, resultado').eq('id', inicial.id).maybeSingle();
      return data ? situacaoDaProducao(data) : inicial;
    },
    initialData: inicial,
    refetchInterval: (r) => (FINAIS.includes(r.state.data?.estado ?? '') ? false : 10_000),
  });
  const p = q.data ?? inicial;
  const fim = FINAIS.includes(p.estado);
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-xl border border-[#8A2EFF]/40 bg-[#22004A]/50 p-3 sm:flex-row sm:items-center" data-testid="central-producao">
      <Clapperboard className="hidden h-5 w-5 shrink-0 text-[#B04DFF] sm:block" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="truncate font-bold">{p.titulo || 'Produção do Studio'}</p>
        <p className="text-xs text-slate-300">
          <span className={cn('mr-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold', p.estado === 'pronto' || p.estado === 'entregue' ? 'bg-[#25D366]/20 text-[#25D366]' : p.estado === 'erro' || p.estado === 'reprovado' ? 'bg-rose-500/20 text-rose-300' : 'bg-[#FFD400]/15 text-[#FFD400]')}>
            {!fim && <Loader2 className="h-3 w-3 animate-spin" />}agentes do Studio</span>
          {p.situacao}{p.o_que_fazer ? <> · <b className="text-white">sua vez: {p.o_que_fazer}</b></> : null}{p.erro ? <> · {p.erro}</> : null}
        </p>
      </div>
      <Button asChild size="sm" className="bg-[#5D1BFF] hover:bg-[#8A2EFF]"><Link to={p.abrir_no_studio} data-testid="central-abrir-studio"><ExternalLink className="mr-1.5 h-4 w-4" />Abrir no Studio</Link></Button>
    </div>
  );
}

async function chamar<T>(corpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('agente-ia', { body: corpo });
  if (error) {
    let msg = error.message;
    try { const ctx = (error as unknown as { context?: Response }).context; if (ctx) msg = (await ctx.json())?.error ?? msg; } catch { /* mantém a mensagem */ }
    throw new Error(msg);
  }
  return data as T;
}

const lerConversa = (): Mensagem[] => { try { return JSON.parse(localStorage.getItem(CHAVE) ?? '[]'); } catch { return []; } };

export default function TrabalharComIA() {
  const qc = useQueryClient();
  const [conversa, setConversa] = useState<Mensagem[]>(lerConversa);
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const [decidindo, setDecidindo] = useState<string | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const pendentes = useQuery({
    queryKey: ['agente-ia-pendentes'],
    queryFn: async () => {
      const { data } = await (supabase as unknown as { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { order: (c: string, o: { ascending: boolean }) => Promise<{ data: Acao[] | null }> } } } })
        .from('agente_ia_acoes').select('id, tipo, resumo, status, criado_em').eq('status', 'PENDENTE').order('criado_em', { ascending: false });
      return (data ?? []).filter((a) => Date.now() - new Date(a.criado_em).getTime() < 30 * 60_000);
    },
  });

  useEffect(() => { try { localStorage.setItem(CHAVE, JSON.stringify(conversa.slice(-40))); } catch { /* sem armazenamento */ } }, [conversa]);
  useEffect(() => { fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [conversa, pensando]);

  const enviar = async (pergunta = texto) => {
    const p = pergunta.trim();
    if (p.length < 2 || pensando) return;
    const historico = conversa.slice(-10).map(({ role, content }) => ({ role, content }));
    setConversa((c) => [...c, { role: 'user', content: p }]);
    setTexto('');
    setPensando(true);
    try {
      const r = await chamar<{ resposta: string; provedor: string; ferramentas: string[]; acoes: Acao[]; producoes?: ProducaoResumo[]; links?: Array<{ rotulo: string; url: string }> }>({ acao: 'perguntar', pergunta: p, historico });
      setConversa((c) => [...c, { role: 'assistant', content: r.resposta || 'Sem resposta.', provedor: r.provedor, ferramentas: r.ferramentas, producoes: r.producoes ?? [], links: r.links ?? [] }]);
      if (r.acoes?.length) void qc.invalidateQueries({ queryKey: ['agente-ia-pendentes'] });
    } catch (e) {
      setConversa((c) => [...c, { role: 'assistant', content: `⚠️ ${(e as Error).message}` }]);
    } finally { setPensando(false); }
  };

  const decidir = async (a: Acao, confirmar: boolean) => {
    setDecidindo(a.id);
    try {
      const r = await chamar<{ ok: boolean; codigo?: string }>({ acao: confirmar ? 'confirmar' : 'cancelar', id: a.id });
      if (confirmar) {
        toast.success(`Cobrança ${r.codigo ?? ''} criada. Ela já está na Central de Cobranças.`);
        setConversa((c) => [...c, { role: 'assistant', content: `✅ **Cobrança ${r.codigo ?? ''} criada.** ${a.resumo}. Ela já aparece na Central de Cobranças, com PIX e boleto.` }]);
      } else toast.info('Proposta descartada.');
    } catch (e) { toast.error((e as Error).message); } finally {
      setDecidindo(null);
      void qc.invalidateQueries({ queryKey: ['agente-ia-pendentes'] });
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100dvh-7rem)] max-w-5xl flex-col gap-3" data-testid="trabalhar-com-ia">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl gradient-primary"><Bot className="h-6 w-6 text-white" /></div>
        <div className="mr-auto min-w-0">
          <h1 className="text-xl font-black">Central de Comando <span className="text-sm font-semibold text-muted-foreground">· Trabalhar com IA</span></h1>
          <p className="text-xs text-muted-foreground">Peça relatórios, cobranças, análises, artes e vídeos. O agente usa os dados do sistema com o seu acesso; cobranças só são criadas depois do seu "Confirmar" e as produções do Studio esperam a sua aprovação.</p>
        </div>
        {conversa.length > 0 && <Button variant="outline" size="sm" onClick={() => setConversa([])}><RotateCcw className="mr-1.5 h-4 w-4" />Nova conversa</Button>}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-3 sm:p-4">
        {conversa.length === 0 && (
          <div className="space-y-3 py-6 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-[#B04DFF]" />
            <p className="text-sm text-muted-foreground">O que você precisa hoje? Toque numa sugestão ou escreva.</p>
            <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-2">
              {SUGESTOES.map((s) => (
                <button key={s} type="button" onClick={() => (s.includes('…') ? setTexto(s) : void enviar(s))} className="rounded-full border border-white/15 px-3 py-1.5 text-xs hover:border-[#8A2EFF] hover:bg-[#5D1BFF]/20" data-testid="ia-sugestao">{s}</button>
              ))}
            </div>
          </div>
        )}
        {conversa.map((m, i) => (
          <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[92%] rounded-2xl px-3.5 py-2.5 sm:max-w-[85%]', m.role === 'user' ? 'bg-[#5D1BFF] text-sm text-white' : 'border border-white/10 bg-white/[0.04]')} data-testid={m.role === 'assistant' ? 'ia-resposta' : undefined}>
              {m.role === 'user' ? m.content : <Markdown texto={m.content} />}
              {m.provedor && (
                <p className="mt-1.5 text-[10px] text-muted-foreground">via {m.provedor} (grátis){m.ferramentas?.length ? ` · consultou: ${[...new Set(m.ferramentas.map((f) => NOME_DA_FERRAMENTA[f] ?? f))].join(', ')}` : ''}</p>
              )}
              {m.producoes?.map((p) => <CartaoProducao key={p.id} inicial={p} />)}
              {m.links?.map((l) => (
                <Link key={l.url} to={l.url} className="mt-2 flex items-center gap-2 rounded-xl border border-[#FFD400]/50 bg-[#FFD400]/10 px-3 py-2 text-sm font-semibold text-[#FFD400] hover:bg-[#FFD400]/20" data-testid="central-link">
                  <ExternalLink className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">{l.rotulo}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
        {pensando && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Consultando o sistema…</div>}
        <div ref={fim} />
      </div>

      {(pendentes.data ?? []).map((a) => (
        <div key={a.id} className="flex flex-col gap-2 rounded-xl border border-[#FFD400]/50 bg-[#FFD400]/10 p-3 sm:flex-row sm:items-center" data-testid="ia-acao-pendente">
          <p className="flex-1 text-sm"><b>Confirme a ação:</b> {a.resumo}</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void decidir(a, true)} disabled={!!decidindo} className="bg-[#25D366] text-[#0b2a17] hover:bg-[#25D366]/90" data-testid="ia-confirmar">
              {decidindo === a.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}Confirmar
            </Button>
            <Button size="sm" variant="outline" onClick={() => void decidir(a, false)} disabled={!!decidindo}><X className="mr-1 h-4 w-4" />Descartar</Button>
          </div>
        </div>
      ))}

      <form onSubmit={(e) => { e.preventDefault(); void enviar(); }} className="flex items-end gap-2">
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} maxLength={2000} placeholder="Ex.: quais telas estão fora do ar agora?"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(); } }}
          className="min-h-[52px] flex-1 resize-none rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm focus:border-[#8A2EFF] focus:outline-none" aria-label="Pedido para o agente" data-testid="ia-texto" />
        <Button type="submit" disabled={pensando || texto.trim().length < 2} className="h-[52px] gradient-primary px-4" aria-label="Enviar" data-testid="ia-enviar">
          {pensando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </Button>
      </form>
    </div>
  );
}
