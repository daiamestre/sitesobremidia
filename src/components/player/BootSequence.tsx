import React, { useEffect, useState } from "react";
import { Loader2, Wifi, WifiOff, Database, ShieldCheck, ShieldAlert, Monitor, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { supabaseConfig } from "@/supabaseConfig";
import { useNavigate, useLocation } from "react-router-dom";

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

    const [steps, setSteps] = useState({
        config: "pending",
        bridge: "pending", // pending, processing, success, error
        network: "pending",
        database: "pending",
        overlay: "pending",
    });
    const [statusMessage, setStatusMessage] = useState("Inicializando sistema...");
    const [deviceInfo, setDeviceInfo] = useState<DeviceStatus | null>(null);

    useEffect(() => {
        const runBoot = async () => {
            // 0. Config Check
            setStatusMessage("Carregando configurações...");
            setSteps((s) => ({ ...s, config: "processing" }));
            await new Promise((resolve) => setTimeout(resolve, 500));

            if (supabaseConfig.url && supabaseConfig.key) {
                setSteps((s) => ({ ...s, config: "success" }));
            } else {
                setSteps((s) => ({ ...s, config: "error" }));
            }

            // 1. Native Bridge / Environment Check
            setStatusMessage("Detectando ambiente...");
            setSteps((s) => ({ ...s, bridge: "processing" }));

            let isNativeEnv = false;

            try {
                if (window.NativePlayer) {
                    const statusJson = window.NativePlayer.getDeviceStatus();
                    try {
                        const currentStatus = JSON.parse(statusJson);
                        setDeviceInfo(currentStatus);
                        isNativeEnv = true;
                        setSteps((s) => ({ ...s, bridge: "success" }));

                        // FIX: Update Overlay Status
                        if (currentStatus.overlayGranted) {
                            setSteps((s) => ({ ...s, overlay: "success" }));
                        } else {
                            setSteps((s) => ({ ...s, overlay: "error" }));
                        }

                    } catch (jsonError) {
                        console.error("Invalid JSON from Native:", statusJson);
                        setSteps((s) => ({ ...s, bridge: "error" }));
                    }
                } else {
                    console.warn("Native Bridge not found (Browser Mode)");
                    setSteps((s) => ({ ...s, bridge: "success" })); // Not an error, just browser mode
                    setSteps((s) => ({ ...s, overlay: "success" })); // Browser assumes OK
                }
            } catch (e) {
                console.error("Bridge Error", e);
                setSteps((s) => ({ ...s, bridge: "error" }));
            }

            // 2. Network Check
            setStatusMessage("Verificando conexão...");
            setSteps((s) => ({ ...s, network: "processing" }));

            const isOnline = navigator.onLine;
            if (isOnline) {
                setSteps((s) => ({ ...s, network: "success" }));
            } else {
                setSteps((s) => ({ ...s, network: "error" }));
            }

            // 3. Database Ping (Skip if offline)
            if (isOnline) {
                setStatusMessage("Conectando ao Servidor...");
                setSteps((s) => ({ ...s, database: "processing" }));
                const { error } = await supabase.from("profiles").select("count", { count: "exact", head: true });
                if (!error) {
                    setSteps((s) => ({ ...s, database: "success" }));
                } else {
                    console.warn("Database Connection Failed (Offline Mode)", error);
                    setSteps((s) => ({ ...s, database: "success" }));
                    setStatusMessage("Modo Offline Ativo");
                }
            } else {
                setSteps((s) => ({ ...s, database: "pending" }));
            }

            // Finish
            setStatusMessage("Sistema Pronto!");
            await new Promise((resolve) => setTimeout(resolve, 800));

            if (redirectOnComplete && isNativeEnv) {
                console.log("Native Environment Detected: Redirecting to Player Entry");
                if (location.pathname === '/') {
                    navigate('/tv', { replace: true });
                }
            }

            onComplete(isNativeEnv);
        };

        runBoot();
    }, [onComplete, redirectOnComplete]);

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
                    <p className="text-zinc-500 text-sm font-mono tracking-widest">PLAYER SYSTEM V1.0</p>
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
                    {deviceInfo && (
                        <p className="text-xs text-zinc-600 font-mono">
                            ID: {deviceInfo.deviceId} | {deviceInfo.model}
                        </p>
                    )}

                    {/* FAIL-SAFE: Manual Override */}
                    {(steps.config === 'error' || steps.network === 'error' || steps.database === 'error' || steps.bridge === 'error') && (
                        <button
                            onClick={() => onComplete(false)} // Manual override
                            className="text-xs text-zinc-500 hover:text-white underline decoration-zinc-800 underline-offset-4 transition-colors"
                        >
                            [Modo de Segurança] Ignorar e Continuar
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
