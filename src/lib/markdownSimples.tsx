// Markdown simples e SEGURO (sem HTML injetado) para as respostas do agente "Trabalhar com IA" (F-223):
// títulos, negrito, itálico, código, listas, tabelas e parágrafos.
import type { ReactNode } from 'react';

function inline(t: string, k: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g;
  let ultimo = 0, i = 0, m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    if (m.index > ultimo) out.push(t.slice(ultimo, m.index));
    const s = m[0];
    if (s.startsWith('**')) out.push(<strong key={`${k}-${i++}`} className="font-bold text-white">{s.slice(2, -2)}</strong>);
    else if (s.startsWith('`')) out.push(<code key={`${k}-${i++}`} className="rounded bg-white/10 px-1 text-[0.85em]">{s.slice(1, -1)}</code>);
    else out.push(<em key={`${k}-${i++}`}>{s.slice(1, -1)}</em>);
    ultimo = m.index + s.length;
  }
  if (ultimo < t.length) out.push(t.slice(ultimo));
  return out;
}

const celulas = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export function Markdown({ texto }: { texto: string }) {
  const linhas = texto.replace(/\r/g, '').split('\n');
  const blocos: ReactNode[] = [];
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    const k = `b${i}`;
    if (!l.trim()) continue;
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) { blocos.push(<p key={k} className={h[1].length <= 2 ? 'mt-3 text-base font-black text-white' : 'mt-2 text-sm font-bold text-white'}>{inline(h[2], k)}</p>); continue; }
    if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|?\s*:?-{2,}/.test(linhas[i + 1] ?? '')) {
      const cab = celulas(l);
      const corpo: string[][] = [];
      i += 2;
      while (i < linhas.length && /^\s*\|.*\|\s*$/.test(linhas[i])) corpo.push(celulas(linhas[i++]));
      i--;
      blocos.push(
        <div key={k} className="my-2 max-w-full overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/5 text-slate-300"><tr>{cab.map((c, j) => <th key={j} className="whitespace-nowrap px-2 py-1.5 font-semibold">{inline(c, `${k}h${j}`)}</th>)}</tr></thead>
            <tbody>{corpo.map((r, ri) => <tr key={ri} className="border-t border-white/5">{r.map((c, j) => <td key={j} className="px-2 py-1.5 align-top">{inline(c, `${k}${ri}${j}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(l)) {
      const itens: string[] = [];
      const numerada = /^\s*\d+[.)]/.test(l);
      while (i < linhas.length && /^\s*([-*•]|\d+[.)])\s+/.test(linhas[i])) itens.push(linhas[i++].replace(/^\s*([-*•]|\d+[.)])\s+/, ''));
      i--;
      const Lista = numerada ? 'ol' : 'ul';
      blocos.push(<Lista key={k} className={`my-1 space-y-0.5 pl-5 ${numerada ? 'list-decimal' : 'list-disc'}`}>{itens.map((t, j) => <li key={j}>{inline(t, `${k}${j}`)}</li>)}</Lista>);
      continue;
    }
    if (/^-{3,}$/.test(l.trim())) { blocos.push(<hr key={k} className="my-2 border-white/10" />); continue; }
    blocos.push(<p key={k} className="my-1">{inline(l, k)}</p>);
  }
  return <div className="text-sm leading-relaxed text-slate-200">{blocos}</div>;
}
