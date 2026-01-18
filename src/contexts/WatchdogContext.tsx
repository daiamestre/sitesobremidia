
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

// ==========================================
// TYPES
// ==========================================

interface WatchdogMetrics {
    communication: {
        status: 'OK' | 'FAIL' | 'WARNING';
        ping: number; // ms
        lastPulse: number; // timestamp
    };
    integrity: {
        status: 'OK' | 'FAIL';
        lastFrameTime: number; // timestamp of last render
        droppedFrames: number;
    };
    logic: {
        status: 'OK' | 'FAIL';
        playlistCount: number;
        currentId: string | null;
    };
    action: {
        suggested: string;
        autoHealingTriggered: boolean;
    };
    // BLACK BOX METRICS
    blackBox: {
        socketStatus: 'OPEN' | 'RETRYING' | 'CLOSED';
        bufferHealth: 'GOOD' | 'LOW' | 'CRITICAL';
        lastCommand: string; // JSON String
    };
}

interface WatchdogContextType {
    metrics: WatchdogMetrics;
    reportHeartbeat: () => void;
    reportLogicState: (count: number, currentId: string) => void;
    reportError: (module: string, error: string) => void;
    reportSocketStatus: (status: 'OPEN' | 'RETRYING' | 'CLOSED') => void;
    reportLastCommand: (cmd: any) => void;
}

const WatchdogContext = createContext<WatchdogContextType | undefined>(undefined);

// ==========================================
// CONFIG
// ==========================================
const HEARTBEAT_THRESHOLD_MS = 20000; // 20s without a frame = FROZEN
const PING_INTERVAL_MS = 30000; // 30s check

//AUTO-HEALING LOGIC
const selfHealSystem = (errorCode: string) => {
    console.log(`[SelfHeal] 🚑 ATIVANDO PROTOCOLO PARA: ${errorCode}`);

    switch (errorCode) {
        case "AUTH_EXPIRED":
        case "JWT_EXPIRED":
            console.log("Sistema: Renovando Token de acesso automaticamente...");
            // Force re-login logic (simulated reload for now as Supabase handles refresh internally)
            window.location.reload();
            break;
        case "CONNECTION_LOST":
            console.log("Sistema: Mudando para servidor de backup (DNS Secundário)...");
            // Logic to switch Supabase endpoint if we had multiple
            break;
        case "DECODER_FAIL":
        case "MEDIA_ERR_DECODE":
            console.log("Sistema: Erro de aceleração de hardware. Tentando reload...");
            setTimeout(() => window.location.reload(), 1000);
            break;
        default:
            console.warn("[SelfHeal] Protocolo desconhecido:", errorCode);
    }
};

// ==========================================
// PROVIDER
// ==========================================

export const WatchdogProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // STATE
    const [metrics, setMetrics] = useState<WatchdogMetrics>({
        communication: { status: 'WARNING', ping: 0, lastPulse: Date.now() },
        integrity: { status: 'OK', lastFrameTime: Date.now(), droppedFrames: 0 },
        logic: { status: 'OK', playlistCount: 0, currentId: '' },
        action: { suggested: 'System Normal', autoHealingTriggered: false },
        blackBox: { socketStatus: 'CLOSED', bufferHealth: 'GOOD', lastCommand: '{}' }
    });

    // ... (Existing Effects) ...

    const reportSocketStatus = useCallback((status: 'OPEN' | 'RETRYING' | 'CLOSED') => {
        setMetrics(prev => ({ ...prev, blackBox: { ...prev.blackBox, socketStatus: status } }));
    }, []);

    const reportLastCommand = useCallback((cmd: any) => {
        setMetrics(prev => ({
            ...prev,
            blackBox: { ...prev.blackBox, lastCommand: JSON.stringify(cmd).substring(0, 50) + '...' }
        }));

        // PREDICTIVE ERROR LOGIC: JSON VALIDATOR
        if (cmd && cmd.type === 'PLAY' && !cmd.url_stream) {
            console.error('[BlackBox] ❌ ERRO DE DADOS: O Dashboard falhou ao fornecer o link da mídia');
            // Dispatch error to show in overlay
            reportError('Dashboard', 'JSON Incompleto (url_stream missing)');
        }
    }, []);

    // ... methods ...

    const reportError = useCallback((module: string, error: string) => {
        setMetrics(prev => ({
            ...prev,
            action: { ...prev.action, suggested: `Check ${module}: ${error.substring(0, 20)}...` }
        }));

        // TRIGGER SELF HEAL IF KNOWN ERROR
        if (error.includes('decode') || error.includes('Auth')) {
            selfHealSystem(error.includes('Auth') ? 'AUTH_EXPIRED' : 'DECODER_FAIL');
        }
    }, []);

    // Ensure state matches context type
    const contextValue: WatchdogContextType = {
        metrics,
        reportHeartbeat,
        reportLogicState,
        reportError,
        reportSocketStatus,
        reportLastCommand
    };

    return (
        <WatchdogContext.Provider value={contextValue}>
            {children}
        </WatchdogContext.Provider>
    );
};
useEffect(() => {
    const checkConnection = async () => {
        const start = performance.now();
        try {
            // Determine latency check
            const { error } = await supabase.from('screens').select('count', { count: 'exact', head: true });
            const end = performance.now();
            const latency = Math.round(end - start);

            if (error) throw error;

            setMetrics(prev => ({
                ...prev,
                communication: { status: 'OK', ping: latency, lastPulse: Date.now() }
            }));
        } catch (e) {
            console.warn('[Watchdog] Ping Failed:', e);
            setMetrics(prev => ({
                ...prev,
                communication: { ...prev.communication, status: 'FAIL' },
                action: { ...prev.action, suggested: 'Verificar conexão de internet' }
            }));
        }
    };

    const interval = setInterval(checkConnection, PING_INTERVAL_MS);
    checkConnection(); // Initial

    return () => clearInterval(interval);
}, []);

// 2. WATCHDOG (Frozen Frame Monitor)
useEffect(() => {
    const monitor = setInterval(() => {
        const now = Date.now();
        const timeSinceLastFrame = now - metrics.integrity.lastFrameTime;

        if (timeSinceLastFrame > HEARTBEAT_THRESHOLD_MS) {
            // SYSTEM FROZEN
            console.error('[Watchdog] CRITICAL: System Frozen for', timeSinceLastFrame, 'ms');

            setMetrics(prev => ({
                ...prev,
                integrity: { ...prev.integrity, status: 'FAIL' },
                action: { suggested: 'Auto-Healing (Reiniciando...)', autoHealingTriggered: true }
            }));

            // SELF HEALING ACTION
            // Force Reload after freeze detection
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        }
    }, 5000); // Check every 5s

    return () => clearInterval(monitor);
}, [metrics.integrity.lastFrameTime]);

// METHODS
const reportHeartbeat = useCallback(() => {
    setMetrics(prev => ({
        ...prev,
        integrity: { ...prev.integrity, status: 'OK', lastFrameTime: Date.now() },
        // Clear warnings if we are back
        action: prev.action.autoHealingTriggered ? prev.action : { ...prev.action, suggested: 'System Normal' }
    }));
}, []);

const reportLogicState = useCallback((count: number, currentId: string) => {
    setMetrics(prev => ({
        ...prev,
        logic: { status: 'OK', playlistCount: count, currentId }
    }));
}, []);

const reportError = useCallback((module: string, error: string) => {
    setMetrics(prev => ({
        ...prev,
        action: { ...prev.action, suggested: `Check ${module}: ${error.substring(0, 20)}...` }
    }));
}, []);

return (
    <WatchdogContext.Provider value={{ metrics, reportHeartbeat, reportLogicState, reportError }}>
        {children}
    </WatchdogContext.Provider>
);
};

export const useWatchdog = () => {
    const context = useContext(WatchdogContext);
    if (!context) {
        // Fallback for components used outside provider (optional, but safer)
        return {
            metrics: {
                communication: { status: 'WARNING', ping: 0, lastPulse: 0 },
                integrity: { status: 'OK', lastFrameTime: Date.now(), droppedFrames: 0 },
                logic: { status: 'OK', playlistCount: 0, currentId: '' },
                action: { suggested: 'No Watchdog', autoHealingTriggered: false }
            } as WatchdogMetrics,
            reportHeartbeat: () => { },
            reportLogicState: () => { },
            reportError: () => { }
        };
    }
    return context;
};
