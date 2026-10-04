/**
 * F-133 — Toda tabela do sistema empilha no celular e no tablet, mesmo as escritas "na mão" (<table> direto).
 *
 * O componente ui/table já empilha (F-116/F-121), mas 14 tabelas de 9 páginas (representantes, desempenho, portal,
 * BI…) usavam <table> cru e ficavam largas demais. Em vez de depender de cada página lembrar, este módulo marca
 * automaticamente qualquer <table> que aparecer na tela com a mesma classe do componente — o CSS de empilhamento é o
 * mesmo. No computador nada muda (o CSS só age até 1023 px, ou até 1280 px quando a tabela não cabe).
 *
 * Ficam de fora: tabela que faz parte de um texto (contrato, documento) e quem pedir com data-tabela-fixa.
 */
const FORA = '[contenteditable], [data-testid="folha-contrato"], [data-tabela-fixa], .prose';

export function rotularCelulas(tabela: HTMLTableElement | null) {
  if (!tabela) return;
  const titulos = [...tabela.querySelectorAll(':scope > thead > tr:last-child > th')].map((th) => (th.textContent || '').trim());
  if (!titulos.length) return;
  for (const tr of tabela.querySelectorAll(':scope > tbody > tr')) {
    let col = 0;
    for (const td of (tr as HTMLTableRowElement).cells) {
      const span = (td as HTMLTableCellElement).colSpan || 1;
      if (span > 1) td.setAttribute('data-linha-inteira', '');
      else if (titulos[col]) td.setAttribute('data-label', titulos[col]);
      else td.removeAttribute('data-label');
      col += span;
    }
  }
}

/** Marca "sem-espaco" quando a tabela (em formato de tabela) fica mais larga que a área dela. */
function medirEspaco(tabela: HTMLTableElement) {
  const area = tabela.parentElement;
  if (!area) return;
  tabela.classList.remove('sem-espaco');
  if (tabela.scrollWidth > area.clientWidth + 4) tabela.classList.add('sem-espaco');
}

export function prepararTabelas(raiz: ParentNode = document) {
  for (const tabela of raiz.querySelectorAll<HTMLTableElement>('table')) {
    if (tabela.closest(FORA)) continue;
    const doComponente = tabela.classList.contains('tabela-empilhada') && !tabela.hasAttribute('data-auto-empilhada');
    if (doComponente) continue; // o componente ui/table cuida da própria tabela
    if (!tabela.querySelector(':scope > thead th')) continue; // sem cabeçalho não há como rotular: fica como está
    tabela.setAttribute('data-auto-empilhada', '');
    tabela.classList.add('tabela-empilhada');
    rotularCelulas(tabela);
    medirEspaco(tabela);
  }
}

let ativo = false;

/** Liga uma única vez, no início do app. Qualquer falha aqui é só visual e nunca derruba a tela. */
export function ativarTabelasResponsivas() {
  if (ativo || typeof window === 'undefined' || typeof MutationObserver === 'undefined') return;
  ativo = true;
  let agendado = 0;
  const rodar = () => {
    agendado = 0;
    try { prepararTabelas(); } catch { /* ajuste visual: ignora */ }
  };
  const agendar = () => { if (!agendado) agendado = window.setTimeout(rodar, 120); };
  try {
    new MutationObserver(agendar).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', agendar);
    agendar();
  } catch { /* navegador sem suporte: as tabelas ficam como eram */ }
}
