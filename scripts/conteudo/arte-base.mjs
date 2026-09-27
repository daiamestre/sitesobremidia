/**
 * Base visual das artes automáticas (F-95): moldura SOBRE MÍDIA, selo, fontes e utilidades. Tudo em px da arte final
 * (1920x1080 ou 1080x1920). As artes nunca levam logotipo de terceiros; a fonte do conteúdo vai no crédito.
 */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Corta no fim de uma palavra, com reticências. */
export function cortar(s, max) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const c = t.slice(0, max);
  return c.slice(0, Math.max(c.lastIndexOf(' '), max * 0.6)).replace(/[,.;:\s]+$/, '') + '…';
}

/** Página base: fundo (gradiente ou foto), topo com a marca e o selo, corpo livre. */
export function pagina({ w, h, fundo, selo, corpo, css = '', escuro = 0.35 }) {
  const v = h > w;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800;900&display=block" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${w}px;height:${h}px;overflow:hidden}
body{font-family:Montserrat,Arial,sans-serif;color:#fff;background:${fundo};position:relative}
.veu{position:absolute;inset:0;background:linear-gradient(180deg, rgba(0,0,0,${escuro}) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 45%, rgba(0,0,0,${Math.min(0.92, escuro + 0.5)}) 100%)}
.moldura{position:relative;height:100%;display:flex;flex-direction:column;padding:${v ? '80px 70px' : '64px 90px'}}
.topo{display:flex;justify-content:space-between;align-items:center;gap:20px}
.marca{font-weight:800;letter-spacing:.3em;font-size:${v ? 34 : 30}px;text-shadow:0 2px 10px rgba(0,0,0,.4)}
.selo{background:#FFD400;color:#1a1033;font-weight:900;letter-spacing:.12em;font-size:${v ? 32 : 28}px;padding:14px 32px;border-radius:999px;white-space:nowrap}
.legal{font-weight:600;font-size:${v ? 24 : 22}px;opacity:.75}
${css}
</style></head><body><div class="veu"></div><div class="moldura">
<div class="topo"><span class="marca">SOBRE MÍDIA</span><span class="selo">${esc(selo)}</span></div>
${corpo}
</div></body></html>`;
}

export const GRADIENTES = {
  roxo: 'radial-gradient(circle at 85% 12%, #7b3cff 0%, #3a0ca3 45%, #0d0628 100%)',
  azul: 'radial-gradient(circle at 85% 12%, #1e88e5 0%, #0d47a1 50%, #03102b 100%)',
  verde: 'radial-gradient(circle at 85% 12%, #22c55e 0%, #0f5132 55%, #04140c 100%)',
  laranja: 'radial-gradient(circle at 85% 12%, #ff9f1c 0%, #c2410c 55%, #2a0d02 100%)',
  rosa: 'radial-gradient(circle at 85% 12%, #ff4fa3 0%, #9d174d 55%, #22030f 100%)',
  turquesa: 'radial-gradient(circle at 85% 12%, #14b8a6 0%, #0f766e 55%, #03201d 100%)',
  vinho: 'radial-gradient(circle at 85% 12%, #e11d48 0%, #7f1d1d 55%, #1f0508 100%)',
  dourado: 'radial-gradient(circle at 85% 12%, #f59e0b 0%, #92400e 55%, #1f1002 100%)',
};

/** Semana ISO (para rodízio semanal dos bancos de conteúdo próprio). */
export function semanaDoAno(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dia = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dia);
  const ini = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return t.getUTCFullYear() * 100 + Math.ceil(((t - ini) / 86400e3 + 1) / 7);
}

/** `n` itens do banco para esta semana (rodízio: todas as semanas avançam `n` posições, dando a volta). */
export function daSemana(banco, n, semana = semanaDoAno()) {
  if (!banco.length) return [];
  const ini = (semana * n) % banco.length;
  return Array.from({ length: Math.min(n, banco.length) }, (_, k) => banco[(ini + k) % banco.length]);
}
