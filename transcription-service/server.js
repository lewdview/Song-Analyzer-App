import express from 'express';
import multer from 'multer';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { pipeline } from '@xenova/transformers';
import { fileURLToPath } from 'url';
import {
  analyzeLyricsWithProvider,
  getConfiguredProvider,
  normalizeProvider,
} from './lyrics-ai-router.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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
const isEnglishOnlyWhisperModel = (modelName) => /\.en($|[^a-z0-9])/i.test(String(modelName || ''));
const getEffectiveWhisperLanguage = (language, modelName) => {
  const trimmed = String(language || '').trim();
  if (!trimmed) {
    return '';
  }

  const normalized = trimmed.toLowerCase();
  if (isEnglishOnlyWhisperModel(modelName) && (normalized === 'english' || normalized === 'en')) {
    return '';
  }

  return trimmed;
};
const modelUsesSegmentTimestampsByDefault = (modelName) => {
  const lower = String(modelName || '').toLowerCase();
  return lower.includes('medium') || lower.includes('large');
};
const inferredDefaultTimestampMode = WHISPER_FORCE_WORD_TIMINGS
  ? 'word'
  : (modelUsesSegmentTimestampsByDefault(WHISPER_MODEL) ? 'segment' : 'word');
const WHISPER_TIMESTAMP_MODE = (process.env.WHISPER_TIMESTAMP_MODE || inferredDefaultTimestampMode).trim().toLowerCase();
const WHISPER_MEMORY_SAVER_FILE_MB = Number.parseFloat(process.env.WHISPER_MEMORY_SAVER_FILE_MB || '5');
const WHISPER_MEMORY_SAVER_DURATION_S = Number.parseFloat(process.env.WHISPER_MEMORY_SAVER_DURATION_S || '150');
const WHISPER_MEMORY_SAVER_CHUNK_LENGTH_S = Number.parseFloat(process.env.WHISPER_MEMORY_SAVER_CHUNK_LENGTH_S || '6');
const WHISPER_MEMORY_SAVER_STRIDE_LENGTH_S = Number.parseFloat(process.env.WHISPER_MEMORY_SAVER_STRIDE_LENGTH_S || '0.75');
const WHISPER_MEMORY_SAVER_WINDOW_LENGTH_S = Number.parseFloat(process.env.WHISPER_MEMORY_SAVER_WINDOW_LENGTH_S || '12');
const WHISPER_MEMORY_SAVER_WINDOW_OVERLAP_S = Number.parseFloat(process.env.WHISPER_MEMORY_SAVER_WINDOW_OVERLAP_S || '0.5');
const WHISPER_MEMORY_SAVER_RESET_EVERY_WINDOWS = Number.parseInt(process.env.WHISPER_MEMORY_SAVER_RESET_EVERY_WINDOWS || '4', 10);
const WHISPER_PLAIN_MODE_FILE_MB = Number.parseFloat(process.env.WHISPER_PLAIN_MODE_FILE_MB || '6');
const WHISPER_PLAIN_MODE_DURATION_S = Number.parseFloat(process.env.WHISPER_PLAIN_MODE_DURATION_S || '210');
const WHISPER_PROCESS_ISOLATION_FILE_MB = Number.parseFloat(process.env.WHISPER_PROCESS_ISOLATION_FILE_MB || '6');
const WHISPER_PROCESS_ISOLATION_DURATION_S = Number.parseFloat(process.env.WHISPER_PROCESS_ISOLATION_DURATION_S || '210');
const WHISPER_PRELOAD_ON_STARTUP = process.env.WHISPER_PRELOAD_ON_STARTUP === 'true';
const TRANSCRIBE_PROGRESS_ACTIVE_TTL_MS = Number.parseInt(process.env.TRANSCRIBE_PROGRESS_ACTIVE_TTL_MS || '1800000', 10);
const TRANSCRIBE_PROGRESS_FINAL_TTL_MS = Number.parseInt(process.env.TRANSCRIBE_PROGRESS_FINAL_TTL_MS || '600000', 10);

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

function getAudioDurationSeconds(audioPath) {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      audioPath,
    ]);

    const stdoutChunks = [];
    const stderrChunks = [];

    ffprobe.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    ffprobe.stderr.on('data', (chunk) => stderrChunks.push(chunk));
    ffprobe.on('error', (err) => reject(new Error(`Failed to start ffprobe: ${err.message}`)));
    ffprobe.on('close', (code) => {
      if (code !== 0) {
        const details = Buffer.concat(stderrChunks).toString('utf8').trim();
        reject(new Error(`ffprobe failed (exit ${code})${details ? `: ${details}` : ''}`));
        return;
      }

      const duration = Number.parseFloat(Buffer.concat(stdoutChunks).toString('utf8').trim());
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error('ffprobe returned an invalid duration'));
        return;
      }

      resolve(duration);
    });
  });
}

async function writeUploadToTempFile(buffer, originalName) {
  const safeExt = path.extname(String(originalName || '')).slice(0, 16);
  const filePath = path.join(os.tmpdir(), `whisper-upload-${randomUUID()}${safeExt}`);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

async function removeTempFile(filePath) {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn(`Failed to remove temp file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
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

const transcriptionJobs = new Map();

function sanitizeProgressPercent(value, fallback = 0) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatProgressClock(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '--:--';
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function computeWindowProgress(windowIndex, totalWindows, startPercent = 42, endPercent = 90) {
  if (!Number.isFinite(totalWindows) || totalWindows <= 0) {
    return startPercent;
  }
  const ratio = Math.max(0, Math.min(1, windowIndex / totalWindows));
  return sanitizeProgressPercent(startPercent + (endPercent - startPercent) * ratio, startPercent);
}

function buildWindowProgressDetail(windowIndex, totalWindows, offsetSeconds, durationSeconds) {
  if (!Number.isFinite(totalWindows) || totalWindows <= 0) {
    return 'Whisper is processing audio on the server.';
  }
  const windowStart = formatProgressClock(offsetSeconds);
  const windowEnd = formatProgressClock(offsetSeconds + durationSeconds);
  return `Completed window ${windowIndex} of ${totalWindows} (${windowStart}-${windowEnd}).`;
}

function estimateRemainingMs(snapshot) {
  if (!snapshot || snapshot.status !== 'running') {
    return null;
  }

  if (!Number.isFinite(snapshot.phaseStartedAt) || !Number.isFinite(snapshot.updatedAt)) {
    return null;
  }

  const phaseElapsedMs = Math.max(0, snapshot.updatedAt - snapshot.phaseStartedAt);

  if (
    snapshot.phase === 'transcribing' &&
    Number.isFinite(snapshot.totalWindows) &&
    snapshot.totalWindows > 0 &&
    Number.isFinite(snapshot.completedWindows) &&
    snapshot.completedWindows > 0 &&
    snapshot.completedWindows < snapshot.totalWindows
  ) {
    const averageWindowMs = phaseElapsedMs / snapshot.completedWindows;
    const remainingWindows = Math.max(0, snapshot.totalWindows - snapshot.completedWindows);
    return Math.max(1000, Math.round(averageWindowMs * remainingWindows));
  }

  if (
    snapshot.phase === 'transcribing' &&
    snapshot.mode === 'standard' &&
    Number.isFinite(snapshot.percent) &&
    snapshot.percent > 58 &&
    snapshot.percent < 90
  ) {
    const ratio = (snapshot.percent - 58) / 32;
    if (ratio > 0.05) {
      return Math.max(1000, Math.round((phaseElapsedMs * (1 - ratio)) / ratio));
    }
  }

  if (snapshot.phase === 'finalizing') {
    return Math.max(1500, 8000 - Math.min(7000, phaseElapsedMs));
  }

  return null;
}

function upsertTranscriptionJob(jobId, patch) {
  if (!jobId) {
    return null;
  }

  const now = Date.now();
  const previous = transcriptionJobs.get(jobId);
  const nextPhase = patch.phase ?? previous?.phase ?? 'prepare';
  const phaseStartedAt = previous?.phase === nextPhase
    ? (previous?.phaseStartedAt ?? previous?.startedAt ?? now)
    : now;
  const next = {
    jobId,
    status: 'running',
    phase: 'prepare',
    label: 'Preparing audio',
    detail: 'Waiting for upload data.',
    percent: 0,
    fileName: '',
    fileSize: 0,
    audioDurationSeconds: null,
    mode: 'standard',
    completedWindows: 0,
    totalWindows: 0,
    startedAt: previous?.startedAt ?? now,
    updatedAt: previous?.updatedAt ?? now,
    phaseStartedAt,
    estimatedRemainingMs: null,
    completedAt: previous?.completedAt ?? null,
    ...previous,
    ...patch,
  };

  next.updatedAt = now;
  next.phaseStartedAt = phaseStartedAt;

  if ((next.status === 'complete' || next.status === 'error') && !next.completedAt) {
    next.completedAt = now;
  }

  next.percent = sanitizeProgressPercent(next.percent, previous?.percent ?? 0);
  next.estimatedRemainingMs = estimateRemainingMs(next);
  transcriptionJobs.set(jobId, next);
  return next;
}

function createTranscriptionJob(jobId, { fileName, fileSize }) {
  return upsertTranscriptionJob(jobId, {
    status: 'running',
    phase: 'prepare',
    label: 'Upload received',
    detail: 'Preparing audio for transcription.',
    percent: 4,
    fileName,
    fileSize,
    audioDurationSeconds: null,
    mode: 'standard',
    completedWindows: 0,
    totalWindows: 0,
    completedAt: null,
  });
}

function failTranscriptionJob(jobId, error) {
  const details = error instanceof Error ? error.message : String(error || 'Unknown error');
  return upsertTranscriptionJob(jobId, {
    status: 'error',
    phase: 'error',
    label: 'Transcription failed',
    detail: details,
    percent: 100,
  });
}

function completeTranscriptionJob(jobId, patch = {}) {
  return upsertTranscriptionJob(jobId, {
    status: 'complete',
    phase: 'complete',
    label: 'Transcript ready',
    detail: 'Transcription finished successfully.',
    percent: 100,
    ...patch,
  });
}

function pruneTranscriptionJobs() {
  const now = Date.now();
  for (const [jobId, snapshot] of transcriptionJobs.entries()) {
    const isFinal = snapshot.status === 'complete' || snapshot.status === 'error';
    const ttlMs = isFinal ? TRANSCRIBE_PROGRESS_FINAL_TTL_MS : TRANSCRIBE_PROGRESS_ACTIVE_TTL_MS;
    const referenceTime = snapshot.completedAt ?? snapshot.updatedAt ?? snapshot.startedAt ?? now;
    if ((referenceTime + ttlMs) < now) {
      transcriptionJobs.delete(jobId);
    }
  }
}

const transcriptionProgressPruner = setInterval(pruneTranscriptionJobs, 60_000);
if (typeof transcriptionProgressPruner.unref === 'function') {
  transcriptionProgressPruner.unref();
}

// Initialize the Whisper pipeline
let transcriber = null;
let forceNoTimestamps = false;
let activeWhisperModel = WHISPER_MODEL;

function getProcessMemorySummary() {
  const usage = process.memoryUsage();
  const toMb = (value) => `${(value / 1024 / 1024).toFixed(1)}MB`;
  return `rss=${toMb(usage.rss)}, heapUsed=${toMb(usage.heapUsed)}, external=${toMb(usage.external)}`;
}

async function maybeRunGarbageCollection() {
  if (typeof global.gc === 'function') {
    global.gc();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function disposeTranscriber(reason = 'unspecified') {
  if (!transcriber) {
    return;
  }

  console.warn(`Disposing Whisper model (${activeWhisperModel}) [${reason}]`);
  try {
    await transcriber.dispose();
  } catch (error) {
    console.warn(`Whisper dispose warning: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    transcriber = null;
    await maybeRunGarbageCollection();
    console.warn(`Whisper model disposed; memory after cleanup: ${getProcessMemorySummary()}`);
  }
}

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
        if (WHISPER_LANGUAGE && !getEffectiveWhisperLanguage(WHISPER_LANGUAGE, activeWhisperModel)) {
          console.log(`Omitting language hint "${WHISPER_LANGUAGE}" for English-only model ${activeWhisperModel}`);
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

async function transcribeSequentialWindows(audioSamples, options, onProgress = null) {
  const windowLengthS = Number.isFinite(WHISPER_MEMORY_SAVER_WINDOW_LENGTH_S) && WHISPER_MEMORY_SAVER_WINDOW_LENGTH_S > 0
    ? WHISPER_MEMORY_SAVER_WINDOW_LENGTH_S
    : 20;
  const requestedOverlapS = Number.isFinite(WHISPER_MEMORY_SAVER_WINDOW_OVERLAP_S) && WHISPER_MEMORY_SAVER_WINDOW_OVERLAP_S >= 0
    ? WHISPER_MEMORY_SAVER_WINDOW_OVERLAP_S
    : 0.75;
  const overlapS = Math.min(requestedOverlapS, Math.max(0, (windowLengthS / 2) - 0.01));
  const windowSamples = Math.max(1, Math.floor(windowLengthS * WHISPER_SAMPLE_RATE));
  const overlapSamples = Math.max(0, Math.floor(overlapS * WHISPER_SAMPLE_RATE));
  const stepSamples = Math.max(1, windowSamples - overlapSamples);
  const totalWindows = Math.max(1, Math.ceil(Math.max(0, audioSamples.length - overlapSamples) / stepSamples));
  const recycleEveryWindows = Number.isFinite(WHISPER_MEMORY_SAVER_RESET_EVERY_WINDOWS) && WHISPER_MEMORY_SAVER_RESET_EVERY_WINDOWS > 0
    ? Math.floor(WHISPER_MEMORY_SAVER_RESET_EVERY_WINDOWS)
    : 0;
  const collectedTexts = [];
  const collectedChunks = [];
  let windowIndex = 0;

  for (let start = 0; start < audioSamples.length; start += stepSamples) {
    windowIndex += 1;
    const end = Math.min(audioSamples.length, start + windowSamples);
    const slice = audioSamples.subarray(start, end);
    const offsetSeconds = start / WHISPER_SAMPLE_RATE;
    const sliceDurationSeconds = slice.length / WHISPER_SAMPLE_RATE;
    const windowResult = await transcriber(slice, {
      ...options,
      chunk_length_s: 0,
      stride_length_s: 0,
    });
    const windowText = String(windowResult?.text || '').trim();

    if (windowText) {
      collectedTexts.push(windowText);
    }

    if (Array.isArray(windowResult?.chunks) && windowResult.chunks.length > 0) {
      for (const chunk of windowResult.chunks) {
        const timestamp = Array.isArray(chunk?.timestamp) ? chunk.timestamp : null;
        const startTime = typeof timestamp?.[0] === 'number' ? timestamp[0] + offsetSeconds : offsetSeconds;
        const endTime = typeof timestamp?.[1] === 'number' ? timestamp[1] + offsetSeconds : (offsetSeconds + sliceDurationSeconds);
        collectedChunks.push({
          ...chunk,
          timestamp: [startTime, endTime],
        });
      }
    } else if (windowText) {
      collectedChunks.push({
        text: windowText,
        timestamp: [offsetSeconds, offsetSeconds + sliceDurationSeconds],
      });
    }

    if (windowIndex === 1 || windowIndex === totalWindows || windowIndex % 5 === 0) {
      console.log(
        `Memory-saver window ${windowIndex}/${totalWindows} completed (offset=${offsetSeconds.toFixed(1)}s, chars=${windowText.length}, ${getProcessMemorySummary()})`
      );
    }

    if (typeof onProgress === 'function') {
      onProgress({
        windowIndex,
        totalWindows,
        offsetSeconds,
        durationSeconds: sliceDurationSeconds,
        windowTextLength: windowText.length,
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
    await maybeRunGarbageCollection();

    if (
      recycleEveryWindows > 0 &&
      windowIndex < totalWindows &&
      windowIndex % recycleEveryWindows === 0
    ) {
      await disposeTranscriber(`memory-saver recycle after window ${windowIndex}/${totalWindows}`);
      await initializeTranscriber();
    }

    if (end >= audioSamples.length) {
      break;
    }
  }

  return {
    text: collectedTexts.join(' ').trim(),
    chunks: collectedChunks,
  };
}

function serializeWorkerReturnTimestamps(value) {
  if (value === 'word') return 'word';
  if (value === true) return 'segment';
  return 'none';
}

async function transcribeWindowWithWorker({
  audioPath,
  offsetSeconds,
  durationSeconds,
  modelName,
  device,
  quantized,
  language,
  returnTimestamps,
}) {
  const workerOutputPath = path.join(os.tmpdir(), `whisper-window-${randomUUID()}.json`);
  const workerScriptPath = path.join(__dirname, 'window-worker.js');

  try {
    await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          workerScriptPath,
          audioPath,
          workerOutputPath,
          String(offsetSeconds),
          String(durationSeconds),
          modelName,
          device,
          quantized ? 'true' : 'false',
          String(WHISPER_SAMPLE_RATE),
          serializeWorkerReturnTimestamps(returnTimestamps),
          language || '',
        ],
        {
          stdio: ['ignore', 'ignore', 'pipe'],
          env: {
            ...process.env,
            WHISPER_CHILD: 'true',
          },
        }
      );

      const stderrChunks = [];
      child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
      child.on('error', (err) => reject(new Error(`Failed to start Whisper worker: ${err.message}`)));
      child.on('close', (code) => {
        if (code !== 0) {
          const details = Buffer.concat(stderrChunks).toString('utf8').trim();
          reject(new Error(`Whisper worker failed (exit ${code})${details ? `: ${details}` : ''}`));
          return;
        }
        resolve();
      });
    });

    const payload = JSON.parse(await fs.readFile(workerOutputPath, 'utf8'));
    return payload;
  } finally {
    await removeTempFile(workerOutputPath);
  }
}

async function transcribeIsolatedWindows({
  audioPath,
  audioDurationSeconds,
  modelName,
  returnTimestamps,
  language,
  onProgress = null,
}) {
  const windowLengthS = Number.isFinite(WHISPER_MEMORY_SAVER_WINDOW_LENGTH_S) && WHISPER_MEMORY_SAVER_WINDOW_LENGTH_S > 0
    ? WHISPER_MEMORY_SAVER_WINDOW_LENGTH_S
    : 20;
  const requestedOverlapS = Number.isFinite(WHISPER_MEMORY_SAVER_WINDOW_OVERLAP_S) && WHISPER_MEMORY_SAVER_WINDOW_OVERLAP_S >= 0
    ? WHISPER_MEMORY_SAVER_WINDOW_OVERLAP_S
    : 0.75;
  const overlapS = Math.min(requestedOverlapS, Math.max(0, (windowLengthS / 2) - 0.01));
  const stepSeconds = Math.max(0.25, windowLengthS - overlapS);
  const totalWindows = Math.max(1, Math.ceil(Math.max(0, audioDurationSeconds - overlapS) / stepSeconds));
  const collectedTexts = [];
  const collectedChunks = [];
  let windowIndex = 0;

  for (let offsetSeconds = 0; offsetSeconds < audioDurationSeconds; offsetSeconds += stepSeconds) {
    windowIndex += 1;
    const remainingSeconds = Math.max(0.1, audioDurationSeconds - offsetSeconds);
    const durationSeconds = Math.min(windowLengthS, remainingSeconds);
    const windowResult = await transcribeWindowWithWorker({
      audioPath,
      offsetSeconds,
      durationSeconds,
      modelName,
      device: WHISPER_DEVICE,
      quantized: WHISPER_QUANTIZED,
      language,
      returnTimestamps,
    });
    const windowText = String(windowResult?.text || '').trim();

    if (windowText) {
      collectedTexts.push(windowText);
    }

    if (Array.isArray(windowResult?.chunks) && windowResult.chunks.length > 0) {
      for (const chunk of windowResult.chunks) {
        const timestamp = Array.isArray(chunk?.timestamp) ? chunk.timestamp : null;
        const startTime = typeof timestamp?.[0] === 'number' ? timestamp[0] + offsetSeconds : offsetSeconds;
        const endTime = typeof timestamp?.[1] === 'number' ? timestamp[1] + offsetSeconds : (offsetSeconds + durationSeconds);
        collectedChunks.push({
          ...chunk,
          timestamp: [startTime, endTime],
        });
      }
    } else if (windowText) {
      collectedChunks.push({
        text: windowText,
        timestamp: [offsetSeconds, offsetSeconds + durationSeconds],
      });
    }

    if (windowIndex === 1 || windowIndex === totalWindows || windowIndex % 5 === 0) {
      console.log(
        `Worker window ${windowIndex}/${totalWindows} completed (offset=${offsetSeconds.toFixed(1)}s, chars=${windowText.length}, ${getProcessMemorySummary()})`
      );
    }

    if (typeof onProgress === 'function') {
      onProgress({
        windowIndex,
        totalWindows,
        offsetSeconds,
        durationSeconds,
        windowTextLength: windowText.length,
      });
    }
  }

  return {
    text: collectedTexts.join(' ').trim(),
    chunks: collectedChunks,
  };
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Transcription service is running',
    progressEndpoint: true,
    etaSupport: true,
  });
});

app.get('/transcribe-progress/:jobId', (req, res) => {
  const snapshot = transcriptionJobs.get(req.params.jobId);
  if (!snapshot) {
    return res.status(404).json({ error: 'Unknown transcription job' });
  }

  res.json(snapshot);
});

// Main transcription endpoint
app.post('/transcribe', upload.single('audio'), async (req, res) => {
  let tempUploadPath = null;
  const jobId = String(req.body?.job_id || randomUUID());
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const fileName = req.file.originalname;
    const fileSize = req.file.size;
    let uploadBuffer = req.file.buffer;

    createTranscriptionJob(jobId, { fileName, fileSize });

    console.log(`Starting transcription for: ${fileName} (${fileSize} bytes)`);

    // Run transcription
    const startTime = Date.now();

    const getReturnTimestamps = (mode) => {
      if (mode === 'word') return 'word';
      if (mode === 'segment') return true;
      return false;
    };

    const defaultChunkLengthS = Number.isFinite(WHISPER_CHUNK_LENGTH_S) && WHISPER_CHUNK_LENGTH_S > 0 ? WHISPER_CHUNK_LENGTH_S : 12;
    const defaultStrideLengthS = Number.isFinite(WHISPER_STRIDE_LENGTH_S) && WHISPER_STRIDE_LENGTH_S >= 0 ? WHISPER_STRIDE_LENGTH_S : 1.5;
    let chunkLengthS = defaultChunkLengthS;
    let strideLengthS = Math.min(defaultStrideLengthS, Math.max(0, (defaultChunkLengthS / 2) - 0.1));

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

      const effectiveLanguage = getEffectiveWhisperLanguage(WHISPER_LANGUAGE, activeWhisperModel);
      if (effectiveLanguage) {
        options.language = effectiveLanguage;
      }

      return options;
    };

    let result;
    let effectiveTimestampMode;

    upsertTranscriptionJob(jobId, {
      phase: 'prepare',
      label: 'Preparing upload',
      detail: 'Writing the uploaded audio to temporary storage.',
      percent: 10,
    });
    tempUploadPath = await writeUploadToTempFile(uploadBuffer, fileName);
    uploadBuffer = null;
    req.file.buffer = undefined;
    await maybeRunGarbageCollection();

    upsertTranscriptionJob(jobId, {
      phase: 'prepare',
      label: 'Inspecting audio',
      detail: 'Measuring duration and choosing the safest transcription mode.',
      percent: 18,
    });
    const audioDurationS = await getAudioDurationSeconds(tempUploadPath);
    const useMemorySaverMode =
      (Number.isFinite(WHISPER_MEMORY_SAVER_FILE_MB) && fileSize >= WHISPER_MEMORY_SAVER_FILE_MB * 1024 * 1024) ||
      (Number.isFinite(WHISPER_MEMORY_SAVER_DURATION_S) && audioDurationS >= WHISPER_MEMORY_SAVER_DURATION_S);
    const forcePlainMemorySaverMode =
      (Number.isFinite(WHISPER_PLAIN_MODE_FILE_MB) && fileSize >= WHISPER_PLAIN_MODE_FILE_MB * 1024 * 1024) ||
      (Number.isFinite(WHISPER_PLAIN_MODE_DURATION_S) && audioDurationS >= WHISPER_PLAIN_MODE_DURATION_S);
    const useProcessIsolationMode =
      (Number.isFinite(WHISPER_PROCESS_ISOLATION_FILE_MB) && fileSize >= WHISPER_PROCESS_ISOLATION_FILE_MB * 1024 * 1024) ||
      (Number.isFinite(WHISPER_PROCESS_ISOLATION_DURATION_S) && audioDurationS >= WHISPER_PROCESS_ISOLATION_DURATION_S);

    chunkLengthS = useMemorySaverMode
      ? Math.min(defaultChunkLengthS, Number.isFinite(WHISPER_MEMORY_SAVER_CHUNK_LENGTH_S) && WHISPER_MEMORY_SAVER_CHUNK_LENGTH_S > 0 ? WHISPER_MEMORY_SAVER_CHUNK_LENGTH_S : 6)
      : defaultChunkLengthS;
    const requestedStrideLengthS = useMemorySaverMode
      ? Math.min(defaultStrideLengthS, Number.isFinite(WHISPER_MEMORY_SAVER_STRIDE_LENGTH_S) && WHISPER_MEMORY_SAVER_STRIDE_LENGTH_S >= 0 ? WHISPER_MEMORY_SAVER_STRIDE_LENGTH_S : 0.75)
      : defaultStrideLengthS;
    strideLengthS = Math.min(requestedStrideLengthS, Math.max(0, (chunkLengthS / 2) - 0.1));

    upsertTranscriptionJob(jobId, {
      phase: 'prepare',
      label: 'Audio ready',
      detail: `Detected ${formatProgressClock(audioDurationS)} of audio and selected ${useProcessIsolationMode ? 'isolated worker' : useMemorySaverMode ? 'chunked memory-saver' : 'standard'} mode.`,
      percent: 28,
      audioDurationSeconds: audioDurationS,
      mode: useProcessIsolationMode ? 'isolated' : useMemorySaverMode ? 'memory-saver' : 'standard',
    });

    if (useMemorySaverMode) {
      console.warn(
        `Using memory-saver transcription mode for ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)}MB, ${audioDurationS.toFixed(1)}s, window=${WHISPER_MEMORY_SAVER_WINDOW_LENGTH_S}s, overlap=${WHISPER_MEMORY_SAVER_WINDOW_OVERLAP_S}s)`
      );
      if (forcePlainMemorySaverMode) {
        console.warn(
          `Escalating ${fileName} to plain low-memory mode (${(fileSize / 1024 / 1024).toFixed(2)}MB, ${audioDurationS.toFixed(1)}s)`
        );
      }
    }

    effectiveTimestampMode = forceNoTimestamps
      ? 'none'
      : (WHISPER_TIMESTAMP_MODE === 'word' || WHISPER_TIMESTAMP_MODE === 'segment'
        ? WHISPER_TIMESTAMP_MODE
        : (modelUsesSegmentTimestampsByDefault(activeWhisperModel) ? 'segment' : 'word'));
    if (forcePlainMemorySaverMode) {
      effectiveTimestampMode = 'none';
    } else if (useMemorySaverMode && effectiveTimestampMode !== 'none') {
      effectiveTimestampMode = 'segment';
    }

    if (useProcessIsolationMode) {
      if (transcriber) {
        await disposeTranscriber('switching to isolated worker mode');
      }
      upsertTranscriptionJob(jobId, {
        phase: 'transcribing',
        label: 'Transcribing in long-file mode',
        detail: 'Server is processing the recording in isolated windows.',
        percent: 38,
        mode: 'isolated',
      });
      console.warn(
        `Using isolated worker transcription mode for ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)}MB, ${audioDurationS.toFixed(1)}s)`
      );
      const effectiveLanguage = getEffectiveWhisperLanguage(WHISPER_LANGUAGE, WHISPER_MODEL);
      result = await transcribeIsolatedWindows({
        audioPath: tempUploadPath,
        audioDurationSeconds: audioDurationS,
        modelName: WHISPER_MODEL,
        returnTimestamps: getReturnTimestamps(effectiveTimestampMode),
        language: effectiveLanguage,
        onProgress: ({ windowIndex, totalWindows, offsetSeconds, durationSeconds }) => {
          upsertTranscriptionJob(jobId, {
            phase: 'transcribing',
            label: 'Transcribing in long-file mode',
            detail: buildWindowProgressDetail(windowIndex, totalWindows, offsetSeconds, durationSeconds),
            percent: computeWindowProgress(windowIndex, totalWindows, 42, 88),
            completedWindows: windowIndex,
            totalWindows,
            mode: 'isolated',
          });
        },
      });
    } else {
      // Initialize transcriber if not already done
      if (!transcriber) {
        upsertTranscriptionJob(jobId, {
          phase: 'prepare',
          label: 'Warming up Whisper',
          detail: 'Loading the transcription model into memory.',
          percent: 34,
        });
        await initializeTranscriber();
      }

      upsertTranscriptionJob(jobId, {
        phase: 'prepare',
        label: 'Decoding audio',
        detail: 'Converting the uploaded file into Whisper-ready samples.',
        percent: useMemorySaverMode ? 34 : 40,
      });
      const audioSamples = await decodeAudioToFloat32(await fs.readFile(tempUploadPath));
      await maybeRunGarbageCollection();

      upsertTranscriptionJob(jobId, {
        phase: 'transcribing',
        label: useMemorySaverMode ? 'Transcribing in chunked mode' : 'Transcribing audio',
        detail: useMemorySaverMode
          ? 'Server is working through the recording window by window.'
          : 'Whisper is decoding the full clip on the server.',
        percent: useMemorySaverMode ? 38 : 58,
        mode: useMemorySaverMode ? 'memory-saver' : 'standard',
      });

      const attempts = useMemorySaverMode
        ? [
          { label: 'memory-saver-primary', mode: effectiveTimestampMode, includeAdvanced: false },
          ...(effectiveTimestampMode !== 'none' ? [{ label: 'plain-fallback', mode: 'none', includeAdvanced: false }] : []),
        ]
        : [
          { label: 'primary', mode: effectiveTimestampMode, includeAdvanced: true },
          ...(effectiveTimestampMode === 'word' ? [{ label: 'segment-fallback', mode: 'segment', includeAdvanced: false }] : []),
          { label: 'plain-fallback', mode: 'none', includeAdvanced: false },
        ];

      let lastError = null;
      for (const attempt of attempts) {
        try {
          result = useMemorySaverMode
            ? await transcribeSequentialWindows(audioSamples, buildTranscriptionOptions(attempt), ({ windowIndex, totalWindows, offsetSeconds, durationSeconds }) => {
              upsertTranscriptionJob(jobId, {
                phase: 'transcribing',
                label: 'Transcribing in chunked mode',
                detail: buildWindowProgressDetail(windowIndex, totalWindows, offsetSeconds, durationSeconds),
                percent: computeWindowProgress(windowIndex, totalWindows, 42, 88),
                completedWindows: windowIndex,
                totalWindows,
                mode: 'memory-saver',
              });
            })
            : await transcriber(audioSamples, buildTranscriptionOptions(attempt));
          effectiveTimestampMode = attempt.mode;
          if (attempt.label !== 'primary') {
            console.warn(`Whisper retry succeeded with ${attempt.label} (mode=${attempt.mode}).`);
            upsertTranscriptionJob(jobId, {
              phase: 'transcribing',
              label: 'Transcription retry succeeded',
              detail: `Recovered with ${attempt.label} mode.`,
              percent: useMemorySaverMode ? 88 : 82,
            });
          }
          break;
        } catch (err) {
          lastError = err;
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`Whisper attempt failed (${attempt.label}, mode=${attempt.mode}): ${message}`);
          upsertTranscriptionJob(jobId, {
            phase: 'transcribing',
            label: 'Retrying transcription',
            detail: `Attempt ${attempt.label} failed. Trying a safer fallback.`,
            percent: useMemorySaverMode ? 54 : 68,
          });
          if (attempt.mode !== 'none' && message.toLowerCase().includes('offset is out of bounds')) {
            forceNoTimestamps = true;
            console.warn('Detected timestamp extraction bug; forcing WHISPER timestamp mode to NONE for this process.');
          }
        }
      }

      if (!result) {
        throw lastError || new Error('Whisper transcription failed after retries');
      }
    }

    if (!result) {
      throw new Error('Whisper transcription produced no result');
    }
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`✓ Transcription completed in ${duration}s`);
    upsertTranscriptionJob(jobId, {
      phase: 'finalizing',
      label: 'Finalizing transcript',
      detail: 'Formatting transcript text, segments, and word timings.',
      percent: 92,
    });

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
    upsertTranscriptionJob(jobId, {
      phase: 'finalizing',
      label: 'Transcript assembled',
      detail: `Prepared ${segments.length} segments and ${words.length} timed words.`,
      percent: 96,
    });

    let lyricsAnalysis = null;
    let lyricsAnalysisProvider = null;

    if (ENABLE_LYRICS_ANALYSIS && transcription.length >= LOCAL_LYRICS_MIN_CHARS) {
      upsertTranscriptionJob(jobId, {
        phase: 'finalizing',
        label: 'Analyzing lyrics',
        detail: 'Running local lyrics analysis on the completed transcript.',
        percent: 97,
      });
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
      jobId,
      transcription,
      segments,
      words,
      lyricsAnalysis,
      lyricsAnalysisProvider,
      fileName,
      duration: parseFloat(duration),
    });
    completeTranscriptionJob(jobId, {
      label: 'Transcript ready',
      detail: `Finished in ${duration}s with ${words.length} timed words.`,
    });
  } catch (error) {
    console.error('Transcription error:', error);
    failTranscriptionJob(jobId, error);
    res.status(500).json({
      error: 'Failed to transcribe audio',
      details: error.message,
    });
  } finally {
    await removeTempFile(tempUploadPath);
  }
});

// Start server
const PORT = process.env.PORT || process.env.WHISPER_PORT || 3001;
app.listen(PORT, () => {
  console.log(`🎙️  Whisper transcription service running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   Transcribe: POST http://localhost:${PORT}/transcribe`);
  console.log(`   Progress: GET http://localhost:${PORT}/transcribe-progress/:jobId`);
  console.log('   ETA estimation: enabled');
  console.log(`   Word-level timing preference: ${WHISPER_FORCE_WORD_TIMINGS ? 'enabled' : 'disabled'} (timestamp mode=${WHISPER_TIMESTAMP_MODE})`);
  console.log(
    `   Lyrics analysis: ${ENABLE_LYRICS_ANALYSIS ? 'enabled' : 'disabled'} (provider: ${DEFAULT_LYRICS_PROVIDER}, min chars: ${LOCAL_LYRICS_MIN_CHARS})`
  );
  console.log(
    `   Provider override by header (x-lyrics-ai-provider): ${ALLOW_LYRICS_PROVIDER_OVERRIDE ? 'enabled' : 'disabled'}`
  );
  
  if (WHISPER_PRELOAD_ON_STARTUP) {
    initializeTranscriber().catch((err) => {
      console.error('Failed to initialize transcriber on startup:', err);
      process.exit(1);
    });
  } else {
    console.log('   Whisper preload on startup: disabled');
  }
});
