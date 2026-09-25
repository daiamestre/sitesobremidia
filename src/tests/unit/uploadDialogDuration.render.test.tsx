import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// objeto ESTAVEL: um novo a cada render dispara o useEffect([open, user]) do dialogo em laco infinito
const stableAuth = { user: { id: 'u1' } };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => stableAuth }));

// Duração "real" de cada arquivo, por nome (vídeo 42 s, áudio 185 s, outro vídeo 7 s).
vi.mock('@/lib/mediaDuration', async () => {
  const actual = await vi.importActual<typeof import('@/lib/mediaDuration')>('@/lib/mediaDuration');
  const byName: Record<string, number> = { 'promo.mp4': 42, 'jingle.mp3': 185, 'curto.mp4': 7 };
  return {
    ...actual,
    probeFileDuration: vi.fn(async (f: File) => byName[f.name] ?? null),
    // mídia já existente (edição): lida pela URL
    probeVideoDuration: vi.fn(async (url: string) => (url.includes('existente.mp4') ? 95 : null)),
  };
});

import { MediaUploadDialog } from '@/components/media/MediaUploadDialog';

const file = (name: string, type: string) => new File(['x'], name, { type });

function addFiles(container: HTMLElement, files: File[]) {
  const input = container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files } });
}

describe('Upload de Mídias — "Tempo de Mídia" já vem com o tempo da mídia adicionada', () => {
  beforeAll(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
  });

  const field = () => screen.getByLabelText('Tempo de Mídia') as HTMLInputElement;

  it('vídeo adicionado: o campo mostra a duração do vídeo', async () => {
    const { container } = render(<MediaUploadDialog open onOpenChange={() => {}} onUploadComplete={() => {}} />);
    expect(field().value).toBe('10'); // antes de adicionar: padrão
    addFiles(container, [file('promo.mp4', 'video/mp4')]);
    await waitFor(() => expect(field().value).toBe('42'));
    expect(await screen.findByText(/42s/)).toBeInTheDocument(); // e a linha do arquivo mostra o tempo
  });

  it('áudio/vídeo com mais de 2 min: o campo mostra o tempo real (antes o máximo era 120)', async () => {
    const { container } = render(<MediaUploadDialog open onOpenChange={() => {}} onUploadComplete={() => {}} />);
    addFiles(container, [file('jingle.mp3', 'audio/mpeg')]);
    await waitFor(() => expect(field().value).toBe('185'));
    // aparece na linha do arquivo e na dica do campo
    expect(screen.getAllByText(/3m 5s/).length).toBeGreaterThanOrEqual(2);
  });

  it('imagem adicionada: 10 s (imagem não tem duração própria)', async () => {
    const { container } = render(<MediaUploadDialog open onOpenChange={() => {}} onUploadComplete={() => {}} />);
    addFiles(container, [file('promo.mp4', 'video/mp4')]);
    await waitFor(() => expect(field().value).toBe('42'));
    addFiles(container, [file('foto.jpg', 'image/jpeg')]);
    await waitFor(() => expect(field().value).toBe('10'));
  });

  it('a cada mídia adicionada o campo acompanha a última', async () => {
    const { container } = render(<MediaUploadDialog open onOpenChange={() => {}} onUploadComplete={() => {}} />);
    addFiles(container, [file('promo.mp4', 'video/mp4')]);
    await waitFor(() => expect(field().value).toBe('42'));
    addFiles(container, [file('curto.mp4', 'video/mp4')]);
    await waitFor(() => expect(field().value).toBe('7'));
  });

  it('editar uma mídia já existente (vídeo) mostra o tempo real dela no campo', async () => {
    const media = { id: 'm1', name: 'Existente', file_type: 'video', file_url: 'https://cdn/x/existente.mp4', aspect_ratio: '16x9' } as never;
    render(<MediaUploadDialog open onOpenChange={() => {}} onUploadComplete={() => {}} editMedia={media} />);
    await waitFor(() => expect(field().value).toBe('95'));
  });

  it('se o usuário digitou um valor, novas mídias NÃO o sobrescrevem', async () => {
    const { container } = render(<MediaUploadDialog open onOpenChange={() => {}} onUploadComplete={() => {}} />);
    fireEvent.change(field(), { target: { value: '30' } });
    addFiles(container, [file('promo.mp4', 'video/mp4')]);
    await screen.findByText(/42s/);
    expect(field().value).toBe('30');
  });
});
