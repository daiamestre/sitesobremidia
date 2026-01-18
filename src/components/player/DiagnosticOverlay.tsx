
import React, { useState, useEffect } from 'react';

interface DiagnosticOverlayProps {
    screenId?: string;
    orientation?: string;
    onActivate?: () => void;
}

export function DiagnosticOverlay({ screenId, orientation, onActivate }: DiagnosticOverlayProps) {
    const [stats, setStats] = useState<any>(null);
    const [mediaErrors, setMediaErrors] = useState<any[]>([]);

    useEffect(() => {
        const updateStats = () => {
            // @ts-ignore
            const mem = window.performance?.memory;
            setStats({
                memUsing: mem ? Math.round(mem.usedJSHeapSize / 1024 / 1024) + 'MB' : 'N/A',
                online: navigator.onLine,
                res: `${window.innerWidth}x${window.innerHeight}`
            });
        };
        const interval = setInterval(updateStats, 2000);

        // Listen for global errors (dispatch from DualMediaLayer if needed)
        // We will dispatch a custom event from the player if we want to catch it here, 
        // or we can rely on standard window errors if they bubble.
        const errorListener = (e: any) => {
            if (e.type === 'player-media-error' || e.type === 'error') {
                // Format the error message
                const msg = e.detail?.message || e.message || 'Unknown Error';
                setMediaErrors(prev => [...prev.slice(-4), { time: new Date().toLocaleTimeString(), msg }]);
            }
        };
        window.addEventListener('player-media-error', errorListener);
        window.addEventListener('error', errorListener); // Catch global errors too

        return () => {
            clearInterval(interval);
            window.removeEventListener('player-media-error', errorListener);
            window.removeEventListener('error', errorListener);
        };
    }, []);

    return (
        <div
            className="absolute top-0 right-0 w-24 h-24 z-50 opacity-0 bg-transparent hover:opacity-100 transition-opacity"
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();

                const now = Date.now();
                const lastClick = (window as any)._lastDebugClick || 0;
                const clicks = ((window as any)._debugClicks || 0) + 1;

                if (now - lastClick > 1000) {
                    (window as any)._debugClicks = 1;
                } else {
                    (window as any)._debugClicks = clicks;
                }
                (window as any)._lastDebugClick = now;

                if ((window as any)._debugClicks >= 5) {
                    (window as any)._debugClicks = 0;
                    if (onActivate) {
                        onActivate();
                        return;
                    }
                    alert(`STATUS:
ID: ${screenId || 'N/A'}
RES: ${stats?.res || 'N/A'}
MEM: ${stats?.memUsing || 'N/A'}
NET: ${stats?.online ? 'ONLINE' : 'OFFLINE'}
LAST ERRORS:
${mediaErrors.length === 0 ? 'None' : mediaErrors.map(e => `[${e.time}] ${e.msg}`).join('\n')}

${mediaErrors.some(e => e.url) ? `
!!! CORRUPTED / UNPLAYABLE FILES !!!
${mediaErrors.filter(e => e.url).map(e => `>> ${e.url}`).join('\n')}
` : ''}
            `);
                }
            }}
        />
    );
}
