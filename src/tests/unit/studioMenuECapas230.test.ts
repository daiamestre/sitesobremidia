// F-230 — menu completo do painel dentro do Studio (mesma fonte) e capas que passam TODAS as mídias da pasta,
// 8 s cada, com vídeo/arte animada tocando animada e entrando primeiro (regra do dono).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { ITENS_DO_GESTOR, gruposDoPortal, gruposPermitidos, menuDoGestor } from '@/lib/menuDoPainel';
import { TEMPO_DE_CADA_MIDIA, ordemDaCapa, proximaDaVez } from '@/components/media/CapaQueGira';

const ler = (f: string) => fs.readFileSync(f, 'utf8');

describe('capas que giram', () => {
  it('cada mídia fica 8 s, e a fila volta ao começo para sempre', () => {
    expect(TEMPO_DE_CADA_MIDIA).toBe(8000);
    expect([0, 1, 2].map((i) => proximaDaVez(i, 3))).toEqual([1, 2, 0]);
    expect(proximaDaVez(5, 0)).toBe(0);
  });
  it('vídeo e arte animada vêm primeiro (são a capa da pasta); as imagens seguem na ordem', () => {
    const l = ordemDaCapa([{ chave: 'a', imagem: 'a.jpg' }, { chave: 'v', video: 'v.mp4' }, { chave: 'b', imagem: 'b.jpg' }, { chave: 'x', animada: () => null }]);
    expect(l.map((s) => s.chave)).toEqual(['v', 'x', 'a', 'b']);
  });
  it('as 3 TVs, os cartões das pastas do Studio e as pastas da galeria usam a mesma capa que gira', () => {
    const vit = ler('src/components/studio/Vitrines.tsx');
    expect(vit).toMatch(/intervalo = TEMPO_DE_CADA_MIDIA/);
    expect(vit).toMatch(/<CapaQueGira/);
    expect(vit).toMatch(/animar sempre/); // arte animada toca animada
    const cat = ler('src/pages/studioai/CatalogoPage.tsx');
    expect(cat).toMatch(/<TvEmLoop modelos=\{daPasta\}/);
    expect(cat).not.toMatch(/intervalo=\{/); // nenhuma capa com tempo diferente de 8 s
    const gal = ler('src/components/media/GaleriaEmPastas.tsx');
    expect(gal).toMatch(/<CapaQueGira slides=\{slidesDaPasta\(g\)\}/);
    expect(ler('src/pages/dashboard/Medias.tsx')).toMatch(/video: m\.file_type === 'video' \? m\.file_url : null/);
    expect(ler('src/modules/crm/pages/portal/AssetLibraryPage.tsx')).toMatch(/video: a\.tipo === 'video' \? a\.object_url : null/);
  });
});

describe('menu do painel dentro do Studio', () => {
  it('o gestor vê o menu do painel inteiro (sem os itens de dono/ADM) e Mensagens com o contador', () => {
    const { principal, rodape } = menuDoGestor({ isAdmin: false, isOwner: false, perfilNome: 'GESTOR', naoLidas: 3 });
    expect(principal.map((i) => i.label)).toEqual([...ITENS_DO_GESTOR.map((i) => i.label), 'Mensagens']);
    expect(principal.at(-1)?.badge).toBe(3);
    expect(rodape.map((i) => i.label)).toEqual(['Meu Perfil', 'Configurações']);
  });
  it('dono/ADM ganham Painel Principal, Central de Cobranças, pontos parceiros, Launcher, Área Corporativa e Admin', () => {
    const { principal, rodape } = menuDoGestor({ isAdmin: true, isOwner: true, perfilNome: 'OWNER', naoLidas: 0 });
    const nomes = principal.map((i) => i.label);
    expect(nomes[0]).toBe('Painel Principal');
    expect(nomes).toEqual(expect.arrayContaining(['Central de Cobranças', 'Telas de pontos parceiros', 'Pontos parceiros', 'Launcher']));
    expect(rodape.map((i) => i.label)).toEqual(['Área Corporativa', 'Admin', 'Meu Perfil', 'Configurações']);
  });
  it('o anunciante vê os grupos do portal da modalidade dele (host não vê Publicidade; anunciante não vê a Rede)', () => {
    const anunciante = gruposPermitidos(gruposDoPortal(0), 'ANUNCIANTE').map((g) => g.label);
    expect(anunciante).toContain('Publicidade');
    expect(anunciante).not.toContain('Rede (Host)');
    const host = gruposPermitidos(gruposDoPortal(0), 'HOST').map((g) => g.label);
    expect(host).toContain('Rede (Host)');
    expect(host).not.toContain('Publicidade');
  });
  it('painel, portal e Studio leem a MESMA lista; o cartão "Sua marca em todos os lugares" continua no Studio', () => {
    expect(ler('src/components/dashboard/Sidebar.tsx')).toMatch(/useMenuDoGestor\(\)/);
    expect(ler('src/modules/crm/layout/CustomerPortalLayout.tsx')).toMatch(/gruposDoPortal\(totalNaoLidas\)/);
    const studio = ler('src/components/studioai/StudioAILayout.tsx');
    expect(studio).toMatch(/useMenuDoGestor\(\)/);
    expect(studio).toMatch(/gruposPermitidos\(gruposDoPortal\(total\), modalidade\)/);
    expect(studio).toMatch(/Sua marca em todos os lugares/);
  });
});
