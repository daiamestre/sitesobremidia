import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Coins, Copy, Download, GitBranch, ImagePlus, Loader2, MessageSquarePlus, Paperclip, Send, ShieldCheck, Sparkles, Wand2, X } from 'lucide-react';
import { toast } from 'sonner';
import { PublicarDialog } from '@/components/studioai/PublicarDialog';
import { PagamentoCreditos } from '@/components/studioai/PagamentoCreditos';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { uploadToR2 } from '@/lib/r2Upload';
import { EM_ANDAMENTO, SemCreditos, brl, gerarImagem, listarConversas, meuSaldo, obterConversa, sugerirPrompt, type ImagemIA, type Job } from '@/lib/studioai/api';
import { baixar } from '@/lib/studioai/exportar';
import { cn } from '@/lib/utils';

/** Logos promocionais 3D: textos prontos (o texto vai entre aspas e é conferido no prompt melhorado). */
const LOGOS_3D = ['OFERTAS DA SEMANA', 'OFERTAS DO DIA', 'OFERTAS DO MÊS', 'SUPER OFERTA', 'MEGA PROMOÇÃO', 'PREÇO BAIXO', 'OFERTA EXCLUSIVA', 'OFERTAS IMPERDÍVEIS', 'PREÇO ESPECIAL', 'QUEIMA DE ESTOQUE', 'SÓ HOJE', 'ÚLTIMAS UNIDADES', 'PROMOÇÃO RELÂMPAGO', 'DESCONTÃO', 'OFERTA ESPECIAL'];
const promptLogo = (texto: string) => `Logo promocional 3D com o texto exato "${texto}": letras brancas e amarelas com extrusão profunda, contorno vermelho intenso, brilho metálico dourado, reflexos realistas, sombra tridimensional, iluminação de estúdio, faixa ou medalhão promocional, acabamento publicitário profissional para cabeçalho de tabloide. Fundo totalmente transparente.`;
const STATUS: Record<string, string> = {
  AGUARDANDO: 'Aguardando', RESERVANDO: 'Reservando crédito', PROCESSANDO: 'Criando a imagem…', CONCLUIDO: 'Pronto', FALHA: 'Falhou',
  CANCELADO: 'Cancelado', ESTORNO_PENDENTE: 'Devolvendo crédito', ESTORNADO: 'Falhou · crédito devolvido',
};

async function blobDaUrl(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('Não foi possível baixar a imagem.');
  return r.blob();
}

export default function IAPage() {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const { user } = useAuth();
  const conversaId = params.get('conversa');
  const saldo = useQuery({ queryKey: ['studio-ai-saldo'], queryFn: meuSaldo, staleTime: 15_000 });
  const conversas = useQuery({ queryKey: ['studio-ai-conversas'], queryFn: listarConversas });
  const conversa = useQuery({
    queryKey: ['studio-ai-conversa', conversaId], queryFn: () => obterConversa(conversaId!), enabled: !!conversaId,
    refetchInterval: (q) => ((q.state.data as { jobs: Job[] } | undefined)?.jobs.some((j) => EM_ANDAMENTO.includes(j.status)) ? 3000 : false),
  });
  const [texto, setTexto] = useState('');
  const [refs, setRefs] = useState<string[]>(() => (params.get('ref') ? [params.get('ref')!] : []));
  const [origem, setOrigem] = useState<ImagemIA | null>(null);
  const [proporcao, setProporcao] = useState<'quadrado' | 'horizontal' | 'vertical'>(params.get('formato') === '16:9' ? 'horizontal' : params.get('formato') === '9:16' ? 'vertical' : 'quadrado');
  const [qualidade, setQualidade] = useState<'low' | 'medium' | 'high'>('medium');
  const [transparente, setTransparente] = useState(false);
  const [sugestao, setSugestao] = useState<{ prompt: string | null; dicas: string[]; aviso: string | null } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [publicar, setPublicar] = useState<ImagemIA | null>(null);
  const fim = useRef<HTMLDivElement>(null);

  // F-219: todos pagam por criação, menos owner/ADM
  const anunciante = !!saldo.data?.paga;
  const [pagando, setPagando] = useState(false);
  const preco = brl(saldo.data?.preco_centavos ?? 499);
  const semSaldo = anunciante && (saldo.data?.saldo ?? 0) < 1;
  const jobs = conversa.data?.jobs ?? [];
  const imagens = conversa.data?.imagens ?? [];
  const imagemDoJob = useMemo(() => new Map(imagens.map((i) => [i.job_id, i])), [imagens]);
  useEffect(() => { fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [jobs.length, imagens.length]);
  useEffect(() => { if (jobs.some((j) => !EM_ANDAMENTO.includes(j.status))) void qc.invalidateQueries({ queryKey: ['studio-ai-saldo'] }); }, [jobs, qc]);

  const anexar = async (arq: File | undefined) => {
    if (!arq || !user) return;
    if (!/^image\/(jpeg|png|webp)$/.test(arq.type) || arq.size > 20 * 1024 * 1024) { toast.error('Envie JPG, PNG ou WebP de até 20 MB.'); return; }
    setOcupado('anexo');
    try {
      const { publicUrl } = await uploadToR2(arq, `${user.id}/studio/ref-${Date.now()}.${arq.type.split('/')[1]}`, arq.type, user.id, { preventOverwrite: true });
      setRefs((r) => [...r, publicUrl].slice(0, 4));
    } catch (e) { toast.error((e as Error).message); } finally { setOcupado(null); }
  };

  const melhorar = async () => {
    if (texto.trim().length < 5) { toast.info('Escreva primeiro o que você quer criar.'); return; }
    setOcupado('melhorar');
    try { setSugestao(await sugerirPrompt(texto)); } catch (e) { toast.error((e as Error).message); } finally { setOcupado(null); }
  };

  const gerar = async (prompt = texto, original = texto) => {
    if (prompt.trim().length < 5) { toast.info('Descreva o que você quer criar.'); return; }
    setOcupado('gerar');
    try {
      const r = await gerarImagem({ conversaId, prompt: prompt.trim(), promptOriginal: original.trim(), proporcao, qualidade, transparente, referencias: refs, origemImagemId: origem?.id ?? null });
      setTexto(''); setRefs([]); setOrigem(null); setSugestao(null);
      if (r.conversa_id !== conversaId) setParams({ conversa: r.conversa_id });
      void qc.invalidateQueries({ queryKey: ['studio-ai-conversa', r.conversa_id] });
      void qc.invalidateQueries({ queryKey: ['studio-ai-conversas'] });
      void qc.invalidateQueries({ queryKey: ['studio-ai-saldo'] });
    } catch (e) {
      if (e instanceof SemCreditos) toast.error(e.message, { action: { label: 'Comprar créditos', onClick: () => { window.location.href = '/studio/configuracoes'; } } });
      else toast.error((e as Error).message || 'Não foi possível criar.');
    } finally { setOcupado(null); }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]" data-testid="studio-ia">
      <aside className="grid grid-cols-[auto_1fr] items-center gap-2 rounded-xl border border-white/10 bg-[#12052b] p-3 xl:block xl:space-y-3 xl:sticky xl:top-[88px] xl:max-h-[calc(100vh-110px)] xl:overflow-y-auto">
        <button type="button" onClick={() => { setParams({}); setOrigem(null); }} className="flex items-center justify-center gap-2 rounded-lg bg-[#5D1BFF] px-3 py-2.5 text-sm font-semibold text-white hover:bg-[#8A2EFF] xl:w-full" aria-label="Nova criação"><MessageSquarePlus className="h-4 w-4" /><span className="hidden sm:inline xl:inline">Nova criação</span></button>
        {/* celular e tablet: histórico numa lista compacta */}
        <select className="w-full rounded-lg border border-white/15 bg-[#170838] px-3 py-2 text-sm text-white xl:hidden" aria-label="Histórico de criações"
          value={conversaId ?? ''} onChange={(e) => (e.target.value ? setParams({ conversa: e.target.value }) : setParams({}))}>
          <option value="">Histórico ({conversas.data?.length ?? 0})</option>
          {conversas.data?.map((c) => <option key={c.id} value={c.id}>{c.titulo.slice(0, 60)}</option>)}
        </select>
        <p className="hidden px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 xl:block">Histórico</p>
        {conversas.data?.length === 0 && <p className="hidden px-1 text-xs text-slate-500 xl:block">Suas criações aparecem aqui.</p>}
        {conversas.data?.map((c) => (
          <button key={c.id} type="button" onClick={() => setParams({ conversa: c.id })} className={cn('hidden w-full truncate rounded-lg px-3 py-2 text-left text-sm xl:block', c.id === conversaId ? 'bg-[#5D1BFF]/40 text-white' : 'text-slate-300 hover:bg-white/5')}>
            {c.titulo}<span className="block text-[10px] text-slate-500">{new Date(c.atualizado_em).toLocaleString('pt-BR')}</span>
          </button>
        ))}
      </aside>

      <section className="flex min-h-[70vh] flex-col rounded-xl border border-[#8A2EFF]/30 bg-[#0e0424]">
        <header className="flex flex-wrap items-center gap-3 border-b border-white/5 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#FFD400] to-[#ff9d00] text-[#22004A]"><Sparkles className="h-5 w-5" /></span>
          <div className="mr-auto"><h1 className="text-lg font-black text-white">Criar com IA</h1><p className="text-xs text-slate-400">ChatGPT (OpenAI GPT Image) dentro da SOBRE MÍDIA</p></div>
          {anunciante ? (
            <Link to="/studio/configuracoes" className="flex items-center gap-2 rounded-full border border-[#FFD400]/40 bg-[#FFD400]/10 px-3 py-1.5 text-xs font-bold text-[#FFD400]"><Coins className="h-4 w-4" />{saldo.data?.saldo ?? 0} crédito(s) · {preco} por criação</Link>
          ) : <span className="rounded-full bg-white/5 px-3 py-1.5 text-xs text-slate-300">Uso interno da equipe (sem cobrança)</span>}
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-4" aria-live="polite">
          {!conversaId && (
            <div className="mx-auto max-w-3xl space-y-4 py-6 text-center">
              <h2 className="text-2xl font-black text-white">O que vamos criar hoje?</h2>
              <p className="text-sm text-slate-400">Descreva a imagem com detalhes. Você pode anexar fotos de referência e pedir novas versões até ficar do jeito que você quer.</p>
              <div className="text-left">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#B04DFF]">Logos promocionais 3D</p>
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
                  {LOGOS_3D.map((l) => (
                    <button key={l} type="button" onClick={() => { setTexto(promptLogo(l)); setTransparente(true); setProporcao('horizontal'); }}
                      className="shrink-0 whitespace-nowrap rounded-full border border-[#8A2EFF]/40 bg-[#22004A] px-3 py-1.5 text-xs font-bold text-[#FFD400] hover:border-[#FFD400]">{l}</button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {jobs.map((j) => {
            const img = imagemDoJob.get(j.id);
            return (
              <div key={j.id} className="space-y-3">
                <div className="ml-auto max-w-2xl rounded-2xl rounded-tr-sm bg-[#5D1BFF]/35 p-3 text-sm text-white">
                  <p className="whitespace-pre-line">{j.prompt_original}</p>
                  {j.prompt_enviado !== j.prompt_original && <p className="mt-2 border-t border-white/10 pt-2 text-xs text-slate-300">Prompt usado: {j.prompt_enviado}</p>}
                  <p className="mt-1 text-[10px] text-slate-300">{j.tipo === 'editar' ? 'Nova versão / com referências' : 'Criação'} · {j.parametros.proporcao} · {j.parametros.qualidade}{j.parametros.transparente ? ' · fundo transparente' : ''}{j.cobrar ? ` · ${j.creditos} crédito` : ''}</p>
                </div>
                <div className="max-w-2xl rounded-2xl rounded-tl-sm border border-white/10 bg-[#170838] p-3">
                  {EM_ANDAMENTO.includes(j.status) && <p className="flex items-center gap-2 text-sm text-slate-300"><Loader2 className="h-4 w-4 animate-spin text-[#B04DFF]" />{STATUS[j.status]}</p>}
                  {(j.status === 'FALHA' || j.status === 'ESTORNADO') && <p className="flex items-start gap-2 text-sm text-rose-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{j.erro ?? STATUS[j.status]}</p>}
                  {img && (
                    <div className="space-y-2">
                      <div className={cn('overflow-hidden rounded-xl', img.alfa === 'verificado' && 'bg-[conic-gradient(#2a2a3a_25%,#3a3a4a_0_50%,#2a2a3a_0_75%,#3a3a4a_0)] bg-[length:20px_20px]')}>
                        <img src={img.url} alt={`Imagem criada: ${j.prompt_original.slice(0, 80)}`} className="max-h-[520px] w-full object-contain" />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded bg-white/5 px-2 py-1 text-slate-300">{img.largura}×{img.altura} · PNG</span>
                        {img.alfa === 'verificado' && <span className="flex items-center gap-1 rounded bg-[#25D366]/15 px-2 py-1 text-[#7dffb0]"><ShieldCheck className="h-3.5 w-3.5" />Transparência real verificada</span>}
                        {img.alfa === 'ausente' && <span className="rounded bg-amber-500/15 px-2 py-1 text-amber-200">Fundo NÃO ficou transparente (peça nova versão)</span>}
                        {img.versao_de && <span className="rounded bg-white/5 px-2 py-1 text-slate-400">versão de uma imagem anterior</span>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setPublicar(img)} className="rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-bold text-[#0b2a17]">Salvar e publicar</button>
                        <button type="button" onClick={() => { setOrigem(img); setTransparente(j.parametros.transparente); document.getElementById('studio-ia-texto')?.focus(); }} className="flex items-center gap-1 rounded-lg border border-[#8A2EFF]/50 px-3 py-1.5 text-xs text-white hover:bg-white/5"><GitBranch className="h-3.5 w-3.5" />Pedir alteração</button>
                        <button type="button" onClick={() => void blobDaUrl(img.url).then((b) => baixar(b, `studio-ia-${img.id.slice(0, 8)}.png`)).catch((e) => toast.error(e.message))} className="flex items-center gap-1 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/5"><Download className="h-3.5 w-3.5" />Baixar</button>
                        <button type="button" onClick={() => setRefs((r) => [...new Set([...r, img.url])].slice(0, 4))} className="flex items-center gap-1 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/5"><Copy className="h-3.5 w-3.5" />Usar como referência</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={fim} />
        </div>

        <footer className="sticky bottom-0 z-10 space-y-3 rounded-b-xl border-t border-white/10 bg-[#0e0424]/95 p-3 backdrop-blur sm:p-4">
          {origem && (
            <p className="flex items-center gap-2 rounded-lg bg-[#5D1BFF]/25 p-2 text-xs text-white"><img src={origem.url} alt="" className="h-10 w-10 rounded object-cover" />Alterando esta imagem: descreva o que mudar.<button type="button" className="ml-auto" aria-label="Cancelar alteração" onClick={() => setOrigem(null)}><X className="h-4 w-4" /></button></p>
          )}
          {refs.length > 0 && (
            <div className="flex flex-wrap gap-2">{refs.map((r) => (
              <span key={r} className="relative"><img src={r} alt="Referência" className="h-14 w-14 rounded-lg object-cover ring-1 ring-white/15" /><button type="button" aria-label="Tirar referência" onClick={() => setRefs((l) => l.filter((x) => x !== r))} className="absolute -right-1.5 -top-1.5 rounded-full bg-black p-0.5"><X className="h-3 w-3" /></button></span>
            ))}</div>
          )}
          {sugestao && (
            <div className="space-y-2 rounded-xl border border-[#FFD400]/30 bg-[#FFD400]/5 p-3 text-sm">
              {sugestao.aviso && <p className="text-xs text-amber-200">{sugestao.aviso}</p>}
              {sugestao.prompt && <p className="text-slate-100"><b className="text-[#FFD400]">Sugestão:</b> {sugestao.prompt}</p>}
              {sugestao.dicas.length > 0 && <ul className="list-disc pl-5 text-xs text-slate-300">{sugestao.dicas.map((d) => <li key={d}>{d}</li>)}</ul>}
              <div className="flex gap-2">
                {sugestao.prompt && <button type="button" onClick={() => { if (semSaldo) { setTexto(sugestao.prompt!); setPagando(true); } else void gerar(sugestao.prompt!, texto); }} disabled={!!ocupado} className="rounded-lg bg-[#FFD400] px-3 py-1.5 text-xs font-bold text-[#22004A]">Criar com a sugestão</button>}
                <button type="button" onClick={() => setSugestao(null)} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white">Manter o meu texto</button>
              </div>
            </div>
          )}
          <textarea id="studio-ia-texto" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={4000} rows={2}
            placeholder={origem ? 'Ex.: deixe a garrafa maior, o fundo mais escuro e o preço com mais destaque.' : 'Ex.: Crie uma logo promocional 3D com o texto "SUPER OFERTA", letras brancas e amarelas, extrusão profunda, contorno vermelho e brilho dourado, fundo transparente.'}
            className="w-full resize-y rounded-xl border border-[#8A2EFF]/40 bg-[#170838] p-3 text-sm sm:min-h-[84px] text-white placeholder:text-slate-500 focus:border-[#B04DFF] focus:outline-none" />
          <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-xs text-white hover:bg-white/5">
              {ocupado === 'anexo' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}Referência
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { void anexar(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            <select value={proporcao} onChange={(e) => setProporcao(e.target.value as typeof proporcao)} aria-label="Proporção" className="rounded-lg border border-white/15 bg-[#170838] px-2 py-2 text-xs text-white">
              <option value="quadrado">Quadrado 1:1</option><option value="horizontal">Horizontal 3:2</option><option value="vertical">Vertical 2:3</option>
            </select>
            <select value={qualidade} onChange={(e) => setQualidade(e.target.value as typeof qualidade)} aria-label="Qualidade" className="rounded-lg border border-white/15 bg-[#170838] px-2 py-2 text-xs text-white">
              <option value="low">Rascunho</option><option value="medium">Profissional</option><option value="high">Máxima</option>
            </select>
            <label className="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-xs text-white"><input type="checkbox" checked={transparente} onChange={(e) => setTransparente(e.target.checked)} className="accent-[#8A2EFF]" />Fundo transparente</label>
            <button type="button" onClick={melhorar} disabled={!!ocupado} className="flex items-center gap-1.5 rounded-lg border border-[#FFD400]/40 px-3 py-2 text-xs text-[#FFD400] hover:bg-[#FFD400]/10">
              {ocupado === 'melhorar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}Melhorar descrição
            </button>
            <button type="button" onClick={() => { if (!semSaldo) { void gerar(); return; } if (texto.trim().length < 5) { toast.info('Descreva primeiro o que você quer criar.'); return; } setPagando(true); }} disabled={!!ocupado} data-testid="studio-ia-gerar"
              className="col-span-2 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r sm:ml-auto from-[#5D1BFF] to-[#8A2EFF] px-5 py-2.5 text-sm font-bold text-white shadow-[0_0_20px_rgba(138,46,255,0.45)] disabled:opacity-50">
              {ocupado === 'gerar' ? <Loader2 className="h-4 w-4 animate-spin" /> : origem ? <ImagePlus className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              {semSaldo ? `Pagar ${preco} e criar` : `${origem ? 'Criar nova versão' : 'Gerar imagem'}${anunciante ? ` · 1 crédito (${preco})` : ''}`}
            </button>
          </div>
          {semSaldo && <p className="text-xs text-amber-200">Cada criação custa {preco}: você paga por PIX aqui mesmo e a criação começa assim que o pagamento é confirmado. Quer vários de uma vez? <Link to="/studio/configuracoes" className="font-bold text-[#FFD400] hover:underline">Comprar pacote de créditos</Link>.</p>}
          <p className="hidden text-[11px] text-slate-500 sm:block">Cada imagem criada consome 1 crédito{anunciante ? ` (${preco})` : ''}. Se a criação falhar, o crédito volta automaticamente. Imagens de produto criadas pela IA são ilustrativas: para a foto real use a foto do seu produto.</p>
        </footer>
      </section>

      <Dialog open={pagando} onOpenChange={(v) => { if (!v) setPagando(false); }}>
        <DialogContent className="max-w-2xl border-[#8A2EFF]/40 bg-[#14062f] text-slate-100">
          <DialogHeader>
            <DialogTitle>Pagar {preco} e criar</DialogTitle>
            <DialogDescription className="text-slate-400">Pagamento por PIX dentro da SOBRE MÍDIA. Confirmado o pagamento, a sua imagem começa a ser criada na hora.</DialogDescription>
          </DialogHeader>
          {pagando && (
            <PagamentoCreditos quantidade={1} onCancelar={() => setPagando(false)}
              onCreditado={() => { void qc.invalidateQueries({ queryKey: ['studio-ai-saldo'] }); setPagando(false); setTimeout(() => { void gerar(); }, 400); }} />
          )}
        </DialogContent>
      </Dialog>

      <PublicarDialog aberto={!!publicar} onFechar={() => setPublicar(null)} clienteId={saldo.data?.cliente ?? null}
        nome={`Criação IA ${publicar ? new Date(publicar.criado_em).toLocaleDateString('pt-BR') : ''}`} formato={publicar && publicar.largura > publicar.altura ? '16:9' : publicar && publicar.largura < publicar.altura ? '9:16' : '1:1'}
        gerarPng={async () => ({ png: await blobDaUrl(publicar!.url), largura: publicar!.largura, altura: publicar!.altura })} />
    </div>
  );
}
