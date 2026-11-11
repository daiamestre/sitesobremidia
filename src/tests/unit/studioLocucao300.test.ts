/** F-300 (pedido do dono, 11/11/2026): o LOCUTOR — roteiro automático (loja + produtos + preços por extenso), 5 vozes. */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { VOZES_DO_LOCUTOR, aberturaPadrao, fechamentoPadrao, fraseDaOferta, nomeFalado, porExtenso, precoFalado, roteiroDaLocucao, unidadeFalada, vozPadraoDo } from '@/lib/studio/locucao';

describe('F-300: números e preços como o locutor fala', () => {
  it('por extenso', () => {
    expect(porExtenso(0)).toBe('zero');
    expect(porExtenso(16)).toBe('dezesseis');
    expect(porExtenso(99)).toBe('noventa e nove');
    expect(porExtenso(100)).toBe('cem');
    expect(porExtenso(101)).toBe('cento e um');
    expect(porExtenso(1899)).toBe('mil oitocentos e noventa e nove');
    expect(porExtenso(2000)).toBe('dois mil');
    expect(porExtenso(1050)).toBe('mil e cinquenta');
  });
  it('preço', () => {
    expect(precoFalado(4.75)).toBe('quatro e setenta e cinco');
    expect(precoFalado(24.99)).toBe('vinte e quatro e noventa e nove');
    expect(precoFalado(5)).toBe('cinco reais');
    expect(precoFalado(1)).toBe('um real');
    expect(precoFalado(0.99)).toBe('noventa e nove centavos');
    expect(precoFalado(1899.9)).toBe('mil oitocentos e noventa e nove e noventa');
  });
  it('unidade e nome', () => {
    expect(unidadeFalada('KG')).toBe(' o quilo');
    expect(unidadeFalada('UN')).toBe('');
    expect(nomeFalado('Arroz Tio João 5kg')).toBe('Arroz Tio João, cinco quilos');
    expect(nomeFalado('Café Pilão 500g')).toBe('Café Pilão, quinhentos gramas');
    expect(nomeFalado('Coca-Cola 2L')).toBe('Coca-Cola, dois litros');
    expect(nomeFalado('Feijão Carioca Camil 1kg')).toBe('Feijão Carioca Camil, um quilo');
    expect(nomeFalado('Cerveja Heineken Lata 350ml')).toBe('Cerveja Heineken Lata, trezentos e cinquenta mililitros');
  });
  it('frase da oferta', () => {
    expect(fraseDaOferta({ nome: 'Arroz Tio João 5kg', preco: 24.99 })).toBe('Arroz Tio João, cinco quilos, por apenas vinte e quatro e noventa e nove!');
    expect(fraseDaOferta({ nome: 'Picanha Bovina', preco: 59.9, unidade: 'KG' })).toBe('Picanha Bovina, por apenas cinquenta e nove e noventa o quilo!');
    expect(fraseDaOferta({ nome: 'Leite Italac 1L', preco: 4.79, precoDe: 5.99 })).toBe('Leite Italac, um litro, de cinco e noventa e nove, por apenas quatro e setenta e nove!');
  });
});

describe('F-300: roteiro com o nome da loja', () => {
  it('abertura e fechamento por segmento (farmácia e adega com o aviso obrigatório)', () => {
    expect(aberturaPadrao('mercado', 'Mercadinho Economia')).toBe('Vem conferir as ofertas do Mercadinho Economia!');
    expect(aberturaPadrao('farmacia', 'Farmácia São João')).toBe('Vem conferir as ofertas da Farmácia São João!');
    expect(aberturaPadrao('mercado', '')).toBe('Vem conferir as ofertas do seu supermercado!');
    expect(fechamentoPadrao('farmacia', '')).toContain('A persistirem os sintomas, o médico deverá ser consultado.');
    expect(fechamentoPadrao('adega', '')).toContain('Beba com moderação');
  });
  it('roteiro: abertura + uma frase por produto + fechamento; o texto reescrito pela pessoa vale', () => {
    const r = roteiroDaLocucao({ segmento: 'mercado', loja: 'Mercadinho Economia', produtos: [{ nome: 'Arroz 5kg', preco: 20 }, { nome: 'Feijão 1kg', preco: 6.99 }], textos: { 'oferta:feijão 1kg': 'Feijão fresquinho!' } });
    expect(r.map((f) => f.tipo)).toEqual(['abertura', 'oferta', 'oferta', 'fechamento']);
    expect(r[1].texto).toBe('Arroz, cinco quilos, por apenas vinte reais!');
    expect(r[2].texto).toBe('Feijão fresquinho!');
  });
  it('5 vozes, cada uma com a frase de exemplo gravada; farmácia é voz feminina', () => {
    expect(VOZES_DO_LOCUTOR).toHaveLength(5);
    for (const v of VOZES_DO_LOCUTOR) expect(fs.existsSync(`public${v.amostra}`), v.amostra).toBe(true);
    expect(VOZES_DO_LOCUTOR.find((v) => v.id === vozPadraoDo('farmacia'))?.genero).toBe('feminina');
  });
});

import { projetoDoCarrossel } from '@/lib/studio/palco';

describe('F-300: a locução entra no vídeo do palco', () => {
  it('cada produto fica no ar o tempo da fala; abertura antes da 1ª oferta e fechamento depois da última', () => {
    const produtos = [{ nome: 'Arroz 5kg', preco: 20, precoDe: null, unidade: null, imagem: null }, { nome: 'Feijão 1kg', preco: 6.99, precoDe: null, unidade: null, imagem: null }];
    const loc = { abertura: { url: 'https://x/a.mp3', dur: 3 }, fechamento: { url: 'https://x/f.mp3', dur: 2 }, ofertas: { 'oferta:arroz 5kg': { url: 'https://x/1.mp3', dur: 6 }, 'oferta:feijão 1kg': { url: 'https://x/2.mp3', dur: 4 } } };
    const p = projetoDoCarrossel(produtos as never, '9:16', { locucao: loc });
    expect(p.audios.map((a) => a.nome)).toEqual(['Locução · abertura', 'Locução · Arroz 5kg', 'Locução · Feijão 1kg', 'Locução · fechamento']);
    expect(p.clipes[0].duracao).toBeGreaterThan(3 + 6);       // abertura + fala do arroz
    expect(p.audios[1].em).toBeGreaterThan(p.audios[0].em + 3); // a oferta começa depois da abertura
    expect(p.audios.every((a) => a.id.startsWith('loc-'))).toBe(true);
    expect(projetoDoCarrossel(produtos as never, '9:16', {}).audios).toHaveLength(0);
  });
  it('o painel de locução está no palco e o editor aceita as falas do palco', () => {
    const palco = fs.readFileSync('src/components/studio/PalcoDeOfertas.tsx', 'utf8');
    expect(palco).toContain('<PainelDeLocucao segmento={segmento} produtos={produtosDaLocucao} aoMudar={setLocucao} />');
    const editor = fs.readFileSync('src/pages/studioai/VideoEditorPage.tsx', 'utf8');
    expect(editor).toContain('audios: [...novo.audios.filter(ehLocucao), ...q.audios.filter((a) => !ehLocucao(a))]');
    const funcao = fs.readFileSync('supabase/functions/studio-locucao/index.ts', 'utf8');
    expect(funcao).toContain("Deno.env.get(k)");
    expect(funcao).toContain('TETO_DIA_LETRAS');
    expect(funcao).not.toMatch(/sk_[0-9a-f]{20,}/); // a chave nunca no código
  });
});

describe('F-301: exportação quadro a quadro (TV e painel de LED)', () => {
  it('motor monta MP4 H.264 + AAC quadro a quadro; o editor oferece a qualidade', () => {
    const motor = fs.readFileSync('src/lib/studio/video/motor.ts', 'utf8');
    expect(motor).toContain('async exportarQuadroAQuadro(');
    expect(motor).toContain("new OfflineAudioContext(2");
    expect(motor).toContain("codec: 'mp4a.40.2'");
    const editor = fs.readFileSync('src/pages/studioai/VideoEditorPage.tsx', 'utf8');
    expect(editor).toContain("{ id: '4k', nome: 'Máxima · 4K (painel grande)', o: { fps: 30, escala: 2 } }");
    expect(editor).toContain('motor.current!.exportarQuadroAQuadro(q.o');
  });
});
