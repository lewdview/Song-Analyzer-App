import { useState } from 'react';
import type { SongAnalysis } from '@/types';
import { AudioPlayer } from './AudioPlayer';
import { LyricsExporter } from './LyricsExporter';
import { TranscriptionExporter } from './TranscriptionExporter';
import { AnalysisDataExporter } from './AnalysisDataExporter';
import {
  Music,
  Clock,
  Zap,
  Heart,
  Mic,
  Volume2,
  TrendingUp,
  FileText,
  Download,
  ChevronDown,
  ChevronUp,
  Brain,
  Trash2,
  ExternalLink,
} from 'lucide-react';

interface AnalysisResultsProps {
  analyses: SongAnalysis[];
  onDelete?: (id: string) => void;
}

export function AnalysisResults({ analyses, onDelete }: AnalysisResultsProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [isLoadingKaraoke, setIsLoadingKaraoke] = useState(false);

  const toggleExpanded = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  const downloadSingleResult = (analysis: SongAnalysis) => {
    const dataStr = JSON.stringify(analysis, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${analysis.fileName.replace(/\.[^/.]+$/, '')}-analysis.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (isoString: string): string => {
    return new Date(isoString).toLocaleString();
  };

  const openKaraokeWindow = async (analysis: SongAnalysis) => {
    setIsLoadingKaraoke(true);
    
    try {
      // Store data for the new window to access
      // Note: We skip audio transfer - the blob URL may be revoked.
      // The karaoke window will show lyrics-only mode if audio isn't available.
      const karaokeData = {
        ...analysis,
        // Don't include audioUrl - blob URLs can't be transferred to new windows
        // and may already be revoked. The karaoke window will handle this gracefully.
        audioUrl: undefined,
      };
      
      console.log('[Karaoke] Preparing data (lyrics-only mode):', {
        fileName: karaokeData.fileName,
        lyricsWordsCount: karaokeData.lyricsWords?.length,
        lyricsSegmentsCount: karaokeData.lyricsSegments?.length,
      });
      
      (window as any).__karaokeData = karaokeData;
      
      // Store in localStorage (without audio, should always fit)
      try {
        const jsonData = JSON.stringify(karaokeData);
        console.log('[Karaoke] JSON data size:', jsonData.length, 'bytes');
        localStorage.setItem('karaokeData', jsonData);
        console.log('[Karaoke] Data stored in localStorage successfully');
      } catch (err) {
        console.warn('[Karaoke] Failed to store in localStorage:', err);
      }
      
      // Open in new window with specific dimensions
      const width = 1200;
      const height = 800;
      const left = (window.screen.width - width) / 2;
      const top = (window.screen.height - height) / 2;
      
      window.open(
        '/karaoke',
        `karaoke_${analysis.id}`,
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no,toolbar=no,menubar=no,location=no,status=no`
      );
    } finally {
      setIsLoadingKaraoke(false);
    }
  };

  return (
    <div className="space-y-4">
      {analyses.map((analysis, index) => (
        <div
          key={analysis.id}
          className="bg-white/5 rounded-xl overflow-hidden border border-white/10"
        >
          {/* Header */}
          <div
            className="flex items-center justify-between p-5 cursor-pointer hover:bg-white/5 transition-colors"
            onClick={() => toggleExpanded(index)}
          >
            <div className="flex items-center gap-4 flex-1">
              <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center">
                <Music className="w-6 h-6 text-purple-300" />
              </div>
              <div>
                <h3 className="text-white">{analysis.fileName}</h3>
                <p className="text-purple-300 text-sm">
                  {formatDuration(analysis.duration)} • {analysis.tempo} BPM • {analysis.key}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  downloadSingleResult(analysis);
                }}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                title="Download this analysis"
                aria-label="Download analysis as JSON"
              >
                <Download className="w-5 h-5 text-purple-300" aria-hidden="true" />
              </button>
              {onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(analysis.id);
                  }}
                  className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
                  title="Delete this analysis"
                  aria-label="Delete analysis"
                >
                  <Trash2 className="w-5 h-5 text-red-300" aria-hidden="true" />
                </button>
              )}
              {expandedIndex === index ? (
                <ChevronUp className="w-6 h-6 text-purple-300" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-6 h-6 text-purple-300" aria-hidden="true" />
              )}
            </div>
          </div>

          {/* Expanded Content */}
          {expandedIndex === index && (
            <div className="p-5 pt-0 space-y-6">
              {/* Audio Player */}
              <div className="bg-white/5 rounded-lg p-4">
                <h4 className="text-purple-200 mb-3">Player</h4>
                {analysis.audioUrl ? (
                  <AudioPlayer
                    src={analysis.audioUrl}
                    songId={analysis.id}
                  />
                ) : (
                  <p className="text-purple-300 text-sm">No audio attached in this session.</p>
                )}
              </div>

              {/* Karaoke Launch Button */}
              {analysis.lyricsWords && analysis.lyricsWords.length > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openKaraokeWindow(analysis);
                  }}
                  disabled={isLoadingKaraoke}
                  style={{
                    width: '100%',
                    background: 'linear-gradient(135deg, #9333ea 0%, #ec4899 100%)',
                    border: 'none',
                    borderRadius: 12,
                    padding: '16px 24px',
                    cursor: isLoadingKaraoke ? 'not-allowed' : 'pointer',
                    opacity: isLoadingKaraoke ? 0.6 : 1,
                    transition: 'all 0.2s ease',
                    boxShadow: '0 4px 20px rgba(147, 51, 234, 0.3)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isLoadingKaraoke) {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 8px 30px rgba(147, 51, 234, 0.4)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 20px rgba(147, 51, 234, 0.3)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                    {isLoadingKaraoke ? (
                      <>
                        <div style={{
                          width: 20,
                          height: 20,
                          border: '2px solid rgba(255,255,255,0.3)',
                          borderTopColor: 'white',
                          borderRadius: '50%',
                          animation: 'spin 1s linear infinite',
                        }} />
                        <span style={{ color: 'white', fontWeight: 600, fontSize: '1rem' }}>Loading...</span>
                      </>
                    ) : (
                      <>
                        <Mic style={{ width: 20, height: 20, color: 'white' }} />
                        <span style={{ color: 'white', fontWeight: 600, fontSize: '1rem' }}>🎤 Launch Karaoke</span>
                        <ExternalLink style={{ width: 16, height: 16, color: 'rgba(255,255,255,0.7)' }} />
                      </>
                    )}
                  </div>
                </button>
              )}

              {/* Waveform Visualization */}
              <div className="bg-white/5 rounded-lg p-4">
                <h4 className="text-purple-200 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Waveform
                </h4>
                <div className="flex items-end justify-between h-48 gap-0.5">
                  {analysis.waveformData.map((value, i) => (
                    <div
                      key={i}
                      className="bg-gradient-to-t from-purple-500 to-blue-400 rounded-t flex-1 transition-all hover:opacity-80"
                      style={{ height: `${Math.max(value * 100, 1)}%`, minHeight: '4px' }}
                    />
                  ))}
                </div>
              </div>

              {/* Audio Features Grid */}
              <div>
                <h4 className="text-purple-200 mb-3">Audio Features</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  <FeatureCard
                    icon={<Zap className="w-5 h-5" />}
                    label="Energy"
                    value={analysis.energy}
                    color="yellow"
                  />
                  <FeatureCard
                    icon={<Heart className="w-5 h-5" />}
                    label="Danceability"
                    value={analysis.danceability}
                    color="pink"
                  />
                  <FeatureCard
                    icon={<Heart className="w-5 h-5" />}
                    label="Valence"
                    value={analysis.valence}
                    color="green"
                  />
                  <FeatureCard
                    icon={<Music className="w-5 h-5" />}
                    label="Acousticness"
                    value={analysis.acousticness}
                    color="blue"
                  />
                  <FeatureCard
                    icon={<Music className="w-5 h-5" />}
                    label="Instrumentalness"
                    value={analysis.instrumentalness}
                    color="purple"
                  />
                  <FeatureCard
                    icon={<Mic className="w-5 h-5" />}
                    label="Speechiness"
                    value={analysis.speechiness}
                    color="orange"
                  />
                  <FeatureCard
                    icon={<Volume2 className="w-5 h-5" />}
                    label="Liveness"
                    value={analysis.liveness}
                    color="red"
                  />
                  <div className="bg-white/5 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-gray-300 mb-2">
                      <Volume2 className="w-5 h-5" />
                      <span className="text-sm">Loudness</span>
                    </div>
                    <p className="text-white">{analysis.loudness.toFixed(1)} dB</p>
                  </div>
                </div>
              </div>

              {/* Technical Info */}
              <div>
                <h4 className="text-purple-200 mb-3">Technical Information</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <InfoCard
                    icon={<Clock className="w-4 h-4" />}
                    label="Duration"
                    value={formatDuration(analysis.duration)}
                  />
                  <InfoCard
                    icon={<TrendingUp className="w-4 h-4" />}
                    label="Tempo"
                    value={`${analysis.tempo} BPM`}
                  />
                  <InfoCard
                    icon={<Music className="w-4 h-4" />}
                    label="Key"
                    value={analysis.key}
                  />
                  <InfoCard
                    icon={<Music className="w-4 h-4" />}
                    label="Time Signature"
                    value={analysis.timeSignature}
                  />
                </div>
              </div>

              {/* Genre & Mood Tags */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-purple-200 mb-3">Genres</h4>
                  <div className="flex flex-wrap gap-2">
                    {analysis.genre.map((genre, i) => (
                      <span
                        key={i}
                        className="px-3 py-1 bg-purple-500/20 text-purple-200 rounded-full text-sm"
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-purple-200 mb-3">Moods</h4>
                  <div className="flex flex-wrap gap-2">
                    {analysis.mood.map((mood, i) => (
                      <span
                        key={i}
                        className="px-3 py-1 bg-blue-500/20 text-blue-200 rounded-full text-sm"
                      >
                        {mood}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Lyrics Analysis (if available) */}
              {analysis.lyricsAnalysis && (
                <div>
                  <h4 className="text-purple-200 mb-3 flex items-center gap-2">
                    <Brain className="w-4 h-4" />
                    AI Lyrics Analysis
                  </h4>
                  <div className="bg-gradient-to-br from-purple-500/10 to-blue-500/10 rounded-lg p-4 space-y-3 border border-purple-400/20">
                    <div>
                      <p className="text-purple-300 text-sm mb-2">Sentiment</p>
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 rounded-full text-sm ${
                          analysis.lyricsAnalysis.sentiment === 'positive' ? 'bg-green-500/20 text-green-200' :
                          analysis.lyricsAnalysis.sentiment === 'negative' ? 'bg-red-500/20 text-red-200' :
                          analysis.lyricsAnalysis.sentiment === 'mixed' ? 'bg-yellow-500/20 text-yellow-200' :
                          'bg-gray-500/20 text-gray-200'
                        }`}>
                          {analysis.lyricsAnalysis.sentiment}
                        </span>
                        <div className="flex-1 bg-white/10 rounded-full h-2 overflow-hidden">
                          <div 
                            className={`h-full transition-all ${
                              analysis.lyricsAnalysis.sentimentScore > 0 ? 'bg-green-400' : 'bg-red-400'
                            }`}
                            style={{ 
                              width: `${Math.abs(analysis.lyricsAnalysis.sentimentScore) * 100}%`,
                              marginLeft: analysis.lyricsAnalysis.sentimentScore < 0 ? `${(1 - Math.abs(analysis.lyricsAnalysis.sentimentScore)) * 100}%` : '0'
                            }}
                          />
                        </div>
                        <span className="text-purple-200 text-sm">
                          {analysis.lyricsAnalysis.sentimentScore > 0 ? '+' : ''}{analysis.lyricsAnalysis.sentimentScore.toFixed(2)}
                        </span>
                      </div>
                    </div>
                    
                    {analysis.lyricsAnalysis.themes.length > 0 && analysis.lyricsAnalysis.themes[0] !== 'unknown' && (
                      <div>
                        <p className="text-purple-300 text-sm mb-2">Themes</p>
                        <div className="flex flex-wrap gap-2">
                          {analysis.lyricsAnalysis.themes.map((theme, i) => (
                            <span key={i} className="px-2 py-1 bg-indigo-500/20 text-indigo-200 rounded text-xs">
                              {theme}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-purple-300 mb-1">Lyrical Energy</p>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-white/10 rounded-full h-2">
                            <div 
                              className="bg-orange-400 h-full rounded-full transition-all"
                              style={{ width: `${analysis.lyricsAnalysis.energyFromLyrics * 100}%` }}
                            />
                          </div>
                          <span className="text-purple-200">{(analysis.lyricsAnalysis.energyFromLyrics * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-purple-300 mb-1">Lyrical Positivity</p>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-white/10 rounded-full h-2">
                            <div 
                              className="bg-green-400 h-full rounded-full transition-all"
                              style={{ width: `${analysis.lyricsAnalysis.valenceFromLyrics * 100}%` }}
                            />
                          </div>
                          <span className="text-purple-200">{(analysis.lyricsAnalysis.valenceFromLyrics * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

{/* Word-Level Lyrics Export */}
              {analysis.lyricsWords && analysis.lyricsWords.length > 0 && (
                <div className="bg-white/5 rounded-lg p-4">
                  <LyricsExporter analysis={analysis} />
                </div>
              )}

              {/* Simple Transcription JSON Export */}
              {analysis.lyricsSegments && analysis.lyricsSegments.length > 0 && (
                <TranscriptionExporter analysis={analysis} />
              )}

              {/* Complete Analysis Data Export */}
              <AnalysisDataExporter analysis={analysis} />

              {/* Lyrics */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-purple-200 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Lyrics Transcription
                  </h4>
                  {analysis.lyricsSegments && analysis.lyricsSegments.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const srt = buildSrt(analysis.lyricsSegments!);
                        const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${analysis.fileName.replace(/\.[^/.]+$/, '')}.srt`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="px-3 py-1 bg-purple-500/20 text-purple-100 rounded hover:bg-purple-500/30 text-xs"
                      title="Download SRT"
                    >
                      Download SRT
                    </button>
                  )}
                </div>
                <div className="bg-white/5 rounded-lg p-4 max-h-60 overflow-y-auto">
                  {analysis.lyricsSegments && analysis.lyricsSegments.length > 0 ? (
                    <ul className="space-y-1">
                      {analysis.lyricsSegments.map((seg, i) => (
                        <li key={i} className="text-purple-100 text-sm">
                          <button
                            className="text-purple-300 hover:text-white font-mono mr-2"
                            onClick={(e) => e.stopPropagation()}
                            title={`${formatTimestamp(seg.start)} → ${formatTimestamp(seg.end)}`}
                          >
                            [{formatTimestamp(seg.start)}]
                          </button>
                          <span className="whitespace-pre-wrap">{seg.text}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <pre className="text-purple-100 text-sm whitespace-pre-wrap font-mono">
                      {analysis.lyrics}
                    </pre>
                  )}
                </div>
              </div>

              {/* Metadata */}
              <div className="text-purple-300 text-sm pt-4 border-t border-white/10">
                <p>File size: {(analysis.fileSize / 1024 / 1024).toFixed(2)} MB</p>
                <p>Analyzed: {formatDate(analysis.analyzedAt)}</p>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

interface FeatureCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: 'yellow' | 'pink' | 'green' | 'blue' | 'purple' | 'orange' | 'red';
}

function FeatureCard({ icon, label, value, color }: FeatureCardProps) {
  const colorClasses = {
    yellow: 'text-yellow-300',
    pink: 'text-pink-300',
    green: 'text-green-300',
    blue: 'text-blue-300',
    purple: 'text-purple-300',
    orange: 'text-orange-300',
    red: 'text-red-300',
  };

  const bgColorClasses = {
    yellow: 'bg-yellow-500',
    pink: 'bg-pink-500',
    green: 'bg-green-500',
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500',
    red: 'bg-red-500',
  };

  return (
    <div className="bg-white/5 rounded-lg p-4">
      <div className={`flex items-center gap-2 ${colorClasses[color]} mb-2`}>
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1 bg-white/10 rounded-full h-2 overflow-hidden">
          <div
            className={`${bgColorClasses[color]} h-full transition-all duration-300 rounded-full`}
            style={{ width: `${value * 100}%` }}
          />
        </div>
        <span className="text-white text-sm">{(value * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

interface InfoCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

function InfoCard({ icon, label, value }: InfoCardProps) {
  return (
    <div className="bg-white/5 rounded-lg p-4">
      <div className="flex items-center gap-2 text-gray-300 mb-2">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <p className="text-white">{value}</p>
    </div>
  );
}

// Helpers for timestamp formatting and SRT export
function pad(n: number, width = 2) {
  const s = Math.floor(Math.abs(n)).toString();
  return s.length >= width ? s : '0'.repeat(width - s.length) + s;
}

function formatTimestamp(seconds: number) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  // mm:ss for compact display; include hours if needed
  return (hrs > 0 ? `${hrs}:` : '') + `${pad(mins)}:${pad(secs)}`;
}

function formatSrtTimestamp(seconds: number) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)},${pad(ms, 3)}`;
}

function buildSrt(segments: { start: number; end: number; text: string }[]) {
  return segments
    .map((s, i) => {
      const idx = i + 1;
      return `${idx}\n${formatSrtTimestamp(s.start)} --> ${formatSrtTimestamp(s.end)}\n${s.text.trim()}\n`;
    })
    .join('\n');
}
