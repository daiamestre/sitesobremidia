/**
 * Datas Comemorativas (F-95): as próximas 10 datas nacionais (feriados e datas do comércio), calculadas aqui — as
 * móveis (Carnaval, Páscoa, Corpus Christi, Dia das Mães/Pais, Black Friday) pela regra oficial. Sem fonte externa.
 */
import { esc, pagina, GRADIENTES } from '../arte-base.mjs';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function pascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}
const somar = (d, n) => new Date(d.getTime() + n * 86400e3);
const utc = (a, m, d) => new Date(Date.UTC(a, m - 1, d));
/** n-ésimo `diaSemana` (0=dom) do mês. */
const nEsimo = (a, m, diaSemana, n) => { const p = utc(a, m, 1); return somar(p, ((diaSemana - p.getUTCDay() + 7) % 7) + (n - 1) * 7); };

export function datasDoAno(ano) {
  const p = pascoa(ano);
  const quintaNov = nEsimo(ano, 11, 4, 4);
  return [
    [utc(ano, 1, 1), 'Confraternização Universal', 'Feliz Ano Novo! Que o novo ano traga saúde, paz e muitas conquistas.', 'dourado'],
    [somar(p, -47), 'Carnaval', 'Alegria, cores e muita festa! Aproveite com responsabilidade.', 'rosa'],
    [utc(ano, 3, 8), 'Dia Internacional da Mulher', 'Todo respeito e admiração às mulheres que transformam o mundo.', 'rosa'],
    [utc(ano, 3, 15), 'Dia do Consumidor', 'Você é a razão de tudo. Obrigado pela preferência!', 'laranja'],
    [somar(p, -2), 'Sexta-feira Santa', 'Um dia de reflexão, fé e união.', 'roxo'],
    [p, 'Páscoa', 'Feliz Páscoa! Renovação, esperança e momentos doces em família.', 'dourado'],
    [utc(ano, 4, 21), 'Tiradentes', 'Feriado nacional em homenagem a Tiradentes.', 'verde'],
    [utc(ano, 5, 1), 'Dia do Trabalhador', 'Homenagem a todos que constroem o Brasil todos os dias.', 'azul'],
    [nEsimo(ano, 5, 0, 2), 'Dia das Mães', 'Para quem ama sem medida: feliz Dia das Mães!', 'rosa'],
    [somar(p, 60), 'Corpus Christi', 'Um dia de fé e tradição.', 'roxo'],
    [utc(ano, 6, 12), 'Dia dos Namorados', 'O amor está no ar! Celebre quem faz seu coração bater mais forte.', 'vinho'],
    [utc(ano, 6, 24), 'São João', 'Arraiá, quentão e muita alegria nas festas juninas!', 'laranja'],
    [utc(ano, 7, 20), 'Dia do Amigo', 'Amigo é o irmão que a gente escolhe. Celebre!', 'turquesa'],
    [utc(ano, 7, 26), 'Dia dos Avós', 'Sabedoria, carinho e muito amor: feliz Dia dos Avós!', 'dourado'],
    [nEsimo(ano, 8, 0, 2), 'Dia dos Pais', 'Para o nosso primeiro herói: feliz Dia dos Pais!', 'azul'],
    [utc(ano, 9, 7), 'Independência do Brasil', 'Viva o Brasil! Feriado da Independência.', 'verde'],
    [utc(ano, 9, 15), 'Dia do Cliente', 'Obrigado por fazer parte da nossa história!', 'laranja'],
    [utc(ano, 9, 21), 'Dia da Árvore', 'Cuidar da natureza é cuidar da vida.', 'verde'],
    [utc(ano, 10, 1), 'Dia do Idoso', 'Respeito e carinho a quem tem tanto a ensinar.', 'dourado'],
    [utc(ano, 10, 12), 'Dia das Crianças e Nossa Senhora Aparecida', 'Feliz Dia das Crianças! E feriado de Nossa Senhora Aparecida.', 'turquesa'],
    [utc(ano, 10, 15), 'Dia do Professor', 'Obrigado a quem ensina e inspira todos os dias.', 'azul'],
    [utc(ano, 11, 2), 'Finados', 'Um dia de saudade e homenagem.', 'roxo'],
    [utc(ano, 11, 15), 'Proclamação da República', 'Feriado nacional da Proclamação da República.', 'verde'],
    [utc(ano, 11, 20), 'Dia da Consciência Negra', 'Respeito, igualdade e valorização da cultura afro-brasileira.', 'dourado'],
    [somar(quintaNov, 1), 'Black Friday', 'Prepare-se: as melhores ofertas do ano estão chegando!', 'vinho'],
    [utc(ano, 12, 24), 'Véspera de Natal', 'Que a magia do Natal ilumine a sua casa.', 'vinho'],
    [utc(ano, 12, 25), 'Natal', 'Feliz Natal! Paz, amor e união para você e sua família.', 'vinho'],
    [utc(ano, 12, 31), 'Réveillon', 'Adeus ano velho, feliz ano novo! Boas festas!', 'dourado'],
  ].map(([data, nome, mensagem, cor]) => ({ data: data.toISOString().slice(0, 10), nome, mensagem, cor }));
}

/** As próximas `n` datas a partir de hoje (Brasília), incluindo hoje. */
export function proximasDatas(hojeIso, n = 10) {
  const ano = +hojeIso.slice(0, 4);
  return [...datasDoAno(ano), ...datasDoAno(ano + 1)].filter((d) => d.data >= hojeIso).sort((a, b) => a.data.localeCompare(b.data)).slice(0, n);
}

export function htmlData(d, hojeIso, w, h) {
  const v = h > w;
  const [a, m, dia] = d.data.split('-').map(Number);
  const semana = DIAS[new Date(Date.UTC(a, m - 1, dia)).getUTCDay()];
  const css = `
.meio{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center}
.dia{font-weight:900;line-height:.9;font-size:${v ? 300 : 260}px;color:#FFD400;text-shadow:0 12px 40px rgba(0,0,0,.45)}
.mes{font-weight:900;letter-spacing:.14em;font-size:${v ? 70 : 64}px;text-transform:uppercase}
.sem{font-weight:700;font-size:${v ? 40 : 36}px;opacity:.85;margin-top:8px}
.nome{font-weight:900;line-height:1.08;font-size:${v ? 84 : 80}px;margin-top:${v ? 60 : 36}px;max-width:${v ? 940 : 1500}px}
.msg{font-weight:600;line-height:1.35;font-size:${v ? 40 : 36}px;margin-top:${v ? 34 : 22}px;opacity:.92;max-width:${v ? 900 : 1300}px}
.hoje{display:inline-block;margin-top:${v ? 36 : 22}px;background:#fff;color:#1a1033;font-weight:900;letter-spacing:.14em;font-size:${v ? 40 : 34}px;padding:12px 34px;border-radius:999px}`;
  const corpo = `<div class="meio"><div class="dia">${String(dia).padStart(2, '0')}</div><div class="mes">de ${MESES[m - 1]}</div><div class="sem">${semana}</div>
  <div class="nome">${esc(d.nome)}</div><div class="msg">${esc(d.mensagem)}</div>${d.data === hojeIso ? '<div><span class="hoje">É HOJE!</span></div>' : ''}</div>`;
  return pagina({ w, h, fundo: GRADIENTES[d.cor] ?? GRADIENTES.roxo, selo: 'DATAS COMEMORATIVAS', corpo, css, escuro: 0.1 });
}

export function produzirDatas(hojeIso) {
  return { datas: proximasDatas(hojeIso).map((d) => ({ chave: `d-${d.data}`, nome: `${d.nome} — ${d.data.split('-').reverse().join('/')}`,
    descricao: d.mensagem, html: (w, h) => htmlData(d, hojeIso, w, h) })) };
}
