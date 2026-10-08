/**
 * Vídeos das pastas de vídeo (F-97/F-98; F-163: a pasta Vídeos Esporte acabou e não é mais abastecida) — Pexels e Pixabay (licenças de uso comercial gratuito; o crédito do autor
 * fica na descrição da mídia). Os arquivos são baixados e hospedados no nosso R2 (nunca link direto para o site de
 * origem). Vídeos horizontais para telas 16:9 e verticais para 9:16. Troca semanal. Só MP4 de 5 a 30 s, até 30 MB.
 */
import { semanaDoAno } from '../arte-base.mjs';

/** Por pasta: quantos vídeos de cada fonte POR ORIENTAÇÃO e os termos de busca (a semana escolhe o termo e a página). */
export const PASTAS_VIDEO = {
  turismo: {
    pexels: { n: 4, buscas: ['brazil beach', 'rio de janeiro', 'waterfall', 'tropical island', 'mountain landscape', 'city skyline night', 'amazon river'] },
    pixabay: { n: 2, buscas: ['beach', 'travel', 'brazil', 'waterfall', 'landscape'] },
  },
  curiosidades: {
    pexels: { n: 4, buscas: ['wildlife', 'underwater ocean', 'nature timelapse', 'birds flying', 'aurora borealis', 'volcano', 'milky way'] },
    pixabay: { n: 2, buscas: ['nature', 'animals', 'space', 'ocean', 'timelapse'] },
  },
  humor: {
    pexels: { n: 4, buscas: ['funny dog', 'funny cat', 'puppy playing', 'kitten playing', 'dog playing in snow', 'parrot'] },
    pixabay: { n: 2, buscas: ['funny dog', 'funny cat', 'puppy', 'kitten'] },
  },
  cinema: {
    pixabay: { n: 3, buscas: ['cinema', 'popcorn', 'film projector', 'movie theater', 'film reel'] },
  },
  nostalgia: {
    pixabay: { n: 3, buscas: ['retro', 'vintage', 'old television', 'vinyl record', 'cassette tape', 'old camera'] },
  },
};
const DURACAO_MIN = 5;
const DURACAO_MAX = 30;
const MAX_BYTES = 30 * 1024 * 1024;

/** Pexels: melhor MP4 na orientação, lado maior entre 960 e 1920 (leve e nítido). */
export function escolherArquivo(video, orientacao) {
  const ok = (video.video_files ?? []).filter((f) => f.file_type === 'video/mp4' && f.width && f.height && /^https:\/\//.test(f.link)
    && (orientacao === 'landscape' ? f.width >= f.height : f.height > f.width));
  const maior = (f) => Math.max(f.width, f.height);
  const bons = ok.filter((f) => maior(f) >= 960 && maior(f) <= 1920).sort((a, b) => maior(b) - maior(a));
  return bons[0] ?? ok.sort((a, b) => maior(a) - maior(b)).find((f) => maior(f) >= 640) ?? null;
}

/** Pixabay: entre large/medium/small/tiny, o maior com lado ≤ 1920, ≥ 960 e até 30 MB, na orientação pedida. */
export function escolherPixabay(hit, orientacao) {
  const vs = Object.values(hit.videos ?? {}).filter((f) => f && /^https:\/\//.test(f.url ?? '') && f.width && f.height && f.size > 0
    && (orientacao === 'landscape' ? f.width >= f.height : f.height > f.width));
  const maior = (f) => Math.max(f.width, f.height);
  return vs.filter((f) => maior(f) <= 1920 && maior(f) >= 960 && f.size <= MAX_BYTES).sort((a, b) => maior(b) - maior(a))[0] ?? null;
}

async function obter(url, cabecalhos, rotulo) {
  let ultimo = '';
  for (let t = 1; t <= 3; t++) {
    try {
      const r = await fetch(url, { headers: cabecalhos, signal: AbortSignal.timeout(20000) });
      if (r.ok) return await r.json();
      ultimo = `HTTP ${r.status}`;
      if (r.status === 400 || r.status === 401 || r.status === 403) break; // chave inválida: não adianta repetir
    } catch (e) { ultimo = e.message; }
    await new Promise((ok) => setTimeout(ok, 1500 * t));
  }
  console.log(`  ${rotulo}: ${ultimo} — tenta o próximo termo`);
  return null;
}

async function dePexels(chave, cfg, orientacao, o, semana, itens) {
  const vistos = new Set();
  const conta = () => itens.filter((i) => i.fonte === 'pexels' && i.orientacoes[0] === o).length;
  for (let tentativa = 0; conta() < cfg.n && tentativa < 6; tentativa++) {
    const termo = cfg.buscas[(semana + tentativa) % cfg.buscas.length];
    const j = await obter(`https://api.pexels.com/videos/search?query=${encodeURIComponent(termo)}&orientation=${orientacao}&size=medium&per_page=15&page=${(semana % 5) + 1}`,
      { Authorization: chave }, `Pexels "${termo}" (${orientacao})`);
    for (const v of j?.videos ?? []) {
      if (conta() >= cfg.n) break;
      if (vistos.has(v.id) || !v.duration || v.duration > DURACAO_MAX || v.duration < DURACAO_MIN) continue;
      const arq = escolherArquivo(v, orientacao);
      if (!arq) continue;
      vistos.add(v.id);
      itens.push({ chave: `vid-${v.id}`, fonte: 'pexels', tipo: 'video', orientacoes: [o], nome: `Vídeo — ${termo} (${v.user?.name ?? 'Pexels'})`,
        descricao: `Vídeo de ${v.user?.name ?? 'autor'} no Pexels (licença Pexels). ${v.url ?? ''}`.trim(),
        video: { id: v.id, link: arq.link, duracaoMs: Math.round(v.duration * 1000), thumb: v.image ?? null } });
    }
  }
}

async function dePixabay(chave, cfg, orientacao, o, semana, itens) {
  const vistos = new Set();
  const conta = () => itens.filter((i) => i.fonte === 'pixabay' && i.orientacoes[0] === o).length;
  for (let tentativa = 0; conta() < cfg.n && tentativa < 6; tentativa++) {
    const termo = cfg.buscas[(semana + tentativa) % cfg.buscas.length];
    const j = await obter(`https://pixabay.com/api/videos/?key=${encodeURIComponent(chave)}&q=${encodeURIComponent(termo)}&safesearch=true&video_type=film&per_page=30&page=${(semana % 4) + 1}`,
      {}, `Pixabay "${termo}" (${orientacao})`);
    for (const v of j?.hits ?? []) {
      if (conta() >= cfg.n) break;
      if (vistos.has(v.id) || !v.duration || v.duration > DURACAO_MAX || v.duration < DURACAO_MIN) continue;
      const arq = escolherPixabay(v, orientacao);
      if (!arq) continue;
      vistos.add(v.id);
      itens.push({ chave: `pxb-${v.id}`, fonte: 'pixabay', tipo: 'video', orientacoes: [o], nome: `Vídeo — ${termo} (${v.user ?? 'Pixabay'})`,
        descricao: `Vídeo de ${v.user ?? 'autor'} no Pixabay (licença Pixabay). ${v.pageURL ?? ''}`.trim(),
        video: { id: `pixabay-${v.id}`, link: arq.url, duracaoMs: Math.round(v.duration * 1000), thumb: arq.thumbnail ?? null } });
    }
  }
}

/** { pasta: [itens de vídeo (uma orientação cada)] } das duas fontes (a que não tiver chave é ignorada). */
export async function produzirVideos({ pexels, pixabay }, semana = semanaDoAno()) {
  const out = {};
  for (const [conteudo, cfg] of Object.entries(PASTAS_VIDEO)) {
    const itens = [];
    for (const [orientacao, o] of [['landscape', 'h'], ['portrait', 'v']]) {
      if (pexels && cfg.pexels) await dePexels(pexels, cfg.pexels, orientacao, o, semana, itens);
      if (pixabay && cfg.pixabay) await dePixabay(pixabay, cfg.pixabay, orientacao, o, semana, itens);
    }
    out[conteudo] = itens;
  }
  // fontes fora do ar (nenhum vídeo em pasta nenhuma): falha — as pastas de vídeo ficam como estão nesta rodada
  if (Object.values(out).every((l) => l.length === 0)) throw new Error('fontes de vídeo indisponíveis (nenhum vídeo encontrado)');
  return out;
}
