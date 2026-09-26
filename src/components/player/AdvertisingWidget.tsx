import { useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import type { WidgetConfig } from '@/types/models';
import { buscarCampanhaWidget, campanhaVigente, type CampanhaWidgetDados } from '@/lib/campanhaWidget';
import { Cabecalho, Moldura } from './OfferWidget';
import { WidgetQRCode } from './WidgetQRCode';

/** Tempo de cada criativo quando a campanha tem mais de um (mesmo valor do Android). */
export const SEGUNDOS_POR_CRIATIVO = 8;

/** Apresentação da campanha (dados já carregados). Mesma composição do Android (NativeWidgetEngine.buildAdvertising). */
export function AdvertisingWidgetView({ dados, config, backgroundImage, className, agora }: {
  dados: CampanhaWidgetDados; config: WidgetConfig; backgroundImage?: string | null; className?: string; agora?: Date;
}) {
  const [indice, setIndice] = useState(0);
  const total = dados.criativos.length;
  useEffect(() => {
    setIndice(0);
    if (total < 2) return;
    const t = setInterval(() => setIndice((i) => (i + 1) % total), SEGUNDOS_POR_CRIATIVO * 1000);
    return () => clearInterval(t);
  }, [total, dados.id]);

  // Campanha fora do ar nunca aparece (o servidor já não envia; aqui é a segunda trava).
  if (!campanhaVigente(dados, agora) || total === 0) {
    return (
      <Moldura backgroundImage={backgroundImage} className={className} testId="advertising-widget-fora">
        <Cabecalho selo="PUBLICIDADE" />
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-[2cqmin] text-center">
          <Megaphone className="h-[14cqmin] w-[14cqmin] text-[#FFD400]" />
          <span className="text-[clamp(12px,7cqmin,52px)] font-black">Anuncie aqui</span>
        </div>
      </Moldura>
    );
  }
  const temQr = !!config.qrConteudo?.trim();
  const cta = config.cta?.trim();
  return (
    <Moldura backgroundImage={backgroundImage} className={className} testId="advertising-widget">
      <Cabecalho selo="PUBLICIDADE" />
      <div className="relative z-10 flex min-h-0 flex-1 items-stretch gap-[3cqmin] pt-[2.5cqmin] [@container(orientation:portrait)]:flex-col">
        <div className="relative min-h-0 min-w-0 flex-1">
          {dados.criativos.map((url, i) => (
            <img key={url} src={url} alt={i === indice ? dados.titulo : ''}
              className="absolute inset-0 h-full w-full rounded-[2cqmin] object-contain transition-opacity duration-700"
              style={{ opacity: i === indice ? 1 : 0, filter: 'drop-shadow(0 0 18px rgba(176,77,255,.45))' }} />
          ))}
        </div>
        <div className="flex w-[30%] flex-shrink-0 flex-col items-center justify-center gap-[2.2cqmin] text-center [@container(orientation:portrait)]:w-full [@container(orientation:portrait)]:flex-row [@container(orientation:portrait)]:justify-between [@container(orientation:portrait)]:text-left">
          <div className="flex min-w-0 flex-col items-center gap-[2cqmin] [@container(orientation:portrait)]:items-start">
            <span className="text-[clamp(10px,5.4cqmin,40px)] font-black leading-tight" style={{ textShadow: '0 0 24px rgba(176,77,255,.7)' }}>{dados.titulo}</span>
            {cta && <span className="rounded-full bg-[#25D366] px-[1.4em] py-[0.45em] text-[clamp(8px,3.4cqmin,24px)] font-extrabold text-[#0b2e17]">{cta}</span>}
          </div>
          {temQr && <WidgetQRCode conteudo={config.qrConteudo} legenda={config.qrLegenda || 'Saiba mais'} className="w-[24cqmin] flex-shrink-0" />}
        </div>
      </div>
      {total > 1 && (
        <div className="relative z-10 mt-[1.5cqmin] flex justify-center gap-[1cqmin]" aria-hidden>
          {dados.criativos.map((u, i) => (
            <span key={u} className="h-[1.2cqmin] rounded-full transition-all" style={{ width: i === indice ? '4cqmin' : '1.2cqmin', background: i === indice ? '#FFD400' : 'rgba(255,255,255,.45)' }} />
          ))}
        </div>
      )}
    </Moldura>
  );
}

/** Carrega a campanha pelo id (permissão de quem está logado) — carregando / pronta / indisponível. */
export function AdvertisingWidget({ config, backgroundImage, className }: { config: WidgetConfig; backgroundImage?: string | null; className?: string }) {
  const [estado, setEstado] = useState<{ dados?: CampanhaWidgetDados | null }>({});
  const id = config.campanhaId;
  useEffect(() => {
    let vivo = true;
    if (!id) { setEstado({ dados: null }); return; }
    setEstado({ dados: undefined });
    buscarCampanhaWidget(id).then((d) => { if (vivo) setEstado({ dados: d }); }).catch(() => { if (vivo) setEstado({ dados: null }); });
    return () => { vivo = false; };
  }, [id]);

  if (estado.dados) return <AdvertisingWidgetView dados={estado.dados} config={config} backgroundImage={backgroundImage} className={className} />;
  return (
    <Moldura backgroundImage={backgroundImage} className={className} testId={estado.dados === undefined ? 'advertising-widget-carregando' : 'advertising-widget-indisponivel'}>
      <Cabecalho selo="PUBLICIDADE" />
      <div className="relative z-10 flex flex-1 items-center justify-center text-center text-[clamp(10px,5cqmin,36px)] font-bold text-white/85">
        {estado.dados === undefined ? 'Carregando campanha…' : id ? 'Campanha indisponível' : 'Escolha uma campanha'}
      </div>
    </Moldura>
  );
}
