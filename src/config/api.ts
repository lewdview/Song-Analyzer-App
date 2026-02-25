/**
 * Centralized runtime API configuration.
 *
 * Supports:
 * - OG database mode (th3scr1b3 default Supabase project)
 * - Custom database mode (owner-provided Supabase credentials)
 * - Lyrics AI provider selection passed to the transcription service
 */

export type DatabaseMode = 'og' | 'custom';
export type LyricsAIProvider = 'local' | 'openai' | 'claude' | 'grok';

export interface RuntimeApiConfig {
  databaseMode: DatabaseMode;
  customProjectId: string;
  customAnonKey: string;
  serverFunctionPath: string;
  lyricsAiProvider: LyricsAIProvider;
}

export interface ActiveDatabaseConfig {
  mode: DatabaseMode;
  projectId: string;
  anonKey: string;
  serverFunctionPath: string;
  usesFallback: boolean;
}

const OG_SUPABASE_PROJECT_ID = 'pznmptudgicrmljjafex';
const OG_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6bm1wdHVkZ2ljcm1samphZmV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzMDE4ODUsImV4cCI6MjA3OTg3Nzg4NX0.syu1bbr9OJ5LxCnTrybLVgsjac4UOkFVdAHuvhKMY2g';
const DEFAULT_SERVER_FUNCTION_PATH = 'make-server-473d7342';
const RUNTIME_CONFIG_STORAGE_KEY = 'tool-drop-runtime-api-config-v1';

const VALID_DATABASE_MODES = new Set<DatabaseMode>(['og', 'custom']);
const VALID_LYRICS_PROVIDERS = new Set<LyricsAIProvider>(['local', 'openai', 'claude', 'grok']);

const getEnv = (key: string): string | undefined => {
  // Works in Vite/browser; safely returns undefined otherwise.
  try {
    const env = (import.meta as any)?.env;
    if (!env) return undefined;
    const value = env[key];
    return typeof value === 'string' ? value : undefined;
  } catch {
    return undefined;
  }
};

const normalizeDatabaseMode = (value: unknown): DatabaseMode => {
  const mode = String(value || '').trim().toLowerCase();
  return VALID_DATABASE_MODES.has(mode as DatabaseMode) ? (mode as DatabaseMode) : 'og';
};

const normalizeLyricsProvider = (value: unknown): LyricsAIProvider => {
  const provider = String(value || '').trim().toLowerCase();
  return VALID_LYRICS_PROVIDERS.has(provider as LyricsAIProvider)
    ? (provider as LyricsAIProvider)
    : 'local';
};

const trimOrEmpty = (value: unknown): string => String(value || '').trim();

const getDefaultRuntimeConfig = (): RuntimeApiConfig => ({
  databaseMode: normalizeDatabaseMode(getEnv('VITE_DATABASE_MODE') || 'og'),
  customProjectId: trimOrEmpty(getEnv('VITE_CUSTOM_SUPABASE_PROJECT_ID')),
  customAnonKey: trimOrEmpty(getEnv('VITE_CUSTOM_SUPABASE_ANON_KEY')),
  serverFunctionPath: trimOrEmpty(getEnv('VITE_SERVER_FUNCTION_PATH')) || DEFAULT_SERVER_FUNCTION_PATH,
  lyricsAiProvider: normalizeLyricsProvider(getEnv('VITE_LYRICS_AI_PROVIDER') || 'local'),
});

const hasWindow = () => typeof window !== 'undefined' && !!window.localStorage;

const parseStoredConfig = (): Partial<RuntimeApiConfig> => {
  if (!hasWindow()) return {};
  try {
    const raw = window.localStorage.getItem(RUNTIME_CONFIG_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
};

const normalizeRuntimeConfig = (candidate: Partial<RuntimeApiConfig>): RuntimeApiConfig => {
  const defaults = getDefaultRuntimeConfig();
  return {
    databaseMode: normalizeDatabaseMode(candidate.databaseMode ?? defaults.databaseMode),
    customProjectId: trimOrEmpty(candidate.customProjectId ?? defaults.customProjectId),
    customAnonKey: trimOrEmpty(candidate.customAnonKey ?? defaults.customAnonKey),
    serverFunctionPath:
      trimOrEmpty(candidate.serverFunctionPath ?? defaults.serverFunctionPath) || DEFAULT_SERVER_FUNCTION_PATH,
    lyricsAiProvider: normalizeLyricsProvider(candidate.lyricsAiProvider ?? defaults.lyricsAiProvider),
  };
};

export const getRuntimeApiConfig = (): RuntimeApiConfig =>
  normalizeRuntimeConfig({
    ...getDefaultRuntimeConfig(),
    ...parseStoredConfig(),
  });

export const saveRuntimeApiConfig = (updates: Partial<RuntimeApiConfig>): RuntimeApiConfig => {
  const merged = normalizeRuntimeConfig({
    ...getRuntimeApiConfig(),
    ...updates,
  });

  if (hasWindow()) {
    window.localStorage.setItem(RUNTIME_CONFIG_STORAGE_KEY, JSON.stringify(merged));
  }
  return merged;
};

export const resetRuntimeApiConfig = (): RuntimeApiConfig => {
  const defaults = getDefaultRuntimeConfig();
  if (hasWindow()) {
    window.localStorage.removeItem(RUNTIME_CONFIG_STORAGE_KEY);
  }
  return defaults;
};

export const getActiveDatabaseConfig = (): ActiveDatabaseConfig => {
  const runtime = getRuntimeApiConfig();
  const customConfigured = Boolean(runtime.customProjectId && runtime.customAnonKey);

  if (runtime.databaseMode === 'custom' && customConfigured) {
    return {
      mode: 'custom',
      projectId: runtime.customProjectId,
      anonKey: runtime.customAnonKey,
      serverFunctionPath: runtime.serverFunctionPath,
      usesFallback: false,
    };
  }

  return {
    mode: 'og',
    projectId: OG_SUPABASE_PROJECT_ID,
    anonKey: OG_SUPABASE_ANON_KEY,
    serverFunctionPath: runtime.serverFunctionPath,
    usesFallback: runtime.databaseMode === 'custom',
  };
};

export const getSupabaseBaseUrl = () => {
  const db = getActiveDatabaseConfig();
  return `https://${db.projectId}.supabase.co`;
};

export const getEdgeFunctionUrl = () => {
  const db = getActiveDatabaseConfig();
  return `${getSupabaseBaseUrl()}/functions/v1/${db.serverFunctionPath}`;
};

export const getWhisperServiceUrl = () =>
  (getEnv('VITE_WHISPER_SERVICE_URL') || 'http://localhost:3001').replace(/\/$/, '');

export const getLyricsAiProvider = (): LyricsAIProvider => getRuntimeApiConfig().lyricsAiProvider;

// Backwards-compatible exports (OG defaults)
export const SUPABASE_PROJECT_ID = OG_SUPABASE_PROJECT_ID;
export const SUPABASE_ANON_KEY = OG_SUPABASE_ANON_KEY;
export const SERVER_FUNCTION_PATH = DEFAULT_SERVER_FUNCTION_PATH;

// API Endpoints (dynamic getters so runtime config changes apply without rebuild)
export const API_ENDPOINTS = {
  // Health
  get health() {
    return `${getEdgeFunctionUrl()}/health`;
  },

  // Transcription
  get transcribe() {
    return `${getWhisperServiceUrl()}/transcribe`;
  },

  // Analyses
  analyses: {
    get save() {
      return `${getEdgeFunctionUrl()}/analyses/save`;
    },
    get load() {
      return `${getEdgeFunctionUrl()}/analyses/load`;
    },
    delete: (id: string) => `${getEdgeFunctionUrl()}/analyses/${id}`,
    check: (id: string) => `${getEdgeFunctionUrl()}/analyses/check/${id}`,
    get checkHash() {
      return `${getEdgeFunctionUrl()}/analyses/check-hash`;
    },
    get maintenance() {
      return `${getEdgeFunctionUrl()}/analyses/maintenance`;
    },
    get deduplicate() {
      return `${getEdgeFunctionUrl()}/analyses/deduplicate`;
    },
    get removeNoHash() {
      return `${getEdgeFunctionUrl()}/analyses/remove-no-hash`;
    },
  },

  // Audio Storage
  audio: {
    get upload() {
      return `${getEdgeFunctionUrl()}/audio/upload`;
    },
    delete: (analysisId: string) => `${getEdgeFunctionUrl()}/audio/${analysisId}`,
  },

  // Scheduler
  scheduler: {
    get posts() {
      return `${getEdgeFunctionUrl()}/scheduler/posts`;
    },
    post: (id: string) => `${getEdgeFunctionUrl()}/scheduler/posts/${id}`,
    publish: (id: string) => `${getEdgeFunctionUrl()}/scheduler/publish/${id}`,
    get upcoming() {
      return `${getEdgeFunctionUrl()}/scheduler/upcoming`;
    },
    get stats() {
      return `${getEdgeFunctionUrl()}/scheduler/stats`;
    },
  },

  // Social Media OAuth
  social: {
    connect: (platform: string) => `${getEdgeFunctionUrl()}/social/${platform}/connect`,
    callback: (platform: string) => `${getEdgeFunctionUrl()}/social/${platform}/callback`,
    disconnect: (platform: string) => `${getEdgeFunctionUrl()}/social/${platform}/disconnect`,
    get status() {
      return `${getEdgeFunctionUrl()}/social/status`;
    },
  },
} as const;

// Default request headers
export const getAuthHeaders = () => {
  const db = getActiveDatabaseConfig();
  return {
    Authorization: `Bearer ${db.anonKey}`,
    apikey: db.anonKey,
  };
};

export const getJsonHeaders = () => ({
  ...getAuthHeaders(),
  'Content-Type': 'application/json',
});

