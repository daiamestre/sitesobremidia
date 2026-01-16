import { useMemo } from 'react';

export const useNativePlayer = () => {
    const isNative = typeof window !== 'undefined' && !!window.NativePlayer;

    const bridge = useMemo(() => {
        if (isNative && window.NativePlayer) {
            return window.NativePlayer;
        }

        // Mock for Browser Development
        return {
            getDeviceId: () => {
                console.log('[NativeMock] getDeviceId called');
                return 'browser-dev-id-123';
            },
            log: (message: string) => {
                console.log(`[NativeMock] LOG: ${message}`);
            },
            getPlayerConfig: () => {
                console.log('[NativeMock] getPlayerConfig called');
                return JSON.stringify({ kioskMode: false, version: '0.0.0-web' });
            },
            showToast: (message: string) => {
                console.log(`[NativeMock] TOAST: ${message}`);
                alert(`[Native Toast]: ${message}`);
            }
        };
    }, [isNative]);

    return {
        isNative,
        getDeviceId: bridge.getDeviceId,
        log: bridge.log,
        getPlayerConfig: bridge.getPlayerConfig,
        showToast: bridge.showToast,
    };
};
