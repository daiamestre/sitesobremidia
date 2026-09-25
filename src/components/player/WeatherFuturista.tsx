import { useEffect, useState } from 'react';
import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Moon, Sun, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buscarClima, descreverClima, nomeDoLocal, rotuloDia, type DadosClima, type IconeClima } from '@/lib/weatherData';

const ICONES: Record<IconeClima, LucideIcon> = {
  sol: Sun, lua: Moon, parcial: CloudSun, nuvem: Cloud, nevoa: CloudFog, chuva: CloudRain, neve: CloudSnow, tempestade: CloudLightning,
};

type Estado = 'LOADING' | 'READY' | 'UNAVAILABLE';

/**
 * Modelo "Clima Futurista" (identidade SOBRE MÍDIA). Apenas APRESENTAÇÃO: os dados vêm de weatherData.ts.
 * Mesma composição do Android Player (NativeWidgetEngine.buildWeatherFuturista), para a prévia representar a tela.
 */
export function WeatherFuturista({ latitude, longitude, locationName, backgroundImage, className }: {
  latitude?: number; longitude?: number; locationName?: string; backgroundImage?: string | null; className?: string;
}) {
  const [dados, setDados] = useState<DadosClima | null>(null);
  const [local, setLocal] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado>('LOADING');
  const lat = Number.isFinite(latitude) ? (latitude as number) : -23.5505;
  const lon = Number.isFinite(longitude) ? (longitude as number) : -46.6333;

  useEffect(() => {
    const ctrl = new AbortController();
    setEstado('LOADING');
    Promise.all([buscarClima(lat, lon, ctrl.signal), locationName ? Promise.resolve(locationName) : nomeDoLocal(lat, lon, ctrl.signal)])
      .then(([d, l]) => { setDados(d); setLocal(l); setEstado(d ? 'READY' : 'UNAVAILABLE'); })
      .catch(() => { if (!ctrl.signal.aborted) setEstado('UNAVAILABLE'); });
    return () => ctrl.abort();
  }, [lat, lon, locationName]);

  const desc = dados ? descreverClima(dados.code, dados.isDay) : null;
  const Icone = desc ? ICONES[desc.icone] : Cloud;

  return (
    <div
      className={cn('relative flex h-full w-full flex-col overflow-hidden p-[5%] text-white', className)}
      style={{ containerType: 'size', background: 'linear-gradient(135deg,#22004A 0%,#5D1BFF 55%,#8A2EFF 100%)' }}
      data-testid="weather-futurista"
      data-estado={estado}
    >
      {backgroundImage && <img src={backgroundImage} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(circle at 85% 10%, rgba(176,77,255,.6), transparent 55%)' }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: backgroundImage
        ? 'linear-gradient(180deg, rgba(34,0,74,.6) 0%, rgba(34,0,74,.37) 45%, rgba(34,0,74,.92) 100%)'
        : 'linear-gradient(180deg, rgba(34,0,74,0) 0%, rgba(34,0,74,.47) 100%)' }} />

      <div className="relative z-10 flex items-center justify-between">
        <span className="text-[clamp(8px,3.2cqmin,22px)] font-bold tracking-[0.28em] text-white/85">SOBRE MÍDIA</span>
        <span className="rounded-full bg-[#FFD400] px-[1.2em] py-[0.35em] text-[clamp(7px,2.8cqmin,18px)] font-extrabold tracking-widest text-[#22004A]">CLIMA AGORA</span>
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center text-center">
        {estado === 'LOADING' && <p className="animate-pulse text-[clamp(9px,4cqmin,28px)] text-white/80">Buscando o clima…</p>}
        {estado === 'UNAVAILABLE' && (
          <>
            <Cloud className="h-[22cqmin] w-[22cqmin] opacity-80" strokeWidth={1.5} />
            <p className="mt-[2%] text-[clamp(10px,5cqmin,34px)] font-bold">Clima indisponível no momento</p>
            <p className="text-[clamp(8px,3.2cqmin,22px)] text-white/75">os dados voltam assim que a conexão responder</p>
          </>
        )}
        {estado === 'READY' && dados && desc && (
          <>
            <p className="text-[clamp(10px,5cqmin,34px)] font-bold tracking-[0.14em]">{(local || 'Sua região').toUpperCase()}</p>
            <div className="mt-[1.5%] flex items-center gap-[3.5cqmin]">
              <Icone className="h-[22cqmin] w-[22cqmin] text-[#FFD400] drop-shadow-[0_0_24px_rgba(255,212,0,.45)]" strokeWidth={1.4} />
              <div className="text-left">
                <p className="text-[clamp(28px,24cqmin,190px)] font-black leading-none" style={{ textShadow: '0 0 40px #B04DFF' }}>{dados.temp}°C</p>
                <p className="text-[clamp(10px,5cqmin,34px)] text-white/90">{desc.texto}</p>
              </div>
            </div>
            <div className="mt-[2.5%] flex flex-wrap items-center justify-center gap-[2cqmin]">
              {dados.max !== null && <Chip>MÁX. {dados.max}°</Chip>}
              <Chip>SENSAÇÃO {dados.sensacao}°</Chip>
              {dados.min !== null && <Chip>MÍN. {dados.min}°</Chip>}
            </div>
          </>
        )}
      </div>

      {estado === 'READY' && dados && dados.dias.length > 0 && (
        <div className="relative z-10 grid grid-cols-5 gap-[1.6cqmin]">
          {dados.dias.slice(0, 5).map((d, i) => {
            const I = ICONES[descreverClima(d.code, true).icone];
            return (
              <div key={d.dia} className="flex flex-col items-center rounded-[3.5cqmin] border border-white/25 bg-white/15 p-[1.8cqmin] backdrop-blur-sm">
                <span className={cn('text-[clamp(7px,3cqmin,20px)] font-bold tracking-wider', i === 0 ? 'text-[#FFD400]' : 'text-white')}>{rotuloDia(d.dia, i)}</span>
                <I className="my-[0.8cqmin] h-[7.5cqmin] w-[7.5cqmin]" strokeWidth={1.6} />
                <span className="text-[clamp(8px,3.4cqmin,22px)] font-bold">{d.max}°</span>
                <span className="text-[clamp(7px,2.6cqmin,18px)] text-white/75">{d.min}°</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-white/20 px-[1.2em] py-[0.35em] text-[clamp(8px,3.4cqmin,22px)] font-bold tracking-wider">{children}</span>;
}
