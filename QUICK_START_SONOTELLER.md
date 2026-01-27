cd scripts
# Quick Start: Sonoteller Lyrics Analysis (5 minutes)

Get lyrics analysis working in 5 minutes.

## What It Does

Automatically analyzes your transcribed lyrics to extract:
- Moods (upbeat, melancholic, etc.)
- Themes (heartbreak, celebration, etc.)
- Emotions and keywords
- Sentiment (positive/negative/mixed)

## 1. Sign Up (2 minutes)

1. Go to https://rapidapi.com/
2. Sign up (free account)
3. Go to your dashboard and copy your API key

## 2. Subscribe to Sonoteller (1 minute)

1. Visit: https://rapidapi.com/sonoteller1-sonoteller-default/api/sonoteller-ai1
2. Click "Subscribe" (free tier: 10 analyses/month)
3. You're done with this step!

## 3. Set Environment Variables (2 minutes)

Add to your `.env` file:

```bash
SONOTELLER_RAPID_KEY=your-api-key-from-rapidapi
```

Or export it:

```bash
export SONOTELLER_RAPID_KEY=your-api-key-from-rapidapi
```

Then restart your server.

## Done! 🎉

Your app now analyzes lyrics automatically. Transcription responses will include `lyricsAnalysis` with moods, themes, and sentiment.

## Example Response

```json
{
  "transcription": "song lyrics here...",
  "lyricsAnalysis": {
    "mood": ["upbeat", "energetic"],
    "emotion": ["joy", "confidence"],
    "themes": ["celebration", "empowerment"],
    "sentiment": "positive",
    "sentimentScore": 0.7
  }
}
```

## Troubleshooting

**No analysis in response?**
- Check that `SONOTELLER_RAPID_KEY` is set
- Verify API key in RapidAPI dashboard
- Restart your server

**Getting errors?**
- Verify you subscribed to the API on RapidAPI
- Check API key is correct
- See `SONOTELLER_SETUP.md` for detailed help

## Pricing

Free: 10 analyses/month
Paid: Starting at ~$0.05-0.10 per analysis

See https://rapidapi.com/sonoteller1-sonoteller-default/api/sonoteller-ai1/pricing

## Next Steps

1. Set `SONOTELLER_RAPID_KEY` environment variable
2. Restart your server
3. Transcribe audio - analysis happens automatically!

For detailed docs, see `SONOTELLER_SETUP.md`.

---

**Co-Authored-By: Warp <agent@warp.dev>**
