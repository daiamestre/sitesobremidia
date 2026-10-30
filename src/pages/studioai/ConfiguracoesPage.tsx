import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Coins, Gift, Loader2, PlayCircle, Receipt, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { PixDaCobranca } from '@/components/pagamento/PixDaCobranca';
import { playlistClienteService } from '@/modules/crm/services/playlistCliente.service';
import { supabase } from '@/integrations/supabase/client';
import {
  brl, carteirasDaEmpresa, clientesDaEmpresa, comprarCreditos, comprasPendentes, confirmarCompra, creditarManual, extrato, meuSaldo, salvarConfig,
} from '@/lib/studioai/api';
import { cn } from '@/lib/utils';

const TIPO: Record<string, string> = { COMPRA: 'Compra (PIX)', CORTESIA: 'Cortesia', AJUSTE_ENTRADA: 'Ajuste (+)', AJUSTE_SAIDA: 'Ajuste (−)', RESERVA: 'Reservado para criação', CONSUMO: 'Criação concluída', ESTORNO: 'Devolvido (falha)' };
const caixa = 'space-y-4 rounded-xl border border-white/10 bg-[#140632] p-5';

export default function ConfiguracoesPage() {
  const qc = useQueryClient();
  const saldo = useQuery({ queryKey: ['studio-ai-saldo'], queryFn: meuSaldo });
  const anunciante = !!saldo.data?.cliente;
  const admin = !!saldo.data?.admin;
  const mov = useQuery({ queryKey: ['studio-ai-extrato'], queryFn: extrato });
  const pendentes = useQuery({ queryKey: ['studio-ai-compras'], queryFn: comprasPendentes, enabled: anunciante });
  const carteiras = useQuery({ queryKey: ['studio-ai-carteiras'], queryFn: carteirasDaEmpresa, enabled: admin });
  const clientes = useQuery({ queryKey: ['studio-ai-clientes'], queryFn: clientesDaEmpresa, enabled: admin, staleTime: 300_000 });
  const config = useQuery({
    queryKey: ['studio-ai-config'], enabled: admin,
    queryFn: async () => (await (supabase as unknown as { from: (t: string) => { select: (c: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> } } }).from('studio_ai_config').select('*').maybeSingle()).data,
  });
  const [qtd, setQtd] = useState(5);
  const [compra, setCompra] = useState<{ compra_id: string; cobranca_id: string; valor_centavos: number } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [cortesia, setCortesia] = useState({ cliente: '', qtd: 1, motivo: '' });
  const preco = saldo.data?.preco_centavos ?? 499;
  const recarregar = () => ['studio-ai-saldo', 'studio-ai-extrato', 'studio-ai-compras', 'studio-ai-carteiras', 'studio-ai-config'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
  const agir = async (n: string, f: () => Promise<void>) => { setOcupado(n); try { await f(); } catch (e) { toast.error((e as Error).message || 'Não foi possível concluir.'); } finally { setOcupado(null); } };

  const conferir = (compraId: string, cobrancaId: string) => agir('conferir', async () => {
    await playlistClienteService.conferirPix(cobrancaId);
    const r = await confirmarCompra(compraId);
    if (r.creditado) { toast.success('Pagamento confirmado: créditos adicionados.'); setCompra(null); recarregar(); }
    else toast.info('O pagamento ainda não apareceu. Aguarde alguns segundos e confira de novo.');
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6" data-testid="studio-configuracoes">
      <h1 className="flex items-center gap-2 text-2xl font-black text-white"><Settings className="h-6 w-6 text-[#B04DFF]" />Créditos e configurações</h1>

      {anunciante && (
        <section className={caixa}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-400">Seus créditos de criação com IA</p>
              <p className="text-4xl font-black text-[#FFD400]">{saldo.data?.saldo ?? 0}</p>
              <p className="text-xs text-slate-400">1 crédito = 1 imagem criada com IA = {brl(preco)}{(saldo.data?.reservado ?? 0) > 0 ? ` · ${saldo.data?.reservado} em uso agora` : ''}</p>
            </div>
            {!compra && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex gap-1.5">{[1, 5, 10, 20].map((n) => (
                  <button key={n} type="button" onClick={() => setQtd(n)} className={cn('rounded-lg border px-3 py-2 text-sm font-bold', qtd === n ? 'border-[#FFD400] bg-[#FFD400]/15 text-[#FFD400]' : 'border-white/15 text-white')}>{n}</button>
                ))}</div>
                <button type="button" disabled={!!ocupado} data-testid="studio-comprar" onClick={() => agir('comprar', async () => { setCompra(await comprarCreditos(qtd)); void qc.invalidateQueries({ queryKey: ['studio-ai-compras'] }); })}
                  className="flex items-center gap-2 rounded-xl bg-[#25D366] px-5 py-2.5 text-sm font-bold text-[#0b2a17]">
                  {ocupado === 'comprar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}Comprar {qtd} crédito{qtd > 1 ? 's' : ''} · {brl(qtd * preco)}
                </button>
              </div>
            )}
          </div>
          {compra && (
            <div className="grid gap-4 md:grid-cols-2">
              <PixDaCobranca cobrancaId={compra.cobranca_id} valorTexto={brl(compra.valor_centavos)} />
              <div className="space-y-3 text-sm text-slate-300">
                <p>Pague o PIX e toque em <b>Já paguei</b>. Os créditos entram assim que o banco confirmar.</p>
                <button type="button" disabled={ocupado === 'conferir'} onClick={() => void conferir(compra.compra_id, compra.cobranca_id)} className="w-full rounded-xl bg-[#FFD400] py-2.5 font-bold text-[#22004A]">{ocupado === 'conferir' && <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />}Já paguei</button>
                <button type="button" onClick={() => setCompra(null)} className="w-full text-xs text-slate-400 hover:text-white">Pagar depois</button>
              </div>
            </div>
          )}
          {!compra && (pendentes.data?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Compras aguardando pagamento</p>
              {pendentes.data!.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm">
                  <span>{p.quantidade} crédito(s) · {brl(p.valor_centavos)} · {new Date(p.criado_em).toLocaleDateString('pt-BR')}</span>
                  <span className="flex gap-2">
                    <button type="button" className="text-xs font-semibold text-[#FFD400]" onClick={() => setCompra({ compra_id: p.id, cobranca_id: p.conta_receber_id, valor_centavos: p.valor_centavos })}>Ver PIX</button>
                    <button type="button" className="text-xs font-semibold text-[#25D366]" onClick={() => void conferir(p.id, p.conta_receber_id)}>Já paguei</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {admin && (
        <section className={caixa}>
          <h2 className="flex items-center gap-2 font-bold text-white"><Coins className="h-5 w-5 text-[#FFD400]" />Créditos dos clientes</h2>
          <p className="text-xs text-slate-400">Clientes compram por PIX dentro do Studio. Aqui você vê os saldos e dá cortesias (com motivo, fica no extrato). Criações da equipe não consomem créditos.</p>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-white/5">
            <table className="w-full text-sm"><thead className="bg-white/5 text-left text-xs text-slate-400"><tr><th className="p-2">Cliente</th><th className="p-2">Saldo</th><th className="p-2">Em uso</th></tr></thead>
              <tbody>{carteiras.data?.map((c) => <tr key={c.id} className="border-t border-white/5"><td className="p-2">{c.nome}</td><td className="p-2 font-bold text-[#FFD400]">{c.saldo}</td><td className="p-2">{c.reservado}</td></tr>)}
                {carteiras.data?.length === 0 && <tr><td colSpan={3} className="p-3 text-center text-xs text-slate-500">Nenhum cliente comprou créditos ainda.</td></tr>}</tbody></table>
          </div>
          <div className="grid gap-2 md:grid-cols-[1fr_90px_1.4fr_auto]">
            <select value={cortesia.cliente} onChange={(e) => setCortesia({ ...cortesia, cliente: e.target.value })} className="min-w-0 rounded-lg border border-white/10 bg-[#0f0428] px-3 py-2 text-sm text-white" aria-label="Cliente">
              <option value="">Escolha o cliente…</option>
              {clientes.data?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <input type="number" min={-100} max={100} value={cortesia.qtd} onChange={(e) => setCortesia({ ...cortesia, qtd: Number(e.target.value) })} className="rounded-lg border border-white/10 bg-[#0f0428] px-3 py-2 text-sm" aria-label="Quantidade" />
            <input placeholder="Motivo (obrigatório)" value={cortesia.motivo} onChange={(e) => setCortesia({ ...cortesia, motivo: e.target.value })} className="rounded-lg border border-white/10 bg-[#0f0428] px-3 py-2 text-sm" aria-label="Motivo" />
            <button type="button" disabled={!!ocupado || !cortesia.cliente} onClick={() => agir('cortesia', async () => { await creditarManual(cortesia.cliente, cortesia.qtd, cortesia.motivo); toast.success('Movimento registrado.'); setCortesia({ cliente: '', qtd: 1, motivo: '' }); recarregar(); })}
              className="flex items-center justify-center gap-2 rounded-lg bg-[#5D1BFF] px-4 py-2 text-sm font-semibold"><Gift className="h-4 w-4" />Registrar</button>
          </div>
          {config.data && (
            <div className="grid gap-3 border-t border-white/5 pt-4 md:grid-cols-4">
              <label className="space-y-1 text-xs text-slate-400">Preço por criação (R$)
                <input type="number" step="0.01" min="0.5" defaultValue={Number(config.data.preco_credito_centavos) / 100} id="cfg-preco" className="w-full rounded-lg border border-white/10 bg-[#0f0428] px-3 py-2 text-sm text-white" />
              </label>
              <label className="space-y-1 text-xs text-slate-400">Modelo de imagem
                <select defaultValue={String(config.data.modelo_padrao)} id="cfg-modelo" className="w-full rounded-lg border border-white/10 bg-[#0f0428] px-3 py-2 text-sm text-white">
                  {(config.data.modelos_habilitados as string[]).map((m) => <option key={m} value={m} className="bg-[#140632]">{m}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs text-slate-400">Teto de gasto OpenAI por mês (US$)
                <input type="number" step="1" min="0" defaultValue={Number(config.data.limite_usd_mes)} id="cfg-teto" className="w-full rounded-lg border border-white/10 bg-[#0f0428] px-3 py-2 text-sm text-white" />
              </label>
              <button type="button" className="self-end rounded-lg bg-[#5D1BFF] px-4 py-2 text-sm font-semibold" disabled={!!ocupado} onClick={() => agir('cfg', async () => {
                const v = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
                await salvarConfig({ preco_credito_centavos: Math.round(Number(v('cfg-preco')) * 100), modelo_padrao: v('cfg-modelo'), limite_usd_mes: Number(v('cfg-teto')) });
                toast.success('Configuração salva.'); recarregar();
              })}>Salvar</button>
            </div>
          )}
        </section>
      )}

      <section className={caixa}>
        <h2 className="flex items-center gap-2 font-bold text-white"><Receipt className="h-5 w-5 text-[#B04DFF]" />Extrato de créditos</h2>
        {mov.data?.length === 0 && <p className="text-sm text-slate-400">Sem movimentos ainda.</p>}
        <ul className="max-h-80 space-y-1 overflow-y-auto text-sm">
          {mov.data?.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-3 py-2">
              <span>{TIPO[m.tipo] ?? m.tipo}{m.motivo ? <span className="text-xs text-slate-500"> · {m.motivo}</span> : null}</span>
              <span className="text-xs text-slate-400">{['COMPRA', 'CORTESIA', 'AJUSTE_ENTRADA', 'ESTORNO'].includes(m.tipo) ? '+' : m.tipo === 'CONSUMO' ? '' : '−'}{m.quantidade} · saldo {m.saldo_apos} · {new Date(m.criado_em).toLocaleString('pt-BR')}</span>
            </li>
          ))}
        </ul>
      </section>

      <section id="tutorial" className={caixa}>
        <h2 className="flex items-center gap-2 font-bold text-white"><PlayCircle className="h-5 w-5 text-[#25D366]" />Como usar o Studio</h2>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-300">
          <li>Em <b>Início</b>, escolha a categoria e o segmento da sua loja e clique em <b>Personalizar arte</b> no modelo que quiser.</li>
          <li>No Studio de criação, troque textos, cores, fonte e a foto pela do seu produto. Salve o projeto quando quiser.</li>
          <li>Quer ir além? Use <b>Editar com ChatGPT</b> (cria uma nova versão com IA, 1 crédito) ou <b>Abrir no Canva</b>.</li>
          <li>Em <b>Salvar e publicar</b>, a arte vai para as suas mídias e você escolhe a playlist ou a tela.</li>
        </ol>
      </section>
    </div>
  );
}
