import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { qrSvg } from '@/lib/qrCode';

/** QR Code reutilizável dos widgets (Ofertas, Publicidade, Institucional, Social...). Não renderiza nada se inválido. */
export function WidgetQRCode({ conteudo, legenda, className }: { conteudo?: string | null; legenda?: string; className?: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    if (!conteudo) { setSvg(null); return; }
    qrSvg(conteudo).then((s) => { if (vivo) setSvg(s); }).catch(() => { if (vivo) setSvg(null); });
    return () => { vivo = false; };
  }, [conteudo]);
  if (!svg) return null;
  return (
    <div className={cn('flex flex-col items-center gap-[1cqmin]', className)} data-testid="widget-qrcode">
      <div className="aspect-square w-full rounded-[2cqmin] bg-white p-[1.2cqmin] shadow-lg [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      {legenda && <span className="text-center text-[clamp(7px,2.6cqmin,18px)] font-semibold tracking-wide text-white/90">{legenda}</span>}
    </div>
  );
}
