# Quick Start: Local Whisper Transcription

Get up and running in 5 minutes.

## 1. Install Dependencies

```bash
cd transcription-service
npm install
```

## 2. Start the Transcription Service

```bash
cd transcription-service
npm start
```

You'll see:
```
🎙️  Whisper transcription service running on port 3001
   Health check: http://localhost:3001/health
   Initializing Whisper model (first run may take a few minutes)...
```

**First run note**: On first startup, the model downloads (~500MB). This takes 5-15 minutes depending on internet speed. Subsequent runs start instantly.

## 3. Verify Service is Running

In a new terminal:

```bash
curl http://localhost:3001/health
```

Should return:
```json
{
  "status": "ok",
  "message": "Transcription service is running"
}
```

## 4. Test Transcription

```bash
curl -X POST -F "audio=@path/to/audio.mp3" http://localhost:3001/transcribe
```

Or with a sample file:

```bash
# Create a test audio file or use an existing one
curl -X POST -F "audio=@song.mp3" http://localhost:3001/transcribe
```

Returns:
```json
{
  "transcription": "Transcribed text here...",
  "segments": [...],
  "words": [...],
  "fileName": "song.mp3",
  "duration": 2.34
}
```

## 5. Deploy Your App

Your Deno server now automatically uses the local Whisper service for transcription:

```bash
# Deploy or run your Deno function
# The server will send transcription requests to http://localhost:3001/transcribe
```

## Done! 🎉

Your app now transcribes audio locally without OpenAI API calls.

### Optional: Add Lyrics Analysis

To also get mood/emotion analysis, add an OpenAI API key:

```bash
export OPENAI_API_KEY=sk-...
```

Transcriptions will automatically include `lyricsAnalysis` with mood, emotion, themes, and sentiment.

### Performance Tips

- **Faster transcription**: Use `Xenova/whisper-tiny.en` (default, ~500MB)
- **Better accuracy**: Use `Xenova/whisper-base.en` (~140MB, slower)
- **See configuration**: Check `WHISPER_LOCAL_SETUP.md` for more options

### Troubleshooting

**Service won't start?**
```bash
# Check if port 3001 is in use
lsof -i :3001
# If needed, use a different port
WHISPER_PORT=3002 npm start
```

**Connection refused when transcribing?**
- Make sure the service is running in another terminal
- Check that `WHISPER_SERVICE_URL` is set correctly (default: `http://localhost:3001`)

**Running out of memory?**
- Use the tiny model (already default)
- Close other applications
- Transcribe shorter audio files

See `WHISPER_LOCAL_SETUP.md` for detailed setup and configuration.

Co-Authored-By: Warp <agent@warp.dev>
