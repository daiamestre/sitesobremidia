
import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Loader2, AlertCircle, RefreshCw, Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface VideoPlayerProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
    src: string;
    poster?: string;
    className?: string;
    autoPlay?: boolean;
    muted?: boolean;
    loop?: boolean;
    controls?: boolean;
    onPlay?: () => void;
    onPause?: () => void;
    onEnded?: () => void;
    showCustomControls?: boolean;
}

export interface VideoPlayerRef {
    play: () => Promise<void>;
    pause: () => void;
    togglePlay: () => void;
    toggleMute: () => void;
    video: HTMLVideoElement | null;
}

export const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(({
    src,
    poster,
    className,
    autoPlay = false,
    muted = false,
    loop = false,
    controls = false,
    onPlay,
    onPause,
    onEnded,
    showCustomControls = false,
    ...props
}, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [currentSrc, setCurrentSrc] = useState<string>(src);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(muted);

    // Expose methods to parent
    useImperativeHandle(ref, () => ({
        play: async () => {
            if (videoRef.current) {
                try {
                    await videoRef.current.play();
                } catch (err) {
                    console.error('[VideoPlayer] Play failed:', err);
                }
            }
        },
        pause: () => {
            if (videoRef.current) videoRef.current.pause();
        },
        togglePlay: () => togglePlay(),
        toggleMute: () => toggleMute(),
        video: videoRef.current
    }));

    // Update src if prop changes
    useEffect(() => {
        setCurrentSrc(src);
        setHasError(false);
        setIsLoading(true);
        setRetryCount(0);
    }, [src]);

    // Sync muted state
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.muted = isMuted;
        }
    }, [isMuted]);

    // Handle autoPlay safely
    useEffect(() => {
        if (autoPlay && videoRef.current && !hasError) {
            const playPromise = videoRef.current.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    // Auto-play was prevented
                    console.log('[VideoPlayer] Autoplay prevented:', error);
                    setIsPlaying(false);
                    // If we want to strictly auto-play, we might need to mute first
                    if (!videoRef.current?.muted) {
                        setIsMuted(true);
                        videoRef.current?.play().catch(e => console.error("Retry autoplay muted failed", e));
                    }
                });
            }
        }
    }, [currentSrc, autoPlay, hasError]);


    const handleError = async (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
        const target = e.target as HTMLVideoElement;
        const error = target.error;

        console.error('[VideoPlayer] Error:', error?.code, error?.message, 'Src:', currentSrc);

        // Initial load might throw error if src is empty or invalid immediately
        if (!currentSrc) return;

        // Retry Logic
        if (retryCount < 3) {
            console.log(`[VideoPlayer] Retrying... (${retryCount + 1}/3)`);
            setIsLoading(true);

            // Strategy 1: Append query param to bypass cache
            if (retryCount === 0) {
                setRetryCount(prev => prev + 1);
                setTimeout(() => {
                    // Force reload with same URL if it was a transient network error
                    if (videoRef.current) {
                        videoRef.current.load();
                    }
                }, 1000);
                return;
            }

            // Strategy 2: Try to sign the URL if it looks like a Supabase storage URL
            if (retryCount === 1 || retryCount === 2) {
                // Extract file path from URL
                // Example: https://.../storage/v1/object/public/media/user/file.mp4
                // We need: user/file.mp4
                try {
                    const urlObj = new URL(currentSrc);
                    const pathParts = urlObj.pathname.split('/media/');
                    if (pathParts.length > 1) {
                        const filePath = pathParts[1]; // verification needed?
                        // Note: This logic assumes a specific URL structure. 
                        // A safer way is if we passed the file_path prop directly, but let's try to infer for drop-in replacement.

                        // If the original src was already a signed URL, this might not work well, but let's assume it failed.
                        console.log('[VideoPlayer] Attempting to sign URL for path:', filePath);

                        const { data, error } = await supabase.storage
                            .from('media')
                            .createSignedUrl(decodeURIComponent(filePath), 60 * 60); // 1 hour

                        if (data?.signedUrl) {
                            console.log('[VideoPlayer] Generated signed URL');
                            setCurrentSrc(data.signedUrl);
                            setRetryCount(prev => prev + 1);
                            return;
                        } else {
                            console.warn('[VideoPlayer] Failed to sign URL:', error);
                        }
                    }
                } catch (err) {
                    console.warn('[VideoPlayer] URL parsing failed for signing:', err);
                }
            }

            setRetryCount(prev => prev + 1);
        } else {
            setHasError(true);
            setIsLoading(false);
            setErrorMsg("Não foi possível reproduzir este vídeo.");
        }
    };

    const handleLoadedData = () => {
        setIsLoading(false);
        setHasError(false);
    };

    const handleWaiting = () => {
        setIsLoading(true);
    };

    const handlePlaying = () => {
        setIsLoading(false);
        setIsPlaying(true);
        if (onPlay) onPlay();
    };

    const handlePause = () => {
        setIsPlaying(false);
        if (onPause) onPause();
    };

    const togglePlay = () => {
        if (videoRef.current) {
            if (isPlaying) {
                videoRef.current.pause();
            } else {
                videoRef.current.play();
            }
        }
    };

    const toggleMute = () => {
        setIsMuted(!isMuted);
    };

    const handleRetry = () => {
        setRetryCount(0);
        setHasError(false);
        setIsLoading(true);
        // Try fetching original src again
        setCurrentSrc(src);
        if (videoRef.current) videoRef.current.load();
    };

    return (
        <div className={cn("relative bg-black flex items-center justify-center overflow-hidden group", className)}>

            {/* Video Element */}
            {!hasError && (
                <video
                    ref={videoRef}
                    src={currentSrc}
                    poster={poster}
                    className="w-full h-full object-contain"
                    autoPlay={autoPlay}
                    muted={muted} // Initialize with prop, then controlled by state
                    loop={loop}
                    controls={controls && !showCustomControls} // Native controls if requested and no custom ones
                    playsInline
                    crossOrigin="anonymous" // Important for CORS
                    onError={handleError}
                    onLoadedData={handleLoadedData}
                    onWaiting={handleWaiting}
                    onPlaying={handlePlaying}
                    onPause={handlePause}
                    onEnded={onEnded}
                    {...props}
                />
            )}

            {/* Loading Spinner */}
            {isLoading && !hasError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none z-10">
                    <Loader2 className="h-8 w-8 text-white animate-spin" />
                </div>
            )}

            {/* Error State */}
            {hasError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white p-4 z-20 text-center">
                    <AlertCircle className="h-8 w-8 text-destructive mb-2" />
                    <p className="text-sm font-medium mb-4">{errorMsg || "Erro na reprodução"}</p>
                    <Button variant="outline" size="sm" onClick={handleRetry} className="gap-2">
                        <RefreshCw className="h-4 w-4" />
                        Tentar Novamente
                    </Button>
                </div>
            )}

            {/* Custom Controls Overlay (Optional) */}
            {showCustomControls && !hasError && (
                <div className={cn(
                    "absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300 z-20",
                    isPlaying ? "opacity-0 group-hover:opacity-100" : "opacity-100"
                )}>
                    <div className="flex items-center justify-center gap-6">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={togglePlay}
                            className="h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 text-white"
                        >
                            {isPlaying ? <Pause className="h-6 w-6 fill-current" /> : <Play className="h-6 w-6 fill-current ml-1" />}
                        </Button>

                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={toggleMute}
                            className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white"
                        >
                            {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
});

VideoPlayer.displayName = 'VideoPlayer';
