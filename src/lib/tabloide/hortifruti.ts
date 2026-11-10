/**
 * F-291 — PEDIDO DE HORTIFRÚTI (regra do dono): fruta, legume, verdura, tempero fresco, cogumelo e ovos digitados SEM marca recebem
 * SÓ foto do hortifrúti (a fruta/legume de verdade), nunca a de um industrializado com a mesma palavra:
 *   "Uva" nunca vira Refrigerante Fanta Uva; "Caju" nunca vira cachaça Pitú Cajú; "Ovos" nunca vira Macarrão com Ovos;
 *   "Mandioca" nunca vira Farinha de Mandioca; "Abacaxi" nunca vira Refrigerante Jaboti; "Batata Doce" nunca vira snack.
 * Nome curto ("Banana", "Laranja", "Uva") recebe a variedade TRADICIONAL (Banana Prata, Laranja Pera…).
 */

const sem = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const palavras = (nome: string) => sem(nome).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);

/** a 1ª palavra que diz que é hortifrúti */
const BASE = new Set(('abacate abacaxi ervilha abobora abobrinha acelga acerola agriao aipim aipo alface alho alho-poro ameixa amora atemoia banana batata berinjela beterraba '
  + 'brocolis brocolo caju caqui cara carambola cebola cebolinha cenoura cereja cheiro chuchu xuxu coco coentro cogumelo couve couve-flor espinafre figo framboesa gengibre goiaba '
  + 'graviola hortela inhame jabuticaba jaca jilo kiwi laranja lichia lima limao maca macaxeira mamao mandioca mandioquinha manga manjericao maracuja maxixe melancia melao mexerica '
  + 'milho mirtilo morango nabo nectarina ovo ovos pepino pera pessego pimenta pimentao pinha pitaya quiabo rabanete repolho roma rucula salsa salsao salsinha tangerina tomate uva vagem').split(' '));
/** o que pode vir junto sem virar outro produto (variedade, cor, forma de venda) */
const JUNTO = new Set(('de da do das dos e com em a o kg g un unid unidade unidades bandeja maco maço pe cacho duzia organico organica organicos higienizado higienizada '
  + 'roxa roxo branca branco verde verdes vermelha vermelho vermelhos amarela amarelo rosada rosa preta preto doce azedo azeda lima pera bahia prata nanica terra maca '
  + 'dedo moca biquinho cravo persia paulista ouro portuguesa argentina torta orange perola crespa americana lisa manteiga siciliano taiti fuji gala formosa papaya espada palmer tommy murcote ponkan williams crimson thompson vitoria niagara itália italia italiano japones '
  + 'japonesa cereja champignon shimeji shitake baroa cabotia cabotiá moranga paulista caipira extra grande pequeno pequena miudo graudo seco verde-cana flor poro poró baby mini '
  + 'brancos vermelhos caipiras galinha cozinha cozida').split(' '));

/** é fruta/legume/verdura/ovos SEM marca (todas as palavras são de hortifrúti)? */
export function ehPedidoDeHortifruti(nome: string): boolean {
  const p = palavras(nome).filter((w) => !/^\d+([,.]\d+)?(kg|g|un)?$/.test(w));
  if (!p.length || !BASE.has(p[0])) return false;
  return p.every((w) => BASE.has(w) || JUNTO.has(w));
}

/** nome curto → a variedade tradicional (a que o brasileiro chama só pelo nome) */
const TRADICIONAL: Record<string, string> = {
  banana: 'Banana Prata', laranja: 'Laranja Pera', limao: 'Limão Taiti', maca: 'Maçã Gala', mamao: 'Mamão Formosa', uva: 'Uva Vitória', manga: 'Manga Tommy',
  pimentao: 'Pimentão Verde', pimenta: 'Pimenta Dedo-de-moça', repolho: 'Repolho Verde', abobora: 'Abóbora Cabotiá', milho: 'Milho Verde', couve: 'Couve Manteiga', alface: 'Alface Crespa',
  ovo: 'Ovos Brancos', ovos: 'Ovos Brancos', 'ovos de galinha': 'Ovos Brancos', mexerica: 'Mexerica Murcote', tangerina: 'Tangerina Ponkan', goiaba: 'Goiaba Vermelha',
  maracuja: 'Maracujá Azedo', melao: 'Melão Amarelo', pera: 'Pera Williams', abacaxi: 'Abacaxi Pérola', coco: 'Coco Verde', cogumelo: 'Cogumelo Champignon',
  aipim: 'Mandioca', macaxeira: 'Mandioca', xuxu: 'Chuchu', salsinha: 'Salsa', 'cheiro verde': 'Cheiro-verde', 'batata inglesa': 'Batata', mandioquinha: 'Batata Baroa',
  'batata salsa': 'Batata Baroa', aipo: 'Salsão', 'alho poro': 'Alho-poró', brocolo: 'Brócolis', 'pimentao vermelho': 'Pimentão Vermelho', 'pimentao amarelo': 'Pimentão Amarelo',
  'tomate italiano': 'Tomate Italiano', 'tomate cereja': 'Tomate Cereja', 'cebola roxa': 'Cebola Roxa', 'batata doce rosada': 'Batata Doce Roxa',
};

/** o nome do produto de hortifrúti que vale para o pedido (a variedade tradicional) ou o próprio nome; null se não é hortifrúti */
export function nomeTradicionalDoHortifruti(nome: string): string | null {
  if (!ehPedidoDeHortifruti(nome)) return null;
  const chave = palavras(nome).filter((w) => !/^\d/.test(w) && !['kg', 'g', 'un', 'unid', 'unidade', 'unidades', 'bandeja', 'maco', 'maço', 'de', 'da', 'do'].includes(w)).join(' ');
  return TRADICIONAL[chave] ?? null;
}
