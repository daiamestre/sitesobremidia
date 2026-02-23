export interface NativePlayerBridge {
    getDeviceId(): string;
    log(message: string): void;
    getPlayerConfig(): string;
    showToast(message: string): void;
    // New methods
    captureScreenshot?(callbackName: string): void;
    reboot?(): void;
    reload?(): void;
}

declare global {
    interface Window {
        NativePlayer?: NativePlayerBridge;
    }
}
