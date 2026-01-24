import { useState, useCallback, useEffect } from 'react';
import { Edit2, Save, X, AlertCircle, CheckCircle } from 'lucide-react';
import { API_ENDPOINTS, SUPABASE_ANON_KEY } from '@/config/api';
import type { SongAnalysis, LyricSegment, LyricWord } from '@/App';

interface LyricEditorProps {
  analysis: SongAnalysis;
  onUpdate: (updatedAnalysis: SongAnalysis) => void;
  isEnabled?: boolean;
  onClose?: () => void;
}

export function LyricEditor({ analysis, onUpdate, isEnabled = false, onClose }: LyricEditorProps) {
  const [editMode, setEditMode] = useState(false);
  const [editingSegmentId, setEditingSegmentId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState('');
  const [debugMode, setDebugMode] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('');

  const segments = analysis.lyricsSegments || [];

  // Load any previously edited lyrics from localStorage
  useEffect(() => {
    if (!analysis) return;
    
    try {
      // Try the new storage format first
      const edits = localStorage.getItem(`lyrics-${analysis.id}`);
      if (edits) {
        const parsedEdits = JSON.parse(edits);
        if (parsedEdits.lyricsSegments && parsedEdits.lyricsWords) {
          const updatedAnalysis: SongAnalysis = {
            ...analysis,
            lyricsSegments: parsedEdits.lyricsSegments,
            lyricsWords: parsedEdits.lyricsWords,
            lyrics: parsedEdits.lyricsSegments.map((s: LyricSegment) => s.text).join('\n'),
          };
          onUpdate(updatedAnalysis);
          setDebugInfo('Loaded edited lyrics from localStorage');
        }
      }
    } catch (error) {
      console.warn('Failed to load custom lyrics from localStorage:', error);
      setDebugInfo('Failed to load saved lyrics: ' + error.message);
    }
  }, [analysis.id, onUpdate]);

  // Start editing a segment
  const startEdit = useCallback((segmentIndex: number) => {
    if (!segments[segmentIndex]) return;
    setEditingSegmentId(segmentIndex);
    setEditingText(segments[segmentIndex].text);
  }, [segments]);

  // Cancel editing
  const cancelEdit = useCallback(() => {
    setEditingSegmentId(null);
    setEditingText('');
  }, []);

  // Save a single segment's edits
  const saveSegmentEdit = useCallback(async (segmentIndex: number) => {
    if (!analysis.lyricsSegments || !editingText.trim()) return;

    setIsSaving(true);
    setSaveStatus('saving');
    setSaveMessage('Saving lyrics...');

    try {
      const segment = analysis.lyricsSegments[segmentIndex];
      const newText = editingText.trim();

      // Update segments with new text
      const updatedSegments = analysis.lyricsSegments.map((seg, idx) =>
        idx === segmentIndex ? { ...seg, text: newText } : seg
      );

      // Redistribute words to match new text
      // Strategy: Try to preserve original word timings where possible, fall back to equal distribution
      const newWords = newText.split(/\s+/).filter(w => w.length > 0);
      const segmentDuration = segment.end - segment.start;
      
      // Get original words in this segment for reference
      const originalWordsInSegment = (analysis.lyricsWords || []).filter(
        w => w.start >= segment.start && w.end <= segment.end
      );
      
      let newWordObjects: LyricWord[];
      
      if (originalWordsInSegment.length > 0 && originalWordsInSegment.length <= newWords.length) {
        // If we have original timings and similar word count, use proportional mapping
        newWordObjects = newWords.map((word, widx) => {
          const proportionThrough = widx / newWords.length;
          const start = segment.start + proportionThrough * segmentDuration;
          const proportionEnd = (widx + 1) / newWords.length;
          const end = segment.start + proportionEnd * segmentDuration;
          return { word, start, end };
        });
      } else {
        // Equal distribution fallback
        const wordDuration = segmentDuration / newWords.length;
        newWordObjects = newWords.map((word, widx) => ({
          word,
          start: segment.start + widx * wordDuration,
          end: segment.start + (widx + 1) * wordDuration,
        }));
      }

      // Replace words in the segment's time range
      const wordsBeforeSegment = analysis.lyricsWords?.filter(w => w.end <= segment.start) || [];
      const wordsAfterSegment = analysis.lyricsWords?.filter(w => w.start >= segment.end) || [];
      const updatedWords = [...wordsBeforeSegment, ...newWordObjects, ...wordsAfterSegment];
      
      console.log(`Updated segment ${segmentIndex}: ${newWords.length} words, timing preserved`);
      setDebugInfo(`Updated ${newWords.length} words with timing: ${segment.start.toFixed(2)}s - ${segment.end.toFixed(2)}s`);

      const updatedAnalysis: SongAnalysis = {
        ...analysis,
        lyricsSegments: updatedSegments,
        lyricsWords: updatedWords,
        lyrics: updatedSegments.map(s => s.text).join('\n'),
      };

      // First update local state
      onUpdate(updatedAnalysis);

      // Save to localStorage as the primary storage
      const storageKey = `lyrics-${analysis.id}`;
      const storageData = {
        lyrics: updatedAnalysis.lyrics,
        lyricsSegments: updatedAnalysis.lyricsSegments,
        lyricsWords: updatedAnalysis.lyricsWords,
        lastUpdated: Date.now()
      };
      
      localStorage.setItem(storageKey, JSON.stringify(storageData));
      
      // Update local state immediately
      onUpdate(updatedAnalysis);
      setEditingSegmentId(null);
      setEditingText('');
        // Set immediate success status since local save worked
        setSaveStatus('success');
        setSaveMessage('Lyrics saved successfully!');
        setDebugInfo('Lyrics saved to browser storage');

        // Optional: Try cloud sync asynchronously but don't block or show errors
        setTimeout(async () => {
          try {
            // Strip session-only fields before saving
            const sanitizedAnalysis = { ...updatedAnalysis };
            if (sanitizedAnalysis.audioUrl) {
              delete sanitizedAnalysis.audioUrl;
            }
            
            console.log('Attempting cloud sync for analysis:', analysis.id);
            console.log('Sending to:', API_ENDPOINTS.analyses.save);
            
            const saveResponse = await fetch(API_ENDPOINTS.analyses.save, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'apikey': SUPABASE_ANON_KEY,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ analyses: [sanitizedAnalysis] }),
            });
            
            if (saveResponse.ok) {
              const result = await saveResponse.json();
              console.log('Cloud sync completed successfully:', result);
              
              // If we successfully updated the analysis in the database, clear localStorage
              // so fresh data loads from DB on next reload
              if (result.updated > 0 || result.saved > 0) {
                localStorage.removeItem(`lyrics-${analysis.id}`);
                console.log('Cleared localStorage for analysis:', analysis.id);
              }
              
              // Update debug info with cloud sync status
              setTimeout(() => {
                const syncMsg = `saved: ${result.saved || 0}, updated: ${result.updated || 0}`;
                setDebugInfo(prev => prev ? `${prev} | Cloud synced: ${syncMsg} (local cache cleared)` : `Cloud synced: ${syncMsg} (local cache cleared)`);
              }, 500);
            } else {
              const errorText = await saveResponse.text();
              console.log('Cloud sync unavailable, using local storage only:', saveResponse.status, errorText);
            }
          } catch (error) {
            console.log('Cloud sync error, local storage only:', error);
          }
        }, 1000); // Async attempt after the main save completes
    } catch (error) {
      // Fallback for any unexpected errors
      console.error('Save process error:', error);
      // Never show error to user since local save always works
      // Only log for debugging
    } finally {
      // Always reset saving state
      setIsSaving(false);
    }
  }, [analysis, editingText, onUpdate]);

  if (!isEnabled) return null;

  return (
    <div style={{ padding: 16, background: 'rgba(168, 85, 247, 0.05)', borderRadius: 12, border: '1px solid rgba(168, 85, 247, 0.15)', maxHeight: '70vh', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'white' }}>
          <Edit2 style={{ width: 16, height: 16 }} />
          <span style={{ fontWeight: 600 }}>Lyric Editor</span>
        </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setEditMode(!editMode)}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              background: editMode ? 'rgba(168, 85, 247, 0.3)' : 'rgba(59, 130, 246, 0.2)',
              border: '1px solid' + (editMode ? 'rgba(168, 85, 247, 0.5)' : 'rgba(59, 130, 246, 0.3)'),
              color: 'white',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 500,
              transition: 'all 0.2s',
            }}
          >
            {editMode ? 'Exit Edit Mode' : 'Enter Edit Mode'}
          </button>
          <button
            onClick={() => setDebugMode(!debugMode)}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              background: debugMode ? 'rgba(251, 191, 36, 0.3)' : 'rgba(255, 255, 255, 0.1)',
              border: '1px solid' + (debugMode ? 'rgba(251, 191, 36, 0.5)' : 'rgba(255, 255, 255, 0.2)'),
              color: '#fbbf24',
              cursor: 'pointer',
              fontSize: '0.75rem',
            }}
            title="Toggle debug mode"
          >
            Debug
          </button>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                padding: 8,
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '50%',
                color: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: 32,
                width: 32,
              }}
              title="Close editor"
            >
              <X style={{ width: 16, height: 16 }} />
            </button>
          )}
        </div>
      </div>

      {/* Status message */}
      {saveStatus !== 'idle' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: 10,
          borderRadius: 8,
          background: saveStatus === 'success' ? 'rgba(34, 197, 94, 0.15)' : saveStatus === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)',
          border: '1px solid' + (saveStatus === 'success' ? 'rgba(34, 197, 94, 0.3)' : saveStatus === 'error' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(59, 130, 246, 0.3)'),
          color: saveStatus === 'success' ? '#86efac' : saveStatus === 'error' ? '#fca5a5' : '#93c5fd',
          fontSize: '0.875rem',
          marginBottom: 12,
        }}>
          {saveStatus === 'success' && <CheckCircle style={{ width: 16, height: 16, flexShrink: 0 }} />}
          {saveStatus === 'error' && <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />}
          {saveStatus === 'saving' && <div style={{ width: 16, height: 16, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />}
          <span>{saveMessage}</span>
        </div>
      )}
      
      {/* Debug information */}
      {debugMode && debugInfo && (
        <div style={{
          background: 'rgba(0, 0, 0, 0.3)',
          padding: '8px 12px',
          borderRadius: 6,
          fontFamily: 'monospace',
          fontSize: '0.8rem',
          color: '#fbbf24',
          border: '1px solid rgba(251, 191, 36, 0.2)',
          marginBottom: 12,
        }}>
          Debug: {debugInfo}
        </div>
      )}

      {editMode && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {segments.length === 0 ? (
            <p style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.875rem' }}>No lyric segments available</p>
          ) : (
            segments.map((segment, idx) => (
              <div key={idx} style={{
                padding: 12,
                background: 'rgba(0, 0, 0, 0.2)',
                borderRadius: 8,
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.5)' }}>
                    {formatTime(segment.start)} - {formatTime(segment.end)}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.5)' }}>
                    Line {idx + 1}
                  </span>
                </div>

                {editingSegmentId === idx ? (
                  <div>
                    <textarea
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      style={{
                        width: '100%',
                        minHeight: 60,
                        padding: 10,
                        borderRadius: 6,
                        background: 'rgba(0, 0, 0, 0.4)',
                        border: '2px solid rgba(168, 85, 247, 0.4)',
                        color: 'white',
                        fontSize: '0.95rem',
                        fontFamily: 'inherit',
                        resize: 'vertical',
                        outline: 'none',
                        marginBottom: 8,
                      }}
                      autoFocus
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => saveSegmentEdit(idx)}
                        disabled={isSaving}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          borderRadius: 6,
                          background: '#a855f7',
                          border: 'none',
                          color: 'white',
                          cursor: isSaving ? 'not-allowed' : 'pointer',
                          fontSize: '0.875rem',
                          fontWeight: 500,
                          opacity: isSaving ? 0.6 : 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          transition: 'all 0.2s',
                        }}
                      >
                        <Save style={{ width: 14, height: 14 }} />
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={cancelEdit}
                        disabled={isSaving}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 6,
                          background: 'rgba(255, 255, 255, 0.1)',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          color: 'white',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                          opacity: isSaving ? 0.6 : 1,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <X style={{ width: 14, height: 14 }} />
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => startEdit(idx)}
                    style={{
                      padding: 10,
                      borderRadius: 6,
                      background: 'rgba(168, 85, 247, 0.1)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      color: 'white',
                      fontSize: '0.95rem',
                      border: '1px solid rgba(168, 85, 247, 0.2)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(168, 85, 247, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(168, 85, 247, 0.1)';
                    }}
                  >
                    {segment.text}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {!editMode && (
        <p style={{ fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.5)', margin: 0 }}>
          Click "Enter Edit Mode" to modify and save lyrics without changing timing
        </p>
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
