/**
 * F-295 — acesso ao banco dos AGENTES DE FOTO, igual no PC e na nuvem:
 *   - no PC (cofre ~/.sobremidia-secrets/tokens.env com SUPABASE_ACCESS_TOKEN): SQL pela API de gestão, como sempre foi;
 *   - na NUVEM (GitHub Actions, sem o cofre): a API do banco (PostgREST) com SUPABASE_URL + SUPABASE_SERVICE_KEY, que já são
 *     segredos do repositório. A chave-mestra da conta (SUPABASE_ACCESS_TOKEN) NÃO vai para o GitHub (decisão do dono).
 * Só as operações que os agentes usam: ler a fila, os encartes recentes e o catálogo; gravar a foto achada; marcar o pedido.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const COFRE = path.join(os.homedir(), '.sobremidia-secrets', 'tokens.env');
export const NA_NUVEM = !fs.existsSync(COFRE) && !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_KEY;

const esc = (s) => String(s ?? '').replace(/'/g, "''");
let sql = null;
async function sqlBruto(q) {
  if (!sql) sql = (await import('./recorte-do-catalogo.mjs')).sqlBruto;
  return sql(q);
}

// ---------- API do banco (nuvem) ----------
const BASE = `${String(process.env.SUPABASE_URL ?? '').replace(/\/$/, '')}/rest/v1/`;
const H = () => ({ apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' });
async function rest(caminho, init = {}) {
  const r = await fetch(BASE + caminho, { ...init, headers: { ...H(), ...(init.headers ?? {}) }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`banco ${r.status} ${(await r.text()).slice(0, 200)}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
/** lista para o filtro in.(...) da API, com cada valor entre aspas */
const lista = (vs) => encodeURIComponent(`(${vs.map((v) => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')})`);

/** nomes pedidos pelo site (fila), dos mais pedidos para os menos */
export async function lerFila() {
  if (!NA_NUVEM) return (await sqlBruto(`select nome from public.tabloide_pedidos_de_foto where status in ('pendente','procurando') order by pedidos desc, atualizado_em desc limit 200`)).map((l) => l.nome);
  return (await rest('tabloide_pedidos_de_foto?select=nome&status=in.(pendente,procurando)&order=pedidos.desc,atualizado_em.desc&limit=200')).map((l) => l.nome);
}

/** os dados dos encartes salvos nos últimos 30 dias */
export async function lerProjetos() {
  if (!NA_NUVEM) return sqlBruto(`select dados from public.studio_projetos where atualizado_em > now() - interval '30 days' order by atualizado_em desc limit 300`);
  const desde = new Date(Date.now() - 30 * 86400000).toISOString();
  return rest(`studio_projetos?select=dados&atualizado_em=gt.${encodeURIComponent(desde)}&order=atualizado_em.desc&limit=300`);
}

/** das chaves pedidas, as que JÁ têm foto de verdade no catálogo (imagem criada por IA não conta: os agentes seguem procurando) */
export async function comFotoNoCatalogo(chaves) {
  const ok = new Set();
  for (let i = 0; i < chaves.length; i += NA_NUVEM ? 60 : 200) {
    const parte = chaves.slice(i, i + (NA_NUVEM ? 60 : 200));
    const linhas = NA_NUVEM
      ? await rest(`tabloide_catalogo?select=nome_norm&cliente_id=is.null&fonte=neq.IA&nome_norm=in.${lista(parte)}`)
      : await sqlBruto(`select distinct nome_norm from public.tabloide_catalogo where cliente_id is null and fonte <> 'IA' and nome_norm in (${parte.map((k) => `'${esc(k)}'`).join(',')})`);
    linhas.forEach((l) => ok.add(l.nome_norm));
  }
  return ok;
}

/** as empresas que recebem as fotos oficiais (as que já têm o catálogo das marcas) */
export async function empresasDoCatalogo() {
  if (!NA_NUVEM) return (await sqlBruto(`select distinct empresa_operadora_id id from public.tabloide_catalogo where fonte = 'MARCA' and cliente_id is null`)).map((l) => l.id);
  const ids = new Set();
  for (let de = 0; de < 20000; de += 1000) {
    const parte = await rest(`tabloide_catalogo?select=empresa_operadora_id&fonte=eq.MARCA&cliente_id=is.null&order=id&offset=${de}&limit=1000`);
    parte.forEach((l) => ids.add(l.empresa_operadora_id));
    if (parte.length < 1000) break;
  }
  return [...ids];
}

/**
 * Grava a foto achada pelos agentes no catálogo de cada empresa (linha geral, sem cliente). Linha que já existe só é trocada
 * quando era imagem criada por IA (a oficial substitui a da IA); foto de verdade que já existe nunca é mexida.
 * linha = { nome_norm, nome, imagem_url, credito, origem_url, licenca, codigo }
 */
export async function gravarFotos(empresas, linhas) {
  const todas = empresas.flatMap((e) => linhas.map((l) => ({ empresa_operadora_id: e, cliente_id: null, fonte: 'MARCA', recortada: true, recorte_tentado: true, origem: 'SEMENTE', segmento: null, ...l })));
  if (!todas.length) return;
  if (!NA_NUVEM) {
    const v = todas.map((l) => `('${l.empresa_operadora_id}', NULL, '${esc(l.nome_norm)}', '${esc(l.nome)}', '${esc(l.imagem_url)}', 'MARCA', '${esc(l.credito)}', true, true, 'SEMENTE', '${esc(l.origem_url)}', '${esc(l.licenca)}', ${l.codigo ? `'${esc(l.codigo)}'` : 'NULL'}, NULL)`);
    await sqlBruto(`INSERT INTO public.tabloide_catalogo (empresa_operadora_id, cliente_id, nome_norm, nome, imagem_url, fonte, credito, recortada, recorte_tentado, origem, origem_url, licenca, codigo, segmento) VALUES ${v.join(',')} ON CONFLICT (empresa_operadora_id, COALESCE(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid), nome_norm) DO UPDATE SET imagem_url = excluded.imagem_url, fonte = excluded.fonte, credito = excluded.credito, recortada = excluded.recortada, recorte_tentado = true, origem = excluded.origem, origem_url = excluded.origem_url, licenca = excluded.licenca, codigo = coalesce(excluded.codigo, tabloide_catalogo.codigo) WHERE tabloide_catalogo.fonte = 'IA'`);
    return;
  }
  // nuvem: a chave do catálogo é (empresa, cliente nulo, nome_norm); a API não faz "upsert" nesse índice, então confere uma a uma
  for (const l of todas) {
    const ja = await rest(`tabloide_catalogo?select=id,fonte&empresa_operadora_id=eq.${l.empresa_operadora_id}&cliente_id=is.null&nome_norm=eq.${encodeURIComponent(l.nome_norm)}&limit=1`);
    if (!ja.length) await rest('tabloide_catalogo', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(l) });
    else if (ja[0].fonte === 'IA') {
      const { empresa_operadora_id: _e, cliente_id: _c, nome_norm: _n, segmento: _s, ...troca } = l;
      await rest(`tabloide_catalogo?id=eq.${ja[0].id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(troca) });
    }
  }
}

/** marca o pedido da fila: 'achada' ou 'sem_foto', com a observação */
export async function marcarPedido(chave, status, observacao) {
  if (!NA_NUVEM) {
    await sqlBruto(`update public.tabloide_pedidos_de_foto set status = '${esc(status)}', observacao = '${esc(observacao)}', atualizado_em = now() where nome_norm = '${esc(chave)}'`);
    return;
  }
  await rest(`tabloide_pedidos_de_foto?nome_norm=eq.${encodeURIComponent(chave)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status, observacao, atualizado_em: new Date().toISOString() }) });
}
