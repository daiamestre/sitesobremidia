import { cn } from '@/lib/utils';
import { brasiliaDateLong, brasiliaHour, brasiliaTime, useBrasiliaClock } from '@/lib/brasiliaTime';

const saudacao = (h: number) => (h >= 5 && h < 12 ? 'Bom dia' : h >= 12 && h < 18 ? 'Boa tarde' : 'Boa noite');

/**
 * Modelo "Relógio Futurista" (identidade SOBRE MÍDIA). Hora e data SEMPRE no Horário de Brasília sobre o relógio
 * corrigido pelo servidor. Mesma composição do Android Player (NativeWidgetEngine.buildClockFuturista).
 */
export function ClockFuturista({ showDate = true, showSeconds = false, backgroundImage, className }: {
  showDate?: boolean; showSeconds?: boolean; backgroundImage?: string | null; className?: string;
}) {
  const agora = useBrasiliaClock(showSeconds);
  return (
    <div
      className={cn('relative flex h-full w-full flex-col overflow-hidden p-[5%] text-white', className)}
      style={{ containerType: 'size', background: 'linear-gradient(135deg,#22004A 0%,#5D1BFF 55%,#8A2EFF 100%)' }}
      data-testid="clock-futurista"
    >
      {backgroundImage && <img src={backgroundImage} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(circle at 85% 10%, rgba(176,77,255,.6), transparent 55%)' }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: backgroundImage
        ? 'linear-gradient(180deg, rgba(34,0,74,.6) 0%, rgba(34,0,74,.37) 45%, rgba(34,0,74,.92) 100%)'
        : 'linear-gradient(180deg, rgba(34,0,74,0) 0%, rgba(34,0,74,.47) 100%)' }} />

      <div className="relative z-10 flex items-center justify-between">
        <span className="text-[clamp(8px,3.2cqmin,22px)] font-bold tracking-[0.28em] text-white/85">SOBRE MÍDIA</span>
        <span className="rounded-full bg-[#FFD400] px-[1.2em] py-[0.35em] text-[clamp(7px,2.8cqmin,18px)] font-extrabold tracking-widest text-[#22004A]">HORÁRIO DE BRASÍLIA</span>
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center text-center">
        <p className="text-[clamp(10px,5cqmin,34px)] text-white/90">{saudacao(brasiliaHour(agora))}</p>
        <p className="text-[clamp(28px,30cqmin,240px)] font-black leading-none tabular-nums" style={{ textShadow: '0 0 30px #B04DFF' }} data-testid="clock-time">
          {brasiliaTime(agora, showSeconds)}
        </p>
        {showDate && (
          <span className="mt-[2cqmin] rounded-full bg-white/20 px-[1.2em] py-[0.35em] text-[clamp(8px,4cqmin,28px)] font-bold tracking-wider" data-testid="clock-date">
            {brasiliaDateLong(agora)}
          </span>
        )}
      </div>
    </div>
  );
}
