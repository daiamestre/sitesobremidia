// SOBRE MÍDIA STUDIO — EDITOR DE ÁUDIO: o que fica guardado NESTE aparelho (IndexedDB).
// 1) a edição atual, salva sozinha (fechar a aba ou a luz cair não perde o trabalho);
// 2) a PASTA DE ÁUDIOS (pedido do dono, 18/11/2026): cada áudio salvo com nome, data e versão, para rever, reeditar e salvar
//    uma nova edição em cima. A lista (leve) e os dados (faixas + sons) ficam separados para a pasta abrir rápido.
import type { Projeto } from './projeto';
import type { Som } from './som';

const BANCO = 'sobremidia-editor-de-audio', ATUAL = 'projeto', CHAVE = 'atual', PASTA = 'pasta', DADOS = 'pasta-dados', SONS = 'sons-atual';
export interface ProjetoGuardado { projeto: Projeto; sons: Record<string, { nome: string; som: Som }>; nome: string; salvoEm: number; pastaId?: string | null; tipo?: 'salvo' | 'rascunho' | null }
export interface AudioNaPasta { id: string; nome: string; criadoEm: number; salvoEm: number; versao: number; duracao: number; faixas: number }
export interface DadosNaPasta { projeto: Projeto; sons: Record<string, { nome: string; som: Som }> }

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, erro) => {
    const r = indexedDB.open(BANCO, 3);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const loja of [ATUAL, PASTA, DADOS, SONS]) if (!db.objectStoreNames.contains(loja)) db.createObjectStore(loja);
    };
    r.onsuccess = () => ok(r.result); r.onerror = () => erro(r.error);
  });
}
async function fazer<T>(loja: string, modo: IDBTransactionMode, f: (l: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrir();
  try {
    return await new Promise<T>((ok, erro) => { const t = db.transaction(loja, modo); const r = f(t.objectStore(loja)); r.onsuccess = () => ok(r.result); r.onerror = () => erro(r.error); });
  } finally { db.close(); }
}

// ——— a edição atual (salva sozinha) ———
// F-342: cada som é gravado UMA vez (loja própria, pelo id — o som nunca muda); a cada mudança só vai o projeto (leve).
// Antes, todos os sons iam inteiros a cada mudança: com 8 áudios longos eram centenas de MB e o celular TRAVAVA.
const sonsGravados = new Set<string>();
export async function salvarNoAparelho(g: ProjetoGuardado): Promise<void> {
  try {
    for (const [id, s] of Object.entries(g.sons)) {
      if (sonsGravados.has(id)) continue;
      await fazer(SONS, 'readwrite', (l) => l.put(s, id)); sonsGravados.add(id);
    }
    await fazer(ATUAL, 'readwrite', (l) => l.put({ ...g, sons: undefined, ids: Object.keys(g.sons) }, CHAVE));
    // os sons que o projeto não usa mais saem (de vez em quando)
    const chaves = (await fazer<IDBValidKey[]>(SONS, 'readonly', (l) => l.getAllKeys())) ?? [];
    for (const k of chaves) if (!(String(k) in g.sons)) { await fazer(SONS, 'readwrite', (l) => l.delete(k)); sonsGravados.delete(String(k)); }
  } catch { /* sem espaço/aba privada: segue sem salvar */ }
}
export async function lerDoAparelho(): Promise<ProjetoGuardado | null> {
  try {
    const g = (await fazer<(ProjetoGuardado & { ids?: string[] }) | undefined>(ATUAL, 'readonly', (l) => l.get(CHAVE))) ?? null;
    if (!g) return null;
    if (g.sons) return g; // formato antigo (tudo junto)
    const sons: ProjetoGuardado['sons'] = {};
    for (const id of g.ids ?? []) { const s = await fazer<{ nome: string; som: Som } | undefined>(SONS, 'readonly', (l) => l.get(id)); if (s) { sons[id] = s; sonsGravados.add(id); } }
    return { ...g, sons };
  } catch { return null; }
}
export async function apagarDoAparelho(): Promise<void> {
  try { await fazer(ATUAL, 'readwrite', (l) => l.delete(CHAVE)); await fazer(SONS, 'readwrite', (l) => l.clear()); sonsGravados.clear(); } catch { /* nada */ }
}

// ——— a pasta de áudios ———
export async function listarPasta(): Promise<AudioNaPasta[]> {
  try { return ((await fazer<AudioNaPasta[]>(PASTA, 'readonly', (l) => l.getAll())) ?? []).sort((a, b) => b.salvoEm - a.salvoEm); } catch { return []; }
}
/** grava (ou regrava por cima, subindo a versão) */
export async function salvarNaPasta(item: AudioNaPasta, dados: DadosNaPasta): Promise<void> {
  await fazer(DADOS, 'readwrite', (l) => l.put(dados, item.id));
  await fazer(PASTA, 'readwrite', (l) => l.put(item, item.id));
}
export async function lerDaPasta(id: string): Promise<DadosNaPasta | null> { return (await fazer<DadosNaPasta | undefined>(DADOS, 'readonly', (l) => l.get(id))) ?? null; }
export async function renomearNaPasta(id: string, nome: string): Promise<void> {
  const item = await fazer<AudioNaPasta | undefined>(PASTA, 'readonly', (l) => l.get(id));
  if (item) await fazer(PASTA, 'readwrite', (l) => l.put({ ...item, nome }, id));
}
export async function apagarDaPasta(id: string): Promise<void> {
  await fazer(PASTA, 'readwrite', (l) => l.delete(id));
  await fazer(DADOS, 'readwrite', (l) => l.delete(id));
}
