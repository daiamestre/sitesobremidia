/**
 * F-151 — falso "online" ao mexer na tela pelo painel.
 * F-152 — "Adicionar mídia" dentro de cada zona e na criação de tela: Mídias da galeria ou Playlist.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent } from '@testing-library/react';
import { SeletorDeConteudo, duracaoPadraoDoItem } from '@/components/screens/SeletorDeConteudo';

const ler = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

describe('F-151 — online só com sinal do aparelho', () => {
  const sql = ler('supabase/migrations/20261307_online_so_com_sinal_do_aparelho.sql');

  it('o gatilho só carimba o último sinal quando a atualização traz um sinal; edição do painel mantém o que estava', () => {
    expect(sql).toContain('IF NEW.last_ping_at IS DISTINCT FROM OLD.last_ping_at THEN');
    expect(sql).toContain('NEW.last_ping_at = now();');
    expect(sql).toContain('NEW.last_ping_at = OLD.last_ping_at;');
    // não existe mais o carimbo incondicional
    const corpo = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION')); // sem os comentários do cabeçalho
    expect(corpo.split('NEW.last_ping_at = now();')).toHaveLength(2);
  });

  it('o Player continua mandando o sinal explicitamente (por isso nada muda para ele)', () => {
    const android = ler('native-android-player/sync-network/src/main/java/com/antigravity/sync/service/RemoteDataSource.kt');
    expect(android).toContain('put("last_ping_at", getIsoTimestamp())');
    expect(ler('src/hooks/usePlayerHeartbeat.ts')).toContain('.update({ last_ping_at: new Date().toISOString() })');
  });

  it('no painel, tela sem aparelho pareado nunca aparece online', () => {
    expect(ler('src/pages/dashboard/ScreenDetails.tsx')).toMatch(/const isOnline = screen\.is_active !== false && !!\(screen as unknown as \{ bound_device_id\?: string \| null \}\)\.bound_device_id && !!screen\.last_ping_at/);
    expect(ler('src/hooks/useScreens.ts')).toContain('if (screen.last_ping_at && (screen as unknown as { bound_device_id?: string | null }).bound_device_id) {');
  });
});

describe('F-152 — Adicionar mídia: galeria ou playlist', () => {
  it('a janela mostra as duas opções e abre a que o usuário escolher', () => {
    const fechar = vi.fn();
    render(<SeletorDeConteudo aberto titulo="Adicionar mídia na zona 1" onFechar={fechar} onMidia={vi.fn()} onPlaylist={vi.fn()} />);
    expect(screen.getByText('Adicionar mídia na zona 1')).toBeInTheDocument();
    expect(screen.getByTestId('opcao-galeria')).toHaveTextContent('Mídias da galeria');
    expect(screen.getByTestId('opcao-playlist')).toHaveTextContent('Playlist');
    fireEvent.click(screen.getByTestId('opcao-galeria'));
    expect(screen.getByPlaceholderText('Pesquisar mídia pelo nome')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Voltar'));
    fireEvent.click(screen.getByTestId('opcao-playlist'));
    expect(screen.getByPlaceholderText('Pesquisar playlist pelo nome')).toBeInTheDocument();
  });

  it('duração padrão do item: o vídeo inteiro; imagem, 10 segundos', () => {
    expect(duracaoPadraoDoItem({ file_type: 'video', duration_ms: 31500 })).toBe(32);
    expect(duracaoPadraoDoItem({ file_type: 'video', duration_ms: null })).toBe(10);
    expect(duracaoPadraoDoItem({ file_type: 'image', duration_ms: null })).toBe(10);
  });

  it('o botão fica dentro de cada zona assim que ela é criada, e o painel da zona tem as duas opções', () => {
    const editor = ler('src/components/screens/EditorDeZonas.tsx');
    expect(editor).toContain('data-testid="adicionar-na-zona"');
    expect(editor).toContain("setSeletor({ chave: z.chave, passo: 'opcoes' })");
    expect(editor).toContain('data-testid="conteudo-galeria"');
    expect(editor).toContain('data-testid="conteudo-playlist"');
    // clicar no botão não começa a arrastar a zona
    expect(editor).toMatch(/data-testid="adicionar-na-zona"[\s\S]{0,160}onPointerDown=\{\(e\) => e\.stopPropagation\(\)\}/);
  });

  it('vale para a zona principal: mídia e playlist vão para a playlist da própria tela', () => {
    const editor = ler('src/components/screens/EditorDeZonas.tsx');
    expect(editor).toContain("await supabase.from('screens').update({ playlist_id: pl.id } as never).eq('id', tela.id);");
    expect(editor).toContain("const nova = await criarPlaylistComMidias(user.id, tela.name, resolucao, [m]);");
    expect(editor).toContain('const playlistDaZona = zona ? (zona.principal ? telaPlaylistId : zona.playlist_id) : null;');
    expect(editor).not.toContain('A zona principal toca a playlist da tela. Adicione a mídia na Lista de Reprodução da tela.');
  });

  it('na criação de tela existem as duas opções; mídias da galeria viram a playlist da tela ao salvar', () => {
    const tela = ler('src/components/screens/ScreenDialog.tsx');
    expect(tela).toContain('data-testid="tela-galeria"');
    expect(tela).toContain('data-testid="tela-playlist"');
    expect(tela).toContain('const nova = await criarPlaylistComMidias(user.id, name, resolution, midiasEscolhidas);');
    expect(tela.split('playlist_id: playlistFinal,')).toHaveLength(3);
  });
});
