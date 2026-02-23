export type Playlist = {
    id: string;
    name: string;
    description: string | null;
    is_active: boolean;
    created_at: string;
    updated_at?: string;
    company_id?: string;
    cover_url?: string | null;
    // Computed properties
    item_count?: number;
    total_duration?: number;
    resolution?: string;
};

export type MediaType = 'image' | 'video' | 'website' | 'youtube' | 'audio';

export type Media = {
    id: string;
    name: string;
    file_path: string;
    file_url: string;
    file_type: MediaType;
    thumbnail_url?: string | null;
    duration?: number;
    created_at: string;
    file_size?: number;
    mime_type?: string;
    aspect_ratio?: string;
};

export interface ExternalLink {
    id: string;
    title: string;
    url: string;
    platform: string;
    thumbnail_url: string | null;
    is_active?: boolean;
}

export type WidgetType = 'clock' | 'weather' | 'rss';

export interface WidgetConfig {
    // Common
    backgroundImage?: string | null;
    backgroundImageLandscape?: string | null;
    backgroundImagePortrait?: string | null;
    position?: string;

    // Clock
    showDate?: boolean;
    showSeconds?: boolean;

    // Weather
    latitude?: number;
    longitude?: number;

    // RSS
    feedUrl?: string;
    maxItems?: number;
    scrollSpeed?: number;
    variant?: 'full' | 'compact';
}

export type Widget = {
    id: string;
    name: string;
    widget_type: WidgetType;
    config: WidgetConfig;
    is_active: boolean;
    thumbnail_url?: string | null;
    created_at?: string;
    user_id?: string;
};

export type PlaylistItem = {
    id: string;
    playlist_id: string;
    media_id: string | null;
    widget_id: string | null;
    external_link_id: string | null;
    position: number;
    duration: number;
    created_at: string;
    media?: Media | null;
    widget?: Widget | null;
    external_link?: ExternalLink | null;
    start_time?: string | null;
    end_time?: string | null;
    days?: number[] | null;
};

export type ScreenStatus = 'online' | 'offline' | 'playing' | 'error';
export type ScreenOrientation = 'landscape' | 'portrait';

export type Screen = {
    id: string;
    name: string;
    description?: string | null;
    location?: string | null;
    orientation: ScreenOrientation;
    playlist_id?: string | null;
    last_ping_at?: string | null;
    ip_address?: string | null;
    version?: string | null;
    is_active: boolean;
    created_at: string;
    status?: ScreenStatus; // Computed
    playlist?: Playlist | null; // Joined playlist
    custom_id?: string | null;
    resolution?: string;
    audio_enabled?: boolean;
};

export type RemoteCommandType = 'reload' | 'reboot' | 'screenshot';

export type RemoteCommand = {
    id: string;
    screen_id: string;
    command: RemoteCommandType;
    payload?: any;
    status: 'pending' | 'executed' | 'failed';
    created_at: string;
    executed_at?: string | null;
};
