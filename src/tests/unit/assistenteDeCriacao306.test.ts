/**
 * F-306 (pedido do dono, 12/11/2026): ASSISTENTE passo a passo (fácil, no celular) entre a escolha do modelo e a tela de
 * edição que já existe (que não muda). Palco: Produtos → Sua loja (nome, logo, tela) → Locução (opcional) → Revisar →
 * "Criar meu vídeo" → edição de sempre, com "Visualizar vídeo e salvar". Encarte: Produtos → Sua loja → "Criar meu encarte".
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const palco = fs.readFileSync('src/components/studio/PalcoDeOfertas.tsx', 'utf8');
const encartes = fs.readFileSync('src/components/studio/PastaDeEncartes.tsx', 'utf8');
const assistente = fs.readFileSync('src/components/studio/AssistenteDeCriacao.tsx', 'utf8');

describe('F-306: assistente de criação', () => {
  it('escolher o modelo abre o assistente na etapa 1 (palco e encarte)', () => {
    expect(palco).toContain("p.set('assistente', '1'); p.set('passo', '1');");
    expect(encartes).toContain("p.set('assistente', '1'); p.set('passo', '1');");
  });
  it('palco: 4 etapas, locução opcional, e no fim a edição de sempre', () => {
    for (const id of ["id: 'produtos'", "id: 'loja'", "id: 'locucao'", "id: 'revisar'"]) expect(palco).toContain(id);
    expect(palco).toContain('textoConcluir="Criar meu vídeo"');
    expect(palco).toContain('<PainelDeLocucao segmento={segmento} produtos={produtosDaLocucao} aoMudar={setLocucao} />');
  });
  it('encarte: produtos → sua loja → criar (abre o editor de sempre)', () => {
    expect(encartes).toContain('textoConcluir="Criar meu encarte"');
    expect(encartes).toContain('navegar(enderecoDoEditorDoEncarte(o, s.produtos, s.quantos))');
  });
  it('etapa obrigatória trava o Avançar; voltar não perde nada; a etapa fica no endereço', () => {
    expect(assistente).toContain('disabled={!e.pronta}');
    expect(assistente).toContain("onClick={() => irPara(i)}");
    expect(palco).toContain("p.set('passo', String(n))");
  });
  it('na edição: "Visualizar vídeo e salvar" monta o vídeo e mostra Salvar/Publicar/Baixar', () => {
    expect(palco).toContain('data-testid="palco-visualizar-salvar"');
    expect(palco).toContain('exportarAgora: pedidoDeVideo');
    expect(fs.readFileSync('src/pages/studioai/VideoEditorPage.tsx', 'utf8')).toContain('if (n > ultimoPedido.current) { ultimoPedido.current = n; exportar(); }');
  });
  it('F-307: "Editar direto" pula o passo a passo e vai para a edição de sempre (palco e encarte)', () => {
    const galeria = fs.readFileSync('src/components/studio/GaleriaDeModelos.tsx', 'utf8');
    expect(galeria).toContain('data-testid="modelo-editar-direto"');
    expect(galeria).toContain('Editar direto');
    expect(galeria).toContain("aoEditarDireto ? 'Passo a passo' : 'Editar este modelo'");
    expect(palco).toContain('aoEditarDireto={editarDireto}');
    expect(palco).toMatch(/const editarDireto = .*p\.delete\('assistente'\)/);
    expect(encartes).toMatch(/aoEditarDireto=\{\(id\) => \{.*abrirEditor\(o\)/);
  });
});
