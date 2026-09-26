import { useEffect, useState } from 'react';
import { Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WidgetConfig } from '@/types/models';
import {
  buscarOfertaWidget, descontoDoItem, ofertaVigente, partesPreco, precoBR, validadeTexto,
  type OfertaWidgetDados, type OfertaWidgetItem,
} from '@/lib/ofertaWidget';
import { WidgetQRCode } from './WidgetQRCode';

const FUNDO = 'linear-gradient(135deg,#22004A 0%,#5D1BFF 55%,#8A2EFF 100%)';

export function Moldura({ backgroundImage, className, children, testId }: {
  backgroundImage?: string | null; className?: string; children: React.ReactNode; testId?: string;
}) {
  return (
    <div className={cn('relative flex h-full w-full flex-col overflow-hidden p-[4.5%] text-white', className)}
      style={{ containerType: 'size', background: FUNDO }} data-testid={testId}>
      {backgroundImage && <img src={backgroundImage} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(circle at 85% 10%, rgba(176,77,255,.55), transparent 55%)' }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: backgroundImage
        ? 'linear-gradient(180deg, rgba(34,0,74,.75) 0%, rgba(34,0,74,.6) 50%, rgba(34,0,74,.92) 100%)'
        : 'linear-gradient(180deg, rgba(34,0,74,0) 0%, rgba(34,0,74,.47) 100%)' }} />
      {children}
    </div>
  );
}

export function Cabecalho({ selo }: { selo: string }) {
  return (
    <div className="relative z-10 flex items-center justify-between">
      <span className="text-[clamp(8px,3.2cqmin,22px)] font-bold tracking-[0.28em] text-white/85">SOBRE MÍDIA</span>
      <span className="rounded-full bg-[#FFD400] px-[1.2em] py-[0.35em] text-[clamp(7px,2.8cqmin,18px)] font-extrabold tracking-widest text-[#22004A]">{selo}</span>
    </div>
  );
}

/** Preço "de varejo": R$ pequeno, reais grandes, centavos em cima. */
function Preco({ valor, escala }: { valor: number; escala: number }) {
  const p = partesPreco(valor);
  return (
    <span className="inline-flex items-start font-black leading-none text-[#FFD400]" style={{ fontSize: `${escala}cqmin`, textShadow: '0 0 18px rgba(255,212,0,.35)' }}>
      <span className="mr-[0.08em] mt-[0.18em] text-[0.34em]">R$</span>
      <span className="tabular-nums">{p.inteiro}</span>
      <span className="mt-[0.1em] text-[0.42em] tabular-nums">,{p.centavos}</span>
    </span>
  );
}

function Foto({ item, className }: { item: OfertaWidgetItem; className?: string }) {
  return item.imagem_url ? (
    <img src={item.imagem_url} alt={item.nome} className={cn('rounded-[2cqmin] bg-white object-contain p-[1cqmin]', className)} />
  ) : (
    <div className={cn('flex items-center justify-center rounded-[2cqmin] bg-white/15', className)}><Tag className="h-1/3 w-1/3 text-white/70" /></div>
  );
}

function Selo({ pct }: { pct: number }) {
  if (pct <= 0) return null;
  return <span className="rounded-full bg-[#25D366] px-[0.9em] py-[0.25em] text-[clamp(7px,3cqmin,22px)] font-black text-[#0B2E17]">-{pct}%</span>;
}

function DePor({ item, escala }: { item: OfertaWidgetItem; escala: number }) {
  const temDe = item.preco_original > item.preco_oferta;
  return (
    <div className="flex flex-col gap-[0.6cqmin]">
      {temDe && <span className="text-[clamp(7px,3cqmin,22px)] font-semibold text-white/75">DE <span className="line-through">{precoBR(item.preco_original)}</span> POR</span>}
      <Preco valor={item.preco_oferta} escala={escala} />
    </div>
  );
}

/** Apresentação da oferta (dados já carregados). Mesma composição do Android (NativeWidgetEngine.buildOffer). */
export function OfferWidgetView({ dados, config, backgroundImage, className, agora }: {
  dados: OfertaWidgetDados; config: WidgetConfig; backgroundImage?: string | null; className?: string; agora?: Date;
}) {
  // Nunca exibir preço fora da validade (o servidor já não envia; aqui é a segunda trava).
  if (!ofertaVigente(dados, agora) || dados.itens.length === 0) {
    return (
      <Moldura backgroundImage={backgroundImage} className={className} testId="offer-widget-encerrada">
        <Cabecalho selo="OFERTAS" />
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-[2cqmin] text-center">
          <Tag className="h-[14cqmin] w-[14cqmin] text-[#FFD400]" />
          <span className="text-[clamp(12px,7cqmin,52px)] font-black">Novas ofertas em breve</span>
        </div>
      </Moldura>
    );
  }
  const itens = dados.itens;
  const unico = itens.length === 1 ? itens[0] : null;
  const temQr = !!config.qrConteudo?.trim();
  return (
    <Moldura backgroundImage={backgroundImage} className={className} testId="offer-widget">
      <Cabecalho selo="OFERTA" />
      <div className="relative z-10 mt-[2cqmin] flex items-end justify-between gap-[2cqmin]">
        <h2 className="min-w-0 truncate text-[clamp(12px,7cqmin,56px)] font-black leading-tight" style={{ textShadow: '0 0 24px rgba(176,77,255,.7)' }}>{dados.titulo}</h2>
      </div>
      <div className="relative z-10 flex min-h-0 flex-1 items-center gap-[3cqmin] py-[2.5cqmin] [@container(orientation:portrait)]:flex-col">
        {unico ? (
          <div className="flex min-h-0 w-full flex-1 items-center gap-[4cqmin] [@container(orientation:portrait)]:flex-col [@container(orientation:portrait)]:justify-center">
            <Foto item={unico} className="aspect-square h-[52cqmin] flex-shrink-0" />
            <div className="flex min-w-0 flex-col gap-[1.6cqmin] [@container(orientation:portrait)]:items-center [@container(orientation:portrait)]:text-center">
              <Selo pct={descontoDoItem(unico)} />
              <span className="text-[clamp(10px,5.4cqmin,40px)] font-bold leading-tight">{unico.nome}</span>
              {(unico.marca || unico.unidade) && <span className="text-[clamp(7px,3cqmin,22px)] text-white/75">{[unico.marca, unico.unidade].filter(Boolean).join(' · ')}</span>}
              <DePor item={unico} escala={17} />
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 w-full flex-1 gap-[2cqmin] [grid-template-columns:repeat(3,minmax(0,1fr))] [@container(orientation:portrait)]:[grid-template-columns:repeat(2,minmax(0,1fr))]"
            style={{ gridAutoRows: 'minmax(0,1fr)' }}>
            {itens.map((i, k) => (
              <div key={k} className="relative flex min-h-0 flex-col items-center justify-between gap-[1cqmin] rounded-[2.5cqmin] border border-white/25 bg-white/15 p-[1.8cqmin] text-center">
                <div className="absolute right-[1.2cqmin] top-[1.2cqmin]"><Selo pct={descontoDoItem(i)} /></div>
                <Foto item={i} className="aspect-square min-h-0 w-[60%] flex-1" />
                <span className="line-clamp-2 text-[clamp(7px,3.2cqmin,24px)] font-bold leading-tight">{i.nome}</span>
                <DePor item={i} escala={8} />
              </div>
            ))}
          </div>
        )}
        {temQr && <WidgetQRCode conteudo={config.qrConteudo} legenda={config.qrLegenda || 'Aproveite'} className="w-[24cqmin] flex-shrink-0" />}
      </div>
      <div className="relative z-10 flex items-center justify-between gap-[2cqmin] text-[clamp(7px,2.8cqmin,20px)] text-white/80">
        <span className="font-semibold">{validadeTexto(dados.data_fim, agora)}</span>
        {dados.descricao && <span className="truncate">{dados.descricao}</span>}
      </div>
    </Moldura>
  );
}

/** Carrega a oferta pelo id (permissão de quem está logado) — estados carregando / pronta / indisponível. */
export function OfferWidget({ config, backgroundImage, className }: { config: WidgetConfig; backgroundImage?: string | null; className?: string }) {
  const [estado, setEstado] = useState<{ id?: string; dados?: OfertaWidgetDados | null }>({});
  const id = config.ofertaId;
  useEffect(() => {
    let vivo = true;
    if (!id) { setEstado({ id: undefined, dados: null }); return; }
    setEstado({ id, dados: undefined });
    buscarOfertaWidget(id).then((d) => { if (vivo) setEstado({ id, dados: d }); }).catch(() => { if (vivo) setEstado({ id, dados: null }); });
    return () => { vivo = false; };
  }, [id]);

  if (estado.dados) return <OfferWidgetView dados={estado.dados} config={config} backgroundImage={backgroundImage} className={className} />;
  return (
    <Moldura backgroundImage={backgroundImage} className={className} testId={estado.dados === undefined ? 'offer-widget-carregando' : 'offer-widget-indisponivel'}>
      <Cabecalho selo="OFERTA" />
      <div className="relative z-10 flex flex-1 items-center justify-center text-center text-[clamp(10px,5cqmin,36px)] font-bold text-white/85">
        {estado.dados === undefined ? 'Carregando oferta…' : id ? 'Oferta indisponível' : 'Escolha uma oferta'}
      </div>
    </Moldura>
  );
}
