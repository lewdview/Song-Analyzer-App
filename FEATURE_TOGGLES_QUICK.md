# Feature Toggles - Quick Reference

## Enable/Disable Services with Environment Variables

### The Switches

```bash
# Transcription (local Whisper)
ENABLE_WHISPER=true              # Default: true
WHISPER_SERVICE_URL=http://localhost:3001  # Where to connect

# Lyrics Analysis (Sonoteller)
ENABLE_SONOTELLER=true           # Default: true (if key is set)
SONOTELLER_RAPID_KEY=your-key    # Required to use

# OpenAI (currently unused, future feature)
ENABLE_OPENAI=false              # Default: false
OPENAI_API_KEY=sk-...            # If/when needed
```

## What You See on Startup

```
🎵 Song Analyzer Features Configuration:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Whisper Transcription: ✅ ENABLED
  Sonoteller Lyrics Analysis: ✅ ENABLED
  OpenAI Features: ❌ DISABLED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Common Setups

### Just Transcription (Save Money)
```bash
ENABLE_WHISPER=true
ENABLE_SONOTELLER=false
ENABLE_OPENAI=false
```

### Everything (Full Features)
```bash
ENABLE_WHISPER=true
WHISPER_SERVICE_URL=http://localhost:3001

ENABLE_SONOTELLER=true
SONOTELLER_RAPID_KEY=your-api-key

ENABLE_OPENAI=false
```

### Development (Testing)
```bash
ENABLE_WHISPER=true
ENABLE_SONOTELLER=true
ENABLE_OPENAI=true
```

## Setting Env Vars

**Shell:**
```bash
export ENABLE_WHISPER=true
export ENABLE_SONOTELLER=true
```

**.env file:**
```
ENABLE_WHISPER=true
ENABLE_SONOTELLER=true
```

**Supabase Dashboard:**
Edge Functions → Environment Variables

## Feature Status

| Feature | Enabled? | Why? |
|---------|----------|------|
| Whisper | ✅ Yes | `ENABLE_WHISPER != false` |
| Sonoteller | ✅ Yes | Key set AND `ENABLE_SONOTELLER != false` |
| OpenAI | ❌ No | `ENABLE_OPENAI` must be explicitly `true` |

## Save Money

```bash
# Don't need lyrics analysis?
ENABLE_SONOTELLER=false
# Saves: $0.05-0.10 per transcription
```

## Troubleshooting

**Feature not working?**
1. Check server startup logs for feature status
2. Verify env var name (case-sensitive)
3. Restart server after changing env vars
4. Make sure key is set (for Sonoteller, OpenAI)

## Future: Add More Features

Use the same pattern to add custom services:

```typescript
// In config.ts
myService: {
  enabled: Deno.env.get('ENABLE_MY_SERVICE') === 'true',
  apiKey: Deno.env.get('MY_SERVICE_KEY'),
}

// In your code
if (isFeatureEnabled(config, 'myService')) {
  // Use it
}
```

---

Full details: See `FEATURE_TOGGLES.md`

**Co-Authored-By: Warp <agent@warp.dev>**
