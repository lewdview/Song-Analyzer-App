/**
 * Centralized API configuration
 */

// Supabase project configuration
export const SUPABASE_PROJECT_ID = 'pznmptudgicrmljjafex';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6bm1wdHVkZ2ljcm1samphZmV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzMDE4ODUsImV4cCI6MjA3OTg3Nzg4NX0.syu1bbr9OJ5LxCnTrybLVgsjac4UOkFVdAHuvhKMY2g';

// Server function path - centralized so it can be changed in one place
export const SERVER_FUNCTION_PATH = 'make-server-473d7342';

// Base URLs
export const getSupabaseBaseUrl = () => `https://${SUPABASE_PROJECT_ID}.supabase.co`;
export const getEdgeFunctionUrl = () => `${getSupabaseBaseUrl()}/functions/v1/${SERVER_FUNCTION_PATH}`;

// API Endpoints
export const API_ENDPOINTS = {
  // Health
  health: `${getEdgeFunctionUrl()}/health`,
  
  // Transcription
  transcribe: `${getEdgeFunctionUrl()}/transcribe`,
  
  // Analyses
  analyses: {
    save: `${getEdgeFunctionUrl()}/analyses/save`,
    load: `${getEdgeFunctionUrl()}/analyses/load`,
    delete: (id: string) => `${getEdgeFunctionUrl()}/analyses/${id}`,
    check: (id: string) => `${getEdgeFunctionUrl()}/analyses/check/${id}`,
    checkHash: `${getEdgeFunctionUrl()}/analyses/check-hash`,
    maintenance: `${getEdgeFunctionUrl()}/analyses/maintenance`,
    deduplicate: `${getEdgeFunctionUrl()}/analyses/deduplicate`,
    removeNoHash: `${getEdgeFunctionUrl()}/analyses/remove-no-hash`,
  },
  
  // Audio Storage
  audio: {
    upload: `${getEdgeFunctionUrl()}/audio/upload`,
    delete: (analysisId: string) => `${getEdgeFunctionUrl()}/audio/${analysisId}`,
  },
  
  // Scheduler (365 Days of Light and Dark)
  scheduler: {
    posts: `${getEdgeFunctionUrl()}/scheduler/posts`,
    post: (id: string) => `${getEdgeFunctionUrl()}/scheduler/posts/${id}`,
    publish: (id: string) => `${getEdgeFunctionUrl()}/scheduler/publish/${id}`,
    upcoming: `${getEdgeFunctionUrl()}/scheduler/upcoming`,
    stats: `${getEdgeFunctionUrl()}/scheduler/stats`,
  },
  
  // Social Media OAuth
  social: {
    connect: (platform: string) => `${getEdgeFunctionUrl()}/social/${platform}/connect`,
    callback: (platform: string) => `${getEdgeFunctionUrl()}/social/${platform}/callback`,
    disconnect: (platform: string) => `${getEdgeFunctionUrl()}/social/${platform}/disconnect`,
    status: `${getEdgeFunctionUrl()}/social/status`,
  },
} as const;

// Default request headers
export const getAuthHeaders = () => ({
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'apikey': SUPABASE_ANON_KEY,
});

export const getJsonHeaders = () => ({
  ...getAuthHeaders(),
  'Content-Type': 'application/json',
});
