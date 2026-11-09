/**
 * F-276 — o que NÃO é produto de encarte (ordem do dono: só embalagem oficial do produto). Usado na entrada do catálogo
 * (marca-varejo.mjs e marca-oficial.mjs gravar). A mesma regra limpou o catálogo: scripts/ops/limpeza-catalogo-276.sql.
 */
const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const NAO_E = /(^|[^a-z])(shorts?|calca|camisetas?|camisa|regata|cropped|legging|bermuda|jaqueta|moletom|bone|sacolas?|sacolinha|ebooks?|lojas parceiras|your browser|planeta mais limpo|o que e|touca|turbante|pincel|necessaire|coqueteleira|garrafa termica|toalha|chaveiro|brinde|vale presente|gift card|cartao presente|mochila|carteira|oculos|relogio|chinelo|tenis|catalogo|folheto|revista|cupom|assinatura|curso|consultoria|frete|embalagem presente|papel presente|kits?|combo)([^a-z]|$)/;
const EXCECAO = /(short rib|t-?bone|tinta de cabelo|kit paella|kit salgados)/;
export const naoEProduto = (nome) => { const n = semAcento(nome); return NAO_E.test(n) && !EXCECAO.test(n); };
