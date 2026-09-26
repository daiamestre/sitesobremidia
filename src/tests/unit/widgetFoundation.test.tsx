import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { chaveDoFundo, copiaDoWidget, templateDoWidget, widgetsQueUsamFundo, WIDGET_TEMPLATES } from '@/lib/widgetCatalog';
import { WidgetList } from '@/components/dashboard/widgets/WidgetList';
import { WidgetCatalog } from '@/components/dashboard/widgets/WidgetCatalog';
import type { Widget } from '@/types/models';

const URL_AZUL = 'https://pub-x.r2.dev/u1/widgets/widget_1_azul.jpg';
const W = (id: string, name: string, config: Widget['config'], is_active = true): Widget =>
  ({ id, name, widget_type: 'clock', config, is_active, thumbnail_url: config.backgroundImageLandscape ?? null } as Widget);

describe('Widget Engine W2 — fundação', () => {
  it('Galeria de Widgets: só modelos que o Player desenha podem ser criados; os demais ficam "Em breve"', () => {
    const ids = WIDGET_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const prontos = WIDGET_TEMPLATES.filter((t) => t.noPlayer).map((t) => t.id).sort();
    expect(prontos).toEqual(['advertising-campanha', 'clock-classic', 'clock-futurista', 'instagram-post', 'institutional-aviso', 'offer-destaque', 'rss-classic', 'social-post', 'weather-classic', 'weather-futurista', 'youtube-video']);
  });

  it('widget antigo (sem config.template) é tratado como o modelo clássico do tipo', () => {
    expect(templateDoWidget('clock', {})?.id).toBe('clock-classic');
    expect(templateDoWidget('weather', { template: 'weather-futurista' })?.id).toBe('weather-futurista');
  });

  it('o fundo é identificado pelo arquivo (um arquivo, vários widgets)', () => {
    expect(chaveDoFundo(URL_AZUL)).toBe('u1/widgets/widget_1_azul.jpg');
    expect(chaveDoFundo('não é url')).toBeNull();
    const ws = [
      W('a', 'Relógio Loja', { backgroundImageLandscape: URL_AZUL }),
      W('b', 'Clima Loja', { backgroundImagePortrait: URL_AZUL }),
      W('c', 'Sem fundo', {}),
    ];
    expect(widgetsQueUsamFundo(ws, 'u1/widgets/widget_1_azul.jpg').map((w) => w.name)).toEqual(['Relógio Loja', 'Clima Loja']);
    expect(widgetsQueUsamFundo(ws, 'u1/widgets/outro.jpg')).toEqual([]);
  });

  it('duplicar copia configuração e referência do fundo, sem compartilhar o objeto', () => {
    const orig = W('a', 'Relógio', { showSeconds: true, backgroundImageLandscape: URL_AZUL });
    const copia = copiaDoWidget(orig);
    expect(copia.name).toBe('Relógio (cópia)');
    expect(copia.config.backgroundImageLandscape).toBe(URL_AZUL);
    copia.config.showSeconds = false;
    expect(orig.config.showSeconds).toBe(true);
  });

  it('Meus Widgets: prévia, editar, duplicar, excluir e ativar/desativar', () => {
    const onDuplicate = vi.fn(), onPreview = vi.fn(), onToggle = vi.fn(), onEdit = vi.fn(), onDelete = vi.fn();
    render(<WidgetList widgets={[W('a', 'Relógio Loja', { backgroundImageLandscape: URL_AZUL })]} onEdit={onEdit} onDelete={onDelete}
      onDuplicate={onDuplicate} onPreview={onPreview} onToggleActive={onToggle} />);
    const card = screen.getByTestId('widget-a');
    expect(within(card).getByText('Relógio + Data')).toBeInTheDocument();
    expect(within(card).getByText('Imagem da galeria')).toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: 'Duplicar' }));
    fireEvent.click(within(card).getByRole('button', { name: 'Prévia' }));
    fireEvent.click(within(card).getByRole('switch'));
    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), false);
  });

  it('Galeria de Widgets: "Usar este modelo" só nos disponíveis', () => {
    const onUsar = vi.fn();
    render(<WidgetCatalog onUsar={onUsar} />);
    fireEvent.click(within(screen.getByTestId('template-clock-classic')).getByRole('button', { name: 'Usar este modelo' }));
    expect(onUsar).toHaveBeenCalledWith(expect.objectContaining({ id: 'clock-classic', tipo: 'clock' }));
    // W9: os 11 modelos já são desenhados pelo Player — nenhum fica desabilitado
    expect(WIDGET_TEMPLATES.every((t) => !within(screen.getByTestId(`template-${t.id}`)).getByRole('button').hasAttribute('disabled'))).toBe(true);
  });
});
