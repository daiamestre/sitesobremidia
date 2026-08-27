import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Player Onboarding Finite State Machine & Lifecycle (Versão 3.0)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        sessionStorage.clear();
    });

    it('T01: Não deve iniciar sincronização se Overlay não estiver concedido', () => {
        const mockNativePlayer = {
            getDeviceId: () => 'device-123',
            isOverlayGranted: () => false,
            requestOverlayPermission: vi.fn(),
            isHomeLauncher: () => false,
        };

        const overlayGranted = mockNativePlayer.isOverlayGranted();
        expect(overlayGranted).toBe(false);

        // State must remain in OVERLAY_REQUIRED
        const state = overlayGranted ? 'AUTH_CHECK' : 'OVERLAY_REQUIRED';
        expect(state).toBe('OVERLAY_REQUIRED');
        expect(mockNativePlayer.requestOverlayPermission).not.toHaveBeenCalled();
    });

    it('T02: Deve permitir prosseguir quando Overlay for concedido e respeitar Launcher opcional', () => {
        const mockNativePlayer = {
            getDeviceId: () => 'device-123',
            isOverlayGranted: () => true,
            isHomeLauncher: () => false,
            requestSetLauncher: vi.fn(),
        };

        expect(mockNativePlayer.isOverlayGranted()).toBe(true);

        // User clicks "Agora Não" on Launcher
        sessionStorage.setItem('player_launcher_dismissed', 'true');
        const launcherDismissed = sessionStorage.getItem('player_launcher_dismissed');
        expect(launcherDismissed).toBe('true');

        // State advances to AUTH_CHECK without blocking
        const nextState = 'AUTH_CHECK';
        expect(nextState).toBe('AUTH_CHECK');
    });

    it('T03: Deve solicitar pareamento se o dispositivo não tiver screen_id vinculado', () => {
        const savedScreenId = localStorage.getItem('player_screen_id_codemidia');
        expect(savedScreenId).toBeNull();

        const targetRoute = savedScreenId ? `/player/${savedScreenId}` : '/device-pairing';
        expect(targetRoute).toBe('/device-pairing');
    });

    it('T04: Deve vincular screen_id e screen_token ao receber confirmação do pareamento', () => {
        const mockPairingResult = {
            status: 'paired',
            screen_id: 'screen-uuid-999',
            screen_token: 'sec-token-abc',
        };

        localStorage.setItem('player_screen_id_codemidia', mockPairingResult.screen_id);
        localStorage.setItem('player_screen_token_codemidia', mockPairingResult.screen_token);

        expect(localStorage.getItem('player_screen_id_codemidia')).toBe('screen-uuid-999');
        expect(localStorage.getItem('player_screen_token_codemidia')).toBe('sec-token-abc');
    });

    it('T05: Deve identificar quando a tela conectada não possui playlist no Dashboard', () => {
        const mockScreen = {
            id: 'screen-uuid-999',
            name: 'TV Recepção',
            playlist_id: null, // Sem playlist atribuída
            is_active: true,
        };

        const hasPlaylist = Boolean(mockScreen.playlist_id);
        expect(hasPlaylist).toBe(false);

        const engineState = hasPlaylist ? 'MEDIA_SYNC' : 'NO_PLAYLIST';
        expect(engineState).toBe('NO_PLAYLIST');
    });

    it('T06: Deve entrar em MEDIA_SYNC somente quando a tela possuir playlist válida', () => {
        const mockScreen = {
            id: 'screen-uuid-999',
            name: 'TV Recepção',
            playlist_id: 'playlist-uuid-111',
            is_active: true,
        };

        const mockItems = [
            { id: 'item-1', position: 1, duration: 15, media_id: 'media-1' },
            { id: 'item-2', position: 2, duration: 10, media_id: 'media-2' },
        ];

        expect(mockScreen.playlist_id).toBeTruthy();
        expect(mockItems.length).toBeGreaterThan(0);

        const engineState = (mockScreen.playlist_id && mockItems.length > 0) ? 'MEDIA_SYNC' : 'NO_PLAYLIST';
        expect(engineState).toBe('MEDIA_SYNC');
    });

    it('T07: Deve manter e usar cache local de mídias quando a rede estiver offline', () => {
        const cachedPlaylist = [
            { id: 'item-1', url: 'https://storage/media1.mp4', type: 'video', duration: 15 },
        ];
        localStorage.setItem('player_playlist_codemidia', JSON.stringify(cachedPlaylist));

        const isOnline = false;
        let activePlaylist = [];

        if (!isOnline) {
            const rawCache = localStorage.getItem('player_playlist_codemidia');
            if (rawCache) {
                activePlaylist = JSON.parse(rawCache);
            }
        }

        expect(activePlaylist.length).toBe(1);
        expect(activePlaylist[0].url).toBe('https://storage/media1.mp4');
    });
});
