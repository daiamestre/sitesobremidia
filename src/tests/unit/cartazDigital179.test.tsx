/**
 * F-179 — Cartaz Digital: menu lateral no modelo dos criadores de encarte, um caminho só para as logos 3D,
 * envio aceito na hora (sem "em revisão"), temas com seções prontas para receber artes, vários modelos de cartaz,
 * "Meus cartazes" com impressão dos escolhidos e portal público de ofertas.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';

const h = vi.hoisted(() => ({
  central: false,
  selos: [] as unknown[],
  cartazes: [] as unknown[],
  perfil: null as unknown,
  gravados: [] as Array<{ tabela: string; verbo: string; payload: any }>,
  impressos: [] as Blob[][],
}));

/** Cadeia de consulta falsa: qualquer método devolve ela mesma e, ao ser aguardada, responde conforme a tabela e o verbo. */
function cadeia(tabela: string) {
  let verbo = 'select';
  let payload: any = null;
  const resposta = () => {
    if (tabela === 'tabloide_selos') return verbo === 'insert' ? { data: { id: `novo-${h.gravados.length}`, ...payload }, error: null } : { data: h.selos, error: null };
    if (tabela === 'tabloide_perfil') return { data: verbo === 'select' ? h.perfil : null, error: null };
    if (tabela === 'tabloides') return verbo === 'insert' ? { data: { id: `cartaz-${h.gravados.filter((g) => g.tabela === 'tabloides' && g.verbo === 'insert').length}` }, error: null } : verbo === 'update' ? { data: null, error: null } : { data: h.cartazes, error: null };
    return { data: [], error: null };
  };
  const alvo: any = new Proxy(function () { /* alvo */ }, {
    get(_t, prop) {
      if (prop === 'then') return (ok: (v: unknown) => unknown, err: (e: unknown) => unknown) => Promise.resolve(resposta()).then(ok, err);
      if (prop === 'insert' || prop === 'update') return (p: unknown) => { verbo = String(prop); payload = p; h.gravados.push({ tabela, verbo, payload: p }); return alvo; };
      return () => alvo;
    },
  });
  return alvo;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (t: string) => cadeia(t),
    rpc: async (nome: string) => ({ data: nome === 'is_central_privileged' ? h.central : null, error: null }),
    functions: { invoke: async () => ({ data: { candidatos: [] }, error: null }) },
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
  },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/lib/r2Upload', () => ({ uploadToR2: async (_b: Blob, caminho: string) => ({ publicUrl: `https://r2/${caminho}`, filePath: caminho }) }));
vi.mock('@/lib/tabloide/exportar', async (orig) => ({
  ...(await orig<typeof import('@/lib/tabloide/exportar')>()),
  renderizarPaginaEmPng: async () => new Blob(['png'], { type: 'image/png' }),
  imprimirBlobs: (b: Blob[]) => { h.impressos.push(b); },
  baixarBlob: () => undefined,
}));

import { TabloideEditor, BOTOES } from '@/components/tabloide/TabloideEditor';
import { TabloideCanvas } from '@/components/tabloide/TabloideCanvas';
import { MeusCartazes } from '@/components/tabloide/MeusCartazes';
import {
  CAMPOS_EMPRESA, configPadrao, linhasDoRodape, linhasDoRodapeUsadas, normalizarConfig, propsDasPaginas, resolverCabecalho, textoDaValidade, textoParaPostar,
  type CartazParaDesenhar,
} from '@/lib/tabloide/cartaz';
import type { CartazSalvo } from '@/lib/tabloide/cartazes';
import { cssDaFonte, filtrarFontes, fonteDeCanvas, FONTES } from '@/lib/tabloide/fontes';
import { aplicarPerfil, enderecoDoPortal, perfilDoCartaz } from '@/lib/tabloide/perfil';
import { GRUPO_MEUS_TEMAS, GRUPO_TEMAS_GRATIS, identificadorDaImagem, logosDaMarca, logosDoCabecalho, resolverImagem, temasDeFoto, type Selo } from '@/lib/tabloide/selos';
import { medidasDoFormato } from '@/lib/tabloide/grade';
import { lerLista } from '@/lib/tabloide/parseProdutos';
import { FORMATOS, USOS_DO_FORMATO, formatoPorId } from '@/lib/tabloide/temas';
import { DATAS } from '@/lib/tabloide/datas';

const fonte = (p: string) => readFileSync(p, 'utf8');

const selo = (o: Partial<Selo> & { id: string; nome: string }): Selo => ({
  slug: o.id, categoria: 'Logos', titulo: o.nome, imagem_url: `https://r2/${o.id}.png`, mime: 'image/png', largura: 1400, altura: 1100, transparente: true, versao: 1,
  estado: 'APROVADO', origem: 'x', licenca: 'x', cliente_id: null, dono_id: null, tipo: 'LOGO_CABECALHO', miniatura_url: null, ordem: 0, ...o,
}) as Selo;

const OFERTAS = selo({ id: 'id-ofertas', nome: 'Ofertas da Semana', ordem: 1 });
const MINHA = selo({ id: 'id-minha', nome: 'Minha logo 3D', dono_id: 'u1', ordem: 9 });
const ARQUIVADA = selo({ id: 'id-arq', nome: 'Arquivada', estado: 'REPROVADO' });
const MARCA = selo({ id: 'id-marca', nome: 'Logo da loja', tipo: 'LOGO_MARCA', dono_id: 'u1' });
const TEMA_GRATIS = selo({ id: 'id-tema', nome: 'Fundo amarelo', tipo: 'TEMA', categoria: GRUPO_TEMAS_GRATIS, mime: 'image/jpeg', transparente: false });
const TEMA_MEU = selo({ id: 'id-tema-meu', nome: 'Meu fundo', tipo: 'TEMA', categoria: GRUPO_MEUS_TEMAS, dono_id: 'u1' });
const TODOS = [MINHA, ARQUIVADA, OFERTAS, MARCA, TEMA_GRATIS, TEMA_MEU];

const cartazDe = (o: Partial<CartazParaDesenhar> = {}): CartazParaDesenhar => ({
  formatoId: 'tv-h', temaId: 'ofertao', segmentoId: 'mercado', grade: 'auto', produtos: lerLista('Arroz 5kg 25,90\nFeijão 1kg 7,49'), config: configPadrao(), ...o,
});

const originais = { getContext: HTMLCanvasElement.prototype.getContext, toBlob: HTMLCanvasElement.prototype.toBlob, criar: URL.createObjectURL, soltar: URL.revokeObjectURL };

/** O navegador de teste não decodifica imagem: simula uma imagem 400×300 transparente para o envio poder ser exercitado. */
function simularImagens() {
  class ImagemFalsa { onload: null | (() => void) = null; onerror: null | (() => void) = null; naturalWidth = 400; naturalHeight = 300; set src(_v: string) { setTimeout(() => this.onload?.(), 0); } }
  vi.stubGlobal('Image', ImagemFalsa);
  URL.createObjectURL = () => 'blob:teste';
  URL.revokeObjectURL = () => undefined;
  HTMLCanvasElement.prototype.getContext = (function () {
    // contexto de desenho de mentira: aceita qualquer chamada e devolve pixels transparentes
    return new Proxy({} as Record<string, unknown>, {
      get(alvo, prop) {
        if (prop in alvo) return alvo[prop as string];
        if (prop === 'getImageData') return (_x: number, _y: number, w: number, ht: number) => ({ data: new Uint8ClampedArray(w * ht * 4), width: w, height: ht });
        if (prop === 'measureText') return () => ({ width: 10 });
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop() { /* nada */ } });
        return () => undefined;
      },
      set(alvo, prop, valor) { alvo[prop as string] = valor; return true; },
    });
  }) as never;
  HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) { cb(new Blob(['mini'], { type: 'image/png' })); };
}

beforeEach(() => {
  h.central = false; h.selos = TODOS; h.cartazes = []; h.perfil = null; h.gravados = []; h.impressos = [];
  (globalThis as any).ResizeObserver = class { observe() { /* stub */ } disconnect() { /* stub */ } unobserve() { /* stub */ } };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  HTMLCanvasElement.prototype.getContext = originais.getContext;
  HTMLCanvasElement.prototype.toBlob = originais.toBlob;
  URL.createObjectURL = originais.criar;
  URL.revokeObjectURL = originais.soltar;
});

describe('F-179 · nome e menu lateral', () => {
  it('a tela e os menus se chamam "Cartaz Digital" (o nome antigo não aparece mais para o usuário)', async () => {
    render(<TabloideEditor contexto="painel" />);
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toContain('Cartaz Digital');
    expect(document.body.textContent).not.toMatch(/tabloide/i);
    expect(fonte('src/components/dashboard/Sidebar.tsx')).toContain("label: 'Cartaz Digital', path: '/dashboard/tabloide'");
    expect(fonte('src/modules/crm/layout/CustomerPortalLayout.tsx')).toContain("name: 'Cartaz Digital', path: '/portal/tabloide'");
    for (const p of ['src/components/dashboard/Sidebar.tsx', 'src/modules/crm/layout/CustomerPortalLayout.tsx']) expect(fonte(p)).not.toContain('Tabloide Digital');
  });

  it('o menu tem exatamente as 9 opções do modelo, nesta ordem, e cada uma abre o seu painel', async () => {
    expect(BOTOES.map((b) => b.rotulo)).toEqual(['Produtos', 'Temas', 'Datas', 'Sua Logo', 'Empresa', 'Fontes', 'Postar', 'Encarte', 'Portal']);
    render(<TabloideEditor contexto="painel" />);
    const barra = await screen.findByTestId('tabloide-barra');
    expect(within(barra).getAllByRole('button').map((b) => b.textContent)).toEqual(BOTOES.map((b) => b.rotulo));
    for (const [aba, painel] of [['temas', 'painel-temas'], ['datas', 'painel-datas'], ['logo', 'painel-logo'], ['empresa', 'painel-empresa'], ['fontes', 'painel-fontes'], ['postar', 'painel-postar'], ['encarte', 'painel-encarte'], ['portal', 'painel-portal']]) {
      fireEvent.click(screen.getByTestId(`tabloide-aba-${aba}`));
      expect(screen.getByTestId(painel)).toBeTruthy();
    }
  });
});

describe('F-179 · um caminho só para as logos 3D', () => {
  it('não existem mais os selos simples desenhados em código nem os dois painéis separados', () => {
    expect(existsSync('src/components/tabloide/PainelSelos.tsx')).toBe(false);
    expect(existsSync('src/components/tabloide/GaleriaLogoCabecalho.tsx')).toBe(false);
    const lib = fonte('src/lib/tabloide/selos.ts');
    for (const proibido of ['CATALOGO_INICIAL', 'renderizarSeloPng', 'semearBibliotecaInicial']) expect(lib).not.toContain(proibido);
    const sql = fonte('supabase/migrations/20261324_cartaz_digital.sql');
    expect(sql).toContain("DELETE FROM public.tabloide_selos WHERE tipo = 'SELO'");
    expect(sql).toContain("CHECK (tipo IN ('LOGO_CABECALHO', 'LOGO_MARCA', 'TEMA'))");
  });

  it('a galeria junta as logos da empresa e as do próprio usuário; arquivada some; cada tipo fica na sua lista', () => {
    expect(logosDoCabecalho(TODOS).map((l) => l.id)).toEqual(['id-ofertas', 'id-minha']);
    expect(logosDaMarca(TODOS).map((l) => l.id)).toEqual(['id-marca']);
    expect(temasDeFoto(TODOS).map((l) => l.id).sort()).toEqual(['id-tema', 'id-tema-meu']);
    expect(resolverImagem(TODOS, 'id-arq', 'LOGO_CABECALHO')).toBeNull();
    expect(resolverImagem(TODOS, 'id-marca', 'LOGO_CABECALHO')).toBeNull();
    expect(resolverImagem(null, 'id-ofertas', 'LOGO_CABECALHO')).toBeNull();
  });

  it('a mesma logo serve para o cabeçalho ou solta no cartaz, a partir do mesmo cartão', async () => {
    render(<TabloideEditor contexto="painel" />);
    fireEvent.click(await screen.findByTestId('tabloide-aba-temas'));
    const cartoes = await screen.findAllByTestId('logo-3d');
    expect(cartoes).toHaveLength(2);
    // sem escolha, o cabeçalho já usa a primeira logo da empresa
    await waitFor(() => expect((document.querySelector('[data-testid="tabloide-palco"] img[data-logo-cabecalho]') as HTMLImageElement)?.src).toBe('https://r2/id-ofertas.png'));
    fireEvent.click(within(cartoes[1]).getByLabelText('Usar Minha logo 3D no cabeçalho'));
    await waitFor(() => expect((document.querySelector('[data-testid="tabloide-palco"] img[data-logo-cabecalho]') as HTMLImageElement)?.src).toBe('https://r2/id-minha.png'));
    fireEvent.click(within(cartoes[0]).getByTestId('logo-soltar'));
    await waitFor(() => expect(document.querySelectorAll('[data-testid="tabloide-palco"] [data-testid="tabloide-elemento"]')).toHaveLength(1));
    fireEvent.click(screen.getByTestId('camada-excluir'));
    await waitFor(() => expect(document.querySelectorAll('[data-testid="tabloide-elemento"]')).toHaveLength(0));
    // tirar do cartaz não mexe na biblioteca
    expect(h.gravados.filter((g) => g.tabela === 'tabloide_selos')).toHaveLength(0);
  });

  it('ordem do cabeçalho: logo escolhida → selo antigo → título em texto → nada com foto de tema → 1ª logo da empresa', () => {
    const c = configPadrao();
    expect(resolverCabecalho({ ...c, logoCabecalhoId: 'id-minha', seloUrl: 'https://r2/antigo.png' }, TODOS)).toEqual({ seloUrl: 'https://r2/id-minha.png', semTitulo: false });
    expect(resolverCabecalho({ ...c, logoCabecalhoId: 'sumiu', seloUrl: 'https://r2/antigo.png' }, TODOS).seloUrl).toBe('https://r2/antigo.png');
    expect(resolverCabecalho({ ...c, cabecalhoEmTexto: true }, TODOS)).toEqual({ seloUrl: null, semTitulo: false });
    expect(resolverCabecalho({ ...c, temaFotoId: 'id-tema' }, TODOS)).toEqual({ seloUrl: null, semTitulo: true });
    expect(resolverCabecalho(c, TODOS).seloUrl).toBe('https://r2/id-ofertas.png');
    expect(resolverCabecalho(c, [MINHA])).toEqual({ seloUrl: null, semTitulo: false });
  });
});

describe('F-179 · envio aceito na hora (sem "em revisão")', () => {
  it('logo 3D enviada entra aprovada, fica do usuário e já vai para o cabeçalho', async () => {
    simularImagens();
    render(<TabloideEditor contexto="portal" clienteId="cli-1" />);
    fireEvent.click(await screen.findByTestId('tabloide-aba-temas'));
    const campo = (await screen.findByTestId('logo-enviar')).querySelector('input') as HTMLInputElement;
    fireEvent.change(campo, { target: { files: [new File(['x'], 'minha-oferta.png', { type: 'image/png' })] } });
    await waitFor(() => expect(h.gravados.some((g) => g.tabela === 'tabloide_selos' && g.verbo === 'insert')).toBe(true));
    const linha = h.gravados.find((g) => g.tabela === 'tabloide_selos')!.payload;
    expect(linha).toMatchObject({ estado: 'APROVADO', tipo: 'LOGO_CABECALHO', dono_id: 'u1', cliente_id: 'cli-1', nome: 'minha oferta' });
    expect(linha.imagem_url).toMatch(/^https:\/\/r2\/u1\/cartaz\/logo\//);
    expect(document.body.textContent).not.toMatch(/revis[ãa]o/i);
  });

  it('a central pode enviar para a empresa toda; usuário comum nunca', async () => {
    simularImagens();
    h.central = true;
    render(<TabloideEditor contexto="painel" />);
    fireEvent.click(await screen.findByTestId('tabloide-aba-temas'));
    await screen.findByText('O que eu enviar vale para todos os usuários da empresa');
    fireEvent.change((screen.getByTestId('logo-enviar')).querySelector('input') as HTMLInputElement, { target: { files: [new File(['x'], 'da-empresa.webp', { type: 'image/webp' })] } });
    await waitFor(() => expect(h.gravados.some((g) => g.tabela === 'tabloide_selos')).toBe(true));
    expect(h.gravados.find((g) => g.tabela === 'tabloide_selos')!.payload).toMatchObject({ estado: 'APROVADO', dono_id: null, cliente_id: null });
  });

  it('logo da marca enviada em "Sua Logo" fica salva na biblioteca e aparece no cartaz', async () => {
    simularImagens();
    render(<TabloideEditor contexto="painel" />);
    fireEvent.click(await screen.findByTestId('tabloide-aba-logo'));
    expect(await screen.findByTestId('logos-salvas')).toBeTruthy();
    fireEvent.change((screen.getByTestId('tabloide-enviar-logo')).querySelector('input') as HTMLInputElement, { target: { files: [new File(['x'], 'loja.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(h.gravados.some((g) => g.tabela === 'tabloide_selos' && g.payload?.tipo === 'LOGO_MARCA')).toBe(true));
    expect(h.gravados.find((g) => g.tabela === 'tabloide_selos')!.payload).toMatchObject({ estado: 'APROVADO', dono_id: 'u1', mime: 'image/jpeg' });
    await waitFor(() => expect(document.querySelector('[data-testid="tabloide-palco"] [data-testid="tabloide-logo-marca"] img')).toBeTruthy());
  });

  it('a biblioteca nunca grava "REVISAO" no envio e recusa só o que não é imagem ou é grande demais', () => {
    const lib = fonte('src/lib/tabloide/selos.ts');
    expect(lib).toContain("estado: 'APROVADO', tipo: opcoes.tipo");
    expect(lib).not.toMatch(/estado:\s*'REVISAO'/);
    expect(lib).toContain("['image/png', 'image/webp', 'image/jpeg']");
    expect(lib).toContain('12 * 1024 * 1024');
    expect(identificadorDaImagem('TEMA', 'Dia das Mães 2026!', 'abc')).toBe('tema-dia-das-maes-2026-abc');
  });
});

describe('F-179 · temas: seções prontas para receber as artes', () => {
  it('há busca, "Meus temas", "Temas Grátis" e uma seção por data comemorativa — todas aparecem mesmo vazias', async () => {
    h.selos = [OFERTAS];
    render(<TabloideEditor contexto="painel" />);
    fireEvent.click(await screen.findByTestId('tabloide-aba-temas'));
    expect(screen.getByTestId('temas-busca')).toBeTruthy();
    const secoes = (await screen.findAllByTestId('secao-de-temas')).map((s) => s.getAttribute('data-categoria'));
    expect(secoes.slice(0, 2)).toEqual([GRUPO_MEUS_TEMAS, GRUPO_TEMAS_GRATIS]);
    expect(secoes).toHaveLength(2 + DATAS.length);
    for (const d of DATAS) expect(secoes).toContain(d.nome);
    expect(screen.getAllByTestId('tema-vazio').length).toBeGreaterThan(0);
  });

  it('qualquer usuário adiciona em "Meus temas"; só a central adiciona nas seções da empresa', async () => {
    render(<TabloideEditor contexto="painel" />);
    fireEvent.click(await screen.findByTestId('tabloide-aba-temas'));
    await screen.findAllByTestId('secao-de-temas');
    expect(screen.getAllByTestId('tema-adicionar')).toHaveLength(1);
    cleanup();
    h.central = true;
    render(<TabloideEditor contexto="painel" />);
    fireEvent.click(await screen.findByTestId('tabloide-aba-temas'));
    await waitFor(() => expect(screen.getAllByTestId('tema-adicionar')).toHaveLength(2 + DATAS.length));
  });

  it('escolher um tema põe a foto por baixo do cartaz inteiro; tocar de novo (ou "Tirar o tema") volta às cores', async () => {
    render(<TabloideEditor contexto="painel" />);
    fireEvent.click(await screen.findByTestId('tabloide-aba-temas'));
    const fotos = await screen.findAllByTestId('tema-foto');
    expect(fotos).toHaveLength(2);
    fireEvent.click(fotos[0]);
    await waitFor(() => expect(document.querySelector('[data-testid="tabloide-palco"] [data-testid="tabloide-fundo"]')).toBeTruthy());
    fireEvent.click(screen.getByTestId('tema-tirar'));
    await waitFor(() => expect(document.querySelector('[data-testid="tabloide-fundo"]')).toBeNull());
  });

  it('a busca filtra temas e logos pelo nome, sem acento', async () => {
    render(<TabloideEditor contexto="painel" />);
    fireEvent.click(await screen.findByTestId('tabloide-aba-temas'));
    await screen.findAllByTestId('tema-foto');
    fireEvent.change(screen.getByTestId('temas-busca'), { target: { value: 'pascoa' } });
    expect(screen.getAllByTestId('secao-de-temas').map((s) => s.getAttribute('data-categoria'))).toEqual(['Páscoa']);
    expect(screen.queryAllByTestId('logo-3d')).toHaveLength(0);
  });
});

describe('F-179 · datas e regras da oferta', () => {
  it('monta o texto de validade conforme o que foi marcado', () => {
    const r = configPadrao().regras;
    expect(textoDaValidade(r)).toBe('');
    expect(textoDaValidade({ ...r, inicio: '2026-10-10', fim: '2026-10-17' })).toBe('Ofertas válidas de 10/10 a 17/10/2026');
    expect(textoDaValidade({ ...r, fim: '2026-10-17', enquantoDurarem: true })).toBe('Ofertas válidas até 17/10/2026 ou enquanto durarem os estoques');
    expect(textoDaValidade({ ...r, inicio: '2026-10-10', fim: '2026-10-17', mostrarDatas: false })).toBe('');
    expect(textoDaValidade({ ...r, enquantoDurarem: true })).toBe('Ofertas válidas enquanto durarem os estoques');
  });

  it('o painel tem período, as chaves do modelo e a frase promocional; a frase desligada some do cartaz', async () => {
    render(<TabloideEditor contexto="painel" />);
    fireEvent.click(await screen.findByTestId('tabloide-aba-datas'));
    for (const t of ['datas-inicio', 'datas-fim', 'datas-mostrar', 'datas-estoques', 'datas-ilustrativas', 'datas-medicamento', 'datas-frase-chave', 'datas-frase']) expect(screen.getByTestId(t)).toBeTruthy();
    expect(document.querySelector('[data-testid="tabloide-palco"] [data-testid="tabloide-frase"]')).toBeTruthy();
    fireEvent.click(screen.getByTestId('datas-frase-chave'));
    await waitFor(() => expect(document.querySelector('[data-testid="tabloide-palco"] [data-testid="tabloide-frase"]')).toBeNull());
    fireEvent.change(screen.getByTestId('datas-fim'), { target: { value: '2026-12-24' } });
    await waitFor(() => expect(screen.getByTestId('datas-resumo').textContent).toContain('Ofertas válidas até 24/12/2026'));
    expect(screen.getByTestId('tabloide-rodape').textContent).toContain('Ofertas válidas até 24/12/2026');
  });

  it('a advertência de medicamento ganha uma linha própria no rodapé (a área dos produtos encolhe, nada se sobrepõe)', () => {
    const c = configPadrao();
    expect(linhasDoRodapeUsadas(linhasDoRodape(c))).toBe(1);
    c.regras.advertenciaMedicamento = true;
    c.empresa.telefone = '(11) 3333-4444'; c.mostrar.telefone = true;
    const linhas = linhasDoRodape(c);
    expect(linhas.advertencia).toContain('Leia a bula');
    expect(linhasDoRodapeUsadas(linhas)).toBe(3);
    const f = formatoPorId('tv-h');
    expect(medidasDoFormato(f, 3).rodape).toBeGreaterThan(medidasDoFormato(f, 2).rodape);
    expect(medidasDoFormato(f, 2).rodape).toBeGreaterThan(medidasDoFormato(f, 1).rodape);
    const paginas = propsDasPaginas(cartazDe({ config: c }), TODOS);
    const m = medidasDoFormato(f, 3);
    for (const cel of paginas[0].pagina.celulas) expect(cel.y + cel.h).toBeLessThanOrEqual(m.altura - m.rodape);
    render(<TabloideCanvas {...paginas[0]} />);
    expect(screen.getAllByTestId('tabloide-rodape-contato')).toHaveLength(2);
  });
});

describe('F-179 · empresa, fontes e postar', () => {
  it('são 11 chaves de dados da empresa; só aparece no cartaz o que está ligado E preenchido', () => {
    expect(CAMPOS_EMPRESA.map((c) => c.id)).toEqual(['telefone', 'whatsapp', 'legenda', 'nome', 'slogan', 'pagamento', 'obsPagamento', 'endereco', 'instagram', 'facebook', 'website']);
    const c = configPadrao();
    c.empresa = { ...c.empresa, nome: 'Mercado Bom', telefone: '3333-4444', whatsapp: '99999-0000', legenda: 'Peça já', endereco: 'Rua A, 1', instagram: '@bom' };
    expect(linhasDoRodape(c)).toMatchObject({ principal: '', contato: '' });
    c.mostrar = { ...c.mostrar, nome: true, telefone: true, legenda: true, instagram: true, slogan: true };
    const l = linhasDoRodape(c);
    expect(l.principal).toBe('Mercado Bom');
    expect(l.contato).toContain('Peça já: 3333-4444');
    expect(l.contato).toContain('@bom');
    expect(l.contato).not.toContain('99999-0000');
    expect(l.contato).not.toContain('Rua A');
  });

  it('o painel Empresa liga, preenche e o rodapé mostra na hora; fica guardado para os próximos cartazes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<TabloideEditor contexto="painel" />);
      fireEvent.click(await screen.findByTestId('tabloide-aba-empresa'));
      expect(document.querySelectorAll('[data-testid^="empresa-chave-"]')).toHaveLength(11);
      expect(screen.queryByTestId('empresa-campo-whatsapp')).toBeNull();
      fireEvent.click(screen.getByTestId('empresa-chave-whatsapp'));
      fireEvent.change(await screen.findByTestId('empresa-campo-whatsapp'), { target: { value: '(11) 98888-7777' } });
      await waitFor(() => expect(screen.getByTestId('tabloide-rodape').textContent).toContain('WhatsApp (11) 98888-7777'));
      await vi.advanceTimersByTimeAsync(1500);
      await waitFor(() => expect(h.gravados.some((g) => g.tabela === 'tabloide_perfil')).toBe(true));
      const salvo = h.gravados.filter((g) => g.tabela === 'tabloide_perfil').pop()!.payload;
      expect(salvo.dados.empresa.whatsapp).toBe('(11) 98888-7777');
      expect(salvo.dados.mostrar.whatsapp).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it('cartaz novo nasce com os dados guardados da loja', async () => {
    const dados = perfilDoCartaz({ ...configPadrao(), fontes: { produto: 'anton', preco: 'padrao', frase: 'padrao', rodape: 'padrao' } });
    dados.empresa = { ...dados.empresa!, nome: 'Loja Guardada' };
    dados.mostrar = { ...dados.mostrar!, nome: true };
    h.perfil = { dados, slug: 'loja-guardada', cep: null, segmentos: ['mercado'], visivel: true };
    render(<TabloideEditor contexto="painel" />);
    await waitFor(() => expect(screen.getByTestId('tabloide-rodape').textContent).toContain('Loja Guardada'));
    expect((document.querySelector('[data-testid="tabloide-nome"]') as HTMLElement).style.fontFamily).toContain('Anton');
    expect(aplicarPerfil(configPadrao(), {}).empresa.nome).toBe('');
  });

  it('fontes: 4 partes do cartaz, filtros por peso, estilo e nome, e a fonte vale para as partes marcadas', async () => {
    expect(FONTES.length).toBeGreaterThanOrEqual(12);
    expect(filtrarFontes({ estilo: 'italic' }).every((f) => f.estilo === 'italic')).toBe(true);
    expect(filtrarFontes({ nome: 'mont' }).map((f) => f.id)).toEqual(['montserrat', 'montserrat-italico']);
    expect(filtrarFontes({ peso: 400 }).every((f) => f.peso === 400)).toBe(true);
    expect(cssDaFonte('nao-existe')).toEqual(cssDaFonte('padrao'));
    expect(fonteDeCanvas('montserrat-italico', 40)).toMatch(/^italic 900 40px 'Montserrat'/);
    render(<TabloideEditor contexto="painel" />);
    fireEvent.click(await screen.findByTestId('tabloide-aba-fontes'));
    for (const parte of ['produto', 'preco', 'frase', 'rodape']) expect(screen.getByTestId(`fonte-parte-${parte}`)).toBeTruthy();
    fireEvent.click(screen.getByTestId('fonte-parte-rodape'));
    fireEvent.click(screen.getByTestId('fonte-oswald'));
    await waitFor(() => expect((document.querySelector('[data-testid="tabloide-palco"] [data-testid="tabloide-nome"]') as HTMLElement).style.fontFamily).toContain('Oswald'));
    expect((screen.getByTestId('tabloide-rodape') as HTMLElement).style.fontFamily).toContain('Oswald');
    expect((document.querySelector('[data-testid="tabloide-frase"]') as HTMLElement).style.fontFamily).not.toContain('Oswald');
    fireEvent.change(screen.getByTestId('fonte-nome'), { target: { value: 'bebas' } });
    expect(within(screen.getByTestId('fonte-lista')).getAllByRole('button')).toHaveLength(1);
  });

  it('o texto para postar lista produtos e preços, a validade, o contato e a descrição da imagem', () => {
    const c = configPadrao();
    c.titulo = 'Ofertas da Semana';
    c.regras = { ...c.regras, frase: 'Só até sábado', fim: '2026-10-17' };
    c.empresa.nome = 'Mercado Bom'; c.mostrar.nome = true;
    const t = textoParaPostar(c, lerLista('Arroz 5kg 25,90\nLeite de 6,50 por 4,99\nPão'), 'PADRÃO');
    expect(t).toContain('Ofertas da Semana');
    expect(t).toContain('Só até sábado');
    expect(t).toContain('• Arroz 5kg: R$ 25,90');
    expect(t).toContain('de R$ 6,50 por R$ 4,99');
    expect(t).toContain('• Pão: consulte o preço');
    expect(t).toContain('Ofertas válidas até 17/10/2026');
    expect(t).toContain('Descrição da imagem');
    expect(t).toContain('#MercadoBom');
    expect(t).not.toMatch(/\n\n\n/);
  });
});

describe('F-179 · vários tipos de cartaz', () => {
  it('há modelos para telas e totens, redes sociais (story e feed) e impressão', async () => {
    expect(USOS_DO_FORMATO.map((u) => u.id)).toEqual(['tela', 'rede', 'impressao']);
    const de = (uso: string) => FORMATOS.filter((f) => f.uso === uso).map((f) => f.id);
    expect(de('tela')).toEqual(['tv-h', 'totem']);
    expect(de('rede')).toEqual(['story', 'feed', 'feed-retrato']);
    expect(de('impressao')).toEqual(['a4', 'a4-h']);
    expect(formatoPorId('feed-retrato')).toMatchObject({ largura: 1080, altura: 1350 });
    expect(formatoPorId('modelo-que-nao-existe').id).toBe('tv-h');
    render(<TabloideEditor contexto="painel" />);
    const faixa = await screen.findByTestId('modelos-disponiveis');
    expect(within(faixa).getAllByRole('button')).toHaveLength(FORMATOS.length);
    fireEvent.click(screen.getByTestId('modelo-story'));
    await waitFor(() => expect((screen.getByTestId('tabloide-modelo') as HTMLSelectElement).value).toBe('story'));
    const tela = document.querySelector('[data-testid="tabloide-palco"] [data-testid="tabloide-canvas"]') as HTMLElement;
    expect(tela.style.width).toBe('1080px');
    expect(tela.style.height).toBe('1920px');
  });

  it('em todos os modelos os produtos cabem entre o cabeçalho e o rodapé', () => {
    const cfg = configPadrao();
    cfg.empresa.endereco = 'Rua A, 1'; cfg.mostrar.endereco = true;
    for (const f of FORMATOS) {
      const p = propsDasPaginas(cartazDe({ formatoId: f.id, config: cfg, produtos: lerLista(Array.from({ length: 9 }, (_, i) => `Produto ${i + 1} ${i + 1},99`).join('\n')) }), TODOS);
      const m = medidasDoFormato(f, 2);
      for (const pg of p) for (const c of pg.pagina.celulas) {
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.x + c.w).toBeLessThanOrEqual(f.largura + 0.5);
        expect(c.y).toBeGreaterThanOrEqual(m.cabecalho);
        expect(c.y + c.h).toBeLessThanOrEqual(f.altura - m.rodape + 0.5);
      }
    }
  });
});

describe('F-179 · Meus cartazes', () => {
  const salvo = (id: string, nome: string, o: Partial<CartazSalvo> = {}): CartazSalvo => ({ ...cartazDe(), id, nome, atualizadoEm: '2026-10-10T12:00:00Z', publicado: false, imagensPublicadas: [], ...o });
  const tres = [salvo('c1', 'Ofertas da semana'), salvo('c2', 'Churrasco', { formatoId: 'a4' }), salvo('c3', 'Hortifruti', { publicado: true })];
  const montar = (o: Partial<Parameters<typeof MeusCartazes>[0]> = {}) => {
    const p = { cartazes: tres, selos: TODOS, clienteId: null, abertoId: null, aoAbrir: vi.fn(), aoNovo: vi.fn(), aoRecarregar: vi.fn(async () => undefined), aoExcluirAberto: vi.fn(), ...o };
    render(<MeusCartazes {...p} />);
    return p;
  };

  it('mostra cada cartaz salvo com a miniatura desenhada pelo mesmo componente da prévia', () => {
    montar();
    const itens = screen.getAllByTestId('cartaz-salvo');
    expect(itens).toHaveLength(3);
    for (const i of itens) expect(within(i).getByTestId('tabloide-canvas')).toBeTruthy();
    expect(itens[1].textContent).toContain('Imprimir A4 em pé');
    expect(within(itens[2]).getByTitle('Publicado no portal')).toBeTruthy();
  });

  it('imprime só os marcados: 2 de 3, 1 de 3 ou todos', async () => {
    montar();
    expect((screen.getByTestId('cartazes-imprimir') as HTMLButtonElement).disabled).toBe(true);
    const caixas = screen.getAllByTestId('cartaz-marcar');
    fireEvent.click(caixas[0]);
    fireEvent.click(caixas[2]);
    expect(screen.getByTestId('cartazes-contagem').textContent).toContain('2 de 3');
    fireEvent.click(screen.getByTestId('cartazes-imprimir'));
    await waitFor(() => expect(h.impressos).toHaveLength(1));
    expect(h.impressos[0]).toHaveLength(2);
    fireEvent.click(caixas[2]);
    fireEvent.click(screen.getByTestId('cartazes-imprimir'));
    await waitFor(() => expect(h.impressos).toHaveLength(2));
    expect(h.impressos[1]).toHaveLength(1);
    fireEvent.click(screen.getByTestId('cartazes-todos'));
    expect(screen.getByTestId('cartazes-contagem').textContent).toContain('3 de 3');
    fireEvent.click(screen.getByTestId('cartazes-imprimir'));
    await waitFor(() => expect(h.impressos).toHaveLength(3));
    expect(h.impressos[2]).toHaveLength(3);
  });

  it('abrir, duplicar e excluir agem só no cartaz escolhido', async () => {
    vi.stubGlobal('confirm', () => true);
    const p = montar({ abertoId: 'c2' });
    fireEvent.click(screen.getAllByTestId('cartaz-abrir')[0]);
    expect(p.aoAbrir).toHaveBeenCalledWith(tres[0]);
    fireEvent.click(screen.getByLabelText('Duplicar Churrasco'));
    await waitFor(() => expect(h.gravados.some((g) => g.tabela === 'tabloides' && g.verbo === 'insert' && g.payload.nome === 'Churrasco (cópia)')).toBe(true));
    fireEvent.click(screen.getByLabelText('Excluir Churrasco'));
    await waitFor(() => expect(p.aoExcluirAberto).toHaveBeenCalled());
    const apagado = h.gravados.find((g) => g.tabela === 'tabloides' && g.verbo === 'update')!.payload;
    expect(apagado.deleted_at).toBeTruthy();
    expect(apagado.publicado).toBe(false);
  });

  it('sem cartazes, explica como começar', () => {
    montar({ cartazes: [] });
    expect(screen.getByTestId('cartazes-vazio').textContent).toContain('ainda não salvou nenhum cartaz');
  });

  it('no editor: salvar guarda o cartaz; "Novo cartaz" guarda o atual antes de começar outro', async () => {
    render(<TabloideEditor contexto="painel" />);
    fireEvent.change(await screen.findByTestId('tabloide-texto'), { target: { value: 'Arroz 5kg 25,90' } });
    fireEvent.click(screen.getByTestId('tabloide-montar'));
    await waitFor(() => expect(screen.getByTestId('tabloide-lista').children).toHaveLength(1));
    fireEvent.change(screen.getByTestId('cartaz-nome'), { target: { value: 'Primeiro' } });
    expect(screen.getByTestId('cartaz-estado').textContent).toContain('ainda não salvo');
    fireEvent.click(screen.getByTestId('cartaz-novo'));
    await waitFor(() => expect(h.gravados.some((g) => g.tabela === 'tabloides' && g.verbo === 'insert')).toBe(true));
    const linha = h.gravados.find((g) => g.tabela === 'tabloides')!.payload;
    expect(linha.nome).toBe('Primeiro');
    expect(linha.produtos).toHaveLength(1);
    expect(linha.config.regras).toBeTruthy();
    await waitFor(() => expect((screen.getByTestId('cartaz-nome') as HTMLInputElement).value).toBe('Meu cartaz'));
    expect(screen.queryByTestId('tabloide-lista')).toBeNull();
    // cartaz em branco não é salvo à toa
    fireEvent.click(screen.getByTestId('cartaz-novo'));
    await new Promise((r) => setTimeout(r, 30));
    expect(h.gravados.filter((g) => g.tabela === 'tabloides' && g.verbo === 'insert')).toHaveLength(1);
  });

  it('a aba "Meus cartazes" lista só os do usuário e reabre o cartaz no editor', async () => {
    h.cartazes = [{ id: 'c9', nome: 'Guardado', formato: 'feed', tema: 'show', segmento: 'mercado', grade: 'auto', updated_at: '2026-10-10T10:00:00Z', publicado: false, imagens_publicadas: [], produtos: lerLista('Café 500g 18,90'), config: { titulo: 'Só hoje', subtitulo: 'Frase antiga', empresa: 'Loja antiga', logoCabecalhoId: 'id-minha' } }];
    render(<TabloideEditor contexto="painel" />);
    const aba = await screen.findByTestId('cartaz-vista-salvos');
    await waitFor(() => expect(aba.textContent).toContain('(1)'));
    fireEvent.click(aba);
    fireEvent.click(await screen.findByTestId('cartaz-abrir'));
    await waitFor(() => expect((screen.getByTestId('cartaz-nome') as HTMLInputElement).value).toBe('Guardado'));
    expect((screen.getByTestId('tabloide-modelo') as HTMLSelectElement).value).toBe('feed');
    expect((document.querySelector('[data-testid="tabloide-palco"] img[data-logo-cabecalho]') as HTMLImageElement).src).toBe('https://r2/id-minha.png');
    // rascunho antigo: "subtitulo" vira a frase e "empresa" em texto vira o nome da loja
    expect(screen.getByTestId('tabloide-frase').textContent).toBe('Frase antiga');
    expect(screen.getByTestId('tabloide-rodape').textContent).toContain('Loja antiga');
    expect(fonte('src/lib/tabloide/cartazes.ts')).toContain(".eq('user_id', usuarioId)");
  });
});

describe('F-179 · rascunhos antigos e modelo do cartaz', () => {
  it('lê qualquer coisa salva sem quebrar e limpa valores inválidos', () => {
    expect(normalizarConfig(null)).toEqual(configPadrao());
    const c = normalizarConfig({ titulo: 'X', subtitulo: 'Y', validade: 'até sábado', empresa: 'Loja', destaques: 7, logoMarcaUrl: 'javascript:alert(1)', seloUrl: 'http://inseguro/x.png', fundoLogo: 'rosa', regras: { inicio: '10/10/2026', fim: '2026-10-17' }, fontes: { produto: 'anton' }, elementos: [{ url: 'https://r2/a.png' }, null, { semUrl: true }] });
    expect(c.regras.frase).toBe('Y');
    expect(c.empresa.nome).toBe('Loja');
    expect(c.mostrar.nome).toBe(true);
    expect(c.observacoes).toContain('até sábado');
    expect(c.destaques).toBe(0);
    expect(c.logoMarcaUrl).toBeNull();
    expect(c.seloUrl).toBeNull();
    expect(c.fundoLogo).toBe('branco');
    expect(c.regras.inicio).toBe('');
    expect(c.regras.fim).toBe('2026-10-17');
    expect(c.fontes).toEqual({ produto: 'anton', preco: 'padrao', frase: 'padrao', rodape: 'padrao' });
    expect(c.elementos).toHaveLength(1);
  });

  it('a prévia, a lista, a impressão e o portal desenham pelo mesmo caminho', () => {
    for (const arq of ['src/components/tabloide/TabloideEditor.tsx', 'src/components/tabloide/MeusCartazes.tsx', 'src/lib/tabloide/cartazes.ts']) expect(fonte(arq)).toContain('propsDasPaginas');
    expect(fonte('src/lib/tabloide/cartazes.ts')).toContain('renderizarPaginaEmPng(p)');
    expect(fonte('src/lib/tabloide/cartazes.ts')).toContain('fontesUsadas(c.config).map(carregarFonte)');
  });
});

describe('F-179 · portal de ofertas', () => {
  it('o endereço vira letras minúsculas, números e hífen', () => {
    expect(enderecoDoPortal('Mercado Bom Preço!')).toBe('mercado-bom-preco');
    expect(enderecoDoPortal('  --Açougue & Cia--  ')).toBe('acougue-cia');
    expect(enderecoDoPortal('x'.repeat(80))).toHaveLength(40);
  });

  it('o painel tem endereço, CEP, até 3 segmentos, mostrar a loja e publicar este cartaz', async () => {
    render(<TabloideEditor contexto="painel" />);
    fireEvent.click(await screen.findByTestId('tabloide-aba-portal'));
    for (const t of ['portal-endereco', 'portal-cep', 'portal-segmentos', 'portal-visivel', 'portal-salvar', 'portal-publicar']) expect(screen.getByTestId(t)).toBeTruthy();
    fireEvent.change(screen.getByTestId('portal-endereco'), { target: { value: 'Mercado Bom Preço' } });
    expect(screen.getByTestId('portal-previa').textContent).toContain('/ofertas/mercado-bom-preco');
    const botoes = within(screen.getByTestId('portal-segmentos')).getAllByRole('button');
    for (const b of botoes.slice(0, 4)) fireEvent.click(b);
    expect(botoes.filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(3);
    fireEvent.click(screen.getByTestId('portal-visivel'));
    fireEvent.click(screen.getByTestId('portal-salvar'));
    await waitFor(() => expect(h.gravados.some((g) => g.tabela === 'tabloide_perfil' && g.payload.slug)).toBe(true));
    expect(h.gravados.find((g) => g.tabela === 'tabloide_perfil')!.payload).toMatchObject({ slug: 'mercado-bom-preco', visivel: true });
    expect(h.gravados.find((g) => g.tabela === 'tabloide_perfil')!.payload.segmentos).toHaveLength(3);
  });

  it('publicar guarda o cartaz, envia as imagens e marca como publicado; tirar do portal desmarca', async () => {
    simularImagens();
    h.perfil = { dados: {}, slug: 'minha-loja', cep: null, segmentos: [], visivel: true };
    render(<TabloideEditor contexto="painel" />);
    fireEvent.change(await screen.findByTestId('tabloide-texto'), { target: { value: 'Arroz 5kg 25,90' } });
    fireEvent.click(screen.getByTestId('tabloide-montar'));
    fireEvent.click(screen.getByTestId('tabloide-aba-portal'));
    await waitFor(() => expect((screen.getByTestId('portal-endereco') as HTMLInputElement).value).toBe('minha-loja'));
    expect(screen.getByTestId('portal-link').textContent).toContain('/ofertas/minha-loja');
    fireEvent.click(screen.getByTestId('portal-publicar'));
    await waitFor(() => expect(screen.getByTestId('portal-estado').textContent).toContain('Está publicado'));
    const pub = h.gravados.find((g) => g.tabela === 'tabloides' && g.verbo === 'update' && g.payload.publicado === true)!.payload;
    expect(pub.imagens_publicadas).toHaveLength(1);
    expect(pub.imagens_publicadas[0]).toMatch(/^https:\/\/r2\/u1\/cartaz\/portal\/cartaz-\d+-/);
    expect(pub.publicado_em).toBeTruthy();
    fireEvent.click(screen.getByTestId('portal-tirar'));
    await waitFor(() => expect(screen.getByTestId('portal-estado').textContent).toContain('Ainda não está'));
  });

  it('a página pública tem rota própria sem login e lê só pela função do banco', () => {
    const app = fonte('src/App.tsx');
    expect(app).toContain('<Route path="/ofertas/:slug" element={<PortalOfertas />} />');
    expect(app.indexOf('path="/ofertas/:slug"')).toBeLessThan(app.indexOf('path="/auth"'));
    const pagina = fonte('src/pages/PortalOfertas.tsx');
    expect(pagina).toContain('lerPortal(');
    expect(pagina).not.toContain('.from(');
    expect(pagina).not.toContain('useAuth');
    expect(fonte('src/lib/tabloide/perfil.ts')).toContain("rpc('tabloide_portal', { p_slug: slug })");
  });

  it('no banco: o visitante só chega pela função, que esconde loja oculta, cartaz não publicado, vencido e campo desligado', () => {
    const sql = fonte('supabase/migrations/20261324_cartaz_digital.sql');
    expect(sql).toContain('ALTER TABLE public.tabloide_perfil ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('USING (user_id = auth.uid() AND empresa_operadora_id = public.get_user_tenant_id())');
    expect(sql).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON public.tabloide_perfil TO authenticated');
    expect(sql).not.toMatch(/ON public\.tabloide_perfil TO anon/);
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain('WHERE slug = lower(p_slug) AND visivel');
    expect(sql).toContain('t.publicado AND t.deleted_at IS NULL');
    expect(sql).toContain("(p.dados -> 'mostrar' ->> e.k)::boolean");
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.tabloide_portal(text) FROM PUBLIC');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.tabloide_portal(text) TO anon, authenticated');
    // imagens particulares: quem enviou é o dono; ninguém cadastra "da empresa" sem ser da central
    expect(sql).toContain('OR dono_id = auth.uid()');
    expect(sql).toMatch(/cliente_id IS NULL AND dono_id IS NULL AND public\.is_central_privileged\(\)/);
  });
});
