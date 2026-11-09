/**
 * Missão do catálogo: entra no catálogo a imagem oficial publicada pela própria marca, sem recorte nem IA.
 *   node scripts/ops/marca-oficial.mjs preparar <pasta da marca> <Marca>    corta a sobra transparente e grava em <pasta>/pronto
 *   node scripts/ops/marca-oficial.mjs gravar <pasta da marca> <Marca>      cadastra POR LINK (F-272: sem cópia no R2); --copia envia ao R2
 * <pasta>/produtos.json: [{ slug, titulo, pagina, url, arq, peso, codigo?, segmento? }]. Quem sai vai em <pasta>/recusados.txt (slugs).
 * O código de barras fica no nome do arquivo, nos dados internos da imagem e no catálogo; nunca é desenhado na embalagem.
 * Só usar código com casamento exato de produto e peso: código errado mostra o produto errado no leitor.
 */
import fs from 'node:fs';
import { R2_PUBLICO } from './segredos.mjs';
import { chaveCanonica } from '../../src/lib/tabloide/chave.ts';
import { enviar, sharp, sqlBruto } from './recorte-do-catalogo.mjs';
import { linkDaFoto } from './passa-foto.mjs';
import { naoEProduto } from './nao-e-produto.mjs';

const EMPRESAS = (process.env.TABLOIDE_EMPRESAS ?? '7d62aaec-e24d-4273-b257-867183cf658c,22345678-1234-1234-1234-123456789012').split(',');
const LICENCA = 'Imagem publicada pela marca; sem autorização formal registrada';
const [modo, pasta, marca] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const COPIA = process.argv.includes('--copia');
if (!['preparar', 'gravar'].includes(modo) || !pasta || !marca) { console.log('uso: preparar|gravar <pasta> <Marca>'); process.exit(1); }
const pastaDaMarca = marca.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
const esc = (s) => String(s ?? '').replace(/'/g, "''");
const pesoTexto = (g) => (g == null ? '' : g >= 1000 ? `${String(g / 1000).replace('.', ',')}kg` : `${String(g).replace('.', ',')}g`);
const nomeDe = (p) => {
  const t = p.titulo.replace(new RegExp(`\\b${marca}\\b`, 'i'), '').replace(/\s+/g, ' ').trim();
  return `${t} ${marca}${p.peso != null && !/\d\s*(g|kg)\b/i.test(t) ? ` ${pesoTexto(p.peso)}` : ''}`.replace(/\s+/g, ' ').trim();
};
const fora = new Set(fs.existsSync(`${pasta}/recusados.txt`) ? fs.readFileSync(`${pasta}/recusados.txt`, 'utf8').split(/\s+/).filter(Boolean) : []);
const itens = fs.existsSync(`${pasta}/produtos.json`) ? JSON.parse(fs.readFileSync(`${pasta}/produtos.json`, 'utf8')).filter((p) => !fora.has(p.slug)) : [];

if (modo === 'preparar') {
  // título igual no site para sabores diferentes: o nome vem do endereço da página, senão uma imagem apagaria a outra
  const semAcento = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const grupos = new Map();
  for (const p of itens) { const k = `${semAcento(p.titulo)}|${p.peso}`; grupos.set(k, [...(grupos.get(k) ?? []), p]); }
  const titulo = (t) => t.split(' ').filter(Boolean).map((w) => (/^(de|com|e|sabor|da|do)$/.test(w) ? w : w[0].toUpperCase() + w.slice(1))).join(' ');
  for (const g of grupos.values()) if (g.length > 1) for (const p of g) p.titulo = titulo(p.slug.replace(/-?\d+(-\d+)?g$/, '').replace(/-/g, ' ').trim());
  fs.mkdirSync(`${pasta}/pronto`, { recursive: true });
  for (const p of itens) {
    const nome = nomeDe(p);
    p.final = `${p.codigo ? `${p.codigo}-` : ''}${p.slug}.png`;
    const png = await sharp(`${pasta}/oficial/${p.arq}`).trim({ threshold: 0, background: { r: 0, g: 0, b: 0, alpha: 0 } }).withExif({ IFD0: { ImageDescription: `${nome}${p.codigo ? ` | GTIN ${p.codigo}` : ''}`, Copyright: `${marca} | ${p.pagina}` } }).png({ compressionLevel: 9 }).toBuffer();
    const m = await sharp(png).metadata();
    p.W = m.width; p.H = m.height;
    fs.writeFileSync(`${pasta}/pronto/${p.final}`, png);
  }
  fs.writeFileSync(`${pasta}/prontos.json`, JSON.stringify(itens, null, 1));
  const L = itens.map((p) => Math.max(p.W, p.H)).sort((a, b) => a - b);
  console.log('prontos', itens.length, 'lado menor', L[0], 'mediana', L[L.length >> 1], 'maior', L[L.length - 1]);
} else {
  // F-276: roupa, brinde, sacola, kit e afins nunca entram (não é produto de encarte)
  const prontos = JSON.parse(fs.readFileSync(`${pasta}/prontos.json`, 'utf8')).filter((p) => !fora.has(p.slug) && (p.segmento === 'moda' || !naoEProduto(p.titulo)));
  const credito = `Imagem oficial ${marca}`;
  let n = 0;
  for (const p of prontos) {
    // F-272 (dono, 08/11/2026): a foto entra POR LINK (passa-foto), sem cópia no R2; a foto baixada fica só no PC.
    // --copia mantém o jeito antigo (envia ao R2). Site da marca fora da lista do passa-foto: rodar catalogo-por-link.mjs hosts e publicar o worker.
    let url;
    if (p.link) {
      // F-274: foto que tinha fundo, recortada pelo passa-foto e aprovada na inspeção (marca-recortar-link.mjs)
      url = p.link;
    } else if (COPIA) {
      const chave = `catalogo/marcas/${pastaDaMarca}/${p.final}`;
      await enviar(chave, fs.readFileSync(`${pasta}/pronto/${p.final}`));
      url = `${R2_PUBLICO}${chave}`;
    } else {
      const meta = await sharp(`${pasta}/oficial/${p.arq}`).metadata();
      const t2 = await sharp(`${pasta}/oficial/${p.arq}`).trim({ threshold: 0, background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer({ resolveWithObject: true });
      const caixa = { left: -(t2.info.trimOffsetLeft ?? 0), top: -(t2.info.trimOffsetTop ?? 0), width: t2.info.width, height: t2.info.height };
      // F-274: corte só quando a sobra é grande (cada corte gasta 1 das 5.000 transformações grátis do mês da Cloudflare)
      const util = (caixa.width * caixa.height) / (meta.width * meta.height);
      url = linkDaFoto(p.url, util >= 0.6 ? null : caixa);
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) }).catch(() => null);
      if (!r?.ok || !/^image\//.test(r.headers.get('content-type') ?? '')) { console.log('  link não abriu (fica de fora):', p.slug, r?.status ?? 'erro'); continue; }
    }
    const nome = nomeDe(p);
    const chaves = [chaveCanonica(nome), ...(p.codigo ? [chaveCanonica(`codigo ${p.codigo}`)] : [])];
    const seg = p.segmento ? `'${esc(p.segmento)}'` : 'NULL', cod = p.codigo ? `'${esc(p.codigo)}'` : 'NULL';
    // F-275: foto da 2ª fonte (loja que vende o produto) leva o crédito e a licença do próprio item
    const cred = p.credito || credito, lic = p.licenca || LICENCA;
    const linhas = EMPRESAS.flatMap((e) => chaves.map((k) => `('${e}', NULL, '${esc(k)}', '${esc(nome)}', '${esc(url)}', 'MARCA', '${esc(cred)}', true, true, 'SEMENTE', '${esc(p.pagina)}', '${esc(lic)}', ${cod}, ${seg})`));
    await sqlBruto(`INSERT INTO public.tabloide_catalogo (empresa_operadora_id, cliente_id, nome_norm, nome, imagem_url, fonte, credito, recortada, recorte_tentado, origem, origem_url, licenca, codigo, segmento) VALUES ${linhas.join(',')} ON CONFLICT (empresa_operadora_id, COALESCE(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid), nome_norm) DO UPDATE SET imagem_url = EXCLUDED.imagem_url, fonte = EXCLUDED.fonte, credito = EXCLUDED.credito, recortada = true, recorte_tentado = true, origem_url = EXCLUDED.origem_url, licenca = EXCLUDED.licenca, codigo = EXCLUDED.codigo, segmento = EXCLUDED.segmento, updated_at = now()`);
    n++;
  }
  console.log('produtos gravados', n);
}
