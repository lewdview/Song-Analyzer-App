# 365 Days of Light and Dark by th3scr1b3

Tool Drop product name: **Multi Level Song Analyser**

## Overview

This app combines local audio analysis, local Whisper transcription, runtime-switchable lyrics AI providers, and Supabase-backed library/scheduler workflows.

Current front-end routes:
- `/` Home (upload, analyze, save/load, exports)
- `/scheduler` 365-day scheduler
- `/karaoke` karaoke/lyrics playback view

## Current Features

- Multi-file audio upload (`.mp3`, `.wav`)
- Audio feature analysis (tempo, key, energy, danceability, valence, etc.)
- Local Whisper transcription via `transcription-service`
- Word-level and segment-level timestamps
- Local word-timing fallback if model word timestamps are unavailable
- Lyrics AI provider switch:
  - `local`
  - `openai`
  - `claude`
  - `grok`
- Runtime database mode switch:
  - `OG Database (th3scr1b3)`
  - `Your Own Database`
- Single-song exports:
  - Analysis JSON
  - Transcription JSON
  - Word-level LRC
  - SRT
- Bulk database export modal (multiple formats)
- Save/load analyses through Supabase edge functions

## Prerequisites

- Node.js 18+
- npm
- `ffmpeg` installed and available on PATH
- Internet access on first transcription-service run (model download)

## Local Setup

1. Install frontend dependencies:
   - `npm install`
2. Create env file:
   - `cp .env.whisper.example .env`
3. Install transcription-service dependencies:
   - `cd transcription-service && npm install`
4. Start transcription service:
   - `npm start`
5. In another terminal, start frontend from repo root:
   - `npm run dev`
6. Open:
   - `http://localhost:3000`

Note: first transcription-service start may download a Whisper model and can take several minutes.

## Runtime Settings (In-App)

Use **Deployment Settings** on the Home page to switch behavior without code edits.

- Database mode:
  - `OG Database (th3scr1b3)`
  - `Your Own Database` (requires custom Supabase project ID + anon key)
- Lyrics AI provider:
  - `local`, `openai`, `claude`, `grok`
- Edge function path:
  - defaults to `make-server-473d7342`

Settings persist in browser localStorage.

## Environment Variables

Use `.env.whisper.example` as the source of truth. Common keys:

- Frontend:
  - `VITE_WHISPER_SERVICE_URL`
  - `VITE_DATABASE_MODE`
  - `VITE_CUSTOM_SUPABASE_PROJECT_ID`
  - `VITE_CUSTOM_SUPABASE_ANON_KEY`
  - `VITE_SERVER_FUNCTION_PATH`
  - `VITE_LYRICS_AI_PROVIDER`
- Transcription service:
  - `WHISPER_PORT`
  - `WHISPER_MODEL`
  - `WHISPER_FALLBACK_MODELS`
  - `WHISPER_FORCE_WORD_TIMINGS`
  - `LYRICS_AI_PROVIDER`
  - `ALLOW_LYRICS_PROVIDER_OVERRIDE`
  - `OPENAI_API_KEY`
  - `ANTHROPIC_API_KEY`
  - `XAI_API_KEY`

See `transcription-service/README.md` for provider/model details.

## Scripts

Frontend (repo root):

- `npm run dev`
- `npm run build`
- `npm run test:run`
- `npm run db:deduplicate`
- `npm run db:remove-no-hash`
- `npm run db:generate-titles`

Transcription service (`transcription-service`):

- `npm start`
- `npm run dev`

## Word Timing Behavior

The transcription service prioritizes native Whisper word timestamps.  
If those are unavailable, it generates approximate word timings locally from segment timing so word-level outputs still work.

## Troubleshooting

- Transcription service unreachable:
  - confirm service is running on `http://localhost:3001`
  - verify `VITE_WHISPER_SERVICE_URL` and `WHISPER_PORT`
- `ffmpeg` errors:
  - install `ffmpeg` and ensure it is on PATH
- Slow first run:
  - expected during initial model download
  
