/**
 * F-161 — Envio de vídeo, imagem e áudio: o campo "Nome" se preenche sozinho com o nome do próprio arquivo.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const stableAuth = { user: { id: 'u1' } };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => stableAuth }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock('@/lib/mediaDuration', async () => {
  const actual = await vi.importActual<typeof import('@/lib/mediaDuration')>('@/lib/mediaDuration');
  return { ...actual, probeFileDurationMs: vi.fn(async () => 5_000), probeVideoDurationMs: vi.fn(async () => null) };
});

import { MediaUploadDialog } from '@/components/media/MediaUploadDialog';
import { NOME_MAXIMO, nomeDoArquivo, nomeFinalDoArquivo } from '@/lib/nomeUpload';

const ler = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const arquivo = (nome: string, tipo: string) => new File(['x'], nome, { type: tipo });
const entrada = () => document.querySelector('input[type="file"]') as HTMLInputElement;
const campo = () => document.getElementById('mediaName') as HTMLInputElement;
const escolher = (...fs: File[]) => fireEvent.change(entrada(), { target: { files: fs } });

describe('nome do arquivo', () => {
  it('tira só a última extensão e mantém o resto do nome', () => {
    expect(nomeDoArquivo('Promoção Verão.mp4')).toBe('Promoção Verão');
    expect(nomeDoArquivo('foto.final.JPG')).toBe('foto.final');
    expect(nomeDoArquivo('jingle_loja_01.mp3')).toBe('jingle_loja_01');
    expect(nomeDoArquivo('semextensao')).toBe('semextensao');
    expect(nomeDoArquivo('  muitos   espaços .png ')).toBe('muitos espaços');
    expect(nomeDoArquivo('C:\\Users\\x\\Vídeos\\clipe.mov')).toBe('clipe');
    expect(nomeDoArquivo('.png')).toBe('.png'); // nada sobra: fica o que tem, nunca vazio
    expect(nomeDoArquivo('')).toBe('');
    expect(nomeDoArquivo(`${'a'.repeat(300)}.mp4`)).toHaveLength(NOME_MAXIMO);
  });

  it('sem mexer no campo cada arquivo usa o próprio nome; digitado vale (vários: numerado); nunca vazio', () => {
    const base = { digitado: '', alterado: false, total: 3 };
    expect([0, 1, 2].map((i) => nomeFinalDoArquivo({ ...base, arquivo: `video${i}.mp4`, indice: i }))).toEqual(['video0', 'video1', 'video2']);
    expect(nomeFinalDoArquivo({ digitado: 'Academia', alterado: true, arquivo: 'x.mp4', indice: 1, total: 3 })).toBe('Academia 02');
    expect(nomeFinalDoArquivo({ digitado: 'Academia', alterado: true, arquivo: 'x.mp4', indice: 0, total: 1 })).toBe('Academia');
    expect(nomeFinalDoArquivo({ digitado: '  ', alterado: true, arquivo: 'x.mp4', indice: 0, total: 1 })).toBe('x');
    expect(nomeFinalDoArquivo({ digitado: '', alterado: false, arquivo: '.png', indice: 0, total: 1 })).toBe('.png');
  });
});

describe('campo Nome na janela de envio', () => {
  beforeAll(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
  });
  const abrir = (extra: Partial<React.ComponentProps<typeof MediaUploadDialog>> = {}) => render(<MediaUploadDialog open onOpenChange={() => {}} onUploadComplete={() => {}} {...extra} />);

  it('começa vazio, com aviso de que será preenchido sozinho', () => {
    abrir();
    expect(campo().value).toBe('');
    expect(campo().placeholder).toBe('Preenchido sozinho com o nome do arquivo');
  });

  it.each([
    ['vídeo', 'Promo Verão 2026.mp4', 'video/mp4', 'Promo Verão 2026'],
    ['imagem', 'cartaz_loja.png', 'image/png', 'cartaz_loja'],
    ['áudio', 'Jingle da loja.mp3', 'audio/mpeg', 'Jingle da loja'],
  ])('%s: o campo vira o nome do arquivo sem a extensão', async (_t, nome, tipo, esperado) => {
    abrir();
    escolher(arquivo(nome, tipo));
    await waitFor(() => expect(campo().value).toBe(esperado));
  });

  it('janela só de áudio também preenche', async () => {
    abrir({ somenteAudio: true, semPlaylist: true });
    escolher(arquivo('Música ambiente.wav', 'audio/wav'));
    await waitFor(() => expect(campo().value).toBe('Música ambiente'));
  });

  it('vários arquivos: mostra o 1º e avisa que cada um terá o próprio nome', async () => {
    abrir();
    escolher(arquivo('a-promo.mp4', 'video/mp4'), arquivo('b-foto.jpg', 'image/jpeg'));
    await waitFor(() => expect(campo().value).toBe('a-promo'));
    expect(screen.getByTestId('dica-nomes-proprios').textContent).toContain('2 arquivos: cada um será salvo com o próprio nome');
    expect(screen.queryByTestId('dica-nomes')).toBeNull();
  });

  it('se a pessoa digita, o nome dela vale e deixa de acompanhar o arquivo; apagar volta ao automático', async () => {
    abrir();
    escolher(arquivo('original.mp4', 'video/mp4'));
    await waitFor(() => expect(campo().value).toBe('original'));
    fireEvent.change(campo(), { target: { value: 'Meu nome' } });
    escolher(arquivo('outro.mp4', 'video/mp4'));
    expect(campo().value).toBe('Meu nome');
    expect(screen.getByTestId('dica-nomes').textContent).toContain('“Meu nome 01”, “Meu nome 02”');
    expect(screen.queryByTestId('dica-nomes-proprios')).toBeNull();
    fireEvent.change(campo(), { target: { value: '' } });
    await waitFor(() => expect(campo().value).toBe('original'));
  });

  it('nome em branco não impede o envio: com arquivo escolhido o botão fica disponível', async () => {
    abrir();
    escolher(arquivo('so-o-arquivo.mp4', 'video/mp4'));
    await waitFor(() => expect(screen.getByText('Enviar 1 arquivo(s)')).toBeTruthy());
    expect((screen.getByText('Enviar 1 arquivo(s)') as HTMLButtonElement).disabled).toBe(false);
  });

  it('edição de uma mídia existente não troca o nome pelo do arquivo novo', async () => {
    const existente = { id: 'm1', name: 'Nome já salvo', file_type: 'image', file_url: 'https://x/m1.jpg', file_path: 'm1.jpg' } as never;
    abrir({ editMedia: existente });
    await waitFor(() => expect(campo().value).toBe('Nome já salvo'));
    escolher(arquivo('troca.png', 'image/png'));
    await new Promise((r) => setTimeout(r, 50));
    expect(campo().value).toBe('Nome já salvo');
  });
});

describe('o envio usa a regra nova', () => {
  const src = ler('src/components/media/MediaUploadDialog.tsx');
  it('nome final de cada arquivo vem de nomeFinalDoArquivo e o campo acompanha o 1º arquivo', () => {
    expect(src).toContain('const finalName = nomeFinalDoArquivo({ digitado: mediaName, alterado: nomeAlterado, arquivo: uploadFile.file.name, indice: i, total: files.length });');
    expect(src).toContain('setMediaName(files[0] ? nomeDoArquivo(files[0].file.name) : \'\');');
    expect(src).not.toContain("toast.error('Por favor, preencha o nome da mídia');\n      return;\n    }\n\n    if (!somenteAudio && !companyName");
  });
});
