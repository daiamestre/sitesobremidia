/**
 * Vídeos das pastas de vídeo (F-97) — Pexels (licença Pexels: uso comercial gratuito, sem necessidade de atribuição;
 * mesmo assim o crédito do autor fica na descrição da mídia). Vídeos horizontais para telas 16:9 e verticais para 9:16.
 * Troca semanal (vídeo pesa mais para as telas baixarem). Só MP4 de até 30 s; o robô recusa arquivos acima de 30 MB.
 */
import { semanaDoAno } from '../arte-base.mjs';

export const PASTAS_VIDEO = {
  'videos-esporte': { n: 6, buscas: ['soccer', 'football stadium', 'basketball', 'running athlete', 'volleyball', 'surfing', 'cycling', 'tennis match', 'skateboarding', 'swimming'] },
  turismo: { n: 4, buscas: ['brazil beach', 'rio de janeiro', 'waterfall', 'tropical island', 'mountain landscape', 'city skyline night', 'amazon river'] },
  curiosidades: { n: 4, buscas: ['wildlife', 'underwater ocean', 'nature timelapse', 'birds flying', 'aurora borealis', 'volcano', 'milky way'] },
  humor: { n: 4, buscas: ['funny dog', 'funny cat', 'puppy playing', 'kitten playing', 'dog playing in snow', 'parrot'] },
};
const DURACAO_MAX = 30;

/** Melhor arquivo MP4 para a orientação: HD, lado maior entre 960 e 1920 (leve e nítido). */
export function escolherArquivo(video, orientacao) {
  const ok = (video.video_files ?? []).filter((f) => f.file_type === 'video/mp4' && f.width && f.height && /^https:\/\//.test(f.link)
    && (orientacao === 'landscape' ? f.width >= f.height : f.height > f.width));
  const maior = (f) => Math.max(f.width, f.height);
  const bons = ok.filter((f) => maior(f) >= 960 && maior(f) <= 1920).sort((a, b) => maior(b) - maior(a));
  return bons[0] ?? ok.sort((a, b) => maior(a) - maior(b)).find((f) => maior(f) >= 640) ?? null;
}

async function buscar(chave, termo, orientacao, pagina) {
  const u = `https://api.pexels.com/videos/search?query=${encodeURIComponent(termo)}&orientation=${orientacao}&size=medium&per_page=15&page=${pagina}`;
  const r = await fetch(u, { headers: { Authorization: chave }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`Pexels HTTP ${r.status}`);
  return (await r.json()).videos ?? [];
}

/** { 'videos-esporte': [...], turismo: [...], curiosidades: [...], humor: [...] } — itens de vídeo (uma orientação cada). */
export async function produzirVideos(chave, semana = semanaDoAno()) {
  const out = {};
  for (const [conteudo, cfg] of Object.entries(PASTAS_VIDEO)) {
    const itens = [];
    for (const [orientacao, o] of [['landscape', 'h'], ['portrait', 'v']]) {
      const vistos = new Set();
      let tentativa = 0;
      while (itens.filter((i) => i.orientacoes[0] === o).length < cfg.n && tentativa < 4) {
        const termo = cfg.buscas[(semana + tentativa) % cfg.buscas.length];
        const lista = await buscar(chave, termo, orientacao, (semana % 5) + 1);
        for (const v of lista) {
          if (itens.filter((i) => i.orientacoes[0] === o).length >= cfg.n) break;
          if (vistos.has(v.id) || !v.duration || v.duration > DURACAO_MAX || v.duration < 5) continue;
          const arq = escolherArquivo(v, orientacao);
          if (!arq) continue;
          vistos.add(v.id);
          itens.push({
            chave: `vid-${v.id}`, tipo: 'video', orientacoes: [o],
            nome: `Vídeo — ${termo} (${v.user?.name ?? 'Pexels'})`,
            descricao: `Vídeo de ${v.user?.name ?? 'autor'} no Pexels (licença Pexels). ${v.url ?? ''}`.trim(),
            video: { id: v.id, link: arq.link, duracaoMs: Math.round(v.duration * 1000), thumb: v.image ?? null },
          });
        }
        tentativa++;
      }
    }
    out[conteudo] = itens;
  }
  return out;
}
