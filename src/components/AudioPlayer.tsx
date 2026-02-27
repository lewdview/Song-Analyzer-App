import { useEffect, useRef, useState } from 'react';
import { recordUniversalPlayEvent } from '@/services/playEvents';

interface AudioPlayerProps {
  src: string;
  songId?: string; // For syncing with karaoke window
  autoPlay?: boolean;
  onTimeUpdate?: (t: number) => void;
  onReady?: (el: HTMLAudioElement) => void;
}

export function AudioPlayer({ src, songId, autoPlay = false, onTimeUpdate, onReady }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const lastLoggedRef = useRef<{ releaseId: string; at: number } | null>(null);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);

  // Set up BroadcastChannel for karaoke sync
  useEffect(() => {
    if (!songId) return;
    
    try {
      channelRef.current = new BroadcastChannel('karaoke-sync');
    } catch (err) {
      // BroadcastChannel not supported
    }
    
    return () => {
      channelRef.current?.close();
    };
  }, [songId]);

  // Broadcast time updates to karaoke window
  const broadcastTimeUpdate = (time: number, isPlaying: boolean) => {
    if (channelRef.current && songId) {
      channelRef.current.postMessage({
        type: 'timeUpdate',
        songId,
        currentTime: time,
        isPlaying,
      });
    }
  };

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onLoaded = () => {
      setDuration(el.duration || 0);
      onReady?.(el);
    };
    const onTime = () => {
      const time = el.currentTime || 0;
      setCurrent(time);
      onTimeUpdate?.(time);
      broadcastTimeUpdate(time, !el.paused);
    };
    const onPlay = () => {
      setPlaying(true);
      broadcastTimeUpdate(el.currentTime || 0, true);

      const normalizedSongId = songId?.trim();
      if (!normalizedSongId) return;
      if (el.currentTime > 3) return;

      const releaseId = `tooldrip:${normalizedSongId}`;
      const now = Date.now();
      const last = lastLoggedRef.current;
      if (last && last.releaseId === releaseId && now - last.at < 60_000) return;

      lastLoggedRef.current = { releaseId, at: now };
      void recordUniversalPlayEvent({
        releaseId,
        source: 'song_analyzer_player',
        platform: 'tooldrip_web',
        positionSeconds: Math.floor(el.currentTime || 0),
      }).catch((error) => {
        console.warn('[PlayEvents] Failed to log Song Analyzer play event:', error);
      });
    };
    const onPause = () => {
      setPlaying(false);
      broadcastTimeUpdate(el.currentTime || 0, false);
    };

    el.addEventListener('loadedmetadata', onLoaded);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);

    return () => {
      el.removeEventListener('loadedmetadata', onLoaded);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
    };
  }, [onTimeUpdate, songId]);

  const format = (s: number) => {
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${m}:${ss.toString().padStart(2, '0')}`;
  };

  const onScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = audioRef.current;
    if (!el) return;
    const val = Number(e.target.value);
    el.currentTime = val;
    setCurrent(val);
  };

  return (
    <div className="space-y-3">
      <audio ref={audioRef} src={src} controls className="w-full" preload="metadata" autoPlay={autoPlay} />
      <div className="flex items-center gap-3 text-purple-200 text-sm">
        <span className="tabular-nums">{format(current)}</span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={Math.min(current, duration || 0)}
          onChange={onScrub}
          className="flex-1 accent-purple-400"
        />
        <span className="tabular-nums">{format(duration || 0)}</span>
        <span className="ml-2 text-xs text-purple-300">{playing ? 'Playing' : 'Paused'}</span>
      </div>
    </div>
  );
}
