import { useEffect, useRef, useState, useCallback } from 'react';
import { sessionManager } from '../services/apiService';

export interface UseVePlayerOptions {
  sessId?: string | null;
  tableId?: string;
  enabled?: boolean;
  containerId?: string;
  videoUrl?: string | null; // Optional: Video URL from API
}

export interface UseVePlayerReturn {
  player: any;
  isLoading: boolean;
  error: string | null;
  isPlaying: boolean; // Track if video is actually playing
}

// Stream ID mapping based on table ID
// Pattern: CF01 = 1011, CF02+ = 10X1 (where X is table number)
const getStreamId = (tableId: string): string => {
  const mapping: Record<string, string> = {
    'CF01': '1011',  // Special case: CF01 = 1011
    'CF02': '1021',  // CF02 = 1021
    'CF03': '1031',  // CF03 = 1031
    'CF04': '1041',  // CF04 = 1041
    'CF05': '1051',  // CF05 = 1051
    'CF06': '1061'   // CF06 = 1061
  };

  // If mapping exists, return it
  if (mapping[tableId]) {
    return mapping[tableId];
  }

  return tableId;
};

// Generate stream URLs with proper query parameters
// Order: FLV -> HLS (RTM disabled by request)
const getStreamUrls = (streamId: string, sessId: string, apiVideoUrl?: string | null) => {
  // If API provided a video URL, use it as primary
  if (apiVideoUrl) {
    return {
      flv: apiVideoUrl,
      hls: apiVideoUrl
    };
  }

  // Construct URLs from stream ID
    // Format: ?sessId={sessId}
  const baseUrl = 'https://pulldev.jhf8888.com/tgglive';  //ho8
  //const baseUrl = 'https://pullstaging.jhf8888.com/tgglive'; //sky3
  //const baseUrl = 'https://pullvideo.jhf8888.com/tgglive'; //PROD
  //const baseUrl = 'https://pullua.jhf8888.com/tgglive'; //9FSSB

  // FLV URL - FLV protocol (faster than HLS, primary for desktop)
  // Format: {streamId}.flv?sessId={sessId}
  const flvUrl = `${baseUrl}/${streamId}.flv?sessId=${encodeURIComponent(sessId)}`;

  // HLS URL - HLS protocol (for iOS compatibility)
  // Format: {streamId}.m3u8?sessId={sessId}
  const hlsUrl = `${baseUrl}/${streamId}.m3u8?sessId=${encodeURIComponent(sessId)}`;

  return {
    flv: flvUrl,  // FLV protocol (secondary for desktop - faster than HLS)
    hls: hlsUrl   // HLS protocol (fallback)
  };
};

/**
 * VePlayer React Hook
 * Initializes and manages VePlayer live streaming instance
 */
export function useVePlayer({
  sessId: propSessId,
  tableId = 'CF01',
  enabled = true,
  containerId = 'veplayer-container',
  videoUrl: apiVideoUrl
}: UseVePlayerOptions): UseVePlayerReturn {
  const playerRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const error: string | null = null;
  const [isPlaying, setIsPlaying] = useState(false); // Track if video is actually playing
  const retryCountRef = useRef(0);
  const isDestroyingRef = useRef(false); // Track if player is being destroyed

  // Get session ID from prop or session manager
  const getSessionId = useCallback((): string | null => {
    return propSessId || sessionManager.getSessionId();
  }, [propSessId]);

  // Initialize VePlayer
  const initializePlayer = useCallback(async () => {
    // Check if VePlayer is available
    if (typeof window === 'undefined' || typeof window.VePlayer === 'undefined') {
      setTimeout(() => initializePlayer(), 1000);
      return;
    }

    // Get auth session ID (may be missing on iOS/private mode)
    const authSessId = getSessionId();
    const streamSessId = authSessId;

    // Check if container exists
    const container = document.getElementById(containerId);
    if (!container) {
      setTimeout(() => initializePlayer(), 1000);
      return;
    }

    try {
      // Clean up old instance
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        isDestroyingRef.current = true;
        try {
          playerRef.current.pause?.();
          // Stop all network requests before destroying
          if (playerRef.current.stopLoad) {
            playerRef.current.stopLoad();
          }
          playerRef.current.destroy();
        } catch (e) {
        } finally {
          isDestroyingRef.current = false;
        }
      }
      playerRef.current = null;
      setIsPlaying(false); // Reset playing state when reinitializing

      // Get stream ID and URLs
      const streamId = getStreamId(tableId);
      const urls = getStreamUrls(streamId, streamSessId || '', apiVideoUrl);

      // Clear container
      container.innerHTML = '';

      // Order: FLV first, then HLS
      // If MSE is not available, skip FLV (it depends on MSE) and try HLS only.
      const playlistDefinitions = [urls.flv, urls.hls];

      // FLV first, then HLS as fallback
      const fallbackOrder = ['flv', 'hls'];

      // Create player
      const player = await window.VePlayer.createLivePlayer({
        id: containerId,
        playlist: [
          {
            definitions: playlistDefinitions
          }
        ],
        fallback: {
          fallbackOrder: fallbackOrder,
        },
        //poster: './waiting.png',
        flv: {
          loadTimeout: 5000,
          retryCount: 100,
          retryDelay: 1000,
          enabledLowLatency: true,
          lowLatency: {
            enableFrameChasing: true,
          },
          maxReaderInterval: 5000,
          seamlesslyReload: true,
        },
        infoPanel: {
          visible: false,
        },
        videoFillMode: 'fillHeight',
        closeVideoClick: true,
        codec: 'h264',
        // iOS requires muted autoplay; also enables auto-resume after reconnect.
        autoplay: { muted: true },
        ignores: ['autoplayPlugin'],
        playsinline: true,
        fluid: true,
        logger: {
          appId: '861950',
        },
        mobile: {
          gradient: 'none',
        },
        volume: 1
      });

      // Event listeners
      if (player.on) {
        player.on('error', () => {
          // Set isPlaying to false on error - video is not playing
          setIsPlaying(false);
          setTimeout(() => {
            if (!isDestroyingRef.current) {
              initializePlayer();
            }
          }, 2500);

          // Never set error state - always keep trying automatically
        });

        player.on('playing', () => {
          retryCountRef.current = 0;
          setIsLoading(false);
          setIsPlaying(true); // Video is now playing
        });

        player.on('waiting', () => {
          setIsLoading(true);
          // Don't set isPlaying to false on waiting - video might still be available
        });

        player.on('pause', () => {
          // iOS / mobile browsers may pause playback after reconnect/visibility changes.
          // Attempt to resume automatically (muted autoplay allows this).
          if (document.visibilityState !== 'visible') return;
          setTimeout(() => {
            if (isDestroyingRef.current) return;
            (player as any).play?.();
          }, 200);
        });

        player.on('ready', () => {
          setIsLoading(false);
          // Video is ready but might not be playing yet
        });

        player.on('loadedmetadata', () => {
        });
      } else {
      }

      playerRef.current = player;
      setIsLoading(false);
      retryCountRef.current = 0;

    } catch (err: any) {
      // Silent retry - don't show errors to user
      if (isDestroyingRef.current) {
        return;
      }

      setTimeout(() => {
        initializePlayer();
      }, 1000);
    }
  }, [containerId, tableId, getSessionId, apiVideoUrl]);

  // Initialize when enabled and dependencies are ready
  useEffect(() => {
    if (!enabled) return;

    // Reset retry count when starting fresh
    retryCountRef.current = 0;
    initializePlayer();

    // Cleanup
    return () => {
      isDestroyingRef.current = true;

      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        try {
          playerRef.current.pause?.();
          // Stop all network requests before destroying
          if (playerRef.current.stopLoad) {
            playerRef.current.stopLoad();
          }
          playerRef.current.destroy();
        } catch (e) {
        }
      }

      playerRef.current = null;
      retryCountRef.current = 0;
      isDestroyingRef.current = false;
      setIsPlaying(false); // Reset playing state on cleanup
    };
  }, [enabled, initializePlayer]);

  return {
    player: playerRef.current,
    isLoading,
    error,
    isPlaying
  };
}

