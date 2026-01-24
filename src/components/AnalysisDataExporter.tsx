import { useState } from 'react';
import type { SongAnalysis } from '@/types';
import { Button } from '@/components/ui/button';
import { Download, Copy, Check, Database, ChevronDown, ChevronUp } from 'lucide-react';

interface AnalysisDataExporterProps {
  analysis: SongAnalysis;
}

/**
 * Analysis data exporter
 * Exports lyrics (without timing) plus all audio analysis features
 * Includes: mood, genre, energy, danceability, sentiment, themes, etc.
 */
export function AnalysisDataExporter({ analysis }: AnalysisDataExporterProps) {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  /**
   * Generate comprehensive analysis JSON
   */
  const generateJson = () => {
    const exportData = {
      song: {
        title: analysis.title || analysis.fileName.replace(/\.[^.]+$/, ''),
        fileName: analysis.fileName,
        duration: analysis.duration,
        key: analysis.key,
        tempo: analysis.tempo,
        timeSignature: analysis.timeSignature,
      },
      lyrics: {
        text: analysis.lyrics || '',
        // Note: No word-level or segment timing - just the raw text
      },
      audio_features: {
        energy: analysis.energy,
        danceability: analysis.danceability,
        valence: analysis.valence,
        acousticness: analysis.acousticness,
        instrumentalness: analysis.instrumentalness,
        liveness: analysis.liveness,
        speechiness: analysis.speechiness,
        loudness: analysis.loudness,
      },
      classification: {
        genres: analysis.genre || [],
        moods: analysis.mood || [],
      },
      lyrics_analysis: analysis.lyricsAnalysis ? {
        sentiment: analysis.lyricsAnalysis.sentiment,
        sentimentScore: analysis.lyricsAnalysis.sentimentScore,
        themes: analysis.lyricsAnalysis.themes || [],
        energyFromLyrics: analysis.lyricsAnalysis.energyFromLyrics,
        valenceFromLyrics: analysis.lyricsAnalysis.valenceFromLyrics,
      } : null,
      metadata: {
        id: analysis.id,
        fileSize: analysis.fileSize,
        analyzedAt: analysis.analyzedAt,
        exportedAt: new Date().toISOString(),
      },
    };

    return JSON.stringify(exportData, null, 2);
  };

  const jsonContent = generateJson();

  /**
   * Download JSON file
   */
  const handleDownload = () => {
    const element = document.createElement('a');
    const file = new Blob([jsonContent], { type: 'application/json' });
    element.href = URL.createObjectURL(file);
    element.download = `${analysis.title || analysis.fileName.replace(/\.[^.]+$/, '')}-analysis.json`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  /**
   * Copy JSON to clipboard
   */
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div>
      {/* Header - Collapsible */}
      <div
        className="flex items-center justify-between cursor-pointer hover:bg-gradient-to-r hover:from-amber-500/10 hover:to-orange-500/10 transition-all p-4 rounded-lg border border-amber-500/20"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <Database className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <div>
            <h3 className="font-bold text-white text-sm">Complete Analysis Data</h3>
            <p className="text-xs text-amber-300/80">
              Lyrics + Audio Features + Classification
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleCopy();
              }}
              className={`gap-2 font-semibold transition-all duration-300 ${
                copied
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/50'
                  : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-lg shadow-amber-500/50'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy JSON
                </>
              )}
            </Button>
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleDownload();
              }}
              className="gap-2 font-semibold bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white shadow-lg shadow-indigo-500/50 transition-all duration-300"
            >
              <Download className="w-4 h-4" />
              Download
            </Button>
          </div>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-amber-300" />
          ) : (
            <ChevronDown className="w-5 h-5 text-amber-300" />
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="space-y-3 mt-3">
          {/* JSON Preview */}
          <div className="bg-gray-900/50 rounded p-3 text-xs font-mono max-h-96 overflow-y-auto border border-gray-800">
            <pre className="text-gray-300 whitespace-pre-wrap break-words">
              {jsonContent}
            </pre>
          </div>

          {/* Info about export */}
          <div className="text-xs text-gray-400 space-y-1">
            <p>✓ Includes full lyrics (text only, no timing)</p>
            <p>✓ All audio features (energy, danceability, etc.)</p>
            <p>✓ Genre, mood, and sentiment classification</p>
            <p>✓ AI analysis results (themes, sentiment score)</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default AnalysisDataExporter;
