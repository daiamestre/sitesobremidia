
import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, Database, ShieldCheck, ShieldAlert } from 'lucide-react';
import { MediaCacheService } from '@/services/MediaCacheService';

export function OfflineIndicator() {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [cacheCount, setCacheCount] = useState(0);
    const [isProtected, setIsProtected] = useState(false);

    useEffect(() => {
        // 1. Monitor Network
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // 2. Monitor Cache (Poll every 5s)
        const checkCache = async () => {
            try {
                if ('caches' in window) {
                    const cache = await caches.open('player-media-cache-v1');
                    const keys = await cache.keys();
                    setCacheCount(keys.length);
                    setIsProtected(keys.length > 0);
                }
            } catch (e) {
                console.error(e);
            }
        };

        checkCache();
        const interval = setInterval(checkCache, 5000);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            clearInterval(interval);
        };
    }, []);

    return (
        <div className="absolute top-4 left-4 z-50 flex gap-2">
            {/* Network Status */}
            <div className={`px-3 py-1.5 rounded-full flex items-center gap-2 backdrop-blur-md border shadow-lg transition-colors duration-500 ${isOnline
                    ? 'bg-green-500/20 border-green-500/30 text-green-400'
                    : 'bg-red-500/20 border-red-500/30 text-red-500 animate-pulse'
                }`}>
                {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
                <span className="text-[10px] font-bold uppercase tracking-wider">
                    {isOnline ? 'Online' : 'Offline Mode'}
                </span>
            </div>

            {/* Shield/Cache Status */}
            <div className={`px-3 py-1.5 rounded-full flex items-center gap-2 backdrop-blur-md border shadow-lg transition-colors duration-500 ${isProtected
                    ? 'bg-blue-500/20 border-blue-500/30 text-blue-400'
                    : 'bg-yellow-500/20 border-yellow-500/30 text-yellow-500'
                }`}>
                {isProtected ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
                <span className="text-[10px] font-bold uppercase tracking-wider">
                    Blindagem: {cacheCount} Items
                </span>
            </div>
        </div>
    );
}
