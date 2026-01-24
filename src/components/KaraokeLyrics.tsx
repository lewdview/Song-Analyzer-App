import { useEffect, useMemo, useRef, Fragment, useState } from 'react';
import type { LyricWord, LyricSegment } from '@/types';

interface KaraokeLyricsProps {
  words: LyricWord[];
  segments?: LyricSegment[];
  currentTime: number;
  onWordClick?: (t: number) => void;
  compact?: boolean;
}

// Animated word with fill progress effect
function AnimatedLyricWord({ 
  word, 
  isActive, 
  isPast, 
  currentTime, 
  onClick,
  refCallback,
}: {
  word: LyricWord;
  isActive: boolean;
  isPast: boolean;
  currentTime: number;
  onClick: () => void;
  refCallback: (el: HTMLSpanElement | null) => void;
}) {
  // Calculate fill progress (0 to 1) for active word
  const fillProgress = useMemo(() => {
    if (!isActive) return isPast ? 1 : 0;
    const duration = word.end - word.start;
    if (duration <= 0) return 1;
    return Math.min(1, Math.max(0, (currentTime - word.start) / duration));
  }, [isActive, isPast, currentTime, word.start, word.end]);

  return (
    <span
      ref={refCallback}
      onClick={onClick}
      className="relative inline-block cursor-pointer mx-0.5 px-1 py-0.5 rounded transition-all duration-150"
      style={{
        transform: isActive ? 'scale(1.1)' : 'scale(1)',
        background: isActive ? 'rgba(168, 85, 247, 0.25)' : 'transparent',
      }}
      title={`${formatTimestamp(word.start)} → ${formatTimestamp(word.end)}`}
    >
      {/* Glow effect for active word */}
      {isActive && (
        <span 
          className="absolute inset-0 -m-1 rounded-lg animate-pulse"
          style={{ 
            background: 'radial-gradient(ellipse, rgba(168, 85, 247, 0.4) 0%, transparent 70%)',
          }}
        />
      )}
      
      {/* Base text */}
      <span 
        className="relative transition-colors duration-100"
        style={{ 
          color: isPast ? 'rgba(255, 255, 255, 0.85)' : 'rgba(216, 180, 254, 0.7)',
        }}
      >
        {word.word}
      </span>
      
      {/* Fill overlay */}
      {(isActive || isPast) && (
        <span
          className="absolute left-1 top-0.5 overflow-hidden whitespace-nowrap transition-none"
          style={{
            width: `${fillProgress * 100}%`,
            color: isActive ? '#c084fc' : 'rgba(255, 255, 255, 0.9)',
            fontWeight: isActive ? 600 : 'inherit',
            textShadow: isActive ? '0 0 12px rgba(192, 132, 252, 0.8)' : 'none',
          }}
        >
          {word.word}
        </span>
      )}
    </span>
  );
}

export function KaraokeLyrics({ words, segments, currentTime, onWordClick, compact = false }: KaraokeLyricsProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  const lastUserScrollTime = useRef(0);

  const currentIndex = useMemo(() => {
    if (!words || words.length === 0) return -1;
    // Find last word whose start <= currentTime
    let lo = 0, hi = words.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (words[mid].start <= currentTime) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    return ans;
  }, [words, currentTime]);

  // Find current line/segment index
  const currentLineIndex = useMemo(() => {
    if (!segments || segments.length === 0 || currentIndex < 0) return -1;
    const currentWord = words[currentIndex];
    return segments.findIndex(seg => 
      currentWord.start >= seg.start && currentWord.end <= seg.end
    );
  }, [segments, words, currentIndex]);

  // Handle user scroll to temporarily disable auto-scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const handleScroll = () => {
      lastUserScrollTime.current = Date.now();
      setIsAutoScrollEnabled(false);
    };
    
    const handleScrollEnd = () => {
      // Re-enable auto-scroll after 3 seconds of no user interaction
      setTimeout(() => {
        if (Date.now() - lastUserScrollTime.current >= 2900) {
          setIsAutoScrollEnabled(true);
        }
      }, 3000);
    };
    
    container.addEventListener('scroll', handleScroll);
    container.addEventListener('scrollend', handleScrollEnd);
    container.addEventListener('touchend', handleScrollEnd);
    
    return () => {
      container.removeEventListener('scroll', handleScroll);
      container.removeEventListener('scrollend', handleScrollEnd);
      container.removeEventListener('touchend', handleScrollEnd);
    };
  }, []);

  // Auto-scroll to current word with improved behavior
  useEffect(() => {
    if (currentIndex < 0 || !isAutoScrollEnabled) return;
    const el = wordRefs.current[currentIndex];
    const container = containerRef.current;
    if (el && container) {
      const elTop = el.offsetTop;
      const elBottom = elTop + el.offsetHeight;
      const viewTop = container.scrollTop;
      const viewBottom = viewTop + container.clientHeight;
      const buffer = 60;
      
      if (elTop < viewTop + buffer || elBottom > viewBottom - buffer) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
  }, [currentIndex, isAutoScrollEnabled]);

  // If segments provided, bucket words by segment so we render line-like blocks
  const lines = useMemo(() => {
    if (!segments || segments.length === 0) return [words];
    return segments.map(seg => words.filter(w => w.start >= seg.start && w.end <= seg.end));
  }, [segments, words]);

  return (
    <div className="relative">
      {/* Auto-scroll indicator */}
      {!isAutoScrollEnabled && (
        <button
          onClick={() => setIsAutoScrollEnabled(true)}
          className="absolute top-2 right-2 z-10 px-2 py-1 text-xs bg-purple-500/80 text-white rounded-full hover:bg-purple-500 transition-colors flex items-center gap-1"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
          Resume scroll
        </button>
      )}
      
      <div 
        ref={containerRef} 
        className={`bg-gradient-to-b from-white/5 to-white/[0.02] rounded-xl p-4 overflow-y-auto scroll-smooth ${
          compact ? 'max-h-40' : 'max-h-72'
        }`}
        style={{
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%)',
        }}
      >
        {/* Top padding for scroll centering */}
        <div className="h-8" />
        
        {lines.map((lineWords, li) => {
          const isCurrentLine = li === currentLineIndex;
          const isPastLine = currentLineIndex >= 0 && li < currentLineIndex;
          
          return (
            <div 
              key={li} 
              className={`mb-2 py-1 leading-8 text-center transition-all duration-300 ${
                isCurrentLine 
                  ? 'scale-[1.02] opacity-100' 
                  : isPastLine 
                    ? 'opacity-40 scale-[0.98] blur-[0.5px]'
                    : 'opacity-60'
              }`}
            >
              {lineWords.map((w, wi) => {
                const gi = words.indexOf(w);
                const isActive = currentTime >= w.start && currentTime < w.end;
                const isPast = currentTime >= w.end;
                
                return (
                  <Fragment key={`wfrag-${li}-${wi}-${gi}`}>
                    <AnimatedLyricWord
                      word={w}
                      isActive={isActive}
                      isPast={isPast}
                      currentTime={currentTime}
                      onClick={() => onWordClick?.(w.start)}
                      refCallback={el => (wordRefs.current[gi] = el)}
                    />
                  </Fragment>
                );
              })}
            </div>
          );
        })}
        
        {/* Bottom padding */}
        <div className="h-8" />
        
        {!segments && words.length > 0 && (
          <div className="hidden" />
        )}
      </div>
      
      {/* Progress bar */}
      {words.length > 0 && currentIndex >= 0 && (
        <div className="mt-2 h-1 bg-white/10 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-100 rounded-full"
            style={{ 
              width: `${(currentIndex / words.length) * 100}%`,
              boxShadow: '0 0 8px rgba(168, 85, 247, 0.6)',
            }}
          />
        </div>
      )}
    </div>
  );
}

function pad(n: number, width = 2) {
  const s = Math.floor(Math.abs(n)).toString();
  return s.length >= width ? s : '0'.repeat(width - s.length) + s;
}

function formatTimestamp(seconds: number) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return (hrs > 0 ? `${hrs}:` : '') + `${pad(mins)}:${pad(secs)}`;
}
