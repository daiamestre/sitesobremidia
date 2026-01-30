
export const useNativePlayer = () => {
    const isNative = typeof window !== 'undefined' && !!(window as any).Android;

    const getDeviceId = (): string => {
        if (isNative && (window as any).Android?.getDeviceId) {
            try {
                return (window as any).Android.getDeviceId();
            } catch (e) {
                console.error("Error accessing Android ID", e);
                return "error-device-id";
            }
        }
        return 'browser-device-id';
    };

    const getPlayerConfig = (): string => {
        if (isNative && (window as any).Android?.getPlayerConfig) {
            try {
                return (window as any).Android.getPlayerConfig();
            } catch (e) {
                console.error("Error accessing Android Config", e);
                return "{}";
            }
        }
        return JSON.stringify({ version: 'Web Player', kioskMode: false });
    };

    const showToast = (msg: string) => {
        if (isNative && (window as any).Android?.showToast) {
            try {
                (window as any).Android.showToast(msg);
            } catch (e) {
                console.error("Error showing toast", e);
            }
        } else {
            console.log('Toast:', msg);
        }
    };

    return { isNative, getDeviceId, getPlayerConfig, showToast };
};
