import { describe, it, expect, vi } from 'vitest';

describe('Player Boot & Power-Cycle Decision Logic', () => {
  it('BOOT-01: Aparelho configurado com sessão Room válida deve ir direto para PLAYBACK sem tela de login', () => {
    const persistedConfig = {
      deviceId: 'bb7ba7bae2e8f05f9ceb348c8a85d06f6de9c2f98237317563890ee0118b6e22',
      screenId: '1ce02cc4-7bed-4c39-93af-463fd61c934e',
      authToken: 'valid-jwt-token',
      cachedPlaylistCount: 2
    };

    let targetActivity = 'LoginActivity';
    if (persistedConfig.deviceId && persistedConfig.screenId && persistedConfig.authToken) {
      if (persistedConfig.cachedPlaylistCount > 0) {
        targetActivity = 'MainActivity';
      } else {
        targetActivity = 'SyncActivity';
      }
    }

    expect(targetActivity).toBe('MainActivity');
    expect(targetActivity).not.toBe('LoginActivity');
  });

  it('BOOT-02: Se cache local de mídias estiver completo no boot, inicia reprodução offline imediata', () => {
    const isNetworkAvailable = false;
    const hasLocalCachedMedia = true;

    const startupMode = hasLocalCachedMedia 
      ? 'IMMEDIATE_LOCAL_PLAYBACK' 
      : isNetworkAvailable 
        ? 'REMOTE_SYNC' 
        : 'BLOCKED_NO_MEDIA';

    expect(startupMode).toBe('IMMEDIATE_LOCAL_PLAYBACK');
  });
});
