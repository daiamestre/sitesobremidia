/**
 * F-231 — leitor de CÓDIGO DE BARRAS do Cartaz Digital / Encartes.
 * - Pistola USB ou Bluetooth: ela "digita" o código e aperta Enter sozinha — basta o campo estar selecionado.
 * - Câmera do tablet/celular: o leitor nativo do navegador (BarcodeDetector, Chrome no Android) reconhece o código na imagem.
 * O código é conferido pelo dígito verificador e o produto chega com nome, marca, medida e foto (ver imagens.ts).
 */
import { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, ScanBarcode, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { codigoValido } from '../../../supabase/functions/produto-imagem/regras.ts';

type Detector = { detect: (fonte: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };
type DetectorCtor = new (o: { formats: string[] }) => Detector;
const Leitor = (typeof window !== 'undefined' ? (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector : undefined);

export function LeitorDeCodigo({ aoLer }: { aoLer: (codigo: string) => void }) {
  const [valor, setValor] = useState('');
  const [camera, setCamera] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  const ler = (bruto: string) => {
    const c = bruto.replace(/\D/g, '');
    if (!c) return;
    if (!codigoValido(c)) { toast.error('Código de barras inválido. Confira os números (8, 12, 13 ou 14 dígitos).'); return; }
    aoLer(c);
    setValor('');
    campo.current?.focus();
  };

  return (
    <div className="space-y-1.5 rounded-lg border border-dashed p-2.5" data-testid="tabloide-leitor">
      <label htmlFor="tabloide-codigo" className="flex items-center gap-1.5 text-xs font-semibold"><ScanBarcode className="h-4 w-4 text-primary" />Código de barras</label>
      <div className="flex gap-1.5">
        <Input id="tabloide-codigo" ref={campo} inputMode="numeric" autoComplete="off" value={valor} onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ler(valor); } }}
          placeholder="Bipe com o leitor ou digite e tecle Enter" className="h-9 font-mono text-sm" data-testid="tabloide-codigo" />
        {Leitor && <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={() => setCamera(true)} data-testid="tabloide-camera"><Camera className="mr-1 h-4 w-4" />Câmera</Button>}
      </div>
      <p className="text-[11px] text-muted-foreground">O produto entra com o nome, a marca, a medida e a foto certos. Depois é só digitar o preço na lista.</p>
      {camera && Leitor && <CameraDoCodigo Leitor={Leitor} aoLer={(c) => { setCamera(false); ler(c); }} aoFechar={() => setCamera(false)} />}
    </div>
  );
}

function CameraDoCodigo({ Leitor, aoLer, aoFechar }: { Leitor: DetectorCtor; aoLer: (c: string) => void; aoFechar: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  // a tela redesenha sem reabrir a câmera
  const aoLerRef = useRef(aoLer);
  aoLerRef.current = aoLer;
  useEffect(() => {
    let fluxo: MediaStream | null = null;
    let vivo = true;
    let relogio = 0;
    const detector = new Leitor({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf'] });
    void (async () => {
      try {
        fluxo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (!vivo || !video.current) return;
        video.current.srcObject = fluxo;
        await video.current.play();
        const procurar = async () => {
          if (!vivo || !video.current) return;
          const achados = await detector.detect(video.current).catch(() => []);
          const c = achados.map((a) => a.rawValue.replace(/\D/g, '')).find((x) => codigoValido(x));
          if (c) { aoLerRef.current(c); return; }
          relogio = window.setTimeout(procurar, 250);
        };
        void procurar();
      } catch { setErro('Não foi possível abrir a câmera. Permita o uso da câmera ou use o leitor/digite o código.'); }
    })();
    return () => { vivo = false; clearTimeout(relogio); fluxo?.getTracks().forEach((t) => t.stop()); };
  }, [Leitor]);
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/85 p-4" role="dialog" aria-modal="true" aria-label="Ler código de barras pela câmera">
      <div className="relative w-full max-w-md overflow-hidden rounded-xl border border-white/20 bg-black">
        <video ref={video} muted playsInline className="block aspect-[4/3] w-full object-cover" />
        <div aria-hidden className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500 shadow-[0_0_12px_rgba(239,68,68,.9)]" />
      </div>
      <p className="flex items-center gap-2 text-sm text-white">{erro ?? <><Loader2 className="h-4 w-4 animate-spin" />Aponte para o código de barras do produto</>}</p>
      <Button type="button" variant="secondary" onClick={aoFechar}><X className="mr-1 h-4 w-4" />Fechar</Button>
    </div>
  );
}
