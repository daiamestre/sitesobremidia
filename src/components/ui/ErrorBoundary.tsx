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
    }

    private handleReload = () => {
        window.location.reload();
    };

    public render() {
        if (this.state.hasError) {
            return (
                <div className="h-screen w-full flex flex-col items-center justify-center bg-zinc-950 text-white p-6 text-center space-y-4">
                    <div className="h-16 w-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
                        <AlertTriangle className="h-8 w-8 text-red-500" />
                    </div>
                    <h1 className="text-2xl font-bold">Algo deu errado</h1>
                    <p className="text-zinc-400 max-w-md">
                        Ocorreu um erro inesperado na aplicação. Nossos engenheiros foram notificados (simbólico).
                    </p>
                    <div className="p-4 bg-zinc-900 rounded text-xs text-left font-mono w-full max-w-lg overflow-auto max-h-40 border border-zinc-800">
                        {this.state.error?.toString()}
                    </div>
                    <div className="pt-4">
                        <Button onClick={this.handleReload} variant="secondary">
                            Recarregar Página
                        </Button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
