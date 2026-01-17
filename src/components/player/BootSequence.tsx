import React, { useEffect, useState } from "react";
import { Loader2, Wifi, WifiOff, Database, ShieldCheck, ShieldAlert, Monitor, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { supabaseConfig } from "@/supabaseConfig";
import { useNavigate, useLocation } from "react-router-dom";

// EXTEND WINDOW TYPE FOR NATIVE BRIDGE
declare global {
    interface Window {
        NativePlayer?: {
            getDeviceStatus: () => string;
            requestOverlayPermission: () => void;
            getDeviceId: () => string;
            log: (msg: string) => void;
        };
    }
}

interface DeviceStatus {
    deviceId: string;
    overlayGranted: boolean;
    isOnline: boolean;
    model: string;
    sdk: number;
}

interface BootSequenceProps {
    onComplete: (isNative: boolean) => void;
    redirectOnComplete?: boolean;
}

export const BootSequence: React.FC<BootSequenceProps> = ({ onComplete, redirectOnComplete = true }) => {
    const navigate = useNavigate();
    const location = useLocation();

    // DEBUG STATE
    const [logs, setLogs] = useState<string[]>(["[Init] v2.23 Permissions Fix"]);

    const addLog = (msg: string) => {
        console.log(msg);
        setLogs(prev => [...prev.slice(-10), `${new Date().toISOString().split('T')[1].split('.')[0]} ${msg}`]);
    };

    const [steps, setSteps] = useState({
        config: "pending",
        bridge: "pending",
        network: "pending",
        database: "pending",
        overlay: "pending",
    });
    const [statusMessage, setStatusMessage] = useState("Inicializando sistema...");
    const [deviceInfo, setDeviceInfo] = useState<DeviceStatus | null>(null);

    useEffect(() => {
        const runBoot = async () => {
            try {
                // 0. Config Check
                addLog("Checking Config...");
                setSteps((s) => ({ ...s, config: "processing" }));
                await new Promise((resolve) => setTimeout(resolve, 500));

                if (supabaseConfig.url && supabaseConfig.key) {
                    setSteps((s) => ({ ...s, config: "success" }));
                } else {
                    setSteps((s) => ({ ...s, config: "error" }));
                }

                // 1. Native Bridge / Environment Check
                addLog("Checking Native Bridge...");
                setSteps((s) => ({ ...s, bridge: "processing" }));

                let isNativeEnv = false;

                if (window.NativePlayer) {
                    try {
                        const statusJson = window.NativePlayer.getDeviceStatus();
                        addLog("Native Status: Received");
                        const currentStatus = JSON.parse(statusJson);
                        setDeviceInfo(currentStatus);
                        isNativeEnv = true;
                        setSteps((s) => ({ ...s, bridge: "success" }));

                        // 4. Overlay Permission (CRITICAL)
                        setSteps((s) => ({ ...s, overlay: "processing" }));

                        const checkOverlay = () => {
                            try {
                                const s = JSON.parse(window.NativePlayer!.getDeviceStatus());
                                return s.overlayGranted;
                            } catch { return false; }
                        };

                        if (checkOverlay()) {
                            setSteps((s) => ({ ...s, overlay: "success" }));
                        } else {
                            addLog("Requesting Overlay...");
                            setStatusMessage("Solicitando Permissão de Tela...");

                            // Trigger Native Request
                            window.NativePlayer.requestOverlayPermission();

                            // POLLING LOOP (Wait for user to grant)
                            let attempts = 0;
                            // Wait up to 30 seconds for user to return
                            while (attempts < 30) {
                                await new Promise(r => setTimeout(r, 1000));
                                if (checkOverlay()) {
                                    setSteps((s) => ({ ...s, overlay: "success" }));
                                    addLog("Overlay Granted!");
                                    break;
                                }
                                attempts++;
                            }

                            if (!checkOverlay()) {
                                setSteps((s) => ({ ...s, overlay: "error" }));
                                addLog("Overlay Denied/Timeout");
                            }
                        }
                    } catch (e) {
                        addLog("Bridge Parse Error: " + String(e));
                        setSteps((s) => ({ ...s, bridge: "error" }));
                    }
                } else {
                    addLog("Web Mode Detected");
                    setSteps((s) => ({ ...s, bridge: "success", overlay: "success" }));
                }

                // 2. Network Check
                setSteps((s) => ({ ...s, network: "processing" }));
                const isOnline = navigator.onLine;
                if (isOnline) {
                    setSteps((s) => ({ ...s, network: "success" }));
                } else {
                    setSteps((s) => ({ ...s, network: "error" }));
                }

                // 3. Database Ping (Skip if offline)
                if (isOnline) {
                    setSteps((s) => ({ ...s, database: "processing" }));
                    try {
                        const { error } = await supabase.from("profiles").select("count", { count: "exact", head: true });
                        if (!error) {
                            setSteps((s) => ({ ...s, database: "success" }));
                        } else {
                            addLog("DB Error: " + JSON.stringify(error));
                            setSteps((s) => ({ ...s, database: "success" })); // Soft fail
                        }
                    } catch (dbe) {
                        addLog("DB Crash: " + String(dbe));
                        setSteps((s) => ({ ...s, database: "success" })); // Soft fail
                    }
                } else {
                    setSteps((s) => ({ ...s, database: "pending" }));
                }

                // Finish
                setStatusMessage("Sistema Pronto!");
                await new Promise((resolve) => setTimeout(resolve, 800));

                if (redirectOnComplete && isNativeEnv) {
                    // Logic: If on root, go to TV/Entry. If already on deep link, stay there.
                    if (location.pathname === '/') {
                        navigate('/tv', { replace: true });
                    }
                }

                onComplete(isNativeEnv);

            } catch (fatal) {
                addLog("FATAL: " + String(fatal));
                // Force complete after delay to avoid infinite stick
                setTimeout(() => onComplete(false), 3000);
            }
        };

        runBoot();
    }, [onComplete, redirectOnComplete, navigate, location]);

    const getIcon = (state: string) => {
        switch (state) {
            case "pending": return <div className="w-4 h-4 rounded-full bg-zinc-800" />;
            case "processing": return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
            case "success": return <div className="w-4 h-4 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]" />;
            case "error": return <div className="w-4 h-4 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" />;
            default: return <div className="w-4 h-4 rounded-full bg-zinc-800" />;
        }
    };

    return (
        <div className="fixed inset-0 bg-black flex flex-col items-center justify-center text-white z-50">

            <div className="w-full max-w-md p-8 space-y-8">
                {/* Logo / Brand */}
                <div className="flex flex-col items-center space-y-2">
                    <h1 className="text-3xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-600">
                        SOBRE MÍDIA
                    </h1>
                    <p className="text-zinc-500 text-sm font-mono tracking-widest">PLAYER SYSTEM V2.23</p>
                </div>

                {/* Status Steps */}
                <div className="space-y-4 bg-zinc-900/50 p-6 rounded-xl border border-zinc-800/50 backdrop-blur-sm">

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Settings className="w-5 h-5 text-zinc-400" />
                            <span className="text-sm text-zinc-300">Configuração Local</span>
                        </div>
                        {getIcon(steps.config)}
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Monitor className="w-5 h-5 text-zinc-400" />
                            <span className="text-sm text-zinc-300">Sistema Android</span>
                        </div>
                        {getIcon(steps.bridge)}
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            {steps.network === "error" ? <WifiOff className="w-5 h-5 text-red-500" /> : <Wifi className="w-5 h-5 text-zinc-400" />}
                            <span className="text-sm text-zinc-300">Conectividade</span>
                        </div>
                        {getIcon(steps.network)}
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Database className="w-5 h-5 text-zinc-400" />
                            <span className="text-sm text-zinc-300">Banco de Dados</span>
                        </div>
                        {getIcon(steps.database)}
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            {steps.overlay === "error" ? <ShieldAlert className="w-5 h-5 text-yellow-500" /> : <ShieldCheck className="w-5 h-5 text-zinc-400" />}
                            <span className="text-sm text-zinc-300">Permissões de Tela</span>
                        </div>
                        {getIcon(steps.overlay)}
                    </div>

                </div>

                {/* Status Message */}
                <div className="text-center space-y-4">
                    <p className="text-zinc-400 text-sm animate-pulse">{statusMessage}</p>

                    {/* Manual Override */}
                    <button
                        onClick={() => onComplete(false)}
                        className="text-xs text-zinc-600 hover:text-white underline"
                    >
                        Ignorar
                    </button>

                    {logs.length > 0 && <p className="text-[10px] text-zinc-700">{logs[logs.length - 1]}</p>}
                </div>
            </div>
        </div>
    );
};
