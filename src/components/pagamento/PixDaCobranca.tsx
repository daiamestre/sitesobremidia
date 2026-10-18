import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { emitirPixDaCobranca } from '@/modules/gestor/telaPago.service';

/**
 * F-196 — Pix OFICIAL do Banco Inter de uma cobrança (contas_receber): QR Code + copia e cola, gerados pelo banco
 * (inter-pix-engine). Quem pede precisa enxergar a cobrança com o próprio login. Usado no vídeo adicional do anunciante.
 */
export function PixDaCobranca({ cobrancaId, valorTexto }: { cobrancaId: string; valorTexto?: string }) {
  const [pix, setPix] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const gerar = async () => {
    setCarregando(true); setErro(null);
    try {
      const copiaECola = await emitirPixDaCobranca(cobrancaId);
      setPix(copiaECola);
      setQr(await QRCode.toDataURL(copiaECola, { errorCorrectionLevel: 'M', margin: 1, width: 240 }));
    } catch (e) {
      setErro((e as Error).message || 'Não foi possível gerar o Pix agora.');
    } finally { setCarregando(false); }
  };
  useEffect(() => { setPix(null); setQr(null); void gerar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [cobrancaId]);

  const copiar = async () => {
    if (!pix) return;
    try { await navigator.clipboard.writeText(pix); toast.success('Pix copia e cola copiado.'); }
    catch { toast.error('Não foi possível copiar.'); }
  };

  if (carregando && !pix) {
    return <p className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Gerando o Pix no Banco Inter…</p>;
  }
  if (erro && !pix) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-rose-400">{erro}</p>
        <Button size="sm" variant="outline" onClick={() => void gerar()} className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" /> Gerar o Pix de novo</Button>
      </div>
    );
  }
  if (!pix || !qr) return null;
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start" data-testid="pix-da-cobranca">
      <img src={qr} alt="QR Code Pix" className="h-44 w-44 rounded-lg bg-white p-1" data-testid="qr-pix" />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-xs text-slate-400">
          Abra o app do banco, escolha <strong>Pix → Ler QR Code</strong> ou use o copia e cola{valorTexto ? <> · Valor: <strong>{valorTexto}</strong></> : null}.
        </p>
        <p className="max-h-20 overflow-y-auto break-all rounded bg-slate-950/60 p-2 font-mono text-[10px] text-slate-400">{pix}</p>
        <Button size="sm" variant="outline" onClick={copiar} className="w-full gap-1.5"><Copy className="h-3.5 w-3.5" /> Copiar Pix copia e cola</Button>
      </div>
    </div>
  );
}
