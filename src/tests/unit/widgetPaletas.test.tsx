import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Relógio/Clima desenhados ao vivo: hora e clima sem rede no teste
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: async () => ({ data: null, error: { message: 'offline' } }) } }));
vi.mock('@/lib/weatherData', async () => ({ ...(await vi.importActual<object>('@/lib/weatherData')), buscarClima: async () => null, nomeDoLocal: async () => null }));

import {
  contrasteComBranco, coresDoConfig, escolhaDePaleta, hexValido, paletaPersonalizada, PALETA_PADRAO, PALETA_PERSONALIZADA, PALETAS,
} from '@/lib/widgetPaletas';
import { PaletaPicker } from '@/components/dashboard/widgets/PaletaPicker';
import { CapaWidget } from '@/components/dashboard/widgets/CapaWidget';
import { WidgetPreview } from '@/components/dashboard/widgets/WidgetPreview';
import { ClockFuturista } from '@/components/player/ClockFuturista';

const CAMPOS = ['c1', 'c2', 'c3', 'brilho', 'selo', 'seloTexto'] as const;

describe('Paletas do Relógio/Clima Futurista', () => {
  it('paletas prontas: ids únicos, cores válidas, padrão = roxo SOBRE MÍDIA e texto branco legível', () => {
    expect(new Set(PALETAS.map((p) => p.id)).size).toBe(PALETAS.length);
    expect(PALETAS.length).toBeGreaterThanOrEqual(8);
    expect(PALETAS[0]).toMatchObject({ id: PALETA_PADRAO, c1: '#22004A', c2: '#5D1BFF', c3: '#8A2EFF' });
    for (const p of PALETAS) {
      CAMPOS.forEach((k) => expect(hexValido(p[k]), `${p.id}.${k}`).toBe(true));
      // hora/temperatura brancas sobre o gradiente: contraste de texto grande (>= 3:1) nos tons do meio e do fim
      expect(contrasteComBranco(p.c2), `${p.id}.c2`).toBeGreaterThanOrEqual(3);
      expect(contrasteComBranco(p.c3), `${p.id}.c3`).toBeGreaterThanOrEqual(3);
    }
  });

  it('Personalizada: qualquer cor vira uma paleta legível (amarelo, branco, verde-limão e preto incluídos)', () => {
    for (const cor of ['#FFFF00', '#FFFFFF', '#AAFF00', '#000000', '#FF6A00', '#00E5FF', '#7F7F7F']) {
      const p = paletaPersonalizada(cor);
      CAMPOS.forEach((k) => expect(hexValido(p[k]), `${cor}.${k}`).toBe(true));
      expect(contrasteComBranco(p.c1), `${cor}.c1`).toBeGreaterThanOrEqual(7);
      expect(contrasteComBranco(p.c2), `${cor}.c2`).toBeGreaterThanOrEqual(4.5);
      expect(contrasteComBranco(p.c3), `${cor}.c3`).toBeGreaterThanOrEqual(3.5);
    }
    expect(paletaPersonalizada('#FFFF00').selo).toBe('#FFFFFF'); // selo amarelo sumiria num fundo amarelado
  });

  it('config -> cores: paleta pronta, personalizada, cores gravadas ou padrão', () => {
    expect(coresDoConfig({ paleta: 'oceano' }).c1).toBe('#031B4E');
    expect(coresDoConfig({ paleta: PALETA_PERSONALIZADA, corBase: '#FF6A00' })).toEqual(escolhaDePaleta(PALETA_PERSONALIZADA, '#FF6A00').cores);
    const gravadas = { c1: '#010203', c2: '#111111', c3: '#222222', brilho: '#333333', selo: '#444444', seloTexto: '#555555' };
    expect(coresDoConfig({ cores: gravadas })).toEqual(gravadas);
    expect(coresDoConfig({ cores: { ...gravadas, c2: 'azul' } }).c1).toBe('#22004A');
    expect(coresDoConfig(undefined).c1).toBe('#22004A');
    // escolher uma paleta pronta limpa a cor personalizada e grava as cores que o Player lê
    expect(escolhaDePaleta('rubi')).toEqual({ paleta: 'rubi', corBase: undefined, cores: expect.objectContaining({ c1: '#3B0010' }) });
  });
});

describe('Cores na tela', () => {
  it('seletor: 9 paletas + Personalizada; clicar grava a paleta e as cores', () => {
    const onChange = vi.fn();
    render(<PaletaPicker config={{ paleta: 'sobremidia' }} onChange={onChange} />);
    expect(screen.getAllByRole('radio')).toHaveLength(PALETAS.length + 1);
    expect(screen.getByRole('radio', { name: 'Roxo SOBRE MÍDIA' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: 'Azul Oceano' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ paleta: 'oceano', cores: expect.objectContaining({ c1: '#031B4E' }) }));
    fireEvent.change(screen.getByTestId('paleta-cor-input'), { target: { value: '#ff6a00' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ paleta: PALETA_PERSONALIZADA, corBase: '#FF6A00' }));
  });

  it('Relógio Futurista usa as cores escolhidas (selo com a cor da paleta)', () => {
    render(<ClockFuturista cores={coresDoConfig({ paleta: 'oceano' })} />);
    const selo = screen.getByText('HORÁRIO DE BRASÍLIA');
    expect(selo.style.color).toBe('rgb(3, 27, 78)'); // #031B4E
    expect(selo.style.background).toContain('rgb(255, 212, 0)');
  });

  it('capa: imagem de fundo; sem imagem, o próprio widget (todos os tipos); tipo desconhecido -> nada', () => {
    const { unmount } = render(<CapaWidget widgetType="clock" config={{ backgroundImageLandscape: 'https://r2/f.jpg' }} nome="R" />);
    expect(screen.getByTestId('capa-imagem')).toHaveAttribute('src', 'https://r2/f.jpg');
    unmount();
    const r2 = render(<CapaWidget widgetType="weather" config={{ paleta: 'esmeralda' }} nome="C" />);
    expect(screen.getByTestId('capa-clima')).toBeInTheDocument();
    r2.unmount();
    const r3 = render(<CapaWidget widgetType="rss" config={{}} nome="N" />);
    expect(screen.getByTestId('capa-noticias')).toBeInTheDocument();
    r3.unmount();
    const { container } = render(<CapaWidget widgetType="tipo-inexistente" config={{}} nome="X" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('prévia: cores na lateral só no formulário e só para Relógio/Clima; relógio antigo aparece Futurista', () => {
    const onConfigChange = vi.fn();
    const { rerender } = render(<WidgetPreview widgetType="clock" config={{ template: 'clock-classic' }} editOrientation="landscape" onConfigChange={onConfigChange} />);
    expect(screen.getByTestId('paleta-picker')).toBeInTheDocument();
    expect(screen.getByTestId('clock-futurista')).toBeInTheDocument();
    rerender(<WidgetPreview widgetType="clock" config={{}} editOrientation="landscape" />); // prévia de Meus Widgets
    expect(screen.queryByTestId('paleta-picker')).toBeNull();
    rerender(<WidgetPreview widgetType="rss" config={{}} editOrientation="landscape" onConfigChange={onConfigChange} />);
    expect(screen.queryByTestId('paleta-picker')).toBeNull();
  });
});
