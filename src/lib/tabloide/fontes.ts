/**
 * Cartaz Digital (F-179) — fontes que o cliente pode escolher para cada parte do cartaz
 * (título do produto, etiqueta de preço, mensagem promocional e rodapé).
 * São famílias abertas do Google Fonts, carregadas só quando escolhidas; "Padrão" usa a fonte do aparelho.
 */

export interface FonteCartaz {
  id: string;
  nome: string;
  /** valor de font-family (com reservas) */
  familia: string;
  peso: number;
  estilo: 'normal' | 'italic';
  /** trecho da URL do Google Fonts (ausente = fonte do sistema) */
  google?: string;
}

const RESERVA = "'Arial Black','Segoe UI Black',Impact,system-ui,sans-serif";

export const FONTES: FonteCartaz[] = [
  { id: 'padrao', nome: 'Padrão (Arial Black)', familia: RESERVA, peso: 900, estilo: 'normal' },
  { id: 'open-sans', nome: 'Open Sans', familia: `'Open Sans',${RESERVA}`, peso: 800, estilo: 'normal', google: 'Open+Sans:wght@800' },
  { id: 'fira-condensed', nome: 'Fira Sans Condensed', familia: `'Fira Sans Condensed',${RESERVA}`, peso: 900, estilo: 'normal', google: 'Fira+Sans+Condensed:wght@900' },
  { id: 'mplus-rounded', nome: 'M PLUS Rounded 1c', familia: `'M PLUS Rounded 1c',${RESERVA}`, peso: 900, estilo: 'normal', google: 'M+PLUS+Rounded+1c:wght@900' },
  { id: 'montserrat', nome: 'Montserrat', familia: `'Montserrat',${RESERVA}`, peso: 900, estilo: 'normal', google: 'Montserrat:ital,wght@0,900;1,900' },
  { id: 'montserrat-italico', nome: 'Montserrat Itálico', familia: `'Montserrat',${RESERVA}`, peso: 900, estilo: 'italic', google: 'Montserrat:ital,wght@0,900;1,900' },
  { id: 'saira-italico', nome: 'Saira Itálico', familia: `'Saira',${RESERVA}`, peso: 700, estilo: 'italic', google: 'Saira:ital,wght@1,700' },
  { id: 'poppins', nome: 'Poppins', familia: `'Poppins',${RESERVA}`, peso: 900, estilo: 'normal', google: 'Poppins:wght@900' },
  { id: 'anton', nome: 'Anton', familia: `'Anton',${RESERVA}`, peso: 400, estilo: 'normal', google: 'Anton' },
  { id: 'bebas', nome: 'Bebas Neue', familia: `'Bebas Neue',${RESERVA}`, peso: 400, estilo: 'normal', google: 'Bebas+Neue' },
  { id: 'oswald', nome: 'Oswald', familia: `'Oswald',${RESERVA}`, peso: 700, estilo: 'normal', google: 'Oswald:wght@700' },
  { id: 'archivo-black', nome: 'Archivo Black', familia: `'Archivo Black',${RESERVA}`, peso: 400, estilo: 'normal', google: 'Archivo+Black' },
  { id: 'baloo', nome: 'Baloo 2', familia: `'Baloo 2',${RESERVA}`, peso: 800, estilo: 'normal', google: 'Baloo+2:wght@800' },
  { id: 'roboto-condensed', nome: 'Roboto Condensed', familia: `'Roboto Condensed',${RESERVA}`, peso: 700, estilo: 'normal', google: 'Roboto+Condensed:wght@700' },
];

export const fontePorId = (id: string | null | undefined): FonteCartaz => FONTES.find((f) => f.id === id) ?? FONTES[0];

/** Estilo CSS da fonte (para os textos do cartaz). */
export function cssDaFonte(id: string | null | undefined): { fontFamily: string; fontWeight: number; fontStyle: 'normal' | 'italic' } {
  const f = fontePorId(id);
  return { fontFamily: f.familia, fontWeight: f.peso, fontStyle: f.estilo };
}

/** Texto de fonte para o canvas (selo de preço): "italic 900 48px 'Montserrat',…". */
export function fonteDeCanvas(id: string | null | undefined, tamanho: number): string {
  const f = fontePorId(id);
  return `${f.estilo === 'italic' ? 'italic ' : ''}${f.peso} ${tamanho}px ${f.familia}`;
}

export interface FiltroDeFontes { peso?: number | null; estilo?: 'normal' | 'italic' | null; nome?: string }

export function filtrarFontes(filtro: FiltroDeFontes): FonteCartaz[] {
  const q = (filtro.nome ?? '').trim().toLowerCase();
  return FONTES.filter((f) => (!filtro.peso || f.peso === filtro.peso) && (!filtro.estilo || f.estilo === filtro.estilo) && (!q || f.nome.toLowerCase().includes(q)));
}

const pedidas = new Map<string, Promise<void>>();

/** Carrega a fonte (uma vez) e espera ela ficar pronta para desenhar. Nunca rejeita: sem internet, fica a fonte padrão. */
export function carregarFonte(id: string | null | undefined): Promise<void> {
  const f = fontePorId(id);
  if (!f.google || typeof document === 'undefined') return Promise.resolve();
  const ja = pedidas.get(f.id);
  if (ja) return ja;
  const p = new Promise<void>((ok) => {
    const href = `https://fonts.googleapis.com/css2?family=${f.google}&display=swap`;
    const pronto = () => {
      const nome = f.familia.split(',')[0];
      const espera = document.fonts?.load ? document.fonts.load(`${f.estilo === 'italic' ? 'italic ' : ''}${f.peso} 32px ${nome}`) : Promise.resolve([]);
      Promise.race([espera, new Promise((r) => setTimeout(r, 4000))]).then(() => ok(), () => ok());
    };
    if (document.querySelector(`link[data-fonte-cartaz="${f.id}"]`)) { pronto(); return; }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute('data-fonte-cartaz', f.id);
    link.onload = pronto;
    link.onerror = () => ok();
    document.head.appendChild(link);
    setTimeout(() => ok(), 6000);
  });
  pedidas.set(f.id, p);
  return p;
}
