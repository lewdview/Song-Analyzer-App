import { SOCIAL_PLATFORMS, type SocialPlatformId } from '@/config/constants';
import { cn } from '@/components/ui/utils';
import { Check } from 'lucide-react';

// Platform icons (using simple circles with letters as fallback)
const PlatformIcon = ({ platform }: { platform: typeof SOCIAL_PLATFORMS[SocialPlatformId] }) => {
  const iconClass = "w-5 h-5";
  
  // You would typically use actual SVG icons here
  // For now, using first letter as placeholder
  return (
    <div 
      className={cn(
        "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
      )}
      style={{ backgroundColor: platform.color }}
    >
      {platform.name.charAt(0)}
    </div>
  );
};

interface PlatformSelectorProps {
  selected: SocialPlatformId[];
  onChange: (platforms: SocialPlatformId[]) => void;
  disabled?: boolean;
  showOnlyConnected?: boolean;
  connectedPlatforms?: SocialPlatformId[];
}

export function PlatformSelector({
  selected,
  onChange,
  disabled = false,
  showOnlyConnected = false,
  connectedPlatforms = [],
}: PlatformSelectorProps) {
  const platforms = Object.entries(SOCIAL_PLATFORMS) as [SocialPlatformId, typeof SOCIAL_PLATFORMS[SocialPlatformId]][];
  
  const filteredPlatforms = showOnlyConnected
    ? platforms.filter(([id]) => connectedPlatforms.includes(id))
    : platforms;

  const togglePlatform = (platformId: SocialPlatformId) => {
    if (disabled) return;
    
    if (selected.includes(platformId)) {
      onChange(selected.filter(id => id !== platformId));
    } else {
      onChange([...selected, platformId]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {filteredPlatforms.map(([id, platform]) => {
        const isSelected = selected.includes(id);
        const isConnected = !showOnlyConnected || connectedPlatforms.includes(id);
        
        return (
          <button
            key={id}
            type="button"
            onClick={() => togglePlatform(id)}
            disabled={disabled || !isConnected}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg border transition-all',
              isSelected
                ? 'bg-purple-500/20 border-purple-400 text-white'
                : 'bg-white/5 border-white/10 text-purple-200 hover:border-white/20',
              disabled && 'opacity-50 cursor-not-allowed',
              !isConnected && 'opacity-30'
            )}
            aria-pressed={isSelected}
            aria-label={`${isSelected ? 'Remove' : 'Add'} ${platform.name}`}
          >
            <PlatformIcon platform={platform} />
            <span className="text-sm">{platform.name}</span>
            {isSelected && (
              <Check className="w-4 h-4 text-purple-400" />
            )}
          </button>
        );
      })}
    </div>
  );
}

interface PlatformBadgeProps {
  platformId: SocialPlatformId;
  showName?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function PlatformBadge({ platformId, showName = false, size = 'md' }: PlatformBadgeProps) {
  const platform = SOCIAL_PLATFORMS[platformId];
  if (!platform) return null;

  const sizeClasses = {
    sm: 'w-4 h-4 text-[8px]',
    md: 'w-6 h-6 text-xs',
    lg: 'w-8 h-8 text-sm',
  };

  return (
    <div className="flex items-center gap-1">
      <div
        className={cn(
          'rounded-full flex items-center justify-center font-bold text-white',
          sizeClasses[size]
        )}
        style={{ backgroundColor: platform.color }}
        title={platform.name}
      >
        {platform.name.charAt(0)}
      </div>
      {showName && (
        <span className="text-sm text-purple-200">{platform.name}</span>
      )}
    </div>
  );
}

export default PlatformSelector;
