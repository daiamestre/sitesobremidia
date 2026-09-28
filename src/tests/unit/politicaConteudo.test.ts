import { describe, it, expect } from 'vitest';
import { decidir, normalizar, procurarTermos, type Sinais } from '../../../supabase/functions/_shared/politicaConteudo';

// F-111 — política do analisador próprio (sem IA externa).
const limpo = { t: 0, porn: 0.02, hentai: 0.05, sexy: 0, neutral: 0.14, drawing: 0.78 };
const video = (over: Partial<Sinais> = {}): Sinais => ({
  tipo: 'video',
  visao: { ok: true, duracao: 8, tem_audio: true, quadros: [limpo, { ...limpo, t: 2 }], textos: ['PROMOCAO DE VITAMINAS'] },
  audio: { ok: true, texto: 'Vem para a farmácia capital do Agreste. Nesta semana, vitaminas com 20% de desconto.' },
  ...over,
});
const lim = { duracaoMaxima: 20 };

describe('normalizar e procurar termos', () => {
  it('tira acento, troca números por letras e junta letras repetidas', () => {
    expect(normalizar('PÔRNÔÔÔ  P0rn0! R$ 10')).toBe('porno pornoi rs');
    expect(procurarTermos('put@ria')[0]).toMatchObject({ gravidade: 'recusar' });
  });
  it('palavra proibida inteira recusa; colada só manda revisar; frase de exclusão recusa', () => {
    expect(procurarTermos('o melhor vídeo pornô da cidade')[0]).toMatchObject({ categoria: 'sexual', gravidade: 'recusar' });
    expect(procurarTermos('o melhor vídeo por no da cidade')[0]).toMatchObject({ gravidade: 'revisar', como: 'colado' });
    expect(procurarTermos('Entrada proibida para negros')[0]).toMatchObject({ categoria: 'discriminacao', gravidade: 'recusar', como: 'frase' });
    expect(procurarTermos('Não atendemos gays')[0]).toMatchObject({ gravidade: 'recusar' });
  });
  it('não confunde anúncio comum: "por nove reais", "baseado em", "pelada de domingo" não recusam', () => {
    expect(procurarTermos('Pizza por nove reais').filter((t) => t.gravidade === 'recusar')).toHaveLength(0);
    expect(procurarTermos('Preço baseado em pesquisa').filter((t) => t.gravidade === 'recusar')).toHaveLength(0);
    expect(procurarTermos('Promoção de vitaminas, 20% de desconto, sem glúten')).toHaveLength(0);
  });
});

describe('decidir', () => {
  it('anúncio limpo é aprovado', () => {
    expect(decidir(video(), lim)).toMatchObject({ decisao: 'APROVADA', motivo: null });
  });
  it('vídeo acima de 20 s é recusado', () => {
    const r = decidir(video({ visao: { ...video().visao!, duracao: 25 } }), lim);
    expect(r.decisao).toBe('RECUSADA');
    expect(r.motivo).toContain('o limite é 20 segundos');
  });
  it('nudez forte recusa; moderada ou sensual manda revisar', () => {
    const q = (porn: number, sexy = 0) => video({ visao: { ...video().visao!, quadros: [limpo, { t: 4, porn, hentai: 0, sexy }] } });
    expect(decidir(q(0.9), lim)).toMatchObject({ decisao: 'RECUSADA', motivo: 'A mídia contém nudez ou conteúdo sexual.' });
    expect(decidir(q(0.4), lim).decisao).toBe('DUVIDA');
    expect(decidir(q(0.1, 0.8), lim).decisao).toBe('DUVIDA');
  });
  it('fala proibida recusa sem repetir o palavrão para o cliente', () => {
    const r = decidir(video({ audio: { ok: true, texto: 'assista o melhor vídeo pornô da cidade' } }), lim);
    expect(r.decisao).toBe('RECUSADA');
    expect(r.motivo).toBe('A fala da mídia contém linguagem sexual explícita.');
    expect(r.achados[0].detalhe).toContain('porno');
  });
  it('texto racista na imagem recusa', () => {
    const r = decidir({ tipo: 'imagem', visao: { ok: true, duracao: null, quadros: [limpo], textos: ['ENTRADA PROIBIDA PARA NEGROS'] }, audio: null }, lim);
    expect(r).toMatchObject({ decisao: 'RECUSADA', motivo: 'O texto da imagem contém termo racista, discriminatório ou de ódio.' });
  });
  it('falha na análise nunca aprova: vai para a equipe', () => {
    expect(decidir(video({ visao: { ok: false, erro: 'tempo esgotado', duracao: null, quadros: [], textos: [] } }), lim).decisao).toBe('DUVIDA');
    expect(decidir(video({ audio: null }), lim).decisao).toBe('DUVIDA');
    expect(decidir(video({ audio: null, visao: { ...video().visao!, tem_audio: false } }), lim).decisao).toBe('APROVADA');
  });
});
