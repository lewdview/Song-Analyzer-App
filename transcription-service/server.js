import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { pipeline } from '@xenova/transformers';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Initialize the Whisper pipeline
let transcriber = null;

async function initializeTranscriber() {
  if (!transcriber) {
    console.log('Initializing Whisper model (first run may take a few minutes)...');
    try {
      transcriber = await pipeline(
        'automatic-speech-recognition',
        'Xenova/whisper-tiny.en',
        {
          device: 'cpu', // Use 'gpu' if you have CUDA/Metal support; fallback is 'cpu'
          quantized: true, // Use quantized model for faster inference
        }
      );
      console.log('✓ Whisper model initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Whisper model:', error);
      throw error;
    }
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

    // Convert buffer to base64 for processing
    const audioBuffer = req.file.buffer;
    const audioBase64 = audioBuffer.toString('base64');
    const audioDataUrl = `data:${req.file.mimetype || 'audio/mpeg'};base64,${audioBase64}`;

    // Run transcription
    const startTime = Date.now();
    const result = await transcriber(audioDataUrl, {
      language: 'english',
      task: 'transcribe',
      return_timestamps: true,
    });
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`✓ Transcription completed in ${duration}s`);

    // Parse and structure the response to match OpenAI's format
    const transcription = result.text || '';
    let segments = [];
    let words = [];

    // Extract segments and word-level timestamps if available
    if (result.chunks && Array.isArray(result.chunks)) {
      segments = result.chunks.map((chunk) => ({
        start: chunk.timestamp[0] || 0,
        end: chunk.timestamp[1] || 0,
        text: (chunk.text || '').trim(),
      }));

      // Flatten words from chunks
      result.chunks.forEach((chunk) => {
        if (chunk.words && Array.isArray(chunk.words)) {
          chunk.words.forEach((wordObj) => {
            words.push({
              start: wordObj.timestamp ? wordObj.timestamp[0] : 0,
              end: wordObj.timestamp ? wordObj.timestamp[1] : 0,
              word: wordObj.word || wordObj.text || '',
            });
          });
        }
      });
    }

    // If no segments, coalesce words into segments (same logic as OpenAI fallback)
    if (segments.length === 0 && words.length > 0) {
      const bucketSizeSec = 3;
      const coalesced = [];
      let bucketStart = words[0]?.start ?? 0;
      let currentText = [];

      for (const w of words) {
        if (currentText.length === 0) bucketStart = w.start ?? bucketStart;
        currentText.push(w.word);
        const shouldFlush = (w.end - bucketStart) >= bucketSizeSec || currentText.length >= 12;
        if (shouldFlush) {
          coalesced.push({
            start: bucketStart || 0,
            end: w.end ?? bucketStart,
            text: currentText.join(' '),
          });
          currentText = [];
        }
      }
      if (currentText.length) {
        const lastEnd = words[words.length - 1]?.end ?? bucketStart;
        coalesced.push({
          start: bucketStart || 0,
          end: lastEnd,
          text: currentText.join(' '),
        });
      }
      segments = coalesced;
    }

    res.json({
      transcription,
      segments,
      words,
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
  
  // Initialize transcriber on startup
  initializeTranscriber().catch((err) => {
    console.error('Failed to initialize transcriber on startup:', err);
    process.exit(1);
  });
});
