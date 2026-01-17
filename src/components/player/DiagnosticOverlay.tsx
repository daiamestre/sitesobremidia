import React from 'react';

interface DiagnosticOverlayProps {
    screenId?: string;
    orientation?: string;
    onActivate?: () => void;
}

export function DiagnosticOverlay({ screenId, orientation, onActivate }: DiagnosticOverlayProps) {
    return (
        <div
            className="absolute top-0 right-0 w-24 h-24 z-50 opacity-0 bg-transparent"
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();

                const now = Date.now();
                // Use a window-level variable as a simple way to persist state across re-renders without useState if beneficial,
                // but since we are now in a component, local variables would reset on unmount.
                // However, this component stays mounted.
                // Let's use the window approach for robustness against component remounts during playlist transitions.

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
                    } else {
                        alert(`STATUS:
ID: ${screenId || 'N/A'}
RES: ${window.innerWidth}x${window.innerHeight}
ORIENT: ${orientation || 'Auto'}
PING: ${new Date().toLocaleTimeString()}
App Version: 1.0.0
            `);
                    }
                }
            }}
        />
    );
}
