import { useState, useRef, useEffect } from 'react';
import { Image, Video, File, Music } from 'lucide-react';
import { Media } from '@/types/models';
import { cn } from '@/lib/utils';

interface MediaThumbnailProps {
    media: Media | { file_url: string; file_type?: string; thumbnail_url?: string; name?: string };
    className?: string;
    showIcon?: boolean; // Overlay icon based on type
}

export function MediaThumbnail({ media, className, showIcon = true }: MediaThumbnailProps) {
    const [error, setError] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);

    const fileType = media.file_type?.toLowerCase() || 'unknown';
    const isVideo = fileType === 'video' || fileType.includes('video');
    const isImage = fileType === 'image' || fileType.includes('image');
    const isAudio = fileType === 'audio' || fileType.includes('audio');

    // Attempt to seek to a meaningful frame to avoid black starting frames
    const handleMetadataLoaded = () => {
        if (videoRef.current) {
            // If duration is extremely short, don't seek too far. 
            // Seek to 1.5s to avoid fade-ins.
            const seekTime = (videoRef.current.duration > 2) ? 1.5 : 0.0;
            videoRef.current.currentTime = seekTime;
            setLoaded(true);
        }
    };

    if (error) {
        return (
            <div className={cn("w-full h-full bg-muted flex items-center justify-center", className)}>
                {isVideo ? <Video className="h-1/3 w-1/3 text-muted-foreground/50" /> :
                    isImage ? <Image className="h-1/3 w-1/3 text-muted-foreground/50" /> :
                        isAudio ? <Music className="h-1/3 w-1/3 text-muted-foreground/50" /> :
                            <File className="h-1/3 w-1/3 text-muted-foreground/50" />}
            </div>
        );
    }

    // Add timestamp explicitly to src to force browser to load from that frame (Media Fragments URI)
    const videoSrc = isVideo ? `${media.file_url}#t=1.0` : media.file_url;

    return (
        <div className={cn("relative w-full h-full overflow-hidden bg-black/5", className)}>
            {isImage ? (
                <img
                    src={media.file_url}
                    alt={media.name || 'Media'}
                    className="w-full h-full object-cover transition-opacity duration-300"
                    onError={() => setError(true)}
                    loading="lazy"
                />
            ) : isVideo ? (
                <>
                    <video
                        ref={videoRef}
                        src={videoSrc}
                        className="w-full h-full object-cover"
                        preload="metadata"
                        muted
                        playsInline
                        crossOrigin="anonymous"
                        onLoadedMetadata={handleMetadataLoaded}
                        onError={() => setError(true)}
                    />
                    {/* Fallback overlay if video takes time to load metadata */}
                    {!loaded && (
                        <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
                            <Video className="h-8 w-8 text-white/50 animate-pulse" />
                        </div>
                    )}
                </>
            ) : (
                <div className="w-full h-full bg-muted flex items-center justify-center">
                    {isAudio ? <Music className="h-8 w-8 text-muted-foreground" /> : <File className="h-8 w-8 text-muted-foreground" />}
                </div>
            )}

            {/* Type Icon Overlay */}
            {showIcon && !error && (
                <div className="absolute top-1 right-1 bg-black/40 rounded p-1 backdrop-blur-[1px]">
                    {isVideo && <Video className="h-3 w-3 text-white/90" />}
                    {isImage && <Image className="h-3 w-3 text-white/90" />}
                    {isAudio && <Music className="h-3 w-3 text-white/90" />}
                </div>
            )}
        </div>
    );
}
