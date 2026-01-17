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

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        // Auto-retry after 30 seconds
        setTimeout(() => {
            this.handleReload();
        }, 30000);
    }

    private handleReload = () => {
        window.location.reload();
    };

    public render() {
        if (this.state.hasError) {
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
                        <p className="text-zinc-400">
                            O sistema tentará recuperar a conexão automaticamente em instantes.
                        </p>
                    </div>

                    {/* Tech Details (Hidden by default or subtle) */}
                    <div className="p-4 bg-zinc-900/50 rounded-lg border border-red-500/20 text-xs text-left font-mono w-full max-w-lg overflow-hidden text-red-400/80">
                        <p className="mb-2 font-bold text-red-400">DIAGNOSTIC CODE:</p>
                        <pre className="whitespace-pre-wrap">{this.state.error?.stack || this.state.error?.message || "Unknown Error"}</pre>
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
