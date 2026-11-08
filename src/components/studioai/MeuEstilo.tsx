// P-24 (F-271) — "Meu estilo": o anunciante (ou o owner/ADM, escolhendo o cliente) guarda o estilo das próprias artes
// COM CONSENTIMENTO. Usa as regras do banco da F-268 (studio_preferencia_salvar / studio_preferencia_revogar) e lê pela
// regra que já existe (studio_conhecimento_ver). A Central de Comando e o Studio por agentes usam esse estilo ao criar.
// Se as regras do banco ainda não estiverem aplicadas, a tela avisa em vez de dar erro.
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Palette, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { clientesDaEmpresa } from '@/lib/studioai/api';
import { cn } from '@/lib/utils';

export interface EstiloGuardado { tom?: string; estabelecimento?: string; publico?: string; formato?: '16:9' | '9:16' | '1:1'; paleta?: string[]; observacoes?: string }

const db = supabase as unknown as {
  from: (t: string) => { select: (c: string) => { eq: (k: string, v: unknown) => any } };
  rpc: (f: string, a?: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
};
const caixa = 'space-y-4 rounded-xl border border-white/10 bg-[#140632] p-5';
const campo = 'w-full rounded-lg border border-white/15 bg-[#0d0326] px-3 py-2 text-sm text-white placeholder:text-slate-500';
/** Função do banco ainda não existe (migração 20261362 não aplicada). */
export const memoriaIndisponivel = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST202' || e.code === '42883' || /could not find the function|does not exist/i.test(e.message ?? ''));

/** Só campos que o banco aceita: cores #RRGGBB (até 6) e textos dentro do limite. */
export function estiloParaEnviar(e: EstiloGuardado): EstiloGuardado {
  const t = (s: string | undefined, n: number) => (s ?? '').trim().slice(0, n) || undefined;
  return {
    tom: t(e.tom, 60), estabelecimento: t(e.estabelecimento, 120), publico: t(e.publico, 120),
    formato: e.formato && ['16:9', '9:16', '1:1'].includes(e.formato) ? e.formato : undefined,
    paleta: [...new Set((e.paleta ?? []).filter((c) => /^#[0-9A-Fa-f]{6}$/.test(c)).map((c) => c.toUpperCase()))].slice(0, 6),
    observacoes: t(e.observacoes, 300),
  };
}

async function lerEstilo(cliente: string): Promise<EstiloGuardado | null> {
  const { data } = await db.from('studio_conhecimento').select('conteudo').eq('escopo', 'cliente').eq('tipo', 'preferencia').eq('chave', 'estilo')
    .eq('cliente_id', cliente).eq('ativo', true).maybeSingle();
  return (data?.conteudo as { estilo?: EstiloGuardado } | undefined)?.estilo ?? null;
}

export function MeuEstilo({ admin, clienteProprio }: { admin: boolean; clienteProprio: string | null }) {
  const qc = useQueryClient();
  const clientes = useQuery({ queryKey: ['studio-ai-clientes'], queryFn: clientesDaEmpresa, enabled: admin, staleTime: 300_000 });
  const [escolhido, setEscolhido] = useState('');
  const cliente = clienteProprio ?? (escolhido || null);
  const guardado = useQuery({ queryKey: ['studio-estilo', cliente], queryFn: () => lerEstilo(cliente!), enabled: !!cliente });
  const [e, setE] = useState<EstiloGuardado>({ paleta: [] });
  const [aceito, setAceito] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [indisponivel, setIndisponivel] = useState(false);

  useEffect(() => { setE(guardado.data ?? { paleta: [] }); setAceito(false); }, [guardado.data, cliente]);

  const agir = async (nome: string, f: () => Promise<{ error: { code?: string; message: string } | null }>, ok: string) => {
    setOcupado(nome);
    try {
      const { error } = await f();
      if (memoriaIndisponivel(error)) { setIndisponivel(true); return; }
      if (error) throw new Error(error.message);
      toast.success(ok);
      void qc.invalidateQueries({ queryKey: ['studio-estilo', cliente] });
    } catch (err) { toast.error((err as Error).message || 'Não foi possível concluir.'); } finally { setOcupado(null); }
  };
  const salvar = () => agir('salvar', () => db.rpc('studio_preferencia_salvar', { p_estilo: estiloParaEnviar(e), p_consentimento: aceito, p_cliente: admin ? cliente : null }),
    'Estilo guardado. As próximas criações já usam esse estilo.');
  const revogar = (apagar: boolean) => agir(apagar ? 'apagar' : 'revogar', () => db.rpc('studio_preferencia_revogar', { p_cliente: admin ? cliente : null, p_apagar: apagar }),
    apagar ? 'Estilo apagado de vez.' : 'Estilo desligado: as criações não usam mais esse estilo.');
  const cor = (i: number, v: string) => setE((x) => { const p = [...(x.paleta ?? [])]; p[i] = v; return { ...x, paleta: p }; });

  return (
    <section className={caixa} data-testid="studio-meu-estilo">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold text-white"><Palette className="h-5 w-5 text-[#B04DFF]" />{admin ? 'Estilo do cliente' : 'Meu estilo'}</h2>
        <p className="text-xs text-slate-400">Tom, cores e público que a Central de Comando e o Vídeo por agentes usam ao criar. Só é guardado com o seu consentimento, e você pode desligar ou apagar quando quiser.</p>
      </div>
      {indisponivel ? (
        <p className="rounded-lg border border-[#FFD400]/40 bg-[#FFD400]/10 px-3 py-2 text-sm text-[#FFD400]" data-testid="estilo-indisponivel">A memória de estilo está sendo liberada. Tente de novo em breve.</p>
      ) : (<>
        {admin && !clienteProprio && (
          <select value={escolhido} onChange={(ev) => setEscolhido(ev.target.value)} className={campo} aria-label="Cliente">
            <option value="">Escolha o cliente…</option>
            {(clientes.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        )}
        {cliente && (guardado.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <input className={campo} placeholder="Tom (ex.: alegre, sofisticado, popular)" value={e.tom ?? ''} maxLength={60} onChange={(ev) => setE({ ...e, tom: ev.target.value })} />
              <input className={campo} placeholder="Estabelecimento (ex.: Farmácia Bem Estar)" value={e.estabelecimento ?? ''} maxLength={120} onChange={(ev) => setE({ ...e, estabelecimento: ev.target.value })} />
              <input className={campo} placeholder="Público (ex.: famílias do bairro)" value={e.publico ?? ''} maxLength={120} onChange={(ev) => setE({ ...e, publico: ev.target.value })} />
              <select className={campo} value={e.formato ?? ''} onChange={(ev) => setE({ ...e, formato: (ev.target.value || undefined) as EstiloGuardado['formato'] })} aria-label="Formato preferido">
                <option value="">Formato preferido (qualquer)</option><option value="16:9">TV deitada (16:9)</option><option value="9:16">TV em pé (9:16)</option><option value="1:1">Quadrado (1:1)</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400">Cores da marca (até 6):</span>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <input key={i} type="color" aria-label={`Cor ${i + 1}`} value={e.paleta?.[i] ?? '#000000'} onChange={(ev) => cor(i, ev.target.value)}
                  className={cn('h-9 w-9 cursor-pointer rounded border border-white/20 bg-transparent', !e.paleta?.[i] && 'opacity-40')} />
              ))}
              {(e.paleta?.length ?? 0) > 0 && <button type="button" className="text-xs text-slate-400 underline" onClick={() => setE({ ...e, paleta: [] })}>limpar cores</button>}
            </div>
            <textarea className={campo} rows={2} maxLength={300} placeholder="Observações (ex.: sempre mostrar o logo grande, evitar vermelho)" value={e.observacoes ?? ''} onChange={(ev) => setE({ ...e, observacoes: ev.target.value })} />
            <label className="flex items-start gap-2 text-sm text-slate-200">
              <input type="checkbox" checked={aceito} onChange={(ev) => setAceito(ev.target.checked)} className="mt-1" data-testid="estilo-consentimento" />
              Autorizo a SOBRE MÍDIA a guardar esse estilo e usá-lo nas minhas próximas criações. Posso desligar ou apagar quando quiser.
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!aceito || !!ocupado} onClick={salvar} data-testid="estilo-salvar"
                className="flex items-center gap-2 rounded-xl bg-[#25D366] px-5 py-2.5 text-sm font-bold text-[#0b2a17] disabled:opacity-40">
                {ocupado === 'salvar' && <Loader2 className="h-4 w-4 animate-spin" />}Guardar estilo
              </button>
              {guardado.data && (<>
                <button type="button" disabled={!!ocupado} onClick={() => revogar(false)} className="rounded-xl border border-white/20 px-4 py-2.5 text-sm text-white">Desligar</button>
                <button type="button" disabled={!!ocupado} onClick={() => { if (window.confirm('Apagar de vez o estilo guardado? Isso não pode ser desfeito.')) void revogar(true); }}
                  className="flex items-center gap-1.5 rounded-xl border border-red-400/40 px-4 py-2.5 text-sm text-red-300"><Trash2 className="h-4 w-4" />Apagar de vez</button>
              </>)}
            </div>
          </div>
        ))}
      </>)}
    </section>
  );
}
