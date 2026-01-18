
import React, { useRef, useEffect, useState } from 'react';
import { useOfflineMedia } from '@/hooks/useOfflineMedia';

interface UniversalMediaRendererProps {
    src: string;
    type: 'video' | 'image';
    mimeType?: string;
    isActive: boolean;
    onEnded: () => void;
    onError: (e: any) => void;
    style: React.CSSProperties;
    videoRef?: React.RefObject<HTMLVideoElement>;
}

export const UniversalMediaRenderer: React.FC<UniversalMediaRendererProps> = ({
    src,
    type,
    mimeType,
    isActive,
    onEnded,
    onError,
    style,
    videoRef
}) => {
    // 1. Resolve Media (Cache first, then Remote)
    const { src: offlineSrc, status, error } = useOfflineMedia(src, mimeType);

    // 2. Local State for "Ready to Show"
    // We only show the element when it is actually ready/playing to avoid the "Giant Player" icon.
    const [isReady, setIsReady] = useState(false);
    const [hasCacheFailed, setHasCacheFailed] = useState(false);

    // 3. Fallback Video Ref if not provided (though DualMedia usually provides it)
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const resolvedVideoRef = videoRef || localVideoRef;

    // 4. Error Propagation & Recovery
    useEffect(() => {
        if (status === 'error' && !hasCacheFailed) {
            console.warn('[UniversalRenderer] Media Resolution Failed, falling back to remote stream');
            setHasCacheFailed(true);
        }
    }, [status, error, hasCacheFailed, setHasCacheFailed]);

    // 5. VIDEO SPECIFIC LOGIC
    useEffect(() => {
        const activeSrc = hasCacheFailed ? src : offlineSrc;
        if (type !== 'video' || !isActive || !activeSrc || !resolvedVideoRef.current) return;

        const video = resolvedVideoRef.current;
        let playInterval: NodeJS.Timeout;
        let stallCheckInterval: NodeJS.Timeout;
        let lastTime = -1;
        let stallCount = 0;

        const attemptPlay = async () => {
            if (video.paused && !video.ended && video.readyState > 1) {
                video.muted = true; // Force mute to allow autoplay
                try {
                    await video.play();
                    // If successful, we DON'T clear interval immediately, we wait for onPlaying event
                    // to set isReady=true.
                } catch (e: any) {
                    console.warn('[UniversalRenderer] Autoplay blocked, retrying...', e.message);
                    if (e.name === 'NotAllowedError') {
                        video.muted = true;
                    }
                }
            }
        };

        // AGGRESSIVE AUTOPLAY ENFORCER
        playInterval = setInterval(attemptPlay, 500);

        // STALL DETECTOR
        stallCheckInterval = setInterval(() => {
            if (video.paused || video.ended) {
                stallCount = 0;
                return;
            }

            // Check if we are moving
            const isMoving = Math.abs(video.currentTime - lastTime) > 0.1;

            if (!isMoving) {
                stallCount++;

                // INTELLIGENT THRESHOLD
                // If readyState < 3 (HAVE_FUTURE_DATA), we are likely buffering. Give it way more time.
                // If readyState >= 3, we SHOULD be playing. If stuck here, the decoder died.
                const isBuffering = video.readyState < 3;
                const maxStalls = isBuffering ? 60 : 10; // 30s for buffering, 5s for frozen playback

                if (stallCount > maxStalls) {
                    console.warn(`[UniversalRenderer] Video Stalled (Buffering: ${isBuffering})`);
                    // If we haven't failed cache yet, try that first before killing playback
                    if (!hasCacheFailed && !src.includes('blob:')) {
                        console.warn('[UniversalRenderer] Stalled on cache -> Trying Remote Stream');
                        setHasCacheFailed(true);
                        stallCount = 0; // Reset
                    } else {
                        console.error('[UniversalRenderer] Stalled on Remote -> Skipping');
                        onError(new Error('Playback Stalled'));
                    }
                }
            } else {
                stallCount = 0;
                setIsReady(true);
            }
            lastTime = video.currentTime;
        }, 500);

        // 6. VISIBILITY FAILSAFE (CRITICAL FOR LEGACY)
        // If onPlaying doesn't fire (some codecs/WebView versions), force show after timeout
        const visibilityBackup = setTimeout(() => {
            if (video.readyState >= 2 && !isReady) {
                console.warn('[UniversalRenderer] Force-showing video (Metadata loaded, event missed)');
                setIsReady(true);
            }
        }, 2000); // 2s tolerance

        return () => {
            clearInterval(playInterval);
            clearInterval(stallCheckInterval);
            clearTimeout(visibilityBackup);
        };
    }, [type, isActive, offlineSrc, src, resolvedVideoRef, onError, isReady, hasCacheFailed, setHasCacheFailed]);

    // 6. RENDER
    const finalSrc = hasCacheFailed ? src : offlineSrc;
    if (!finalSrc) return null; // Still resolving URL

    const commonStyle: React.CSSProperties = {
        ...style,
        // Vital: Hide until ready to prevent "Giant Player" or "Broken Image" icon
        opacity: isReady || type === 'image' ? (style.opacity ?? 1) : 0,
        transition: 'opacity 0.5s ease-in-out'
    };

    if (type === 'video') {
        return (
            <video
                ref={resolvedVideoRef}
                src={finalSrc}
                style={commonStyle}
                muted
                playsInline
                preload="auto"
                onEnded={onEnded}
                onPlaying={() => setIsReady(true)}
                onLoadedData={() => {
                    // Attempt immediate play on load
                    if (isActive) resolvedVideoRef.current?.play().catch(() => { });
                }}
                onError={(e) => {
                    console.error('[UniversalRenderer] Native Media Error:', e.currentTarget.error);
                    if (!hasCacheFailed) {
                        console.warn('[UniversalRenderer] Cache file failed, switching to remote stream...');
                        setHasCacheFailed(true);
                    } else {
                        console.error('[UniversalRenderer] Remote stream failed. Giving up.');

                        // NOTIFY DIAGNOSTIC OF CORRUPTION
                        const event = new CustomEvent('player-media-error', {
                            detail: {
                                message: 'CRITICAL: Media Unplayable',
                                url: src
                            }
                        });
                        window.dispatchEvent(event);

                        onError(e);
                    }
                }}
                className="w-full h-full object-cover"
            />
        );
    }

    return (
        <img
            src={offlineSrc}
            style={commonStyle}
            alt="media"
            onLoad={() => setIsReady(true)}
            onError={(e) => {
                console.error('[UniversalRenderer] Image Load Error');
                onError(e);
            }}
            className="w-full h-full object-cover"
        />
    );
};
