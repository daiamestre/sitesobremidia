import { AtSign, Facebook, Instagram, Linkedin, MessageSquareQuote, Music2 } from 'lucide-react';
import type { WidgetConfig } from '@/types/models';
import { Cabecalho, Moldura } from './OfferWidget';
import { WidgetQRCode } from './WidgetQRCode';

export type RedeSocial = 'instagram' | 'facebook' | 'tiktok' | 'linkedin' | 'x' | 'geral';

export const REDES: Record<RedeSocial, { nome: string; cor: string; Icone: typeof Instagram }> = {
  instagram: { nome: 'INSTAGRAM', cor: 'linear-gradient(45deg,#F58529,#DD2A7B,#8134AF)', Icone: Instagram },
  facebook: { nome: 'FACEBOOK', cor: '#1877F2', Icone: Facebook },
  tiktok: { nome: 'TIKTOK', cor: '#111111', Icone: Music2 },
  linkedin: { nome: 'LINKEDIN', cor: '#0A66C2', Icone: Linkedin },
  x: { nome: 'X', cor: '#111111', Icone: AtSign },
  geral: { nome: 'SOCIAL', cor: '#5D1BFF', Icone: MessageSquareQuote },
};

/** Rede do post: widget "instagram" é sempre Instagram; "social" usa a escolhida. */
export function redeDoWidget(widgetType: string, config: WidgetConfig): RedeSocial {
  if (widgetType === 'instagram') return 'instagram';
  return (config.rede && config.rede in REDES ? config.rede : 'geral') as RedeSocial;
}

/**
 * Post social / Instagram montado com o que o usuário enviou (imagem, perfil, texto) — sem raspar rede social.
 * Mesma composição do Android (NativeWidgetEngine.buildSocial).
 */
export function SocialWidget({ widgetType, config, backgroundImage, className }: {
  widgetType: string; config: WidgetConfig; backgroundImage?: string | null; className?: string;
}) {
  const rede = REDES[redeDoWidget(widgetType, config)];
  const perfil = config.perfil?.trim().replace(/^@?/, '@');
  const temQr = !!config.qrConteudo?.trim();
  return (
    <Moldura backgroundImage={backgroundImage} className={className} testId="social-widget">
      <Cabecalho selo={rede.nome} />
      <div className="relative z-10 flex min-h-0 flex-1 items-center gap-[4cqmin] pt-[2.5cqmin] [@container(orientation:portrait)]:flex-col">
        {config.imagemPost && (
          <img src={config.imagemPost} alt="" className="aspect-square h-full max-h-full min-h-0 flex-shrink-0 rounded-[2.5cqmin] object-cover shadow-2xl [@container(orientation:portrait)]:h-auto [@container(orientation:portrait)]:w-full" data-testid="social-imagem" />
        )}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-[2cqmin]">
          {(perfil || config.autor) && (
            <div className="flex items-center gap-[2cqmin]">
              <span className="flex h-[9cqmin] w-[9cqmin] flex-shrink-0 items-center justify-center rounded-full" style={{ background: rede.cor }}>
                <rede.Icone className="h-1/2 w-1/2 text-white" />
              </span>
              <div className="flex min-w-0 flex-col">
                {config.autor && <span className="truncate text-[clamp(9px,4cqmin,30px)] font-bold">{config.autor}</span>}
                {perfil && <span className="truncate text-[clamp(8px,3.2cqmin,24px)] text-white/80">{perfil}</span>}
              </div>
            </div>
          )}
          {config.titulo?.trim() && <h2 className="text-[clamp(12px,6.4cqmin,52px)] font-black leading-tight" style={{ textShadow: '0 0 24px rgba(176,77,255,.7)' }}>{config.titulo}</h2>}
          {config.texto?.trim() && <p className="line-clamp-5 whitespace-pre-line text-[clamp(9px,4cqmin,30px)] leading-snug text-white/90">{config.texto}</p>}
        </div>
        {temQr && <WidgetQRCode conteudo={config.qrConteudo} legenda={config.qrLegenda || 'Siga a gente'} className="w-[24cqmin] flex-shrink-0" />}
      </div>
    </Moldura>
  );
}
