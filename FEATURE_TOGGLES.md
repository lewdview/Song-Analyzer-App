# Feature Toggles: Control Your Services

Your Song Analyzer App now has feature toggles that allow you to enable/disable individual services via environment variables. This is useful for testing, cost control, and managing dependencies.

## Quick Reference

| Feature | Env Variable | Default | Notes |
|---------|------------|---------|-------|
| **Whisper Transcription** | `ENABLE_WHISPER` | `true` | Local transcription service |
| **Sonoteller Lyrics Analysis** | `ENABLE_SONOTELLER` | `true` | Music-specialized analysis |
| **OpenAI** | `ENABLE_OPENAI` | `false` | Advanced AI features (future use) |

## Environment Variables

### Whisper Transcription

```bash
# Enable/Disable Whisper (default: enabled)
ENABLE_WHISPER=true

# Configure Whisper service URL (default: http://localhost:3001)
WHISPER_SERVICE_URL=http://localhost:3001
```

**Status Check**: Enabled by default. Set to `false` to disable.

### Sonoteller Lyrics Analysis

```bash
# Enable/Disable Sonoteller (default: enabled if SONOTELLER_RAPID_KEY is set)
ENABLE_SONOTELLER=true

# RapidAPI credentials
SONOTELLER_RAPID_KEY=your-api-key-here
SONOTELLER_RAPID_HOST=sonoteller-ai1.p.rapidapi.com  # Optional
```

**Status Check**: Enabled only if `SONOTELLER_RAPID_KEY` is set. Can be disabled with `ENABLE_SONOTELLER=false`.

### OpenAI

```bash
# Enable/Disable OpenAI (default: disabled)
# Currently not used, but available for future features
ENABLE_OPENAI=false

# OpenAI API key (if/when needed)
OPENAI_API_KEY=sk-...
```

**Status Check**: Disabled by default. Must explicitly set `ENABLE_OPENAI=true` to enable.

## How Feature Toggles Work

The server loads feature configuration on startup and logs which services are enabled:

```
🎵 Song Analyzer Features Configuration:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Whisper Transcription: ✅ ENABLED
    → Service URL: http://localhost:3001
  Sonoteller Lyrics Analysis: ✅ ENABLED
    → RapidAPI Host: sonoteller-ai1.p.rapidapi.com
  OpenAI Features: ❌ DISABLED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Use Cases

### Disable Whisper (use external transcription)
```bash
ENABLE_WHISPER=false
```
Useful if you want to integrate with a different transcription service.

### Disable Sonoteller (transcription only)
```bash
ENABLE_SONOTELLER=false
```
Saves API costs by skipping lyrics analysis.

### Test OpenAI Integration (future use)
```bash
ENABLE_OPENAI=true
OPENAI_API_KEY=sk-your-key
```
Enables OpenAI features for testing or advanced functionality.

### Development Environment
```bash
# Minimal setup - transcription only
ENABLE_WHISPER=true
ENABLE_SONOTELLER=false
ENABLE_OPENAI=false
WHISPER_SERVICE_URL=http://localhost:3001
```

### Production Environment
```bash
# Full features
ENABLE_WHISPER=true
WHISPER_SERVICE_URL=http://your-whisper-service.com

ENABLE_SONOTELLER=true
SONOTELLER_RAPID_KEY=your-production-key

ENABLE_OPENAI=false  # Or true if needed
```

## Setting Environment Variables

### Local Development
In your shell or `.env` file:
```bash
export ENABLE_WHISPER=true
export ENABLE_SONOTELLER=true
export ENABLE_OPENAI=false
```

### Supabase Edge Functions
Set in your Supabase project settings under "Edge Functions" > "Environment Variables":
```
ENABLE_WHISPER=true
ENABLE_SONOTELLER=true
ENABLE_OPENAI=false
```

### Docker (if containerized)
In your `docker-compose.yml` or `Dockerfile`:
```yaml
environment:
  ENABLE_WHISPER: 'true'
  ENABLE_SONOTELLER: 'true'
  ENABLE_OPENAI: 'false'
```

## Feature Status on Startup

The server prints a status report when it starts. Look for:

```
🎵 Song Analyzer Features Configuration:
```

This tells you which features are active and how they're configured.

### Interpreting the Status

- **✅ ENABLED** - Feature is active and configured
- **❌ DISABLED** - Feature is turned off
- **→ Details** - Configuration details for enabled features

## Graceful Degradation

If a feature is disabled, the app handles it gracefully:

1. **Whisper disabled**: Transcription requests return an error
2. **Sonoteller disabled**: Transcription works but without analysis
3. **OpenAI disabled**: Advanced features not available

## Future: Custom Features

This system is extensible. To add new features:

1. Add to `src/supabase/functions/server/config.ts`
2. Add `ENABLE_FEATURE` environment variable
3. Use `isFeatureEnabled(config, 'feature')` to check

Example:
```typescript
// In config.ts
myService: {
  enabled: Deno.env.get('ENABLE_MY_SERVICE') === 'true',
  apiKey?: Deno.env.get('MY_SERVICE_API_KEY'),
}

// In your handler
if (isFeatureEnabled(config, 'myService')) {
  // Use the service
}
```

## Troubleshooting

### Feature shows as disabled but I set the env var

**Check**:
- Variable name is exactly as specified (case-sensitive)
- Value is `true` (not `True` or `yes`)
- Server was restarted after setting the variable

### Sonoteller shows as disabled but I have the API key

**Check**:
- `SONOTELLER_RAPID_KEY` is set correctly
- `ENABLE_SONOTELLER` is not explicitly set to `false`
- RapidAPI subscription is active

### I see "OpenAI Features: ❌ DISABLED" but don't need it

**This is normal!** OpenAI is disabled by default. You only need to enable it if you want to use OpenAI for advanced features in the future.

## Cost Optimization

### Save Money
```bash
# Disable Sonoteller if you don't need lyrics analysis
ENABLE_SONOTELLER=false
```

**Savings**: ~$0.05-0.10 per transcription (no API calls)

### Free Tier Friendly
```bash
# Use free tier features only
ENABLE_WHISPER=true          # Free
ENABLE_SONOTELLER=true       # Free tier: 10/month
ENABLE_OPENAI=false          # Not needed
```

**Cost**: $0 (Sonoteller free tier covers 10 analyses/month)

## Quick Start Configs

### Minimal (Transcription Only)
```bash
ENABLE_WHISPER=true
ENABLE_SONOTELLER=false
ENABLE_OPENAI=false
```

### Standard (All Features)
```bash
ENABLE_WHISPER=true
ENABLE_SONOTELLER=true
SONOTELLER_RAPID_KEY=your-key
ENABLE_OPENAI=false
```

### Testing
```bash
ENABLE_WHISPER=true
ENABLE_SONOTELLER=true
ENABLE_OPENAI=true
SONOTELLER_RAPID_KEY=test-key
OPENAI_API_KEY=test-key
```

## Next Steps

1. Check your current feature status on server startup
2. Disable features you don't need to save costs
3. Add new features using the same pattern
4. Monitor the feature status in logs

---

**Co-Authored-By: Warp <agent@warp.dev>**
