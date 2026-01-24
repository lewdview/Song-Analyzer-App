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
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['*', 'Authorization', 'apikey', 'Content-Type', 'x-manifesto-write-key'],
}));
app.options('*', (c) => c.text('', 204));
app.use('*', logger(console.log));

// Optional write gate (recommended for any endpoint that mutates data).
// If MANIFESTO_WRITE_KEY is unset, writes are allowed (useful for internal/dev).
const requireWriteKey = (c: any) => {
  const expected = Deno.env.get('MANIFESTO_WRITE_KEY');
  if (!expected) return null;
  const provided = c.req.header('x-manifesto-write-key');
  if (!provided || provided !== expected) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  return null;
};

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

// Update an existing analysis (upsert/merge).
// Intended for internal tooling (e.g. Musical Manifesto editor).
app.put('/make-server-473d7342/analyses/:id', async (c) => {
  const denied = requireWriteKey(c);
  if (denied) return denied;

  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const incoming = (body && body.analysis) ? body.analysis : body;

    if (!incoming || typeof incoming !== 'object') {
      return c.json({ error: 'Invalid analysis payload' }, 400);
    }

    const key = `analysis:${id}`;
    const existing = await kv.get(key);
    const now = new Date().toISOString();

    // Merge: preserve any fields not present in incoming.
    const merged = {
      ...(existing || {}),
      ...incoming,
      id,
      // Keep analyzedAt stable if it already exists.
      analyzedAt: existing?.analyzedAt || incoming.analyzedAt,
      manifestoUpdatedAt: now,
    };

    // Session-only field (blob URL) should never be stored.
    delete (merged as any).audioUrl;

    await kv.set(key, merged);

    // Ensure index includes this ID.
    const indexKey = 'analyses:index';
    const existingIndex = await kv.get(indexKey) || [];
    if (!existingIndex.includes(id)) {
      await kv.set(indexKey, [...existingIndex, id]);
    }

    console.log(`Updated analysis: ${key}`);

    return c.json({ success: true, analysis: merged });
  } catch (error) {
    console.error('Update analysis error:', error);
    return c.json({
      error: 'Failed to update analysis',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Project-level manifesto note
app.get('/make-server-473d7342/manifesto/project-note', async (c) => {
  try {
    const key = 'manifesto:projectNote';
    const value = await kv.get(key);
    return c.json({
      note: value?.note || '',
      updatedAt: value?.updatedAt || null,
    });
  } catch (error) {
    console.error('Get project note error:', error);
    return c.json({
      error: 'Failed to load project note',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

app.put('/make-server-473d7342/manifesto/project-note', async (c) => {
  const denied = requireWriteKey(c);
  if (denied) return denied;

  try {
    const body = await c.req.json();
    const note = body?.note;

    if (typeof note !== 'string') {
      return c.json({ error: 'note must be a string' }, 400);
    }

    const key = 'manifesto:projectNote';
    const value = { note, updatedAt: new Date().toISOString() };
    await kv.set(key, value);

    return c.json({ success: true, ...value });
  } catch (error) {
    console.error('Save project note error:', error);
    return c.json({
      error: 'Failed to save project note',
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

// Create a new scheduled post
app.post('/make-server-473d7342/scheduler/posts', async (c) => {
  try {
    const body = await c.req.json();
    
    // Accept either { post: {...} } or flat post data
    const postData = body.post || body;

    // Validate required fields
    if (!postData.songId) {
      return c.json({ error: 'songId is required' }, 400);
    }

    if (!postData.dayNumber || postData.dayNumber < 1 || postData.dayNumber > 365) {
      return c.json({ error: 'Invalid dayNumber. Must be between 1 and 365.' }, 400);
    }

    // Generate ID if not provided
    const postId = postData.id || crypto.randomUUID();
    const key = `scheduler:post:${postId}`;
    const now = new Date().toISOString();
    
    // Build the post object
    const postToSave = {
      id: postId,
      songId: postData.songId,
      songName: postData.songName || 'Unknown',
      platforms: postData.platforms || [],
      scheduledDate: postData.scheduledDate,
      scheduledTime: postData.scheduledTime || '12:00',
      caption: postData.caption || '',
      hashtags: postData.hashtags || [],
      dayNumber: postData.dayNumber,
      status: postData.status || 'scheduled',
      mediaUrl: postData.mediaUrl,
      thumbnailUrl: postData.thumbnailUrl,
      createdAt: now,
      updatedAt: now,
    };
    
    await kv.set(key, postToSave);

    // Update main index
    const indexKey = 'scheduler:index';
    const existingIndex = await kv.get(indexKey) || [];
    if (!existingIndex.includes(postId)) {
      await kv.set(indexKey, [...existingIndex, postId]);
    }

    // Update day-specific index
    const dayIndexKey = `scheduler:day:${postData.dayNumber}`;
    const dayIndex = await kv.get(dayIndexKey) || [];
    if (!dayIndex.includes(postId)) {
      await kv.set(dayIndexKey, [...dayIndex, postId]);
    }

    console.log(`Created scheduled post: ${postId} for day ${postData.dayNumber}`);

    return c.json({ 
      success: true,
      post: postToSave,
      message: 'Post created successfully'
    });

  } catch (error) {
    console.error('Create post error:', error);
    return c.json({ 
      error: 'Failed to create post',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Update an existing scheduled post
app.put('/make-server-473d7342/scheduler/posts/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const updates = body;

    const key = `scheduler:post:${id}`;
    const existing = await kv.get(key);
    
    if (!existing) {
      return c.json({ error: 'Post not found' }, 404);
    }

    const now = new Date().toISOString();
    
    // If day changed, update indices
    if (updates.dayNumber && updates.dayNumber !== existing.dayNumber) {
      // Remove from old day index
      const oldDayIndexKey = `scheduler:day:${existing.dayNumber}`;
      const oldDayIndex = await kv.get(oldDayIndexKey) || [];
      const updatedOldIndex = oldDayIndex.filter((postId: string) => postId !== id);
      await kv.set(oldDayIndexKey, updatedOldIndex);
      
      // Add to new day index
      const newDayIndexKey = `scheduler:day:${updates.dayNumber}`;
      const newDayIndex = await kv.get(newDayIndexKey) || [];
      if (!newDayIndex.includes(id)) {
        await kv.set(newDayIndexKey, [...newDayIndex, id]);
      }
    }

    // Merge updates with existing post
    const updatedPost = {
      ...existing,
      ...updates,
      id, // Ensure ID doesn't change
      createdAt: existing.createdAt,
      updatedAt: now,
    };
    
    await kv.set(key, updatedPost);

    console.log(`Updated scheduled post: ${id}`);

    return c.json({ 
      success: true,
      post: updatedPost,
      message: 'Post updated successfully'
    });

  } catch (error) {
    console.error('Update post error:', error);
    return c.json({ 
      error: 'Failed to update post',
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

// Publish a post immediately
app.post('/make-server-473d7342/scheduler/publish/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const key = `scheduler:post:${id}`;
    const post = await kv.get(key);

    if (!post) {
      return c.json({ error: 'Post not found' }, 404);
    }

    // Get connected platforms
    const socialKey = 'social:connections';
    const connections = await kv.get(socialKey) || {};

    // Check which platforms are connected
    const connectedPlatforms = post.platforms.filter((p: string) => 
      connections[p]?.isConnected && connections[p]?.accessToken
    );

    if (connectedPlatforms.length === 0) {
      return c.json({ 
        error: 'No connected platforms',
        details: 'Please connect at least one social media account before publishing'
      }, 400);
    }

    // In a real implementation, this would call each platform's API
    // For now, we'll simulate publishing
    const results: Record<string, { success: boolean; postUrl?: string; error?: string }> = {};
    
    for (const platform of connectedPlatforms) {
      // Simulate API call - in production, call actual platform APIs
      console.log(`Publishing to ${platform}: ${post.caption.substring(0, 50)}...`);
      
      // Simulate success (in production, make actual API calls)
      results[platform] = {
        success: true,
        postUrl: `https://${platform}.com/post/${crypto.randomUUID().substring(0, 8)}`,
      };
    }

    // Check if any platform succeeded
    const anySuccess = Object.values(results).some(r => r.success);
    const allSuccess = Object.values(results).every(r => r.success);

    // Update post status
    const now = new Date().toISOString();
    const updatedPost = {
      ...post,
      status: allSuccess ? 'published' : (anySuccess ? 'published' : 'failed'),
      publishedAt: anySuccess ? now : undefined,
      publishResults: results,
      updatedAt: now,
    };

    await kv.set(key, updatedPost);

    console.log(`Published post ${id} to ${connectedPlatforms.length} platforms`);

    return c.json({
      success: anySuccess,
      post: updatedPost,
      results,
      message: allSuccess 
        ? `Published to ${connectedPlatforms.length} platforms`
        : `Published to some platforms (${Object.values(results).filter(r => r.success).length}/${connectedPlatforms.length})`
    });

  } catch (error) {
    console.error('Publish error:', error);
    return c.json({
      error: 'Failed to publish post',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// ============================================================================
// SOCIAL MEDIA ENDPOINTS
// ============================================================================

// Get social media connection status
app.get('/make-server-473d7342/social/status', async (c) => {
  try {
    const socialKey = 'social:connections';
    const connections = await kv.get(socialKey) || {};

    // Return status for all platforms
    const platforms = ['twitter', 'instagram', 'tiktok', 'youtube', 'facebook', 'soundcloud'];
    const status: Record<string, any> = {};

    for (const platform of platforms) {
      status[platform] = {
        platformId: platform,
        isConnected: connections[platform]?.isConnected || false,
        username: connections[platform]?.username,
        connectedAt: connections[platform]?.connectedAt,
      };
    }

    return c.json({ platforms: status });

  } catch (error) {
    console.error('Get social status error:', error);
    return c.json({
      error: 'Failed to get social status',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Initiate OAuth flow for a platform
app.get('/make-server-473d7342/social/:platform/connect', async (c) => {
  try {
    const platform = c.req.param('platform');
    const validPlatforms = ['twitter', 'instagram', 'tiktok', 'youtube', 'facebook', 'soundcloud'];

    if (!validPlatforms.includes(platform)) {
      return c.json({ error: 'Invalid platform' }, 400);
    }

    // Generate OAuth URL based on platform
    // In production, these would be real OAuth URLs with proper client IDs
    const redirectUri = `${Deno.env.get('APP_URL') || 'http://localhost:5173'}/auth/${platform}/callback`;
    const state = crypto.randomUUID();

    // Store state for verification
    await kv.set(`oauth:state:${state}`, { platform, createdAt: new Date().toISOString() }, 600); // 10 min expiry

    let authUrl = '';
    switch (platform) {
      case 'twitter':
        authUrl = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${Deno.env.get('TWITTER_CLIENT_ID') || 'YOUR_TWITTER_CLIENT_ID'}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=tweet.read%20tweet.write%20users.read%20offline.access&state=${state}&code_challenge=challenge&code_challenge_method=plain`;
        break;
      case 'instagram':
        authUrl = `https://api.instagram.com/oauth/authorize?client_id=${Deno.env.get('INSTAGRAM_CLIENT_ID') || 'YOUR_INSTAGRAM_CLIENT_ID'}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=instagram_basic,instagram_content_publish&response_type=code&state=${state}`;
        break;
      case 'tiktok':
        authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${Deno.env.get('TIKTOK_CLIENT_KEY') || 'YOUR_TIKTOK_CLIENT_KEY'}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=video.upload,video.publish&response_type=code&state=${state}`;
        break;
      case 'youtube':
        authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${Deno.env.get('YOUTUBE_CLIENT_ID') || 'YOUR_YOUTUBE_CLIENT_ID'}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=https://www.googleapis.com/auth/youtube.upload&response_type=code&access_type=offline&state=${state}`;
        break;
      case 'facebook':
        authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${Deno.env.get('FACEBOOK_CLIENT_ID') || 'YOUR_FACEBOOK_CLIENT_ID'}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=pages_manage_posts,pages_read_engagement&response_type=code&state=${state}`;
        break;
      case 'soundcloud':
        authUrl = `https://soundcloud.com/connect?client_id=${Deno.env.get('SOUNDCLOUD_CLIENT_ID') || 'YOUR_SOUNDCLOUD_CLIENT_ID'}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}`;
        break;
    }

    console.log(`Generated OAuth URL for ${platform}`);

    return c.json({ authUrl, state });

  } catch (error) {
    console.error('OAuth connect error:', error);
    return c.json({
      error: 'Failed to generate OAuth URL',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Handle OAuth callback
app.post('/make-server-473d7342/social/:platform/callback', async (c) => {
  try {
    const platform = c.req.param('platform');
    const body = await c.req.json();
    const { code, state } = body;

    if (!code || !state) {
      return c.json({ error: 'Missing code or state parameter' }, 400);
    }

    // Verify state
    const storedState = await kv.get(`oauth:state:${state}`);
    if (!storedState || storedState.platform !== platform) {
      return c.json({ error: 'Invalid or expired state' }, 400);
    }

    // Clean up state
    await kv.del(`oauth:state:${state}`);

    // In production, exchange code for tokens here
    // For now, simulate a successful connection
    const now = new Date().toISOString();
    
    // Get existing connections
    const socialKey = 'social:connections';
    const connections = await kv.get(socialKey) || {};

    // Update connection for this platform
    connections[platform] = {
      platformId: platform,
      isConnected: true,
      username: `${platform}_user_${crypto.randomUUID().substring(0, 6)}`,
      accessToken: `mock_token_${crypto.randomUUID()}`, // In production, real token from OAuth
      refreshToken: `mock_refresh_${crypto.randomUUID()}`,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      connectedAt: now,
    };

    await kv.set(socialKey, connections);

    console.log(`Connected ${platform} account`);

    return c.json({
      success: true,
      platform,
      username: connections[platform].username,
      message: `Successfully connected ${platform}`
    });

  } catch (error) {
    console.error('OAuth callback error:', error);
    return c.json({
      error: 'Failed to complete OAuth',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Disconnect a platform
app.post('/make-server-473d7342/social/:platform/disconnect', async (c) => {
  try {
    const platform = c.req.param('platform');

    const socialKey = 'social:connections';
    const connections = await kv.get(socialKey) || {};

    if (connections[platform]) {
      // In production, also revoke the token with the platform
      connections[platform] = {
        platformId: platform,
        isConnected: false,
      };
      await kv.set(socialKey, connections);
    }

    console.log(`Disconnected ${platform} account`);

    return c.json({
      success: true,
      platform,
      message: `Disconnected ${platform}`
    });

  } catch (error) {
    console.error('Disconnect error:', error);
    return c.json({
      error: 'Failed to disconnect platform',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Mock connect (for development/testing without real OAuth)
app.post('/make-server-473d7342/social/:platform/mock-connect', async (c) => {
  try {
    const platform = c.req.param('platform');
    const body = await c.req.json();
    const { username } = body;

    const now = new Date().toISOString();
    
    const socialKey = 'social:connections';
    const connections = await kv.get(socialKey) || {};

    connections[platform] = {
      platformId: platform,
      isConnected: true,
      username: username || `${platform}_user`,
      accessToken: `mock_token_${crypto.randomUUID()}`,
      connectedAt: now,
    };

    await kv.set(socialKey, connections);

    console.log(`Mock connected ${platform} as ${connections[platform].username}`);

    return c.json({
      success: true,
      platform,
      connection: {
        platformId: platform,
        isConnected: true,
        username: connections[platform].username,
        connectedAt: now,
      }
    });

  } catch (error) {
    console.error('Mock connect error:', error);
    return c.json({
      error: 'Failed to mock connect',
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
