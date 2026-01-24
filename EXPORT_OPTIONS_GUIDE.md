# Song Analyzer Export Options Guide

Three flexible JSON export formats for different use cases. Choose based on your workflow needs.

## Quick Comparison

```
┌─────────────────────┬──────────────────────────────────────────┐
│ Export Type         │ Best For                                 │
├─────────────────────┼──────────────────────────────────────────┤
│ Transcription JSON  │ ✓ Altar placement                        │
│                     │ ✓ Simple text + timing                   │
│                     │ ✓ Minimal file size                      │
│                     │ ✓ Text display systems                   │
├─────────────────────┼──────────────────────────────────────────┤
│ Word-Level Lyrics   │ ✓ Karaoke systems                        │
│                     │ ✓ Precise word timing                    │
│                     │ ✓ Lyric video generation                 │
│                     │ ✓ Music sync apps                        │
├─────────────────────┼──────────────────────────────────────────┤
│ Complete Analysis   │ ✓ Data analysis                          │
│                     │ ✓ Music cataloging                       │
│                     │ ✓ External system integration            │
│                     │ ✓ Research & statistics                  │
└─────────────────────┴──────────────────────────────────────────┘
```

## Detailed Breakdown

### 1. Transcription JSON Export
**File:** `TranscriptionExporter.tsx`  
**Color:** Blue/Green  
**Icon:** File JSON

#### What's Included
```
✓ Song metadata (title, fileName, duration)
✓ Transcription text (full)
✓ Segments with timing (start, end, text)
✓ Basic metadata (exportedAt, segmentCount)

✗ No word-level timing
✗ No audio features
✗ No analysis data
```

#### File Size
Small (~5-50 KB depending on transcript length)

#### Use Cases
- **Altar Placement** - Clean text format for display systems
- **Subtitle Generation** - Simple timing for captions
- **Text Editors** - Quick paste into documents
- **Data Sync** - Timing-aware text integration
- **Web Display** - Load subtitle tracks

#### JSON Structure
```json
{
  "song": {
    "title": "Song Title",
    "fileName": "song.wav",
    "duration": 245.5
  },
  "transcription": {
    "text": "Full transcription...",
    "segments": [
      { "start": 0.0, "end": 3.5, "text": "First line" }
    ]
  },
  "metadata": {
    "exportedAt": "2026-01-05T01:15:00Z",
    "segmentCount": 25
  }
}
```

---

### 2. Word-Level Lyrics Export (LRC Format)
**File:** `LyricsExporter.tsx`  
**Color:** Cyan/Blue  
**Icon:** Sparkles

#### What's Included
```
✓ Word-level timing (precise start/end)
✓ LRC file format (industry standard)
✓ Grouped by lines (> 1 second gaps)
✓ LRC metadata (artist, title, length, tool)

✗ No audio features
✗ No sentiment/themes
✗ No other analysis
```

#### File Size
Medium (~10-100 KB depending on word count)

#### Use Cases
- **Karaoke** - Real-time word highlighting
- **Music Videos** - Lyric sync to animation
- **Audio Apps** - VLC, Foobar2000, etc. support LRC
- **Timing Lock** - Preserve exact word boundaries
- **Precision Work** - Music production timing

#### Format Example
```
[ar:Artist Name]
[ti:Song Title]
[length:245000]
[tool:Song Analyzer App]

[00:00.00] <00:00.12>First <00:00.35>word <00:00.58>in <00:00.82>line
[00:03.50] <00:03.62>Next <00:03.85>line <00:04.08>here
```

---

### 3. Complete Analysis Data Export
**File:** `AnalysisDataExporter.tsx`  
**Color:** Amber/Orange + Indigo/Purple  
**Icon:** Database

#### What's Included
```
✓ Full lyrics (plain text, no timing)
✓ All audio features
  - Energy, danceability, valence
  - Acousticness, instrumentalness
  - Liveness, speechiness, loudness
✓ Song metadata (key, tempo, time signature)
✓ Classification (genres, moods)
✓ AI analysis (sentiment, themes, scores)
✓ Complete metadata

✗ No word timing
✗ No segment timing
✗ No waveform/audio blob
```

#### File Size
Large (~50-500 KB for complete analysis)

#### Use Cases
- **Music Database** - Catalog and organize library
- **Data Analysis** - Study feature relationships
- **Recommendations** - Similarity matching algorithm
- **Integration** - Sync with external music systems
- **Research** - Analyze lyrics vs audio patterns
- **Archive** - Preserve all analysis in one file
- **Machine Learning** - Training data for models

#### JSON Structure (Excerpt)
```json
{
  "song": {
    "title": "Song Title",
    "key": "C Major",
    "tempo": 120,
    "timeSignature": "4/4"
  },
  "lyrics": {
    "text": "Full lyrics without timing..."
  },
  "audio_features": {
    "energy": 0.75,
    "danceability": 0.68,
    "valence": 0.62,
    "acousticness": 0.15,
    "instrumentalness": 0.05
  },
  "classification": {
    "genres": ["Pop", "Indie"],
    "moods": ["Upbeat", "Energetic"]
  },
  "lyrics_analysis": {
    "sentiment": "positive",
    "sentimentScore": 0.75,
    "themes": ["love", "growth"],
    "energyFromLyrics": 0.82
  }
}
```

---

## Feature Matrix

| Feature | Transcription | Word-Level | Complete |
|---------|---|---|---|
| Song title | ✓ | ✓ | ✓ |
| Lyrics text | ✓ | ✓ | ✓ |
| Segment timing | ✓ | ✓ | ✗ |
| Word timing | ✗ | ✓ | ✗ |
| Energy | ✗ | ✗ | ✓ |
| Danceability | ✗ | ✗ | ✓ |
| Valence | ✗ | ✗ | ✓ |
| Key/Tempo | ✗ | ✗ | ✓ |
| Genres | ✗ | ✗ | ✓ |
| Moods | ✗ | ✗ | ✓ |
| Sentiment | ✗ | ✗ | ✓ |
| Themes | ✗ | ✗ | ✓ |
| File size | Small | Medium | Large |
| LRC format | ✗ | ✓ | ✗ |

---

## Selection Guide

### Choose Transcription JSON if you...
- Need simple text for altar/display
- Want minimal file size
- Don't need audio analysis
- Plan to use segments for sync
- Are building a text-only workflow

### Choose Word-Level Lyrics if you...
- Building karaoke or music video
- Need precise word timing
- Integrating with audio apps
- Want LRC format support
- Need timing-locked lyrics

### Choose Complete Analysis if you...
- Cataloging a music library
- Doing data analysis/research
- Building recommendation system
- Integrating with external systems
- Need all metadata together
- Want to archive everything

---

## Integration Examples

### Using Transcription JSON in Python
```python
import json
from datetime import timedelta

with open('song.json') as f:
    data = json.load(f)

for seg in data['transcription']['segments']:
    start = timedelta(seconds=seg['start'])
    end = timedelta(seconds=seg['end'])
    print(f"[{start} - {end}] {seg['text']}")
```

### Using Word-Level Lyrics (LRC) in JavaScript
```javascript
// Most audio apps support LRC directly
// For custom implementation:
const lrcContent = document.querySelector('.lrc-content').innerText;
const lines = lrcContent.split('\n');
const lyrics = lines
  .filter(l => l.startsWith('['))
  .map(l => ({
    time: parseTime(l.match(/\[(\d+):(\d+\.\d+)\]/)[0]),
    text: l.split(']')[1]
  }));
```

### Using Complete Analysis in Python
```python
import json
import statistics

with open('song-analysis.json') as f:
    data = json.load(f)

# Calculate average energy
features = data['audio_features']
print(f"Energy: {features['energy']:.2%}")
print(f"Danceability: {features['danceability']:.2%}")

# Check themes
themes = data['lyrics_analysis']['themes']
print(f"Themes: {', '.join(themes)}")
```

---

## Tips

1. **Storage** - Use gzip compression for large Complete Analysis exports
2. **Backup** - Export Complete Analysis regularly for archival
3. **Integration** - Start with Transcription JSON, upgrade to Complete Analysis as needed
4. **Format** - LRC files work with most music players (VLC, foobar2000, etc.)
5. **Versioning** - Export timestamp helps track when data was generated

---

## Support

All exports include:
- **Copy** button - Quick clipboard access
- **Download** button - Save to file
- **Preview** - See format before exporting
- **Consistent format** - Valid JSON, ready to parse
