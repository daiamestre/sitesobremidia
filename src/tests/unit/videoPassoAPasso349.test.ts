/**
 * F-349 (pedido do dono, 19/11/2026) — vídeo com locução pelo passo a passo:
 *  1) Logo e fundo (logo da PROMOÇÃO, logo 3D que abre o vídeo, fundo e formato) · 2) Sua empresa (nome e a logo DELA) ·
 *  3) Produtos · 4) Edição do vídeo (só música, frases e efeitos) · 5) Locução;
 *  a prévia do passo a passo no tamanho certo no celular (não ocupa a tela toda), sem zoom do iPhone ao tocar num campo;
 *  a logo da empresa fecha o vídeo; a prévia tenta de novo a imagem (o fundo) que falhou.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { FUNDOS_DO_PALCO, vinhetaDoPalco } from '@/lib/studio/palco';

const palco = fs.readFileSync('src/components/studio/PalcoDeOfertas.tsx', 'utf8');
const impacto = fs.readFileSync('src/components/studio/PainelDeImpacto.tsx', 'utf8');
const previa = fs.readFileSync('src/components/studio/PreviaDocumento.tsx', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const produto = { nome: 'Naldecon Multi 16 comprimidos', preco: 19.9, precoDe: 24.9, unidade: null, imagem: null };

describe('F-349 — passo a passo do vídeo', () => {
  it('as etapas na ordem pedida pelo dono', () => {
    const ids = [...palco.matchAll(/^ {8}id: '([a-z]+)', titulo: '([^']+)'/gm)].map((m) => m[1]);
    // F-353 (dono): não existe mais a etapa de edição do vídeo; música junto do locutor
    expect(ids).toEqual(['visual', 'loja', 'produtos', 'locucao']);
  });

  it('1ª etapa: logo da promoção, logo que abre o vídeo e fundo; 2ª: a logo da EMPRESA', () => {
    const visual = palco.slice(palco.indexOf("id: 'visual'"), palco.indexOf("id: 'loja'"));
    expect(visual).toContain("'assistente-logo'");
    expect(visual).toContain('<ComecoDoVideo');
    expect(visual).toContain('<FrasesDoVideo');
    expect(visual).toContain('<EscolhaDoBalao');
    expect(visual).toContain('data-testid="assistente-fundo"');
    const loja = palco.slice(palco.indexOf("id: 'loja'"), palco.indexOf("id: 'produtos'"));
    expect(loja).toContain("'assistente-logo-da-loja'");
    expect(loja).not.toContain('setTrocandoLogo(true)');
  });

  it('F-353: a 4ª etapa é locutor e música (com o som de dinheiro), e a etapa de edição do vídeo não existe mais', () => {
    const loc = palco.slice(palco.indexOf("id: 'locucao'"), palco.indexOf('const etapas') > 0 ? palco.indexOf('return (', palco.indexOf("id: 'locucao'")) : undefined);
    expect(loc).toContain('<PainelDeLocucao');
    expect(loc).toContain('<MusicaDoVideo');
    expect(palco).not.toContain("id: 'edicao'");
    expect(impacto).toContain('data-testid="assistente-dinheiro"');
  });

  it('a prévia não é filha direta da grade (a regra do celular anulava o tamanho dela)', () => {
    expect(palco).toMatch(/<div className=\{primeiro \? 'order-first sm:order-none' : undefined\}>\s*<div className="mx-auto w-full max-w-\[170px\]/);
  });

  it('o iPhone não dá zoom ao tocar num campo de texto', () => {
    expect(html).toContain('maximum-scale=1');
    expect(html).toMatch(/iP\(hone\|ad\|od\)/);
  });

  it('a prévia tenta de novo a imagem que falhou (o fundo não fica preto)', () => {
    expect(previa).toMatch(/faltam && vez < 4/);
  });

  it('o fechamento termina com a logo da empresa do cliente (no lugar da logo da campanha)', () => {
    const fundo = FUNDOS_DO_PALCO.find((f) => f.id === 'saude-em-oferta')!;
    const com = vinhetaDoPalco('fechamento', produto, '9:16', { fundo, logoDaLoja: { url: '/minha-logo.png' } }, 3.4);
    const logo = com.camadas.find((c) => c.nome === 'Logo da loja');
    expect(logo && logo.tipo === 'imagem' && logo.src).toBe('/minha-logo.png');
    expect(com.camadas.some((c) => c.nome === 'Logo da campanha')).toBe(false);
    const sem = vinhetaDoPalco('fechamento', produto, '9:16', { fundo }, 3.4);
    expect(sem.camadas.some((c) => c.nome === 'Logo da loja')).toBe(false);
    // a abertura continua com a logo da campanha
    const ab = vinhetaDoPalco('abertura', produto, '9:16', { fundo, logoDaLoja: { url: '/minha-logo.png' } }, 3.6);
    expect(ab.camadas.some((c) => c.nome === 'Logo da loja')).toBe(false);
  });
});
