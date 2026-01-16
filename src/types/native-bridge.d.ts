export interface NativePlayerBridge {
    getDeviceId(): string;
    log(message: string): void;
    getPlayerConfig(): string;
    showToast(message: string): void;
}

declare global {
    interface Window {
        NativePlayer?: NativePlayerBridge;
    }
}
