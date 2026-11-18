// SOBRE MÍDIA STUDIO — EDITOR DE ÁUDIO: a edição fica salva NESTE aparelho (IndexedDB), sozinha. Fechar a aba ou a luz cair
// não perde o trabalho. Só os sons que o projeto usa são guardados.
import type { Projeto } from './projeto';
import type { Som } from './som';

const BANCO = 'sobremidia-editor-de-audio', LOJA = 'projeto', CHAVE = 'atual';
export interface ProjetoGuardado { projeto: Projeto; sons: Record<string, { nome: string; som: Som }>; nome: string; salvoEm: number }

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, erro) => {
    const r = indexedDB.open(BANCO, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(LOJA);
    r.onsuccess = () => ok(r.result); r.onerror = () => erro(r.error);
  });
}
async function fazer<T>(modo: IDBTransactionMode, f: (l: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrir();
  try {
    return await new Promise<T>((ok, erro) => { const t = db.transaction(LOJA, modo); const r = f(t.objectStore(LOJA)); r.onsuccess = () => ok(r.result); r.onerror = () => erro(r.error); });
  } finally { db.close(); }
}
export async function salvarNoAparelho(g: ProjetoGuardado): Promise<void> { try { await fazer('readwrite', (l) => l.put(g, CHAVE)); } catch { /* sem espaço/aba privada: segue sem salvar */ } }
export async function lerDoAparelho(): Promise<ProjetoGuardado | null> { try { return (await fazer<ProjetoGuardado | undefined>('readonly', (l) => l.get(CHAVE))) ?? null; } catch { return null; } }
export async function apagarDoAparelho(): Promise<void> { try { await fazer('readwrite', (l) => l.delete(CHAVE)); } catch { /* nada */ } }
