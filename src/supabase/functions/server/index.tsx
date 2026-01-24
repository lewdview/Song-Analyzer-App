import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { logger } from 'npm:hono/logger';
import { createClient } from 'jsr:@supabase/supabase-js@2.49.8';
import { analyzeLyricsWithAI } from './lyrics-analyzer.ts';
import * as kv from './kv_store.ts';
import { loadConfig, logEnabledFeatures, isFeatureEnabled } from './config.ts';

const app = new Hono();
const config = loadConfig();

// Log enabled features on startup
logEnabledFeatures(config);

// ============================================================================
// AUDIO STORAGE CONFIGURATION
// ============================================================================

const AUDIO_BUCKET = 'song-audio';

// Helper to get Supabase client for storage operations
const getStorageClient = () => {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
};

// Enable CORS for all routes (explicit config); handle OPTIONS preflight
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['*', 'Authorization', 'apikey', 'Content-Type'],
}));
app.options('*', (c) => c.text('', 204));
app.use('*', logger(console.log));

// Health check
app.get('/make-server-473d7342/health', (c) => {
  return c.json({ status: 'ok', message: 'Server is running' });
});

// Shared handler for transcription
const transcribeHandler = async (c: any) => {
  try {
    const formData = await c.req.formData();
    const audioFile = formData.get('audio') as File;
    
    if (!audioFile) {
      return c.json({ error: 'No audio file provided' }, 400);
    }

    // Use local Whisper transcription service
    const whisperServiceUrl = Deno.env.get('WHISPER_SERVICE_URL') || 'http://localhost:3001';
    
    console.log(`Sending transcription request to local Whisper service: ${whisperServiceUrl}/transcribe`);
    console.log(`File: ${audioFile.name}, size: ${audioFile.size} bytes`);

    // Create FormData for local Whisper service
    const whisperFormData = new FormData();
    whisperFormData.append('audio', audioFile);

    // Call local Whisper transcription service
    const response = await fetch(`${whisperServiceUrl}/transcribe`, {
      method: 'POST',
      body: whisperFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Whisper service error (${response.status}): ${errorText}`);
      return c.json({ 
        error: `Transcription service error: ${response.status}`,
        details: errorText 
      }, response.status);
    }

    // Parse response from local Whisper service
    const data = await response.json();
    const transcription = data.transcription || '';
    let segments = data.segments || [];
    const words = data.words || [];

    console.log(`Transcription completed successfully for ${audioFile.name}`);

    // Analyze the lyrics for mood, emotion, and themes (optional, if Sonoteller key is available)
    let lyricsAnalysis = null;
    const sonotellerKey = Deno.env.get('SONOTELLER_RAPID_KEY');
    if (transcription && transcription.length > 10 && sonotellerKey) {
      try {
        console.log('Analyzing lyrics for mood and emotion with Sonoteller.ai...');
        lyricsAnalysis = await analyzeLyricsWithAI(transcription, '');
        console.log('Lyrics analysis completed');
      } catch (analysisError) {
        console.warn('Lyrics analysis failed (optional feature), continuing without analysis:', analysisError);
      }
    } else if (transcription && transcription.length > 10) {
      console.log('Skipping lyrics analysis: SONOTELLER_RAPID_KEY not configured (optional feature)');
    }

    return c.json({ 
      transcription,
      segments,
      words,
      lyricsAnalysis,
      fileName: audioFile.name 
    });

  } catch (error) {
    console.error('Transcription server error:', error);
    return c.json({ 
      error: 'Failed to transcribe audio',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
};

// Routes: legacy and simple aliases
app.post('/', transcribeHandler);
app.post('/make-server-473d7342/transcribe', transcribeHandler);
app.post('/transcribe', transcribeHandler);

// Save song analysis to permanent storage
app.post('/make-server-473d7342/analyses/save', async (c) => {
  try {
    const body = await c.req.json();
    const { analyses } = body;

    if (!analyses || !Array.isArray(analyses)) {
      return c.json({ error: 'Invalid analyses data' }, 400);
    }

    // Save each analysis with a unique key
    const savedKeys: string[] = [];
    const newIds: string[] = [];
    
    for (const analysis of analyses) {
      const key = `analysis:${analysis.id}`;
      
      // Check if this analysis already exists
      const existing = await kv.get(key);
      if (!existing) {
        await kv.set(key, analysis);
        savedKeys.push(key);
        newIds.push(analysis.id);
        console.log(`Saved new analysis: ${key} - ${analysis.fileName}`);
      } else {
        console.log(`Analysis already exists, skipping: ${key}`);
      }
    }

    // Update the index only with new IDs
    if (newIds.length > 0) {
      const indexKey = 'analyses:index';
      const existingIndex = await kv.get(indexKey) || [];
      const updatedIndex = [...new Set([...existingIndex, ...newIds])];
      await kv.set(indexKey, updatedIndex);
    }

    return c.json({ 
      success: true,
      saved: savedKeys.length,
      skipped: analyses.length - savedKeys.length,
      message: `Successfully saved ${savedKeys.length} new analyses (${analyses.length - savedKeys.length} already existed)`
    });

  } catch (error) {
    console.error('Save analyses error:', error);
    return c.json({ 
      error: 'Failed to save analyses',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Update existing analyses (for updating metadata like title)
app.put('/make-server-473d7342/analyses/update', async (c) => {
  try {
    const body = await c.req.json();
    const { analyses } = body;

    if (!analyses || !Array.isArray(analyses)) {
      return c.json({ error: 'Invalid analyses data' }, 400);
    }

    // Update each analysis
    const updatedKeys: string[] = [];
    const notFoundIds: string[] = [];
    
    for (const analysis of analyses) {
      const key = `analysis:${analysis.id}`;
      
      // Check if this analysis exists
      const existing = await kv.get(key);
      if (existing) {
        // Merge the update with existing data
        const updated = { ...existing, ...analysis };
        await kv.set(key, updated);
        updatedKeys.push(key);
        console.log(`Updated analysis: ${key} - ${analysis.fileName || existing.fileName}`);
      } else {
        notFoundIds.push(analysis.id);
        console.log(`Analysis not found for update: ${key}`);
      }
    }

    return c.json({ 
      success: true,
      updated: updatedKeys.length,
      notFound: notFoundIds.length,
      notFoundIds,
      message: `Successfully updated ${updatedKeys.length} analyses (${notFoundIds.length} not found)`
    });

  } catch (error) {
    console.error('Update analyses error:', error);
    return c.json({ 
      error: 'Failed to update analyses',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Load all saved analyses
app.get('/make-server-473d7342/analyses/load', async (c) => {
  try {
    // Get the index of all analysis IDs
    const indexKey = 'analyses:index';
    const analysisIds = await kv.get(indexKey) || [];

    if (analysisIds.length === 0) {
      return c.json({ analyses: [] });
    }

    // Fetch all analyses
    const keys = analysisIds.map((id: string) => `analysis:${id}`);
    const analyses = await kv.mget(keys);

    console.log(`Loaded ${analyses.length} analyses from storage`);

    return c.json({ 
      analyses: analyses.filter(a => a !== null),
      count: analyses.filter(a => a !== null).length
    });

  } catch (error) {
    console.error('Load analyses error:', error);
    return c.json({ 
      error: 'Failed to load analyses',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Delete a specific analysis (also cleans up stored audio)
app.delete('/make-server-473d7342/analyses/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const key = `analysis:${id}`;

    // Delete the analysis from KV store
    await kv.del(key);

    // Update the index
    const indexKey = 'analyses:index';
    const existingIndex = await kv.get(indexKey) || [];
    const updatedIndex = existingIndex.filter((analysisId: string) => analysisId !== id);
    await kv.set(indexKey, updatedIndex);

    // Also delete any stored audio file for this analysis
    try {
      const supabase = getStorageClient();
      const { data: files } = await supabase.storage
        .from(AUDIO_BUCKET)
        .list('', { search: id });

      if (files && files.length > 0) {
        const filesToDelete = files
          .filter((f: { name: string }) => f.name.startsWith(id))
          .map((f: { name: string }) => f.name);

        if (filesToDelete.length > 0) {
          await supabase.storage.from(AUDIO_BUCKET).remove(filesToDelete);
          console.log(`Deleted audio files for analysis ${id}: ${filesToDelete.join(', ')}`);
        }
      }
    } catch (audioErr) {
      // Log but don't fail if audio cleanup fails
      console.warn(`Failed to delete audio for analysis ${id}:`, audioErr);
    }

    console.log(`Deleted analysis: ${key}`);

    return c.json({ 
      success: true,
      message: `Analysis ${id} deleted successfully`
    });

  } catch (error) {
    console.error('Delete analysis error:', error);
    return c.json({ 
      error: 'Failed to delete analysis',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Check if analysis exists by ID
app.get('/make-server-473d7342/analyses/check/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const key = `analysis:${id}`;
    const analysis = await kv.get(key);
    
    return c.json({ 
      exists: analysis !== null,
      id
    });
  } catch (error) {
    console.error('Check analysis error:', error);
    return c.json({ 
      error: 'Failed to check analysis',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Check if analysis exists by file hash (for duplicate detection)
// Returns the existing analysis if found, with info about whether it has timestamped lyrics
app.post('/make-server-473d7342/analyses/check-hash', async (c) => {
  try {
    const body = await c.req.json();
    const { fileHash } = body;

    if (!fileHash || typeof fileHash !== 'string') {
      return c.json({ error: 'fileHash is required' }, 400);
    }

    // Get all analyses and search for matching hash
    const indexKey = 'analyses:index';
    const analysisIds = await kv.get(indexKey) || [];

    if (analysisIds.length === 0) {
      return c.json({ 
        found: false,
        fileHash
      });
    }

    // Fetch all analyses to search for hash
    const keys = analysisIds.map((id: string) => `analysis:${id}`);
    const analyses = await kv.mget(keys);
    
    // Find analysis with matching hash
    const matchingAnalysis = analyses.find((a: any) => a && a.fileHash === fileHash);

    if (!matchingAnalysis) {
      return c.json({ 
        found: false,
        fileHash
      });
    }

    // Check if the analysis has timestamped lyrics
    const hasTimestampedLyrics = Boolean(
      matchingAnalysis.lyricsWords && 
      Array.isArray(matchingAnalysis.lyricsWords) && 
      matchingAnalysis.lyricsWords.length > 0
    );

    const hasLyricsSegments = Boolean(
      matchingAnalysis.lyricsSegments && 
      Array.isArray(matchingAnalysis.lyricsSegments) && 
      matchingAnalysis.lyricsSegments.length > 0
    );

    console.log(`Found existing analysis for hash ${fileHash.substring(0, 8)}...: ${matchingAnalysis.fileName}, hasTimestampedLyrics: ${hasTimestampedLyrics}`);

    return c.json({ 
      found: true,
      fileHash,
      analysis: matchingAnalysis,
      hasTimestampedLyrics,
      hasLyricsSegments,
      // Recommend re-analysis if no word-level timestamps
      needsReanalysis: !hasTimestampedLyrics
    });

  } catch (error) {
    console.error('Check hash error:', error);
    return c.json({ 
      error: 'Failed to check hash',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Database maintenance/rebuild function
app.post('/make-server-473d7342/analyses/maintenance', async (c) => {
  try {
    console.log('Starting database maintenance...');
    
    const indexKey = 'analyses:index';
    const currentIndex = await kv.get(indexKey) || [];
    
    // Get all analysis keys from the database
    const allAnalysisKeys = await kv.getByPrefix('analysis:');
    const actualAnalyses = allAnalysisKeys.filter(a => a !== null);
    
    // Extract IDs from actual analyses
    const actualIds = actualAnalyses.map((analysis: any) => analysis.id);
    
    // Find orphaned index entries (in index but not in database)
    const orphanedIndexEntries = currentIndex.filter((id: string) => !actualIds.includes(id));
    
    // Find missing index entries (in database but not in index)
    const missingIndexEntries = actualIds.filter((id: string) => !currentIndex.includes(id));
    
    // Rebuild the index with actual IDs
    const rebuiltIndex = [...new Set(actualIds)];
    await kv.set(indexKey, rebuiltIndex);
    
    console.log(`Maintenance complete. Rebuilt index with ${rebuiltIndex.length} entries`);
    
    return c.json({ 
      success: true,
      stats: {
        totalAnalyses: actualAnalyses.length,
        indexBefore: currentIndex.length,
        indexAfter: rebuiltIndex.length,
        orphanedIndexEntries: orphanedIndexEntries.length,
        missingIndexEntries: missingIndexEntries.length,
        orphanedIds: orphanedIndexEntries,
        addedIds: missingIndexEntries
      },
      message: `Database maintenance complete. Index rebuilt with ${rebuiltIndex.length} entries.`
    });

  } catch (error) {
    console.error('Maintenance error:', error);
    return c.json({ 
      error: 'Failed to perform maintenance',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Deduplicate analyses - remove duplicates keeping the best version (with timestamped lyrics)
app.post('/make-server-473d7342/analyses/deduplicate', async (c) => {
  try {
    console.log('Starting deduplication scan...');
    
    const indexKey = 'analyses:index';
    const analysisIds = await kv.get(indexKey) || [];

    if (analysisIds.length === 0) {
      return c.json({ 
        success: true,
        message: 'No analyses to deduplicate',
        stats: { scanned: 0, duplicatesRemoved: 0, uniqueFiles: 0 }
      });
    }

    // Fetch all analyses
    const keys = analysisIds.map((id: string) => `analysis:${id}`);
    const analyses = await kv.mget(keys);
    const validAnalyses = analyses.filter((a: any) => a !== null);

    console.log(`Scanning ${validAnalyses.length} analyses for duplicates...`);

    // Group analyses by fileHash
    const byHash: Record<string, any[]> = {};
    const noHash: any[] = [];

    for (const analysis of validAnalyses) {
      if (analysis.fileHash) {
        if (!byHash[analysis.fileHash]) {
          byHash[analysis.fileHash] = [];
        }
        byHash[analysis.fileHash].push(analysis);
      } else {
        noHash.push(analysis);
      }
    }

    // Also group by fileName for analyses without hash
    const byFileName: Record<string, any[]> = {};
    for (const analysis of noHash) {
      const key = analysis.fileName?.toLowerCase() || 'unknown';
      if (!byFileName[key]) {
        byFileName[key] = [];
      }
      byFileName[key].push(analysis);
    }

    const duplicatesToRemove: string[] = [];
    const keptAnalyses: string[] = [];

    // Process hash-based duplicates
    for (const [hash, group] of Object.entries(byHash)) {
      if (group.length > 1) {
        console.log(`Found ${group.length} duplicates for hash ${hash.substring(0, 8)}...`);
        
        // Sort to find the best one:
        // 1. Has timestamped lyrics (lyricsWords)
        // 2. Has lyrics segments
        // 3. More recent analyzedAt
        group.sort((a, b) => {
          const aHasWords = a.lyricsWords?.length > 0 ? 1 : 0;
          const bHasWords = b.lyricsWords?.length > 0 ? 1 : 0;
          if (aHasWords !== bHasWords) return bHasWords - aHasWords;

          const aHasSegments = a.lyricsSegments?.length > 0 ? 1 : 0;
          const bHasSegments = b.lyricsSegments?.length > 0 ? 1 : 0;
          if (aHasSegments !== bHasSegments) return bHasSegments - aHasSegments;

          // More recent is better
          const aDate = new Date(a.analyzedAt || 0).getTime();
          const bDate = new Date(b.analyzedAt || 0).getTime();
          return bDate - aDate;
        });

        // Keep the first (best), remove the rest
        const [keeper, ...duplicates] = group;
        keptAnalyses.push(keeper.id);
        console.log(`  Keeping: ${keeper.id} (${keeper.fileName}, hasWords: ${keeper.lyricsWords?.length > 0})`);
        
        for (const dup of duplicates) {
          duplicatesToRemove.push(dup.id);
          console.log(`  Removing: ${dup.id} (${dup.fileName}, hasWords: ${dup.lyricsWords?.length > 0})`);
        }
      } else {
        keptAnalyses.push(group[0].id);
      }
    }

    // Process fileName-based duplicates (for analyses without hash)
    for (const [fileName, group] of Object.entries(byFileName)) {
      if (group.length > 1) {
        console.log(`Found ${group.length} duplicates for fileName "${fileName}" (no hash)`);
        
        group.sort((a, b) => {
          const aHasWords = a.lyricsWords?.length > 0 ? 1 : 0;
          const bHasWords = b.lyricsWords?.length > 0 ? 1 : 0;
          if (aHasWords !== bHasWords) return bHasWords - aHasWords;

          const aDate = new Date(a.analyzedAt || 0).getTime();
          const bDate = new Date(b.analyzedAt || 0).getTime();
          return bDate - aDate;
        });

        const [keeper, ...duplicates] = group;
        keptAnalyses.push(keeper.id);
        
        for (const dup of duplicates) {
          duplicatesToRemove.push(dup.id);
        }
      } else {
        keptAnalyses.push(group[0].id);
      }
    }

    // Delete duplicates
    for (const id of duplicatesToRemove) {
      await kv.del(`analysis:${id}`);
    }

    // Rebuild index with only kept analyses
    const newIndex = [...new Set(keptAnalyses)];
    await kv.set(indexKey, newIndex);

    const stats = {
      scanned: validAnalyses.length,
      duplicatesRemoved: duplicatesToRemove.length,
      uniqueFiles: newIndex.length,
      byHash: Object.keys(byHash).length,
      withoutHash: noHash.length,
      removedIds: duplicatesToRemove,
    };

    console.log(`Deduplication complete. Removed ${duplicatesToRemove.length} duplicates.`);

    return c.json({ 
      success: true,
      message: `Removed ${duplicatesToRemove.length} duplicate analyses. ${newIndex.length} unique files remain.`,
      stats
    });

  } catch (error) {
    console.error('Deduplicate error:', error);
    return c.json({ 
      error: 'Failed to deduplicate',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Remove analyses that don't have a file hash (legacy/incomplete entries)
app.post('/make-server-473d7342/analyses/remove-no-hash', async (c) => {
  try {
    console.log('Removing analyses without file hash...');
    
    const indexKey = 'analyses:index';
    const analysisIds = await kv.get(indexKey) || [];

    if (analysisIds.length === 0) {
      return c.json({ 
        success: true,
        message: 'No analyses to check',
        stats: { scanned: 0, removed: 0, remaining: 0 }
      });
    }

    // Fetch all analyses
    const keys = analysisIds.map((id: string) => `analysis:${id}`);
    const analyses = await kv.mget(keys);
    const validAnalyses = analyses.filter((a: any) => a !== null);

    console.log(`Scanning ${validAnalyses.length} analyses for missing hashes...`);

    const toRemove: string[] = [];
    const toKeep: string[] = [];

    for (const analysis of validAnalyses) {
      if (!analysis.fileHash) {
        toRemove.push(analysis.id);
        console.log(`Will remove: ${analysis.id} (${analysis.fileName}) - no hash`);
      } else {
        toKeep.push(analysis.id);
      }
    }

    // Delete analyses without hash
    for (const id of toRemove) {
      await kv.del(`analysis:${id}`);
      
      // Also try to clean up any associated audio
      try {
        const supabase = getStorageClient();
        const { data: files } = await supabase.storage
          .from(AUDIO_BUCKET)
          .list('', { search: id });

        if (files && files.length > 0) {
          const filesToDelete = files
            .filter((f: { name: string }) => f.name.startsWith(id))
            .map((f: { name: string }) => f.name);

          if (filesToDelete.length > 0) {
            await supabase.storage.from(AUDIO_BUCKET).remove(filesToDelete);
            console.log(`Deleted audio files for ${id}: ${filesToDelete.join(', ')}`);
          }
        }
      } catch (audioErr) {
        console.warn(`Failed to delete audio for ${id}:`, audioErr);
      }
    }

    // Rebuild index with only kept analyses
    await kv.set(indexKey, toKeep);

    const stats = {
      scanned: validAnalyses.length,
      removed: toRemove.length,
      remaining: toKeep.length,
      removedIds: toRemove,
    };

    console.log(`Removed ${toRemove.length} analyses without hash. ${toKeep.length} remain.`);

    return c.json({ 
      success: true,
      message: `Removed ${toRemove.length} analyses without file hash. ${toKeep.length} analyses remain.`,
      stats
    });

  } catch (error) {
    console.error('Remove no-hash error:', error);
    return c.json({ 
      error: 'Failed to remove analyses without hash',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Register variant groups for unlockable content
app.post('/make-server-473d7342/analyses/variants/register', async (c) => {
  try {
    const body = await c.req.json();
    const { variantGroups } = body;

    if (!variantGroups || !Array.isArray(variantGroups)) {
      return c.json({ error: 'Invalid variant groups data' }, 400);
    }

    const registeredGroups: string[] = [];
    const failedGroups: string[] = [];

    for (const group of variantGroups) {
      try {
        const groupKey = `variant-group:${group.variantGroupId}`;
        
        // Store the variant group metadata
        await kv.set(groupKey, {
          id: group.variantGroupId,
          name: group.groupName,
          variants: group.variants,
          status: group.status || 'unlockable',
          createdAt: new Date().toISOString(),
        });

        // Update the primary analysis with variant group ID and unlockable count
        const primaryVariant = group.variants.find((v: any) => v.variantType === 'original') || group.variants[0];
        if (primaryVariant) {
          const analysisKey = `analysis:${primaryVariant.id}`;
          const analysis = await kv.get(analysisKey);
          
          if (analysis) {
            // Update analysis with variant metadata
            const unlockableVariants = group.variants.filter((v: any) => v.id !== primaryVariant.id);
            const updated = {
              ...analysis,
              variantGroupId: group.variantGroupId,
              variantType: 'original',
              hasUnlockableVariants: unlockableVariants.length > 0,
              unlockableCount: unlockableVariants.length,
              updatedAt: new Date().toISOString(),
            };
            
            await kv.set(analysisKey, updated);
            registeredGroups.push(group.variantGroupId);
            console.log(`Registered variant group: ${group.groupName} (${group.variantGroupId})`);
          }
        }
      } catch (err) {
        failedGroups.push(group.variantGroupId);
        console.error(`Failed to register variant group ${group.variantGroupId}:`, err);
      }
    }

    // Update variant groups index
    const variantIndexKey = 'variant-groups:index';
    const existingIndex = await kv.get(variantIndexKey) || [];
    const updatedIndex = [...new Set([...existingIndex, ...registeredGroups])];
    await kv.set(variantIndexKey, updatedIndex);

    return c.json({
      success: true,
      registered: registeredGroups.length,
      failed: failedGroups.length,
      failedGroupIds: failedGroups.length > 0 ? failedGroups : undefined,
      message: `Registered ${registeredGroups.length} variant groups (${failedGroups.length} failed)`,
    });

  } catch (error) {
    console.error('Register variant groups error:', error);
    return c.json({
      error: 'Failed to register variant groups',
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

// Get variant group details
app.get('/make-server-473d7342/analyses/variants/:variantGroupId', async (c) => {
  try {
    const variantGroupId = c.req.param('variantGroupId');
    const groupKey = `variant-group:${variantGroupId}`;
    const group = await kv.get(groupKey);

    if (!group) {
      return c.json({ error: 'Variant group not found' }, 404);
    }

    return c.json({ variantGroup: group });

  } catch (error) {
    console.error('Get variant group error:', error);
    return c.json({
      error: 'Failed to get variant group',
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

// ============================================================================
// 365 DAYS SCHEDULER ENDPOINTS
// ============================================================================

// Scheduled post interface (TypeScript-like documentation)
// {
//   id: string;
//   dayNumber: number (1-365);
//   songId?: string;
//   songTitle?: string;
//   caption: string;
//   hashtags: string[];
//   platforms: string[];
//   scheduledDate: string (ISO);
//   scheduledTime: string (HH:MM);
//   status: 'draft' | 'scheduled' | 'published' | 'failed';
//   mediaUrls?: string[];
//   createdAt: string;
//   updatedAt: string;
// }

// Get all scheduled posts
app.get('/make-server-473d7342/scheduler/posts', async (c) => {
  try {
    const indexKey = 'scheduler:index';
    const postIds = await kv.get(indexKey) || [];

    if (postIds.length === 0) {
      return c.json({ posts: [], count: 0 });
    }

    const keys = postIds.map((id: string) => `scheduler:post:${id}`);
    const posts = await kv.mget(keys);
    const validPosts = posts.filter((p: any) => p !== null);

    console.log(`Loaded ${validPosts.length} scheduled posts`);

    return c.json({ 
      posts: validPosts,
      count: validPosts.length
    });

  } catch (error) {
    console.error('Load scheduled posts error:', error);
    return c.json({ 
      error: 'Failed to load scheduled posts',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Get posts for a specific day
app.get('/make-server-473d7342/scheduler/posts/day/:dayNumber', async (c) => {
  try {
    const dayNumber = parseInt(c.req.param('dayNumber'), 10);
    
    if (isNaN(dayNumber) || dayNumber < 1 || dayNumber > 365) {
      return c.json({ error: 'Invalid day number. Must be between 1 and 365.' }, 400);
    }

    // Get day-specific index
    const dayIndexKey = `scheduler:day:${dayNumber}`;
    const dayPostIds = await kv.get(dayIndexKey) || [];

    if (dayPostIds.length === 0) {
      return c.json({ posts: [], dayNumber });
    }

    const keys = dayPostIds.map((id: string) => `scheduler:post:${id}`);
    const posts = await kv.mget(keys);
    const validPosts = posts.filter((p: any) => p !== null);

    return c.json({ 
      posts: validPosts,
      dayNumber,
      count: validPosts.length
    });

  } catch (error) {
    console.error('Load day posts error:', error);
    return c.json({ 
      error: 'Failed to load posts for day',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Get a single scheduled post
app.get('/make-server-473d7342/scheduler/posts/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const key = `scheduler:post:${id}`;
    const post = await kv.get(key);

    if (!post) {
      return c.json({ error: 'Post not found' }, 404);
    }

    return c.json({ post });

  } catch (error) {
    console.error('Get post error:', error);
    return c.json({ 
      error: 'Failed to get post',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Create or update a scheduled post
app.post('/make-server-473d7342/scheduler/posts', async (c) => {
  try {
    const body = await c.req.json();
    const post = body.post;

    if (!post || !post.id) {
      return c.json({ error: 'Invalid post data - id is required' }, 400);
    }

    if (!post.dayNumber || post.dayNumber < 1 || post.dayNumber > 365) {
      return c.json({ error: 'Invalid dayNumber. Must be between 1 and 365.' }, 400);
    }

    const key = `scheduler:post:${post.id}`;
    const now = new Date().toISOString();
    
    // Check if this is an update or create
    const existing = await kv.get(key);
    const isUpdate = existing !== null;
    
    // If updating and day changed, remove from old day index
    if (isUpdate && existing.dayNumber !== post.dayNumber) {
      const oldDayIndexKey = `scheduler:day:${existing.dayNumber}`;
      const oldDayIndex = await kv.get(oldDayIndexKey) || [];
      const updatedOldIndex = oldDayIndex.filter((id: string) => id !== post.id);
      await kv.set(oldDayIndexKey, updatedOldIndex);
    }

    // Save the post
    const postToSave = {
      ...post,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    await kv.set(key, postToSave);

    // Update main index
    const indexKey = 'scheduler:index';
    const existingIndex = await kv.get(indexKey) || [];
    if (!existingIndex.includes(post.id)) {
      await kv.set(indexKey, [...existingIndex, post.id]);
    }

    // Update day-specific index
    const dayIndexKey = `scheduler:day:${post.dayNumber}`;
    const dayIndex = await kv.get(dayIndexKey) || [];
    if (!dayIndex.includes(post.id)) {
      await kv.set(dayIndexKey, [...dayIndex, post.id]);
    }

    console.log(`${isUpdate ? 'Updated' : 'Created'} scheduled post: ${post.id} for day ${post.dayNumber}`);

    return c.json({ 
      success: true,
      post: postToSave,
      isUpdate,
      message: `Post ${isUpdate ? 'updated' : 'created'} successfully`
    });

  } catch (error) {
    console.error('Save post error:', error);
    return c.json({ 
      error: 'Failed to save post',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Bulk save multiple posts
app.post('/make-server-473d7342/scheduler/posts/bulk', async (c) => {
  try {
    const body = await c.req.json();
    const { posts } = body;

    if (!posts || !Array.isArray(posts)) {
      return c.json({ error: 'Invalid posts data' }, 400);
    }

    const now = new Date().toISOString();
    const savedIds: string[] = [];
    const errors: { id: string; error: string }[] = [];

    for (const post of posts) {
      try {
        if (!post.id || !post.dayNumber) {
          errors.push({ id: post.id || 'unknown', error: 'Missing id or dayNumber' });
          continue;
        }

        const key = `scheduler:post:${post.id}`;
        const existing = await kv.get(key);

        const postToSave = {
          ...post,
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        };
        await kv.set(key, postToSave);

        // Update indices
        const indexKey = 'scheduler:index';
        const existingIndex = await kv.get(indexKey) || [];
        if (!existingIndex.includes(post.id)) {
          await kv.set(indexKey, [...existingIndex, post.id]);
        }

        const dayIndexKey = `scheduler:day:${post.dayNumber}`;
        const dayIndex = await kv.get(dayIndexKey) || [];
        if (!dayIndex.includes(post.id)) {
          await kv.set(dayIndexKey, [...dayIndex, post.id]);
        }

        savedIds.push(post.id);
      } catch (e) {
        errors.push({ id: post.id, error: e instanceof Error ? e.message : String(e) });
      }
    }

    console.log(`Bulk saved ${savedIds.length} posts, ${errors.length} errors`);

    return c.json({ 
      success: true,
      saved: savedIds.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `Saved ${savedIds.length} of ${posts.length} posts`
    });

  } catch (error) {
    console.error('Bulk save error:', error);
    return c.json({ 
      error: 'Failed to bulk save posts',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Delete a scheduled post
app.delete('/make-server-473d7342/scheduler/posts/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const key = `scheduler:post:${id}`;
    
    // Get the post first to know its day
    const post = await kv.get(key);
    
    if (!post) {
      return c.json({ error: 'Post not found' }, 404);
    }

    // Delete the post
    await kv.del(key);

    // Update main index
    const indexKey = 'scheduler:index';
    const existingIndex = await kv.get(indexKey) || [];
    const updatedIndex = existingIndex.filter((postId: string) => postId !== id);
    await kv.set(indexKey, updatedIndex);

    // Update day-specific index
    const dayIndexKey = `scheduler:day:${post.dayNumber}`;
    const dayIndex = await kv.get(dayIndexKey) || [];
    const updatedDayIndex = dayIndex.filter((postId: string) => postId !== id);
    await kv.set(dayIndexKey, updatedDayIndex);

    console.log(`Deleted scheduled post: ${id}`);

    return c.json({ 
      success: true,
      message: `Post ${id} deleted successfully`
    });

  } catch (error) {
    console.error('Delete post error:', error);
    return c.json({ 
      error: 'Failed to delete post',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Update post status (for publishing workflow)
app.patch('/make-server-473d7342/scheduler/posts/:id/status', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { status, publishedAt, errorMessage } = body;

    if (!status || !['draft', 'scheduled', 'published', 'failed'].includes(status)) {
      return c.json({ error: 'Invalid status' }, 400);
    }

    const key = `scheduler:post:${id}`;
    const post = await kv.get(key);

    if (!post) {
      return c.json({ error: 'Post not found' }, 404);
    }

    const updatedPost = {
      ...post,
      status,
      publishedAt: status === 'published' ? (publishedAt || new Date().toISOString()) : post.publishedAt,
      errorMessage: status === 'failed' ? errorMessage : undefined,
      updatedAt: new Date().toISOString(),
    };

    await kv.set(key, updatedPost);

    console.log(`Updated post ${id} status to ${status}`);

    return c.json({ 
      success: true,
      post: updatedPost
    });

  } catch (error) {
    console.error('Update status error:', error);
    return c.json({ 
      error: 'Failed to update post status',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// ============================================================================
// AUDIO STORAGE ENDPOINTS
// ============================================================================

// Upload audio file for an analysis
app.post('/make-server-473d7342/audio/upload', async (c) => {
  try {
    const formData = await c.req.formData();
    const audioFile = formData.get('audio') as File;
    const analysisId = formData.get('analysisId') as string;

    if (!audioFile) {
      return c.json({ error: 'No audio file provided' }, 400);
    }

    if (!analysisId) {
      return c.json({ error: 'No analysisId provided' }, 400);
    }

    const supabase = getStorageClient();
    
    // Determine file extension from original filename or content type
    const ext = audioFile.name.split('.').pop() || 'mp3';
    const storagePath = `${analysisId}.${ext}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(AUDIO_BUCKET)
      .upload(storagePath, audioFile, {
        contentType: audioFile.type || 'audio/mpeg',
        upsert: true, // Overwrite if exists
      });

    if (error) {
      console.error('Storage upload error:', error);
      return c.json({ error: 'Failed to upload audio', details: error.message }, 500);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(AUDIO_BUCKET)
      .getPublicUrl(storagePath);

    console.log(`Uploaded audio for analysis ${analysisId}: ${urlData.publicUrl}`);

    return c.json({
      success: true,
      storedAudioUrl: urlData.publicUrl,
      path: storagePath,
    });

  } catch (error) {
    console.error('Audio upload error:', error);
    return c.json({
      error: 'Failed to upload audio',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Delete audio file for an analysis
app.delete('/make-server-473d7342/audio/:analysisId', async (c) => {
  try {
    const analysisId = c.req.param('analysisId');
    const supabase = getStorageClient();

    // List files with this prefix to find the exact filename (any extension)
    const { data: files, error: listError } = await supabase.storage
      .from(AUDIO_BUCKET)
      .list('', { search: analysisId });

    if (listError) {
      console.error('Storage list error:', listError);
      return c.json({ error: 'Failed to find audio file', details: listError.message }, 500);
    }

    if (!files || files.length === 0) {
      return c.json({ success: true, message: 'No audio file found to delete' });
    }

    // Delete matching files
    const filesToDelete = files
      .filter(f => f.name.startsWith(analysisId))
      .map(f => f.name);

    if (filesToDelete.length > 0) {
      const { error: deleteError } = await supabase.storage
        .from(AUDIO_BUCKET)
        .remove(filesToDelete);

      if (deleteError) {
        console.error('Storage delete error:', deleteError);
        return c.json({ error: 'Failed to delete audio', details: deleteError.message }, 500);
      }
    }

    console.log(`Deleted audio for analysis ${analysisId}`);

    return c.json({
      success: true,
      deleted: filesToDelete,
    });

  } catch (error) {
    console.error('Audio delete error:', error);
    return c.json({
      error: 'Failed to delete audio',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Get scheduler statistics
app.get('/make-server-473d7342/scheduler/stats', async (c) => {
  try {
    const indexKey = 'scheduler:index';
    const postIds = await kv.get(indexKey) || [];

    if (postIds.length === 0) {
      return c.json({ 
        totalPosts: 0,
        byStatus: { draft: 0, scheduled: 0, published: 0, failed: 0 },
        daysWithContent: 0,
        completionPercent: 0
      });
    }

    const keys = postIds.map((id: string) => `scheduler:post:${id}`);
    const posts = await kv.mget(keys);
    const validPosts = posts.filter((p: any) => p !== null);

    // Calculate stats
    const byStatus = validPosts.reduce((acc: Record<string, number>, post: any) => {
      acc[post.status] = (acc[post.status] || 0) + 1;
      return acc;
    }, { draft: 0, scheduled: 0, published: 0, failed: 0 });

    const uniqueDays = new Set(validPosts.map((p: any) => p.dayNumber));
    const daysWithContent = uniqueDays.size;
    const completionPercent = Math.round((daysWithContent / 365) * 100);

    // Get platform distribution
    const byPlatform = validPosts.reduce((acc: Record<string, number>, post: any) => {
      if (Array.isArray(post.platforms)) {
        post.platforms.forEach((p: string) => {
          acc[p] = (acc[p] || 0) + 1;
        });
      }
      return acc;
    }, {});

    return c.json({ 
      totalPosts: validPosts.length,
      byStatus,
      byPlatform,
      daysWithContent,
      daysRemaining: 365 - daysWithContent,
      completionPercent
    });

  } catch (error) {
    console.error('Get stats error:', error);
    return c.json({ 
      error: 'Failed to get scheduler stats',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

Deno.serve(app.fetch);
