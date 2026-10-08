/**
 * F-157 — "Enviar áudio" (galeria e Rádio Comércio) abre a janela SÓ de áudio: nada de empresa, segmento, proporção de
 * tela nem agendamento, e só aceita arquivo de áudio. O envio de mídia comum continua igual.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const toastErro = vi.fn();
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: (m: string) => toastErro(m), info: vi.fn(), warning: vi.fn() } }));
const stableAuth = { user: { id: 'u1' } };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => stableAuth }));
vi.mock('@/lib/mediaDuration', async () => {
  const actual = await vi.importActual<typeof import('@/lib/mediaDuration')>('@/lib/mediaDuration');
  return { ...actual, probeFileDurationMs: vi.fn(async () => 184_500), probeVideoDurationMs: vi.fn(async () => null) };
});

import { MediaUploadDialog } from '@/components/media/MediaUploadDialog';

const ler = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const arquivo = (nome: string, tipo: string) => new File(['x'], nome, { type: tipo });
const entrada = () => document.querySelector('input[type="file"]') as HTMLInputElement;

describe('janela só de áudio', () => {
  beforeAll(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
  });

  it('título e textos de áudio; sem empresa, segmento, proporção de tela nem agendamento', () => {
    render(<MediaUploadDialog open onOpenChange={() => {}} onUploadComplete={() => {}} somenteAudio semPlaylist />);
    expect(screen.getByText('Enviar áudio')).toBeTruthy();
    expect(screen.getByLabelText('Nome do áudio')).toBeTruthy();
    expect(screen.getByLabelText('Duração do áudio')).toBeTruthy();
    expect(screen.getByText('Arraste e solte seus áudios aqui')).toBeTruthy();
    expect(screen.getByText('Suporta: MP3, WAV, AAC, OGG, M4A')).toBeTruthy();
    expect(screen.queryByLabelText('Nome da Empresa')).toBeNull();
    expect(screen.queryByText('Seguimento')).toBeNull();
    expect(screen.queryByText('Proporção de Tela')).toBeNull();
    expect(screen.queryByText('Agendamento')).toBeNull();
    expect(screen.queryByText('Upload de Mídias')).toBeNull();
  });

  it('o seletor de arquivos só oferece áudio', () => {
    render(<MediaUploadDialog open onOpenChange={() => {}} onUploadComplete={() => {}} somenteAudio semPlaylist />);
    const aceita = entrada().accept.split(',');
    expect(aceita).toContain('audio/mpeg');
    expect(aceita).toContain('audio/x-m4a');
    expect(aceita.some((t) => t.startsWith('video/') || t.startsWith('image/'))).toBe(false);
  });

  it('recusa vídeo e imagem com aviso de áudio, aceita MP3 e mostra o botão "Enviar 1 áudio"', async () => {
    toastErro.mockClear();
    render(<MediaUploadDialog open onOpenChange={() => {}} onUploadComplete={() => {}} somenteAudio semPlaylist />);
    fireEvent.change(entrada(), { target: { files: [arquivo('filme.mp4', 'video/mp4'), arquivo('foto.jpg', 'image/jpeg')] } });
    await waitFor(() => expect(toastErro).toHaveBeenCalledTimes(2));
    expect(toastErro.mock.calls[0][0]).toContain('só é possível enviar áudio');
    expect((screen.getByText('Enviar 0 áudios') as HTMLButtonElement).disabled).toBe(true); // nada aceito: nada para enviar
    fireEvent.change(entrada(), { target: { files: [arquivo('musica.mp3', 'audio/mpeg')] } });
    expect(await screen.findByText('Enviar 1 áudio')).toBeTruthy();
    await waitFor(() => expect((screen.getByLabelText('Duração do áudio') as HTMLInputElement).value).toBe('185'));
  });
});

describe('janela de mídia comum continua igual', () => {
  it('mantém empresa, segmento, proporção, agendamento e aceita imagem/vídeo/áudio', () => {
    render(<MediaUploadDialog open onOpenChange={() => {}} onUploadComplete={() => {}} />);
    expect(screen.getByText('Upload de Mídias', { selector: 'h2' })).toBeTruthy();
    expect(screen.getByLabelText('Nome da Empresa')).toBeTruthy();
    expect(screen.getByText('Proporção de Tela')).toBeTruthy();
    expect(screen.getByText('Agendamento')).toBeTruthy();
    const aceita = entrada().accept.split(',');
    expect(aceita).toContain('video/mp4');
    expect(aceita).toContain('image/png');
    expect(aceita).toContain('audio/mpeg');
  });
});

describe('quem abre a janela de áudio', () => {
  it('Minhas Mídias: botão "Enviar áudio", pasta de áudios e ?novo=audio abrem o modo só áudio', () => {
    const src = ler('src/pages/dashboard/Medias.tsx');
    expect(src).toContain('data-testid="enviar-audio"');
    expect(src).toContain("novo !== '1' && novo !== 'audio'");
    expect(src).toContain("setEnvioSomenteAudio(novo === 'audio')");
    expect(src).toContain("abrirEnvio(currentFolder === 'audio')");
    expect(src).toContain('somenteAudio={envioSomenteAudio && !editMedia}');
  });
  it('Rádio Comércio: envia áudio na própria página (janela só de áudio) e atualiza a lista', () => {
    const src = ler('src/components/radio/PainelDaRadio.tsx');
    expect(src).toContain('<MediaUploadDialog open={enviarAudio}');
    expect(src).toContain('somenteAudio semPlaylist');
    expect(src).toContain('data-testid="enviar-audio-radio"');
    expect(src).not.toContain('/dashboard/medias?novo=1');
    expect(src).toContain('radioService.audios(busca).then(setAudios)');
  });
});
