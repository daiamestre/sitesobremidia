import { supabase } from '@/integrations/supabase/client';

export interface AlertaDeAparelho {
  id: string;
  name: string | null;
  model: string | null;
  screen_id: string | null;
  /** Nome da tela a que o aparelho está pareado hoje. */
  tela: string | null;
  is_online: boolean | null;
  last_seen: string | null;
  last_heartbeat: string | null;
  storage_available: number | null;
}

/**
 * F-141 — Alertas de aparelhos sem sinal há mais de 2 minutos.
 * Quem decide é o banco (fn_alertas_dispositivos): só o aparelho pareado HOJE a cada tela (registros antigos de
 * pareamento não geram alerta), só as telas que o usuário pode gerir e só os alertas ainda não dispensados.
 */
export const fetchAlertDevices = async (): Promise<AlertaDeAparelho[]> => {
    const { data, error } = await supabase.rpc('fn_alertas_dispositivos' as never);
    if (error) {
        console.error('Erro ao buscar alertas de dispositivos:', error);
        return [];
    }
    return (data as unknown as AlertaDeAparelho[]) ?? [];
};

/**
 * F-141 — Dispensa o alerta de um aparelho (ou de todos, sem argumento). O alerta volta sozinho se o aparelho
 * der sinal de novo e cair outra vez. Devolve quantos alertas foram dispensados.
 */
export const dispensarAlerta = async (deviceId?: string): Promise<number> => {
    const { data, error } = await supabase.rpc('fn_dispensar_alerta_dispositivo' as never, { p_device: deviceId ?? null } as never);
    if (error) throw new Error(error.message);
    return Number(data ?? 0);
};

/**
 * [SCALE 10K] Busca dados de saude da frota de dispositivos
 * da tabela device_health (alimentada pelo HeartbeatManager).
 */
export const fetchDeviceHealth = async () => {
    const { data, error } = await supabase
        .from('device_health')
        .select('device_id, last_seen, app_version, storage_usage_percent, current_media_id')
        .order('last_seen', { ascending: false });

    if (error) {
        console.error('Erro ao buscar device_health:', error);
        return [];
    }

    return data || [];
};

/**
 * [SCALE 10K] Resumo da frota com inteligencia preditiva.
 * Analisa device_health para gerar contadores de alerta.
 */
export const fetchFleetSummary = async () => {
    const health = await fetchDeviceHealth();
    const now = Date.now();
    const FIVE_MINUTES = 5 * 60 * 1000;
    const THIRTY_MINUTES = 30 * 60 * 1000;

    let online = 0;
    let warning = 0;
    let offline = 0;
    const storageAlerts: typeof health = [];
    const versionAlerts: typeof health = [];
    const latestVersion = health.reduce((v, d) => d.app_version && d.app_version > v ? d.app_version : v, '0');

    for (const device of health) {
        const lastSeen = device.last_seen ? new Date(device.last_seen).getTime() : 0;
        const diff = now - lastSeen;

        if (diff < FIVE_MINUTES) online++;
        else if (diff < THIRTY_MINUTES) warning++;
        else offline++;

        if (device.storage_usage_percent && device.storage_usage_percent > 90) {
            storageAlerts.push(device);
        }
        if (device.app_version && device.app_version !== latestVersion) {
            versionAlerts.push(device);
        }
    }

    return { total: health.length, online, warning, offline, storageAlerts, versionAlerts, devices: health };
};

/**
 * [SECURITY HARDENING — FASE FUNDAÇÃO]
 * Envia um comando remoto para o dispositivo via remote_commands (caminho
 * OFICIAL consumido pelo player Android via Realtime CDC). O antigo caminho
 * `device_commands` era código morto: a tabela nunca existiu no banco e nada
 * consumia os comandos (P1 da auditoria — Dashboard → Android nunca chegava).
 *
 * O device_id (devices.id) é resolvido para o screen_id vinculado, e o
 * vocabulário de comando é traduzido para o que o player executa:
 *   REBOOT_APP     -> reboot
 *   CLEAR_CACHE    -> sync
 *   TAKE_SCREENSHOT-> screenshot
 */
export const sendRemoteCommand = async (deviceId: string, command: 'REBOOT_APP' | 'CLEAR_CACHE' | 'TAKE_SCREENSHOT') => {
    const commandMap: Record<string, string> = {
        REBOOT_APP: 'reboot',
        CLEAR_CACHE: 'sync',
        TAKE_SCREENSHOT: 'screenshot',
    };

    const { data: device, error: deviceError } = await supabase
        .from('devices')
        .select('id, screen_id')
        .eq('id', deviceId)
        .maybeSingle();

    if (deviceError) {
        console.error(`Erro ao resolver dispositivo ${deviceId}:`, deviceError);
        throw deviceError;
    }
    if (!device?.screen_id) {
        console.error(`Dispositivo ${deviceId} não encontrado ou sem tela vinculada.`);
        throw new Error('Dispositivo sem tela vinculada.');
    }

    const { error } = await supabase
        .from('remote_commands')
        .insert({
            screen_id: device.screen_id,
            command: commandMap[command] ?? 'reboot',
            status: 'pending'
        });

    if (error) {
        console.error(`Erro ao enviar comando ${command}:`, error);
        throw error;
    }
};