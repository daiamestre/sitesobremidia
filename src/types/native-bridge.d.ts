export interface NativePlayerBridge {
    getDeviceId(): string;
    log(message: string): void;
    getPlayerConfig(): string;
    showToast(message: string): void;
    getDeviceStatus?(): string;
    isOverlayGranted?(): boolean;
    requestOverlayPermission?(): void;
    isHomeLauncher?(): boolean;
    requestSetLauncher?(): void;
    // New methods
    clearAppCache?(): void;
    captureScreenshot?(callbackName: string): void;
    reboot?(): void;
    reload?(): void;
}

declare global {
    interface Window {
        NativePlayer?: NativePlayerBridge;
    }
}
