/**
 * F-194 — rotação da tela em 4 posições (9x16 nasce em 270), capa na criação, botão "Telas de Anunciantes",
 * tela do gestor só com pagamento (Pix do Banco Inter), atualização do aplicativo a pedido do painel.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
const insert = vi.fn().mockResolvedValue({ error: null });
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(() => ({ update, insert })) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { RotacaoDaTela } from '@/components/screens/RotacaoDaTela';
import { rotacaoPadrao, telaEmPe, ROTACOES, proximaRotacao } from '@/lib/rotacaoTela';
import { versaoDoNome } from '@/components/screens/AtualizacaoDoAplicativo';

const ler = (p: string) => readFileSync(p, 'utf8');
const sql = ler('supabase/migrations/20261334_rotacao_4_posicoes_e_tela_paga.sql');

describe('F-194 · rotação em 4 posições', () => {
  it('9x16 nasce em 270 e 16x9 em 0', () => {
    expect(rotacaoPadrao('9x16')).toBe(270);
    expect(rotacaoPadrao('1080x1920')).toBe(270);
    expect(rotacaoPadrao('16x9')).toBe(0);
    expect(rotacaoPadrao(null, 'portrait')).toBe(270);
    expect(telaEmPe('1920x1080')).toBe(false);
    expect(ROTACOES.map((r) => r.valor).sort((a, b) => a - b)).toEqual([0, 90, 180, 270]);
  });

  it('o banco: coluna 0/90/180/270, padrão pelo formato, playlist leva ao Player', () => {
    expect(sql).toContain('CHECK (rotacao_tela IN (0, 90, 180, 270))');
    expect(sql).toContain('THEN 270 ELSE 0 END');
    expect(sql).toContain("'rotacao_tela', v_screen.rotacao_tela,");
    expect(sql).toContain("'codigo_operacional', s.codigo_operacional,");
    expect(ler('supabase/migrations/20261335_tela_parceira_rotacao.sql')).toContain('rotacao_tela = coalesce(v_rot, rotacao_tela)');
  });

  it('um único botão: cada toque gira 90° e a TV recebe o aviso na hora', async () => {
    expect(proximaRotacao(0)).toBe(90); expect(proximaRotacao(90)).toBe(180);
    expect(proximaRotacao(180)).toBe(270); expect(proximaRotacao(270)).toBe(0);
    render(<RotacaoDaTela tela={{ id: 't1', resolution: '9x16', orientation: 'portrait', rotacao_tela: 270 }} />);
    const botao = screen.getByTestId('rotacao-botao');
    expect(botao.getAttribute('data-rotacao')).toBe('270');
    fireEvent.click(botao); // 270 -> 0
    fireEvent.click(botao); // 0 -> 90
    fireEvent.click(botao); // 90 -> 180 (vários toques seguidos = uma gravação só)
    expect(botao.getAttribute('data-rotacao')).toBe('180');
    expect(screen.getByText(/De cabeça para baixo/)).toBeInTheDocument();
    await waitFor(() => expect(update).toHaveBeenCalledWith({ rotacao_tela: 180 }));
    expect(update).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(insert).toHaveBeenCalledWith({ screen_id: 't1', command: 'reload', status: 'pending' }));
  });

  it('F-212: a rotação é a posição física da TV — em pé, launcher, login, perguntas e teclado ficam em pé', () => {
    render(<RotacaoDaTela tela={{ id: 't2', resolution: '9x16', orientation: 'portrait', rotacao_tela: 270 }} />);
    const aviso = screen.getByTestId('rotacao-posicao-fisica').textContent ?? '';
    expect(aviso).toContain('Player 5.8.15');
    expect(aviso).toContain('teclado');
    expect(aviso).toContain('As mídias continuam na orientação delas');
  });

  it('nova tela (anunciantes e parceiros) e tela paga têm rotação e capa; ID personalizado é opcional', () => {
    const nova = ler('src/components/screens/ScreenDialog.tsx');
    expect(nova).toContain('<SeletorDeRotacao');
    expect(nova).toContain('<CapaDaTela');
    expect(nova).toContain('custom_id: customId.trim() || null');
    expect(nova).not.toContain("toast.error('ID é obrigatório')");
    const parceira = ler('src/modules/corporate/components/TelaParceiraDialog.tsx');
    expect(parceira).toContain('<SeletorDeRotacao');
    expect(parceira).toContain('Imagem de capa');
    const paga = ler('src/modules/gestor/CriarTelaPagaDialog.tsx');
    expect(paga).toContain('<SeletorDeRotacao');
    expect(paga).toContain('<CapaDaTela');
  });
});

describe('F-194 · tela do gestor só paga, com Pix do Banco Inter', () => {
  it('o banco recusa tela de gestor sem cobrança paga', () => {
    expect(sql).toContain('CREATE TRIGGER trg_screens_gestor_paga BEFORE INSERT ON public.screens');
    expect(sql).toContain("upper(coalesce(p.nome, '')) = 'GESTOR'");
    expect(sql).toContain('IF NEW.cobranca_id IS NOT NULL THEN RETURN NEW; END IF;');
  });

  it('a página Telas: gestor só tem o botão pago; os outros veem "Telas de Anunciantes"', () => {
    const pg = ler('src/pages/dashboard/Screens.tsx');
    expect(pg).toContain('Telas de Anunciantes');
    expect(pg).toMatch(/ehGestor \? \(\s*<Button[\s\S]{0,200}setTelaPagaOpen\(true\)/);
    expect(pg).toContain('if (ehGestor) { setTelaPagaOpen(true); return; }');
  });

  it('a cobrança abre pronta com o Pix oficial (QR Code + copia e cola) e confirma pelo banco', () => {
    const paga = ler('src/modules/gestor/CriarTelaPagaDialog.tsx');
    expect(paga).toContain('emitirPixDaCobranca(c.cobranca_id)');
    expect(paga).toContain('QRCode.toDataURL(copiaECola');
    expect(paga).toContain('conferirPixNoBanco(cobranca!.cobranca_id)');
    expect(paga).not.toContain('gerarBrcodePix');
    const srv = ler('src/modules/gestor/telaPago.service.ts');
    expect(srv).toContain("functions.invoke('inter-pix-engine', { body: { action: 'issue', cobranca_id: cobrancaId } })");
    expect(srv).toContain("functions.invoke('inter-pix-engine', { body: { action: 'consult', cobranca_id: cobrancaId } })");
  });
});

describe('F-194 · atualização do aplicativo', () => {
  it('compara versões e o painel pede a instalação ao aparelho', () => {
    expect(versaoDoNome('5.7.8-MicroGate')).toBeLessThan(versaoDoNome('5.7.9-MicroGate'));
    expect(versaoDoNome('5.10.0')).toBeGreaterThan(versaoDoNome('5.9.9'));
    expect(ler('src/components/screens/AtualizacaoDoAplicativo.tsx')).toContain("command: 'install_update'");
    expect(ler('src/pages/dashboard/ScreenDetails.tsx')).toContain('<AtualizacaoDoAplicativo');
  });
});

describe('F-194 · cartões e resumo das telas', () => {
  it('Pontos Parceiros e Anunciantes mostram total, online, offline e ativas; cada tela no cartão novo', () => {
    const pg = ler('src/pages/dashboard/Screens.tsx');
    expect(pg).toContain('<ResumoDasTelas testId="resumo-parceiros"');
    expect(pg).toContain('<ResumoDasTelas testId="resumo-anunciantes"');
    expect(pg).toContain('<CartaoDaTela');
    const c = ler('src/components/screens/CartaoDaTela.tsx');
    for (const r of ['Total de telas', 'Online agora', 'Offline', 'Ativas', 'Playlist', 'Último sinal']) expect(c).toContain(r);
  });

  it('a capa fica no topo da janela Nova Tela, ao lado do título', () => {
    const nova = ler('src/components/screens/ScreenDialog.tsx');
    const titulo = nova.indexOf("{screen ? 'Editar Tela' : 'Nova Tela'}");
    const capa = nova.indexOf('<CapaDaTela compacto');
    expect(capa).toBeGreaterThan(titulo);
    expect(capa).toBeLessThan(nova.indexOf('</DialogHeader>'));
    expect(nova.indexOf('<CapaDaTela compacto')).toBeLessThan(nova.indexOf('<SeletorDeRotacao'));
  });
});

describe('F-194 · Controle Remoto', () => {
  it('a hora da captura vem do relógio do servidor e o painel avisa Player antigo (relógio)', () => {
    const s = ler('supabase/migrations/20261336_captura_com_relogio_do_servidor.sql');
    expect(s).toContain('NEW.last_screenshot_at := now();');
    expect(s).toContain("WHERE last_screenshot_at > now() + interval '1 day'");
    const a = ler('src/components/screens/AtualizacaoDoAplicativo.tsx');
    expect(a).toContain("versaoDoNome(atual) < versaoDoNome('5.7.4')");
    expect(versaoDoNome('5.7.1-MicroGate')).toBeLessThan(versaoDoNome('5.7.4'));
  });
});
