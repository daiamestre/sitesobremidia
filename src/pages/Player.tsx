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
import { ExternalLinkRenderer } from '@/components/player/ExternalLinkRenderer';


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

  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currentItem = items[currentIndex];

  // Refs
  const itemsRef = useRef<UnifiedPlaylistItem[]>([]);
  const screenRef = useRef<ScreenData | null>(null);
  const advanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { screenRef.current = screen; }, [screen]);

  usePreventSleep(true);

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
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const isUUID = uuidRegex.test(screenId);

    let query = supabase.from('screens').select('id, name, playlist_id, orientation, resolution, widget_config, custom_id');
    if (isUUID) query = query.eq('id', screenId);
    else query = query.eq('custom_id', screenId);

    const { data, error } = await query.maybeSingle();

    if (error || !data) {
      console.error('[Player] Error fetching screen:', error);
      setError('Tela não encontrada');
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

  useRemoteCommands({ screenId: screen?.id || '' });


  // ------------------------------------------
  // PLAYBACK ENGINE
  // ------------------------------------------

  // ------------------------------------------
  // SCHEDULING LOGIC
  // ------------------------------------------

  const isScheduleValid = useCallback((item: UnifiedPlaylistItem) => {
    // If no schedule set, it's always valid
    if (!item.start_time && !item.end_time && (!item.days || item.days.length === 0)) return true;

    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday
    const currentTime = now.getHours() * 60 + now.getMinutes();

    // Check Days
    if (item.days && item.days.length > 0 && !item.days.includes(currentDay)) return false;

    // Check Time
    if (item.start_time && item.end_time) {
      const parseTime = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
      };
      const start = parseTime(item.start_time);
      const end = parseTime(item.end_time);

      if (start <= end) {
        // Normal range (e.g. 08:00 to 18:00)
        if (currentTime < start || currentTime >= end) return false;
      } else {
        // Overnight range (e.g. 22:00 to 06:00)
        // Valid if after start OR before end
        if (currentTime < start && currentTime >= end) return false;
      }
    }

    return true;
  }, []);

  const handleNext = useCallback(() => {
    setItems(currentItems => {
      if (currentItems.length === 0) return currentItems;

      let nextIndex = (currentIndex + 1) % currentItems.length;
      let attempts = 0;

      // Find next valid item
      while (attempts < currentItems.length) {
        const nextItem = currentItems[nextIndex];
        if (isScheduleValid(nextItem)) {
          if (nextIndex !== currentIndex) setCurrentIndex(nextIndex);
          return currentItems;
        }
        nextIndex = (nextIndex + 1) % currentItems.length;
        attempts++;
      }

      // No valid items found?
      // Stay on current if valid, else go to 0 (or stay on placeholder)
      // Ideally we shouldn't play anything if nothing is valid.
      // But for now, let's just cycle or stay put.
      console.warn('[Player] No scheduled content available at this time.');
      return currentItems;
    });
  }, [currentIndex, isScheduleValid]);



  useEffect(() => {
    if (advanceTimeoutRef.current) {
      clearTimeout(advanceTimeoutRef.current);
      advanceTimeoutRef.current = null;
    }

    if (!currentItem) return;

    if (items.length === 1 && currentItem.content_type === 'media' && currentItem.media?.file_type === 'video' && isScheduleValid(currentItem)) {
      // Single Video Loop handled by <video loop> in CSS/DOM if implemented, 
      // but here we use the MediaRenderer logic which defaults to false loop and calls onFinished.
      // Special case: we don't set a timeout, we wait for onFinished to re-trigger or just let it loop natively.
      // Implementation choice: Let native loop handle it if single item.
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
      handleNext();
    }, duration * 1000);

  }, [currentItem, items.length, handleNext, isScheduleValid]);

  // ------------------------------------------
  // LAYOUT ENGINE (Professional)
  // ------------------------------------------

  // 1. Detect Environment
  const isWindowPortrait = typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : false;

  // 2. Detect Config
  const screenOrientation = screen?.orientation || (isWindowPortrait ? 'portrait' : 'landscape');

  // 3. Calculate Rotation Requirement
  // Rotation is needed ONLY if the Physical Window assumes Landscape but the Config implies Portrait Mode (Vertical Monitor)
  const isRotationNeeded = screenOrientation === 'portrait' && !isWindowPortrait;

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
    // Return black screen instead of loader for "High End Signal" feel
    // Initial fetch is usually fast enough, or we just wait in black.
    return <div className="min-h-screen bg-black" />;
  }

  if (error) {
    return <div className="min-h-screen bg-black text-white flex items-center justify-center font-mono">{error}</div>;
  }

  if (!currentItem) {
    return <div className="min-h-screen bg-black text-white/40 flex items-center justify-center">Sigage Player Ready</div>;
  }

  return (
    <div
      className="fixed inset-0 bg-black overflow-hidden cursor-none" // cursor-none for production feel
      onClick={toggleFullscreen}
    >
      {/* LOGICAL CONTAINER */}
      {/* This div is the 'virtual screen'. It is mathematically transformed to fit the physical screen. */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          // DIMENSION SWAPPING MAGIC
          // If rotation is needed, Width becomes Height (dvh) and Height becomes Width (dvw)
          width: isRotationNeeded ? '100dvh' : '100dvw',
          height: isRotationNeeded ? '100dvw' : '100dvh',
          transform: `translate(-50%, -50%) ${isRotationNeeded ? 'rotate(-90deg)' : 'rotate(0deg)'}`,
          transformOrigin: 'center center',
          backgroundColor: '#000',
          transition: 'transform 0.5s ease-in-out, width 0.5s, height 0.5s'
        }}
      >
        {/* CONTENT LAYER */}
        {currentItem.content_type === 'media' && currentItem.media && (
          <DualMediaLayer
            item={currentItem}
            nextItem={(() => {
              let nextIdx = (currentIndex + 1) % items.length;
              let attempts = 0;
              while (attempts < items.length) {
                if (isScheduleValid(items[nextIdx])) return items[nextIdx];
                nextIdx = (nextIdx + 1) % items.length;
                attempts++;
              }
              return items[(currentIndex + 1) % items.length]; // Fallback
            })()}
            onFinished={() => { if (items.length > 1) handleNext(); }}
            onError={handleNext}
          />
        )}

        {currentItem.content_type === 'widget' && currentItem.widget && (
          <div className="w-full h-full flex items-center justify-center bg-zinc-900 relative overflow-hidden">
            {/* Background Gradient for Widgets */}
            {/* Background Gradient for Widgets - Removed for full clarity */}
            {/* <div className="absolute inset-0 bg-gradient-to-br from-black via-zinc-900 to-black opacity-50" /> */}

            <div className="relative z-10 w-full h-full flex items-center justify-center">
              {currentItem.widget.widget_type === 'clock' && (
                <div className="w-full h-full">
                  <ClockWidget
                    showDate={currentItem.widget.config.showDate}
                    showSeconds={currentItem.widget.config.showSeconds}
                    backgroundImage={
                      (screenOrientation === 'portrait'
                        ? currentItem.widget.config.backgroundImagePortrait
                        : currentItem.widget.config.backgroundImageLandscape)
                      || currentItem.widget.config.backgroundImage
                    }
                  />
                </div>
              )}
              {currentItem.widget.widget_type === 'weather' && (
                <div className="w-full h-full">
                  <WeatherWidget
                    latitude={currentItem.widget.config.latitude}
                    longitude={currentItem.widget.config.longitude}
                    backgroundImage={
                      (screenOrientation === 'portrait'
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
                    (screenOrientation === 'portrait'
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
    </div>
  );
}
