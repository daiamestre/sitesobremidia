import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { PlayerWidgets, WidgetConfig } from '@/components/player/PlayerWidgets';
import { usePlayerRealtime } from '@/hooks/usePlayerRealtime';
import { usePreventSleep } from '@/hooks/usePreventSleep';
import { useAuth } from '@/contexts/AuthContext';
import { ClockWidget } from '@/components/player/ClockWidget';
import { WeatherWidget } from '@/components/player/WeatherWidget';
import { RssWidget } from '@/components/player/RssWidget';
import { DualMediaLayer } from '@/components/player/DualMediaLayer';
import { usePlayerHeartbeat } from '@/hooks/usePlayerHeartbeat';
import { useOfflineCache } from '@/hooks/useOfflineCache';
import { useRemoteCommands } from '@/hooks/useRemoteCommands';
import { useMaintenance } from '@/hooks/useMaintenance';
import { ExternalLinkRenderer } from '@/components/player/ExternalLinkRenderer';
import { ScreenScaler } from '@/components/player/ScreenScaler';
import { DiagnosticOverlay } from '@/components/player/DiagnosticOverlay';
import { usePlaylistScheduler } from '@/hooks/usePlaylistScheduler';
import { WidgetDataProvider } from '@/contexts/WidgetDataContext';
import { useMediaPreloader } from '@/hooks/useMediaPreloader';
import { BootSequence } from '@/components/player/BootSequence';
import { Logo } from '@/components/Logo';


// ==========================================
// TYPES & INTERFACES
export type ContentType = 'media' | 'widget' | 'external_link';
// ==========================================



export interface MediaContent {
  id: string;
  name: string;
  file_url: string;
  file_type: string;
  mime_type: string;
  aspect_ratio: string;
}

export interface WidgetContent {
  id: string;
  name: string;
  widget_type: 'clock' | 'weather' | 'rss';
  config: {
    showDate?: boolean;
    showSeconds?: boolean;
    latitude?: number;
    longitude?: number;
    feedUrl?: string;
    maxItems?: number;
    scrollSpeed?: number;
    backgroundImage?: string;
    backgroundImageLandscape?: string;
    backgroundImagePortrait?: string;
  };
}

// ... (abrupt ending handled by tool logic matching TargetContent context)

export interface ExternalLinkContent {
  id: string;
  title: string;
  url: string;
  platform: string;
  embed_code: string | null;
}

export interface UnifiedPlaylistItem {
  id: string;
  position: number;
  duration: number;
  content_type: ContentType;
  media?: MediaContent | null;
  widget?: WidgetContent | null;
  external_link?: ExternalLinkContent | null;
  start_time?: string | null;
  end_time?: string | null;
  days?: number[] | null;
}

interface ScreenData {
  id: string;
  name: string;
  playlist_id: string | null;
  orientation: 'portrait' | 'landscape' | null;
  resolution: string | null;
  widget_config?: unknown;
  custom_id?: string | null;
}

// ==========================================
// CONSTANTS
// ==========================================

const PING_INTERVAL = 60000;
const MAX_VIDEO_DURATION = 3600;
const DEFAULT_IMAGE_DURATION = 10;
const DEFAULT_WIDGET_DURATION = 15;
const DEFAULT_LINK_DURATION = 30;
const VIDEO_FAILSAFE_BUFFER = 5;

// ==========================================
// HELPER: Embed URL
// ==========================================

const getEmbedUrl = (url: string, platform: string): string | null => {
  const platformLower = platform.toLowerCase();
  if (platformLower.includes('youtube')) {
    const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (match) return `https://www.youtube.com/embed/${match[1]}?autoplay=1&mute=1&loop=1&controls=0&showinfo=0`;
  }
  return null;
};

// ==========================================
// COMPONENT: MediaRenderer (Professional)
// ==========================================



// ==========================================
// MAIN COMPONENT: Player Engine
// ==========================================

export default function Player() {
  const { screenId } = useParams<{ screenId: string }>();
  // ------------------------------------------
  // STATE
  // ------------------------------------------
  const [screen, setScreen] = useState<ScreenData | null>(null);
  const [items, setItems] = useState<UnifiedPlaylistItem[]>([]);
  const [widgetConfig, setWidgetConfig] = useState<WidgetConfig>({
    clock: { enabled: false, showDate: true, showSeconds: false, position: 'bottom-left' },
    weather: { enabled: false, position: 'bottom-right' },
    rss: { enabled: false },
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const itemsRef = useRef<UnifiedPlaylistItem[]>([]);
  const screenRef = useRef<ScreenData | null>(null);
  const advanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { screenRef.current = screen; }, [screen]);

  usePreventSleep(true);

  // ------------------------------------------
  // SCHEDULING & PLAYBACK (Moved Up)
  // ------------------------------------------
  const {
    currentIndex,
    setCurrentIndex,
    currentItem,
    isScheduleValid,
    advance,
    getNextValidItem
  } = usePlaylistScheduler(items);

  // ------------------------------------------
  // DATA FETCHING
  // ------------------------------------------

  const fetchItems = useCallback(async (playlistId: string) => {
    // Strategy: Try fetching with scheduling columns. If it fails (due to migration missing), 
    // fallback to legacy fetch and allow playback without scheduling.

    const fetchWithQuery = async (selectQuery: string) => {
      return await supabase
        .from('playlist_items')
        .select(selectQuery)
        .eq('playlist_id', playlistId)
        .order('position', { ascending: true });
    };

    let result = await fetchWithQuery(`
      id, position, duration,
      media_id, widget_id, external_link_id,
      start_time, end_time, days,
      media:media_id(*),
      widget:widget_id(*),
      external_link:external_link_id(*)
    `);

    if (result.error && (result.error.code === '42703' || result.error.message?.includes('does not exist'))) {
      console.warn('[Player] Scheduling columns missing. Falling back to legacy mode.');
      result = await fetchWithQuery(`
        id, position, duration,
        media_id, widget_id, external_link_id,
        media:media_id(*),
        widget:widget_id(*),
        external_link:external_link_id(*)
      `);
    }

    if (result.error) {
      console.error('[Player] Error fetching items:', result.error);
      throw result.error;
    }

    return (result.data || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item: any) => {
        let contentType: ContentType | null = null;
        if (item.media_id && item.media) contentType = 'media';
        else if (item.widget_id && item.widget) contentType = 'widget';
        else if (item.external_link_id && item.external_link) contentType = 'external_link';

        if (!contentType) return null;

        return {
          id: item.id,
          position: item.position,
          duration: item.duration,
          content_type: contentType,
          media: item.media,
          widget: item.widget,
          external_link: item.external_link,
          start_time: item.start_time, // ok if undefined
          end_time: item.end_time,
          days: item.days,
        } as UnifiedPlaylistItem;
      })
      .filter((i): i is UnifiedPlaylistItem => i !== null);
  }, []);

  const reloadScreenEntry = useCallback(async () => {
    if (!screenId) return;
    // STRICT CUSTOM ID LOGIC
    // We no longer check for UUID. Everything is treated as a Custom ID (Uppercase).

    const query = supabase
      .from('screens')
      .select('id, name, playlist_id, orientation, resolution, widget_config, custom_id')
      .eq('custom_id', screenId.toUpperCase());

    const { data, error } = await query.maybeSingle();

    if (error || !data) {
      console.error('[Player] Error fetching screen:', error);
      console.error('[Player] Error fetching screen:', error);
      setError(`Tela não encontrada: ${screenId}`);
      return;
      return;
    }

    const prev = screenRef.current;
    if (prev && prev.playlist_id === data.playlist_id && prev.orientation === data.orientation) {
      // Soft update (config only)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setScreen(data as any);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setScreen(data as any);
    if (data.playlist_id) {
      try {
        const newItems = await fetchItems(data.playlist_id);
        setItems(newItems);
        // Only reset if first load or playlist changed
        if (!prev || prev.playlist_id !== data.playlist_id) setCurrentIndex(0);
      } catch (err) {
        console.error('[Player] Failed to load playlist items', err);
        // Don't set global error to allow retry or partial load? No, fail.
        setError('Erro ao carregar playlist');
      }
    }

    if (data.widget_config) setWidgetConfig(data.widget_config as WidgetConfig);

  }, [screenId, fetchItems]);

  useEffect(() => {
    setLoading(true);
    reloadScreenEntry()
      .catch(err => {
        console.error('Fatal player error:', err);
        setError('Erro fatal no player');
      })
      .finally(() => setLoading(false));
  }, [reloadScreenEntry]);

  // Realtime
  usePlayerRealtime({
    screenId: screen?.id || '',
    playlistId: screen?.playlist_id || '',
    onScreenUpdate: reloadScreenEntry,
    onPlaylistUpdate: async () => {
      if (screen?.playlist_id) {
        const newItems = await fetchItems(screen.playlist_id);
        if (JSON.stringify(newItems) !== JSON.stringify(itemsRef.current)) setItems(newItems);
      }
    },
    onScheduleUpdate: () => { }
  });

  usePlayerHeartbeat({
    screenId: screen?.id,
    currentItemId: currentItem?.id,
    status: error ? 'error' : 'playing'
  });

  useRemoteCommands({ screenId: screen?.id || '' });

  // Weekly Maintenance (Cache Clear)
  useMaintenance();

  // PRELOADER (Elite Performance)
  useMediaPreloader(items);


  // ------------------------------------------
  // PLAYBACK ENGINE
  // ------------------------------------------

  // ------------------------------------------
  // SCHEDULING & PLAYBACK
  // ------------------------------------------


  // Sync index on playlist load
  useEffect(() => {
    // If playlist changed drastically, reset? handled by fetchItems/setItems logic mostly.
    // Ensure we are pointing to a valid item or 0
    if (items.length > 0 && !items[currentIndex]) {
      setCurrentIndex(0);
    }
  }, [items, currentIndex, setCurrentIndex]);

  useEffect(() => {
    if (advanceTimeoutRef.current) {
      clearTimeout(advanceTimeoutRef.current);
      advanceTimeoutRef.current = null;
    }

    if (!currentItem) return;

    if (items.length === 1 && currentItem.content_type === 'media' && currentItem.media?.file_type === 'video' && isScheduleValid(currentItem)) {
      // Single Video Loop handled natively/DualMediaLayer
      return;
    }

    let duration = 0;
    const isVideo = currentItem.content_type === 'media' && currentItem.media?.file_type === 'video';

    // Check validity
    if (!isScheduleValid(currentItem)) {
      console.log('[Player] Current item invalid by schedule, skipping...');
      duration = 0.5; // fast skip
    } else if (isVideo) {
      duration = (currentItem.duration || MAX_VIDEO_DURATION) + VIDEO_FAILSAFE_BUFFER;
    } else {
      if (currentItem.content_type === 'widget') duration = currentItem.duration || DEFAULT_WIDGET_DURATION;
      else if (currentItem.content_type === 'external_link') duration = currentItem.duration || DEFAULT_LINK_DURATION;
      else duration = currentItem.duration || DEFAULT_IMAGE_DURATION;
    }

    duration = Math.max(3, duration);

    advanceTimeoutRef.current = setTimeout(() => {
      console.log(`[Player] Auto-advance (${isVideo ? 'Failsafe' : 'Timer'})`);
      advance();
    }, duration * 1000);

  }, [currentItem, items.length, advance, isScheduleValid]);

  // ------------------------------------------
  // LAYOUT ENGINE (Professional)
  // ------------------------------------------

  // 1. Detect Environment
  const isWindowPortrait = typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : false;
  const screenOrientation = screen?.orientation || (isWindowPortrait ? 'portrait' : 'landscape');

  // 4. Fullscreen Toggle
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(console.error);
    } else {
      document.exitFullscreen().catch(console.error);
    }
  }, []);

  // ------------------------------------------
  // RENDER
  // ------------------------------------------

  if (loading && items.length === 0) {
    return (
      <BootSequence
        onComplete={() => { /* Wait for data loads */ }}
        redirectOnComplete={false}
      />
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 space-y-6">
        <div className="w-20 h-20 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center">
          <Loader2 className="h-10 w-10 text-destructive rotate-45" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">{error}</h2>
          <p className="text-zinc-500 max-w-xs mx-auto">
            Verifique o ID informado ou a conexão com a internet.
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2 rounded-full border border-white/10 hover:bg-white/5 transition-colors text-sm font-medium"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!currentItem) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 space-y-8 relative overflow-hidden"
        style={{ background: 'var(--gradient-primary)' }}>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-white/5 rounded-full blur-[150px] animate-pulse" />

        <Logo className="opacity-50 grayscale-0 text-white drop-shadow-lg scale-150" size="lg" />

        <div className="text-center space-y-4 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary animate-pulse">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Player Conectado</span>
          </div>

          <div className="space-y-1">
            <h2 className="text-3xl font-display font-bold text-white/50">Aguardando Conteúdo</h2>
            <p className="text-zinc-600 text-sm">Adicione uma playlist a esta tela no dashboard.</p>
          </div>

          <div className="pt-8 flex flex-col items-center gap-2">
            <p className="text-[10px] text-zinc-700 uppercase tracking-[0.2em]">Identificação do Terminal</p>
            <code className="text-sm font-mono text-zinc-500 font-bold bg-white/5 px-4 py-2 rounded-lg border border-white/5">
              {screen?.custom_id || screen?.id || '---'}
            </code>
          </div>
        </div>
      </div>
    );
  }

  // (Moved up)

  const targetOrientation = screen?.orientation || 'landscape';

  return (
    <WidgetDataProvider>
      <ScreenScaler targetOrientation={targetOrientation} mode="STRETCH">
        <div
          className="w-full h-full bg-black cursor-none"
          onClick={toggleFullscreen}
        >
          {/* DIAGNOSTIC OVERLAY */}
          <DiagnosticOverlay
            screenId={screen?.id}
            orientation={screen?.orientation || 'Auto'}
          />

          {/* CONTENT LAYER */}
          {currentItem.content_type === 'media' && currentItem.media && (
            <DualMediaLayer
              item={currentItem}
              nextItem={getNextValidItem(currentIndex, items) || currentItem} // Pass anticipated next
              onFinished={() => { if (items.length > 1) advance(); }}
              onError={advance}
            />
          )}

          {currentItem.content_type === 'widget' && currentItem.widget && (
            <div className="w-full h-full flex items-center justify-center bg-zinc-900 relative overflow-hidden">
              <div className="relative z-10 w-full h-full flex items-center justify-center">
                {currentItem.widget.widget_type === 'clock' && (
                  <div className="w-full h-full animate-in fade-in zoom-in duration-500">
                    <ClockWidget
                      showDate={currentItem.widget.config.showDate}
                      showSeconds={currentItem.widget.config.showSeconds}
                      backgroundImage={
                        (targetOrientation === 'portrait'
                          ? currentItem.widget.config.backgroundImagePortrait
                          : currentItem.widget.config.backgroundImageLandscape)
                        || currentItem.widget.config.backgroundImage
                      }
                    />
                  </div>
                )}
                {currentItem.widget.widget_type === 'weather' && (
                  <div className="w-full h-full animate-in fade-in zoom-in duration-500">
                    <WeatherWidget
                      latitude={currentItem.widget.config.latitude}
                      longitude={currentItem.widget.config.longitude}
                      backgroundImage={
                        (targetOrientation === 'portrait'
                          ? currentItem.widget.config.backgroundImagePortrait
                          : currentItem.widget.config.backgroundImageLandscape)
                        || currentItem.widget.config.backgroundImage
                      }
                    />
                  </div>
                )}
                {currentItem.widget.widget_type === 'rss' && (
                  <RssWidget
                    feedUrl={currentItem.widget.config.feedUrl}
                    maxItems={currentItem.widget.config.maxItems}
                    scrollSpeed={currentItem.widget.config.scrollSpeed}
                    backgroundImage={
                      (targetOrientation === 'portrait'
                        ? currentItem.widget.config.backgroundImagePortrait
                        : currentItem.widget.config.backgroundImageLandscape)
                      || currentItem.widget.config.backgroundImage
                    }
                  />
                )}
              </div>
            </div>
          )}

          {currentItem.content_type === 'external_link' && currentItem.external_link && (
            <ExternalLinkRenderer
              url={currentItem.external_link.url}
              platform={currentItem.external_link.platform}
              embedCode={currentItem.external_link.embed_code}
            />
          )}
        </div>
      </ScreenScaler>
    </WidgetDataProvider>
  );
}
