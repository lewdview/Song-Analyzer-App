# 🎙️ Local Whisper Transcription Service

A standalone Node.js service that provides local audio transcription using Whisper AI, eliminating the need for OpenAI API calls.

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
  "fileName": "your-audio.mp3",
  "duration": 1.23
}
```

## Features

✅ **Local Processing** - All transcription happens on your machine
✅ **Timestamps** - Word-level and segment-level timestamps included
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

# Start with custom port
npm start
```

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

This service is used by your Song Analyzer app's Deno server.

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
