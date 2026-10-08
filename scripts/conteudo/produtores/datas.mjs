/**
 * Datas Comemorativas (F-95): as próximas 10 datas nacionais (feriados e datas do comércio), calculadas aqui — as
 * móveis (Carnaval, Páscoa, Corpus Christi, Dia das Mães/Pais, Black Friday) pela regra oficial. Sem fonte externa para a data.
 * F-163: cada data leva uma FOTO que combina (Natal, Páscoa, Dia das Mães…), com o crédito no pé; sem foto, volta ao degradê.
 */
import { GRADIENTES } from '../arte-base.mjs';
import { cartaoData } from '../arte-foto.mjs';
import { buscarFoto } from '../fotos.mjs';

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

/** Termo de busca (inglês) da foto de cada data. */
export const FOTO_DA_DATA = {
  'Confraternização Universal': 'new year fireworks celebration',
  'Carnaval': 'brazilian carnival costume',
  'Dia Internacional da Mulher': 'smiling women group flowers',
  'Dia do Consumidor': 'happy customer shopping',
  'Sexta-feira Santa': 'candles peaceful',
  'Páscoa': 'easter eggs chocolate',
  'Tiradentes': 'brazil flag waving',
  'Dia do Trabalhador': 'workers teamwork smiling',
  'Dia das Mães': 'mother and daughter hugging',
  'Corpus Christi': 'colorful flower petals carpet',
  'Dia dos Namorados': 'couple romantic sunset',
  'São João': 'festa junina flags bonfire',
  'Dia do Amigo': 'friends hugging sunset',
  'Dia dos Avós': 'grandparents with grandchildren',
  'Dia dos Pais': 'father and son playing',
  'Independência do Brasil': 'brazil flag green yellow',
  'Dia do Cliente': 'customer service smile store',
  'Dia da Árvore': 'tree forest sunlight',
  'Dia do Idoso': 'elderly couple smiling',
  'Dia das Crianças e Nossa Senhora Aparecida': 'children playing happy',
  'Dia do Professor': 'teacher classroom students',
  'Finados': 'white roses peaceful',
  'Proclamação da República': 'brazil flag',
  'Dia da Consciência Negra': 'brazilian culture celebration',
  'Black Friday': 'black friday sale shopping',
  'Véspera de Natal': 'christmas tree lights family',
  'Natal': 'christmas tree gifts',
  'Réveillon': 'new year eve fireworks beach',
};

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
  ].map(([data, nome, mensagem, cor]) => ({ data: data.toISOString().slice(0, 10), nome, mensagem, cor, foto: FOTO_DA_DATA[nome] ?? null }));
}

/** As próximas `n` datas a partir de hoje (Brasília), incluindo hoje. */
export function proximasDatas(hojeIso, n = 10) {
  const ano = +hojeIso.slice(0, 4);
  return [...datasDoAno(ano), ...datasDoAno(ano + 1)].filter((d) => d.data >= hojeIso).sort((a, b) => a.data.localeCompare(b.data)).slice(0, n);
}

export function htmlData(d, hojeIso, w, h, foto = null) {
  const [a, m, dia] = d.data.split('-').map(Number);
  const semana = DIAS[new Date(Date.UTC(a, m - 1, dia)).getUTCDay()];
  return cartaoData({ dia, mes: MESES[m - 1], semana, nome: d.nome, mensagem: d.mensagem, ehHoje: d.data === hojeIso, fundo: GRADIENTES[d.cor] ?? GRADIENTES.roxo, foto }, w, h);
}

/**
 * @param {string} hojeIso
 * @param {{ chaves: { pexels?: string, pixabay?: string }, cache: import('../fotos.mjs').CacheDeFotos, opcoes?: object } | null} ctx `null` = sem fotos
 */
export async function produzirDatas(hojeIso, ctx = null) {
  const itens = [];
  for (const d of proximasDatas(hojeIso)) {
    const par = { landscape: null, portrait: null };
    if (ctx && d.foto) for (const o of ['landscape', 'portrait']) { try { par[o] = await buscarFoto(ctx.chaves, ctx.cache, d.foto, o, `d-${d.data}`, ctx.opcoes); } catch { par[o] = null; } }
    itens.push({ chave: `d-${d.data}`, nome: `${d.nome} — ${d.data.split('-').reverse().join('/')}`, descricao: d.mensagem, foto: d.foto,
      html: (w, h) => htmlData(d, hojeIso, w, h, par[h > w ? 'portrait' : 'landscape']) });
  }
  return { datas: itens };
}
