import { API_ENDPOINTS, SUPABASE_ANON_KEY } from '@/config/api';
import type { CreativeEngineResult } from '@/services/creativeEngine';

const LOCAL_HISTORY_KEY = 'tooldrop-creative-history-v1';
const LOCAL_HISTORY_LIMIT = 40;
const CREATIVE_RECORD_TYPE = 'creative_lyric_analysis_v1';

export interface CreativeHistoryEntry {
  id: string;
  createdAt: string;
  artistName: string;
  lyricsInput: string;
  result: CreativeEngineResult;
  syncedToCloud: boolean;
}

type CloudCreativeRecord = {
  id: string;
  recordType: string;
  createdAt: string;
  artistName: string;
  lyricsInput: string;
  creativeResult: CreativeEngineResult;
};

const hasStorage = () => typeof window !== 'undefined' && !!window.localStorage;

const sortByNewest = (entries: CreativeHistoryEntry[]): CreativeHistoryEntry[] =>
  [...entries].sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime();
    const bTime = new Date(b.createdAt).getTime();
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  });

const looksLikeCreativeResult = (value: unknown): value is CreativeEngineResult => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;

  return (
    Array.isArray(record.moodBreakdown) &&
    Array.isArray(record.themes) &&
    typeof record.sentimentScore === 'number' &&
    typeof record.sentimentLabel === 'string' &&
    typeof record.energyScore === 'number' &&
    typeof record.emotionScore === 'number' &&
    Array.isArray(record.heatmap) &&
    typeof record.posterTitle === 'string' &&
    typeof record.posterSubline === 'string'
  );
};

const normalizeHistoryEntry = (value: unknown): CreativeHistoryEntry | null => {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Record<string, unknown>;

  if (typeof entry.id !== 'string' || entry.id.trim().length === 0) return null;
  if (typeof entry.createdAt !== 'string' || entry.createdAt.trim().length === 0) return null;
  if (typeof entry.lyricsInput !== 'string' || entry.lyricsInput.trim().length === 0) return null;
  if (!looksLikeCreativeResult(entry.result)) return null;

  return {
    id: entry.id,
    createdAt: entry.createdAt,
    artistName: typeof entry.artistName === 'string' ? entry.artistName : '',
    lyricsInput: entry.lyricsInput,
    result: entry.result,
    syncedToCloud: Boolean(entry.syncedToCloud),
  };
};

const normalizeCloudRecord = (value: unknown): CreativeHistoryEntry | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;

  if (record.recordType !== CREATIVE_RECORD_TYPE) return null;
  if (typeof record.id !== 'string' || record.id.trim().length === 0) return null;
  if (typeof record.createdAt !== 'string' || record.createdAt.trim().length === 0) return null;
  if (typeof record.lyricsInput !== 'string' || record.lyricsInput.trim().length === 0) return null;
  if (!looksLikeCreativeResult(record.creativeResult)) return null;

  return {
    id: record.id,
    createdAt: record.createdAt,
    artistName: typeof record.artistName === 'string' ? record.artistName : '',
    lyricsInput: record.lyricsInput,
    result: record.creativeResult,
    syncedToCloud: true,
  };
};

const persistLocalHistory = (entries: CreativeHistoryEntry[]) => {
  if (!hasStorage()) return;
  window.localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(entries));
};

const toCloudRecord = (entry: CreativeHistoryEntry): CloudCreativeRecord => ({
  id: entry.id,
  recordType: CREATIVE_RECORD_TYPE,
  createdAt: entry.createdAt,
  artistName: entry.artistName,
  lyricsInput: entry.lyricsInput,
  creativeResult: entry.result,
});

const withAuthHeaders = (accessToken: string, includeJson = false): Record<string, string> => ({
  Authorization: `Bearer ${accessToken}`,
  apikey: SUPABASE_ANON_KEY,
  ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
});

const randomId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

export const createCreativeHistoryEntry = (params: {
  lyricsInput: string;
  result: CreativeEngineResult;
  artistName?: string;
}): CreativeHistoryEntry => ({
  id: `creative_${randomId()}`,
  createdAt: new Date().toISOString(),
  artistName: (params.artistName || '').trim(),
  lyricsInput: params.lyricsInput,
  result: params.result,
  syncedToCloud: false,
});

export const readLocalCreativeHistory = (): CreativeHistoryEntry[] => {
  if (!hasStorage()) return [];

  try {
    const raw = window.localStorage.getItem(LOCAL_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return sortByNewest(
      parsed
        .map((item) => normalizeHistoryEntry(item))
        .filter((item): item is CreativeHistoryEntry => item !== null)
    );
  } catch {
    return [];
  }
};

export const mergeCreativeHistory = (...groups: CreativeHistoryEntry[][]): CreativeHistoryEntry[] => {
  const map = new Map<string, CreativeHistoryEntry>();

  for (const group of groups) {
    for (const entry of group) {
      const existing = map.get(entry.id);
      if (!existing) {
        map.set(entry.id, entry);
        continue;
      }

      map.set(entry.id, {
        ...entry,
        syncedToCloud: existing.syncedToCloud || entry.syncedToCloud,
      });
    }
  }

  return sortByNewest(Array.from(map.values())).slice(0, LOCAL_HISTORY_LIMIT);
};

export const writeLocalCreativeHistory = (entries: CreativeHistoryEntry[]): CreativeHistoryEntry[] => {
  const normalized = mergeCreativeHistory(entries);
  persistLocalHistory(normalized);
  return normalized;
};

export const addLocalCreativeHistory = (entry: CreativeHistoryEntry): CreativeHistoryEntry[] => {
  const current = readLocalCreativeHistory();
  const next = mergeCreativeHistory([entry], current);
  persistLocalHistory(next);
  return next;
};

export const removeLocalCreativeHistory = (id: string): CreativeHistoryEntry[] => {
  const current = readLocalCreativeHistory();
  const next = current.filter((entry) => entry.id !== id);
  persistLocalHistory(next);
  return next;
};

export const markLocalEntriesSynced = (ids: string[]): CreativeHistoryEntry[] => {
  if (ids.length === 0) return readLocalCreativeHistory();

  const synced = new Set(ids);
  const updated = readLocalCreativeHistory().map((entry) =>
    synced.has(entry.id) ? { ...entry, syncedToCloud: true } : entry
  );
  persistLocalHistory(updated);
  return updated;
};

export const saveCreativeHistoryToCloud = async (
  accessToken: string,
  entries: CreativeHistoryEntry[]
): Promise<boolean> => {
  if (entries.length === 0) return true;

  const response = await fetch(API_ENDPOINTS.analyses.save, {
    method: 'POST',
    headers: withAuthHeaders(accessToken, true),
    body: JSON.stringify({
      analyses: entries.map(toCloudRecord),
    }),
  });

  if (!response.ok) {
    return false;
  }

  return true;
};

export const loadCreativeHistoryFromCloud = async (accessToken: string): Promise<CreativeHistoryEntry[]> => {
  const response = await fetch(API_ENDPOINTS.analyses.load, {
    method: 'GET',
    headers: withAuthHeaders(accessToken),
  });

  if (!response.ok) {
    return [];
  }

  const payload = await response.json().catch(() => ({}));
  const analyses = Array.isArray(payload?.analyses) ? payload.analyses : [];

  return sortByNewest(
    analyses
      .map((item: unknown) => normalizeCloudRecord(item))
      .filter((entry: CreativeHistoryEntry | null): entry is CreativeHistoryEntry => entry !== null)
  );
};

export const deleteCreativeHistoryFromCloud = async (
  accessToken: string,
  id: string
): Promise<boolean> => {
  const response = await fetch(API_ENDPOINTS.analyses.delete(id), {
    method: 'DELETE',
    headers: withAuthHeaders(accessToken),
  });

  return response.ok;
};
