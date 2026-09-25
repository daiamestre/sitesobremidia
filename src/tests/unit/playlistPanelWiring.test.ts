import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const read = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');

/**
 * Auditoria playlist (painel -> banco -> Player). Regras de fiação que impedem a volta dos defeitos provados:
 *  - salvar = RPC atômico (nunca DELETE + INSERT separados; o INSERT antigo descartava agendamento);
 *  - as duas telas usam os MESMOS controles de duração/agendamento;
 *  - editar mídia não grava a coluna inexistente `media.duration` (PGRST204 recusava toda edição).
 */
describe('Lista de Reprodução da tela (ScreenDetails)', () => {
  const src = read('src/pages/dashboard/ScreenDetails.tsx');

  it('salva pelo caminho atômico', () => {
    expect(src).toContain('savePlaylistItems(supabase, screen.playlist_id, playlistItems)');
  });
  it("não apaga/insere playlist_items em chamadas separadas", () => {
    expect(src).not.toMatch(/from\('playlist_items'\)\s*\.delete\(\)/);
    expect(src).not.toMatch(/from\('playlist_items'\)\s*\.insert\(/);
  });
  it('cada linha tem duração, agendamento e lixeira', () => {
    expect(src).toContain('<ItemDurationInput');
    expect(src).toContain('<ItemScheduleButton');
    expect(src).toContain('aria-label="Remover da playlist"');
  });
  it('a lixeira fica visível sem depender de hover (celular)', () => {
    const i = src.indexOf('aria-label="Remover da playlist"');
    const around = src.slice(i, i + 300);
    expect(around).not.toContain('opacity-0');
  });
  it('edições não salvas não são sobrescritas pelo recarregamento da tela', () => {
    expect(src).toContain('if (hasUnsavedChangesRef.current) return;');
  });
});

describe('Editor da playlist (PlaylistItemsDialog)', () => {
  const src = read('src/components/playlists/PlaylistItemsDialog.tsx');

  it('salva pelo caminho atômico com agendamento', () => {
    expect(src).toContain('savePlaylistItems(supabase, playlist.id, items)');
    expect(src).not.toMatch(/from\('playlist_items'\)\s*\.delete\(\)/);
    expect(src).not.toMatch(/from\('playlist_items'\)\s*\.insert\(/);
  });
  it('usa os mesmos controles da tela', () => {
    expect(src).toContain('<ItemDurationInput');
    expect(src).toContain('<ItemScheduleButton');
  });
  it('duração de widget deixou de ficar travada', () => {
    expect(src).not.toContain('disabled={!!item.widget_id}');
  });
});

describe('Editar mídia (MediaUploadDialog)', () => {
  const src = read('src/components/media/MediaUploadDialog.tsx');

  it('não grava duration na tabela media (a coluna não existe)', () => {
    const i = src.indexOf('const updateData: Record<string, any> = {');
    expect(i).toBeGreaterThan(-1);
    const block = src.slice(i, src.indexOf('};', i));
    expect(block).not.toMatch(/\bduration\s*:/);
  });
  it('só propaga duração para as playlists se o usuário alterou o campo', () => {
    expect(src).toContain('if (durationTouched)');
  });
});
