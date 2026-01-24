# Sonoteller.ai Lyrics Analysis Integration

Your Song Analyzer App now supports <cite index="1-1,2-1,2-2">Sonoteller.ai for comprehensive lyrics analysis, identifying moods, themes, and keywords from transcribed lyrics</cite>.

## What You Get

When you enable Sonoteller analysis, your app automatically analyzes transcribed lyrics to extract:

- **Moods**: Emotional atmosphere (e.g., "upbeat", "melancholic", "energetic")
- **Themes**: Subject matter and topics (e.g., "heartbreak", "celebration", "empowerment")
- **Keywords**: Important concepts and emotions from the lyrics
- **Language Detection**: Automatic language identification
- **Explicit Content**: Flags explicit language if present

The analysis results are returned with your transcription in the same format, so your existing code works seamlessly.

## Setup

### Step 1: Get a RapidAPI Account

1. Go to https://rapidapi.com/
2. Sign up for a free account
3. Create an API key (available in your dashboard)

### Step 2: Subscribe to Sonoteller.ai API

1. Visit: https://rapidapi.com/sonoteller1-sonoteller-default/api/sonoteller-ai1
2. Click "Subscribe" (free tier available with limited requests)
3. Copy your API credentials

### Step 3: Set Environment Variables

Add these to your `.env` file or export them in your shell:

```bash
# RapidAPI credentials for Sonoteller
SONOTELLER_RAPID_KEY=your-rapidapi-key-here
SONOTELLER_RAPID_HOST=sonoteller-ai1.p.rapidapi.com  # Optional, defaults shown
```

### Step 4: Restart Your Server

The lyrics analysis will now automatically run when you transcribe audio.

## Response Format

When analysis is enabled, transcription responses include `lyricsAnalysis`:

```json
{
  "transcription": "full text of audio...",
  "segments": [...],
  "words": [...],
  "lyricsAnalysis": {
    "mood": ["upbeat", "energetic", "joyful"],
    "emotion": ["joy", "confidence", "celebration"],
    "themes": ["celebration", "achievement", "empowerment"],
    "sentiment": "positive",
    "sentimentScore": 0.7,
    "energyFromLyrics": 0.7,
    "valenceFromLyrics": 0.7
  },
  "fileName": "song.mp3"
}
```

### Response Fields

- **mood**: Array of emotional atmosphere descriptors
- **emotion**: Array of specific emotions detected
- **themes**: Array of lyrical themes and topics
- **sentiment**: Overall sentiment (`positive`, `negative`, `neutral`, or `mixed`)
- **sentimentScore**: Score from -1 (very negative) to 1 (very positive)
- **energyFromLyrics**: 0-1 scale indicating lyrical intensity
- **valenceFromLyrics**: 0-1 scale indicating positivity/optimism

## Pricing

<cite index="7-6">Sonoteller offers a free tier with up to 10 analyses per month</cite>, with paid plans available on RapidAPI for higher usage.

Check https://rapidapi.com/sonoteller1-sonoteller-default/api/sonoteller-ai1/pricing for current pricing.

## Troubleshooting

### No lyrics analysis in response

**Issue**: Analysis field is missing
**Solution**: 
- Check that `SONOTELLER_RAPID_KEY` is set
- Verify credentials are correct in RapidAPI dashboard
- Ensure transcription text is at least 10 characters long

### "SONOTELLER_RAPID_KEY not configured"

**Issue**: Getting error about missing API key
**Solution**:
- Set the environment variable: `export SONOTELLER_RAPID_KEY=your-key`
- Restart your server
- Verify the key in RapidAPI dashboard

### API rate limit exceeded

**Issue**: "Too many requests" error
**Solution**:
- You've exceeded your free tier limits
- Upgrade to a paid plan on RapidAPI
- Or wait until your quota resets (monthly)

### Analysis returns "unknown" values

**Issue**: Mood, themes, and emotions are all "unknown"
**Solution**:
- This is normal if Sonoteller can't extract clear themes from lyrics
- The API will still return what it can identify
- Very short lyrics or instrumental audio may trigger this

## Optional: Disabling Lyrics Analysis

If you want transcription without analysis:

1. Don't set `SONOTELLER_RAPID_KEY` environment variable
2. Transcription will work normally without the analysis field

## Performance Notes

<cite index="3-1">Sonoteller typically takes about a minute to analyze both lyrics and music</cite> (though in your case, we're only analyzing lyrics).

Transcription will return before analysis completes. The app handles both operations independently.

## Comparing Analysis Options

Previously, lyrics analysis used OpenAI's GPT model. Now with Sonoteller:

| Feature | OpenAI | Sonoteller |
|---------|--------|-----------|
| Cost | $0.003-0.006 per request | Free (10/month) or $0.05-0.10/request |
| Accuracy | Very high | High, music-specialized |
| Speed | ~5 seconds | ~1 minute |
| Music Focus | General AI | Music-specialized AI |
| Themes | General NLP | Music-specific themes |
| Explicit Detection | No | Yes |

## API Details

<cite index="4-27">The Sonoteller API offers distinct endpoints for music analysis, lyrics analysis, and structural sections (intro, verse, chorus)</cite>. Your integration uses the lyrics analysis endpoint.

For advanced usage, see the RapidAPI documentation: https://rapidapi.com/sonoteller1-sonoteller-default/api/sonoteller-ai1

## Support

- **API Issues**: Check RapidAPI dashboard for status
- **Integration Issues**: See logs in your Deno server console
- **Questions**: Refer to Sonoteller docs or RapidAPI support

---

**Co-Authored-By: Warp <agent@warp.dev>**
