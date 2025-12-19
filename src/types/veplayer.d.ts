// VePlayer TypeScript definitions
declare global {
  interface Window {
    VePlayer: {
      createLivePlayer(config: VePlayerConfig): Promise<VePlayerInstance>;
    };
  }
}

interface VePlayerConfig {
  id: string;
  poster?: string;
  playlist?: Array<{
    definitions: string[];
  }>;
  url?: string;
  fallback?: {
    fallbackOrder: string[];
  };
  rtm?: {
    loadTimeout?: number;
    retryCount?: number;
    retryDelay?: number;
    networkEvaluateInterval?: number;
    seamlesslyReload?: boolean;
    disconnectTime?: number;
    delayHint?: number;
    checkStatsErrorDelay?: number;
  };
  flv?: {
    loadTimeout?: number;
    retryCount?: number;
    retryDelay?: number;
    enabledLowLatency?: boolean;
    lowLatency?: {
      enableFrameChasing?: boolean;
    };
    maxReaderInterval?: number;
    seamlesslyReload?: boolean;
  };
  hls?: {
    enableWorker?: boolean;
    lowLatencyMode?: boolean;
    maxBufferLength?: number;
    maxMaxBufferLength?: number;
    maxBufferSize?: number;
    maxBufferHole?: number;
    highBufferWatchdogPeriod?: number;
    nudgeOffset?: number;
    nudgeMaxRetry?: number;
    maxFragLoadingTimeMs?: number;
    fragLoadingTimeOut?: number;
    manifestLoadingTimeOut?: number;
    levelLoadingTimeOut?: number;
    backBufferLength?: number;
  };
  infoPanel?: {
    visible: boolean;
  };
  videoFillMode?: 'auto' | 'cover' | 'fillHeight' | 'fillWidth' | 'fill';
  closeVideoClick?: boolean;
  codec?: 'h264' | 'h265';
  autoplay?: boolean | { muted: boolean };
  playsinline?: boolean;
  fluid?: boolean;
  logger?: {
    appId: string;
    userId?: string;
  };
  mobile?: {
    gradient?: string;
  };
  volume?: number;
  ignores?: string[];
}

interface VePlayerInstance {
  pause(): void;
  destroy(): void;
  on?(event: string, callback: (data?: any) => void): void;
  off?(event: string, callback: (data?: any) => void): void;
}

export {};

