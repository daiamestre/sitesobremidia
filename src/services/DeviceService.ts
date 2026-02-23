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
