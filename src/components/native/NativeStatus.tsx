import React, { useEffect, useState } from 'react';
import { useNativePlayer } from '../../hooks/useNativePlayer';

export const NativeStatus: React.FC = () => {
    const { isNative, getDeviceId, getPlayerConfig, showToast } = useNativePlayer();
    const [config, setConfig] = useState<any>(null);
    const [deviceId, setDeviceId] = useState<string>('Loading...');

    useEffect(() => {
        // Load data on mount
        setDeviceId(getDeviceId());
        try {
            const configStr = getPlayerConfig();
            setConfig(JSON.parse(configStr));
        } catch (e) {
            console.error("Failed to parse config", e);
        }
    }, [getDeviceId, getPlayerConfig]);

    const handleTestToast = () => {
        showToast("Olá do React!");
    };

    if (!isNative && process.env.NODE_ENV === 'production') {
        // Optionally hide in production if not native
        // return null; 
    }

    return (
        <div className="fixed bottom-4 right-4 p-4 bg-black/80 text-white rounded-lg backdrop-blur border border-white/20 shadow-xl max-w-sm">
            <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${isNative ? 'bg-green-500' : 'bg-yellow-500'}`} />
                Diagnóstico do Sistema
            </h3>

            <div className="space-y-2 text-sm font-mono">
                <p><span className="text-gray-400">Ambiente:</span> {isNative ? 'Sistema Android' : 'Navegador Web'}</p>
                <p><span className="text-gray-400">ID do Dispositivo:</span> {deviceId}</p>
                <p><span className="text-gray-400">Modo Quiosque:</span> {config?.kioskMode ? 'Ativo' : 'Inativo'}</p>
                <p><span className="text-gray-400">Versão:</span> {config?.version || 'N/A'}</p>
            </div>

            <button
                onClick={handleTestToast}
                className="mt-3 w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors"
            >
                Testar Alerta Nativo
            </button>
        </div>
    );
};
