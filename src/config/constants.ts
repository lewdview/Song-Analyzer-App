/**
 * Application-wide constants
 */

// App Info
export const APP_NAME = 'Song Analyzer';
export const APP_VERSION = '0.2.0';
export const APP_AUTHOR = 'th3scr1b3';

// 365 Days Campaign
export const CAMPAIGN_NAME = '365 Days of Light and Dark';
export const CAMPAIGN_HASHTAG = '#365DaysOfLightAndDark';
export const CAMPAIGN_HANDLE = '@th3scr1b3';

// File limits
export const MAX_FILE_SIZE_MB = 25;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const SUPPORTED_AUDIO_TYPES = ['.mp3', '.wav'];
export const SUPPORTED_MIME_TYPES = ['audio/mpeg', 'audio/wav', 'audio/wave', 'audio/x-wav'];

// Audio analysis
export const WAVEFORM_SAMPLE_POINTS = 200;
export const DEFAULT_SAMPLE_RATE = 44100;
export const WHISPER_SAMPLE_RATE = 16000;

// Tempo detection
export const MIN_BPM = 60;
export const MAX_BPM = 180;

// UI
export const ANALYSIS_BATCH_DELAY_MS = 500;
export const UPLOAD_PROGRESS_STEPS = 20;
export const UPLOAD_PROGRESS_DELAY_MS = 30;

// Social Media Platforms
export const SOCIAL_PLATFORMS = {
  twitter: {
    id: 'twitter',
    name: 'X (Twitter)',
    icon: 'twitter',
    maxCharacters: 280,
    maxMediaSize: 512 * 1024 * 1024, // 512MB for video
    supportedMediaTypes: ['audio', 'video', 'image'],
    color: '#000000',
  },
  instagram: {
    id: 'instagram',
    name: 'Instagram',
    icon: 'instagram',
    maxCharacters: 2200,
    maxMediaSize: 4 * 1024 * 1024 * 1024, // 4GB for video
    supportedMediaTypes: ['video', 'image'],
    color: '#E4405F',
  },
  tiktok: {
    id: 'tiktok',
    name: 'TikTok',
    icon: 'tiktok',
    maxCharacters: 2200,
    maxMediaSize: 4 * 1024 * 1024 * 1024, // 4GB
    supportedMediaTypes: ['video'],
    color: '#000000',
  },
  youtube: {
    id: 'youtube',
    name: 'YouTube',
    icon: 'youtube',
    maxCharacters: 5000,
    maxMediaSize: 256 * 1024 * 1024 * 1024, // 256GB
    supportedMediaTypes: ['video'],
    color: '#FF0000',
  },
  facebook: {
    id: 'facebook',
    name: 'Facebook',
    icon: 'facebook',
    maxCharacters: 63206,
    maxMediaSize: 10 * 1024 * 1024 * 1024, // 10GB for video
    supportedMediaTypes: ['audio', 'video', 'image'],
    color: '#1877F2',
  },
  soundcloud: {
    id: 'soundcloud',
    name: 'SoundCloud',
    icon: 'soundcloud',
    maxCharacters: 5000,
    maxMediaSize: 5 * 1024 * 1024 * 1024, // 5GB
    supportedMediaTypes: ['audio'],
    color: '#FF5500',
  },
  spotify: {
    id: 'spotify',
    name: 'Spotify',
    icon: 'spotify',
    maxCharacters: 0, // Not applicable - uses distribution
    maxMediaSize: 0,
    supportedMediaTypes: ['audio'],
    color: '#1DB954',
  },
} as const;

export type SocialPlatformId = keyof typeof SOCIAL_PLATFORMS;

// Post statuses
export const POST_STATUS = {
  DRAFT: 'draft',
  SCHEDULED: 'scheduled',
  PUBLISHING: 'publishing',
  PUBLISHED: 'published',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export type PostStatus = typeof POST_STATUS[keyof typeof POST_STATUS];

// Local storage keys
export const STORAGE_KEYS = {
  THEME: 'song-analyzer-theme',
  CONNECTED_PLATFORMS: 'song-analyzer-connected-platforms',
  DRAFT_POSTS: 'song-analyzer-draft-posts',
  USER_PREFERENCES: 'song-analyzer-preferences',
} as const;
