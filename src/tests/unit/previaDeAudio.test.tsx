/**
 * F-162 — Prévia de áudio: tocar, pausar, avançar, volume e silenciar; só um áudio toca por vez; usada no envio,
 * na janela de prévia da mídia e nas listas da Rádio Comércio.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { PreviaDeAudio } from '@/components/audio/PreviaDeAudio';
import { formatarTempo, limitar, porcentagemTocada } from '@/lib/previaDeAudio';

const ler = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

describe('regras do player', () => {
  it('tempo legível', () => {
    expect(formatarTempo(0)).toBe('0:00');
    expect(formatarTempo(5.9)).toBe('0:05');
    expect(formatarTempo(65)).toBe('1:05');
    expect(formatarTempo(3725)).toBe('1:02:05');
    for (const v of [NaN, Infinity, -4, null, undefined]) expect(formatarTempo(v as number)).toBe('0:00');
  });
  it('limites e porcentagem', () => {
    expect(limitar(150, 100)).toBe(100);
    expect(limitar(-3, 100)).toBe(0);
    expect(limitar(NaN, 100)).toBe(0);
    expect(porcentagemTocada(30, 120)).toBe(25);
    expect(porcentagemTocada(5, 0)).toBe(0);
  });
});

describe('componente', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:previa'), revokeObjectURL: vi.fn() }));
    // o jsdom não toca áudio: simulamos os eventos que o navegador dispara
    HTMLMediaElement.prototype.play = vi.fn(function (this: HTMLMediaElement) { Object.defineProperty(this, 'paused', { value: false, configurable: true }); this.dispatchEvent(new Event('play')); return Promise.resolve(); });
    HTMLMediaElement.prototype.pause = vi.fn(function (this: HTMLMediaElement) { Object.defineProperty(this, 'paused', { value: true, configurable: true }); this.dispatchEvent(new Event('pause')); });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  const audioDe = (i = 0) => screen.getAllByTestId('previa-audio')[i] as HTMLAudioElement;
  const carregar = (a: HTMLAudioElement, duracao: number) => { Object.defineProperty(a, 'duration', { value: duracao, configurable: true }); fireEvent.loadedMetadata(a); };

  it('toca e pausa pelo mesmo botão, com o rótulo certo', async () => {
    render(<PreviaDeAudio src="https://x/musica.mp3" titulo="Música" />);
    const botao = screen.getByTestId('previa-tocar');
    expect(botao.getAttribute('aria-label')).toBe('Tocar — Música');
    fireEvent.click(botao);
    await waitFor(() => expect(screen.getByTestId('previa-tocar').getAttribute('aria-label')).toBe('Pausar — Música'));
    fireEvent.click(screen.getByTestId('previa-tocar'));
    await waitFor(() => expect(screen.getByTestId('previa-tocar').getAttribute('aria-label')).toBe('Tocar — Música'));
  });

  it('mostra o tempo e deixa avançar/voltar pela barra', async () => {
    render(<PreviaDeAudio src="https://x/a.mp3" />);
    carregar(audioDe(), 185);
    await waitFor(() => expect(screen.getByTestId('previa-tempo').textContent).toBe('0:00 / 3:05'));
    fireEvent.change(screen.getByTestId('previa-posicao'), { target: { value: '65' } });
    expect(audioDe().currentTime).toBe(65);
    expect(screen.getByTestId('previa-tempo').textContent).toBe('1:05 / 3:05');
  });

  it('volume e silenciar', () => {
    render(<PreviaDeAudio src="https://x/a.mp3" />);
    fireEvent.change(screen.getByTestId('previa-volume'), { target: { value: '0.4' } });
    expect(audioDe().volume).toBeCloseTo(0.4);
    fireEvent.click(screen.getByTestId('previa-mudo'));
    expect(audioDe().muted).toBe(true);
    expect(screen.getByTestId('previa-mudo').getAttribute('aria-label')).toBe('Ativar o som');
    fireEvent.click(screen.getByTestId('previa-mudo'));
    expect(audioDe().muted).toBe(false);
  });

  it('só um áudio toca por vez: começar o segundo pausa o primeiro', async () => {
    render(<><PreviaDeAudio src="https://x/1.mp3" titulo="Um" /><PreviaDeAudio src="https://x/2.mp3" titulo="Dois" /></>);
    const [b1, b2] = screen.getAllByTestId('previa-tocar');
    fireEvent.click(b1);
    await waitFor(() => expect(screen.getAllByTestId('previa-tocar')[0].getAttribute('aria-label')).toBe('Pausar — Um'));
    fireEvent.click(b2);
    await waitFor(() => expect(screen.getAllByTestId('previa-tocar')[1].getAttribute('aria-label')).toBe('Pausar — Dois'));
    expect(screen.getAllByTestId('previa-tocar')[0].getAttribute('aria-label')).toBe('Tocar — Um');
  });

  it('arquivo do computador: cria o endereço temporário e o libera ao fechar', () => {
    const arquivo = new File(['x'], 'jingle.mp3', { type: 'audio/mpeg' });
    const { unmount } = render(<PreviaDeAudio arquivo={arquivo} />);
    expect(URL.createObjectURL).toHaveBeenCalledWith(arquivo);
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:previa');
  });

  it('áudio que não carrega: avisa e trava o botão', async () => {
    render(<PreviaDeAudio src="https://x/quebrado.mp3" />);
    fireEvent.error(audioDe());
    await waitFor(() => expect(screen.getByText('Não foi possível tocar este áudio.')).toBeTruthy());
    expect((screen.getByTestId('previa-tocar') as HTMLButtonElement).disabled).toBe(true);
  });

  it('versão mini (listas): só botão e tempo, com a duração conhecida', () => {
    render(<PreviaDeAudio variante="mini" src="https://x/a.mp3" duracaoMs={185000} />);
    expect(screen.getByTestId('previa-mini').textContent).toContain('3:05');
    expect(screen.queryByTestId('previa-posicao')).toBeNull();
    expect(screen.queryByTestId('previa-volume')).toBeNull();
  });

  it('tocar ao abrir (janela de prévia) tenta começar sozinho', async () => {
    render(<PreviaDeAudio src="https://x/a.mp3" tocarAoAbrir />);
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalled());
  });
});

describe('onde a prévia aparece', () => {
  it('envio (cada áudio escolhido), janela de prévia da mídia e listas da Rádio Comércio', () => {
    expect(ler('src/components/media/MediaUploadDialog.tsx')).toContain('<PreviaDeAudio arquivo={uploadFile.file}');
    expect(ler('src/components/media/MediaUploadDialog.tsx')).toContain('<PreviaDeAudio src={editMedia.file_url}');
    expect(ler('src/components/media/MediaPreviewDialog.tsx')).toContain('<PreviaDeAudio src={media.file_url}');
    expect(ler('src/components/media/MediaPreviewDialog.tsx')).not.toContain('<audio');
    const radio = ler('src/components/radio/PainelDaRadio.tsx');
    expect(radio.match(/<PreviaDeAudio variante="mini"/g)).toHaveLength(2); // faixas da rádio e áudios da galeria
  });
});
