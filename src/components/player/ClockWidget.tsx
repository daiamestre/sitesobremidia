import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ClockWidgetProps {
  showDate?: boolean;
  showSeconds?: boolean;
  backgroundImage?: string;
  className?: string;
}

export function ClockWidget({
  showDate = true,
  showSeconds = false,
  backgroundImage,
  className = ''
}: ClockWidgetProps) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const timeFormat = showSeconds ? 'HH:mm:ss' : 'HH:mm';

  return (
    <div className={`relative flex flex-col items-center justify-center text-white h-full w-full overflow-hidden ${className}`}>
      {backgroundImage && (
        <>
          {/* <div className="absolute inset-0 bg-black/40 z-0" /> Removed for 100% image visibility */}
          <img
            src={backgroundImage}
            alt="Background"
            className="absolute inset-0 w-full h-full object-cover -z-10"
            style={{ objectPosition: 'center' }}
          />
        </>
      )}
      <div className="z-10 text-center drop-shadow-md">
        <p className="text-[7rem] leading-none font-black tracking-tighter">
          {format(time, timeFormat)}
        </p>
        {showDate && (
          <p className="text-4xl text-white/90 mt-4 font-bold">
            {format(time, "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </p>
        )}
      </div>
    </div>
  );
}
