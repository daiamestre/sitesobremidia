/**
 * F-231 — leitor de CÓDIGO DE BARRAS do Cartaz Digital / Encartes / Studio.
 * F-311 (pedido do dono, 12/11/2026): funcionando de verdade, com BIPE de pistola de mercado:
 * - PISTOLA (USB ou Bluetooth, de qualquer ramo): ela "digita" o código e aperta Enter (ou Tab) sozinha. Funciona com o campo
 *   selecionado E também sem ele — a leitura rápida (pistola) é reconhecida em qualquer lugar da tela, desde que a pessoa não
 *   esteja escrevendo em outro campo.
 * - CÂMERA do celular/tablet/computador: leitor nativo do navegador (BarcodeDetector) e, onde ele não existe (iPhone,
 *   computador) ou não lê EAN, o leitor ZXing (WebAssembly, servido pelo próprio site). Leitura CONTÍNUA: cada produto lido
 *   bipa e entra; a câmera fica aberta para o próximo até tocar em "Concluir".
 * - À MÃO: digitar o código e tocar em "Adicionar" (ou Enter).
 * O código é conferido pelo dígito verificador; o produto chega com nome, marca, medida e foto (ver imagens.ts).
 */
import { useEffect, useRef, useState } from 'react';
import { Camera, Check, Loader2, Plus, ScanBarcode, X } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { bipe, bipeDeErro, prepararBipe } from '@/lib/tabloide/bipe';
import { codigoValido } from '../../../supabase/functions/produto-imagem/regras.ts';

type Achado = { rawValue: string };
type Detector = { detect: (fonte: CanvasImageSource) => Promise<Achado[]> };
type DetectorCtor = { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> };
const FORMATOS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'code_128'];

/** o leitor que funciona neste aparelho: o nativo (se lê EAN) ou o ZXing (WebAssembly do próprio site) */
async function criarDetector(): Promise<Detector> {
  const Nativo = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (Nativo) {
    try {
      const formatos = (await Nativo.getSupportedFormats?.()) ?? [];
      if (formatos.includes('ean_13')) return new Nativo({ formats: FORMATOS.filter((f) => formatos.includes(f)) });
    } catch { /* usa o ZXing */ }
  }
  const [{ BarcodeDetector, prepareZXingModule }, { default: wasm }] = await Promise.all([
    import('barcode-detector/pure'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ]);
  prepareZXingModule({ overrides: { locateFile: (caminho: string, prefixo: string) => (caminho.endsWith('.wasm') ? wasm : prefixo + caminho) } });
  return new BarcodeDetector({ formats: FORMATOS as never });
}

/**
 * F-313 (pedido do dono): a CÂMERA DO APARELHO — o app de câmera do celular/tablet abre (input com capture), a pessoa tira a
 * foto do código e o sistema lê da foto. Tenta a foto inteira e, se não achar, versões menores e o meio ampliado.
 */
export async function lerCodigoDaFoto(arquivo: Blob): Promise<string | null> {
  const detector = await criarDetector();
  const bmp = await createImageBitmap(arquivo);
  const tentativas: Array<() => CanvasImageSource> = [
    () => bmp,
    ...[1600, 1100, 800].map((lado) => () => {
      const k = Math.min(1, lado / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
      return c;
    }),
    () => { // o meio da foto, ampliado (código pequeno no centro)
      const c = document.createElement('canvas');
      const w = bmp.width * 0.6, h = bmp.height * 0.6;
      c.width = Math.min(1600, Math.round(w)); c.height = Math.round(c.width * (h / w));
      c.getContext('2d')!.drawImage(bmp, bmp.width * 0.2, bmp.height * 0.2, w, h, 0, 0, c.width, c.height);
      return c;
    },
  ];
  try {
    for (const t of tentativas) {
      const achados = await detector.detect(t()).catch(() => [] as Achado[]);
      const c = achados.map((a) => a.rawValue.replace(/\D/g, '')).find((x) => codigoValido(x));
      if (c) return c;
    }
    return null;
  } finally { bmp.close?.(); }
}

/** quem está escrevendo em outro campo não tem a digitação "roubada" pela leitura da pistola */
const escrevendo = (alvo: EventTarget | null) => {
  const el = alvo as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
};

/**
 * `aoLer` recebe o código válido; devolve `false` quando não entrou (ex.: produto repetido) — aí toca o bipe de erro.
 */
export function LeitorDeCodigo({ aoLer }: { aoLer: (codigo: string) => boolean | void }) {
  const [valor, setValor] = useState('');
  const [camera, setCamera] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  // F-313: a câmera do APARELHO (o app de câmera do celular/tablet) — tira a foto do código e o sistema lê
  const fotoDoAparelho = useRef<HTMLInputElement>(null);
  const [lendoFoto, setLendoFoto] = useState(false);
  const lerFoto = async (arq: File | undefined) => {
    if (!arq) return;
    setLendoFoto(true);
    try {
      const c = await lerCodigoDaFoto(arq);
      if (c) lerRef.current(c);
      else { bipeDeErro(); toast.error('Não consegui ler o código nesta foto. Tire de novo, mais perto, com o código reto e bem iluminado.'); }
    } catch { bipeDeErro(); toast.error('Não foi possível ler a foto. Tente de novo ou digite o código.'); }
    finally { setLendoFoto(false); }
  };
  const abrirCameraDoAparelho = () => { prepararBipe(); fotoDoAparelho.current?.click(); };

  const ler = (bruto: string): boolean => {
    const c = bruto.replace(/\D/g, '');
    if (!c) return false;
    if (!codigoValido(c)) { bipeDeErro(); toast.error('Código de barras inválido. Confira os números (8, 12, 13 ou 14 dígitos).'); return false; }
    const entrou = aoLer(c) !== false;
    if (entrou) bipe(); else bipeDeErro();
    setValor('');
    return entrou;
  };
  const lerRef = useRef(ler);
  lerRef.current = ler;

  // PISTOLA sem o campo selecionado: teclas muito rápidas (< 60 ms entre elas) terminadas em Enter/Tab = leitura da pistola
  useEffect(() => {
    let buffer = '';
    let ultima = 0;
    let rapidas = 0;
    const tecla = (e: KeyboardEvent) => {
      if (e.target === campo.current || escrevendo(e.target) || e.ctrlKey || e.altKey || e.metaKey) return;
      const agora = performance.now();
      if (agora - ultima > 100) { buffer = ''; rapidas = 0; }
      if (/^\d$/.test(e.key)) {
        if (buffer && agora - ultima < 60) rapidas++;
        buffer += e.key; ultima = agora;
        return;
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && buffer.length >= 8 && rapidas >= buffer.length - 2) {
        e.preventDefault();
        const c = buffer; buffer = ''; rapidas = 0;
        prepararBipe();
        lerRef.current(c);
      }
    };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  }, []);

  return (
    <div className="space-y-1.5 rounded-lg border border-dashed border-slate-300 bg-white p-2.5 text-slate-900" data-testid="tabloide-leitor">
      <label htmlFor="tabloide-codigo" className="flex items-center gap-1.5 text-xs font-semibold"><ScanBarcode className="h-4 w-4 text-[#5D1BFF]" />Código de barras</label>
      <div className="flex flex-wrap gap-1.5">
        <Input id="tabloide-codigo" ref={campo} inputMode="numeric" autoComplete="off" value={valor} onChange={(e) => setValor(e.target.value)} onFocus={prepararBipe}
          onKeyDown={(e) => { if (e.key === 'Enter' || (e.key === 'Tab' && valor.replace(/\D/g, '').length >= 8)) { e.preventDefault(); if (ler(valor)) campo.current?.focus(); } }}
          placeholder="Bipe com a pistola ou digite o código" className="h-10 min-w-0 flex-1 basis-48 border-slate-300 bg-white font-mono text-sm text-slate-900 placeholder:text-slate-400" data-testid="tabloide-codigo" />
        <button type="button" onClick={() => { prepararBipe(); if (ler(valor)) campo.current?.focus(); }} disabled={!valor.trim()}
          className="flex h-10 shrink-0 items-center gap-1 rounded-md bg-[#5D1BFF] px-3 text-sm font-semibold text-white disabled:opacity-40" data-testid="tabloide-codigo-adicionar">
          <Plus className="h-4 w-4" />Adicionar
        </button>
        <button type="button" disabled={lendoFoto} onClick={() => { prepararBipe(); if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia && window.isSecureContext) setCamera(true); else abrirCameraDoAparelho(); }}
          className="flex h-10 shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 hover:bg-slate-100 disabled:opacity-60" data-testid="tabloide-camera">
          {lendoFoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}Câmera
        </button>
        <input ref={fotoDoAparelho} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void lerFoto(f); }} data-testid="tabloide-foto-aparelho" />
      </div>
      <p className="text-[11px] text-slate-500">Pistola de código de barras (USB ou Bluetooth), câmera do aparelho ou digitando. O produto entra com o nome, a marca, a medida e a foto certos; cada leitura faz um bipe. Depois é só digitar o preço na lista.</p>
      {camera && <CameraDoCodigo aoLer={(c) => lerRef.current(c)} aoFechar={() => setCamera(false)} aoUsarCameraDoAparelho={() => { setCamera(false); abrirCameraDoAparelho(); }} />}
    </div>
  );
}

function CameraDoCodigo({ aoLer, aoFechar, aoUsarCameraDoAparelho }: { aoLer: (c: string) => boolean; aoFechar: () => void; aoUsarCameraDoAparelho: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  const [lidos, setLidos] = useState<string[]>([]);
  const [flash, setFlash] = useState(false);
  // a tela redesenha sem reabrir a câmera
  const aoLerRef = useRef(aoLer);
  aoLerRef.current = aoLer;
  useEffect(() => {
    let fluxo: MediaStream | null = null;
    let vivo = true;
    let relogio = 0;
    // o mesmo código parado na frente da câmera não entra de novo (só depois de 2,5 s fora dela)
    let ultimo = '';
    let vistoEm = 0;
    void (async () => {
      try {
        if (!window.isSecureContext) throw new Error('inseguro');
        const [detector, f] = await Promise.all([
          criarDetector(),
          navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }),
        ]);
        fluxo = f;
        if (!vivo || !video.current) { f.getTracks().forEach((t) => t.stop()); return; }
        video.current.srcObject = fluxo;
        await video.current.play();
        setPronto(true);
        const procurar = async () => {
          if (!vivo || !video.current) return;
          if (video.current.readyState >= 2) {
            const achados = await detector.detect(video.current).catch(() => [] as Achado[]);
            const c = achados.map((a) => a.rawValue.replace(/\D/g, '')).find((x) => codigoValido(x));
            const agora = performance.now();
            if (c && (c !== ultimo || agora - vistoEm > 2500)) {
              ultimo = c;
              if (aoLerRef.current(c)) { setLidos((l) => [c, ...l].slice(0, 5)); setFlash(true); window.setTimeout(() => setFlash(false), 250); }
            }
            if (c) vistoEm = agora;
          }
          relogio = window.setTimeout(procurar, 180);
        };
        void procurar();
      } catch (e) {
        const nome = (e as { name?: string }).name;
        setErro(nome === 'NotAllowedError' || nome === 'SecurityError'
          ? 'A câmera não foi autorizada. Toque no botão abaixo para abrir a câmera do aparelho e tirar a foto do código — ou toque no cadeado ao lado do endereço do site e permita a Câmera.'
          : nome === 'NotFoundError' ? 'A câmera ao vivo não abriu neste aparelho. Toque no botão abaixo para usar a câmera do aparelho, a pistola ou digite o código.'
          : 'A câmera ao vivo não abriu. Toque no botão abaixo para usar a câmera do aparelho e tirar a foto do código.');
      }
    })();
    return () => { vivo = false; clearTimeout(relogio); fluxo?.getTracks().forEach((t) => t.stop()); };
  }, []);
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-black/90 p-4" role="dialog" aria-modal="true" aria-label="Ler código de barras pela câmera" data-testid="leitor-camera">
      <div className={`relative w-full max-w-md overflow-hidden rounded-xl border-2 bg-black transition-colors ${flash ? 'border-[#25D366]' : 'border-white/20'}`}>
        <video ref={video} muted playsInline className="block aspect-[4/3] w-full object-cover" />
        <div aria-hidden className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500 shadow-[0_0_12px_rgba(239,68,68,.9)]" />
        {flash && <div aria-hidden className="pointer-events-none absolute inset-0 bg-[#25D366]/25" />}
      </div>
      <p className="flex max-w-md items-center gap-2 text-center text-sm text-white" role="status">
        {erro ?? (pronto ? 'Aponte para o código de barras · cada produto lido faz um bipe e entra na lista' : <><Loader2 className="h-4 w-4 animate-spin" />Abrindo a câmera do aparelho… se aparecer o pedido, toque em Permitir</>)}
      </p>
      {/* F-313: se a câmera ao vivo não abrir (ou a pessoa preferir), o app de câmera do aparelho tira a foto do código */}
      <button type="button" onClick={aoUsarCameraDoAparelho}
        className={`flex h-11 items-center gap-1.5 rounded-xl px-5 text-sm font-bold ${erro ? 'bg-[#FFD400] text-[#22004A]' : 'border border-white/30 text-white'}`} data-testid="leitor-camera-do-aparelho">
        <Camera className="h-4 w-4" />{erro ? 'Abrir a câmera do aparelho e tirar a foto do código' : 'Usar a câmera do aparelho (tirar foto)'}
      </button>
      {lidos.length > 0 && (
        <ul className="flex max-w-md flex-wrap justify-center gap-1.5" aria-label="Códigos lidos" data-testid="leitor-lidos">
          {lidos.map((c, i) => <li key={c + i} className="flex items-center gap-1 rounded-full bg-[#25D366]/20 px-2 py-0.5 font-mono text-xs text-[#7dffb0]"><Check className="h-3 w-3" />{c}</li>)}
        </ul>
      )}
      <button type="button" onClick={aoFechar} className="flex h-11 items-center gap-1.5 rounded-xl bg-white px-5 text-sm font-bold text-slate-900" data-testid="leitor-concluir">
        {lidos.length ? <><Check className="h-4 w-4" />Concluir</> : <><X className="h-4 w-4" />Fechar</>}
      </button>
    </div>
  );
}
