import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Play, Pause, SkipBack, SkipForward,
  Volume2, VolumeX, Maximize, Minimize,
  Settings, Music, X, Pencil, Save, XCircle,
  Mic2, Sparkles, Clock
} from 'lucide-react';
import type { LyricWord, SongAnalysis } from '@/App';
import { LyricEditor } from '@/components/LyricEditor';

// ============================================================================
// Types
// ============================================================================

interface LineGroup {
  words: LyricWord[];
  start: number;
  end: number;
  text: string;
  type?: 'verse' | 'chorus' | 'bridge' | 'intro' | 'outro';
}

type FontSize = 'small' | 'medium' | 'large' | 'xlarge';
type Theme = 'dark' | 'light' | 'neon' | 'sunset' | 'ocean' | 'aurora' | 'midnight' | 'tropical' | 'cherry' | 'galaxy' | 'forest' | 'lavender' | 'fire' | 'arctic' | 'synthwave';

// ============================================================================
// Styles
// ============================================================================

const THEME_STYLES: Record<Theme, { background: string; color: string; accent: string; glow: string; unfilledColor: string }> = {
  dark: {
    background: 'linear-gradient(135deg, #1a1a2e 0%, #581c87 50%, #1a1a2e 100%)',
    color: 'white',
    accent: '#a855f7',
    glow: 'rgba(168, 85, 247, 0.6)',
    unfilledColor: 'rgba(255,255,255,0.4)',
  },
  light: {
    background: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 30%, #e9d5ff 50%, #f3e8ff 70%, #faf5ff 100%)',
    color: '#1e1b4b',
    accent: '#7c3aed',
    glow: 'rgba(124, 58, 237, 0.5)',
    unfilledColor: 'rgba(30, 27, 75, 0.4)',
  },
  neon: {
    background: 'radial-gradient(ellipse at center, #0a0a0a 0%, #000 100%)',
    color: '#4ade80',
    accent: '#22d3ee',
    glow: 'rgba(34, 211, 238, 0.8)',
    unfilledColor: 'rgba(74, 222, 128, 0.4)',
  },
  sunset: {
    background: 'linear-gradient(135deg, #1a1a2e 0%, #be185d 30%, #f97316 70%, #1a1a2e 100%)',
    color: 'white',
    accent: '#fb923c',
    glow: 'rgba(251, 146, 60, 0.6)',
    unfilledColor: 'rgba(255,255,255,0.4)',
  },
  ocean: {
    background: 'linear-gradient(135deg, #0c4a6e 0%, #0891b2 50%, #164e63 100%)',
    color: 'white',
    accent: '#22d3ee',
    glow: 'rgba(34, 211, 238, 0.6)',
    unfilledColor: 'rgba(255,255,255,0.4)',
  },
  aurora: {
    background: 'linear-gradient(135deg, #064e3b 0%, #059669 25%, #06b6d4 50%, #8b5cf6 75%, #1e1b4b 100%)',
    color: 'white',
    accent: '#34d399',
    glow: 'rgba(52, 211, 153, 0.7)',
    unfilledColor: 'rgba(255,255,255,0.4)',
  },
  midnight: {
    background: 'linear-gradient(180deg, #0f0f23 0%, #1a1a3e 40%, #2d1b69 100%)',
    color: '#f1f5f9',
    accent: '#a5b4fc',
    glow: 'rgba(165, 180, 252, 0.6)',
    unfilledColor: 'rgba(241, 245, 249, 0.4)',
  },
  tropical: {
    background: 'linear-gradient(135deg, #134e4a 0%, #0d9488 30%, #fbbf24 70%, #f97316 100%)',
    color: 'white',
    accent: '#fef08a',
    glow: 'rgba(254, 240, 138, 0.6)',
    unfilledColor: 'rgba(255,255,255,0.4)',
  },
  cherry: {
    background: 'linear-gradient(135deg, #1c1917 0%, #991b1b 40%, #ec4899 70%, #1c1917 100%)',
    color: 'white',
    accent: '#fda4af',
    glow: 'rgba(253, 164, 175, 0.7)',
    unfilledColor: 'rgba(255,255,255,0.4)',
  },
  galaxy: {
    background: 'radial-gradient(ellipse at top, #1e1b4b 0%, #312e81 30%, #0c0a09 70%)',
    color: 'white',
    accent: '#c4b5fd',
    glow: 'rgba(196, 181, 253, 0.6)',
    unfilledColor: 'rgba(255,255,255,0.4)',
  },
  forest: {
    background: 'linear-gradient(135deg, #14532d 0%, #166534 30%, #15803d 50%, #14532d 100%)',
    color: '#ecfdf5',
    accent: '#86efac',
    glow: 'rgba(134, 239, 172, 0.6)',
    unfilledColor: 'rgba(236, 253, 245, 0.4)',
  },
  lavender: {
    background: 'linear-gradient(135deg, #2e1065 0%, #581c87 30%, #7e22ce 50%, #581c87 70%, #2e1065 100%)',
    color: '#faf5ff',
    accent: '#e879f9',
    glow: 'rgba(232, 121, 249, 0.6)',
    unfilledColor: 'rgba(250, 245, 255, 0.4)',
  },
  fire: {
    background: 'linear-gradient(180deg, #0c0a09 0%, #7c2d12 30%, #dc2626 50%, #f97316 70%, #fbbf24 100%)',
    color: 'white',
    accent: '#fde047',
    glow: 'rgba(253, 224, 71, 0.7)',
    unfilledColor: 'rgba(255,255,255,0.4)',
  },
  arctic: {
    background: 'linear-gradient(180deg, #0c4a6e 0%, #0ea5e9 30%, #7dd3fc 50%, #e0f2fe 80%, #f0f9ff 100%)',
    color: '#0c4a6e',
    accent: '#0284c7',
    glow: 'rgba(2, 132, 199, 0.6)',
    unfilledColor: 'rgba(12, 74, 110, 0.4)',
  },
  synthwave: {
    background: 'linear-gradient(180deg, #0f0f23 0%, #1e1b4b 20%, #7c3aed 50%, #ec4899 70%, #f97316 100%)',
    color: 'white',
    accent: '#f0abfc',
    glow: 'rgba(240, 171, 252, 0.7)',
    unfilledColor: 'rgba(255,255,255,0.4)',
  },
};

const FONT_SIZES: Record<FontSize, React.CSSProperties> = {
  small: { fontSize: '1.25rem' },
  medium: { fontSize: '1.75rem' },
  large: { fontSize: '2.5rem' },
  xlarge: { fontSize: '3.5rem' },
};

const COLORS = {
  purple: '#a855f7',
  purpleLight: '#c4b5fd',
  green: '#4ade80',
  greenLight: '#86efac',
  yellow: '#fde047',
  red: '#f87171',
  gray: '#9ca3af',
  darkGray: '#6b7280',
  blue: '#93c5fd',
  cyan: '#22d3ee',
  orange: '#fb923c',
  pink: '#f472b6',
};

// ============================================================================
// Helper Functions
// ============================================================================

function getKaraokeData(): SongAnalysis | null {
  // Try opener window first
  try {
    if (window.opener?.__karaokeData) {
      return (window.opener as any).__karaokeData;
    }
  } catch {
    // Cross-origin access blocked
  }

  // Fallback to localStorage
  const stored = localStorage.getItem('karaokeData');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }

  return null;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getRandomTheme(): Theme {
  const themes: Theme[] = ['dark', 'neon', 'sunset', 'ocean', 'aurora', 'midnight', 'tropical', 'cherry', 'galaxy', 'forest', 'lavender', 'fire', 'arctic', 'synthwave'];
  return themes[Math.floor(Math.random() * themes.length)] as Theme;
}

// ============================================================================
// Background Visualizer Component
// ============================================================================

function BackgroundVisualizer({ theme, isPlaying }: { theme: Theme; isPlaying: boolean }) {
  const themeStyle = THEME_STYLES[theme];

  // Create animated bars
  const bars = useMemo(() =>
    Array.from({ length: 32 }, (_, i) => ({
      id: i,
      height: 20 + Math.random() * 60,
      delay: Math.random() * 2,
      duration: 0.8 + Math.random() * 0.8,
    })), []
  );

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '40%',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap: 4,
        padding: '0 40px',
        opacity: isPlaying ? 0.15 : 0.05,
        transition: 'opacity 0.5s ease',
        pointerEvents: 'none',
        maskImage: 'linear-gradient(to top, black 0%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to top, black 0%, transparent 100%)',
      }}
    >
      {bars.map((bar) => (
        <div
          key={bar.id}
          style={{
            width: 8,
            borderRadius: 4,
            background: `linear-gradient(to top, ${themeStyle.accent}, ${themeStyle.glow})`,
            animation: isPlaying ? `visualizerBar ${bar.duration}s ease-in-out infinite` : 'none',
            animationDelay: `${bar.delay}s`,
            height: isPlaying ? `${bar.height}%` : '10%',
            transition: 'height 0.3s ease',
          }}
        />
      ))}
    </div>
  );
}

// ============================================================================
// Animated Word Component with Fill Effect
// ============================================================================

interface AnimatedWordProps {
  word: LyricWord;
  isActive: boolean;
  isPast: boolean;
  isLineCurrent: boolean;
  currentTime: number;
  theme: Theme;
  onSeek: (time: number) => void;
  wordIndex: number;
}

function AnimatedWord({ word, isActive, isPast, isLineCurrent, currentTime, theme, onSeek }: AnimatedWordProps) {
  // Calculate fill progress (0 to 1) for the current word
  const fillProgress = useMemo(() => {
    if (!isActive) return isPast ? 1 : 0;
    const duration = word.end - word.start;
    if (duration <= 0) return 1;
    return Math.min(1, Math.max(0, (currentTime - word.start) / duration));
  }, [isActive, isPast, currentTime, word.start, word.end]);

  const themeStyle = THEME_STYLES[theme];
  const unfilledColor = isLineCurrent ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.5)';
  const filledColor = themeStyle.accent;
  const pastColor = theme === 'neon' ? COLORS.green : 'rgba(255,255,255,0.95)';

  // Determine the color based on state
  let textColor = unfilledColor;
  let textShadow = 'none';

  if (isPast && isLineCurrent) {
    textColor = pastColor;
  } else if (isActive) {
    // Use gradient for active word to show progress
    textColor = 'transparent';
    textShadow = `0 0 20px ${themeStyle.glow}`;
  }

  return (
    <span
      onClick={(e) => { e.stopPropagation(); onSeek(word.start); }}
      style={{
        cursor: 'pointer',
        color: textColor,
        textShadow,
        transition: isActive ? 'none' : 'color 0.15s ease-out',
        ...(isActive ? {
          backgroundImage: `linear-gradient(90deg, ${filledColor} ${fillProgress * 100}%, ${unfilledColor} ${fillProgress * 100}%)`,
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        } : {}),
      }}
    >
      {word.word}
    </span>
  );
}

// ============================================================================
// Particle Effect Component
// ============================================================================

function ParticleEffect({ theme }: { theme: Theme }) {
  const particles = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 2,
      duration: 1.5 + Math.random() * 1.5,
      size: 3 + Math.random() * 4,
    })), []
  );

  const themeStyle = THEME_STYLES[theme];

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {particles.map(p => (
        <span
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.x}%`,
            bottom: 0,
            width: p.size,
            height: p.size,
            background: themeStyle.accent,
            borderRadius: '50%',
            boxShadow: `0 0 ${p.size * 2}px ${themeStyle.glow}`,
            animation: `particleFloat ${p.duration}s ease-out infinite`,
            animationDelay: `${p.delay}s`,
            opacity: 0,
          }}
        />
      ))}
    </div>
  );
}

// ============================================================================
// Countdown Component
// ============================================================================

interface CountdownProps {
  timeUntilStart: number;
  theme: Theme;
}

function Countdown({ timeUntilStart, theme }: CountdownProps) {
  const themeStyle = THEME_STYLES[theme];
  const count = Math.ceil(timeUntilStart);

  if (count <= 0 || count > 5) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <div
        key={count}
        style={{
          fontSize: '8rem',
          fontWeight: 800,
          color: themeStyle.accent,
          textShadow: `0 0 60px ${themeStyle.glow}, 0 0 120px ${themeStyle.glow}`,
          animation: 'countdownPulse 1s ease-out',
        }}
      >
        {count}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: 'rgba(255,255,255,0.7)',
          fontSize: '1.2rem',
        }}
      >
        <Mic2 style={{ width: 24, height: 24, animation: 'bounce 0.5s ease-in-out infinite' }} />
        Get Ready!
      </div>
    </div>
  );
}

// ============================================================================
// Sub-Components
// ============================================================================

interface LyricLineProps {
  line: LineGroup;
  index: number;
  currentLineIndex: number;
  currentTime: number;
  theme: Theme;
  fontSize: FontSize;
  onSeek: (time: number) => void;
}

function LyricLine({ line, index, currentLineIndex, currentTime, theme, fontSize, onSeek }: LyricLineProps) {
  const lineRef = useRef<HTMLDivElement>(null);
  const [hasAnimated, setHasAnimated] = useState(false);
  const isCurrent = index === currentLineIndex;
  const isPast = index < currentLineIndex;
  const isUpcoming = index === currentLineIndex + 1;
  const isNearUpcoming = index > currentLineIndex && index <= currentLineIndex + 2;
  const isFarPast = index < currentLineIndex - 1;
  const isVeryFarPast = index < currentLineIndex - 2;

  // Determine if line is "active" (visible in the near range)
  const isInView = isCurrent || isUpcoming || isNearUpcoming || (isPast && !isVeryFarPast);

  const themeStyle = THEME_STYLES[theme];

  // Auto-scroll when this line becomes current
  useEffect(() => {
    if (isCurrent && lineRef.current) {
      lineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [isCurrent]);

  // Track when line first comes into view for entrance animation
  useEffect(() => {
    if (isInView && !hasAnimated) {
      setHasAnimated(true);
    }
  }, [isInView, hasAnimated]);

  // Calculate slide offset based on position relative to current line
  const getSlideTransform = (): string => {
    if (!hasAnimated) {
      // Lines that haven't animated yet start off-screen
      return 'translateY(40px)';
    }

    if (isCurrent) {
      return 'translateY(0) scale(1.02)';
    }

    if (isUpcoming) {
      return 'translateY(0)';
    }

    if (isPast && !isVeryFarPast) {
      // Past lines slide up slightly
      return 'translateY(-8px)';
    }

    if (isVeryFarPast) {
      return 'translateY(-20px)';
    }

    return 'translateY(0)';
  };

  // Calculate line state for animations
  const getLineStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      cursor: 'pointer',
      textAlign: 'center',
      lineHeight: 1.8,
      transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
      position: 'relative',
      padding: '8px 0',
      transform: getSlideTransform(),
      ...FONT_SIZES[fontSize],
    };

    if (isCurrent) {
      return {
        ...base,
        opacity: 1,
        fontWeight: 600,
        color: theme === 'neon' ? COLORS.greenLight : 'inherit',
        filter: 'none',
      };
    }

    if (isUpcoming) {
      return {
        ...base,
        opacity: 0.6,
        fontWeight: 400,
        filter: 'none',
      };
    }

    if (isNearUpcoming) {
      return {
        ...base,
        opacity: 0.4,
        fontWeight: 400,
        filter: 'blur(0.5px)',
      };
    }

    if (isPast && !isFarPast) {
      return {
        ...base,
        opacity: 0.3,
        fontWeight: 400,
        filter: 'blur(1px)',
      };
    }

    if (isFarPast && !isVeryFarPast) {
      return {
        ...base,
        opacity: 0.15,
        fontWeight: 400,
        filter: 'blur(1.5px)',
      };
    }

    if (isVeryFarPast) {
      return {
        ...base,
        opacity: 0.08,
        fontWeight: 400,
        filter: 'blur(2px)',
      };
    }

    // Future lines (far) - start hidden until they come into view
    return {
      ...base,
      opacity: hasAnimated ? 0.35 : 0,
      fontWeight: 400,
      filter: 'blur(0.5px)',
    };
  };

  // Section indicator badge
  const SectionBadge = () => {
    if (!line.type) return null;
    const labels: Record<string, { label: string; color: string }> = {
      chorus: { label: '🎵 Chorus', color: COLORS.pink },
      verse: { label: '📝 Verse', color: COLORS.blue },
      bridge: { label: '🌉 Bridge', color: COLORS.orange },
      intro: { label: '🎬 Intro', color: COLORS.cyan },
      outro: { label: '🎭 Outro', color: COLORS.purple },
    };
    const badge = labels[line.type];
    if (!badge) return null;

    return (
      <span
        style={{
          position: 'absolute',
          left: -100,
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: '0.7rem',
          padding: '4px 10px',
          borderRadius: 12,
          background: `${badge.color}22`,
          color: badge.color,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          opacity: isCurrent ? 1 : 0.5,
          transition: 'opacity 0.3s',
        }}
      >
        {badge.label}
      </span>
    );
  };

  return (
    <div ref={lineRef} style={{ ...getLineStyle(), position: 'relative' }}>
      <SectionBadge />

      {/* Particle effects for current line */}
      {isCurrent && <ParticleEffect theme={theme} />}

      <div onClick={() => onSeek(line.start)} style={{ display: 'inline' }}>
        {line.words.map((word, widx) => {
          const isWordActive = currentTime >= word.start && currentTime < word.end;
          const isWordPast = currentTime >= word.end;

          return (
            <span key={`${index}-${widx}`}>
              <AnimatedWord
                word={word}
                isActive={isWordActive}
                isPast={isWordPast}
                isLineCurrent={isCurrent}
                currentTime={currentTime}
                theme={theme}
                onSeek={onSeek}
                wordIndex={widx}
              />
              {widx < line.words.length - 1 && ' '}
            </span>
          );
        })}
      </div>

      {/* Line progress indicator - shown below current line */}
      {isCurrent && (
        <div
          style={{
            margin: '8px auto 0',
            width: '50%',
            height: 3,
            borderRadius: 2,
            background: 'rgba(255,255,255,0.1)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.min(100, ((currentTime - line.start) / (line.end - line.start)) * 100)}%`,
              background: `linear-gradient(90deg, ${themeStyle.accent}, ${COLORS.pink})`,
              borderRadius: 2,
              transition: 'width 0.1s linear',
              boxShadow: `0 0 10px ${themeStyle.glow}`,
            }}
          />
        </div>
      )}
    </div>
  );
}


interface SettingsPanelProps {
  fontSize: FontSize;
  theme: Theme;
  onFontSizeChange: (size: FontSize) => void;
  onThemeChange: (theme: Theme) => void;
  onClose: () => void;
}

function SettingsPanel({ fontSize, theme, onFontSizeChange, onThemeChange, onClose }: SettingsPanelProps) {
  const buttonStyle = (isActive: boolean): React.CSSProperties => ({
    padding: '8px 16px',
    borderRadius: 10,
    fontSize: '0.875rem',
    textTransform: 'capitalize',
    background: isActive
      ? `linear-gradient(135deg, ${COLORS.purple}, ${COLORS.pink})`
      : 'rgba(255,255,255,0.08)',
    border: isActive ? 'none' : '1px solid rgba(255,255,255,0.1)',
    color: 'white', // Always white text for buttons
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    transform: isActive ? 'scale(1.05)' : 'scale(1)',
    boxShadow: isActive ? '0 4px 15px rgba(168, 85, 247, 0.4)' : 'none',
  });

  const themePreview: Record<Theme, string> = {
    dark: '🌙',
    light: '☀️',
    neon: '💚',
    sunset: '🌅',
    ocean: '🌊',
    aurora: '🌌',
    midnight: '✨',
    tropical: '🌴',
    cherry: '🌸',
    galaxy: '🔮',
    forest: '🌲',
    lavender: '💜',
    fire: '🔥',
    arctic: '❄️',
    synthwave: '🎹',
  };

  return (
    <div style={{
      position: 'absolute',
      top: 70,
      right: 16,
      background: 'rgba(0,0,0,0.95)',
      backdropFilter: 'blur(20px)',
      borderRadius: 20,
      padding: 24,
      zIndex: 50,
      minWidth: 360,
      border: '1px solid rgba(255,255,255,0.1)',
      boxShadow: '0 25px 50px rgba(0,0,0,0.6)',
      animation: 'settingsSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      color: 'white', // Always white text in settings panel
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Settings style={{ width: 20, height: 20, color: COLORS.purple }} />
          <h3 style={{ fontWeight: 600, fontSize: '1.1rem', margin: 0, color: 'white' }}>Settings</h3>
        </div>
        <button
          onClick={onClose}
          style={{
            padding: '8px 16px',
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 10,
            color: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '0.85rem',
            fontWeight: 500,
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
          }}
        >
          <X style={{ width: 16, height: 16 }} />
          Close
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 12, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'white' }}>
            Font Size
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(['small', 'medium', 'large', 'xlarge'] as const).map((size) => (
              <button key={size} onClick={() => onFontSizeChange(size)} style={buttonStyle(fontSize === size)}>
                {size === 'xlarge' ? 'XL' : size.charAt(0).toUpperCase() + size.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 12, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'white' }}>
            Theme ({Object.keys(themePreview).length} available)
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', maxHeight: 200, overflowY: 'auto', paddingRight: 8 }}>
            {(Object.keys(themePreview) as Theme[]).map((t) => (
              <button key={t} onClick={() => onThemeChange(t)} style={buttonStyle(theme === t)}>
                {themePreview[t]} {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{
        marginTop: 24,
        paddingTop: 20,
        borderTop: '1px solid rgba(255,255,255,0.08)',
        fontSize: '0.75rem',
        opacity: 0.5,
        lineHeight: 2,
        color: 'white',
      }}>
        <p style={{ fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, color: 'white' }}>
          <span style={{ fontSize: '0.9rem' }}>⌨️</span> Keyboard shortcuts
        </p>
        <p><kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 4, marginRight: 4 }}>Space</kbd> Play/Pause</p>
        <p><kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 4, marginRight: 4 }}>F</kbd> Fullscreen</p>
        <p><kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 4, marginRight: 4 }}>←</kbd><kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 4, marginRight: 4 }}>→</kbd> Skip 5s</p>
        <p><kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 4, marginRight: 4 }}>M</kbd> Mute</p>
        <p><kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 4, marginRight: 4 }}>Esc</kbd> Close settings</p>
      </div>
    </div>
  );
}

// ============================================================================
// Edit Modal Component
// ============================================================================

interface LyricEditModalProps {
  line: LineGroup;
  lineIndex: number;
  onSave: (lineIndex: number, newText: string) => void;
  onClose: () => void;
}

function LyricEditModal({ line, lineIndex, onSave, onClose }: LyricEditModalProps) {
  const [editText, setEditText] = useState(line.text);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSave = () => {
    onSave(lineIndex, editText.trim());
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(135deg, #1e1b4b 0%, #581c87 100%)',
          borderRadius: 20,
          padding: 28,
          maxWidth: 600,
          width: '100%',
          boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ color: 'white', fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Pencil style={{ width: 20, height: 20, color: COLORS.purple }} />
            Edit Lyrics - Line {lineIndex + 1}
          </h2>
          <button
            onClick={onClose}
            style={{ padding: 8, background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, cursor: 'pointer', color: 'white' }}
          >
            <XCircle style={{ width: 20, height: 20 }} />
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', color: COLORS.gray, fontSize: '0.875rem', marginBottom: 8 }}>
            Timestamp: {formatTime(line.start)} - {formatTime(line.end)}
          </label>
          <textarea
            ref={inputRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter lyric text..."
            style={{
              width: '100%',
              minHeight: 100,
              padding: 16,
              fontSize: '1.1rem',
              background: 'rgba(0, 0, 0, 0.3)',
              border: '2px solid rgba(168, 85, 247, 0.3)',
              borderRadius: 12,
              color: 'white',
              resize: 'vertical',
              outline: 'none',
              fontFamily: 'inherit',
              lineHeight: 1.6,
            }}
          />
        </div>

        <div style={{ fontSize: '0.75rem', color: COLORS.gray, marginBottom: 20 }}>
          <p>💡 Press <strong>Enter</strong> to save, <strong>Escape</strong> to cancel</p>
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '12px 24px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: 10,
              color: 'white',
              cursor: 'pointer',
              fontSize: '0.95rem',
              fontWeight: 500,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '12px 24px',
              background: COLORS.purple,
              border: 'none',
              borderRadius: 10,
              color: 'white',
              cursor: 'pointer',
              fontSize: '0.95rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 15px rgba(168, 85, 247, 0.4)',
            }}
          >
            <Save style={{ width: 18, height: 18 }} />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function KaraokePage() {
  const [analysis, setAnalysis] = useState<SongAnalysis | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fontSize, setFontSize] = useState<FontSize>('large');
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => getRandomTheme()); // Random theme on load
  const [editingLineIndex, setEditingLineIndex] = useState<number | null>(null);
  const [showCountdown] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [showLyricEditor, setShowLyricEditor] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lyricsRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  // Load data on mount
  useEffect(() => {
    const data = getKaraokeData();
    if (data) {
      // Check if we have saved edits for this analysis in localStorage
      try {
        const savedEdits = localStorage.getItem(`lyrics-${data.id}`);
        if (savedEdits) {
          const edits = JSON.parse(savedEdits);
          if (edits.lyricsSegments && edits.lyricsWords) {
            // Apply saved edits to the loaded data
            data.lyricsSegments = edits.lyricsSegments;
            data.lyricsWords = edits.lyricsWords;
            data.lyrics = edits.lyrics;
            console.log('Loaded saved lyrics edits from localStorage');
          }
        }
      } catch (error) {
        console.warn('Failed to load saved lyrics:', error);
      }

      setAnalysis(data);
      document.title = `🎤 ${data.fileName} - Karaoke`;
    }

    // Set up BroadcastChannel for time sync
    try {
      channelRef.current = new BroadcastChannel('karaoke-sync');
      channelRef.current.onmessage = (event) => {
        if (event.data.type === 'timeUpdate' && event.data.songId === data?.id) {
          setCurrentTime(event.data.currentTime);
          setIsPlaying(event.data.isPlaying);
        }
      };
    } catch {
      // BroadcastChannel not supported
    }

    return () => {
      localStorage.removeItem('karaokeData');
      channelRef.current?.close();
    };
  }, []);

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlers = {
      timeupdate: () => setCurrentTime(audio.currentTime),
      loadedmetadata: () => setDuration(audio.duration),
      play: () => setIsPlaying(true),
      pause: () => setIsPlaying(false),
      ended: () => { setIsPlaying(false); setCurrentTime(0); },
    };

    Object.entries(handlers).forEach(([event, handler]) =>
      audio.addEventListener(event, handler)
    );

    return () => {
      Object.entries(handlers).forEach(([event, handler]) =>
        audio.removeEventListener(event, handler)
      );
    };
  }, [analysis]);

  // Fullscreen handling
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const actions: Record<string, () => void> = {
        'Space': () => { e.preventDefault(); togglePlay(); },
        'ArrowLeft': () => { e.preventDefault(); skip(-5); },
        'ArrowRight': () => { e.preventDefault(); skip(5); },
        'KeyM': toggleMute,
        'KeyF': toggleFullscreen,
        'Escape': () => {
          if (editingLineIndex !== null) setEditingLineIndex(null);
          else if (showSettings) setShowSettings(false);
        },
      };

      actions[e.code]?.();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSettings, editingLineIndex]);

  // Audio controls
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    isPlaying ? audio.pause() : audio.play();
  }, [isPlaying]);

  const skip = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + seconds));
  }, [duration]);

  const seekTo = useCallback((time: number) => {
    if (audioRef.current) audioRef.current.currentTime = time;
  }, []);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isMuted) {
      audio.volume = volume;
      setIsMuted(false);
    } else {
      audio.volume = 0;
      setIsMuted(true);
    }
  }, [isMuted, volume]);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    document.fullscreenElement
      ? document.exitFullscreen()
      : containerRef.current.requestFullscreen();
  }, []);

  // Handle saving edited lyrics
  const handleSaveEdit = useCallback((lineIndex: number, newText: string) => {
    if (!analysis) return;

    // Update the lyricsSegments with the new text
    const updatedSegments = analysis.lyricsSegments?.map((seg, idx) =>
      idx === lineIndex ? { ...seg, text: newText } : seg
    );

    // Update lyricsWords to match the new text for this segment
    const segment = analysis.lyricsSegments?.[lineIndex];
    if (segment) {
      const newWords = newText.split(/\s+/).filter(w => w.length > 0);
      const segmentDuration = segment.end - segment.start;
      const wordDuration = segmentDuration / newWords.length;

      const newWordObjects = newWords.map((word, widx) => ({
        word,
        start: segment.start + (widx * wordDuration),
        end: segment.start + ((widx + 1) * wordDuration),
      }));

      // Replace words in this segment's time range
      const updatedWords = [
        ...(analysis.lyricsWords?.filter(w => w.end < segment.start) || []),
        ...newWordObjects,
        ...(analysis.lyricsWords?.filter(w => w.start > segment.end) || []),
      ];

      setAnalysis({
        ...analysis,
        lyricsSegments: updatedSegments,
        lyricsWords: updatedWords,
      });
    }

    setEditingLineIndex(null);
  }, [analysis]);

  // Process lyrics into lines
  const { currentLineIndex, lines } = useMemo((): { currentLineIndex: number; lines: LineGroup[] } => {
    if (!analysis?.lyricsWords) return { currentLineIndex: -1, lines: [] };

    const words = analysis.lyricsWords;
    const segments = analysis.lyricsSegments;

    const lineGroups: LineGroup[] = segments?.length
      ? segments.map(seg => ({
        words: words.filter(w => w.start >= seg.start && w.end <= seg.end),
        start: seg.start,
        end: seg.end,
        text: seg.text,
      }))
      : [{ words, start: 0, end: duration, text: words.map(w => w.word).join(' ') }];

    // Find current line with small buffer
    const currentIdx = lineGroups.findIndex(
      line => currentTime >= line.start - 0.1 && currentTime <= line.end + 0.3
    );

    return { currentLineIndex: currentIdx, lines: lineGroups };
  }, [analysis, currentTime, duration]);

  // Auto-scroll is now handled by each LyricLine component

  // Handle countdown display
  useEffect(() => {
    if (isInitialLoad && analysis?.lyricsWords?.[0]) {
      setIsInitialLoad(false);
    }
  }, [analysis, isInitialLoad]);

  // Calculate time until first lyric
  const timeUntilFirstLyric = useMemo(() => {
    if (!analysis?.lyricsWords?.[0] || !isPlaying) return -1;
    return analysis.lyricsWords[0].start - currentTime;
  }, [analysis, currentTime, isPlaying]);

  // Render states
  if (!analysis) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1a1a2e 0%, #2e1065 50%, #1a1a2e 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'white', maxWidth: 420, padding: 32 }}>
          <div style={{ position: 'relative', display: 'inline-block', marginBottom: 28 }}>
            <Music style={{ width: 72, height: 72, color: COLORS.purple, animation: 'pulse 2s infinite' }} />
            <Sparkles style={{
              width: 24, height: 24,
              color: '#fbbf24',
              position: 'absolute', top: -4, right: -12,
              animation: 'bounce 1.6s ease-in-out infinite',
            }} />
          </div>
          <h1 style={{ fontSize: '1.65rem', fontWeight: 700, marginBottom: 10, letterSpacing: '-0.02em' }}>No Song Loaded</h1>
          <p style={{ color: 'rgba(203,213,225,0.7)', lineHeight: 1.7, marginBottom: 28, fontSize: '0.95rem' }}>
            Karaoke mode needs a song with word-level lyrics. Analyze a track in Studio first, then open it here for a real-time sing-along experience.
          </p>
          <a
            href="/studio"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '14px 32px',
              background: 'linear-gradient(135deg, #a855f7, #6366f1)',
              color: 'white', border: 'none', borderRadius: 12,
              fontSize: '1rem', fontWeight: 600,
              textDecoration: 'none',
              boxShadow: '0 4px 20px rgba(168,85,247,0.4)',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
          >
            <Music style={{ width: 18, height: 18 }} />
            Go to Studio
          </a>
          <p style={{ color: 'rgba(148,163,184,0.5)', fontSize: '0.78rem', marginTop: 20 }}>
            Or paste lyrics into the <a href="/" style={{ color: '#67e8f9', textDecoration: 'underline' }}>Creative Engine</a>
          </p>
        </div>
      </div>
    );
  }

  const hasLyrics = analysis.lyricsWords && analysis.lyricsWords.length > 0;
  const hasAudio = !!analysis.audioUrl;

  if (!hasLyrics) {
    return (
      <div style={{ minHeight: '100vh', background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'white', maxWidth: 400, padding: 20 }}>
          <Music style={{ width: 64, height: 64, margin: '0 auto 16px', color: COLORS.red }} />
          <h1 style={{ fontSize: '1.5rem', marginBottom: 8 }}>No Lyrics Available</h1>
          <p style={{ color: COLORS.gray, marginBottom: 24 }}>
            This song doesn't have word-level lyrics for karaoke.
          </p>
          <button
            onClick={() => window.close()}
            style={{ padding: '12px 24px', background: COLORS.purple, color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '1rem' }}
          >
            Close Window
          </button>
        </div>
      </div>
    );
  }

  const themeStyle = THEME_STYLES[theme];

  return (
    <div ref={containerRef} style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: themeStyle.background, color: themeStyle.color, position: 'relative', overflow: 'hidden' }}>
      {/* Background Visualizer */}
      <BackgroundVisualizer theme={theme} isPlaying={isPlaying} />

      {/* Hidden audio */}
      {hasAudio && <audio ref={audioRef} src={analysis.audioUrl} preload="auto" />}

      {/* Countdown overlay */}
      {showCountdown && timeUntilFirstLyric > 0 && timeUntilFirstLyric <= 5 && (
        <Countdown timeUntilStart={timeUntilFirstLyric} theme={theme} />
      )}

      {/* Sync notice */}
      {!hasAudio && (
        <div style={{
          background: 'rgba(59, 130, 246, 0.15)',
          borderBottom: '1px solid rgba(59, 130, 246, 0.2)',
          padding: '12px 16px',
          textAlign: 'center',
          color: COLORS.blue,
          fontSize: '0.875rem',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}>
          <span style={{ animation: 'pulse 2s infinite' }}>🔗</span>
          Synced to main window — play/pause there to control lyrics
        </div>
      )}

      {/* Header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 24px',
        background: 'rgba(0,0,0,0.35)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ position: 'relative' }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: `linear-gradient(135deg, ${themeStyle.accent}44, ${COLORS.purple}44)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Mic2 style={{ width: 24, height: 24, color: themeStyle.accent }} />
            </div>
            {isPlaying && (
              <span style={{
                position: 'absolute',
                top: -2,
                right: -2,
                width: 12,
                height: 12,
                background: COLORS.green,
                borderRadius: '50%',
                animation: 'pulse 1s infinite',
                border: '2px solid rgba(0,0,0,0.5)',
              }} />
            )}
          </div>
          <div>
            <h1 style={{
              fontWeight: 600,
              fontSize: '1.15rem',
              maxWidth: 400,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              letterSpacing: '-0.01em',
            }}>
              {analysis.fileName.replace(/\.[^/.]+$/, '')}
            </h1>
            <p style={{ fontSize: '0.8rem', opacity: 0.6, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Music style={{ width: 12, height: 12 }} /> {analysis.key}
              </span>
              <span>•</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock style={{ width: 12, height: 12 }} /> {analysis.tempo} BPM
              </span>
              {!hasAudio && (
                <>
                  <span>•</span>
                  <span style={{ color: isPlaying ? COLORS.green : COLORS.gray, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: isPlaying ? COLORS.green : COLORS.gray,
                      animation: isPlaying ? 'pulse 1s infinite' : 'none',
                    }} />
                    {isPlaying ? 'Playing' : 'Paused'}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {[
            { icon: Pencil, onClick: () => setShowLyricEditor(!showLyricEditor), title: 'Edit Lyrics' },
            { icon: Settings, onClick: () => setShowSettings(!showSettings), title: 'Settings' },
            { icon: isFullscreen ? Minimize : Maximize, onClick: toggleFullscreen, title: isFullscreen ? 'Exit Fullscreen' : 'Fullscreen' },
            { icon: X, onClick: () => window.close(), title: 'Close', color: COLORS.red },
          ].map(({ icon: Icon, onClick, title, color }) => (
            <button
              key={title}
              onClick={onClick}
              title={title}
              style={{ padding: 10, background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 8, color: color || 'inherit', opacity: 0.8 }}
            >
              <Icon style={{ width: 20, height: 20 }} />
            </button>
          ))}
        </div>
      </header>

      {/* Settings */}
      {showSettings && (
        <SettingsPanel
          fontSize={fontSize}
          theme={theme}
          onFontSizeChange={setFontSize}
          onThemeChange={setTheme}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Lyrics */}
      <main
        ref={lyricsRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '80px 60px',
          display: 'flex',
          flexDirection: 'column',
          gap: 36,
          scrollBehavior: 'smooth',
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)',
        }}
      >
        {/* Initial spacer for better scroll centering */}
        <div style={{ height: '30vh', flexShrink: 0 }} />

        {lines.map((line, idx) => (
          <LyricLine
            key={idx}
            line={line}
            index={idx}
            currentLineIndex={currentLineIndex}
            currentTime={currentTime}
            theme={theme}
            fontSize={fontSize}
            onSeek={seekTo}
          />
        ))}

        {/* End spacer */}
        <div style={{ height: '50vh', flexShrink: 0 }} />
      </main>

      {/* Player Controls */}
      {hasAudio && (
        <footer style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(20px)', padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          {/* Progress */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums', width: 45, opacity: 0.7 }}>{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={currentTime}
              onChange={(e) => seekTo(Number(e.target.value))}
              style={{ flex: 1, height: 6, cursor: 'pointer', accentColor: COLORS.purple, borderRadius: 3 }}
            />
            <span style={{ fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums', width: 45, opacity: 0.7 }}>{formatTime(duration)}</span>
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 140 }}>
              <button onClick={toggleMute} style={{ padding: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.8 }}>
                {isMuted ? <VolumeX style={{ width: 20, height: 20 }} /> : <Volume2 style={{ width: 20, height: 20 }} />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={isMuted ? 0 : volume}
                onChange={(e) => { setVolume(Number(e.target.value)); if (audioRef.current) audioRef.current.volume = Number(e.target.value); setIsMuted(false); }}
                style={{ width: 80, height: 4, cursor: 'pointer', accentColor: COLORS.purple }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={() => skip(-10)} title="Back 10s" style={{ padding: 10, background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.8 }}>
                <SkipBack style={{ width: 24, height: 24 }} />
              </button>
              <button onClick={togglePlay} style={{ padding: 18, background: COLORS.purple, border: 'none', cursor: 'pointer', borderRadius: '50%', color: 'white', boxShadow: '0 4px 20px rgba(168,85,247,0.4)' }}>
                {isPlaying ? <Pause style={{ width: 28, height: 28 }} /> : <Play style={{ width: 28, height: 28, marginLeft: 3 }} />}
              </button>
              <button onClick={() => skip(10)} title="Forward 10s" style={{ padding: 10, background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.8 }}>
                <SkipForward style={{ width: 24, height: 24 }} />
              </button>
            </div>

            <div style={{ width: 140 }} />
          </div>
        </footer>
      )}

      {/* Lyric Editor - Now as a floating overlay */}
      {showLyricEditor && (
        <div style={{
          position: 'fixed',
          bottom: hasAudio ? '120px' : '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '90%',
          maxWidth: '800px',
          zIndex: 40,
          background: 'rgba(0, 0, 0, 0.9)',
          backdropFilter: 'blur(20px)',
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          padding: 4,
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)'
        }}>
          <LyricEditor
            analysis={analysis}
            onUpdate={setAnalysis}
            isEnabled={showLyricEditor}
            onClose={() => setShowLyricEditor(false)}
          />
        </div>
      )}

      {/* Edit Modal */}
      {editingLineIndex !== null && lines[editingLineIndex] && (
        <LyricEditModal
          line={lines[editingLineIndex]}
          lineIndex={editingLineIndex}
          onSave={handleSaveEdit}
          onClose={() => setEditingLineIndex(null)}
        />
      )}

      {/* CSS Animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.1); }
        }
        
        @keyframes wordGlow {
          0% { opacity: 0.6; transform: scale(1); }
          100% { opacity: 1; transform: scale(1.1); }
        }
        
        @keyframes particleFloat {
          0% { 
            transform: translateY(0) scale(1); 
            opacity: 0; 
          }
          10% { 
            opacity: 1; 
          }
          90% { 
            opacity: 0.8; 
          }
          100% { 
            transform: translateY(-100px) scale(0); 
            opacity: 0; 
          }
        }
        
        @keyframes countdownPulse {
          0% { 
            transform: scale(0.5); 
            opacity: 0; 
          }
          50% { 
            transform: scale(1.2); 
            opacity: 1; 
          }
          100% { 
            transform: scale(1); 
            opacity: 1; 
          }
        }
        
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        
        @keyframes visualizerBar {
          0%, 100% { height: 20%; }
          50% { height: 80%; }
        }
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        @keyframes upcomingPulse {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 0.85; }
        }
        
        @keyframes editBadgePulse {
          0%, 100% { box-shadow: 0 4px 20px ${themeStyle.glow}; }
          50% { box-shadow: 0 4px 30px ${themeStyle.glow}, 0 0 40px ${themeStyle.glow}; }
        }
        
        @keyframes settingsSlideIn {
          0% { 
            opacity: 0; 
            transform: translateY(-10px) scale(0.95); 
          }
          100% { 
            opacity: 1; 
            transform: translateY(0) scale(1); 
          }
        }
        
        @keyframes lineEnter {
          0% { 
            opacity: 0; 
            transform: translateY(20px) scale(0.9); 
          }
          100% { 
            opacity: 1; 
            transform: translateY(0) scale(1); 
          }
        }
        
        /* Scrollbar styling */
        main::-webkit-scrollbar {
          width: 6px;
        }
        
        main::-webkit-scrollbar-track {
          background: transparent;
        }
        
        main::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.2);
          border-radius: 3px;
        }
        
        main::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.3);
        }
      `}</style>
    </div>
  );
}

export default KaraokePage;
