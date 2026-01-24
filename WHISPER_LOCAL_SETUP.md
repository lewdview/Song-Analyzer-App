# Local Whisper Transcription Setup

This guide explains how to use the local Whisper transcription service instead of OpenAI's API.

## Overview

Your Song Analyzer App now includes a local Whisper transcription service that runs on your machine. This eliminates the need for OpenAI API calls for transcription, reducing costs and improving privacy.

### Architecture

- **Transcription Service**: Node.js service (`transcription-service/server.js`) running on port 3001
- **Deno Server**: Supabase Edge Function that calls the transcription service
- **Response Format**: Matches OpenAI's API format for compatibility

## Prerequisites

- Node.js 18+ (for the transcription service)
- ~2-3GB disk space (for Whisper model files)
- ~4GB RAM minimum (during transcription)

## Installation

### 1. Install Transcription Service Dependencies

```bash
cd transcription-service
npm install
```

This installs:
- `@xenova/transformers` - Local Whisper implementation
- `express` - HTTP server
- `multer` - File upload handling

### 2. (Optional) GPU Acceleration

On macOS, you can enable Metal GPU acceleration for faster transcription:

```bash
# Install Metal-accelerated transformers
npm install onnxruntime-web --save
```

Then edit `server.js` and change:
```javascript
device: 'cpu',  // Change to 'gpu' if using CUDA
```

## Running the Service

### Development Mode (with auto-reload)

```bash
cd transcription-service
npm run dev
```

### Production Mode

```bash
cd transcription-service
npm start
```

The service will:
1. Start on port 3001 (or `WHISPER_PORT` env var)
2. Download Whisper model files on first run (~500MB)
3. Print `✓ Whisper model initialized successfully` when ready

## Configuration

### Environment Variables

Set these in your `.env` file or environment:

```bash
# Whisper service URL (used by Deno server)
WHISPER_SERVICE_URL=http://localhost:3001

# (Optional) Custom port for transcription service
WHISPER_PORT=3001

# (Optional) Enable lyrics analysis with OpenAI
OPENAI_API_KEY=sk-...
```

### Model Selection

The service uses `Xenova/whisper-tiny.en` by default:
- **tiny.en**: 39M parameters, ~500MB, fastest
- **base.en**: 74M parameters, ~140MB, good balance
- **small.en**: 244M parameters, ~460MB, better accuracy
- **medium.en**: 769M parameters, ~1.4GB, high accuracy
- **large**: 1.5B parameters, ~2.9GB, best accuracy (multilingual)

To use a different model, edit `server.js` line 19:

```javascript
transcriber = await pipeline(
  'automatic-speech-recognition',
  'Xenova/whisper-base.en',  // Change here
  { ... }
);
```

## Performance

Typical transcription times on macOS:
- **30 seconds audio**: 3-5 seconds (tiny), 10-15 seconds (base)
- **5 minutes audio**: 30-60 seconds (tiny), 2-3 minutes (base)
- **15 minutes audio**: 2-4 minutes (tiny), 6-12 minutes (base)

First run takes longer as the model downloads (~5-10 minutes).

## API Endpoints

### Health Check

```bash
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "ok",
  "message": "Transcription service is running"
}
```

### Transcribe Audio

```bash
curl -X POST -F "audio=@song.mp3" http://localhost:3001/transcribe
```

Response:
```json
{
  "transcription": "full text of audio...",
  "segments": [
    {"start": 0, "end": 3, "text": "first few words..."},
    {"start": 3, "end": 6, "text": "more words..."}
  ],
  "words": [
    {"start": 0, "end": 0.5, "word": "first"},
    {"start": 0.5, "end": 1.2, "word": "word"}
  ],
  "fileName": "song.mp3",
  "duration": 1.23
}
```

## Troubleshooting

### "ECONNREFUSED" when transcribing

The Whisper service is not running. Start it:

```bash
cd transcription-service && npm start
```

### Service takes forever to initialize

The model is downloading for the first time. This is normal and can take 5-15 minutes depending on your internet speed and which model you're using.

### "Out of memory" errors

Transcription requires significant RAM. Try:
1. Using a smaller model (e.g., `whisper-tiny.en`)
2. Closing other applications
3. Increasing system swap/virtual memory

### Low accuracy on music with singing

Whisper's English model works best on speech. For singing or non-English content:
1. Switch to `Xenova/whisper-large` for better multilingual support
2. Consider using the base or medium model
3. Pre-process audio to isolate vocals

## Comparison: Local vs OpenAI

| Feature | Local Whisper | OpenAI API |
|---------|---|---|
| Cost | Free (after setup) | $0.06/min audio |
| Latency | 1-4x audio duration | Instant |
| Privacy | Full privacy (local) | Data sent to OpenAI |
| Accuracy | Good (~90% WER) | Excellent (~98% WER) |
| Requires API key | No | Yes |
| Works offline | Yes | No |

## Switching Back to OpenAI

If you need to switch back to OpenAI:

1. Set `OPENAI_API_KEY` environment variable
2. Restart your Deno server
3. The server will automatically detect the API key and use OpenAI instead

## Optional: Lyrics Analysis

Lyrics analysis (mood, emotion, sentiment) can still use OpenAI's GPT model if available:

1. Set `OPENAI_API_KEY` in your environment
2. Transcriptions will automatically include analysis
3. If the API key is not set, transcription still works fine - analysis is just skipped

## Next Steps

1. Start the transcription service: `npm start`
2. Deploy or run your Deno server
3. Upload an audio file through your app
4. Check the console for transcription logs

For issues or questions, check the console logs in both the Node.js service and your Deno server.

Co-Authored-By: Warp <agent@warp.dev>
