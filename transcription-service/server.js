import express from 'express';
import multer from 'multer';
import { spawn } from 'child_process';
import { pipeline } from '@xenova/transformers';
import {
  analyzeLyricsWithProvider,
  getConfiguredProvider,
  normalizeProvider,
} from './lyrics-ai-router.js';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const corsOrigin = process.env.WHISPER_CORS_ORIGIN || '*';
const WHISPER_SAMPLE_RATE = Number.parseInt(process.env.WHISPER_SAMPLE_RATE || '16000', 10);
const WHISPER_MODEL = process.env.WHISPER_MODEL || 'Xenova/whisper-medium.en';
const WHISPER_FALLBACK_MODELS = (process.env.WHISPER_FALLBACK_MODELS || 'Xenova/whisper-medium.en,Xenova/whisper-base.en')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const WHISPER_DEVICE = process.env.WHISPER_DEVICE || 'cpu';
const WHISPER_QUANTIZED = process.env.WHISPER_QUANTIZED === 'true';
const WHISPER_LANGUAGE = (process.env.WHISPER_LANGUAGE || 'english').trim(); // set empty string for auto-detect
const WHISPER_CHUNK_LENGTH_S = Number.parseFloat(process.env.WHISPER_CHUNK_LENGTH_S || '12');
const WHISPER_STRIDE_LENGTH_S = Number.parseFloat(process.env.WHISPER_STRIDE_LENGTH_S || '1.5');
const WHISPER_NUM_BEAMS = Number.parseInt(process.env.WHISPER_NUM_BEAMS || '3', 10);
const WHISPER_REPETITION_PENALTY = Number.parseFloat(process.env.WHISPER_REPETITION_PENALTY || '1.05');
const WHISPER_NO_REPEAT_NGRAM_SIZE = Number.parseInt(process.env.WHISPER_NO_REPEAT_NGRAM_SIZE || '3', 10);
const WHISPER_FORCE_WORD_TIMINGS = process.env.WHISPER_FORCE_WORD_TIMINGS !== 'false';
const ENABLE_LYRICS_ANALYSIS =
  process.env.ENABLE_LYRICS_ANALYSIS !== 'false' &&
  process.env.ENABLE_LOCAL_LYRICS_ANALYSIS !== 'false';
const LOCAL_LYRICS_MIN_CHARS = Math.max(1, Number.parseInt(process.env.LOCAL_LYRICS_MIN_CHARS || '24', 10) || 24);
const ALLOW_LYRICS_PROVIDER_OVERRIDE = process.env.ALLOW_LYRICS_PROVIDER_OVERRIDE !== 'false';
const DEFAULT_LYRICS_PROVIDER = getConfiguredProvider();
const modelUsesSegmentTimestampsByDefault = (modelName) => {
  const lower = String(modelName || '').toLowerCase();
  return lower.includes('medium') || lower.includes('large');
};
const inferredDefaultTimestampMode = WHISPER_FORCE_WORD_TIMINGS
  ? 'word'
  : (modelUsesSegmentTimestampsByDefault(WHISPER_MODEL) ? 'segment' : 'word');
const WHISPER_TIMESTAMP_MODE = (process.env.WHISPER_TIMESTAMP_MODE || inferredDefaultTimestampMode).trim().toLowerCase();

// Allow browser apps (different origin/port) to call the local transcription API.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, x-lyrics-ai-provider');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

function decodeAudioToFloat32(audioBuffer) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      'pipe:0',
      '-f',
      'f32le',
      '-acodec',
      'pcm_f32le',
      '-ac',
      '1',
      '-ar',
      String(WHISPER_SAMPLE_RATE),
      'pipe:1',
    ]);

    const stdoutChunks = [];
    const stderrChunks = [];

    ffmpeg.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    ffmpeg.stderr.on('data', (chunk) => stderrChunks.push(chunk));

    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to start ffmpeg: ${err.message}`));
    });

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        const details = Buffer.concat(stderrChunks).toString('utf8').trim();
        reject(new Error(`ffmpeg decode failed (exit ${code})${details ? `: ${details}` : ''}`));
        return;
      }

      const decoded = Buffer.concat(stdoutChunks);
      if (decoded.length === 0) {
        reject(new Error('ffmpeg decode produced no audio output'));
        return;
      }

      // Ensure byte length aligns to Float32 sample width.
      const alignedLength = decoded.length - (decoded.length % 4);
      const aligned = alignedLength === decoded.length ? decoded : decoded.subarray(0, alignedLength);
      const view = new Float32Array(aligned.buffer, aligned.byteOffset, aligned.length / 4);
      // Copy into a standalone typed array to avoid retaining the Node Buffer backing store.
      resolve(new Float32Array(view));
    });

    // Some ffmpeg failures can close stdin early; ignore EPIPE-style write errors.
    ffmpeg.stdin.on('error', () => {});
    ffmpeg.stdin.end(audioBuffer);
  });
}

function normalizeWord(word) {
  return String(word || '')
    .toLowerCase()
    .replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '');
}

function normalizeTextToken(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9'\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Remove obvious ASR looping artifacts like "the the the the ..." while keeping natural doubles/triples.
function removeLoopingWordArtifacts(words) {
  if (!Array.isArray(words) || words.length === 0) {
    return [];
  }

  const cleaned = [];
  let runWord = '';
  let runCount = 0;
  let lastEnd = 0;

  for (const item of words) {
    const word = String(item.word || '').trim();
    if (!word) {
      continue;
    }

    const normalized = normalizeWord(word);
    const start = typeof item.start === 'number' ? item.start : 0;
    const end = typeof item.end === 'number' ? item.end : start;
    const isSameAsRun = normalized && normalized === runWord;
    const isNearPrevious = start - lastEnd <= 0.45;

    if (isSameAsRun && isNearPrevious) {
      runCount += 1;
      // Keep up to 3 consecutive duplicates (e.g. "yeah yeah yeah"), drop the rest.
      if (runCount > 3) {
        continue;
      }
    } else {
      runWord = normalized;
      runCount = 1;
    }

    cleaned.push({ start, end, word });
    lastEnd = end;
  }

  return cleaned;
}

function coalesceWordsToSegments(words) {
  if (!Array.isArray(words) || words.length === 0) {
    return [];
  }

  const bucketSizeSec = 3;
  const maxWordsPerSegment = 12;
  const segments = [];

  let bucketStart = words[0].start ?? 0;
  let currentText = [];

  for (const w of words) {
    if (currentText.length === 0) {
      bucketStart = w.start ?? bucketStart;
    }
    currentText.push(w.word);

    const end = w.end ?? bucketStart;
    const shouldFlush = (end - bucketStart) >= bucketSizeSec || currentText.length >= maxWordsPerSegment;
    if (shouldFlush) {
      segments.push({
        start: bucketStart || 0,
        end,
        text: currentText.join(' ').trim(),
      });
      currentText = [];
    }
  }

  if (currentText.length > 0) {
    const lastEnd = words[words.length - 1]?.end ?? bucketStart;
    segments.push({
      start: bucketStart || 0,
      end: lastEnd,
      text: currentText.join(' ').trim(),
    });
  }

  return segments.filter((s) => s.text.length > 0);
}

function removeLoopingSegmentArtifacts(segments) {
  if (!Array.isArray(segments) || segments.length === 0) {
    return [];
  }

  const cleaned = [];
  let lastNormalized = '';
  let lastEnd = -Infinity;

  for (const seg of segments) {
    const text = String(seg.text || '').trim();
    if (!text) {
      continue;
    }

    const normalized = normalizeTextToken(text);
    const start = typeof seg.start === 'number' ? seg.start : 0;
    const end = typeof seg.end === 'number' ? seg.end : start;
    const isLikelyOverlapDuplicate = normalized && normalized === lastNormalized && start <= (lastEnd + 1.0);
    if (isLikelyOverlapDuplicate) {
      continue;
    }

    cleaned.push({ start, end, text });
    lastNormalized = normalized;
    lastEnd = end;
  }

  return cleaned;
}

function segmentWordsWithApproximateTiming(segment) {
  const text = String(segment?.text || '').trim();
  if (!text) return [];

  const tokenMatches = text.match(/\S+/g) || [];
  if (tokenMatches.length === 0) return [];

  const start = Number.isFinite(segment?.start) ? Number(segment.start) : 0;
  const end = Number.isFinite(segment?.end) ? Number(segment.end) : start;
  const duration = Math.max(0.06, end - start);

  // Weight by token length so longer words receive slightly more duration.
  const weights = tokenMatches.map((token) => Math.max(1, token.replace(/[^a-z0-9']/gi, '').length));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || tokenMatches.length;

  let cursor = start;
  const words = [];
  for (let i = 0; i < tokenMatches.length; i += 1) {
    const token = tokenMatches[i];
    const chunk = duration * (weights[i] / totalWeight);
    const wordStart = i === 0 ? start : cursor;
    let wordEnd = i === tokenMatches.length - 1 ? end : (cursor + chunk);
    if (wordEnd <= wordStart) {
      wordEnd = wordStart + 0.01;
    }
    words.push({
      start: wordStart,
      end: wordEnd,
      word: token,
      approximate: true,
    });
    cursor = wordEnd;
  }

  return words;
}

function segmentsToApproxWords(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return [];
  const words = [];
  for (const segment of segments) {
    words.push(...segmentWordsWithApproximateTiming(segment));
  }
  return words;
}

// Initialize the Whisper pipeline
let transcriber = null;
let forceNoTimestamps = false;
let activeWhisperModel = WHISPER_MODEL;

async function initializeTranscriber() {
  if (!transcriber) {
    console.log('Initializing Whisper model (first run may take a few minutes)...');
    const candidateModels = [WHISPER_MODEL, ...WHISPER_FALLBACK_MODELS].filter(
      (model, i, arr) => !!model && arr.indexOf(model) === i
    );

    let lastError = null;
    for (const modelName of candidateModels) {
      try {
        transcriber = await pipeline(
          'automatic-speech-recognition',
          modelName,
          {
            device: WHISPER_DEVICE, // e.g. 'cpu'
            quantized: WHISPER_QUANTIZED, // false = better quality, true = lower memory/faster
          }
        );
        activeWhisperModel = modelName;
        if (modelName !== WHISPER_MODEL) {
          console.warn(`Requested model ${WHISPER_MODEL} failed. Using fallback model: ${modelName}`);
        }
        console.log(`✓ Whisper model initialized successfully (${activeWhisperModel}, device=${WHISPER_DEVICE}, quantized=${WHISPER_QUANTIZED})`);
        return;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Failed to initialize model ${modelName}: ${message}`);
      }
    }

    console.error('Failed to initialize Whisper model:', lastError);
    throw lastError;
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Transcription service is running' });
});

// Main transcription endpoint
app.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    console.log(`Starting transcription for: ${req.file.originalname} (${req.file.size} bytes)`);

    // Initialize transcriber if not already done
    if (!transcriber) {
      await initializeTranscriber();
    }

    // Decode incoming audio (mp3/wav/etc) to mono Float32 PCM for Node Whisper inference.
    const audioSamples = await decodeAudioToFloat32(req.file.buffer);

    // Run transcription
    const startTime = Date.now();
    const chunkLengthS = Number.isFinite(WHISPER_CHUNK_LENGTH_S) && WHISPER_CHUNK_LENGTH_S > 0 ? WHISPER_CHUNK_LENGTH_S : 12;
    const requestedStrideLengthS = Number.isFinite(WHISPER_STRIDE_LENGTH_S) && WHISPER_STRIDE_LENGTH_S >= 0 ? WHISPER_STRIDE_LENGTH_S : 1.5;
    // Keep overlap conservative to reduce duplication and avoid invalid/degenerate chunk windows.
    const maxSafeStrideLengthS = Math.max(0, (chunkLengthS / 2) - 0.1);
    const strideLengthS = Math.min(requestedStrideLengthS, maxSafeStrideLengthS);

    const getReturnTimestamps = (mode) => {
      if (mode === 'word') return 'word';
      if (mode === 'segment') return true;
      return false;
    };

    const buildTranscriptionOptions = ({ mode, includeAdvanced }) => {
      const options = {
        task: 'transcribe',
        return_timestamps: getReturnTimestamps(mode),
        chunk_length_s: chunkLengthS,
        stride_length_s: strideLengthS,
      };

      if (includeAdvanced) {
        if (Number.isFinite(WHISPER_NUM_BEAMS) && WHISPER_NUM_BEAMS > 1) {
          options.num_beams = WHISPER_NUM_BEAMS;
        }
        if (Number.isFinite(WHISPER_REPETITION_PENALTY) && WHISPER_REPETITION_PENALTY > 1) {
          options.repetition_penalty = WHISPER_REPETITION_PENALTY;
        }
        if (Number.isFinite(WHISPER_NO_REPEAT_NGRAM_SIZE) && WHISPER_NO_REPEAT_NGRAM_SIZE > 0) {
          options.no_repeat_ngram_size = WHISPER_NO_REPEAT_NGRAM_SIZE;
        }
      }

      if (WHISPER_LANGUAGE) {
        options.language = WHISPER_LANGUAGE;
      }

      return options;
    };

    let result;
    let effectiveTimestampMode = forceNoTimestamps
      ? 'none'
      : (WHISPER_TIMESTAMP_MODE === 'word' || WHISPER_TIMESTAMP_MODE === 'segment'
        ? WHISPER_TIMESTAMP_MODE
        : (modelUsesSegmentTimestampsByDefault(activeWhisperModel) ? 'segment' : 'word'));

    const attempts = [
      { label: 'primary', mode: effectiveTimestampMode, includeAdvanced: true },
      // Medium models can fail on word-timestamp extraction; segment mode is safer.
      ...(effectiveTimestampMode === 'word' ? [{ label: 'segment-fallback', mode: 'segment', includeAdvanced: false }] : []),
      { label: 'plain-fallback', mode: 'none', includeAdvanced: false },
    ];

    let lastError = null;
    for (const attempt of attempts) {
      try {
        result = await transcriber(audioSamples, buildTranscriptionOptions(attempt));
        effectiveTimestampMode = attempt.mode;
        if (attempt.label !== 'primary') {
          console.warn(`Whisper retry succeeded with ${attempt.label} (mode=${attempt.mode}).`);
        }
        break;
      } catch (err) {
        lastError = err;
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`Whisper attempt failed (${attempt.label}, mode=${attempt.mode}): ${message}`);
        // Some transformers.js builds throw this repeatedly when timestamps are enabled.
        // Switch this process to no-timestamp mode after first detection to avoid
        // paying the full failed decode cost on every subsequent request.
        if (attempt.mode !== 'none' && message.toLowerCase().includes('offset is out of bounds')) {
          forceNoTimestamps = true;
          console.warn('Detected timestamp extraction bug; forcing WHISPER timestamp mode to NONE for this process.');
        }
      }
    }

    if (!result) {
      throw lastError || new Error('Whisper transcription failed after retries');
    }
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`✓ Transcription completed in ${duration}s`);

    // Parse and structure the response to match OpenAI's format
    let transcription = (result.text || '').trim();
    let segments = [];
    let words = [];

    // Handle both ASR chunk shapes:
    // 1) segment-level: [{ text, timestamp }, ...]
    // 2) word-level:    [{ text, timestamp }, ...] when return_timestamps='word'
    // 3) nested words:  [{ text, timestamp, words:[...] }, ...]
    if (result.chunks && Array.isArray(result.chunks)) {
      const chunks = result.chunks;
      const first = chunks[0];
      const hasNestedWords = !!first?.words && Array.isArray(first.words);
      const hasTimestamp = !!first?.timestamp && Array.isArray(first.timestamp);

      if (hasNestedWords) {
        segments = chunks.map((chunk) => ({
          start: chunk.timestamp?.[0] || 0,
          end: chunk.timestamp?.[1] || 0,
          text: (chunk.text || '').trim(),
        })).filter((s) => s.text.length > 0);

        chunks.forEach((chunk) => {
          if (chunk.words && Array.isArray(chunk.words)) {
            chunk.words.forEach((wordObj) => {
              words.push({
                start: wordObj.timestamp ? wordObj.timestamp[0] : 0,
                end: wordObj.timestamp ? wordObj.timestamp[1] : 0,
                word: String(wordObj.word || wordObj.text || '').trim(),
              });
            });
          }
        });
      } else if (hasTimestamp && effectiveTimestampMode === 'word') {
        // With return_timestamps='word', chunks are already word-level entries.
        words = chunks.map((chunk) => ({
          start: chunk.timestamp?.[0] || 0,
          end: chunk.timestamp?.[1] || 0,
          word: String(chunk.text || '').trim(),
        })).filter((w) => w.word.length > 0);
      } else {
        segments = chunks.map((chunk) => ({
          start: chunk.timestamp?.[0] || 0,
          end: chunk.timestamp?.[1] || 0,
          text: (chunk.text || '').trim(),
        })).filter((s) => s.text.length > 0);
      }
    }

    if (words.length > 0) {
      words = removeLoopingWordArtifacts(words);
      if (segments.length === 0) {
        segments = coalesceWordsToSegments(words);
      }
    }
    if (segments.length > 0) {
      segments = removeLoopingSegmentArtifacts(segments);
    }

    // Guarantee word-level timing output locally:
    // if Whisper only returned segments, approximate word timings from segment text.
    if (words.length === 0 && segments.length > 0) {
      words = segmentsToApproxWords(segments);
      if (words.length > 0) {
        console.warn(
          `Generated approximate word timings from segments (${words.length} words)`
        );
      }
    }

    // Final fallback chain so clients never receive a blank string unless absolutely no text exists.
    if (!transcription && segments.length > 0) {
      transcription = segments.map((s) => s.text).filter(Boolean).join(' ').trim();
    }
    if (!transcription && words.length > 0) {
      transcription = words.map((w) => w.word).filter(Boolean).join(' ').trim();
    }

    console.log(`Transcription payload stats: chars=${transcription.length}, segments=${segments.length}, words=${words.length}`);

    let lyricsAnalysis = null;
    let lyricsAnalysisProvider = null;

    if (ENABLE_LYRICS_ANALYSIS && transcription.length >= LOCAL_LYRICS_MIN_CHARS) {
      const requestedProvider = ALLOW_LYRICS_PROVIDER_OVERRIDE
        ? normalizeProvider(req.headers['x-lyrics-ai-provider'])
        : null;

      const analysisResult = await analyzeLyricsWithProvider(
        transcription,
        requestedProvider || DEFAULT_LYRICS_PROVIDER
      );

      lyricsAnalysis = analysisResult.analysis;
      lyricsAnalysisProvider = analysisResult.providerUsed;

      if (analysisResult.providerError) {
        console.warn(
          `Lyrics analysis fallback (${analysisResult.providerRequested} -> ${analysisResult.providerUsed}): ${analysisResult.providerError}`
        );
      }

      console.log(
        `Lyrics analysis provider=${lyricsAnalysisProvider}, sentiment=${lyricsAnalysis.sentiment}, mood=${lyricsAnalysis.mood.join('|')}, themes=${lyricsAnalysis.themes.join('|')}`
      );
    } else if (!ENABLE_LYRICS_ANALYSIS) {
      console.log('Skipping lyrics analysis: ENABLE_LYRICS_ANALYSIS=false');
    } else {
      console.log(
        `Skipping local lyrics analysis: transcript too short (${transcription.length}/${LOCAL_LYRICS_MIN_CHARS} chars)`
      );
    }

    res.json({
      transcription,
      segments,
      words,
      lyricsAnalysis,
      lyricsAnalysisProvider,
      fileName: req.file.originalname,
      duration: parseFloat(duration),
    });
  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({
      error: 'Failed to transcribe audio',
      details: error.message,
    });
  }
});

// Start server
const PORT = process.env.WHISPER_PORT || 3001;
app.listen(PORT, () => {
  console.log(`🎙️  Whisper transcription service running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   Transcribe: POST http://localhost:${PORT}/transcribe`);
  console.log(`   Word-level timing preference: ${WHISPER_FORCE_WORD_TIMINGS ? 'enabled' : 'disabled'} (timestamp mode=${WHISPER_TIMESTAMP_MODE})`);
  console.log(
    `   Lyrics analysis: ${ENABLE_LYRICS_ANALYSIS ? 'enabled' : 'disabled'} (provider: ${DEFAULT_LYRICS_PROVIDER}, min chars: ${LOCAL_LYRICS_MIN_CHARS})`
  );
  console.log(
    `   Provider override by header (x-lyrics-ai-provider): ${ALLOW_LYRICS_PROVIDER_OVERRIDE ? 'enabled' : 'disabled'}`
  );
  
  // Initialize transcriber on startup
  initializeTranscriber().catch((err) => {
    console.error('Failed to initialize transcriber on startup:', err);
    process.exit(1);
  });
});
