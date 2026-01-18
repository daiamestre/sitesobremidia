import React, { useRef, useEffect, useState } from 'react';
import { useOfflineMedia } from '@/hooks/useOfflineMedia';
import { useWatchdog } from '@/contexts/WatchdogContext';

interface DirectMediaRendererProps {
    src: string;
    type: 'video' | 'image';
    mimeType?: string;
    isActive: boolean;
    onEnded: () => void;
    onError: (e: any) => void;
    style: React.CSSProperties;
    videoRef?: React.RefObject<HTMLVideoElement>;
}

export const DirectMediaRenderer: React.FC<DirectMediaRendererProps> = ({
    src,
    type,
    mimeType,
    isActive,
    onEnded,
    onError,
    style,
    videoRef
}) => {
    // 0. Watchdog Integration
    const { reportHeartbeat } = useWatchdog();

    // 1. Resolve Media (Cache first, then Remote)
    const { src: resolvedSrc, status, error } = useOfflineMedia(src, mimeType);

    // 2. Failover State: If local cache fails, we switch to REMOTE
    const [useRemoteFallback, setUseRemoteFallback] = useState(false);

    // 3. Effective Source
    // If we decided to fallback, use raw 'src' (http...). Otherwise use resolvedSrc.
    const finalSrc = useRemoteFallback ? src : (resolvedSrc || src);

    // 4. Local State
    const [isReady, setIsReady] = useState(false);

    // Internal ref if none provided
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const actualVideoRef = videoRef || localVideoRef;

    // 5. BRUTE FORCE PLAYBACK ENGINE
    useEffect(() => {
        if (type !== 'video' || !isActive || !finalSrc || !actualVideoRef.current) return;

        const video = actualVideoRef.current;
        let stuckCount = 0;
        let lastTime = 0;

        // Force Attributes
        video.muted = true;
        video.autoplay = true;
        video.playsInline = true;

        const forcePlay = () => {
            if (video.paused) {
                video.play().catch(e => {
                    console.warn('[BruteForce] Play failed (will retry):', e);
                });
            }
        };

        // Initial Kick
        forcePlay();

        // THE "NUCLEAR" LOOP (500ms)
        const nuclearInterval = setInterval(() => {
            if (!isActive) return;

            // A. Check Paused
            if (video.paused) {
                console.warn('[BruteForce] ⚠️ Video is PAUSED. Kicking it...');
                forcePlay();
            }

            // B. Check Stall (Time not moving)
            if (video.readyState >= 2 && !video.paused) {
                const currentTime = video.currentTime;
                if (Math.abs(currentTime - lastTime) < 0.1) {
                    stuckCount++;
                    if (stuckCount > 4) { // 2 seconds stuck
                        console.warn('[BruteForce] ❄️ STALL DETECTED. Seeking...');
                        video.currentTime += 0.05; // Micro-seek
                        forcePlay();
                        stuckCount = 0;
                    }
                } else {
                    stuckCount = 0;
                    reportHeartbeat(); // IT'S ALIVE
                }
                lastTime = currentTime;
            }

        }, 500);

        return () => clearInterval(nuclearInterval);

    }, [type, isActive, finalSrc, actualVideoRef, reportHeartbeat]);


    // 6. Render
    if (!finalSrc) return null;

    const commonStyle: React.CSSProperties = {
        ...style,
        backgroundColor: 'black',
        objectFit: 'cover'
    };

    if (type === 'video') {
        return (
            <video
                ref={actualVideoRef}
                src={finalSrc}
                style={commonStyle}
                muted
                playsInline
                autoPlay
                loop
                preload="auto"
                onEnded={onEnded}
                onCanPlay={() => setIsReady(true)}
                onPlaying={() => setIsReady(true)}
                onTimeUpdate={() => setIsReady(true)}
                onError={(e) => {
                    const errMsg = e.currentTarget.error?.message || 'Unknown';
                    console.error(`[DirectRenderer] Error on ${finalSrc}: ${errMsg}`);

                    // FAILOVER LOGIC
                    if (!useRemoteFallback && resolvedSrc && resolvedSrc !== src) {
                        console.warn('[DirectRenderer] 🚨 Local Cache Failed. ACTIVATE REMOTE FALLBACK.');
                        setUseRemoteFallback(true);
                        // Do NOT propagate error yet. Give remote a chance.
                    } else {
                        // We are already on remote, or it was remote to begin with.
                        // Real Error.
                        onError(e);
                    }
                }}
                className="w-full h-full object-cover"
            />
        );
    }

    // Image Logic
    return (
        <img
            src={finalSrc}
            style={commonStyle}
            alt="media"
            onLoad={() => setIsReady(true)}
            onError={(e) => {
                // Image failover logic could go here too, but prioritized video
                if (!useRemoteFallback && resolvedSrc && resolvedSrc !== src) {
                    setUseRemoteFallback(true);
                } else {
                    onError(e);
                }
            }}
            className="w-full h-full object-cover"
        />
    );
};
