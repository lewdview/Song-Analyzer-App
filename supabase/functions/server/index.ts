import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { logger } from 'npm:hono/logger';
import { analyzeLyricsWithAI } from './lyrics-analyzer.ts';
import * as kv from './kv_store.ts';

const app = new Hono();

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

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      console.error('Transcription error: OPENAI_API_KEY environment variable is not set');
      return c.json({ error: 'OpenAI API key not configured' }, 500);
    }

    // Choose model (allows upgrading without code changes)
    const model = (Deno.env.get('OPENAI_TRANSCRIBE_MODEL') || 'whisper-1').trim();
    const isWhisper = model === 'whisper-1';

    // Create FormData for OpenAI API
    const openaiFormData = new FormData();
    openaiFormData.append('file', audioFile);
    openaiFormData.append('model', model);
    // Only whisper-1 supports verbose_json and timestamp_granularities
    if (isWhisper) {
      openaiFormData.append('response_format', 'verbose_json');
      openaiFormData.append('timestamp_granularities[]', 'word');
    } else {
      openaiFormData.append('response_format', 'json');
    }
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
      // Fallback: if model is not whisper and we used 4o* with unsupported params, retry once with whisper-1
      if (!isWhisper && response.status === 400) {
        try {
          const fallbackFd = new FormData();
          fallbackFd.append('file', audioFile);
          fallbackFd.append('model', 'whisper-1');
          fallbackFd.append('response_format', 'verbose_json');
          fallbackFd.append('timestamp_granularities[]', 'word');
          const fb = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}` },
            body: fallbackFd,
          });
          if (fb.ok) {
            response = fb; // reuse downstream parsing
          } else {
            const fbText = await fb.text();
            return c.json({ error: `OpenAI API error: ${fb.status}`, details: fbText }, fb.status);
          }
        } catch (e) {
          return c.json({ error: 'OpenAI API fallback failed', details: e instanceof Error ? e.message : String(e) }, 500);
        }
      } else {
        return c.json({ 
          error: `OpenAI API error: ${response.status}`,
          details: errorText 
        }, response.status);
      }
    }

    // Prefer JSON (verbose) with segments; gracefully fall back to text
    const contentType = response.headers.get('content-type') || '';
    let transcription = '';
    let segments: { start: number; end: number; text: string }[] | undefined = undefined;
    let words: { start: number; end: number; word: string }[] | undefined = undefined;

    if (contentType.includes('application/json')) {
      const data = await response.json();
      transcription = data.text || '';

      // Normalize segment-level timestamps if present
      if (Array.isArray(data.segments)) {
        segments = data.segments.map((s: any) => ({
          start: typeof s.start === 'number' ? s.start : parseFloat(s.start) || 0,
          end: typeof s.end === 'number' ? s.end : parseFloat(s.end) || 0,
          text: (s.text || '').trim(),
        }));
      }

      // Some models return word-level timestamps (timestamp_granularities[] = word)
      // If we have words but no segments, coalesce words into ~3s segments to keep UI compatible
      if (Array.isArray(data.words)) {
        words = data.words.map((w: any) => ({
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

// Delete a specific analysis
app.delete('/make-server-473d7342/analyses/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const key = `analysis:${id}`;

    // Delete the analysis
    await kv.del(key);

    // Update the index
    const indexKey = 'analyses:index';
    const existingIndex = await kv.get(indexKey) || [];
    const updatedIndex = existingIndex.filter((analysisId: string) => analysisId !== id);
    await kv.set(indexKey, updatedIndex);

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

Deno.serve(app.fetch);