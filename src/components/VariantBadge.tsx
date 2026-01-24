import React from 'react';
import { Lock, Zap, Music } from 'lucide-react';

interface VariantBadgeProps {
  unlockableCount?: number;
  variantType?: string;
  variantGroupId?: string;
  hasUnlockableVariants?: boolean;
}

/**
 * VariantBadge Component - Displays unlockable variant indicator badge
 */
export const VariantBadge: React.FC<VariantBadgeProps> = ({
  unlockableCount = 0,
  variantType = 'original',
  variantGroupId,
  hasUnlockableVariants = false,
}) => {
  if (!hasUnlockableVariants || unlockableCount === 0) {
    return null;
  }

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-400/30 hover:border-purple-400/60 transition-colors group cursor-pointer">
      <Lock className="w-4 h-4 text-purple-400" />
      <span className="text-sm font-medium text-purple-300">
        +{unlockableCount} variant{unlockableCount !== 1 ? 's' : ''}
      </span>
    </div>
  );
};

/**
 * VariantTypeIcon Component - Icon for variant type
 */
export const VariantTypeIcon: React.FC<{ type: string; className?: string }> = ({
  type,
  className = 'w-4 h-4',
}) => {
  switch (type.toLowerCase()) {
    case 'mastered':
      return <Zap className={`${className} text-yellow-400`} />;
    case 'demo':
      return <Music className={`${className} text-blue-400`} />;
    case 'remix':
      return <Zap className={`${className} text-green-400`} />;
    case 'instrumental':
      return <Music className={`${className} text-cyan-400`} />;
    case 'acapella':
      return <Music className={`${className} text-pink-400`} />;
    default:
      return <Music className={`${className} text-gray-400`} />;
  }
};

export default VariantBadge;
