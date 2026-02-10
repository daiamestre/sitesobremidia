import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidMount() {
        window.addEventListener("unhandledrejection", this.handlePromiseRejection);
        window.addEventListener("error", this.handleGlobalError);
    }

    public componentWillUnmount() {
        window.removeEventListener("unhandledrejection", this.handlePromiseRejection);
        window.removeEventListener("error", this.handleGlobalError);
    }

    private handlePromiseRejection = (event: PromiseRejectionEvent) => {
        const reason = event.reason?.message || event.reason;
        const reasonStr = String(reason);

        // IGNORE: Media Player Errors (Handled internally by PlayerEngine)
        if (reasonStr.includes("The element has no supported sources")) {
            console.warn("[ErrorBoundary] Ignored Media Error:", reason);
            return;
        }

        // IGNORE: AbortErrors (Common in React 18 / Video switching)
        if (reasonStr.includes("AbortError") || reasonStr.includes("The play() request was interrupted")) {
            console.warn("[ErrorBoundary] Ignored AbortError:", reason);
            return;
        }

        this.setState({
            hasError: true,
            error: new Error(`PROMISE REJECTION: ${reasonStr || "Unknown Rejection"}`)
        });
    };

    private handleGlobalError = (event: ErrorEvent) => {
        this.setState({
            hasError: true,
            error: event.error || new Error(`GLOBAL ERROR: ${event.message}`)
        });
    };

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);

        // TELEMETRY (SRE REQUIREMENT)
        this.sendTelemetry(error, errorInfo);

        // Auto-retry after 30 seconds
        setTimeout(() => {
            this.handleReload();
        }, 30000);
    }

    private sendTelemetry(error: Error, info: ErrorInfo) {
        try {
            // Tentativa de envio para endpoint de diagnóstico
            // Em produção, isso seria um endpoint real
            const payload = {
                timestamp: new Date().toISOString(),
                error: error.message,
                stack: error.stack,
                componentStack: info.componentStack,
                url: window.location.href,
                userAgent: navigator.userAgent
            };

            // Exemplo de envio via Beacon (garante envio mesmo se a página fechar)
            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            navigator.sendBeacon('https://api.sobremidia.com/v1/telemetry/error', blob);

            console.log('[SRE] Erro reportado via Telemetria:', payload);
        } catch (e) {
            console.warn('[SRE] Falha ao enviar telemetria:', e);
        }
    }

    private handleReload = () => {
        window.location.reload();
    };

    public render() {
        if (this.state.hasError) {
            const errorMsg = this.state.error
                ? (this.state.error.message || this.state.error.toString())
                : "Unknown Error (Null state)";

            return (
                <div className="h-screen w-full flex flex-col items-center justify-center bg-black text-white p-8 text-center space-y-8 animate-in fade-in duration-500">
                    {/* Brand Logo */}
                    <div className="flex flex-col items-center space-y-2 mb-8">
                        <h1 className="text-4xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-600">
                            SOBRE MÍDIA
                        </h1>
                        <p className="text-zinc-500 text-sm font-mono tracking-widest">SYSTEM RECOVERY MODE</p>
                    </div>

                    {/* Error Icon */}
                    <div className="relative">
                        <div className="absolute inset-0 bg-red-500/20 blur-xl rounded-full"></div>
                        <AlertTriangle className="h-20 w-20 text-red-500 relative z-10 animate-pulse" />
                    </div>

                    {/* Message */}
                    <div className="space-y-2 max-w-lg">
                        <h2 className="text-2xl font-semibold">O Player encontrou um problema</h2>
                        <div className="bg-red-900/50 p-6 rounded border border-red-500 w-full text-left overflow-auto max-h-64 my-4">
                            <p className="text-white font-bold mb-2">ERRO CRÍTICO:</p>
                            <pre className="text-red-200 font-mono text-sm whitespace-pre-wrap break-all">
                                {this.state.error ? String(this.state.error) : "Erro Desconhecido (Null)"}
                                {"\n\nStack:\n"}
                                {this.state.error?.stack || "No Stack Trace"}
                            </pre>
                        </div>
                        <p className="text-zinc-400">
                            O sistema tentará recuperar a conexão automaticamente em instantes.
                        </p>
                    </div>

                    {/* Auto Retry Timer Visualization */}
                    <div className="w-full max-w-xs space-y-2">
                        <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 animate-[progress_30s_linear_infinite]" style={{ width: '100%' }}></div>
                        </div>
                        <p className="text-xs text-zinc-500">Reiniciando automaticamente...</p>
                    </div>

                    {/* Manual Button */}
                    <Button
                        onClick={this.handleReload}
                        variant="outline"
                        className="border-zinc-700 hover:bg-zinc-800 text-zinc-300 min-w-[200px]"
                    >
                        Tentar Agora
                    </Button>
                </div>
            );
        }

        return this.props.children;
    }
}
