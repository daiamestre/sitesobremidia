/**
 * F-306 (pedido do dono, 12/11/2026) — ASSISTENTE DE CRIAÇÃO (passo a passo), pensado para o celular.
 * Entra ENTRE a escolha do modelo e a tela de edição que já existe (que não muda): uma etapa por vez, com o número da
 * etapa, o que fazer, o que já está pronto e o que falta; Voltar/Avançar sempre à mão (barra fixa embaixo); só avança
 * quando a etapa tem o obrigatório; voltar nunca perde o que foi feito (tudo fica guardado no aparelho e a etapa fica no
 * endereço — recarregar a página continua de onde parou). No fim, abre a tela de edição já preenchida.
 */
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EtapaDoAssistente {
  id: string;
  titulo: string;
  /** o que fazer nesta etapa (uma frase) */
  instrucao: string;
  /** já dá para avançar? */
  pronta: boolean;
  /** por que ainda não dá para avançar (aparece no botão) */
  falta?: string;
  /** aviso que não impede de avançar */
  aviso?: string | null;
  conteudo: ReactNode;
}

export function AssistenteDeCriacao({ titulo, etapas, passo, irPara, aoConcluir, textoConcluir, concluindo = false, aoSair }: {
  titulo: string; etapas: EtapaDoAssistente[]; passo: number; irPara: (n: number) => void; aoConcluir: () => void; textoConcluir: string; concluindo?: boolean;
  /** "Pular e ir para a edição" (quem já sabe usar) */ aoSair?: () => void;
}) {
  const i = Math.min(Math.max(1, passo), etapas.length) - 1;
  const e = etapas[i];
  const ultima = i === etapas.length - 1;
  // só dá para pular para uma etapa à frente se as anteriores estiverem prontas
  const podeIr = (n: number) => etapas.slice(0, n).every((x) => x.pronta);
  // F-309: com a barra fixa embaixo, os avisos (toasts) sobem para cima dela e nunca cobrem o Avançar
  useEffect(() => { document.body.classList.add('com-barra-fixa'); return () => document.body.classList.remove('com-barra-fixa'); }, []);
  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-28" data-testid="assistente-de-criacao">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 shrink-0 text-[#FFD400]" />
        <p className="min-w-0 flex-1 truncate text-sm font-bold text-white sm:text-base">{titulo}</p>
        {aoSair && <button type="button" onClick={aoSair} className="shrink-0 rounded-lg px-2 py-1 text-xs text-slate-400 underline-offset-2 hover:text-white hover:underline" data-testid="assistente-pular">Pular para a edição</button>}
      </div>

      {/* as etapas: número, concluída (✓), a atual em destaque */}
      <ol className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Etapas">
        {etapas.map((x, k) => {
          const feita = k < i && x.pronta;
          const atual = k === i;
          return (
            <li key={x.id} className="shrink-0">
              <button type="button" onClick={() => (k <= i || podeIr(k)) && irPara(k + 1)} disabled={!(k <= i || podeIr(k))} aria-current={atual ? 'step' : undefined}
                className={cn('flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition disabled:opacity-40', atual ? 'border-[#FFD400] bg-[#FFD400] text-[#22004A]' : feita ? 'border-[#25D366]/60 bg-[#25D366]/15 text-[#7dffb0]' : 'border-white/15 text-slate-300')}
                data-testid={`assistente-etapa-${x.id}`}>
                <span className={cn('flex h-5 w-5 items-center justify-center rounded-full text-[10px]', atual ? 'bg-[#22004A] text-[#FFD400]' : feita ? 'bg-[#25D366] text-[#0b2a17]' : 'bg-white/10')}>{feita ? <Check className="h-3 w-3" /> : k + 1}</span>
                {x.titulo}
              </button>
            </li>
          );
        })}
      </ol>

      <section className="space-y-3 rounded-2xl border border-[#8A2EFF]/40 bg-[#14062f] p-3 sm:p-4" aria-label={e.titulo}>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#B04DFF]">Etapa {i + 1} de {etapas.length}</p>
          <h2 className="text-lg font-black text-white sm:text-xl">{e.titulo}</h2>
          <p className="text-sm text-slate-300">{e.instrucao}</p>
        </div>
        {e.aviso && <p className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">{e.aviso}</p>}
        {e.conteudo}
      </section>

      {/* barra fixa embaixo: Voltar · Avançar (ou Criar) — sempre à mão no celular. F-309: vai direto no <body> (portal): a
          animação de entrada da página deixa um transform no pai, e com ele a barra ia para o FIM do conteúdo, não da tela */}
      {createPortal(<div className="fixed inset-x-0 bottom-0 z-30 lg:left-[230px] border-t border-white/10 bg-[#0b0420]/95 px-3 py-2.5 sm:px-6" style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}>
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <button type="button" onClick={() => irPara(i)} disabled={i === 0} className="flex h-12 items-center gap-1.5 rounded-xl border border-white/15 px-4 text-sm font-semibold text-white disabled:opacity-30" data-testid="assistente-voltar">
            <ArrowLeft className="h-4 w-4" />Voltar
          </button>
          <div className="min-w-0 flex-1 text-center text-[11px] leading-tight text-slate-400">{!e.pronta && e.falta ? <span className="text-amber-300">{e.falta}</span> : ultima ? 'Tudo pronto!' : `Próxima: ${etapas[i + 1]?.titulo}`}</div>
          {ultima ? (
            <button type="button" onClick={aoConcluir} disabled={!e.pronta || concluindo} className="flex h-12 items-center gap-1.5 rounded-xl bg-[#FFD400] px-4 text-sm font-black text-[#22004A] disabled:opacity-40" data-testid="assistente-concluir">
              {concluindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{textoConcluir}
            </button>
          ) : (
            <button type="button" onClick={() => irPara(i + 2)} disabled={!e.pronta} className="flex h-12 items-center gap-1.5 rounded-xl bg-[#5D1BFF] px-5 text-sm font-bold text-white disabled:opacity-40" data-testid="assistente-avancar">
              Avançar<ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>, document.body)}
    </div>
  );
}
