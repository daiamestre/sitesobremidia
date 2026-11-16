/**
 * P-34 (pedido do dono, 16/11/2026): o vídeo de ofertas no padrão do concorrente que gera vídeos com IA — trilha que abaixa
 * sob a voz, sirene/whoosh/impacto, chamas, estrelas, câmera na mão, explosão no preço, faixa diagonal, abertura e fechamento,
 * e o vídeo entregue pronto no fim do passo a passo.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { FUNDOS_DO_PALCO, chaveDaCena, chaveDaFala, palcoDoProduto, projetoDoCarrossel, transicaoDoProduto, vinhetaDoPalco } from '@/lib/studio/palco';
import { SONS, TRILHAS, impactoResolvido, trilhaDoSegmento } from '@/lib/studio/impacto';
import { MUSICA_SOB_A_VOZ, fatorDaVoz, inicios, type FaixaDeAudio } from '@/lib/studio/video/linha';
import { estadoNoTempo } from '@/lib/studio/animacao';
import type { Camada } from '@/lib/studio/documento';

const prod = (nome: string, preco: number) => ({ nome, preco, precoDe: null as number | null, unidade: 'UN', imagem: { url: 'https://x/y.png', fonte: 'OPENFOODFACTS' as const } });
const produtos = [prod('Arroz Camil 1kg', 4.99), prod('Feijão Camil 1kg', 6.49), prod('Óleo Soya 900ml', 7.99)];
const o = { fundo: FUNDOS_DO_PALCO[0], textoBotao: 'OFERTAS', loja: 'Mercado Bom Preço', movimento: {} };

describe('P-34: vídeo com impacto', () => {
  it('tudo já vem LIGADO, com a trilha do segmento; o cliente desliga ou troca', () => {
    const i = impactoResolvido(undefined, 'mercado', 'Mercado Bom Preço');
    expect(i).toMatchObject({ ligado: true, chamas: true, estrelas: true, camera: true, explosao: true, sons: true, sirene: true, vinhetas: true });
    expect(i.trilha?.id).toBe('varejo-dinamico');
    expect(i.textoAbertura).toBe('MERCADO BOM PREÇO\nOFERTAS IMPERDÍVEIS');
    expect(trilhaDoSegmento('farmacia').id).toBe('ukulele-feliz');
    // regra do dono: só trilhas gratuitas do Pixabay, com a licença registrada
    expect(fs.readFileSync('docs/licencas/TRILHAS_PIXABAY.md', 'utf8')).toContain('Pixabay Content License');
    for (const t of TRILHAS) expect(fs.readFileSync('docs/licencas/TRILHAS_PIXABAY.md', 'utf8')).toContain(`${t.id}.mp3`);
    expect(impactoResolvido({ desligado: true }, 'mercado').trilha).toBeNull();
    expect(impactoResolvido({ trilha: null }, 'mercado').trilha).toBeNull();
  });

  it('a arte do produto: chamas, estrelas, câmera e explosão; produto com MOLA alternando os lados; preço ESTOURA', () => {
    const d0 = palcoDoProduto(produtos[0], '9:16', { ...o, indice: 0 });
    const d1 = palcoDoProduto(produtos[1], '9:16', { ...o, indice: 1 });
    // F-319: com os efeitos REAIS (padrão), as chamas e a explosão desenhadas dão lugar às filmagens
    expect(d0.efeitos).toEqual({ chamas: false, estrelas: true, camera: true, explosao: false });
    expect(d0.camadas.filter((c) => c.tipo === 'efeito').map((c) => c.nome)).toEqual(expect.arrayContaining(['Brasas (efeito)', 'Fogo no chão (efeito)', 'Explosão do preço (efeito)']));
    expect(palcoDoProduto(produtos[0], '9:16', { ...o, movimento: { impacto: { reais: false } } }).efeitos).toEqual({ chamas: true, estrelas: true, camera: true, explosao: true });
    expect(d0.camadas.find((c) => c.nome === 'Produto')?.animacao?.tipo).toBe('mola-esquerda');
    expect(d1.camadas.find((c) => c.nome === 'Produto')?.animacao?.tipo).toBe('mola-direita');
    expect(d0.camadas.find((c) => c.nome === 'Preço')?.animacao?.tipo).toBe('estourar');
    // o que o cliente escolheu à mão continua valendo; desligado = o palco de antes
    expect(palcoDoProduto(produtos[0], '9:16', { ...o, movimento: { preco: 'zoom' } }).camadas.find((c) => c.nome === 'Preço')?.animacao?.tipo).toBe('zoom');
    expect(palcoDoProduto(produtos[0], '9:16', { ...o, movimento: { impacto: { desligado: true } } }).efeitos).toBeUndefined();
  });

  it('o preço estoura: passa do ponto, leva o soco e assenta', () => {
    const c = { animacao: { tipo: 'estourar', atraso: 0.9, duracao: 0.5 }, w: 200, h: 200 } as unknown as Camada;
    expect(estadoNoTempo(c, 0.8).escala).toBeLessThan(0.01);
    const pico = Math.max(...[1.1, 1.15, 1.2, 1.25].map((t) => estadoNoTempo(c, t).escala));
    expect(pico).toBeGreaterThan(1.1);
    expect(estadoNoTempo(c, 1.4).escala).toBeCloseTo(1, 1);
  });

  it('abertura e fechamento: a frase grande e a logo chegando gigante, sem produto nem preço', () => {
    const ab = vinhetaDoPalco('abertura', produtos[0], '9:16', o, 2.8);
    const nomes = ab.camadas.map((c) => c.nome);
    expect(nomes).toContain('Frase da abertura');
    expect(nomes).not.toContain('Produto');
    expect(nomes).not.toContain('Preço');
    expect(ab.camadas.find((c) => c.nome === 'Logo do palco')).toMatchObject({ opacidade: 1, animacao: { tipo: 'chegar-gigante' } });
    expect((ab.camadas.find((c) => c.nome === 'Fundo oficial') as { src: string }).src).toContain('-st.webp');
    const fe = vinhetaDoPalco('fechamento', produtos[0], '9:16', o, 3.4);
    expect((fe.camadas.find((c) => c.nome === 'Frase do fechamento') as { texto: string }).texto).toBe('APROVEITE!\nMERCADO BOM PREÇO');
  });

  it('o vídeo: abertura → produtos → fechamento, faixa diagonal, a trilha e os efeitos sonoros no tempo certo', () => {
    const p = projetoDoCarrossel(produtos, '9:16', o);
    expect(p.clipes.map((c) => c.nome)).toEqual(['Abertura', ...produtos.map((x) => x.nome), 'Fechamento']);
    expect(transicaoDoProduto({}, 'x')).toBe('faixa');
    expect(p.clipes[1].transicao.tipo).toBe('faixa');
    const trilha = p.audios.find((a) => a.id.startsWith('trilha-'));
    expect(trilha).toMatchObject({ src: '/studio/trilhas/varejo-dinamico.mp3', repetir: true, abaixarComVoz: true, fim: 115 });
    const sons = p.sons ?? [];
    const ini = inicios(p.clipes);
    expect(sons[0]).toMatchObject({ som: 'sirene' });
    expect(sons.filter((s) => s.som === 'whoosh')).toHaveLength(p.clipes.length - 1 + 1); // + a logo da campanha caindo (F-317)
    expect(sons.filter((s) => s.som === 'impacto').length).toBe(1 + produtos.length + 1); // a frase da abertura + cada preço + a batida da logo (F-317)
    expect(sons.some((s) => s.som === 'caixa' && s.em > ini[ini.length - 1])).toBe(true);
    // sem efeitos sonoros / sem trilha
    const quieto = projetoDoCarrossel(produtos, '9:16', { ...o, movimento: { impacto: { sons: false, trilha: null } } });
    expect(quieto.sons).toBeUndefined();
    expect(quieto.audios.some((x) => x.id.startsWith('trilha-'))).toBe(false);
  });

  it('com locução: a fala de abertura vai na ABERTURA e a trilha abaixa para 30% sob a voz, sem degrau', () => {
    const fala = { url: 'https://r2/fala.mp3', dur: 2 };
    const p = projetoDoCarrossel(produtos, '9:16', { ...o, locucao: { abertura: fala, fechamento: fala, ofertas: { [chaveDaFala(produtos[0].nome)]: fala } } });
    const ini = inicios(p.clipes);
    const ab = p.audios.find((a) => a.nome === 'Locução · abertura')!;
    expect(ab.em).toBeLessThan(ini[1]);
    const voz: FaixaDeAudio[] = p.audios;
    expect(fatorDaVoz(voz, ab.em + 1)).toBe(MUSICA_SOB_A_VOZ);
    expect(fatorDaVoz(voz, ab.em - 0.1)).toBeGreaterThan(MUSICA_SOB_A_VOZ);
    expect(fatorDaVoz(voz, ab.em - 0.1)).toBeLessThan(1);
    expect(fatorDaVoz(voz, ab.em - 1)).toBe(1);
  });

  it('a biblioteca está no site (trilhas e sons nossos) e o motor mistura tudo com limitador', () => {
    for (const t of TRILHAS) expect(fs.existsSync(`public${t.src}`)).toBe(true);
    for (const s of Object.values(SONS)) expect(fs.existsSync(`public${s.src}`)).toBe(true);
    const motor = fs.readFileSync('src/lib/studio/video/motor.ts', 'utf8');
    expect(motor).toContain('createDynamicsCompressor');
    expect(motor).toContain('fatorDaVoz(p.audios, t)');
    expect(motor).toContain('this.agendarSons()');
    const desenho = fs.readFileSync('src/lib/studio/desenhar.ts', 'utf8');
    expect(desenho).toContain('desenharExplosaoAtras');
    expect(desenho).toContain('aplicarCamera');
  });

  it('o passo a passo tem a trilha e os efeitos e ENTREGA o vídeo pronto no fim', () => {
    const palco = fs.readFileSync('src/components/studio/PalcoDeOfertas.tsx', 'utf8');
    expect(palco).toContain('data-testid="assistente-impacto"');
    expect(palco).toContain('data-testid="palco-impacto"');
    expect(palco).toMatch(/setPedidoDeVideo\(\(n\) => n \+ 1\); lateral\.current/);
    expect(fs.readFileSync('src/pages/studioai/VideoEditorPage.tsx', 'utf8')).toContain("a.id.startsWith('trilha-')");
  });
  it('depois de criado, TUDO da abertura e do fechamento se edita, só naquela cena (logo, frase, entrada, saída, movimento)', () => {
    const ajustes = { '9:16': {
      [chaveDaCena('Logo do palco', 'abertura')]: { w: 999, animacao: { tipo: 'zoom' as const, atraso: 0, duracao: 0.5, saida: { tipo: 'sumir' as const, duracao: 0.4 } } },
      [chaveDaCena('Frase da abertura', 'abertura')]: { texto: 'SÓ ESSA SEMANA!', cor: '#ffd400' },
    } };
    const ab = vinhetaDoPalco('abertura', produtos[0], '9:16', { ...o, ajustes }, 2.8);
    expect(ab.camadas.find((c) => c.nome === 'Logo do palco')).toMatchObject({ w: 999, animacao: { tipo: 'zoom', saida: { tipo: 'sumir' } } });
    expect(ab.camadas.find((c) => c.nome === 'Frase da abertura')).toMatchObject({ texto: 'SÓ ESSA SEMANA!', cor: '#ffd400' });
    // o fechamento e os produtos não mudam
    const fe = vinhetaDoPalco('fechamento', produtos[0], '9:16', { ...o, ajustes }, 3.4);
    expect(fe.camadas.find((c) => c.nome === 'Logo do palco')?.w).not.toBe(999);
    expect(palcoDoProduto(produtos[0], '9:16', { ...o, ajustes }).camadas.find((c) => c.nome === 'Logo do palco')?.w).not.toBe(999);
    const palco = fs.readFileSync('src/components/studio/PalcoDeOfertas.tsx', 'utf8');
    expect(palco).toContain('palco-cena-');
    expect(palco).toContain("if (nome === 'Abertura' || nome === 'Fechamento')");
  });
  it('F-317: a logo 3D da CAMPANHA cai do céu na abertura, quebra a parede e pega fogo (whoosh + impacto)', () => {
    const ab = vinhetaDoPalco('abertura', produtos[0], '9:16', { ...o, movimento: { impacto: { campanha: 'queima-de-estoque', complemento: 'só sábado' } } }, 2.8);
    const logo = ab.camadas.find((c) => c.nome === 'Logo da campanha') as { src: string; animacao: { tipo: string } };
    expect(logo.src.startsWith('logo3d:')).toBe(true);
    expect(decodeURIComponent(logo.src)).toContain('QUEIMA');
    expect(decodeURIComponent(logo.src)).toContain('SÓ SÁBADO');
    expect(logo.animacao.tipo).toBe('cair-do-ceu');
    expect(ab.efeitos).toMatchObject({ quebra: true, fogo: false });
    // F-319: explosão, fogo e fumaça REAIS na batida
    const nomes = ab.camadas.map((c) => c.nome);
    expect(nomes.indexOf('Explosão da logo (efeito)')).toBeLessThan(nomes.indexOf('Logo da campanha'));
    expect(nomes.indexOf('Fogo na logo (efeito)')).toBeLessThan(nomes.indexOf('Logo da campanha'));
    // a poeira sobe POR TRÁS (na frente desbotava as letras); as chamas da parte de baixo ficam NA FRENTE
    expect(nomes.indexOf('Fumaça da batida (efeito)')).toBeLessThan(nomes.indexOf('Logo da campanha'));
    expect(nomes.indexOf('Chamas na frente da logo (efeito)')).toBeGreaterThan(nomes.indexOf('Logo da campanha'));
    expect(nomes).not.toContain('Explosão do preço (efeito)');
    expect(vinhetaDoPalco('abertura', produtos[0], '9:16', { ...o, movimento: { impacto: { reais: false } } }, 2.8).efeitos).toMatchObject({ quebra: true, fogo: true });
    // o padrão é o FECHA MÊS; sem campanha, não tem logo
    expect(decodeURIComponent((vinhetaDoPalco('abertura', produtos[0], '9:16', o, 2.8).camadas.find((c) => c.nome === 'Logo da campanha') as { src: string }).src)).toContain('FECHA');
    expect(vinhetaDoPalco('abertura', produtos[0], '9:16', { ...o, movimento: { impacto: { campanha: null } } }, 2.8).camadas.some((c) => c.nome === 'Logo da campanha')).toBe(false);
    const p = projetoDoCarrossel(produtos, '9:16', o);
    const s0 = (p.sons ?? []).filter((x) => x.em < 1.2).map((x) => x.som);
    expect(s0).toEqual(expect.arrayContaining(['sirene', 'whoosh', 'impacto']));
  });
  it('pedido do dono: a faixa ALERTA DE OFERTA passa para a DIREITA e a placa do fundo não tem mais "YOUR LOGO"', () => {
    const d = palcoDoProduto(produtos[0], '9:16', o);
    expect(d.camadas.find((c) => c.nome === 'Faixa 1')).toMatchObject({ letreiro: { sentido: 'direita' } });
    expect(fs.readFileSync('src/lib/studio/desenhar.ts', 'utf8')).toContain("l.sentido === 'direita'");
  });
});
