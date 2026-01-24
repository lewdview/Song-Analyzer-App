import { useState, useMemo } from 'react';
import type { SongAnalysis, LyricWord } from '@/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Download, Copy, Check, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';

interface LyricsExporterProps {
  analysis: SongAnalysis;
}

/**
 * Component for viewing and exporting word-level lyrics with timing as LRC file
 * Dynamically regenerates LRC content on every render to catch lyric changes
 */
export function LyricsExporter({ analysis }: LyricsExporterProps) {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  if (!analysis.lyricsSegments || analysis.lyricsSegments.length === 0 || !analysis.lyricsWords || analysis.lyricsWords.length === 0) {
    return (
      <div className="bg-white/5 rounded-lg p-4">
        <p className="text-sm text-purple-300">
          No word-level timing data or transcription segments available for this song.
        </p>
      </div>
    );
  }

  /**
   * Convert seconds to LRC timestamp format [MM:SS.XX]
   */
  const secondsToLrcTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const ms = Math.round((secs % 1) * 100);
    const wholeSeconds = Math.floor(secs);
    return `[${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}.${String(ms).padStart(2, '0')}]`;
  };

  /**
   * Generate enhanced LRC content using original lyric transcription lines
   * Format: [MM:SS.XX] <MM:SS.XX>word <MM:SS.XX>word...
   * Uses segment structure from lyrics transcription with word-level timing
   * Memoized and regenerated whenever lyrics change
   */
  const lrcContent = useMemo(() => {
    const lines: string[] = [];

    // Add metadata
    lines.push(`[ar:${analysis.title || 'Unknown Artist'}]`);
    lines.push(`[ti:${analysis.fileName.replace(/\.[^.]+$/, '')}]`);
    lines.push(`[al:]`);
    lines.push(`[length:${Math.floor(analysis.duration * 1000)}]`);
    lines.push(`[tool:Song Analyzer App]`);
    lines.push(`[by:Generated ${new Date().toISOString().split('T')[0]}]`);
    lines.push('');

    // Build enhanced LRC using segment lines with word-level timing
    if (analysis.lyricsSegments && analysis.lyricsSegments.length > 0 && analysis.lyricsWords && analysis.lyricsWords.length > 0) {
      // Process each segment line
      for (const segment of analysis.lyricsSegments) {
        const segmentStart = segment.start;
        
        // Find words that fall within this segment
        const wordsInSegment = analysis.lyricsWords.filter(
          w => w.start >= segmentStart && w.start < segment.end
        );

        if (wordsInSegment.length > 0) {
          // Build enhanced LRC line: [MM:SS.XX] <MM:SS.XX>word <MM:SS.XX>word ...
          const minutes = Math.floor(segmentStart / 60);
          const secs = Math.floor(segmentStart % 60);
          const ms = Math.round((segmentStart % 1) * 100);
          let lineText = `[${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}]`;
          
          for (const word of wordsInSegment) {
            const wordMs = Math.round((word.start % 1) * 100);
            const wordSecs = Math.floor(word.start % 60);
            const wordMins = Math.floor(word.start / 60);
            lineText += ` <${String(wordMins).padStart(2, '0')}:${String(wordSecs).padStart(2, '0')}.${String(wordMs).padStart(2, '0')}>${word.word}`;
          }
          lines.push(lineText);
        }
      }
    }

    return lines.join('\n');
  }, [analysis.lyricsSegments, analysis.lyricsWords, analysis.title, analysis.fileName, analysis.duration]);

  /**
   * Download LRC file
   */
  const handleDownload = () => {
    const element = document.createElement('a');
    const file = new Blob([lrcContent], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `${analysis.title || analysis.fileName.replace(/\.[^.]+$/, '')}.lrc`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  /**
   * Copy LRC content to clipboard
   */
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(lrcContent);
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
        className="flex items-center justify-between cursor-pointer hover:bg-gradient-to-r hover:from-purple-500/10 hover:to-pink-500/10 transition-all p-4 rounded-lg border border-purple-500/20"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-purple-400 flex-shrink-0" />
          <div>
            <h3 className="font-bold text-white text-sm">Word-Level Lyrics</h3>
            <p className="text-xs text-purple-300/80">
              {analysis.lyricsWords?.length || 0} words {analysis.lyricsWords?.length ? '✓ ready for export' : 'with timing information'}
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
                  : 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white shadow-lg shadow-cyan-500/50'
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
                  Copy LRC
                </>
              )}
            </Button>
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleDownload();
              }}
              className="gap-2 font-semibold bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg shadow-purple-500/50 transition-all duration-300"
            >
              <Download className="w-4 h-4" />
              Export LRC
            </Button>
          </div>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-purple-300" />
          ) : (
            <ChevronDown className="w-5 h-5 text-purple-300" />
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="space-y-4 mt-3">
          {/* Preview of LRC content */}
          <div className="bg-white/5 rounded p-3 text-xs font-mono max-h-64 overflow-y-auto">
            <div className="text-white space-y-1">
              {lrcContent.split('\n').slice(0, 20).map((line, i) => (
                <div key={i} className="break-words">
                  {line}
                </div>
              ))}
              {lrcContent.split('\n').length > 20 && (
                <div className="text-purple-300 italic">
                  ... and {lrcContent.split('\n').length - 20} more lines
                </div>
              )}
            </div>
          </div>

          {/* Display word list with timing */}
          <div>
            <h4 className="font-semibold text-white text-sm mb-3">Word Timings</h4>
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
              {analysis.lyricsWords?.map((word, i) => (
                <div
                  key={i}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-purple-500/20 rounded text-xs"
                >
                  <span className="font-mono text-purple-300">
                    {secondsToLrcTime(word.start)}
                  </span>
                  <span className="font-medium text-white">{word.word}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
