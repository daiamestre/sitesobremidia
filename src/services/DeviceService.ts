import { supabase } from '@/integrations/supabase/client';

/**
 * Busca dispositivos que estão offline ou que não enviam heartbeat há mais de 120 segundos.
 * Ferramenta essencial para suporte proativo antes da reclamação do cliente.
 */
export const fetchAlertDevices = async () => {
    const { data, error } = await supabase
        .from('devices')
        .select('id, name, mac_address, last_heartbeat, is_online, storage_available, ram_usage')
        // Filtra dispositivos offline ou com heartbeat atrasado (limite de 2 minutos)
        .or(`is_online.eq.false,last_heartbeat.lt.${new Date(Date.now() - 120000).toISOString()}`)
        .order('last_heartbeat', { ascending: false });

    if (error) {
        console.error('Erro ao buscar alertas de dispositivos:', error);
        return [];
    }

    return data;
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
    let storageAlerts: typeof health = [];
    let versionAlerts: typeof health = [];
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
 * Envia um comando remoto para o dispositivo via Action Queue.
 */
export const sendRemoteCommand = async (deviceId: string, command: 'REBOOT_APP' | 'CLEAR_CACHE' | 'TAKE_SCREENSHOT') => {
    const { error } = await supabase
        .from('device_commands')
        .insert({
            device_id: deviceId,
            command: command,
            status: 'PENDING'
        });

    if (error) {
        console.error(`Erro ao enviar comando ${command}:`, error);
        throw error;
    }
};
