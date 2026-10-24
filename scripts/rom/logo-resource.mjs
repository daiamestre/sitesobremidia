// F-214 — logo de inicialização da ROM. A primeira imagem ao ligar a TV Box (antes do Android) é o "logo.bmp" guardado
// na partição resource da Rockchip (formato RSCE: cabeçalho + tabela "ENTR" com nome, bloco e tamanho de cada arquivo).
// Na ROM base ela mostra "SELENGA". Aqui ela é trocada pela da Sobre Mídia NO MESMO LUGAR, com o mesmo tamanho e o mesmo
// formato de BMP (largura, altura e cores): a tabela, o kernel (rk-kernel.dtb) e o resto da partição ficam idênticos.

/** Arquivos da partição resource: [{ nome, inicio (bytes), tamanho }]. */
export function arquivosDoResource(res) {
  if (res.toString('latin1', 0, 4) !== 'RSCE') throw new Error('resource sem o cabeçalho RSCE');
  const tabela = res[9], blocos = res[10];
  const lista = [];
  for (let i = 0; ; i++) {
    const p = (tabela + i * blocos) * 512;
    if (p + 268 > res.length || res.toString('latin1', p, p + 4) !== 'ENTR') break;
    lista.push({ nome: res.toString('latin1', p + 4, p + 260).split('\0')[0], inicio: res.readUInt32LE(p + 260) * 512, tamanho: res.readUInt32LE(p + 264) });
  }
  return lista;
}

/** Largura, altura e bits por ponto de um BMP. */
export function medidasDoBmp(b) {
  if (b.toString('latin1', 0, 2) !== 'BM') throw new Error('não é BMP');
  return { largura: b.readInt32LE(18), altura: b.readInt32LE(22), bits: b.readUInt16LE(28), inicioDosPontos: b.readUInt32LE(10) };
}

/** Devolve uma cópia da partição com o logo.bmp trocado. O novo BMP tem de ter o mesmo tamanho e as mesmas medidas. */
export function trocarLogo(res, novo) {
  const logo = arquivosDoResource(res).find((a) => a.nome === 'logo.bmp');
  if (!logo) throw new Error('logo.bmp não encontrado na partição resource');
  const antigo = res.subarray(logo.inicio, logo.inicio + logo.tamanho);
  const a = medidasDoBmp(antigo), b = medidasDoBmp(novo);
  if (novo.length !== logo.tamanho || a.largura !== b.largura || a.altura !== b.altura || a.bits !== b.bits) {
    throw new Error(`a logo nova tem de ser BMP ${a.largura}x${a.altura} de ${a.bits} bits com ${logo.tamanho} bytes (veio ${b.largura}x${b.altura}, ${b.bits} bits, ${novo.length} bytes)`);
  }
  const saida = Buffer.from(res);
  novo.copy(saida, logo.inicio);
  return saida;
}

/** O resource gerado só difere do original dentro do logo.bmp, e a logo nova é um BMP válido com as mesmas medidas? */
export function soALogoMudou(original, gerado) {
  if (original.length !== gerado.length) return false;
  const logo = arquivosDoResource(original).find((a) => a.nome === 'logo.bmp');
  if (!logo) return false;
  const fora = (b) => Buffer.concat([b.subarray(0, logo.inicio), b.subarray(logo.inicio + logo.tamanho)]);
  if (!fora(original).equals(fora(gerado))) return false;
  const a = medidasDoBmp(original.subarray(logo.inicio)), b = medidasDoBmp(gerado.subarray(logo.inicio));
  return a.largura === b.largura && a.altura === b.altura && a.bits === b.bits;
}
