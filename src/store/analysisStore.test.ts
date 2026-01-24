import { describe, it, expect, beforeEach } from 'vitest';
import { useAnalysisStore, selectFilteredAnalyses, selectAllGenres, selectAllMoods } from './analysisStore';
import type { SongAnalysis } from '@/types';

const mockAnalysis: SongAnalysis = {
  id: 'test-1',
  fileName: 'test-song.mp3',
  fileSize: 5000000,
  duration: 180,
  tempo: 120,
  key: 'C major',
  energy: 0.7,
  danceability: 0.8,
  valence: 0.6,
  acousticness: 0.3,
  instrumentalness: 0.1,
  loudness: -5,
  speechiness: 0.05,
  liveness: 0.2,
  timeSignature: '4/4',
  genre: ['Pop', 'Rock'],
  mood: ['Happy', 'Energetic'],
  waveformData: [0.1, 0.2, 0.3, 0.4, 0.5],
  lyrics: 'Test lyrics',
  analyzedAt: new Date().toISOString(),
};

describe('analysisStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useAnalysisStore.setState({
      analyses: [],
      files: [],
      isAnalyzing: false,
      isUploading: false,
      uploadProgress: 0,
      currentFile: '',
      activeTab: 'results',
      filters: { searchQuery: '', genre: 'all', mood: 'all' },
      isLoadingHistory: false,
      isSaving: false,
      blobUrls: [],
    });
  });

  describe('addAnalysis', () => {
    it('should add an analysis to the store', () => {
      const { addAnalysis } = useAnalysisStore.getState();
      
      addAnalysis(mockAnalysis);
      
      const state = useAnalysisStore.getState();
      expect(state.analyses).toHaveLength(1);
      expect(state.analyses[0]).toEqual(mockAnalysis);
    });

    it('should add multiple analyses', () => {
      const { addAnalysis } = useAnalysisStore.getState();
      
      addAnalysis(mockAnalysis);
      addAnalysis({ ...mockAnalysis, id: 'test-2', fileName: 'another.mp3' });
      
      const state = useAnalysisStore.getState();
      expect(state.analyses).toHaveLength(2);
    });
  });

  describe('removeAnalysis', () => {
    it('should remove an analysis by id', () => {
      const { addAnalysis, removeAnalysis } = useAnalysisStore.getState();
      
      addAnalysis(mockAnalysis);
      addAnalysis({ ...mockAnalysis, id: 'test-2' });
      
      removeAnalysis('test-1');
      
      const state = useAnalysisStore.getState();
      expect(state.analyses).toHaveLength(1);
      expect(state.analyses[0].id).toBe('test-2');
    });
  });

  describe('clearAnalyses', () => {
    it('should clear all analyses', () => {
      const { addAnalysis, clearAnalyses } = useAnalysisStore.getState();
      
      addAnalysis(mockAnalysis);
      addAnalysis({ ...mockAnalysis, id: 'test-2' });
      
      clearAnalyses();
      
      const state = useAnalysisStore.getState();
      expect(state.analyses).toHaveLength(0);
    });
  });

  describe('setFilters', () => {
    it('should update filters', () => {
      const { setFilters } = useAnalysisStore.getState();
      
      setFilters({ searchQuery: 'test', genre: 'Pop' });
      
      const state = useAnalysisStore.getState();
      expect(state.filters.searchQuery).toBe('test');
      expect(state.filters.genre).toBe('Pop');
      expect(state.filters.mood).toBe('all'); // Unchanged
    });
  });

  describe('reset', () => {
    it('should reset all state', () => {
      const { addAnalysis, setIsAnalyzing, setFilters, reset } = useAnalysisStore.getState();
      
      addAnalysis(mockAnalysis);
      setIsAnalyzing(true);
      setFilters({ searchQuery: 'test' });
      
      reset();
      
      const state = useAnalysisStore.getState();
      expect(state.analyses).toHaveLength(0);
      expect(state.isAnalyzing).toBe(false);
      expect(state.filters.searchQuery).toBe('');
    });
  });

  describe('selectors', () => {
    beforeEach(() => {
      const { setAnalyses } = useAnalysisStore.getState();
      setAnalyses([
        mockAnalysis,
        { ...mockAnalysis, id: 'test-2', fileName: 'pop-song.mp3', genre: ['Pop'], mood: ['Calm'] },
        { ...mockAnalysis, id: 'test-3', fileName: 'rock-song.mp3', genre: ['Rock'], mood: ['Energetic'] },
      ]);
    });

    describe('selectFilteredAnalyses', () => {
      it('should return all analyses when no filters', () => {
        const filtered = selectFilteredAnalyses(useAnalysisStore.getState());
        expect(filtered).toHaveLength(3);
      });

      it('should filter by search query', () => {
        useAnalysisStore.setState(state => ({
          ...state,
          filters: { ...state.filters, searchQuery: 'pop' },
        }));
        
        const filtered = selectFilteredAnalyses(useAnalysisStore.getState());
        expect(filtered).toHaveLength(1);
        expect(filtered[0].fileName).toBe('pop-song.mp3');
      });

      it('should filter by genre', () => {
        useAnalysisStore.setState(state => ({
          ...state,
          filters: { ...state.filters, genre: 'Rock' },
        }));
        
        const filtered = selectFilteredAnalyses(useAnalysisStore.getState());
        expect(filtered).toHaveLength(2); // test-1 has both Pop and Rock
      });

      it('should filter by mood', () => {
        useAnalysisStore.setState(state => ({
          ...state,
          filters: { ...state.filters, mood: 'Calm' },
        }));
        
        const filtered = selectFilteredAnalyses(useAnalysisStore.getState());
        expect(filtered).toHaveLength(1);
      });
    });

    describe('selectAllGenres', () => {
      it('should return unique genres', () => {
        const genres = selectAllGenres(useAnalysisStore.getState());
        expect(genres).toContain('Pop');
        expect(genres).toContain('Rock');
        expect(new Set(genres).size).toBe(genres.length); // All unique
      });
    });

    describe('selectAllMoods', () => {
      it('should return unique moods', () => {
        const moods = selectAllMoods(useAnalysisStore.getState());
        expect(moods).toContain('Happy');
        expect(moods).toContain('Energetic');
        expect(moods).toContain('Calm');
        expect(new Set(moods).size).toBe(moods.length); // All unique
      });
    });
  });
});
