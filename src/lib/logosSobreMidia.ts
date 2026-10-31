// F-217 — as 9 logos da Sobre Mídia (os mesmos 9 arquivos da marca original, com os mesmos nomes) em ALTA DEFINIÇÃO,
// servidas como arquivos fixos do site em /marca/logos-sobre-midia/ (pasta exclusiva do dono/ADM na galeria de mídias).
// Os ícones e a capa foram ampliados 4x por super-resolução (ESRGAN) a partir dos originais, com o nome e a joia refeitos
// nítidos; as logos de nome 3D saem da reconstrução vetorial do F-216. Montadas por scripts/marca/montar-pasta-logos.mjs,
// e recomprime sem perda os dois arquivos maiores (teto de 2 MB por arquivo do site). O ZIP do "Baixar todas" é
// montado no navegador (src/lib/zipSimples.ts).

export type ModeloDaLogo = 'icone' | 'capa' | 'logo';

export interface LogoSobreMidia {
  arquivo: string;
  nome: string;
  modelo: ModeloDaLogo;
  largura: number;
  altura: number;
  /** fundo transparente: a prévia mostra o quadriculado */
  transparente: boolean;
}

export const PASTA_DAS_LOGOS = '/marca/logos-sobre-midia';
/** nome do ZIP do "Baixar todas" (montado no navegador com os 9 arquivos) */
export const ZIP_DAS_LOGOS = 'logos-sobre-midia.zip';

export const MODELOS_DAS_LOGOS: Record<ModeloDaLogo, string> = {
  icone: 'Ícone do app (botão joia)',
  capa: 'Capa / PWA (nome branco)',
  logo: 'Logo (nome 3D)',
};

export const LOGOS_SOBRE_MIDIA: LogoSobreMidia[] = [
  { arquivo: 'mdpi_ic_launcher.webp', nome: 'Ícone do app — pequeno', modelo: 'icone', largura: 192, altura: 192, transparente: true },
  { arquivo: 'xxxhdpi_ic_launcher.webp', nome: 'Ícone do app', modelo: 'icone', largura: 768, altura: 768, transparente: true },
  { arquivo: 'xxxhdpi_ic_launcher_round.webp', nome: 'Ícone do app — redondo', modelo: 'icone', largura: 768, altura: 768, transparente: true },
  { arquivo: 'xxxhdpi_ic_launcher_foreground.webp', nome: 'Ícone do app — arte inteira', modelo: 'icone', largura: 1728, altura: 1728, transparente: false },
  { arquivo: 'pwa-512x512.png', nome: 'Capa do app (PWA)', modelo: 'capa', largura: 1024, altura: 1024, transparente: false },
  { arquivo: 'pwa-maskable-512x512.png', nome: 'Capa do app (PWA) — adaptável', modelo: 'capa', largura: 1024, altura: 1024, transparente: false },
  { arquivo: 'logo-3d.png', nome: 'Logo 3D', modelo: 'logo', largura: 2000, altura: 2000, transparente: true },
  { arquivo: 'logo-3d-white.png', nome: 'Logo 3D — nome branco', modelo: 'logo', largura: 2000, altura: 2000, transparente: true },
  { arquivo: 'logo-sobre-midia.png', nome: 'Logo Sobre Mídia — alta resolução', modelo: 'logo', largura: 3064, altura: 1656, transparente: true },
];

export const urlDaLogo = (l: LogoSobreMidia) => `${PASTA_DAS_LOGOS}/${l.arquivo}`;
export const formatoDaLogo = (l: LogoSobreMidia) => (l.arquivo.endsWith('.webp') ? 'WebP' : 'PNG');

/** A pasta "Logos Sobre Mídia" é exclusiva do dono (owner) e do ADM; nenhum outro perfil a vê na galeria. */
export const veLogosDaMarca = (isOwner: boolean, perfilNome: string | null | undefined) =>
  isOwner || ['OWNER', 'ADMIN'].includes(String(perfilNome ?? '').toUpperCase());
