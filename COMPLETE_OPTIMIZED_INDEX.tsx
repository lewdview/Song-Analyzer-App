import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { logger } from 'npm:hono/logger';
import { createClient } from 'jsr:@supabase/supabase-js@2.49.8';
import { analyzeLyricsWithAI } from './lyrics-analyzer.ts';
import * as kv from './kv_store.ts';

const app = new Hono();

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
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS', 'PUT', 'PATCH'],
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

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      console.error('Transcription error: OPENAI_API_KEY environment variable is not set');
      return c.json({ error: 'OpenAI API key not configured' }, 500);
    }

    const model = Deno.env.get('OPENAI_TRANSCRIBE_MODEL') || 'whisper-1';

    // Create FormData for OpenAI API
    const openaiFormData = new FormData();
    openaiFormData.append('file', audioFile);
    openaiFormData.append('model', model);
    // Ask for structured output with timestamps
    openaiFormData.append('response_format', 'verbose_json');
    openaiFormData.append('timestamp_granularities[]', 'segment');
    openaiFormData.append('timestamp_granularities[]', 'word');

    console.log(`Sending transcription request for file: ${audioFile.name}, size: ${audioFile.size} bytes, model: ${model}`);

    // Call OpenAI transcription API
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: openaiFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OpenAI API error (${response.status}): ${errorText}`);
      return c.json({ 
        error: `OpenAI API error: ${response.status}`,
        details: errorText 
      }, response.status);
    }

    // Prefer JSON (verbose) with segments; gracefully fall back to text
    const contentType = response.headers.get('content-type') || '';
    let transcription = '';
    let segments: { start: number; end: number; text: string }[] | undefined = undefined;
    let words: { start: number; end: number; word: string }[] | undefined = undefined;

    if (contentType.includes('application/json')) {
      const data = await response.json();
      transcription = data.text || '';

      if (Array.isArray(data.segments)) {
        segments = data.segments.map((s: any) => ({
          start: typeof s.start === 'number' ? s.start : parseFloat(s.start) || 0,
          end: typeof s.end === 'number' ? s.end : parseFloat(s.end) || 0,
          text: (s.text || '').trim(),
        }));
      }

      if (Array.isArray(data.words)) {
        words = (data.words as any[]).map((w: any) => ({
          start: typeof w.start === 'number' ? w.start : parseFloat(w.start) || 0,
          end: typeof w.end === 'number' ? w.end : parseFloat(w.end) || 0,
          word: (w.word || w.text || '').trim(),
        }));
      }

      if ((!segments || segments.length === 0) && words && words.length > 0) {
        const words = data.words as Array<{ word: string; start: number; end: number }>;
        const bucketSizeSec = 3;
        const coalesced: { start: number; end: number; text: string }[] = [];
        let bucketStart = words.length ? (words[0].start ?? 0) : 0;
        let currentText: string[] = [];
        for (const w of words) {
          if (currentText.length === 0) bucketStart = w.start ?? bucketStart;
          currentText.push(w.word);
          const shouldFlush = (w.end - bucketStart) >= bucketSizeSec || currentText.length >= 12;
          if (shouldFlush) {
            coalesced.push({ start: bucketStart || 0, end: w.end ?? bucketStart, text: currentText.join(' ') });
            currentText = [];
          }
        }
        if (currentText.length) {
          const lastEnd = words[words.length - 1]?.end ?? bucketStart;
          coalesced.push({ start: bucketStart || 0, end: lastEnd, text: currentText.join(' ') });
        }
        segments = coalesced;
      }
    } else {
      transcription = await response.text();
    }

    console.log(`Transcription completed successfully for ${audioFile.name}`);

    // Analyze the lyrics for mood, emotion, and themes
    let lyricsAnalysis = null;
    if (transcription && transcription.length > 10) {
      console.log('Analyzing lyrics for mood and emotion...');
      lyricsAnalysis = await analyzeLyricsWithAI(transcription, apiKey);
      console.log('Lyrics analysis completed');
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

// ============================================================================
// ANALYSES ENDPOINTS - OPTIMIZED
// ============================================================================

// Save song analysis to permanent storage
// BOTTLENECK FIX #1: Now handles BOTH CREATING AND UPDATING
// BOTTLENECK FIX #2: Maintains fileHash index for fast duplicate detection
app.post('/make-server-473d7342/analyses/save', async (c) => {
  try {
    const body = await c.req.json();
    const { analyses } = body;

    if (!analyses || !Array.isArray(analyses)) {
      return c.json({ error: 'Invalid analyses data' }, 400);
    }

    const savedKeys: string[] = [];
    const updatedKeys: string[] = [];
    const newIds: string[] = [];
    const updatedIds: string[] = [];
    
    for (const analysis of analyses) {
      const key = `analysis:${analysis.id}`;
      const existing = await kv.get(key);
      
      if (!existing) {
        // NEW ANALYSIS
        await kv.set(key, analysis);
        savedKeys.push(key);
        newIds.push(analysis.id);
        
        // ADD TO fileHash INDEX (OPTIMIZATION)
        if (analysis.fileHash) {
          const hashKey = `fileHash:${analysis.fileHash}`;
          await kv.set(hashKey, analysis.id);
          console.log(`Indexed hash ${analysis.fileHash.substring(0, 8)}... -> ${analysis.id}`);
        }
        
        console.log(`Saved new analysis: ${key} - ${analysis.fileName}`);
      } else {
        // UPDATE EXISTING ANALYSIS
        const updatedAnalysis = {
          ...existing,
          ...analysis,
          id: analysis.id,
          createdAt: existing.createdAt,
          analyzedAt: analysis.analyzedAt || existing.analyzedAt,
        };
        
        await kv.set(key, updatedAnalysis);
        updatedKeys.push(key);
        updatedIds.push(analysis.id);
        
        // UPDATE fileHash INDEX if hash changed
        if (analysis.fileHash && analysis.fileHash !== existing.fileHash) {
          if (existing.fileHash) {
            await kv.del(`fileHash:${existing.fileHash}`);
          }
          const hashKey = `fileHash:${analysis.fileHash}`;
          await kv.set(hashKey, analysis.id);
        }
        
        console.log(`Updated existing analysis: ${key}`);
      }
    }

    // Update the global index with all IDs
    const allIds = [...newIds, ...updatedIds];
    if (allIds.length > 0) {
      const indexKey = 'analyses:index';
      const existingIndex = await kv.get(indexKey) || [];
      const updatedIndex = [...new Set([...existingIndex, ...allIds])];
      await kv.set(indexKey, updatedIndex);
    }

    return c.json({ 
      success: true,
      saved: savedKeys.length,
      updated: updatedKeys.length,
      total: analyses.length,
      message: `Successfully saved ${savedKeys.length} new analyses and updated ${updatedKeys.length} existing analyses`
    });

  } catch (error) {
    console.error('Save analyses error:', error);
    return c.json({ 
      error: 'Failed to save analyses',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Load all saved analyses with pagination
// BOTTLENECK FIX #3: Fetch in batches of 50 instead of all at once
app.get('/make-server-473d7342/analyses/load', async (c) => {
  try {
    const indexKey = 'analyses:index';
    const analysisIds = (await kv.get(indexKey)) || [];

    if (analysisIds.length === 0) {
      return c.json({ analyses: [], count: 0, total: 0 });
    }

    const BATCH_SIZE = 50;
    const allAnalyses: any[] = [];

    for (let i = 0; i < analysisIds.length; i += BATCH_SIZE) {
      const batchIds = analysisIds.slice(i, i + BATCH_SIZE);
      const keys = batchIds.map((id: string) => `analysis:${id}`);
      
      try {
        const batchAnalyses = await kv.mget(keys);
        const validAnalyses = batchAnalyses.filter((a: any) => a !== null);
        allAnalyses.push(...validAnalyses);
        console.log(`Loaded batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(analysisIds.length / BATCH_SIZE)}: ${validAnalyses.length} analyses`);
      } catch (batchError) {
        console.error(`Error loading batch at ${i}:`, batchError);
      }
    }

    console.log(`Total loaded ${allAnalyses.length} analyses from ${analysisIds.length} index entries`);

    return c.json({ 
      analyses: allAnalyses,
      count: allAnalyses.length,
      total: analysisIds.length
    });

  } catch (error) {
    console.error('Load analyses error:', error);
    return c.json({ 
      error: 'Failed to load analyses',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Delete a specific analysis
app.delete('/make-server-473d7342/analyses/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const key = `analysis:${id}`;
    const analysis = await kv.get(key);

    if (!analysis) {
      return c.json({ error: 'Analysis not found' }, 404);
    }

    // Delete the analysis
    await kv.del(key);

    // Remove from index
    const indexKey = 'analyses:index';
    const existingIndex = await kv.get(indexKey) || [];
    const updatedIndex = existingIndex.filter((analysisId: string) => analysisId !== id);
    await kv.set(indexKey, updatedIndex);

    // Clean up fileHash index
    if (analysis.fileHash) {
      await kv.del(`fileHash:${analysis.fileHash}`);
    }

    // Also delete any stored audio file
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
          console.log(`Deleted audio files for analysis ${id}`);
        }
      }
    } catch (audioErr) {
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
    
    return c.json({ exists: analysis !== null, id });
  } catch (error) {
    console.error('Check analysis error:', error);
    return c.json({ 
      error: 'Failed to check analysis',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Check if analysis exists by file hash (for duplicate detection)
// BOTTLENECK FIX #4: Use fileHash index instead of loading all analyses
app.post('/make-server-473d7342/analyses/check-hash', async (c) => {
  try {
    const body = await c.req.json();
    const { fileHash } = body;

    if (!fileHash || typeof fileHash !== 'string') {
      return c.json({ error: 'fileHash is required' }, 400);
    }

    // OPTIMIZED: Check hash index first (O(1) lookup)
    const hashKey = `fileHash:${fileHash}`;
    const analysisId = await kv.get(hashKey);

    if (!analysisId) {
      return c.json({ found: false, fileHash });
    }

    // Found via index, now get the full analysis
    const analysis = await kv.get(`analysis:${analysisId}`);
    
    if (!analysis) {
      // Index is stale, clean it up
      await kv.del(hashKey);
      return c.json({ found: false, fileHash });
    }

    const hasTimestampedLyrics = Boolean(
      analysis.lyricsWords && 
      Array.isArray(analysis.lyricsWords) && 
      analysis.lyricsWords.length > 0
    );

    const hasLyricsSegments = Boolean(
      analysis.lyricsSegments && 
      Array.isArray(analysis.lyricsSegments) && 
      analysis.lyricsSegments.length > 0
    );

    console.log(`Found existing analysis for hash ${fileHash.substring(0, 8)}...: ${analysis.fileName}`);

    return c.json({ 
      found: true,
      fileHash,
      analysis,
      hasTimestampedLyrics,
      hasLyricsSegments,
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
// BOTTLENECK FIX #5: Batch prefix scan instead of loading all at once
app.post('/make-server-473d7342/analyses/maintenance', async (c) => {
  try {
    console.log('Starting database maintenance...');
    
    const indexKey = 'analyses:index';
    const currentIndex = await kv.get(indexKey) || [];
    
    // OPTIMIZED: Verify index entries in batches instead of getByPrefix()
    const BATCH_SIZE = 50;
    const verified: string[] = [];
    
    for (let i = 0; i < currentIndex.length; i += BATCH_SIZE) {
      const batch = currentIndex.slice(i, i + BATCH_SIZE);
      const keys = batch.map((id: string) => `analysis:${id}`);
      const results = await kv.mget(keys);
      
      for (let j = 0; j < results.length; j++) {
        if (results[j] !== null) {
          verified.push(batch[j]);
        }
      }
    }

    const orphanedCount = currentIndex.length - verified.length;
    
    if (orphanedCount > 0) {
      await kv.set(indexKey, verified);
      console.log(`Removed ${orphanedCount} orphaned index entries`);
    }

    return c.json({ 
      success: true,
      stats: {
        totalAnalyses: verified.length,
        indexBefore: currentIndex.length,
        indexAfter: verified.length,
        orphanedRemoved: orphanedCount,
        missingIndexEntries: 0
      },
      message: `Database maintenance complete. Verified ${verified.length} analyses, removed ${orphanedCount} orphaned entries.`
    });

  } catch (error) {
    console.error('Maintenance error:', error);
    return c.json({ 
      error: 'Failed to perform maintenance',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Deduplicate analyses - remove duplicates keeping the best version
// BOTTLENECK FIX #6: Process in batches instead of loading all into memory
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

    // OPTIMIZED: Process in batches to avoid memory explosion
    const BATCH_SIZE = 50;
    const byHash: Record<string, any[]> = {};
    const noHash: any[] = [];
    const duplicatesToRemove: string[] = [];
    const keptAnalyses: string[] = [];

    // Batch process all analyses
    for (let i = 0; i < analysisIds.length; i += BATCH_SIZE) {
      const batch = analysisIds.slice(i, i + BATCH_SIZE);
      const keys = batch.map((id: string) => `analysis:${id}`);
      const results = await kv.mget(keys);

      for (const analysis of results) {
        if (!analysis) continue;

        if (analysis.fileHash) {
          if (!byHash[analysis.fileHash]) byHash[analysis.fileHash] = [];
          byHash[analysis.fileHash].push(analysis);
        } else {
          noHash.push(analysis);
        }
      }
    }

    console.log(`Scanned ${analysisIds.length} analyses. Found duplicates by hash: ${Object.keys(byHash).filter(k => byHash[k].length > 1).length}`);

    // Process hash-based duplicates
    for (const [hash, group] of Object.entries(byHash)) {
      if (group.length > 1) {
        group.sort((a, b) => {
          const aHasWords = a.lyricsWords?.length > 0 ? 1 : 0;
          const bHasWords = b.lyricsWords?.length > 0 ? 1 : 0;
          if (aHasWords !== bHasWords) return bHasWords - aHasWords;

          const aHasSegments = a.lyricsSegments?.length > 0 ? 1 : 0;
          const bHasSegments = b.lyricsSegments?.length > 0 ? 1 : 0;
          if (aHasSegments !== bHasSegments) return bHasSegments - aHasSegments;

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

    // Handle no-hash duplicates
    const byFileName: Record<string, any[]> = {};
    for (const analysis of noHash) {
      const key = analysis.fileName?.toLowerCase() || 'unknown';
      if (!byFileName[key]) byFileName[key] = [];
      byFileName[key].push(analysis);
    }

    for (const group of Object.values(byFileName)) {
      if (group.length > 1) {
        group.sort((a, b) => {
          const aDate = new Date(a.analyzedAt || 0).getTime();
          const bDate = new Date(b.analyzedAt || 0).getTime();
          return bDate - aDate;
        });
        const [keeper, ...duplicates] = group;
        keptAnalyses.push(keeper.id);
        for (const dup of duplicates) {
          duplicatesToRemove.push(dup.id);
        }
      } else if (group.length === 1) {
        keptAnalyses.push(group[0].id);
      }
    }

    // Delete duplicates in batches
    for (let i = 0; i < duplicatesToRemove.length; i += BATCH_SIZE) {
      const batch = duplicatesToRemove.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(id => kv.del(`analysis:${id}`)));
    }

    // Rebuild index
    const newIndex = [...new Set(keptAnalyses)];
    await kv.set(indexKey, newIndex);

    return c.json({ 
      success: true,
      message: `Removed ${duplicatesToRemove.length} duplicate analyses. ${newIndex.length} unique files remain.`,
      stats: {
        scanned: analysisIds.length,
        duplicatesRemoved: duplicatesToRemove.length,
        uniqueFiles: newIndex.length,
        removedIds: duplicatesToRemove.slice(0, 10) // Return first 10 for logging
      }
    });

  } catch (error) {
    console.error('Deduplicate error:', error);
    return c.json({ 
      error: 'Failed to deduplicate',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Remove analyses that don't have a file hash
// BOTTLENECK FIX #7: Batch processing like deduplicate
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

    // OPTIMIZED: Batch process
    const BATCH_SIZE = 50;
    const toRemove: string[] = [];
    const toKeep: string[] = [];

    for (let i = 0; i < analysisIds.length; i += BATCH_SIZE) {
      const batch = analysisIds.slice(i, i + BATCH_SIZE);
      const keys = batch.map((id: string) => `analysis:${id}`);
      const results = await kv.mget(keys);

      for (let j = 0; j < results.length; j++) {
        const analysis = results[j];
        if (!analysis) continue;

        if (!analysis.fileHash) {
          toRemove.push(batch[j]);
        } else {
          toKeep.push(batch[j]);
        }
      }
    }

    // Delete in batches
    for (let i = 0; i < toRemove.length; i += BATCH_SIZE) {
      const batch = toRemove.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(id => kv.del(`analysis:${id}`)));
    }

    // Rebuild index
    await kv.set(indexKey, toKeep);

    return c.json({ 
      success: true,
      message: `Removed ${toRemove.length} analyses without file hash. ${toKeep.length} analyses remain.`,
      stats: {
        scanned: analysisIds.length,
        removed: toRemove.length,
        remaining: toKeep.length
      }
    });

  } catch (error) {
    console.error('Remove no-hash error:', error);
    return c.json({ 
      error: 'Failed to remove analyses without hash',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// ============================================================================
// 365 DAYS SCHEDULER ENDPOINTS - OPTIMIZED
// ============================================================================

// Get all scheduled posts
// BOTTLENECK FIX #8: Batch load like analyses
app.get('/make-server-473d7342/scheduler/posts', async (c) => {
  try {
    const indexKey = 'scheduler:index';
    const postIds = await kv.get(indexKey) || [];

    if (postIds.length === 0) {
      return c.json({ posts: [], count: 0 });
    }

    const BATCH_SIZE = 50;
    const allPosts: any[] = [];

    for (let i = 0; i < postIds.length; i += BATCH_SIZE) {
      const batch = postIds.slice(i, i + BATCH_SIZE);
      const keys = batch.map((id: string) => `scheduler:post:${id}`);
      const results = await kv.mget(keys);
      const validPosts = results.filter((p: any) => p !== null);
      allPosts.push(...validPosts);
    }

    console.log(`Loaded ${allPosts.length} scheduled posts`);

    return c.json({ posts: allPosts, count: allPosts.length });

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

    const dayIndexKey = `scheduler:day:${dayNumber}`;
    const dayPostIds = await kv.get(dayIndexKey) || [];

    if (dayPostIds.length === 0) {
      return c.json({ posts: [], dayNumber });
    }

    const keys = dayPostIds.map((id: string) => `scheduler:post:${id}`);
    const posts = await kv.mget(keys);
    const validPosts = posts.filter((p: any) => p !== null);

    return c.json({ posts: validPosts, dayNumber, count: validPosts.length });

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
    const existing = await kv.get(key);
    const isUpdate = existing !== null;
    
    if (isUpdate && existing.dayNumber !== post.dayNumber) {
      const oldDayIndexKey = `scheduler:day:${existing.dayNumber}`;
      const oldDayIndex = await kv.get(oldDayIndexKey) || [];
      const updatedOldIndex = oldDayIndex.filter((id: string) => id !== post.id);
      await kv.set(oldDayIndexKey, updatedOldIndex);
    }

    const postToSave = {
      ...post,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    await kv.set(key, postToSave);

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
// OPTIMIZATION: Parallel writes instead of sequential
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

    // OPTIMIZED: Use Promise.all for parallel writes instead of sequential
    const writePromises = posts.map(async (post) => {
      try {
        if (!post.id || !post.dayNumber) {
          errors.push({ id: post.id || 'unknown', error: 'Missing id or dayNumber' });
          return;
        }

        const key = `scheduler:post:${post.id}`;
        const existing = await kv.get(key);

        const postToSave = {
          ...post,
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        };
        await kv.set(key, postToSave);

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
    });

    await Promise.all(writePromises);

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
    const post = await kv.get(key);
    
    if (!post) {
      return c.json({ error: 'Post not found' }, 404);
    }

    await kv.del(key);

    const indexKey = 'scheduler:index';
    const existingIndex = await kv.get(indexKey) || [];
    const updatedIndex = existingIndex.filter((postId: string) => postId !== id);
    await kv.set(indexKey, updatedIndex);

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

// Update post status
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

    return c.json({ success: true, post: updatedPost });

  } catch (error) {
    console.error('Update status error:', error);
    return c.json({ 
      error: 'Failed to update post status',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Get scheduler statistics
// OPTIMIZATION: Batch load instead of loading all at once
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

    const BATCH_SIZE = 50;
    const stats = {
      draft: 0,
      scheduled: 0,
      published: 0,
      failed: 0,
    };
    const daysSet = new Set<number>();

    // Batch load and calculate stats
    for (let i = 0; i < postIds.length; i += BATCH_SIZE) {
      const batch = postIds.slice(i, i + BATCH_SIZE);
      const keys = batch.map((id: string) => `scheduler:post:${id}`);
      const results = await kv.mget(keys);

      for (const post of results) {
        if (!post) continue;
        stats[post.status as keyof typeof stats]++;
        if (post.dayNumber) daysSet.add(post.dayNumber);
      }
    }

    const daysWithContent = daysSet.size;
    const completionPercent = Math.round((daysWithContent / 365) * 100);
    const totalPosts = postIds.length;

    return c.json({ 
      totalPosts,
      byStatus: stats,
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
    const ext = audioFile.name.split('.').pop() || 'mp3';
    const storagePath = `${analysisId}.${ext}`;

    const { data, error } = await supabase.storage
      .from(AUDIO_BUCKET)
      .upload(storagePath, audioFile, {
        contentType: audioFile.type || 'audio/mpeg',
        upsert: true,
      });

    if (error) {
      console.error('Storage upload error:', error);
      return c.json({ error: 'Failed to upload audio', details: error.message }, 500);
    }

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

Deno.serve(app.fetch);
