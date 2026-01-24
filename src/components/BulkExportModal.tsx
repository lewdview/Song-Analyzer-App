import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { SongAnalysis } from '@/types';
import { Button } from '@/components/ui/button';
import { X, Download, Loader } from 'lucide-react';

type ExportFormat = 'transcription' | 'lyrics' | 'analysis' | 'complete';

interface BulkExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  analyses: SongAnalysis[];
}

/**
 * Bulk Export Modal
 * Allows exporting entire database in different formats
 */
export function BulkExportModal({ isOpen, onClose, analyses }: BulkExportModalProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  if (!isOpen) return null;

  /**
   * Generate transcription JSON for all songs
   */
  const generateTranscriptionExport = (analyses: SongAnalysis[]) => {
    const songs = analyses
      .filter(a => a.lyricsSegments && a.lyricsSegments.length > 0)
      .map(a => ({
        song: {
          title: a.title || a.fileName.replace(/\.[^.]+$/, ''),
          fileName: a.fileName,
          duration: a.duration,
        },
        transcription: {
          text: a.lyrics || '',
          segments: a.lyricsSegments.map(seg => ({
            start: seg.start,
            end: seg.end,
            text: seg.text,
          })),
        },
        metadata: {
          exportedAt: new Date().toISOString(),
          segmentCount: a.lyricsSegments.length,
        },
      }));

    return { songs, count: songs.length };
  };

  /**
   * Generate word-level lyrics export using line structure from segments
   * with enhanced word-level timing
   */
  const generateLyricsExport = (analyses: SongAnalysis[]) => {
    const songs = analyses
      .filter(a => (a.lyricsSegments && a.lyricsSegments.length > 0) && (a.lyricsWords && a.lyricsWords.length > 0))
      .map(a => {
        // Build enhanced LRC with word-level timing
        const lines: string[] = [];

        // Add metadata
        lines.push(`[ar:${a.title || 'Unknown Artist'}]`);
        lines.push(`[ti:${a.fileName.replace(/\.[^.]+$/, '')}]`);
        lines.push(`[al:]`);
        lines.push(`[length:${Math.floor(a.duration * 1000)}]`);
        lines.push(`[tool:Song Analyzer App]`);
        lines.push(`[by:Generated ${new Date().toISOString().split('T')[0]}]`);
        lines.push('');

        // Build lines using segment structure with word-level timing
        if (a.lyricsSegments && a.lyricsWords && a.lyricsWords.length > 0) {
          // Create a map of word timing for quick lookup
          const wordsByTime = new Map();
          a.lyricsWords.forEach(w => {
            if (!wordsByTime.has(w.start)) {
              wordsByTime.set(w.start, []);
            }
            wordsByTime.get(w.start).push(w);
          });

          // Process each segment line
          for (const segment of a.lyricsSegments) {
            const segmentText = segment.text;
            const segmentStart = segment.start;
            
            // Find words that fall within this segment
            const wordsInSegment = a.lyricsWords.filter(
              w => w.start >= segmentStart && w.start < segment.end
            );

            if (wordsInSegment.length > 0) {
              // Build enhanced LRC line: [MM:SS.XX] <MM:SS.XX>word <MM:SS.XX>word ...
              let lineText = `[${String(Math.floor(segmentStart / 60)).padStart(2, '0')}:${String(Math.floor(segmentStart % 60)).padStart(2, '0')}.${String(Math.round((segmentStart % 1) * 100)).padStart(2, '0')}]`;
              
              for (const word of wordsInSegment) {
                const ms = Math.round((word.start % 1) * 100);
                const secs = Math.floor(word.start % 60);
                lineText += ` <${String(Math.floor(word.start / 60)).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}>${word.word}`;
              }
              lines.push(lineText);
            }
          }
        }

        return {
          song: {
            title: a.title || a.fileName.replace(/\.[^.]+$/, ''),
            fileName: a.fileName,
            duration: a.duration,
          },
          lyrics: {
            lrc: lines.join('\n'),
            lineCount: lines.filter(l => !l.startsWith('[')).length,
            wordCount: a.lyricsWords.length,
          },
          metadata: {
            exportedAt: new Date().toISOString(),
            hasSegmentLines: true,
            hasWordTiming: true,
          },
        };
      });

    return { songs, count: songs.length };
  };

  /**
   * Generate analysis data export
   */
  const generateAnalysisExport = (analyses: SongAnalysis[]) => {
    const songs = analyses.map(a => ({
      song: {
        title: a.title || a.fileName.replace(/\.[^.]+$/, ''),
        fileName: a.fileName,
        duration: a.duration,
        key: a.key,
        tempo: a.tempo,
        timeSignature: a.timeSignature,
      },
      lyrics: {
        text: a.lyrics || '',
      },
      audio_features: {
        energy: a.energy,
        danceability: a.danceability,
        valence: a.valence,
        acousticness: a.acousticness,
        instrumentalness: a.instrumentalness,
        liveness: a.liveness,
        speechiness: a.speechiness,
        loudness: a.loudness,
      },
      classification: {
        genres: a.genre || [],
        moods: a.mood || [],
      },
      lyrics_analysis: a.lyricsAnalysis
        ? {
            sentiment: a.lyricsAnalysis.sentiment,
            sentimentScore: a.lyricsAnalysis.sentimentScore,
            themes: a.lyricsAnalysis.themes || [],
            energyFromLyrics: a.lyricsAnalysis.energyFromLyrics,
            valenceFromLyrics: a.lyricsAnalysis.valenceFromLyrics,
          }
        : null,
    }));

    return { songs, count: songs.length };
  };

  /**
   * Generate complete export (all data)
   */
  const generateCompleteExport = (analyses: SongAnalysis[]) => {
    const songs = analyses.map(a => ({
      id: a.id,
      fileName: a.fileName,
      title: a.title || a.fileName.replace(/\.[^.]+$/, ''),
      lyrics: a.lyrics || '',
      lyricsSegments: a.lyricsSegments || [],
      lyricsWords: a.lyricsWords || [],
      duration: a.duration,
      key: a.key,
      tempo: a.tempo,
      timeSignature: a.timeSignature,
      energy: a.energy,
      danceability: a.danceability,
      valence: a.valence,
      acousticness: a.acousticness,
      instrumentalness: a.instrumentalness,
      liveness: a.liveness,
      speechiness: a.speechiness,
      loudness: a.loudness,
      genre: a.genre || [],
      mood: a.mood || [],
      lyricsAnalysis: a.lyricsAnalysis || null,
      analyzedAt: a.analyzedAt,
    }));

    return { songs, count: songs.length, totalDuration: songs.reduce((sum, s) => sum + s.duration, 0) };
  };

  /**
   * Handle export
   */
  const handleExport = async (format: ExportFormat) => {
    setIsExporting(true);

    try {
      let data: any;
      let filename: string;

      switch (format) {
        case 'transcription': {
          const result = generateTranscriptionExport(analyses);
          data = {
            database: {
              format: 'transcription-json',
              exportedAt: new Date().toISOString(),
              songCount: result.count,
            },
            songs: result.songs,
          };
          filename = `database-transcription-${new Date().getTime()}.json`;
          break;
        }
        case 'lyrics': {
          const result = generateLyricsExport(analyses);
          data = {
            database: {
              format: 'word-level-lyrics',
              exportedAt: new Date().toISOString(),
              songCount: result.count,
            },
            songs: result.songs,
          };
          filename = `database-lyrics-${new Date().getTime()}.json`;
          break;
        }
        case 'analysis': {
          const result = generateAnalysisExport(analyses);
          data = {
            database: {
              format: 'analysis-data',
              exportedAt: new Date().toISOString(),
              songCount: result.count,
            },
            songs: result.songs,
          };
          filename = `database-analysis-${new Date().getTime()}.json`;
          break;
        }
        case 'complete': {
          const result = generateCompleteExport(analyses);
          data = {
            database: {
              format: 'complete',
              exportedAt: new Date().toISOString(),
              songCount: result.count,
              totalDuration: result.totalDuration,
            },
            songs: result.songs,
          };
          filename = `database-complete-${new Date().getTime()}.json`;
          break;
        }
      }

      // Download
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      onClose();
    } finally {
      setIsExporting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]" onClick={onClose}>
      <div
        className="bg-gray-900 rounded-lg border border-gray-700 max-w-2xl w-full mx-4 p-6 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">Export Database</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <p className="text-gray-300 mb-6">
          Choose an export format for all {analyses.length} songs in your database.
        </p>

        <div className="space-y-4">
          {/* Transcription JSON */}
          <button
            onClick={() => setSelectedFormat('transcription')}
            disabled={isExporting}
            className={`w-full p-4 rounded-lg border-2 transition-all ${
              selectedFormat === 'transcription'
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-gray-700 hover:border-gray-600'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="text-left">
                <h3 className="font-semibold text-white">Transcription JSON</h3>
                <p className="text-sm text-gray-400">
                  Segments with timing • Simple format
                </p>
              </div>
              <Download className="w-5 h-5 text-blue-400" />
            </div>
          </button>

          {/* Word-Level Lyrics */}
          <button
            onClick={() => setSelectedFormat('lyrics')}
            disabled={isExporting}
            className={`w-full p-4 rounded-lg border-2 transition-all ${
              selectedFormat === 'lyrics'
                ? 'border-cyan-500 bg-cyan-500/10'
                : 'border-gray-700 hover:border-gray-600'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="text-left">
                <h3 className="font-semibold text-white">Word-Level Lyrics</h3>
                <p className="text-sm text-gray-400">
                  Enhanced LRC • Line + word-level timing
                </p>
              </div>
              <Download className="w-5 h-5 text-cyan-400" />
            </div>
          </button>

          {/* Analysis Data */}
          <button
            onClick={() => setSelectedFormat('analysis')}
            disabled={isExporting}
            className={`w-full p-4 rounded-lg border-2 transition-all ${
              selectedFormat === 'analysis'
                ? 'border-amber-500 bg-amber-500/10'
                : 'border-gray-700 hover:border-gray-600'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="text-left">
                <h3 className="font-semibold text-white">Analysis Data</h3>
                <p className="text-sm text-gray-400">
                  Lyrics + audio features • Data analysis
                </p>
              </div>
              <Download className="w-5 h-5 text-amber-400" />
            </div>
          </button>

          {/* Complete Export */}
          <button
            onClick={() => setSelectedFormat('complete')}
            disabled={isExporting}
            className={`w-full p-4 rounded-lg border-2 transition-all ${
              selectedFormat === 'complete'
                ? 'border-purple-500 bg-purple-500/10'
                : 'border-gray-700 hover:border-gray-600'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="text-left">
                <h3 className="font-semibold text-white">Complete Export</h3>
                <p className="text-sm text-gray-400">
                  Everything • Full database backup
                </p>
              </div>
              <Download className="w-5 h-5 text-purple-400" />
            </div>
          </button>
        </div>

        <div className="mt-6 p-4 bg-white/5 rounded-lg border border-gray-700">
          <p className="text-sm text-gray-300">
            📦 <strong>Database size:</strong> {analyses.length} songs
          </p>
          <p className="text-xs text-gray-400 mt-2">
            File will be saved as JSON with timestamp
          </p>
        </div>

        <div className="flex gap-3 mt-6">
          <Button
            onClick={onClose}
            className="flex-1 bg-gray-800 hover:bg-gray-700 text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={() => selectedFormat && handleExport(selectedFormat)}
            disabled={!selectedFormat || isExporting}
            className="flex-1 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white gap-2"
          >
            {isExporting ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Export Database
              </>
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default BulkExportModal;
