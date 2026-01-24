/**
 * Consolidated type definitions for Song Analyzer App
 */

import type { PostStatus, SocialPlatformId } from '@/config/constants';

// ============================================================================
// Audio Analysis Types
// ============================================================================

export interface LyricSegment {
  start: number; // seconds
  end: number;   // seconds
  text: string;
}

export interface LyricWord {
  start: number; // seconds
  end: number;   // seconds
  word: string;
}

export interface LyricsAnalysis {
  mood: string[];
  emotion: string[];
  themes: string[];
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  sentimentScore: number; // -1 to 1
  energyFromLyrics: number; // 0 to 1
  valenceFromLyrics: number; // 0 to 1
}

export interface SongAnalysis {
  id: string;
  fileName: string;
  title?: string; // Display title (cleaned up from fileName)
  fileSize: number;
  // SHA-256 hash of the audio file content for duplicate detection
  fileHash?: string;
  duration: number;
  tempo: number;
  key: string;
  energy: number;
  danceability: number;
  valence: number;
  acousticness: number;
  instrumentalness: number;
  loudness: number;
  speechiness: number;
  liveness: number;
  timeSignature: string;
  genre: string[];
  mood: string[];
  lyrics: string;
  lyricsSegments?: LyricSegment[];
  lyricsWords?: LyricWord[];
  lyricsAnalysis?: LyricsAnalysis;
  waveformData: number[];
  analyzedAt: string;
  // Session-only URL for playback (blob: URL). Do not persist to DB.
  audioUrl?: string;
  // Persisted URL for audio stored in Supabase Storage.
  storedAudioUrl?: string;
}

export interface SpectralFeatures {
  zcr: number;
  spectralCentroid: number;
  spectralRolloff: number;
  spectralFlatness: number;
  spectralBandwidth: number;
  lowFreqEnergy: number;
  midFreqEnergy: number;
  highFreqEnergy: number;
  dynamicRange: number;
}

// ============================================================================
// UI State Types
// ============================================================================

export type ActiveTab = 'results' | 'collection' | 'scheduler';

export interface FilterState {
  searchQuery: string;
  genre: string;
  mood: string;
}

export interface UploadState {
  isUploading: boolean;
  progress: number;
  files: File[];
}

export interface AnalysisState {
  isAnalyzing: boolean;
  currentFile: string;
  progress: number;
}

export interface MaintenanceStats {
  totalAnalyses: number;
  indexBefore: number;
  indexAfter: number;
  orphanedIndexEntries: number;
  missingIndexEntries: number;
  orphanedIds: string[];
  addedIds: string[];
}

export interface DeduplicateStats {
  scanned: number;
  duplicatesRemoved: number;
  uniqueFiles: number;
  byHash: number;
  withoutHash: number;
  removedIds: string[];
}

// ============================================================================
// Scheduler Types (365 Days of Light and Dark)
// ============================================================================

export interface ScheduledPost {
  id: string;
  songId: string;
  songName: string;
  platforms: SocialPlatformId[];
  scheduledDate: string; // ISO date string
  scheduledTime: string; // HH:MM format
  caption: string;
  hashtags: string[];
  mediaUrl?: string;
  thumbnailUrl?: string;
  status: PostStatus;
  dayNumber: number; // 1-365 for the campaign
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  error?: string;
}

export interface ScheduledPostCreate {
  songId: string;
  songName: string;
  platforms: SocialPlatformId[];
  scheduledDate: string;
  scheduledTime: string;
  caption: string;
  hashtags: string[];
  dayNumber: number;
  mediaUrl?: string;
  thumbnailUrl?: string;
}

export interface ScheduledPostUpdate {
  platforms?: SocialPlatformId[];
  scheduledDate?: string;
  scheduledTime?: string;
  caption?: string;
  hashtags?: string[];
  status?: PostStatus;
  mediaUrl?: string;
  thumbnailUrl?: string;
}

export interface CalendarDay {
  date: Date;
  dayNumber: number;
  post?: ScheduledPost;
  isToday: boolean;
  isPast: boolean;
  isSelected: boolean;
}

export interface SchedulerStats {
  totalPosts: number;
  scheduled: number;
  published: number;
  failed: number;
  draft: number;
  upcoming: ScheduledPost[];
}

// ============================================================================
// Social Media Types
// ============================================================================

export interface SocialPlatformConnection {
  platformId: SocialPlatformId;
  isConnected: boolean;
  username?: string;
  profileUrl?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  connectedAt?: string;
}

export interface SocialMediaStatus {
  platforms: Record<SocialPlatformId, SocialPlatformConnection>;
}

export interface PublishResult {
  platformId: SocialPlatformId;
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string;
}

export interface TranscriptionResponse {
  transcription: string;
  segments?: LyricSegment[];
  words?: LyricWord[];
  lyricsAnalysis?: LyricsAnalysis;
  fileName: string;
}

export interface SaveAnalysesResponse {
  success: boolean;
  saved: number;
  skipped: number;
  message: string;
}

export interface LoadAnalysesResponse {
  analyses: SongAnalysis[];
  count: number;
}

export interface HashCheckResponse {
  found: boolean;
  fileHash: string;
  analysis?: SongAnalysis;
  hasTimestampedLyrics?: boolean;
  hasLyricsSegments?: boolean;
  needsReanalysis?: boolean;
}

// ============================================================================
// Component Props Types
// ============================================================================

export interface AnalysisResultsProps {
  analyses: SongAnalysis[];
  onDelete?: (id: string) => void;
}

export interface CollectionDashboardProps {
  analyses: SongAnalysis[];
}

export interface AudioAnalyzerProps {
  files: File[];
  onAnalysisComplete: (analysis: SongAnalysis) => void;
  onAllComplete: () => void;
  onCurrentFileChange: (fileName: string) => void;
}

export interface AudioPlayerProps {
  src: string;
  autoPlay?: boolean;
  onTimeUpdate?: (time: number) => void;
  onReady?: (element: HTMLAudioElement) => void;
}

export interface KaraokeLyricsProps {
  words: LyricWord[];
  segments?: LyricSegment[];
  currentTime: number;
  onWordClick?: (time: number) => void;
}

// ============================================================================
// Store Types
// ============================================================================

export interface AnalysisStore {
  // State
  analyses: SongAnalysis[];
  files: File[];
  isAnalyzing: boolean;
  isUploading: boolean;
  uploadProgress: number;
  currentFile: string;
  activeTab: ActiveTab;
  filters: FilterState;
  isLoadingHistory: boolean;
  isSaving: boolean;
  
  // Actions
  setAnalyses: (analyses: SongAnalysis[]) => void;
  addAnalysis: (analysis: SongAnalysis) => void;
  removeAnalysis: (id: string) => void;
  clearAnalyses: () => void;
  
  setFiles: (files: File[]) => void;
  addFiles: (files: File[]) => void;
  clearFiles: () => void;
  
  setIsAnalyzing: (value: boolean) => void;
  setIsUploading: (value: boolean) => void;
  setUploadProgress: (value: number) => void;
  setCurrentFile: (value: string) => void;
  setActiveTab: (tab: ActiveTab) => void;
  setFilters: (filters: Partial<FilterState>) => void;
  setIsLoadingHistory: (value: boolean) => void;
  setIsSaving: (value: boolean) => void;
  
  // Computed
  filteredAnalyses: () => SongAnalysis[];
  allGenres: () => string[];
  allMoods: () => string[];
}

export interface SchedulerStore {
  // State
  posts: ScheduledPost[];
  selectedDate: Date | null;
  selectedPost: ScheduledPost | null;
  isLoading: boolean;
  connectedPlatforms: SocialPlatformConnection[];
  
  // Actions
  setPosts: (posts: ScheduledPost[]) => void;
  addPost: (post: ScheduledPost) => void;
  updatePost: (id: string, updates: ScheduledPostUpdate) => void;
  removePost: (id: string) => void;
  
  setSelectedDate: (date: Date | null) => void;
  setSelectedPost: (post: ScheduledPost | null) => void;
  setIsLoading: (value: boolean) => void;
  setConnectedPlatforms: (platforms: SocialPlatformConnection[]) => void;
  
  // Computed
  getPostsByDate: (date: Date) => ScheduledPost[];
  getPostByDayNumber: (dayNumber: number) => ScheduledPost | undefined;
  getUpcomingPosts: (limit?: number) => ScheduledPost[];
}
