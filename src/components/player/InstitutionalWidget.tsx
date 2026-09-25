import { cn } from '@/lib/utils';
import type { WidgetConfig } from '@/types/models';
import { WidgetQRCode } from './WidgetQRCode';

/**
 * Modelo "Institucional / Aviso": horário de funcionamento, comunicados, contato e QR Code, na identidade SOBRE MÍDIA.
 * Só apresentação: o conteúdo vem de widgets.config. Mesma composição do Android (NativeWidgetEngine.buildInstitutional).
 */
export function InstitutionalWidget({ config, backgroundImage, className }: {
  config: WidgetConfig; backgroundImage?: string | null; className?: string;
}) {
  const linhas = (config.linhas || []).filter((l) => l.rotulo?.trim() || l.valor?.trim());
  const contatos = [config.contato, config.endereco, config.site].filter((x): x is string => !!x?.trim());
  const temQr = !!config.qrConteudo?.trim();
  return (
    <div
      className={cn('relative flex h-full w-full flex-col overflow-hidden p-[5%] text-white', className)}
      style={{ containerType: 'size', background: 'linear-gradient(135deg,#22004A 0%,#5D1BFF 55%,#8A2EFF 100%)' }}
      data-testid="institutional-widget"
    >
      {backgroundImage && <img src={backgroundImage} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(circle at 85% 10%, rgba(176,77,255,.55), transparent 55%)' }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: backgroundImage
        ? 'linear-gradient(180deg, rgba(34,0,74,.75) 0%, rgba(34,0,74,.6) 50%, rgba(34,0,74,.92) 100%)'
        : 'linear-gradient(180deg, rgba(34,0,74,0) 0%, rgba(34,0,74,.47) 100%)' }} />

      <div className="relative z-10 flex items-center justify-between">
        <span className="text-[clamp(8px,3.2cqmin,22px)] font-bold tracking-[0.28em] text-white/85">SOBRE MÍDIA</span>
        <span className="rounded-full bg-[#FFD400] px-[1.2em] py-[0.35em] text-[clamp(7px,2.8cqmin,18px)] font-extrabold tracking-widest text-[#22004A]">
          {(config.selo || 'INFORMAÇÃO').toUpperCase()}
        </span>
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 items-center gap-[4cqmin] py-[3cqmin] [@container(orientation:portrait)]:flex-col [@container(orientation:portrait)]:justify-center">
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-[2cqmin]">
          <h2 className="text-[clamp(14px,8cqmin,64px)] font-black leading-tight tracking-tight" style={{ textShadow: '0 0 24px rgba(176,77,255,.7)' }}>
            {config.titulo || 'Título do comunicado'}
          </h2>
          {config.texto?.trim() && <p className="whitespace-pre-line text-[clamp(9px,4.2cqmin,32px)] leading-snug text-white/90">{config.texto}</p>}
          {linhas.length > 0 && (
            <div className="grid gap-[1.2cqmin]">
              {linhas.map((l, i) => (
                <div key={i} className="flex items-center justify-between gap-[2cqmin] rounded-[2.5cqmin] border border-white/25 bg-white/15 px-[2.5cqmin] py-[1.4cqmin]">
                  <span className="text-[clamp(8px,3.6cqmin,26px)] font-semibold">{l.rotulo}</span>
                  <span className="text-[clamp(8px,3.8cqmin,28px)] font-black tabular-nums text-[#FFD400]">{l.valor}</span>
                </div>
              ))}
            </div>
          )}
          {contatos.length > 0 && (
            <p className="text-[clamp(7px,3cqmin,22px)] text-white/80">{contatos.join('  •  ')}</p>
          )}
          {config.cta?.trim() && (
            <span className="self-start rounded-full bg-[#25D366] px-[1.4em] py-[0.45em] text-[clamp(8px,3.4cqmin,24px)] font-extrabold text-[#0b2e17]">{config.cta}</span>
          )}
        </div>
        {temQr && (
          <WidgetQRCode conteudo={config.qrConteudo} legenda={config.qrLegenda || 'Aponte a câmera'} className="w-[26cqmin] flex-shrink-0" />
        )}
      </div>
    </div>
  );
}
