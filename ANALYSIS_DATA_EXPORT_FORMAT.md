# Complete Analysis Data Export Format

## Overview
Comprehensive JSON export containing lyrics (without timing) plus all audio analysis features, classification, and AI analysis results.

Perfect for data analysis, music cataloging, and integration with external music information systems.

## Format Structure

```json
{
  "song": {
    "title": "Song Title",
    "fileName": "song_file.wav",
    "duration": 245.5,
    "key": "C Major",
    "tempo": 120,
    "timeSignature": "4/4"
  },
  "lyrics": {
    "text": "Full lyrics text without any timing information..."
  },
  "audio_features": {
    "energy": 0.75,
    "danceability": 0.68,
    "valence": 0.62,
    "acousticness": 0.15,
    "instrumentalness": 0.05,
    "liveness": 0.12,
    "speechiness": 0.03,
    "loudness": -5.5
  },
  "classification": {
    "genres": ["Pop", "Indie", "Alternative"],
    "moods": ["Upbeat", "Energetic", "Happy"]
  },
  "lyrics_analysis": {
    "sentiment": "positive",
    "sentimentScore": 0.75,
    "themes": ["love", "relationships", "growth"],
    "energyFromLyrics": 0.82,
    "valenceFromLyrics": 0.78
  },
  "metadata": {
    "id": "unique-analysis-id",
    "fileSize": 5242880,
    "analyzedAt": "2026-01-05T00:00:00Z",
    "exportedAt": "2026-01-05T01:15:00Z"
  }
}
```

## Field Descriptions

### Song Object
- **title** (string) - Song title or derived from filename
- **fileName** (string) - Original audio file name
- **duration** (number) - Duration in seconds
- **key** (string) - Musical key (e.g., "C Major", "G Minor")
- **tempo** (number) - BPM (beats per minute)
- **timeSignature** (string) - Time signature (e.g., "4/4")

### Lyrics Object
- **text** (string) - Full transcribed lyrics as plain text, no timestamps
- Note: For timestamped lyrics, use the Transcription JSON export or Word-Level Lyrics export

### Audio Features Object
All values are normalized 0-1 range (except loudness which is in dB)

- **energy** - Intensity and activity level
- **danceability** - How suitable for dancing
- **valence** - Musical positivity (happy/sad)
- **acousticness** - Acoustic vs electronic
- **instrumentalness** - Presence of vocals vs instruments
- **liveness** - Live performance characteristics
- **speechiness** - Presence of spoken words
- **loudness** - Overall loudness in decibels (dB)

### Classification Object
- **genres** (array) - List of detected genres
- **moods** (array) - List of detected moods

### Lyrics Analysis Object
AI-powered analysis of lyrical content (if available)

- **sentiment** (string) - "positive", "negative", "mixed", or "neutral"
- **sentimentScore** (number) - -1.0 to 1.0, where positive = happy, negative = sad
- **themes** (array) - Detected themes/topics in lyrics
- **energyFromLyrics** (number) - Lyrical intensity (0-1)
- **valenceFromLyrics** (number) - Lyrical positivity (0-1)

### Metadata Object
- **id** (string) - Unique analysis ID
- **fileSize** (number) - File size in bytes
- **analyzedAt** (string) - ISO 8601 timestamp of analysis
- **exportedAt** (string) - ISO 8601 timestamp of export

## Usage

### Copy to Clipboard
Click "Copy JSON" button to copy entire analysis data for import into other tools.

### Download File
Click "Download" button to save as `-analysis.json` file.

## What's Included vs Excluded

### ✓ Included
- Full song metadata (title, duration, key, tempo)
- Complete lyrics (text only, no timing)
- All audio features (energy, danceability, etc.)
- Genre and mood classification
- AI sentiment and theme analysis
- File info and timestamps

### ✗ Excluded
- Word-level timing (see Word-Level Lyrics export)
- Segment timing (see Transcription JSON export)
- Waveform data
- Audio URL/blob

## Use Cases

1. **Music Database** - Catalog and organize songs
2. **Data Analysis** - Analyze trends in music features
3. **Recommendations** - Use audio features for similarity matching
4. **Metadata Enrichment** - Combine with other data sources
5. **Sync Systems** - Integrate with external music platforms
6. **Research** - Study relationships between lyrics and audio features
7. **Archival** - Preserve analysis data in standard format

## Three Export Options

| Export Type | Lyrics | Audio Features | Timing | File Size | Use Case |
|---|---|---|---|---|---|
| **Transcription JSON** | Segments only | ✗ | ✓ | Small | Altar placement, sync text |
| **Word-Level Lyrics** | Words with timing | ✗ | ✓ | Medium | Karaoke, precise sync |
| **Complete Analysis** | Full text | ✓ | ✗ | Large | Data analysis, cataloging |

## Integration Example

### Python
```python
import json

with open('song-analysis.json') as f:
    data = json.load(f)

# Access lyrics
lyrics = data['lyrics']['text']

# Get audio features
energy = data['audio_features']['energy']
danceability = data['audio_features']['danceability']

# Check sentiment
sentiment = data['lyrics_analysis']['sentiment']
themes = data['lyrics_analysis']['themes']
```

### JavaScript
```javascript
const data = await fetch('song-analysis.json').then(r => r.json());

// Access nested data
const { title, tempo } = data.song;
const { energy, valence } = data.audio_features;
const { sentiment, themes } = data.lyrics_analysis;
```

## Notes

- All audio features are from Spotify API analysis
- Sentiment and themes are from AI language model
- Lyrics are from speech-to-text transcription
- File size represents uncompressed JSON (gzip recommended for storage)
- Export timestamp is when the JSON was generated (may differ from analysis time)
