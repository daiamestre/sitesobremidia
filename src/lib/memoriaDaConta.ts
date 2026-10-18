/**
 * F-195 — a memória do painel (cache das consultas) pertence a UMA conta. Trocou de conta ou saiu: apaga tudo.
 * `anterior` undefined = primeira leitura da sessão (nada guardado ainda).
 */
export function deveLimparMemoria(anterior: string | null | undefined, atual: string | null): boolean {
  if (anterior === undefined) return false;
  return anterior !== atual;
}
