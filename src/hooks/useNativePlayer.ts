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
            },
            getDeviceStatus: () => {
                console.log('[NativeMock] getDeviceStatus called');
                return JSON.stringify({
                    deviceId: 'mock-device-id',
                    overlayGranted: true,
                    isOnline: true,
                    manufacturer: 'MockBrand',
                    model: 'MockModel',
                    sdk: 33,
                    widthPixels: window.innerWidth,
                    heightPixels: window.innerHeight,
                    density: window.devicePixelRatio,
                    orientation: window.innerHeight > window.innerWidth ? 'portrait' : 'landscape'
                });
            }
        };
    }, [isNative]);

    return {
        isNative,
        getDeviceId: bridge.getDeviceId,
        log: bridge.log,
        getPlayerConfig: bridge.getPlayerConfig,
        showToast: bridge.showToast,
        getDeviceStatus: bridge.getDeviceStatus,
    };
};
