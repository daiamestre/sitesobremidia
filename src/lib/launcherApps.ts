/**
 * F-200 — mesma regra do Player (LauncherPolicy.appOculto): o app fica fora da launcher Sobre Mídia quando o pacote ou
 * o nome contém uma regra de "ocultos" (ou casa com "re:<expressão>"), a menos que caia numa regra de "liberados".
 */
export const OCULTOS_PADRAO = [
  'youtube', 'netflix', 'com.amazon.avod', 'primevideo', 'prime video', 'disney', 'globoplay', 'com.globo', 'hbo',
  'com.wbd', 'paramount', 'pluto', 'twitch', 'starplus', 'crunchyroll', 'iptv', 'kodi', 'xbmc', 'livechannels',
  're:\\btv\\b',
];

function casa(regra: string, pacote: string, nome: string): boolean {
  const r = regra.trim().toLowerCase();
  if (!r) return false;
  if (r.startsWith('re:')) {
    try {
      const re = new RegExp(r.slice(3), 'i');
      return re.test(pacote) || re.test(nome);
    } catch {
      return false;
    }
  }
  return pacote.toLowerCase().includes(r) || nome.toLowerCase().includes(r);
}

export function appOcultoNaLauncher(pacote: string, nome: string, ocultos: string[], liberados: string[]): boolean {
  if (liberados.some((l) => casa(l, pacote, nome))) return false;
  return ocultos.some((o) => casa(o, pacote, nome));
}

/** Regra que esconde o app (para mostrar ao dono o porquê). */
export function regraQueOculta(pacote: string, nome: string, ocultos: string[]): string | null {
  return ocultos.find((o) => casa(o, pacote, nome)) ?? null;
}

/** Texto amigável da regra ("re:\btv\b" → "apps de TV"). */
export function nomeDaRegra(regra: string): string {
  if (regra === 're:\\btv\\b') return 'apps de TV (nome com "TV")';
  return regra.startsWith('re:') ? `expressão ${regra.slice(3)}` : regra;
}
