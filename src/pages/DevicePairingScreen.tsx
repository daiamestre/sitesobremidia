import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Monitor, Smartphone, RefreshCw, AlertTriangle, Key } from "lucide-react";
import { Logo } from "@/components/Logo";
import "../components/player/Player.css";

const SCREEN_ID_CACHE_KEY = "player_screen_id_codemidia";
const SCREEN_TOKEN_CACHE_KEY = "player_screen_token_codemidia";

// RPCs return jsonb (typed as Json) -> narrow once per call site
interface PairRpcResult {
    ok?: boolean;
    pairing_code?: string;
    expires_at?: string;
    status?: string;
    screen_id?: string;
    screen_token?: string;
}

export default function DevicePairingScreen() {
    const navigate = useNavigate();
    const [identityHash, setIdentityHash] = useState<string | null>(null);
    const [pairingCode, setPairingCode] = useState<string | null>(null);
    const [expiresAt, setExpiresAt] = useState<Date | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    // Get or generate Device ID
    useEffect(() => {
        const initDevice = async () => {
            let id = null;
            try {
                // Try to get native Android ID if running in the APK
                if (window.NativePlayer && typeof window.NativePlayer.getDeviceId === 'function') {
                    id = window.NativePlayer.getDeviceId();
                }
            } catch (e) {
                console.warn("NativePlayer not found, falling back to local storage ID");
            }

            // Fallback for web testing
            if (!id) {
                id = localStorage.getItem("web_device_identity");
                if (!id) {
                    id = crypto.randomUUID();
                    localStorage.setItem("web_device_identity", id);
                }
            }

            setIdentityHash(id);
        };

        initDevice();
    }, []);

    const requestCode = useCallback(async () => {
        if (!identityHash) return;
        setLoading(true);
        setError(null);

        try {
            const { data, error: rpcError } = await supabase.rpc('fn_request_pairing_code', {
                p_identity_hash: identityHash,
                p_device_model: navigator.userAgent
            });

            if (rpcError) throw rpcError;

            const result = data as PairRpcResult | null;
            if (result && result.ok) {
                setPairingCode(result.pairing_code ?? null);
                setExpiresAt(new Date(result.expires_at));
            } else {
                throw new Error("Failed to generate pairing code");
            }
        } catch (err: any) {
            console.error("Pairing request failed:", err);
            setError("Erro ao conectar com o servidor. Verifique a internet da TV.");
        } finally {
            setLoading(false);
        }
    }, [identityHash]);

    // Initial code request
    useEffect(() => {
        if (identityHash) {
            requestCode();
        }
    }, [identityHash, requestCode]);

    // Polling for pairing status
    useEffect(() => {
        if (!identityHash || !pairingCode) return;

        const interval = setInterval(async () => {
            try {
                const { data, error } = await supabase.rpc('fn_check_pairing_status', {
                    p_identity_hash: identityHash
                });

                if (error) {
                    console.error("Polling error:", error);
                    return;
                }

                const result = data as PairRpcResult | null;
                if (result && result.ok) {
                    if (result.status === 'paired' && result.screen_id) {
                        // Success! Device is now paired
                        clearInterval(interval);
                        const screenId = result.screen_id;
                        localStorage.setItem(SCREEN_ID_CACHE_KEY, screenId);
                        if (result.screen_token) {
                            localStorage.setItem(SCREEN_TOKEN_CACHE_KEY, result.screen_token);
                        }

                        // Small delay to show success state before redirecting
                        setTimeout(() => {
                            navigate(`/player/${screenId}`, { replace: true });
                        }, 2000);
                    } else if (result.status === 'expired') {
                        // Code expired, request a new one
                        requestCode();
                    }
                } else if (result && !result.ok && result.status === 'expired') {
                    requestCode();
                }
            } catch (e) {
                // Ignore transient network errors during polling
            }
        }, 5000); // Check every 5 seconds

        return () => clearInterval(interval);
    }, [identityHash, pairingCode, navigate, requestCode]);


    return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8 font-sans overflow-hidden relative">
            {/* Background effects */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-[20%] -left-[10%] w-[70%] h-[70%] bg-primary/20 rounded-full blur-[120px]" />
                <div className="absolute -bottom-[20%] -right-[10%] w-[70%] h-[70%] bg-blue-600/20 rounded-full blur-[120px]" />
            </div>

            <div className="z-10 w-full max-w-5xl flex flex-col items-center">
                <div className="mb-12 scale-150">
                    <Logo />
                </div>

                {loading && !pairingCode ? (
                    <div className="flex flex-col items-center gap-6">
                        <RefreshCw className="h-16 w-16 text-primary animate-spin" />
                        <h2 className="text-3xl font-light">Conectando ao SOBRE MÍDIA...</h2>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center gap-6 text-center bg-red-950/30 border border-red-500/50 p-12 rounded-3xl backdrop-blur-md">
                        <AlertTriangle className="h-20 w-20 text-red-500" />
                        <h2 className="text-4xl font-bold text-red-400">Erro de Conexão</h2>
                        <p className="text-2xl text-red-200/80 max-w-2xl">{error}</p>
                        <button 
                            onClick={requestCode}
                            className="mt-8 px-8 py-4 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-xl transition-all"
                        >
                            Tentar Novamente
                        </button>
                    </div>
                ) : pairingCode ? (
                    <div className="flex flex-col items-center w-full">
                        <h1 className="text-5xl md:text-6xl font-bold mb-6 text-center tracking-tight">
                            Vincule esta Tela
                        </h1>
                        <p className="text-2xl text-gray-400 mb-16 text-center max-w-3xl">
                            Acesse o painel administrativo pelo seu computador ou celular para adicionar esta TV à sua rede.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 w-full items-center">
                            {/* Left Side: Instructions */}
                            <div className="flex flex-col gap-8 order-2 md:order-1">
                                <div className="flex items-start gap-6 bg-white/5 p-6 rounded-2xl border border-white/10">
                                    <div className="bg-primary/20 p-4 rounded-full shrink-0">
                                        <Smartphone className="h-8 w-8 text-primary" />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-bold mb-2">1. Acesse o Painel</h3>
                                        <p className="text-xl text-gray-400">Entre na sua conta SOBRE MÍDIA e vá para o menu <strong>Telas</strong>.</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-6 bg-white/5 p-6 rounded-2xl border border-white/10">
                                    <div className="bg-primary/20 p-4 rounded-full shrink-0">
                                        <Monitor className="h-8 w-8 text-primary" />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-bold mb-2">2. Vincular Nova Tela</h3>
                                        <p className="text-xl text-gray-400">Clique em "Vincular TV" e digite o código ao lado.</p>
                                    </div>
                                </div>
                            </div>

                            {/* Right Side: PIN Code */}
                            <div className="flex flex-col items-center order-1 md:order-2">
                                <div className="bg-white/10 backdrop-blur-xl border border-white/20 p-12 rounded-[3rem] shadow-2xl relative w-full flex flex-col items-center">
                                    <div className="absolute -top-6 bg-primary text-white px-6 py-2 rounded-full font-bold uppercase tracking-widest text-sm flex items-center gap-2 shadow-lg">
                                        <Key className="h-4 w-4" />
                                        Código de Pareamento
                                    </div>
                                    
                                    <div className="text-[7rem] md:text-[9rem] font-black tracking-widest leading-none text-transparent bg-clip-text bg-gradient-to-br from-white to-gray-400 tabular-nums">
                                        {pairingCode.substring(0,3)}<span className="text-primary/80">-</span>{pairingCode.substring(3)}
                                    </div>
                                    
                                    {expiresAt && (
                                        <p className="mt-8 text-lg text-gray-400 flex items-center gap-2">
                                            <RefreshCw className="h-4 w-4 animate-spin-slow" />
                                            Aguardando vinculação...
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : null}

                {/* Device Info Footer */}
                <div className="absolute bottom-6 text-gray-600 text-sm flex items-center gap-4">
                    <span>SOBRE MÍDIA Player v2.0</span>
{identityHash && <span className="text-xs text-emerald-400">Dispositivo pareado</span>}
                </div>
            </div>
        </div>
    );
}
