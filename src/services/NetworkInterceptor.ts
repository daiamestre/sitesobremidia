
/**
 * Communication Check Interceptor (Signal Player Professional)
 * Monkey-patches window.fetch to monitor Data Flow.
 */

export const installNetworkInterceptor = () => {
    const originalFetch = window.fetch;

    window.fetch = async (...args) => {
        const [resource, config] = args;
        const url = resource.toString();
        const start = performance.now();

        // 1. Checagem de Saída
        // "O sistema verifica se o comando está saindo correto"
        console.debug(`[NetInterceptor] 📤 Checando saída para: ${url}`);

        try {
            const response = await originalFetch(...args);
            const duration = performance.now() - start;

            // 3. Validação de Resposta
            if (duration > 5000) {
                console.warn(`[NetInterceptor] ⏳ LENTIDÃO: Resposta demorou ${(duration / 1000).toFixed(1)}s`);
            }

            return response;
        } catch (error) {
            // 2. Identificação de Erro de Conexão
            console.error(`[NetInterceptor] ❌ ERRO DE COMUNICAÇÃO: O sinal falhou para ${url}`, error);
            throw error;
        }
    };

    const originalXHR = window.XMLHttpRequest;
    // We could patch XHR too if needed, but Supabase uses fetch.
    console.log('[NetInterceptor] ✅ Sistema de Monitoramento de Rede Ativo.');
};

