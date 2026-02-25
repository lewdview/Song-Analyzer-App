# 🎙️ 365 Days of Light and Dark - Transcription Service

A standalone Node.js service for the **365 Days of Light and Dark by th3scr1b3 - Tool Drop - Multi Level Song Analyser**.
It provides local Whisper transcription plus switchable lyrics analysis providers.

## Quick Start

```bash
# Install dependencies
npm install

# Start the service
npm start
```

That's it! The service will:
1. Start on `http://localhost:3001`
2. Download the Whisper model on first run (~500MB, takes 5-15 minutes)
3. Be ready to transcribe audio files

## Usage

### Health Check
```bash
curl http://localhost:3001/health
```

### Transcribe Audio
```bash
curl -X POST -F "audio=@your-audio.mp3" http://localhost:3001/transcribe
```

Response:
```json
{
  "transcription": "Transcribed text here...",
  "segments": [
    {"start": 0, "end": 3, "text": "first segment..."},
    {"start": 3, "end": 6, "text": "second segment..."}
  ],
  "words": [
    {"start": 0, "end": 0.5, "word": "first"},
    {"start": 0.5, "end": 1.2, "word": "word"}
  ],
  "lyricsAnalysis": {
    "mood": ["upbeat", "energetic", "confident"],
    "emotion": ["joy", "confidence"],
    "themes": ["ambition", "party"],
    "sentiment": "positive",
    "sentimentScore": 0.63,
    "energyFromLyrics": 0.74,
    "valenceFromLyrics": 0.81
  },
  "lyricsAnalysisProvider": "local",
  "fileName": "your-audio.mp3",
  "duration": 1.23
}
```

## Features

✅ **Local Processing** - All transcription happens on your machine
✅ **Timestamps** - Word-level and segment-level timestamps included
✅ **Word Timing Fallback** - If model word timestamps fail, local segment-to-word timing is generated
✅ **Lyrics Intelligence** - Local mood/emotion/theme/sentiment extraction
✅ **Provider Toggle** - Switch lyrics analysis to OpenAI, Claude, Grok, or local
✅ **Fast** - Much faster after first model download
✅ **Offline** - Works without internet after model is cached
✅ **Zero Cost** - No API fees (after setup)

## Configuration

### Model Selection

Edit `server.js` line 19 to change the Whisper model:

```javascript
// Tiny: fastest, ~500MB
'Xenova/whisper-tiny.en'

// Base: recommended balance, ~140MB
'Xenova/whisper-base.en'

// Small: better accuracy, ~460MB
'Xenova/whisper-small.en'

// Medium: high accuracy, ~1.4GB
'Xenova/whisper-medium.en'

// Large: best accuracy (multilingual), ~2.9GB
'Xenova/whisper-large'
```

### Environment Variables

```bash
# Custom port (default: 3001)
export WHISPER_PORT=3002

# Optional: disable all lyrics analysis
export ENABLE_LYRICS_ANALYSIS=true

# Optional: minimum transcript length before analysis (default: 24)
export LOCAL_LYRICS_MIN_CHARS=24

# Prefer word timestamps first (default true)
export WHISPER_FORCE_WORD_TIMINGS=true

# Default provider: local|openai|claude|grok
export LYRICS_AI_PROVIDER=local

# Allow frontend override via x-lyrics-ai-provider header
export ALLOW_LYRICS_PROVIDER_OVERRIDE=true

# Provider keys (only needed for enabled provider)
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
export XAI_API_KEY=xai-...

# Start with custom port
npm start
```

### Provider Notes

- `local`: no external API calls, always available.
- `openai`: uses `OPENAI_API_KEY` + `OPENAI_LYRICS_MODEL` (default `gpt-4o-mini`).
- `claude`: uses `ANTHROPIC_API_KEY` + `ANTHROPIC_LYRICS_MODEL` (default `claude-3-5-sonnet-latest`).
- `grok`: uses `XAI_API_KEY` (or `GROK_API_KEY`) + `XAI_LYRICS_MODEL` (default `grok-2-latest`).
- If remote provider fails, service falls back to local analysis automatically.
- If Whisper cannot return native word timestamps, the service generates approximate word timing from segment text locally.

## Performance

Typical transcription times (after model is downloaded):
- **30 seconds audio**: 3-5 seconds (tiny) / 10-15 seconds (base)
- **5 minutes audio**: 30-60 seconds (tiny) / 2-3 minutes (base)
- **15 minutes audio**: 2-4 minutes (tiny) / 6-12 minutes (base)

## Development

```bash
# Start with auto-reload on file changes
npm run dev
```

## Testing

```bash
# Run the test script
./test-service.sh
```

This will:
1. Check if service is running
2. Test health endpoint
3. Create test audio and verify transcription

## Troubleshooting

### Port Already in Use
```bash
# Check what's using port 3001
lsof -i :3001

# Use different port
WHISPER_PORT=3002 npm start
```

### Out of Memory
- Use smaller model (e.g., `whisper-tiny.en`)
- Close other applications
- Process shorter audio files

### Slow First Run
- Normal! Model is downloading (~500MB)
- Check internet speed
- Subsequent runs will be instant

## Integration

This service is used by the Tool Drop frontend (`/src/components/AudioAnalyzer.tsx`) and optional Edge Functions.

The server sends requests to `http://localhost:3001/transcribe` automatically.

See the main `IMPLEMENTATION_SUMMARY.md` for full integration details.

## Files

- `server.js` - Main Express server
- `package.json` - Dependencies
- `test-service.sh` - Testing script
- `README.md` - This file

## See Also

- `../QUICK_START_WHISPER.md` - 5-minute quick start
- `../WHISPER_LOCAL_SETUP.md` - Complete setup guide
- `../IMPLEMENTATION_SUMMARY.md` - Full implementation overview

---

Co-Authored-By: Warp <agent@warp.dev>
