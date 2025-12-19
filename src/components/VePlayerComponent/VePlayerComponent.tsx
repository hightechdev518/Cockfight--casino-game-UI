import { useEffect } from 'react';
import { useVePlayer } from '../../hooks/useVePlayer';
import { sessionManager } from '../../services/apiService';
import './VePlayerComponent.css';

export interface VePlayerComponentProps {
  sessId?: string | null;
  tableId?: string;
  enabled?: boolean;
  containerId?: string;
  videoUrl?: string | null; // Optional: Video URL from API
  onPlayingChange?: (isPlaying: boolean) => void; // Callback when playing state changes
}

/**
 * VePlayer React Component
 * Wraps the VePlayer hook and renders the video container
 */
export function VePlayerComponent({ 
  sessId: propSessId,
  tableId = 'CF01', 
  enabled = true,
  containerId = 'veplayer-container',
  videoUrl,
  onPlayingChange
}: VePlayerComponentProps) {
  // Get session ID from prop or session manager
  const sessId = propSessId || sessionManager.getSessionId();
  
  // Generate unique container ID based on tableId to avoid conflicts
  const uniqueContainerId = containerId || `veplayer-container-${tableId || 'default'}`;

  const { isLoading, error, isPlaying } = useVePlayer({
    sessId,
    tableId,
    enabled,
    containerId: uniqueContainerId,
    videoUrl
  });

  // Show spinner when loading or when there's an error (signal is bad)
  // Video will show last frame underneath
  const showSpinner = isLoading || error !== null;

  // Notify parent when playing state changes
  useEffect(() => {
    if (onPlayingChange) {
      onPlayingChange(isPlaying);
    }
  }, [isPlaying, onPlayingChange]);

  return (
    <div className="veplayer-wrapper">
      {/* Video container - always visible to show last frame */}
      <div 
        id={uniqueContainerId} 
        className="veplayer-container"
        style={{ 
          width: '100%', 
          height: '100%',
          minWidth: '100%',
          minHeight: '100%',
          position: 'absolute',
          top: 0,
          left: 0
        }}
      />
      
      {/* Spinner overlay - shows when signal is bad (loading or error) */}
      {/* Video stays visible underneath showing last frame */}
      {showSpinner && (
        <div className="veplayer-loading-overlay">
          <div className="veplayer-spinner"></div>
        </div>
      )}
    </div>
  );
}

export default VePlayerComponent;

