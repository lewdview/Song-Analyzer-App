# Transcription JSON Export Format

## Overview
Simple, clean JSON format for exporting basic transcription data. Ideal for altar placement or simple text-based workflows.

## Format Structure

```json
{
  "song": {
    "title": "Song Title",
    "fileName": "song_file.wav",
    "duration": 245.5
  },
  "transcription": {
    "text": "Full transcription text as one string...",
    "segments": [
      {
        "start": 0.0,
        "end": 3.5,
        "text": "First line of lyrics"
      },
      {
        "start": 3.5,
        "end": 7.2,
        "text": "Second line of lyrics"
      },
      {
        "start": 7.2,
        "end": 10.8,
        "text": "Third line of lyrics"
      }
    ]
  },
  "metadata": {
    "exportedAt": "2026-01-05T01:15:00.000Z",
    "segmentCount": 3
  }
}
```

## Field Descriptions

### Song Object
- **title** (string) - Song title from analysis
- **fileName** (string) - Original filename
- **duration** (number) - Song duration in seconds

### Transcription Object
- **text** (string) - Full transcription as continuous text (no timestamps)
- **segments** (array) - Array of timed text segments

### Segment Object
- **start** (number) - Start time in seconds
- **end** (number) - End time in seconds
- **text** (string) - Text content for this segment

### Metadata Object
- **exportedAt** (string) - ISO 8601 timestamp of export
- **segmentCount** (number) - Number of segments in transcription

## Usage

### Copy to Clipboard
Click "Copy JSON" button to copy the entire JSON to clipboard for quick pasting into external tools.

### Download File
Click "Download" button to save as `.json` file named after the song.

## Example Use Cases

1. **Text Editing** - Copy text field into text editor for manual refinement
2. **Data Processing** - Import segments into custom tools
3. **Altar Placement** - Simple text format for placement workflows
4. **Integration** - Use segments with timing for syncing text displays
5. **Backup** - Archive transcription data in standardized format

## Differences from Full Export

| Feature | This Export | Full Export |
|---------|------------|------------|
| Song metadata | ✓ | ✓ |
| Segments with timing | ✓ | ✓ |
| Word-level timing | ✗ | ✓ |
| Audio features | ✗ | ✓ |
| Analysis data | ✗ | ✓ |
| File size | Small | Large |
| Use case | Simple text | Complete analysis |

## No Extra Data
This export intentionally excludes:
- Audio feature analysis (energy, danceability, etc.)
- Lyric analysis (sentiment, themes, etc.)
- Word-level timing information
- Waveform data
- Genre/mood tags
- Any other derived metrics

This keeps the JSON clean and focused on transcription content.
