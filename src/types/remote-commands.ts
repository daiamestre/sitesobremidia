export type RemoteCommandType = 'reload' | 'reboot' | 'screenshot';
export type RemoteCommandStatus = 'pending' | 'executed' | 'failed';

export interface RemoteCommand {
    id: string;
    screen_id: string;
    command: RemoteCommandType;
    payload?: unknown;
    status: RemoteCommandStatus;
    created_at: string;
    executed_at?: string | null;
    created_by?: string;
}
