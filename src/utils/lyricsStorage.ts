/**
 * Utility for managing lyrics edits across localStorage and database
 */

import type { SongAnalysis } from '../App';

export function mergeLyricsEdits(analysis: SongAnalysis): SongAnalysis {
  try {
    const storageKey = `lyrics-${analysis.id}`;
    const savedEdits = localStorage.getItem(storageKey);
    
    if (savedEdits) {
      const edits = JSON.parse(savedEdits);
      
      if (edits.lyricsSegments && edits.lyricsWords) {
        return {
          ...analysis,
          lyrics: edits.lyrics,
          lyricsSegments: edits.lyricsSegments,
          lyricsWords: edits.lyricsWords
        };
      }
    }
  } catch (error) {
    console.warn('Failed to merge lyrics edits:', error);
  }
  
  return analysis;
}

export function applyLyricsEditsToAll(analyses: SongAnalysis[]): SongAnalysis[] {
  return analyses.map(mergeLyricsEdits);
}
