import { getJsonHeaders, getSupabaseBaseUrl } from '@/config/api';

const PLAY_SESSION_KEY = 'tooldrip_play_session_id_v1';

export type RecordUniversalPlayInput = {
  releaseId: string;
  day?: number;
  source?: string;
  platform?: string;
  positionSeconds?: number;
};

function getOrCreateSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const existing = window.localStorage.getItem(PLAY_SESSION_KEY);
    if (existing) return existing;

    const generated =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

    window.localStorage.setItem(PLAY_SESSION_KEY, generated);
    return generated;
  } catch {
    return null;
  }
}

export async function recordUniversalPlayEvent({
  releaseId,
  day,
  source,
  platform,
  positionSeconds,
}: RecordUniversalPlayInput): Promise<void> {
  const cleanedReleaseId = releaseId.trim();
  if (!cleanedReleaseId) return;

  const response = await fetch(`${getSupabaseBaseUrl()}/rest/v1/rpc/record_play_event`, {
    method: 'POST',
    headers: getJsonHeaders(),
    body: JSON.stringify({
      p_release_id: cleanedReleaseId,
      p_day: typeof day === 'number' ? day : null,
      p_source: source || 'song_analyzer_player',
      p_platform: platform || 'tooldrip_web',
      p_session_id: getOrCreateSessionId(),
      p_position_seconds: typeof positionSeconds === 'number' ? positionSeconds : null,
      p_referrer: typeof document === 'undefined' ? null : document.referrer || null,
      p_user_agent: typeof navigator === 'undefined' ? null : navigator.userAgent || null,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`record_play_event failed (${response.status}): ${text}`);
  }
}
