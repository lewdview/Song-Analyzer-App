# Transcription Service

Standalone local transcription service for:
- `365 Days of Light and Dark by th3scr1b3`
- Tool Drop product: `Multi Level Song Analyser`

It provides:
- local Whisper transcription
- segment and word timing
- local fallback word timing generation
- lyrics analysis with selectable provider (`local`, `openai`, `claude`, `grok`)

## Requirements

- Node.js 18+
- `ffmpeg` installed and available on PATH

## Quick Start

From repo root:

```bash
cd transcription-service
npm install
npm start
```

Service defaults:
- URL: `http://localhost:3001`
- health: `GET /health`
- transcription: `POST /transcribe`
- default model: `Xenova/whisper-medium.en`

Note: first startup may take time while model files download.

## API

### Health

```bash
curl http://localhost:3001/health
```

### Transcribe

```bash
curl -X POST \
  -F "audio=@your-audio.mp3" \
  http://localhost:3001/transcribe
```

Optional provider override header (if allowed by env):

```bash
curl -X POST \
  -H "x-lyrics-ai-provider: claude" \
  -F "audio=@your-audio.mp3" \
  http://localhost:3001/transcribe
```

Response shape:

```json
{
  "transcription": "string",
  "segments": [{ "start": 0, "end": 1.2, "text": "..." }],
  "words": [{ "start": 0, "end": 0.3, "word": "..." }],
  "lyricsAnalysis": {
    "mood": ["..."],
    "emotion": ["..."],
    "themes": ["..."],
    "sentiment": "positive",
    "sentimentScore": 0.25,
    "energyFromLyrics": 0.6,
    "valenceFromLyrics": 0.55
  },
  "lyricsAnalysisProvider": "local",
  "fileName": "your-audio.mp3",
  "duration": 1.23
}
```

## Runtime Behavior

- Audio is decoded with `ffmpeg` to mono float32 at `WHISPER_SAMPLE_RATE` (default `16000`).
- Timestamp mode defaults to:
  - `word` when `WHISPER_FORCE_WORD_TIMINGS=true` (default)
  - otherwise inferred from model (`segment` for medium/large models, else `word`)
- Transcription retries:
  - primary mode
  - `segment` fallback when primary is `word`
  - plain (`none`) fallback
- Looping ASR artifacts are cleaned from words/segments.
- If no word timestamps are returned, approximate word timings are generated from segment text.
- Lyrics analysis runs only when enabled and transcript length meets `LOCAL_LYRICS_MIN_CHARS`.
- Remote provider failure automatically falls back to local analysis.

## Configuration

This service reads environment variables directly from the process.  
It does not load `.env` automatically.

| Variable | Default | Purpose |
|---|---|---|
| `WHISPER_PORT` | `3001` | Service port |
| `WHISPER_CORS_ORIGIN` | `*` | CORS `Access-Control-Allow-Origin` |
| `WHISPER_MODEL` | `Xenova/whisper-medium.en` | Primary model |
| `WHISPER_FALLBACK_MODELS` | `Xenova/whisper-medium.en,Xenova/whisper-base.en` | Fallback model list |
| `WHISPER_DEVICE` | `cpu` | Inference device |
| `WHISPER_QUANTIZED` | `false` | Quantized model mode |
| `WHISPER_LANGUAGE` | `english` | Language hint (empty = auto-detect) |
| `WHISPER_SAMPLE_RATE` | `16000` | Decode sample rate |
| `WHISPER_CHUNK_LENGTH_S` | `12` | Chunk length |
| `WHISPER_STRIDE_LENGTH_S` | `1.5` | Chunk overlap |
| `WHISPER_NUM_BEAMS` | `3` | Beam search setting |
| `WHISPER_REPETITION_PENALTY` | `1.05` | Decoding penalty |
| `WHISPER_NO_REPEAT_NGRAM_SIZE` | `3` | N-gram repetition control |
| `WHISPER_FORCE_WORD_TIMINGS` | `true` | Prefer word timestamps |
| `WHISPER_TIMESTAMP_MODE` | inferred | `word`, `segment`, or `none` |
| `ENABLE_LYRICS_ANALYSIS` | `true` | Enable lyrics analysis |
| `ENABLE_LOCAL_LYRICS_ANALYSIS` | `true` | Legacy-compatible analysis toggle |
| `LOCAL_LYRICS_MIN_CHARS` | `24` | Minimum transcript length for analysis |
| `LYRICS_AI_PROVIDER` | `local` | Default provider |
| `ALLOW_LYRICS_PROVIDER_OVERRIDE` | `true` | Allow `x-lyrics-ai-provider` header override |

## Provider Settings

- `local`
  - no external API calls
- `openai`
  - requires `OPENAI_API_KEY`
  - model env: `OPENAI_LYRICS_MODEL` (default `gpt-4o-mini`)
- `claude`
  - requires `ANTHROPIC_API_KEY`
  - model env: `ANTHROPIC_LYRICS_MODEL` (default `claude-3-5-sonnet-latest`)
- `grok`
  - requires `XAI_API_KEY` or `GROK_API_KEY`
  - model env: `XAI_LYRICS_MODEL` or `GROK_LYRICS_MODEL` (default `grok-2-latest`)

## Development

```bash
npm run dev
```

## Testing

```bash
./test-service.sh
```

## Troubleshooting

- Port in use:
  - `lsof -i :3001`
  - `WHISPER_PORT=3002 npm start`
- `ffmpeg` decode errors:
  - install `ffmpeg`
  - verify command is available in shell PATH
- Model init fails or memory pressure:
  - use a smaller model, for example `Xenova/whisper-base.en`
  - keep `WHISPER_QUANTIZED=true` for lower memory usage if needed

## Related Docs

- `../README.md`
- `../.env.whisper.example`
- `../QUICK_START_WHISPER.md`
- `../WHISPER_LOCAL_SETUP.md`
