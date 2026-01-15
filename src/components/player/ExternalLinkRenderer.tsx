import { useEffect, useState } from 'react';
import { ExternalLink, Instagram, Facebook, Linkedin, Twitter, Globe, Smartphone, QrCode as QrIcon, Grid3X3, Image as ImageIcon, Video } from 'lucide-react';

interface ExternalLinkRendererProps {
    url: string;
    platform?: string;
    className?: string;
    embedCode?: string | null;
}

interface IgPost {
    src: string;
    type: 'image' | 'video';
}

/**
 * MANUAL OVERRIDE INSTAGRAM WIDGET
 * 
 * Strategy:
 * 1. CHECK MANUAL DATA: If user uploaded files (via embedCode JSON), USE THEM.
 * 2. FALLBACK 1: Unavatar + QR Code (The "Professional Signage" Card).
 */
export function ExternalLinkRenderer({ url, platform, className = '', embedCode }: ExternalLinkRendererProps) {
    const [imageError, setImageError] = useState(false);
    const [manualData, setManualData] = useState<{ manual_profile?: string, manual_posts?: IgPost[] } | null>(null);

    // 1. SAFE PARSING & MANUAL DATA EXTRACTION
    const hostname = (() => { try { return new URL(url).hostname.replace('www.', ''); } catch { return url; } })();
    const cleanPlatform = (platform || hostname || '').toLowerCase();

    // Platform Detection
    const isInstagram = cleanPlatform.includes('instagram');
    const isFacebook = cleanPlatform.includes('facebook');
    const isLinkedin = cleanPlatform.includes('linkedin');
    const isTwitter = cleanPlatform.includes('twitter') || cleanPlatform.includes('x.com');

    // Username Extraction (Heuristic)
    let username = '@perfil';
    let displayName = platform || 'Link Externo';
    let apiUsername = '';

    if (isInstagram) {
        const parts = url.split('/').filter(p => !!p && p !== 'https:' && p !== 'http:');
        const idx = parts.findIndex(p => p.includes('instagram.com'));
        if (idx !== -1 && parts[idx + 1]) {
            apiUsername = parts[idx + 1].split('?')[0];
            username = `@${apiUsername}`;
            displayName = apiUsername;
        }
    }

    // 2. LOAD MANUAL DATA
    useEffect(() => {
        if (embedCode && embedCode.trim().startsWith('{')) {
            try {
                const data = JSON.parse(embedCode);
                if (data.manual_profile || data.manual_posts) {
                    setManualData(data);
                    return;
                }
            } catch (e) {
                console.warn('Invalid JSON in embedCode', e);
            }
        }
        setManualData(null);
    }, [embedCode]);

    // Brand Configuration
    const brand = {
        bg: isInstagram ? 'bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500' :
            isFacebook ? 'bg-blue-600' :
                isLinkedin ? 'bg-[#0077b5]' :
                    isTwitter ? 'bg-black' :
                        'bg-zinc-900',
        icon: isInstagram ? <Instagram className="w-4 h-4" /> :
            isFacebook ? <Facebook className="w-4 h-4" /> :
                isLinkedin ? <Linkedin className="w-4 h-4" /> :
                    isTwitter ? <Twitter className="w-4 h-4" /> :
                        <Globe className="w-4 h-4" />,
        label: isInstagram ? 'Instagram' :
            isFacebook ? 'Facebook' :
                isLinkedin ? 'LinkedIn' :
                    'Website'
    };

    // Ensure URL has protocol for reliable QR scanning
    const ensureProtocol = (link: string) => {
        if (!link) return '';
        if (link.startsWith('http://') || link.startsWith('https://')) return link;
        return `https://${link}`;
    };

    // QR Code
    const safeUrl = ensureProtocol(url);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(safeUrl)}&bgcolor=ffffff&color=000000&margin=10&qzone=2`;

    // Profile Image Source strategy
    // 1. Manual Upload
    // 2. Unavatar (Auto)
    const avatarUrl = manualData?.manual_profile
        ? manualData.manual_profile
        : (isInstagram
            ? `https://unavatar.io/instagram/${username.replace('@', '')}?fallback=false`
            : `https://unavatar.io/${hostname}`);

    // Posts Source
    const posts = manualData?.manual_posts || [];
    const postCount = posts.length > 0 ? posts.length : '---';
    const hasPosts = posts.length > 0;

    // Orientation Detection
    const [isPortrait, setIsPortrait] = useState(false);

    useEffect(() => {
        const checkOrientation = () => {
            setIsPortrait(window.innerHeight > window.innerWidth);
        };
        checkOrientation();
        window.addEventListener('resize', checkOrientation);
        return () => window.removeEventListener('resize', checkOrientation);
    }, []);

    if (isPortrait) {
        // --- 9:16 PORTRAIT LAYOUT ---
        // STRICT MODE: Enforcing object-contain and strict aspect ratios
        return (
            <div className={`relative w-full h-full overflow-hidden bg-[#1a1a1a] flex items-center justify-center p-4 ${className}`}>
                {/* Background Blur */}
                <div className="absolute inset-0 z-0 opacity-50">
                    <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] blur-[120px] bg-gradient-to-b from-purple-900/40 via-black to-orange-900/40`} />
                </div>

                {/* PORTRAIT CARD CONTAINER - Strict 9:16 Ratio */}
                <div className="relative z-10 w-full h-full max-h-full aspect-[9/16] rounded-[2.5rem] p-[2px] bg-gradient-to-b from-purple-500 via-pink-500 to-orange-500 shadow-2xl overflow-hidden flex flex-col">
                    <div className="w-full h-full rounded-[2.4rem] flex flex-col overflow-hidden bg-black relative">

                        {/* Upper Section: Profile (62%) */}
                        <div className="h-[62%] w-full bg-gradient-to-b from-blue-950 via-indigo-900 to-purple-900 p-6 flex flex-col relative overflow-hidden">
                            {/* Header Brand */}
                            <div className="flex items-center justify-center relative z-10 mb-4">
                                <div className="inline-flex items-center gap-2 px-6 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md shadow-lg">
                                    {brand.icon}
                                    <span className="text-white font-bold text-sm tracking-wider uppercase">{brand.label}</span>
                                </div>
                            </div>

                            {/* Profile Info Centered */}
                            <div className="flex-1 flex flex-col items-center justify-center text-center relative z-10 w-full max-w-[95%] mx-auto">
                                <div className="relative w-40 h-40 mb-4 shrink-0">
                                    <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 p-[4px] shadow-2xl shadow-pink-500/40">
                                        <div className="w-full h-full rounded-full bg-black p-[3px] overflow-hidden">
                                            <img
                                                src={avatarUrl}
                                                className="w-full h-full rounded-full object-cover"
                                                alt="Avatar"
                                                onError={(e) => { if (!manualData?.manual_profile) e.currentTarget.style.display = 'none'; }}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <h1 className="text-5xl font-black text-white tracking-tight drop-shadow-xl mb-2 line-clamp-1 leading-tight px-2">
                                    {username}
                                </h1>
                                <p className="text-blue-200 text-lg font-medium mb-6 bg-black/20 px-4 py-1 rounded-full backdrop-blur-sm shadow-inner cursor-default">
                                    {displayName}
                                </p>

                                {/* Posts Preview Grid with Blur Effect */}
                                {hasPosts && (
                                    <div className="w-full grid grid-cols-3 gap-3">
                                        {posts.slice(0, 3).map((post, i) => (
                                            <div key={i} className="aspect-square bg-zinc-900 rounded-2xl overflow-hidden border border-white/10 relative shadow-lg group">
                                                {/* Blurred Background Layer (Prevents black bars) */}
                                                <div className="absolute inset-0 opacity-40 blur-lg scale-125">
                                                    {post.type === 'video' ? (
                                                        <video src={post.src} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <img src={post.src} className="w-full h-full object-cover" alt="" />
                                                    )}
                                                </div>

                                                {/* Foreground Content (Contained) */}
                                                {post.type === 'video' ? (
                                                    <video
                                                        key={post.src}
                                                        src={post.src}
                                                        className="relative z-10 w-full h-full object-contain"
                                                        autoPlay
                                                        muted
                                                        loop
                                                        playsInline
                                                        controls={false}
                                                        onError={(e) => console.warn('Video playback error:', post.src, e)}
                                                    />
                                                ) : (
                                                    <img src={post.src} className="relative z-10 w-full h-full object-contain" alt="Post" />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Lower Section: Action & QR (38%) */}
                        <div className="h-[38%] bg-white w-full flex flex-col items-center justify-evenly p-6 relative">
                            {/* Top Curve */}
                            <div className="absolute top-0 w-full h-10 -mt-5 bg-white rounded-t-[2.5rem] shadow-[0_-5px_20px_rgba(0,0,0,0.1)]" />

                            <div className="text-center relative z-10 pt-2">
                                <h3 className="text-3xl font-black text-zinc-900 uppercase tracking-tighter mb-1">Escaneie</h3>
                                <p className="text-zinc-500 text-base font-medium">Acesse o perfil completo</p>
                            </div>

                            {/* QR Code Container - FIXED with object-contain */}
                            <div className="relative p-2 bg-white rounded-3xl shadow-xl border border-zinc-100 shrink-0 transform hover:scale-105 transition-transform duration-500">
                                <div className="w-40 h-40 relative rounded-2xl overflow-hidden bg-white flex items-center justify-center">
                                    {/* QR Code with Object Contain to prevent stretching */}
                                    <img
                                        src={qrUrl}
                                        className="w-full h-full object-contain"
                                        alt="QR Code"
                                    />
                                </div>
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-md border border-zinc-50">
                                    <Instagram className="w-5 h-5 text-[#E1306C]" />
                                </div>
                            </div>

                            <div className="w-full mt-2 max-w-xs">
                                <div className="w-full py-4 rounded-xl bg-gradient-to-r from-purple-600 to-orange-500 shadow-lg shadow-purple-500/20 text-center">
                                    <span className="text-white font-extrabold text-lg tracking-wide flex items-center justify-center gap-2">
                                        <Instagram className="w-5 h-5" /> Seguir
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // --- LANDSCAPE LAYOUT (Existing 1.8/1) ---
    return (
        <div className={`relative w-full h-full overflow-hidden bg-[#1a1a1a] flex items-center justify-center p-8 ${className}`}>

            {/* Background Blur Effect */}
            <div className="absolute inset-0 z-0 opacity-50">
                <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] blur-[120px] bg-gradient-to-br from-purple-900/40 via-black to-orange-900/40`} />
            </div>

            {/* CARD CONTAINER with Gradient Border */}
            <div className="relative z-10 w-full max-w-6xl aspect-[1.8/1] rounded-[3rem] p-[2px] bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 shadow-2xl overflow-hidden">

                <div className="w-full h-full rounded-[2.9rem] flex overflow-hidden bg-black">

                    {/* LEFT SIDE (Profile & Content) - 65% */}
                    {/* Updated Background: Blue to Purple Gradient */}
                    <div className="w-[65%] h-full bg-gradient-to-br from-blue-950 via-indigo-900 to-purple-900 p-12 flex flex-col relative overflow-hidden">

                        {/* Decorative Background Blob - Adjusted for new theme */}
                        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                            <div className="absolute -top-20 -left-20 w-96 h-96 bg-blue-500/20 rounded-full blur-[80px]" />
                            <div className="absolute bottom-0 right-0 w-80 h-80 bg-purple-500/20 rounded-full blur-[80px]" />
                        </div>

                        {/* Top Row: Pill & Avatar */}
                        <div className="flex items-start justify-between relative z-10">
                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md">
                                {brand.icon}
                                <span className="text-white font-bold text-xs tracking-wider uppercase">{brand.label}</span>
                            </div>

                            {/* Avatar (Smaller & Top Right aligned for better flow if posts exist, or keep standard) 
                                Let's keep the standard big avatar layout but refine it.
                            */}
                        </div>

                        {/* Main Content Area */}
                        <div className="flex-1 flex flex-col justify-center mt-4 relative z-10">

                            <div className="flex items-center gap-6 mb-8">
                                {/* Avatar */}
                                <div className="relative w-28 h-28 shrink-0">
                                    <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 p-[3px] shadow-lg shadow-pink-500/20">
                                        <div className="w-full h-full rounded-full bg-black p-[3px]">
                                            <img
                                                src={avatarUrl}
                                                className="w-full h-full rounded-full object-cover"
                                                alt="Avatar"
                                                onError={(e) => {
                                                    if (!manualData?.manual_profile) e.currentTarget.style.display = 'none';
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <div className="absolute bottom-1 right-1 w-7 h-7 bg-blue-500 rounded-full flex items-center justify-center border-4 border-black text-white">
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12"></polyline>
                                        </svg>
                                    </div>
                                </div>

                                {/* Text Info */}
                                <div className="flex flex-col justify-center overflow-hidden">
                                    <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight truncate drop-shadow-lg">
                                        {username}
                                    </h1>
                                    <p className="text-blue-200 text-lg font-medium">
                                        {displayName}
                                    </p>
                                </div>
                            </div>

                            {/* Video/Image Grid - Clean and Professional */}
                            {hasPosts ? (
                                <div className="w-full">
                                    <div className="flex items-center justify-between mb-3 px-1">
                                        <p className="text-xs font-bold text-blue-200 uppercase tracking-widest flex items-center gap-2">
                                            <Grid3X3 className="w-3 h-3" /> Últimas Publicações
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4 h-48">
                                        {posts.slice(0, 3).map((post, i) => (
                                            <div key={i} className="group relative h-full w-full bg-black/40 rounded-2xl overflow-hidden border border-white/10 shadow-xl transition-all duration-500">
                                                {/* Media */}
                                                {post.type === 'video' ? (
                                                    <video
                                                        src={post.src}
                                                        className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                                                        autoPlay
                                                        muted
                                                        loop
                                                        playsInline
                                                        onLoadedData={(e) => e.currentTarget.play()}
                                                    />
                                                ) : (
                                                    <img
                                                        src={post.src}
                                                        className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                                                        alt="Post"
                                                    />
                                                )}

                                                {/* Overlay Gradient */}
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60" />

                                                {/* Icon */}
                                                <div className="absolute top-2 right-2 text-white/90 drop-shadow-md">
                                                    {post.type === 'video' ? <Video className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                /* Stats Fallback if no posts */
                                <div className="grid grid-cols-3 gap-8 mt-4 border-t border-white/5 pt-8">
                                    <div>
                                        <p className="text-3xl font-bold text-white mb-1">{postCount}</p>
                                        <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Posts</p>
                                    </div>
                                    <div>
                                        <p className="text-3xl font-bold text-white mb-1">---</p>
                                        <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Seguidores</p>
                                    </div>
                                    <div>
                                        <p className="text-3xl font-bold text-white mb-1">---</p>
                                        <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Seguindo</p>
                                    </div>
                                </div>
                            )}

                        </div>

                        {/* CTA Button */}
                        <div className="mt-8">
                            <div className="w-full py-4 rounded-2xl bg-gradient-to-r from-purple-600 to-orange-500 shadow-lg shadow-purple-900/20 flex items-center justify-center gap-3 hover:scale-[1.02] transition-transform duration-300">
                                <Instagram className="w-5 h-5 text-white" />
                                <span className="text-white font-bold text-lg tracking-wide">Seguir no Instagram</span>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT SIDE (QR Code) - 35% */}
                    <div className="w-[35%] h-full bg-white flex flex-col items-center justify-center p-12 relative">

                        <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500" />

                        {/* QR Container */}
                        <div className="relative mb-6 group">
                            <div className="absolute -inset-1 bg-gradient-to-tr from-purple-500 to-orange-500 rounded-[2.5rem] blur opacity-25 group-hover:opacity-50 transition-opacity duration-1000" />
                            <div className="relative p-6 bg-white rounded-[2rem] shadow-2xl border border-zinc-100">
                                <img src={qrUrl} className="w-48 h-48 mix-blend-multiply object-contain" alt="QR Code" />
                                {/* Center Logo overlay for professional look */}
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-md">
                                    <Instagram className="w-6 h-6 text-[#E1306C]" />
                                </div>
                            </div>
                        </div>

                        <div className="text-center space-y-2">
                            <h3 className="text-2xl font-black text-zinc-900 uppercase tracking-tight">Escaneie</h3>
                            <p className="text-zinc-500 text-sm font-medium loading-relaxed max-w-[200px] mx-auto">
                                Aponte a câmera do seu celular para abrir o perfil.
                            </p>
                        </div>

                        {/* Footer decorative */}
                        <div className="absolute bottom-8 text-zinc-300 flex flex-col items-center gap-1">
                            <QrIcon className="w-4 h-4 opacity-50" />
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
