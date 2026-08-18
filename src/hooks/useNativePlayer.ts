
// Bridge nativa do WebView Android exposta em window.Android
interface AndroidBridge {
    getDeviceId?: () => string;
    getPlayerConfig?: () => string;
    showToast?: (msg: string) => void;
}

const getAndroidBridge = (): AndroidBridge | undefined =>
    typeof window !== 'undefined' ? (window as unknown as { Android?: AndroidBridge }).Android : undefined;

export const useNativePlayer = () => {
    const isNative = typeof window !== 'undefined' && !!getAndroidBridge();

    const getDeviceId = (): string => {
        if (isNative && getAndroidBridge()?.getDeviceId) {
            try {
                return getAndroidBridge()!.getDeviceId();
            } catch (e) {
                console.error("Error accessing Android ID", e);
                return "error-device-id";
            }
        }
        return 'browser-device-id';
    };

    const getPlayerConfig = (): string => {
        if (isNative && getAndroidBridge()?.getPlayerConfig) {
            try {
                return getAndroidBridge()!.getPlayerConfig();
            } catch (e) {
                console.error("Error accessing Android Config", e);
                return "{}";
            }
        }
        return JSON.stringify({ version: 'Web Player', kioskMode: false });
    };

    const showToast = (msg: string) => {
        if (isNative && getAndroidBridge()?.showToast) {
            try {
                getAndroidBridge()!.showToast(msg);
            } catch (e) {
                console.error("Error showing toast", e);
            }
        } else {
            console.log('Toast:', msg);
        }
    };

    return { isNative, getDeviceId, getPlayerConfig, showToast };
};
