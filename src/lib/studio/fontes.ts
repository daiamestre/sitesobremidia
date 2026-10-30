// SOBRE MÍDIA STUDIO — fontes do editor de camadas (F-221). Carregadas do Google Fonts sob demanda; o desenho espera
// a fonte ficar pronta antes de pintar o canvas (a prévia e o PNG saem iguais).

export interface FonteDoStudio { id: string; nome: string; familia: string; pesos: number[]; google: string; fator: number }

const R = "'Arial Black',Impact,sans-serif";
/** fator = largura média de um caractere em "em" (para o modelo caber na coluna antes de medir de verdade) */
export const FONTES_STUDIO: FonteDoStudio[] = [
  { id: 'anton', nome: 'Anton', familia: `'Anton',${R}`, pesos: [400], google: 'Anton', fator: 0.47 },
  { id: 'bebas', nome: 'Bebas Neue', familia: `'Bebas Neue',${R}`, pesos: [400], google: 'Bebas+Neue', fator: 0.4 },
  { id: 'oswald', nome: 'Oswald', familia: `'Oswald',${R}`, pesos: [500, 700], google: 'Oswald:wght@500;700', fator: 0.5 },
  { id: 'archivo-black', nome: 'Archivo Black', familia: `'Archivo Black',${R}`, pesos: [400], google: 'Archivo+Black', fator: 0.72 },
  { id: 'montserrat', nome: 'Montserrat', familia: `'Montserrat',${R}`, pesos: [500, 700, 800, 900], google: 'Montserrat:ital,wght@0,500;0,700;0,800;0,900;1,900', fator: 0.72 },
  { id: 'poppins', nome: 'Poppins', familia: `'Poppins',${R}`, pesos: [500, 600, 700, 800, 900], google: 'Poppins:ital,wght@0,500;0,600;0,700;0,800;0,900;1,800', fator: 0.68 },
  { id: 'fira-condensed', nome: 'Fira Sans Condensed', familia: `'Fira Sans Condensed',${R}`, pesos: [600, 800, 900], google: 'Fira+Sans+Condensed:wght@600;800;900', fator: 0.5 },
  { id: 'roboto-condensed', nome: 'Roboto Condensed', familia: `'Roboto Condensed',${R}`, pesos: [500, 700, 800], google: 'Roboto+Condensed:wght@500;700;800', fator: 0.5 },
  { id: 'russo', nome: 'Russo One', familia: `'Russo One',${R}`, pesos: [400], google: 'Russo+One', fator: 0.66 },
  { id: 'bungee', nome: 'Bungee', familia: `'Bungee',${R}`, pesos: [400], google: 'Bungee', fator: 0.78 },
  { id: 'playfair', nome: 'Playfair Display', familia: `'Playfair Display',Georgia,serif`, pesos: [700, 900], google: 'Playfair+Display:ital,wght@0,700;0,900;1,700', fator: 0.6 },
  { id: 'righteous', nome: 'Righteous', familia: `'Righteous',${R}`, pesos: [400], google: 'Righteous', fator: 0.6 },
  { id: 'baloo', nome: 'Baloo 2', familia: `'Baloo 2',${R}`, pesos: [600, 800], google: 'Baloo+2:wght@600;800', fator: 0.6 },
  { id: 'lobster', nome: 'Lobster', familia: `'Lobster',cursive`, pesos: [400], google: 'Lobster', fator: 0.5 },
  { id: 'pacifico', nome: 'Pacifico', familia: `'Pacifico',cursive`, pesos: [400], google: 'Pacifico', fator: 0.62 },
];

export const fonteDoStudio = (id: string | null | undefined) => FONTES_STUDIO.find((f) => f.id === id) ?? FONTES_STUDIO[0];

/** Peso válido mais próximo do pedido (a fonte só tem alguns pesos carregados). */
export function pesoDaFonte(id: string, peso?: number) {
  const f = fonteDoStudio(id);
  const alvo = peso ?? Math.max(...f.pesos);
  return f.pesos.reduce((a, b) => (Math.abs(b - alvo) < Math.abs(a - alvo) ? b : a), f.pesos[0]);
}

export const fonteCanvas = (id: string, tamanho: number, peso?: number, italico = false) =>
  `${italico ? 'italic ' : ''}${pesoDaFonte(id, peso)} ${Math.max(1, Math.round(tamanho))}px ${fonteDoStudio(id).familia}`;

const pedidas = new Map<string, Promise<void>>();
/** Injeta o CSS do Google Fonts (uma vez) e espera os pesos ficarem prontos para o canvas. */
export function carregarFonteStudio(id: string): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  const f = fonteDoStudio(id);
  let p = pedidas.get(f.id);
  if (!p) {
    const href = `https://fonts.googleapis.com/css2?family=${f.google}&display=swap`;
    if (!document.querySelector(`link[href="${href}"]`)) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      document.head.appendChild(l);
    }
    p = Promise.all(f.pesos.map((w) => document.fonts?.load(`${w} 40px ${f.familia}`).catch(() => []) ?? Promise.resolve([]))).then(() => undefined);
    pedidas.set(f.id, p);
  }
  return p;
}
