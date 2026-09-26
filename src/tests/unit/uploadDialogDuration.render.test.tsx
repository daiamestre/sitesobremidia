import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// objeto ESTAVEL: um novo a cada render dispara o useEffect([open, user]) do dialogo em laco infinito
const stableAuth = { user: { id: 'u1' } };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => stableAuth }));

// Duração EXATA (ms) de cada arquivo, por nome: vídeo 41,250 s, áudio 184,500 s, outro vídeo 6,928 s.
vi.mock('@/lib/mediaDuration', async () => {
  const actual = await vi.importActual<typeof import('@/lib/mediaDuration')>('@/lib/mediaDuration');
  const byName: Record<string, number> = { 'promo.mp4': 41_250, 'jingle.mp3': 184_500, 'curto.mp4': 6_928 };
  return {
    ...actual,
    probeFileDurationMs: vi.fn(async (f: File) => byName[f.name] ?? null),
    // mídia já existente (edição) sem duração gravada: lida pela URL
    probeVideoDurationMs: vi.fn(async (url: string) => (url.includes('existente.mp4') ? 94_120 : null)),
  };
});

import { MediaUploadDialog } from '@/components/media/MediaUploadDialog';

const file = (name: string, type: string) => new File(['x'], name, { type });

function addFiles(container: HTMLElement, files: File[]) {
  const input = container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files } });
}

describe('Upload de Mídias — "Tempo de Mídia" com a duração exata da mídia', () => {
  beforeAll(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
  });

  const field = () => screen.getByLabelText('Tempo de Mídia') as HTMLInputElement;
  const hint = () => screen.getByTestId('upload-real-duration').textContent || '';

  it('vídeo adicionado: campo com o segundo cheio e a duração exata com milésimos', async () => {
    const { container } = render(<MediaUploadDialog open onOpenChange={() => {}} onUploadComplete={() => {}} />);
    expect(field().value).toBe('10'); // antes de adicionar: padrão
    addFiles(container, [file('promo.mp4', 'video/mp4')]);
    await waitFor(() => expect(field().value).toBe('42')); // 41,250 s -> 42 (a tela toca os 41,250 s inteiros)
    expect(await screen.findByText(/· 41,250 s/)).toBeInTheDocument(); // linha do arquivo
    expect(hint()).toContain('41,250 s — a tela toca o vídeo inteiro');
  });

  it('Tempo de Mídia menor que o vídeo: avisa que a tela corta o final', async () => {
    const { container } = render(<MediaUploadDialog open onOpenChange={() => {}} onUploadComplete={() => {}} />);
    addFiles(container, [file('promo.mp4', 'video/mp4')]);
    await waitFor(() => expect(field().value).toBe('42'));
    fireEvent.change(field(), { target: { value: '30' } });
    await waitFor(() => expect(hint()).toContain('corta o final (toca 30,000 s)'));
  });

  it('áudio/vídeo com mais de 2 min: o campo mostra o tempo real (antes o máximo era 120)', async () => {
    const { container } = render(<MediaUploadDialog open onOpenChange={() => {}} onUploadComplete={() => {}} />);
    addFiles(container, [file('jingle.mp3', 'audio/mpeg')]);
    await waitFor(() => expect(field().value).toBe('185'));
    expect(screen.getByText(/3m 5s/)).toBeInTheDocument(); // dica do campo
    expect(screen.getByText(/· 184,500 s/)).toBeInTheDocument(); // linha do arquivo, exata
  });

  it('imagem adicionada: 10 s (imagem não tem duração própria)', async () => {
    const { container } = render(<MediaUploadDialog open onOpenChange={() => {}} onUploadComplete={() => {}} />);
    addFiles(container, [file('promo.mp4', 'video/mp4')]);
    await waitFor(() => expect(field().value).toBe('42'));
    addFiles(container, [file('foto.jpg', 'image/jpeg')]);
    await waitFor(() => expect(field().value).toBe('10'));
    expect(screen.queryByTestId('upload-real-duration')).toBeNull();
  });

  it('a cada mídia adicionada o campo acompanha a última', async () => {
    const { container } = render(<MediaUploadDialog open onOpenChange={() => {}} onUploadComplete={() => {}} />);
    addFiles(container, [file('promo.mp4', 'video/mp4')]);
    await waitFor(() => expect(field().value).toBe('42'));
    addFiles(container, [file('curto.mp4', 'video/mp4')]);
    await waitFor(() => expect(field().value).toBe('7'));
    expect(hint()).toContain('6,928 s');
  });

  it('editar uma mídia já existente (vídeo) mostra o tempo real dela no campo', async () => {
    const media = { id: 'm1', name: 'Existente', file_type: 'video', file_url: 'https://cdn/x/existente.mp4', aspect_ratio: '16x9' } as never;
    render(<MediaUploadDialog open onOpenChange={() => {}} onUploadComplete={() => {}} editMedia={media} />);
    await waitFor(() => expect(field().value).toBe('95'));
    expect(hint()).toContain('94,120 s');
  });

  it('editar mídia com duração gravada (media.duration_ms) usa o valor exato sem ler o arquivo', async () => {
    const media = { id: 'm2', name: 'Gravada', file_type: 'video', file_url: 'https://cdn/x/outra.mp4', aspect_ratio: '9x16', duration_ms: 17_764 } as never;
    render(<MediaUploadDialog open onOpenChange={() => {}} onUploadComplete={() => {}} editMedia={media} />);
    await waitFor(() => expect(field().value).toBe('18'));
    expect(hint()).toContain('17,764 s');
  });

  it('se o usuário digitou um valor, novas mídias NÃO o sobrescrevem', async () => {
    const { container } = render(<MediaUploadDialog open onOpenChange={() => {}} onUploadComplete={() => {}} />);
    fireEvent.change(field(), { target: { value: '30' } });
    addFiles(container, [file('promo.mp4', 'video/mp4')]);
    await screen.findByText(/· 41,250 s/);
    expect(field().value).toBe('30');
  });
});

describe('Upload de Mídias — modo Biblioteca de Mídias (mesmo uploader, sem caminho paralelo)', () => {
  beforeAll(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  });

  it('título da pasta e sem "Adicionar à Playlist" (o destino é a pasta da Biblioteca)', () => {
    render(<MediaUploadDialog open onOpenChange={() => {}} onUploadComplete={() => {}} semPlaylist titulo='Adicionar mídia em "Esporte Vídeos"' onUploadedIds={() => {}} />);
    expect(screen.getByText('Adicionar mídia em "Esporte Vídeos"')).toBeInTheDocument();
    expect(screen.queryByText('Adicionar à Playlist (Opcional)')).toBeNull();
  });

  it('modo normal (Minhas Mídias) continua igual: título e seletor de playlist', () => {
    render(<MediaUploadDialog open onOpenChange={() => {}} onUploadComplete={() => {}} />);
    expect(screen.getByText('Upload de Mídias', { selector: 'h2' })).toBeInTheDocument();
    expect(screen.getByText('Adicionar à Playlist (Opcional)')).toBeInTheDocument();
  });
});
