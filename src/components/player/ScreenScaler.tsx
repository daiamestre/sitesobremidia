import React, { useEffect, useState } from "react";
import { useNativePlayer } from "@/hooks/useNativePlayer";

interface ScreenScalerProps {
    children: React.ReactNode;
    mode?: "STRETCH" | "CONTAIN" | "COVER";
    targetOrientation?: "portrait" | "landscape";
}

interface NativeMetrics {
    widthPixels: number;
    heightPixels: number;
    orientation: "portrait" | "landscape";
    density: number;
}

export const ScreenScaler: React.FC<ScreenScalerProps> = ({
    children,
    mode = "STRETCH",
    targetOrientation,
}) => {
    const { getDeviceStatus, isNative } = useNativePlayer();
    const [metrics, setMetrics] = useState<NativeMetrics | null>(null);

    useEffect(() => {
        if (isNative) {
            try {
                const status = JSON.parse(getDeviceStatus());
                if (status.widthPixels && status.heightPixels) {
                    setMetrics({
                        widthPixels: status.widthPixels,
                        heightPixels: status.heightPixels,
                        orientation: status.orientation,
                        density: status.density,
                    });
                }
            } catch (e) {
                console.error("Failed to parse native metrics", e);
                // FAIL-SAFE: If bridge fails, fall back to window dimensions
                setMetrics({
                    widthPixels: window.innerWidth,
                    heightPixels: window.innerHeight,
                    orientation: window.innerHeight > window.innerWidth ? "portrait" : "landscape",
                    density: window.devicePixelRatio || 1,
                });
            }
        } else {
            // Fallback for browser dev
            setMetrics({
                widthPixels: window.innerWidth,
                heightPixels: window.innerHeight,
                orientation: window.innerHeight > window.innerWidth ? "portrait" : "landscape",
                density: window.devicePixelRatio,
            });
        }

        const handleResize = () => {
            if (!isNative) {
                setMetrics({
                    widthPixels: window.innerWidth,
                    heightPixels: window.innerHeight,
                    orientation: window.innerHeight > window.innerWidth ? "portrait" : "landscape",
                    density: window.devicePixelRatio,
                });
            }
        }

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);

    }, [getDeviceStatus, isNative]);

    if (!metrics) return <div className="w-full h-full bg-black" />;

    // LOGIC: Calculate Scale & Rotation
    const needsRotation = targetOrientation && metrics.orientation !== targetOrientation;

    // If rotating, we swap dimensions for calculation
    const containerWidth = needsRotation ? metrics.heightPixels : metrics.widthPixels;
    const containerHeight = needsRotation ? metrics.widthPixels : metrics.heightPixels;

    const style: React.CSSProperties = {
        width: `${containerWidth}px`,
        height: `${containerHeight}px`,
        position: 'absolute',
        top: '50%',
        left: '50%',
        transformOrigin: 'center center',
        transform: `translate(-50%, -50%) ${needsRotation ? 'rotate(-90deg)' : 'rotate(0deg)'}`,
        overflow: 'hidden',
        backgroundColor: '#000',
    };

    return (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: '#000', overflow: 'hidden' }}>
            <div style={style}>
                <div className="w-full h-full relative">
                    {children}
                </div>
            </div>

            {/* Debug Overlay (Optional - can be hidden via prop) */}
            {process.env.NODE_ENV === 'development' && (
                <div className="fixed top-0 left-0 bg-red-500/80 text-white text-[10px] p-1 z-50 font-mono">
                    Native: {metrics.widthPixels}x{metrics.heightPixels} ({metrics.orientation}) <br />
                    Target: {targetOrientation || 'Auto'} <br />
                    Rotated: {needsRotation ? 'YES' : 'NO'}
                </div>
            )}
        </div>
    );
};
