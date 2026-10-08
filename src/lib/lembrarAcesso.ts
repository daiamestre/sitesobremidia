/**
 * F-170 — "Lembrar acesso" de verdade.
 *  - Marcado (padrão): a sessão fica guardada neste aparelho, como sempre foi.
 *  - Desmarcado: a sessão vale só enquanto o navegador estiver aberto; ao abrir de novo a pessoa precisa entrar outra vez.
 * A sessão em si é do Supabase (localStorage). Aqui só guardamos a escolha: um cookie SEM validade (some quando o navegador
 * fecha, e vale para todas as abas abertas) diz "este navegador ainda é o da entrada"; se a marca de acesso temporário existe
 * e o cookie sumiu, a sessão esquecida é encerrada ao abrir o sistema.
 */
const CHAVE_TEMPORARIA = 'sm_acesso_sem_lembrar';
const COOKIE_NAVEGADOR_ABERTO = 'sm_navegador_aberto';

function seguro<T>(fn: () => T, padrao: T): T {
  try { return fn(); } catch { return padrao; }
}

const temCookie = () => seguro(() => document.cookie.split('; ').some((c) => c.startsWith(COOKIE_NAVEGADOR_ABERTO + '=1')), false);
const gravarCookie = () => seguro(() => { document.cookie = `${COOKIE_NAVEGADOR_ABERTO}=1; path=/; SameSite=Lax`; }, undefined);
const apagarCookie = () => seguro(() => { document.cookie = `${COOKIE_NAVEGADOR_ABERTO}=; path=/; max-age=0; SameSite=Lax`; }, undefined);

/** Chamar logo depois de entrar com sucesso. */
export function registrarLembrarAcesso(lembrar: boolean): void {
  seguro(() => {
    if (lembrar) {
      localStorage.removeItem(CHAVE_TEMPORARIA);
      apagarCookie();
    } else {
      localStorage.setItem(CHAVE_TEMPORARIA, '1');
      gravarCookie();
    }
  }, undefined);
}

/** A última entrada foi sem "Lembrar acesso" e o navegador foi fechado desde então? */
export function deveEncerrarSessaoEsquecida(): boolean {
  return seguro(() => localStorage.getItem(CHAVE_TEMPORARIA) === '1' && !temCookie(), false);
}

/** Depois de encerrar a sessão esquecida, limpa a marca. */
export function limparMarcaDeAcessoTemporario(): void {
  seguro(() => { localStorage.removeItem(CHAVE_TEMPORARIA); apagarCookie(); }, undefined);
}
