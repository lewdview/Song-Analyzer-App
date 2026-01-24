import { useState } from 'react';
import type { SongAnalysis } from '@/types';
import { Button } from '@/components/ui/button';
import { Download, Copy, Check, FileJson, ChevronDown, ChevronUp } from 'lucide-react';

interface TranscriptionExporterProps {
  analysis: SongAnalysis;
}

/**
 * Simple transcription exporter
 * Exports basic song data and transcription segments as clean JSON
 * Minimal format - no lyric timing, just text and timing info
 */
export function TranscriptionExporter({ analysis }: TranscriptionExporterProps) {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  if (!analysis.lyricsSegments || analysis.lyricsSegments.length === 0) {
    return (
      <div className="bg-white/5 rounded-lg p-4">
        <p className="text-sm text-gray-300">
          No transcription data available for this song.
        </p>
      </div>
    );
  }

  /**
   * Generate simple JSON export
   */
  const generateJson = () => {
    const exportData = {
      song: {
        title: analysis.title || analysis.fileName.replace(/\.[^.]+$/, ''),
        fileName: analysis.fileName,
        duration: analysis.duration,
      },
      transcription: {
        text: analysis.lyrics || '',
        segments: analysis.lyricsSegments.map((seg) => ({
          start: seg.start,
          end: seg.end,
          text: seg.text,
        })),
      },
      metadata: {
        exportedAt: new Date().toISOString(),
        segmentCount: analysis.lyricsSegments.length,
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
    element.download = `${analysis.title || analysis.fileName.replace(/\.[^.]+$/, '')}.json`;
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
        className="flex items-center justify-between cursor-pointer hover:bg-gradient-to-r hover:from-blue-500/10 hover:to-cyan-500/10 transition-all p-4 rounded-lg border border-blue-500/20"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <FileJson className="w-5 h-5 text-blue-400 flex-shrink-0" />
          <div>
            <h3 className="font-bold text-white text-sm">Transcription JSON</h3>
            <p className="text-xs text-blue-300/80">
              {analysis.lyricsSegments?.length || 0} segments • Simple format
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
                  : 'bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white shadow-lg shadow-blue-500/50'
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
              className="gap-2 font-semibold bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white shadow-lg shadow-green-500/50 transition-all duration-300"
            >
              <Download className="w-4 h-4" />
              Download
            </Button>
          </div>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-blue-300" />
          ) : (
            <ChevronDown className="w-5 h-5 text-blue-300" />
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="bg-gray-900/50 rounded p-3 text-xs font-mono max-h-64 overflow-y-auto border border-gray-800 mt-2">
          <pre className="text-gray-300 whitespace-pre-wrap break-words">
            {jsonContent}
          </pre>
        </div>
      )}
    </div>
  );
}

export default TranscriptionExporter;
