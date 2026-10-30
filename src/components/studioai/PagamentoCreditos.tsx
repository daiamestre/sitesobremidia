import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PixDaCobranca } from '@/components/pagamento/PixDaCobranca';
import { playlistClienteService } from '@/modules/crm/services/playlistCliente.service';
import { brl, comprarCreditos, confirmarCompra } from '@/lib/studioai/api';

/**
 * Pagamento de créditos do Studio AI dentro da SOBRE MÍDIA (PIX oficial do Banco Inter, mesma cobrança avulsa da playlist).
 * A tela confere o PIX sozinha a cada 5 s e libera o crédito no instante em que o banco confirma — sem o cliente sair
 * daqui. (O servidor também credita compras pagas a cada minuto, caso a pessoa feche a tela.)
 * A SOBRE MÍDIA mantém o saldo próprio na OpenAI; o cliente nunca compra nada lá.
 */
export function PagamentoCreditos({ quantidade, compraExistente, onCreditado, onCancelar }: {
  quantidade: number;
  compraExistente?: { compra_id: string; cobranca_id: string; valor_centavos: number } | null;
  onCreditado: (quantidade: number) => void;
  onCancelar?: () => void;
}) {
  const [compra, setCompra] = useState(compraExistente ?? null);
  const [erro, setErro] = useState<string | null>(null);
  const [conferindo, setConferindo] = useState(false);
  const [pago, setPago] = useState(false);
  const iniciado = useRef(false);

  useEffect(() => {
    if (compra || iniciado.current) return;
    iniciado.current = true; // uma única cobrança por abertura (nada de cobrança dupla em nova renderização)
    comprarCreditos(quantidade).then(setCompra).catch((e) => setErro((e as Error).message || 'Não foi possível gerar a cobrança.'));
  }, [compra, quantidade]);

  const conferir = async (manual: boolean) => {
    if (!compra || pago) return;
    setConferindo(manual);
    try {
      await playlistClienteService.conferirPix(compra.cobranca_id);
      const r = await confirmarCompra(compra.compra_id);
      if (r.creditado) { setPago(true); toast.success('Pagamento confirmado: crédito liberado!'); onCreditado(r.quantidade ?? quantidade); }
      else if (manual) toast.info('O pagamento ainda não apareceu no banco. A tela continua conferindo sozinha.');
    } catch (e) { if (manual) toast.error((e as Error).message); } finally { setConferindo(false); }
  };

  useEffect(() => {
    if (!compra || pago) return;
    const id = setInterval(() => { void conferir(false); }, 5000);
    return () => clearInterval(id);
  }, [compra, pago]); // eslint-disable-line react-hooks/exhaustive-deps

  if (erro) return <p className="rounded-lg bg-rose-500/10 p-3 text-sm text-rose-200">{erro}</p>;
  if (!compra) return <p className="flex items-center gap-2 text-sm text-slate-300"><Loader2 className="h-4 w-4 animate-spin" />Gerando a cobrança…</p>;
  if (pago) return <p className="flex items-center gap-2 rounded-lg bg-[#25D366]/15 p-3 text-sm font-semibold text-[#7dffb0]"><CheckCircle2 className="h-5 w-5" />Pago! Crédito liberado.</p>;
  return (
    <div className="grid gap-4 md:grid-cols-[auto_1fr] md:items-center">
      <PixDaCobranca cobrancaId={compra.cobranca_id} valorTexto={brl(compra.valor_centavos)} />
      <div className="space-y-3 text-sm text-slate-300">
        <p>Pague <b className="text-white">{brl(compra.valor_centavos)}</b> pelo PIX. Assim que o banco confirmar, o crédito é liberado aqui mesmo, automaticamente.</p>
        <p className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />Aguardando o pagamento…</p>
        <button type="button" disabled={conferindo} onClick={() => void conferir(true)} className="w-full rounded-xl bg-[#FFD400] py-2.5 font-bold text-[#22004A]">
          {conferindo && <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />}Já paguei
        </button>
        {onCancelar && <button type="button" onClick={onCancelar} className="w-full text-xs text-slate-400 hover:text-white">Pagar depois</button>}
      </div>
    </div>
  );
}
