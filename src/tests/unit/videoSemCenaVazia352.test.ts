/**
 * F-352 (pedido do dono, 20/11/2026):
 *  - "os vídeos criados pelo passo a passo não mostram os produtos": o MP4 começava a ser gravado sem esperar as fotos das
 *    cenas — a cena sem as fotos saía vazia. O motor agora espera TODAS as fotos (e tenta de novo as que falharam) antes de gravar;
 *  - "na etapa Logo e fundo aparece um vídeo e não a logo e os fundos": o Palco desenhado não tinha nada para escolher e a
 *    prévia vinha antes das escolhas no celular. Agora: escolhas primeiro, fundos para escolher e o título da promoção;
 *  - o "SUA LOGO AQUI" do Palco desenhado vira a logo da empresa escolhida no passo 2.
 */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { palcoDoProduto, projetoDoCarrossel } from '@/lib/studio/palco';
import type { Documento } from '@/lib/studio/documento';

const motor = fs.readFileSync('src/lib/studio/video/motor.ts', 'utf8');
const palco = fs.readFileSync('src/components/studio/PalcoDeOfertas.tsx', 'utf8');
const logo3d = fs.readFileSync('src/lib/studio/logo3d.ts', 'utf8');
const produto = { nome: 'Feijão Carioca Camil 1kg', preco: 6.49, precoDe: 8.99, unidade: 'UN', imagem: { url: 'https://x/y.png', fonte: 'MARCA' as const } };

describe('F-352: vídeo sem cena vazia e passo 1 com escolhas', () => {
  it('as DUAS gravações (quadro a quadro e tocando) esperam todas as fotos antes de gravar', () => {
    expect(motor).toMatch(/async aguardarMidias\(/);
    const qa = motor.slice(motor.indexOf('async exportarQuadroAQuadro('), motor.indexOf('const plano = await escolherCodificacao'));
    expect(qa).toContain('await this.aguardarMidias()');
    const rt = motor.slice(motor.indexOf('async exportar(aoProgredir'), motor.indexOf('this.ligarSom();', motor.indexOf('async exportar(aoProgredir')));
    expect(rt).toContain('await this.aguardarMidias()');
    // tenta de novo as fotos que faltaram (cada cena confere TODAS as imagens dela)
    expect(motor).toMatch(/imagensDo\(a\.doc\)\.some\(\(s\) => !a\.imgs!\.has\(s\)\)/);
    expect(motor).toMatch(/this\.preparando = Promise\.all\(pend\)/);
  });

  it('tela sem tamanho não derruba o desenho da logo 3D', () => {
    expect(logo3d).toContain("!ctx.canvas.width || !ctx.canvas.height) return;");
  });

  it('passo 1: as escolhas vêm antes da prévia; o Palco desenhado mostra os fundos e o título', () => {
    const visual = palco.slice(palco.indexOf("id: 'visual'"), palco.indexOf("id: 'loja'"));
    expect(visual).toContain('{previaDoPasso(false)}');
    expect(visual).toContain('{escolhaDosFundos}');
    expect(visual).toContain('data-testid="assistente-titulo"');
    expect(palco).toMatch(/const escolhaDosFundos = !fundo && \(/);
    expect(palco).toMatch(/onClick=\{\(\) => trocarFundo\(f\.id\)\}/);
  });

  it('Palco desenhado: a logo da empresa entra no lugar do "SUA LOGO AQUI", na prévia e no vídeo', () => {
    const d = palcoDoProduto(produto, '9:16', { fundo: null, logoUrl: '/minha-logo.png' });
    expect(d.camadas.some((c) => c.nome === 'Logo' && c.tipo === 'imagem' && c.src === '/minha-logo.png')).toBe(true);
    expect(d.camadas.some((c) => c.nome === 'Sua logo')).toBe(false);
    const p = projetoDoCarrossel([produto, produto], '9:16', { fundo: null, logoUrl: '/minha-logo.png' });
    const docs = p.clipes.map((c) => c.documento).filter(Boolean) as Documento[];
    expect(docs.filter((x) => x.camadas.some((c) => c.nome === 'Logo' && c.tipo === 'imagem')).length).toBeGreaterThanOrEqual(2);
    expect(palco).toContain('logoUrl={logoDaLoja?.url ?? null}');
  });
});
