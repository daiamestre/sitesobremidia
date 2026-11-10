/**
 * F-284 — PEDIDOS DE FOTO (ordem do dono, 09/11/2026): produto que entrou num encarte SEM foto, ou sem foto confiável, é procurado
 * NA HORA pelos agentes. Fontes dos pedidos:
 *   1) a fila do site (tabela tabloide_pedidos_de_foto, quando aplicada: supabase/migrations/20261363_pedidos_de_foto.sql);
 *   2) os encartes salvos (studio_projetos) com produto sem foto;
 *   3) as listas de exemplo de todos os segmentos (mercado, farmácia e os do F-277).
 * Para cada nome sem foto no catálogo: procura o produto EXATO (mesmo tipo, mesma medida, tradicional — regras do F-282) nas lojas
 * que vendem a marca e permitem leitura (as mesmas do marca-varejo.mjs), recorta no PC, faz a CONFERÊNCIA DUPLA com a IA e grava POR
 * LINK no catálogo com o nome que o cliente escreveu. Bloqueio de site nunca é contornado. Sem foto aprovada = continua pedido.
 *   node scripts/ops/pedidos-de-foto.mjs [--max=40]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { linkDaFoto } from './passa-foto.mjs';
import { LOJAS } from './marca-varejo.mjs';
import { avaliar } from './hortifruti-fotos.mjs';
import { naoEProduto } from './nao-e-produto.mjs';
import { sqlBruto } from './recorte-do-catalogo.mjs';

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(import.meta.dirname, '../..');
const jiti = require('jiti')(import.meta.filename, { alias: { '@': path.join(RAIZ, 'src') } });
const { chaveCanonica } = jiti('../../src/lib/tabloide/chave.ts');
const { lerBusca, diferenca, naoEhProduto } = jiti('../../src/lib/tabloide/buscaProduto.ts');
const { lerLista } = jiti('../../src/lib/tabloide/parseProdutos.ts');
const { CESTA_PADRAO, CESTA_FARMACIA, ENCARTES } = jiti('../../src/lib/tabloide/encartes.ts');
const { SEGMENTOS_DE_OFERTA } = jiti('../../src/lib/studio/segmentosDeOferta.ts');

/** sabores comuns: quem não escreve o sabor aceita o mais vendido da marca */
const SABORES = new Set(['chocolate', 'morango', 'baunilha', 'coco', 'limao', 'laranja', 'uva', 'maracuja', 'abacaxi', 'goiaba', 'tradicional', 'original', 'leite', 'creme', 'mel']);
const MAX = Number((process.argv.find((a) => a.startsWith('--max=')) ?? '--max=40').slice(6));
const PASTA = path.resolve(RAIZ, '..', 'pedidos-de-foto');
const UA = { 'User-Agent': 'SobreMidia-Catalogo/1.0 (contato@sobremidia.com.br)', Accept: 'application/json' };
const esc = (s) => String(s ?? '').replace(/'/g, "''");
const slugDe = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const log = (t) => console.log(t);

// ---------- 1) os pedidos ----------
const pedidos = new Map(); // chave → nome
const pedir = (nome) => { const n = String(nome ?? '').trim(); const k = chaveCanonica(n); if (k.length >= 3 && n.length <= 160 && !naoEProduto(n)) pedidos.set(k, pedidos.get(k) ?? n); };
let temFila = false;
try {
  const fila = await sqlBruto(`select nome from public.tabloide_pedidos_de_foto where status in ('pendente','procurando') order by pedidos desc, atualizado_em desc limit 200`);
  temFila = true;
  fila.forEach((l) => pedir(l.nome));
} catch { /* a fila ainda não foi aplicada: segue com as outras fontes */ }
try {
  const projetos = await sqlBruto(`select dados from public.studio_projetos where atualizado_em > now() - interval '30 days' order by atualizado_em desc limit 300`);
  for (const p of projetos) {
    const camadas = p.dados?.camadas ?? p.dados?.docs?.['9:16']?.camadas ?? [];
    const fotos = new Map(camadas.filter((c) => /^Produto \d+$/.test(c.nome ?? '')).map((c) => [c.nome.split(' ')[1], c.src]));
    for (const c of camadas) if (/^Nome do produto \d+$/.test(c.nome ?? '') && !fotos.get(c.nome.split(' ').pop())) pedir(c.texto);
  }
} catch { /* sem projetos */ }
for (const cesta of [CESTA_PADRAO, CESTA_FARMACIA, ...ENCARTES.map((e) => e.produtos), ...SEGMENTOS_DE_OFERTA.map((s) => s.cesta)]) lerLista(cesta).forEach((p) => pedir(p.nome));

// só o que ainda NÃO tem foto no catálogo (pelo nome exato) — o resto já resolve no site
const chaves = [...pedidos.keys()];
const comFoto = new Set();
for (let i = 0; i < chaves.length; i += 200) {
  const r = await sqlBruto(`select distinct nome_norm from public.tabloide_catalogo where cliente_id is null and fonte <> 'IA' and nome_norm in (${chaves.slice(i, i + 200).map((k) => `'${esc(k)}'`).join(',')})`);
  r.forEach((l) => comFoto.add(l.nome_norm));
}
const faltam = chaves.filter((k) => !comFoto.has(k)).slice(0, MAX);
log(`pedidos: ${pedidos.size} | sem foto no catálogo: ${chaves.length - comFoto.size} | nesta volta: ${faltam.length}${temFila ? '' : ' (fila do site ainda não aplicada)'}`);

// ---------- 2) procurar cada um nas lojas (produto exato pelas regras do F-282) ----------
/** carne, fruta, legume, verdura, ovo: só vale item da seção de açougue/hortifrúti da loja (nada de Pringles para "batata", petisco
 * de cachorro para "picanha" ou Mr Músculo para "músculo") */
const FRESCO = /(picanha|alcatra|patinho|acem|musculo|contrafile|costela|cupim|maminha|fraldinha|lagarto|coxao|file|bisteca|pernil|lombo|linguica|frango|asa|coxa|sobrecoxa|moela|peito|carne|charque|peixe|tilapia|batata|tomate|cebola|alho|cenoura|alface|banana|maca|laranja|limao|abacaxi|mamao|melancia|melao|manga|uva|morango|chuchu|abobrinha|abobora|pimentao|pepino|repolho|couve|brocolis|beterraba|mandioca|ovos?)/;
const SECAO_FRESCA = /horti|frut|legum|verdur|acougue|carne|aves|frango|bovin|suin|peix|ovos|frios/;
const SECAO_ERRADA = /pet|limpez|bebida|refriger|snack|salgad|biscoit|doce|higien|perfum|farmac|medicament/;
const semAc = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function candidatos(nome) {
  const b = lerBusca(nome);
  const fresco = FRESCO.test(semAc(nome));
  const out = [];
  for (const loja of LOJAS) {
    const r = await fetch(`https://${loja.dominio}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(nome.replace(/\d+([.,]\d+)?\s*(kg|g|ml|l)\b/gi, '').trim())}&O=OrderByTopSaleDESC&_from=0&_to=29`, { headers: UA, signal: AbortSignal.timeout(20000) }).catch(() => null);
    if (!r?.ok) continue;
    const j = await r.json().catch(() => []);
    for (const p of Array.isArray(j) ? j : []) {
      for (const it of (p.items ?? []).slice(0, 3)) {
        const titulo = String(it.nameComplete || it.name || p.productName).replace(/\s+/g, ' ').trim();
        if (naoEhProduto(titulo) || naoEProduto(titulo)) continue;
        const secao = semAc((p.categories ?? []).join(' '));
        if (fresco && (!SECAO_FRESCA.test(secao) || SECAO_ERRADA.test(secao))) continue;
        const d = diferenca(b, chaveCanonica(titulo));
        const foto = it.images?.[0]?.imageUrl;
        // até 2,5 = o produto exato/tradicional; até 5,5 só quando o que sobra é SABOR (produto que sempre tem sabor: vale o mais vendido)
        const sobra = chaveCanonica(titulo).split(' ').filter((t) => !b.palavras.includes(t));
        const soSabor = sobra.filter((t) => SABORES.has(t)).length >= 1;
        if (d === null || !foto || d > (soSabor ? 5.5 : 2.5)) continue;
        out.push({ titulo, d, loja: loja.nome, marca: p.brand, pagina: p.link, url: String(foto).replace(/^http:/, 'https:').replace(/\?.*$/, ''), codigo: /^\d{8,14}$/.test(it.ean ?? '') ? it.ean : null });
      }
    }
  }
  const vistas = new Set();
  return out.sort((a, z) => a.d - z.d).filter((c) => !vistas.has(c.url) && vistas.add(c.url)).slice(0, 6);
}

fs.mkdirSync(PASTA, { recursive: true });
const EMPRESAS = (await sqlBruto(`select distinct empresa_operadora_id id from public.tabloide_catalogo where fonte = 'MARCA' and cliente_id is null`)).map((l) => l.id);
let achadas = 0;
for (const k of faltam) {
  const nome = pedidos.get(k);
  const cands = await candidatos(nome).catch(() => []);
  let ok = null;
  const motivos = [];
  for (const c of cands) {
    const r = await fetch(c.url, { headers: { ...UA, Accept: 'image/*' }, signal: AbortSignal.timeout(30000) }).catch(() => null);
    if (!r?.ok) { motivos.push('não abriu'); continue; }
    const buf = Buffer.from(await r.arrayBuffer());
    const a = await avaliar(buf).catch((e) => ({ motivo: String(e?.message ?? e).slice(0, 30) }));
    if (!a.ok) { motivos.push(a.motivo); continue; }
    ok = { ...c, ...a };
    fs.writeFileSync(path.join(PASTA, `${slugDe(nome)}.png`), a.previa);
    break;
  }
  if (ok) {
    const link = linkDaFoto(ok.url, ok.caixa, true);
    const marca = String(ok.marca ?? '').trim();
    const credito = `Imagem oficial${marca ? ` ${marca}` : ''} (via ${ok.loja})`;
    const chavesDoItem = [...new Set([k, chaveCanonica(ok.titulo), ...(ok.codigo ? [chaveCanonica(`codigo ${ok.codigo}`)] : [])])];
    const linhas = EMPRESAS.flatMap((e) => chavesDoItem.map((ch) => `('${e}', NULL, '${esc(ch)}', '${esc(ch === k ? nome : ok.titulo)}', '${esc(link)}', 'MARCA', '${esc(credito)}', true, true, 'SEMENTE', '${esc(ok.pagina)}', 'Imagem do fabricante publicada pela loja; sem autorização formal registrada', ${ok.codigo ? `'${esc(ok.codigo)}'` : 'NULL'}, NULL)`));
    await sqlBruto(`INSERT INTO public.tabloide_catalogo (empresa_operadora_id, cliente_id, nome_norm, nome, imagem_url, fonte, credito, recortada, recorte_tentado, origem, origem_url, licenca, codigo, segmento) VALUES ${linhas.join(',')} ON CONFLICT (empresa_operadora_id, COALESCE(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid), nome_norm) DO UPDATE SET imagem_url = excluded.imagem_url, fonte = excluded.fonte, credito = excluded.credito, recortada = excluded.recortada, recorte_tentado = true, origem = excluded.origem, origem_url = excluded.origem_url, licenca = excluded.licenca, codigo = coalesce(excluded.codigo, tabloide_catalogo.codigo) WHERE tabloide_catalogo.fonte = 'IA'`); // F-295: a foto oficial substitui a imagem criada por IA
    achadas++;
  }
  if (temFila) await sqlBruto(`update public.tabloide_pedidos_de_foto set status = '${ok ? 'achada' : 'sem_foto'}', observacao = '${esc(ok ? `${ok.titulo} (${ok.loja})` : motivos.slice(0, 3).join(', ') || 'nenhuma loja com o produto exato')}', atualizado_em = now() where nome_norm = '${esc(k)}'`).catch(() => undefined);
  log(`${nome.slice(0, 40).padEnd(41)} ${ok ? `ACHADA: ${ok.titulo} (${ok.loja})` : `sem foto aprovada (${cands.length} candidatas${motivos.length ? `: ${motivos.slice(0, 3).join(', ')}` : ''})`}`);
}
log(`RESULTADO pedidos ${faltam.length} | fotos achadas e gravadas ${achadas}`);
