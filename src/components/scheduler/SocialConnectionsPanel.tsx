import { useState, useEffect } from 'react';
import { 
  Link2, 
  Unlink, 
  ExternalLink, 
  Loader2, 
  CheckCircle2, 
  XCircle,
  RefreshCw 
} from 'lucide-react';
import { SOCIAL_PLATFORMS, type SocialPlatformId } from '@/config/constants';
import { API_ENDPOINTS, getJsonHeaders, getAuthHeaders } from '@/config/api';
import { cn } from '@/components/ui/utils';

interface PlatformConnection {
  platformId: SocialPlatformId;
  isConnected: boolean;
  username?: string;
  connectedAt?: string;
}

interface SocialConnectionsPanelProps {
  onConnectionChange?: () => void;
}

export function SocialConnectionsPanel({ onConnectionChange }: SocialConnectionsPanelProps) {
  const [connections, setConnections] = useState<Record<string, PlatformConnection>>({});
  const [loading, setLoading] = useState(true);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load connection status
  const loadConnections = async () => {
    try {
      setLoading(true);
      const response = await fetch(API_ENDPOINTS.social.status, {
        headers: getAuthHeaders(),
      });
      
      if (response.ok) {
        const data = await response.json();
        setConnections(data.platforms || {});
      }
    } catch (err) {
      console.error('Failed to load connections:', err);
      setError('Failed to load connection status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConnections();
  }, []);

  // Start OAuth flow
  const handleConnect = async (platformId: SocialPlatformId) => {
    try {
      setConnectingPlatform(platformId);
      setError(null);
      
      const response = await fetch(API_ENDPOINTS.social.connect(platformId), {
        headers: getAuthHeaders(),
      });
      
      if (!response.ok) {
        throw new Error('Failed to get auth URL');
      }
      
      const data = await response.json();
      
      if (data.authUrl) {
        // Open OAuth in popup or redirect
        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        
        const popup = window.open(
          data.authUrl,
          `Connect ${platformId}`,
          `width=${width},height=${height},left=${left},top=${top}`
        );
        
        // For demo purposes, also offer mock connect
        if (!popup || popup.closed) {
          // Popup blocked, offer mock connect instead
          await handleMockConnect(platformId);
        }
      }
    } catch (err) {
      setError(`Failed to connect ${platformId}`);
      console.error('Connect error:', err);
    } finally {
      setConnectingPlatform(null);
    }
  };

  // Mock connect for development
  const handleMockConnect = async (platformId: SocialPlatformId) => {
    try {
      setConnectingPlatform(platformId);
      
      const response = await fetch(`${API_ENDPOINTS.social.connect(platformId).replace('/connect', '/mock-connect')}`, {
        method: 'POST',
        headers: getJsonHeaders(),
        body: JSON.stringify({ username: `@th3scr1b3_${platformId}` }),
      });
      
      if (response.ok) {
        await loadConnections();
        onConnectionChange?.();
      } else {
        throw new Error('Mock connect failed');
      }
    } catch (err) {
      setError(`Failed to connect ${platformId}`);
    } finally {
      setConnectingPlatform(null);
    }
  };

  // Disconnect platform
  const handleDisconnect = async (platformId: SocialPlatformId) => {
    try {
      setConnectingPlatform(platformId);
      
      const response = await fetch(API_ENDPOINTS.social.disconnect(platformId), {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      
      if (response.ok) {
        await loadConnections();
        onConnectionChange?.();
      }
    } catch (err) {
      setError(`Failed to disconnect ${platformId}`);
    } finally {
      setConnectingPlatform(null);
    }
  };

  const platforms = Object.entries(SOCIAL_PLATFORMS) as [SocialPlatformId, typeof SOCIAL_PLATFORMS[SocialPlatformId]][];
  const connectedCount = Object.values(connections).filter(c => c.isConnected).length;

  if (loading) {
    return (
      <div className="bg-white/5 rounded-xl p-6 border border-white/10">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
          <span className="ml-2 text-purple-200">Loading connections...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <div>
          <h3 className="text-white font-medium flex items-center gap-2">
            <Link2 className="w-4 h-4 text-purple-400" />
            Connected Accounts
          </h3>
          <p className="text-purple-300 text-xs mt-1">
            {connectedCount} of {platforms.length} platforms connected
          </p>
        </div>
        <button
          onClick={loadConnections}
          className="p-2 text-purple-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-red-500/20 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Platform List */}
      <div className="p-4 space-y-3">
        {platforms.map(([id, platform]) => {
          const connection = connections[id];
          const isConnected = connection?.isConnected;
          const isLoading = connectingPlatform === id;

          return (
            <div
              key={id}
              className={cn(
                'flex items-center justify-between p-3 rounded-lg border transition-colors',
                isConnected 
                  ? 'bg-green-500/10 border-green-500/30' 
                  : 'bg-white/5 border-white/10'
              )}
            >
              <div className="flex items-center gap-3">
                {/* Platform Icon */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                  style={{ backgroundColor: platform.color }}
                >
                  {platform.name.charAt(0)}
                </div>
                
                {/* Platform Info */}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">{platform.name}</span>
                    {isConnected && (
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                    )}
                  </div>
                  {isConnected && connection.username ? (
                    <span className="text-green-300 text-sm">{connection.username}</span>
                  ) : (
                    <span className="text-gray-400 text-sm">Not connected</span>
                  )}
                </div>
              </div>

              {/* Action Button */}
              <div className="flex items-center gap-2">
                {isConnected ? (
                  <button
                    onClick={() => handleDisconnect(id)}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-3 py-2 text-red-300 hover:text-red-200 hover:bg-red-500/20 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Unlink className="w-4 h-4" />
                    )}
                    <span className="text-sm">Disconnect</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleMockConnect(id)}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-3 py-2 bg-purple-500/20 text-purple-200 hover:bg-purple-500/30 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ExternalLink className="w-4 h-4" />
                    )}
                    <span className="text-sm">Connect</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Info Footer */}
      <div className="px-4 py-3 bg-white/5 border-t border-white/10">
        <p className="text-purple-300 text-xs">
          💡 Connect your social accounts to enable automatic posting. 
          For development, use "Connect" to simulate a connection.
        </p>
      </div>
    </div>
  );
}

export default SocialConnectionsPanel;
