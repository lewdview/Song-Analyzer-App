# Setup Checklist: Local Whisper Transcription

Complete this checklist to get your local Whisper transcription service running.

## ✅ Pre-Flight Check

- [ ] Node.js 18+ installed (`node --version`)
- [ ] ~2-3GB disk space available
- [ ] ~4GB RAM available during transcription
- [ ] Internet connection (for first model download)

## ✅ Installation Phase

- [ ] Navigate to transcription-service: `cd transcription-service`
- [ ] Run `npm install` - should complete in ~30 seconds
- [ ] Check for zero vulnerabilities in install output
- [ ] Verify `node_modules` directory was created
- [ ] Verify `package-lock.json` was created

## ✅ First Run Phase

**Terminal 1: Start the Service**
- [ ] Run: `npm start`
- [ ] See message: `🎙️  Whisper transcription service running on port 3001`
- [ ] See message: `Initializing Whisper model...`
- [ ] Wait for: `✓ Whisper model initialized successfully`
  - First run takes 5-15 minutes (downloading model)
  - Subsequent runs start instantly

**Terminal 2: Verify Service**
- [ ] Run: `curl http://localhost:3001/health`
- [ ] Should return: `{"status":"ok","message":"Transcription service is running"}`

## ✅ Testing Phase

**Option A: Automated Test**
- [ ] Run: `cd transcription-service && ./test-service.sh`
- [ ] See ✓ Service is running
- [ ] See ✓ Health check passed
- [ ] See ✓ All tests passed

**Option B: Manual Test**
- [ ] Prepare test audio file or use existing one
- [ ] Run: `curl -X POST -F "audio=@your-audio.mp3" http://localhost:3001/transcribe`
- [ ] Verify response contains "transcription" field with text
- [ ] Verify response contains "segments" array
- [ ] Verify response contains "words" array

## ✅ Configuration Phase

- [ ] Review `.env.whisper.example` for configuration options
- [ ] (Optional) Create `.env` file with custom settings
- [ ] (Optional) Set `OPENAI_API_KEY` if you want lyrics analysis
- [ ] (Optional) Change `WHISPER_SERVICE_URL` if using non-default address

## ✅ Integration Phase

- [ ] Verify Deno server is configured to use local transcription
- [ ] Check that `WHISPER_SERVICE_URL` environment variable is set (or use default)
- [ ] Deploy/run your Song Analyzer app
- [ ] The app should automatically use local transcription

## ✅ Final Verification

- [ ] Keep transcription service running (`npm start` in `transcription-service/`)
- [ ] Open Song Analyzer app
- [ ] Upload an audio file
- [ ] Transcription should work (watch the server logs)
- [ ] Should complete without OpenAI API errors

## 🎛️ Configuration Options

### If You Want to Use Different Port
```bash
# In transcription-service/ directory
WHISPER_PORT=3002 npm start

# Then tell your app:
export WHISPER_SERVICE_URL=http://localhost:3002
```

### If You Want Better Accuracy (Slower)
Edit `transcription-service/server.js` line 19:
```javascript
// Change from:
'Xenova/whisper-tiny.en'

// To:
'Xenova/whisper-base.en'  // Recommended
// or
'Xenova/whisper-small.en' // Better accuracy
```

### If You Want to Enable Lyrics Analysis
```bash
export OPENAI_API_KEY=sk-your-key-here
```

Then restart the service. Transcriptions will include mood/emotion/sentiment analysis.

## 📊 Performance Expectations

After the first run (model cached):
- **30 sec audio**: 3-5 seconds (tiny) to 10-15 seconds (base)
- **5 min audio**: 30-60 seconds (tiny) to 2-3 minutes (base)
- **15 min audio**: 2-4 minutes (tiny) to 6-12 minutes (base)

## 🆘 Troubleshooting

| Issue | Solution |
|-------|----------|
| Service won't start | Check if port 3001 is in use: `lsof -i :3001` |
| "Connection refused" | Make sure service is running in another terminal |
| Out of memory | Use smaller model or close other apps |
| Slow transcription | Normal - consider switching to smaller model |
| Can't download model | Check internet connection |

See `WHISPER_LOCAL_SETUP.md` for detailed troubleshooting.

## 📚 Documentation Reference

- **Quick start**: `QUICK_START_WHISPER.md` (5 minutes)
- **Detailed setup**: `WHISPER_LOCAL_SETUP.md` 
- **Implementation overview**: `IMPLEMENTATION_SUMMARY.md`
- **Service docs**: `transcription-service/README.md`
- **This checklist**: `SETUP_CHECKLIST.md`

## ✨ You're All Set!

Once you've completed all items above, your Song Analyzer App is ready to use local Whisper transcription!

### Daily Usage

1. Keep the transcription service running:
   ```bash
   cd transcription-service && npm start
   ```

2. Run your Song Analyzer app (in another terminal)

3. Upload audio files - they'll be transcribed locally!

### Stopping the Service

Press `Ctrl+C` in the terminal where the service is running.

You can restart it anytime with `npm start`.

---

**Questions?** Check the documentation files or see the troubleshooting section above.

Co-Authored-By: Warp <agent@warp.dev>
