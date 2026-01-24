import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { SongAnalysis, ActiveTab, FilterState } from '@/types';

interface AnalysisStoreState {
  // Analysis data
  analyses: SongAnalysis[];
  files: File[];
  
  // UI state
  isAnalyzing: boolean;
  isUploading: boolean;
  uploadProgress: number;
  currentFile: string;
  activeTab: ActiveTab;
  filters: FilterState;
  isLoadingHistory: boolean;
  isSaving: boolean;
  
  // Blob URL tracking for cleanup
  blobUrls: string[];
}

interface AnalysisStoreActions {
  // Analyses
  setAnalyses: (analyses: SongAnalysis[]) => void;
  addAnalysis: (analysis: SongAnalysis) => void;
  removeAnalysis: (id: string) => void;
  clearAnalyses: () => void;
  
  // Files
  setFiles: (files: File[]) => void;
  addFiles: (files: File[]) => void;
  clearFiles: () => void;
  
  // UI state
  setIsAnalyzing: (value: boolean) => void;
  setIsUploading: (value: boolean) => void;
  setUploadProgress: (value: number) => void;
  setCurrentFile: (value: string) => void;
  setActiveTab: (tab: ActiveTab) => void;
  setFilters: (filters: Partial<FilterState>) => void;
  setIsLoadingHistory: (value: boolean) => void;
  setIsSaving: (value: boolean) => void;
  
  // Blob URL management
  trackBlobUrl: (url: string) => void;
  revokeBlobUrls: () => void;
  
  // Reset
  reset: () => void;
}

type AnalysisStore = AnalysisStoreState & AnalysisStoreActions;

const initialState: AnalysisStoreState = {
  analyses: [],
  files: [],
  isAnalyzing: false,
  isUploading: false,
  uploadProgress: 0,
  currentFile: '',
  activeTab: 'results',
  filters: {
    searchQuery: '',
    genre: 'all',
    mood: 'all',
  },
  isLoadingHistory: false,
  isSaving: false,
  blobUrls: [],
};

export const useAnalysisStore = create<AnalysisStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      // Analyses actions
      setAnalyses: (analyses) => set({ analyses }, false, 'setAnalyses'),
      
      addAnalysis: (analysis) => {
        // Track blob URL if present
        if (analysis.audioUrl) {
          get().trackBlobUrl(analysis.audioUrl);
        }
        set(
          (state) => {
            // Check if analysis with same ID already exists to prevent duplicates
            const existingIndex = state.analyses.findIndex(a => a.id === analysis.id);
            if (existingIndex >= 0) {
              // Replace existing analysis (update with new data/audioUrl)
              const updated = [...state.analyses];
              updated[existingIndex] = analysis;
              return { analyses: updated };
            }
            // Also check by fileHash if available to catch duplicates with different IDs
            if (analysis.fileHash) {
              const hashDuplicateIndex = state.analyses.findIndex(
                a => a.fileHash && a.fileHash === analysis.fileHash
              );
              if (hashDuplicateIndex >= 0) {
                // Replace the existing analysis with same hash
                const updated = [...state.analyses];
                updated[hashDuplicateIndex] = analysis;
                return { analyses: updated };
              }
            }
            return { analyses: [...state.analyses, analysis] };
          },
          false,
          'addAnalysis'
        );
      },
      
      removeAnalysis: (id) => {
        const analysis = get().analyses.find(a => a.id === id);
        // Revoke blob URL if present
        if (analysis?.audioUrl) {
          URL.revokeObjectURL(analysis.audioUrl);
        }
        set(
          (state) => ({
            analyses: state.analyses.filter((a) => a.id !== id),
            blobUrls: state.blobUrls.filter(url => url !== analysis?.audioUrl),
          }),
          false,
          'removeAnalysis'
        );
      },
      
      clearAnalyses: () => {
        // Revoke all blob URLs
        get().revokeBlobUrls();
        set({ analyses: [], blobUrls: [] }, false, 'clearAnalyses');
      },

      // Files actions
      setFiles: (files) => set({ files }, false, 'setFiles'),
      
      addFiles: (files) =>
        set(
          (state) => ({ files: [...state.files, ...files] }),
          false,
          'addFiles'
        ),
      
      clearFiles: () => set({ files: [] }, false, 'clearFiles'),

      // UI state actions
      setIsAnalyzing: (isAnalyzing) => set({ isAnalyzing }, false, 'setIsAnalyzing'),
      setIsUploading: (isUploading) => set({ isUploading }, false, 'setIsUploading'),
      setUploadProgress: (uploadProgress) => set({ uploadProgress }, false, 'setUploadProgress'),
      setCurrentFile: (currentFile) => set({ currentFile }, false, 'setCurrentFile'),
      setActiveTab: (activeTab) => set({ activeTab }, false, 'setActiveTab'),
      
      setFilters: (filters) =>
        set(
          (state) => ({ filters: { ...state.filters, ...filters } }),
          false,
          'setFilters'
        ),
      
      setIsLoadingHistory: (isLoadingHistory) => set({ isLoadingHistory }, false, 'setIsLoadingHistory'),
      setIsSaving: (isSaving) => set({ isSaving }, false, 'setIsSaving'),

      // Blob URL management
      trackBlobUrl: (url) =>
        set(
          (state) => ({ blobUrls: [...state.blobUrls, url] }),
          false,
          'trackBlobUrl'
        ),
      
      revokeBlobUrls: () => {
        const { blobUrls } = get();
        blobUrls.forEach(url => {
          try {
            URL.revokeObjectURL(url);
          } catch {
            // Ignore errors for already-revoked URLs
          }
        });
        set({ blobUrls: [] }, false, 'revokeBlobUrls');
      },

      // Reset
      reset: () => {
        get().revokeBlobUrls();
        set(initialState, false, 'reset');
      },
    }),
    { name: 'analysis-store' }
  )
);

// Selectors
export const selectAnalyses = (state: AnalysisStore) => state.analyses;
export const selectFiles = (state: AnalysisStore) => state.files;
export const selectIsAnalyzing = (state: AnalysisStore) => state.isAnalyzing;
export const selectActiveTab = (state: AnalysisStore) => state.activeTab;
export const selectFilters = (state: AnalysisStore) => state.filters;

export const selectFilteredAnalyses = (state: AnalysisStore) => {
  const { analyses, filters } = state;
  
  return analyses.filter((analysis) => {
    const matchesSearch =
      analysis.fileName.toLowerCase().includes(filters.searchQuery.toLowerCase()) ||
      analysis.lyrics.toLowerCase().includes(filters.searchQuery.toLowerCase());
    
    const matchesGenre =
      filters.genre === 'all' || analysis.genre.includes(filters.genre);
    
    const matchesMood =
      filters.mood === 'all' || analysis.mood.includes(filters.mood);
    
    return matchesSearch && matchesGenre && matchesMood;
  });
};

export const selectAllGenres = (state: AnalysisStore) => {
  return Array.from(new Set(state.analyses.flatMap((a) => a.genre)));
};

export const selectAllMoods = (state: AnalysisStore) => {
  return Array.from(new Set(state.analyses.flatMap((a) => a.mood)));
};
