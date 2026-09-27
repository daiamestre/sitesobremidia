/**
 * F-92 — a prévia do painel tem de ser a tela do Player, só que menor. O Android Player desenha tudo em proporção ao
 * menor lado da tela (base * fator); na web, 1cqmin = 1% do menor lado do widget. Limite em pixels (clamp(8px, …, 22px))
 * ou espaçamento em % da largura distorce a prévia pequena: textos maiores que o quadro, etiquetas quebrando de linha e
 * a previsão dos dias cortada (caso do Clima Futurista relatado pelo proprietário).
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const PASTA = path.resolve(__dirname, '../../components/player');
const WIDGETS = ['AdvertisingWidget', 'ClockFuturista', 'InstitutionalWidget', 'OfferWidget', 'SocialWidget', 'WeatherFuturista',
  'WidgetQRCode', 'YouTubeWidget', 'SportsWidget', 'SportsNewsWidget'];

describe('widgets: prévia = Player (só proporção, sem limites em pixels)', () => {
  for (const w of WIDGETS) {
    it(w, () => {
      const src = fs.readFileSync(path.join(PASTA, `${w}.tsx`), 'utf8');
      expect(src.match(/clamp\([^)]*px[^)]*\)/g) ?? [], 'limite em pixels no tamanho').toEqual([]);
      expect(src.match(/\bp[xytrbl]?-\[\d+(\.\d+)?%\]/g) ?? [], 'espaçamento interno em % da largura').toEqual([]);
    });
  }
});
