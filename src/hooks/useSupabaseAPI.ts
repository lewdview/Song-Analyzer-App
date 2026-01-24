import { useState, useCallback } from 'react';
import { API_ENDPOINTS, getAuthHeaders, getJsonHeaders } from '@/config/api';
import { logger } from '@/utils/logger';
import type {
  SongAnalysis,
  ScheduledPost,
  ScheduledPostCreate,
  ScheduledPostUpdate,
  SaveAnalysesResponse,
  LoadAnalysesResponse,
  HashCheckResponse,
  MaintenanceStats,
  DeduplicateStats,
} from '@/types';

const log = logger.scope('API');

interface ApiError {
  error: string;
  details?: string;
}

interface AudioUploadResponse {
  success: boolean;
  storedAudioUrl: string;
  path: string;
}

/**
 * Custom hook for Supabase API interactions
 */
export function useSupabaseAPI() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  // ============================================================================
  // Analyses API
  // ============================================================================

  /**
   * Upload an audio file to Supabase Storage for an analysis.
   * Returns the public URL where the audio is stored.
   */
  const uploadAudio = useCallback(async (analysisId: string, audioBlob: Blob, fileName: string): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, fileName);
      formData.append('analysisId', analysisId);

      const response = await fetch(API_ENDPOINTS.audio.upload, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      });

      if (!response.ok) {
        const errorData: ApiError = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Audio upload failed: ${response.status}`);
      }

      const data: AudioUploadResponse = await response.json();
      log.info(`Uploaded audio for ${analysisId}: ${data.storedAudioUrl}`);
      return data.storedAudioUrl;
    } catch (err) {
      log.error('Audio upload error:', err);
      // Don't fail the entire save if audio upload fails
      return null;
    }
  }, []);

  /**
   * Fetch audio blob from a blob: URL.
   */
  const fetchAudioBlob = async (blobUrl: string): Promise<Blob | null> => {
    try {
      const response = await fetch(blobUrl);
      return await response.blob();
    } catch (err) {
      log.error('Failed to fetch audio blob:', err);
      return null;
    }
  };

  // Maximum file size for audio upload (200MB - Supabase Pro limit)
  const MAX_AUDIO_UPLOAD_SIZE = 200 * 1024 * 1024;

  const saveAnalyses = useCallback(async (
    analyses: SongAnalysis[],
    options?: { uploadAudioFiles?: boolean }
  ): Promise<SaveAnalysesResponse | null> => {
    setIsLoading(true);
    setError(null);

    try {
      // Upload audio files SEQUENTIALLY to avoid overwhelming the server
      const analysesWithStoredAudio: SongAnalysis[] = [];
      let uploadedCount = 0;
      let skippedCount = 0;
      let failedCount = 0;
      
      for (const analysis of analyses) {
        // If we should upload audio and there's a blob URL but no stored URL yet
        if (options?.uploadAudioFiles && analysis.audioUrl?.startsWith('blob:') && !analysis.storedAudioUrl) {
          const blob = await fetchAudioBlob(analysis.audioUrl);
          if (blob) {
            // Check file size before uploading
            if (blob.size > MAX_AUDIO_UPLOAD_SIZE) {
              log.warn(`Skipping audio upload for ${analysis.fileName}: file too large (${(blob.size / 1024 / 1024).toFixed(1)}MB > 200MB limit)`);
              skippedCount++;
              analysesWithStoredAudio.push(analysis);
              continue;
            }
            
            const storedUrl = await uploadAudio(analysis.id, blob, analysis.fileName);
            if (storedUrl) {
              uploadedCount++;
              analysesWithStoredAudio.push({ ...analysis, storedAudioUrl: storedUrl });
              continue;
            } else {
              failedCount++;
            }
          } else {
            failedCount++;
          }
        }
        analysesWithStoredAudio.push(analysis);
      }
      
      if (options?.uploadAudioFiles) {
        log.info(`Audio upload complete: ${uploadedCount} uploaded, ${skippedCount} skipped (too large), ${failedCount} failed`);
      }

      // Strip session-only fields (audioUrl) before saving, but keep storedAudioUrl
      const sanitized = analysesWithStoredAudio.map(({ audioUrl, ...rest }) => rest);

      const response = await fetch(API_ENDPOINTS.analyses.save, {
        method: 'POST',
        headers: getJsonHeaders(),
        body: JSON.stringify({ analyses: sanitized }),
      });

      if (!response.ok) {
        const errorData: ApiError = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Save failed: ${response.status}`);
      }

      const data: SaveAnalysesResponse = await response.json();
      log.info(`Saved ${data.saved} analyses`);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save analyses';
      log.error('Save analyses error:', err);
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [uploadAudio]);

  const loadAnalyses = useCallback(async (): Promise<SongAnalysis[]> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(API_ENDPOINTS.analyses.load, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData: ApiError = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Load failed: ${response.status}`);
      }

      const data: LoadAnalysesResponse = await response.json();
      log.info(`Loaded ${data.count} analyses`);
      
      // For loaded analyses, use storedAudioUrl as audioUrl for playback
      const analysesWithPlayback = data.analyses.map((analysis) => ({
        ...analysis,
        // If there's a stored audio URL, use it for playback
        audioUrl: analysis.storedAudioUrl || analysis.audioUrl,
      }));
      
      return analysesWithPlayback;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load analyses';
      log.error('Load analyses error:', err);
      setError(message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deleteAnalysis = useCallback(async (id: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(API_ENDPOINTS.analyses.delete(id), {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData: ApiError = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Delete failed: ${response.status}`);
      }

      log.info(`Deleted analysis: ${id}`);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete analysis';
      log.error('Delete analysis error:', err);
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Check if an analysis already exists for a file by its hash.
   * Returns info about the existing analysis including whether it has timestamped lyrics.
   * This does NOT set loading state since it's typically called during batch analysis.
   */
  const checkAnalysisByHash = useCallback(async (fileHash: string): Promise<HashCheckResponse | null> => {
    try {
      const response = await fetch(API_ENDPOINTS.analyses.checkHash, {
        method: 'POST',
        headers: getJsonHeaders(),
        body: JSON.stringify({ fileHash }),
      });

      if (!response.ok) {
        // Try to get error details, fall back to status text
        let errorMessage = `Hash check failed: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          if (errorData.error) errorMessage = errorData.error;
          if (errorData.details) errorMessage += `: ${errorData.details}`;
        } catch {
          // If JSON parsing fails, try text
          try {
            const text = await response.text();
            if (text) errorMessage += ` - ${text.substring(0, 200)}`;
          } catch {
            // Ignore
          }
        }
        throw new Error(errorMessage);
      }

      const data: HashCheckResponse = await response.json();
      
      if (data.found) {
        log.info(`Found existing analysis for hash ${fileHash.substring(0, 8)}..., needsReanalysis: ${data.needsReanalysis}`);
      }
      
      return data;
    } catch (err) {
      // Log more details about the error
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error(`Check hash error: ${errorMsg}`);
      // Return null on error - we'll analyze the file anyway
      return null;
    }
  }, []);

  const runMaintenance = useCallback(async (): Promise<MaintenanceStats | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(API_ENDPOINTS.analyses.maintenance, {
        method: 'POST',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData: ApiError = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Maintenance failed: ${response.status}`);
      }

      const data = await response.json();
      log.info('Database maintenance complete', data.stats);
      return data.stats;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to run maintenance';
      log.error('Maintenance error:', err);
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deduplicateAnalyses = useCallback(async (): Promise<DeduplicateStats | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(API_ENDPOINTS.analyses.deduplicate, {
        method: 'POST',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData: ApiError = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Deduplicate failed: ${response.status}`);
      }

      const data = await response.json();
      log.info('Deduplication complete', data.stats);
      return data.stats;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to deduplicate';
      log.error('Deduplicate error:', err);
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const removeNoHashAnalyses = useCallback(async (): Promise<{ removed: number; remaining: number } | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(API_ENDPOINTS.analyses.removeNoHash, {
        method: 'POST',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData: ApiError = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Remove no-hash failed: ${response.status}`);
      }

      const data = await response.json();
      log.info('Remove no-hash complete', data.stats);
      return data.stats;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove no-hash analyses';
      log.error('Remove no-hash error:', err);
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ============================================================================
  // Scheduler API (365 Days of Light and Dark)
  // ============================================================================

  const loadScheduledPosts = useCallback(async (): Promise<ScheduledPost[]> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(API_ENDPOINTS.scheduler.posts, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData: ApiError = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Load posts failed: ${response.status}`);
      }

      const data = await response.json();
      log.info(`Loaded ${data.posts?.length ?? 0} scheduled posts`);
      return data.posts || [];
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load scheduled posts';
      log.error('Load posts error:', err);
      setError(message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createScheduledPost = useCallback(async (post: ScheduledPostCreate): Promise<ScheduledPost | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(API_ENDPOINTS.scheduler.posts, {
        method: 'POST',
        headers: getJsonHeaders(),
        body: JSON.stringify(post),
      });

      if (!response.ok) {
        const errorData: ApiError = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Create post failed: ${response.status}`);
      }

      const data = await response.json();
      log.info(`Created scheduled post: ${data.post?.id}`);
      return data.post;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create scheduled post';
      log.error('Create post error:', err);
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateScheduledPost = useCallback(async (id: string, updates: ScheduledPostUpdate): Promise<ScheduledPost | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(API_ENDPOINTS.scheduler.post(id), {
        method: 'PUT',
        headers: getJsonHeaders(),
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData: ApiError = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Update post failed: ${response.status}`);
      }

      const data = await response.json();
      log.info(`Updated scheduled post: ${id}`);
      return data.post;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update scheduled post';
      log.error('Update post error:', err);
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deleteScheduledPost = useCallback(async (id: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(API_ENDPOINTS.scheduler.post(id), {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData: ApiError = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Delete post failed: ${response.status}`);
      }

      log.info(`Deleted scheduled post: ${id}`);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete scheduled post';
      log.error('Delete post error:', err);
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const publishPost = useCallback(async (id: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(API_ENDPOINTS.scheduler.publish(id), {
        method: 'POST',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData: ApiError = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Publish failed: ${response.status}`);
      }

      log.info(`Published post: ${id}`);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to publish post';
      log.error('Publish error:', err);
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ============================================================================
  // Social Media API
  // ============================================================================

  const getSocialStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(API_ENDPOINTS.social.status, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData: ApiError = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Get status failed: ${response.status}`);
      }

      const data = await response.json();
      log.info('Loaded social media status');
      return data.platforms || {};
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get social media status';
      log.error('Social status error:', err);
      setError(message);
      return {};
    } finally {
      setIsLoading(false);
    }
  }, []);

  const connectPlatform = useCallback(async (platform: string): Promise<string | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(API_ENDPOINTS.social.connect(platform), {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData: ApiError = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Connect failed: ${response.status}`);
      }

      const data = await response.json();
      log.info(`Got OAuth URL for ${platform}`);
      return data.authUrl;
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to connect ${platform}`;
      log.error('Connect platform error:', err);
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const disconnectPlatform = useCallback(async (platform: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(API_ENDPOINTS.social.disconnect(platform), {
        method: 'POST',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData: ApiError = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Disconnect failed: ${response.status}`);
      }

      log.info(`Disconnected ${platform}`);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to disconnect ${platform}`;
      log.error('Disconnect platform error:', err);
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isLoading,
    error,
    clearError,

    // Analyses
    saveAnalyses,
    loadAnalyses,
    deleteAnalysis,
    checkAnalysisByHash,
    runMaintenance,
    deduplicateAnalyses,
    removeNoHashAnalyses,

    // Scheduler
    loadScheduledPosts,
    createScheduledPost,
    updateScheduledPost,
    deleteScheduledPost,
    publishPost,

    // Social Media
    getSocialStatus,
    connectPlatform,
    disconnectPlatform,
  };
}

export default useSupabaseAPI;
