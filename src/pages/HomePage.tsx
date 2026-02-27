import { useCallback, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { AudioAnalyzer } from '@/components/AudioAnalyzer';
import { AnalysisResults } from '@/components/AnalysisResults';
import { CollectionDashboard } from '@/components/CollectionDashboard';
import { BulkExportModal } from '@/components/BulkExportModal';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAnalysisStore } from '@/store/analysisStore';
import { useSupabaseAPI } from '@/hooks/useSupabaseAPI';
import {
  APP_NAME,
  MAX_FILE_SIZE_BYTES,
  SUPPORTED_AUDIO_TYPES,
  UPLOAD_PROGRESS_STEPS,
  UPLOAD_PROGRESS_DELAY_MS,
} from '@/config/constants';
import {
  getActiveDatabaseConfig,
  getRuntimeApiConfig,
  saveRuntimeApiConfig,
  resetRuntimeApiConfig,
  type DatabaseMode,
  type LyricsAIProvider,
} from '@/config/api';
import { logger } from '@/utils/logger';
import type { SongAnalysis } from '@/types';
import {
  Upload,
  Music,
  FolderOpen,
  History,
  Save,
  Search,
  BarChart3,
  Database,
  Calendar,
  Trash2,
  Zap,
  Settings,
} from 'lucide-react';

const log = logger.scope('HomePage');

export function HomePage() {
  // Use shallow for object equality to prevent re-renders
  const {
    analyses,
    files,
    isAnalyzing,
    isUploading,
    uploadProgress,
    activeTab,
    filters,
    isLoadingHistory,
    isSaving,
  } = useAnalysisStore(useShallow((state) => ({
    analyses: state.analyses,
    files: state.files,
    isAnalyzing: state.isAnalyzing,
    isUploading: state.isUploading,
    uploadProgress: state.uploadProgress,
    activeTab: state.activeTab,
    filters: state.filters,
    isLoadingHistory: state.isLoadingHistory,
    isSaving: state.isSaving,
  })));

  // Get actions separately (they don't change)
  const setAnalyses = useAnalysisStore((state) => state.setAnalyses);
  const addAnalysis = useAnalysisStore((state) => state.addAnalysis);
  const removeAnalysis = useAnalysisStore((state) => state.removeAnalysis);
  const clearAnalyses = useAnalysisStore((state) => state.clearAnalyses);
  const addFiles = useAnalysisStore((state) => state.addFiles);
  const setIsAnalyzing = useAnalysisStore((state) => state.setIsAnalyzing);
  const setIsUploading = useAnalysisStore((state) => state.setIsUploading);
  const setUploadProgress = useAnalysisStore((state) => state.setUploadProgress);
  const setCurrentFile = useAnalysisStore((state) => state.setCurrentFile);
  const setActiveTab = useAnalysisStore((state) => state.setActiveTab);
  const setFilters = useAnalysisStore((state) => state.setFilters);
  const setIsLoadingHistory = useAnalysisStore((state) => state.setIsLoadingHistory);
  const setIsSaving = useAnalysisStore((state) => state.setIsSaving);
  const reset = useAnalysisStore((state) => state.reset);

  // Compute filtered/derived data with useMemo to avoid new references
  const filteredAnalyses = useMemo(() => {
    return analyses.filter((analysis) => {
      const matchesSearch =
        analysis.fileName.toLowerCase().includes(filters.searchQuery.toLowerCase()) ||
        analysis.lyrics.toLowerCase().includes(filters.searchQuery.toLowerCase());
      const matchesGenre = filters.genre === 'all' || analysis.genre.includes(filters.genre);
      const matchesMood = filters.mood === 'all' || analysis.mood.includes(filters.mood);
      return matchesSearch && matchesGenre && matchesMood;
    });
  }, [analyses, filters.searchQuery, filters.genre, filters.mood]);

  const allGenres = useMemo(() => {
    return Array.from(new Set(analyses.flatMap((a) => a.genre)));
  }, [analyses]);

  const allMoods = useMemo(() => {
    return Array.from(new Set(analyses.flatMap((a) => a.mood)));
  }, [analyses]);

  const {
    saveAnalyses,
    loadAnalyses,
    deleteAnalysis,
    runMaintenance,
    deduplicateAnalyses,
    removeNoHashAnalyses,
    isLoading: apiLoading,
  } = useSupabaseAPI();

  const [isRunningMaintenance, setIsRunningMaintenance] = useState(false);
  const [isDeduplicating, setIsDeduplicating] = useState(false);
  const [isRemovingNoHash, setIsRemovingNoHash] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string | null }>({
    isOpen: false,
    id: null,
  });
  const [isGeneratingTitles, setIsGeneratingTitles] = useState(false);
  const [isBulkExportOpen, setIsBulkExportOpen] = useState(false);

  const initialRuntimeConfig = useMemo(() => getRuntimeApiConfig(), []);
  const [showDeploymentSettings, setShowDeploymentSettings] = useState(false);
  const [databaseMode, setDatabaseMode] = useState<DatabaseMode>(initialRuntimeConfig.databaseMode);
  const [customProjectId, setCustomProjectId] = useState(initialRuntimeConfig.customProjectId);
  const [customAnonKey, setCustomAnonKey] = useState(initialRuntimeConfig.customAnonKey);
  const [serverFunctionPath, setServerFunctionPath] = useState(initialRuntimeConfig.serverFunctionPath);
  const [lyricsAiProvider, setLyricsAiProvider] = useState<LyricsAIProvider>(initialRuntimeConfig.lyricsAiProvider);
  const [settingsMessage, setSettingsMessage] = useState('');

  const customReady = customProjectId.trim().length > 0 && customAnonKey.trim().length > 0;
  const previewServerFunctionPath = serverFunctionPath.trim() || 'make-server-473d7342';
  const previewProjectId =
    databaseMode === 'custom' && customReady
      ? customProjectId.trim()
      : 'pznmptudgicrmljjafex';
  const previewModeLabel =
    databaseMode === 'custom'
      ? (customReady ? 'Custom database active' : 'Custom selected but incomplete (fallback to OG)')
      : 'OG th3scr1b3 database active';
  const previewEdgeUrl = `https://${previewProjectId}.supabase.co/functions/v1/${previewServerFunctionPath}`;

  const handleSaveDeploymentSettings = () => {
    const saved = saveRuntimeApiConfig({
      databaseMode,
      customProjectId: customProjectId.trim(),
      customAnonKey: customAnonKey.trim(),
      serverFunctionPath: previewServerFunctionPath,
      lyricsAiProvider,
    });

    const active = getActiveDatabaseConfig();
    setDatabaseMode(saved.databaseMode);
    setCustomProjectId(saved.customProjectId);
    setCustomAnonKey(saved.customAnonKey);
    setServerFunctionPath(saved.serverFunctionPath);
    setLyricsAiProvider(saved.lyricsAiProvider);

    setSettingsMessage(
      active.mode === 'custom'
        ? 'Saved. Using your custom database and current provider settings.'
        : 'Saved. Using OG database (custom mode needs project ID + anon key).'
    );
  };

  const handleResetDeploymentSettings = () => {
    const resetConfig = resetRuntimeApiConfig();
    setDatabaseMode(resetConfig.databaseMode);
    setCustomProjectId(resetConfig.customProjectId);
    setCustomAnonKey(resetConfig.customAnonKey);
    setServerFunctionPath(resetConfig.serverFunctionPath);
    setLyricsAiProvider(resetConfig.lyricsAiProvider);
    setSettingsMessage('Reset to default runtime settings.');
  };

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  const dropZoneRef = useRef<HTMLLabelElement>(null);

  // Handle file selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processFiles(Array.from(e.target.files));
    }
  };

  const handleDirectorySelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processFiles(Array.from(e.target.files));
    }
  };

  const processFiles = async (allFiles: File[]) => {
    const selectedFiles = allFiles.filter(file => {
      // Skip macOS system files (resource forks and metadata)
      const fileName = file.name;
      if (fileName.startsWith('._') || fileName === '.DS_Store' || fileName.startsWith('__MACOSX')) {
        console.log(`Skipping macOS system file: ${fileName}`);
        return false;
      }

      // Check if it's actually an audio file
      const isAudio = file.type.startsWith('audio/') ||
        SUPPORTED_AUDIO_TYPES.some(ext => fileName.toLowerCase().endsWith(ext));
      return isAudio;
    });

    if (selectedFiles.length === 0) {
      alert('Please select valid MP3 or WAV files');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    const totalFiles = selectedFiles.length;
    const loadedFiles: File[] = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];

      await new Promise<void>(resolve => {
        const increment = 100 / totalFiles;
        let currentStep = 0;

        const interval = setInterval(() => {
          currentStep++;
          const baseProgress = (i / totalFiles) * 100;
          const fileProgress = (currentStep / UPLOAD_PROGRESS_STEPS) * increment;
          setUploadProgress(Math.min(baseProgress + fileProgress, 100));

          if (currentStep >= UPLOAD_PROGRESS_STEPS) {
            clearInterval(interval);
            loadedFiles.push(file!);
            resolve();
          }
        }, UPLOAD_PROGRESS_DELAY_MS);
      });
    }

    setUploadProgress(100);
    setTimeout(() => {
      addFiles(loadedFiles);
      setIsUploading(false);
      setUploadProgress(0);

      const largeFiles = loadedFiles.filter(f => f.size > MAX_FILE_SIZE_BYTES);
      if (largeFiles.length > 0) {
        log.warn(`Large files detected: ${largeFiles.map(f => f.name).join(', ')}`);
      }
    }, 300);
  };

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === dropZoneRef.current) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      await processFiles(droppedFiles);
    }
  }, []);

  const handleAnalysisComplete = (analysis: SongAnalysis) => {
    addAnalysis(analysis);
  };

  const handleAllAnalysesComplete = () => {
    setIsAnalyzing(false);
    setCurrentFile('');
  };

  const startAnalysis = () => {
    if (files.length === 0) return;
    setIsAnalyzing(true);
    clearAnalyses();
  };

  const downloadResults = () => {
    setIsBulkExportOpen(true);
  };

  const clearAll = () => {
    reset();
  };

  const handleSaveAnalyses = async () => {
    if (analyses.length === 0) {
      alert('No analyses to save');
      return;
    }

    // Check if any analyses have audio that can be uploaded
    const analysesWithAudio = analyses.filter(a => a.audioUrl?.startsWith('blob:') && !a.storedAudioUrl);

    let uploadAudioFiles = false;
    if (analysesWithAudio.length > 0) {
      uploadAudioFiles = confirm(
        `${analysesWithAudio.length} song(s) have audio that can be saved for playback later.\n\n` +
        `Would you like to upload the audio files? (This allows playback when you load saved analyses)\n\n` +
        `Note: This may take a while for large files.`
      );
    }

    setIsSaving(true);
    const result = await saveAnalyses(analyses, { uploadAudioFiles });
    setIsSaving(false);

    if (result) {
      const audioMsg = uploadAudioFiles ? ' with audio files' : '';
      alert(`Successfully saved ${result.saved} analyses${audioMsg} to permanent storage!`);
    } else {
      alert('Failed to save analyses');
    }
  };

  const handleLoadHistory = async () => {
    setIsLoadingHistory(true);
    const loadedAnalyses = await loadAnalyses();
    setIsLoadingHistory(false);

    if (loadedAnalyses.length === 0) {
      alert('No saved analyses found');
    } else {
      setAnalyses(loadedAnalyses);
      alert(`Loaded ${loadedAnalyses.length} saved analyses`);
    }
  };

  const handleDeleteAnalysis = async (id: string) => {
    setDeleteConfirm({ isOpen: true, id });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm.id) return;

    const success = await deleteAnalysis(deleteConfirm.id);
    if (success) {
      removeAnalysis(deleteConfirm.id);
    }
    setDeleteConfirm({ isOpen: false, id: null });
  };

  const handleRunMaintenance = async () => {
    if (!confirm('This will rebuild the database index and fix any missing links. Continue?')) {
      return;
    }

    setIsRunningMaintenance(true);
    const stats = await runMaintenance();
    setIsRunningMaintenance(false);

    if (stats) {
      alert(
        `Database maintenance complete!\n\n` +
        `Total analyses: ${stats.totalAnalyses}\n` +
        `Index entries before: ${stats.indexBefore}\n` +
        `Index entries after: ${stats.indexAfter}\n\n` +
        `Orphaned entries removed: ${stats.orphanedIndexEntries}\n` +
        `Missing entries added: ${stats.missingIndexEntries}`
      );
    }
  };

  const handleDeduplicate = async () => {
    if (!confirm('This will scan the database and remove duplicate analyses (keeping the best version with timestamped lyrics). Continue?')) {
      return;
    }

    setIsDeduplicating(true);
    const stats = await deduplicateAnalyses();
    setIsDeduplicating(false);

    if (stats) {
      alert(
        `Deduplication complete!\n\n` +
        `Scanned: ${stats.scanned} analyses\n` +
        `Duplicates removed: ${stats.duplicatesRemoved}\n` +
        `Unique files remaining: ${stats.uniqueFiles}\n\n` +
        `Files with hash: ${stats.byHash}\n` +
        `Files without hash: ${stats.withoutHash}`
      );
      // Reload the analyses to reflect changes
      if (stats.duplicatesRemoved > 0) {
        const loadedAnalyses = await loadAnalyses();
        setAnalyses(loadedAnalyses);
      }
    }
  };

  const handleRemoveNoHash = async () => {
    if (!confirm('This will permanently delete all analyses that do not have a file hash (legacy/incomplete entries). Continue?')) {
      return;
    }

    setIsRemovingNoHash(true);
    const stats = await removeNoHashAnalyses();
    setIsRemovingNoHash(false);

    if (stats) {
      alert(
        `Remove no-hash complete!\n\n` +
        `Removed: ${stats.removed} analyses without hash\n` +
        `Remaining: ${stats.remaining} valid analyses`
      );
      // Reload the analyses to reflect changes
      if (stats.removed > 0) {
        const loadedAnalyses = await loadAnalyses();
        setAnalyses(loadedAnalyses);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Music className="w-12 h-12 text-purple-300" aria-hidden="true" />
            <h1 className="text-white">{APP_NAME}</h1>
          </div>
          <p className="text-purple-200">
            365 Days of Light and Dark by th3scr1b3 - Tool Drop - Multi Level Song Analyser
          </p>

          {/* Action Buttons */}
          <div className="mt-4 flex gap-3 justify-center flex-wrap">
            <button
              onClick={handleLoadHistory}
              disabled={isLoadingHistory}
              className="px-6 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              aria-busy={isLoadingHistory}
            >
              <History className="w-5 h-5" aria-hidden="true" />
              {isLoadingHistory ? 'Loading...' : 'Load Saved Analyses'}
            </button>

            <button
              onClick={handleRunMaintenance}
              disabled={isRunningMaintenance}
              className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              aria-busy={isRunningMaintenance}
            >
              <Database className="w-5 h-5" aria-hidden="true" />
              {isRunningMaintenance ? 'Running...' : 'DB Maintenance'}
            </button>

            <button
              onClick={handleDeduplicate}
              disabled={isDeduplicating}
              className="px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              aria-busy={isDeduplicating}
            >
              <Trash2 className="w-5 h-5" aria-hidden="true" />
              {isDeduplicating ? 'Scanning...' : 'Remove Duplicates'}
            </button>

            <button
              onClick={handleRemoveNoHash}
              disabled={isRemovingNoHash}
              className="px-6 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              aria-busy={isRemovingNoHash}
            >
              <Trash2 className="w-5 h-5" aria-hidden="true" />
              {isRemovingNoHash ? 'Removing...' : 'Remove No-Hash'}
            </button>

            <Link
              to="/scheduler"
              className="px-6 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors flex items-center gap-2"
            >
              <Calendar className="w-5 h-5" aria-hidden="true" />
              365 Days Scheduler
            </Link>

            {(import.meta as any).env.DEV && (
              <Link
                to="/original"
                className="px-6 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors flex items-center gap-2"
              >
                <Music className="w-5 h-5" aria-hidden="true" />
                Original Analyzer
              </Link>
            )}

            <button
              onClick={() => setShowDeploymentSettings((prev) => !prev)}
              className="px-6 py-2 bg-slate-500 text-white rounded-lg hover:bg-slate-600 transition-colors flex items-center gap-2"
              type="button"
            >
              <Settings className="w-5 h-5" aria-hidden="true" />
              {showDeploymentSettings ? 'Hide Settings' : 'Deployment Settings'}
            </button>
          </div>

          {showDeploymentSettings && (
            <div className="mt-6 max-w-4xl mx-auto text-left bg-slate-900/40 border border-slate-500/30 rounded-xl p-5">
              <h3 className="text-white mb-3">Deployment And Provider Settings</h3>
              <p className="text-slate-200 text-sm mb-4">
                Use OG mode to load th3scr1b3&apos;s database, or switch to Custom mode for a buyer-owned database.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-200 text-sm mb-1">Database Mode</label>
                  <select
                    value={databaseMode}
                    onChange={(e) => setDatabaseMode(e.target.value as DatabaseMode)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white"
                  >
                    <option value="og">OG Database (th3scr1b3)</option>
                    <option value="custom">Your Own Database</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-200 text-sm mb-1">Lyrics AI Provider</label>
                  <select
                    value={lyricsAiProvider}
                    onChange={(e) => setLyricsAiProvider(e.target.value as LyricsAIProvider)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white"
                  >
                    <option value="local">Local (rule-based)</option>
                    <option value="openai">OpenAI</option>
                    <option value="claude">Claude</option>
                    <option value="grok">Grok</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-slate-200 text-sm mb-1">Edge Function Path</label>
                  <input
                    value={serverFunctionPath}
                    onChange={(e) => setServerFunctionPath(e.target.value)}
                    placeholder="make-server-473d7342"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white"
                  />
                </div>

                {databaseMode === 'custom' && (
                  <>
                    <div>
                      <label className="block text-slate-200 text-sm mb-1">Custom Supabase Project ID</label>
                      <input
                        value={customProjectId}
                        onChange={(e) => setCustomProjectId(e.target.value)}
                        placeholder="your-project-id"
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-200 text-sm mb-1">Custom Supabase Anon Key</label>
                      <input
                        value={customAnonKey}
                        onChange={(e) => setCustomAnonKey(e.target.value)}
                        placeholder="eyJhbGci..."
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white"
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="mt-4 bg-slate-950/50 border border-slate-700 rounded-lg p-3">
                <p className="text-slate-300 text-sm">{previewModeLabel}</p>
                <p className="text-slate-400 text-xs mt-1 break-all">
                  Active Edge URL: <span className="font-mono">{previewEdgeUrl}</span>
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  onClick={handleSaveDeploymentSettings}
                  className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
                  type="button"
                >
                  Save Settings
                </button>
                <button
                  onClick={handleResetDeploymentSettings}
                  className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
                  type="button"
                >
                  Reset To Defaults
                </button>
              </div>

              {settingsMessage && <p className="text-emerald-300 text-sm mt-3">{settingsMessage}</p>}
            </div>
          )}
        </div>

        {/* Upload Section */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 mb-8 border border-white/20">
          <div className="flex flex-col items-center justify-center">
            <label
              ref={dropZoneRef}
              htmlFor="file-upload"
              className={`cursor-pointer flex flex-col items-center justify-center w-full p-12 border-2 border-dashed rounded-xl transition-colors bg-white/5 ${isUploading ? 'pointer-events-none opacity-50' : ''
                } ${isDragging ? 'border-purple-400 bg-purple-500/10' : 'border-purple-300 hover:border-purple-400'}`}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              role="button"
              tabIndex={0}
              aria-label="Upload audio files"
            >
              <Upload className="w-16 h-16 text-purple-300 mb-4" aria-hidden="true" />
              <span className="text-purple-100 mb-2">
                {isDragging ? 'Drop files here' : 'Click to upload or drag and drop'}
              </span>
              <span className="text-purple-300 text-sm">
                MP3 or WAV files (multiple files supported)
              </span>
              <input
                id="file-upload"
                type="file"
                multiple
                accept=".mp3,.wav,audio/mpeg,audio/wav"
                onChange={handleFileChange}
                className="hidden"
                disabled={isUploading}
                aria-describedby="file-upload-description"
              />
            </label>

            {/* Directory Upload */}
            <div className="mt-4 w-full">
              <label
                htmlFor="folder-upload"
                className={`cursor-pointer flex items-center justify-center w-full p-4 border-2 border-dashed border-blue-300 rounded-xl hover:border-blue-400 transition-colors bg-blue-500/5 ${isUploading ? 'pointer-events-none opacity-50' : ''
                  }`}
              >
                <FolderOpen className="w-6 h-6 text-blue-300 mr-2" aria-hidden="true" />
                <span className="text-blue-100">
                  Or select a folder to scan for audio files
                </span>
                <input
                  id="folder-upload"
                  type="file"
                  multiple
                  // @ts-expect-error - webkitdirectory is not in TypeScript types
                  webkitdirectory="true"
                  directory="true"
                  onChange={handleDirectorySelect}
                  className="hidden"
                  disabled={isUploading}
                />
              </label>
            </div>

            {/* Upload Progress */}
            {isUploading && (
              <div className="mt-6 w-full" role="progressbar" aria-valuenow={uploadProgress} aria-valuemin={0} aria-valuemax={100}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-purple-100">Uploading files...</span>
                  <span className="text-purple-300">{uploadProgress.toFixed(0)}%</span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-green-500 to-blue-500 h-full transition-all duration-300 rounded-full"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Selected Files */}
            {files.length > 0 && (
              <div className="mt-6 w-full">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-purple-100">
                    {files.length} file{files.length !== 1 ? 's' : ''} selected
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={clearAll}
                      className="px-4 py-2 bg-red-500/20 text-red-200 rounded-lg hover:bg-red-500/30 transition-colors"
                    >
                      Clear All
                    </button>
                    <button
                      onClick={startAnalysis}
                      disabled={isAnalyzing}
                      className="px-6 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isAnalyzing ? 'Analyzing...' : 'Start Analysis'}
                    </button>
                  </div>
                </div>

                {/* Large file warning */}
                {files.some(f => f.size > MAX_FILE_SIZE_BYTES) && (
                  <div className="bg-yellow-500/10 border border-yellow-400/30 rounded-lg p-3 mb-4" role="alert">
                    <p className="text-yellow-200 text-sm">
                      ⚠️ Some files exceed 25MB and will be automatically compressed for transcription.
                    </p>
                  </div>
                )}

                <div className="bg-white/5 rounded-lg p-4 max-h-40 overflow-y-auto">
                  {files.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between py-2 px-3 mb-2 bg-white/5 rounded"
                    >
                      <div className="flex items-center gap-3">
                        <Music className="w-4 h-4 text-purple-300" aria-hidden="true" />
                        <span className="text-purple-100">{file.name}</span>
                        {file.size > MAX_FILE_SIZE_BYTES && (
                          <span className="text-yellow-400 text-xs px-2 py-0.5 bg-yellow-500/20 rounded">
                            Will compress
                          </span>
                        )}
                      </div>
                      <span className="text-purple-300 text-sm">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Analysis Progress */}
        {isAnalyzing && (
          <ErrorBoundary>
            <AudioAnalyzer
              files={files}
              onAnalysisComplete={handleAnalysisComplete}
              onAllComplete={handleAllAnalysesComplete}
              onCurrentFileChange={setCurrentFile}
            />
          </ErrorBoundary>
        )}

        {/* Results Section */}
        {analyses.length > 0 && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 mb-8">
            {/* Header with Actions */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-white">Your Music Library</h2>
              <div className="flex gap-3">
                <button
                  onClick={handleSaveAnalyses}
                  disabled={isSaving}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Save className="w-4 h-4" aria-hidden="true" />
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={downloadResults}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                >
                  Download JSON
                </button>
              </div>
            </div>

            {/* Search and Filter */}
            <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative md:col-span-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-purple-300" aria-hidden="true" />
                <input
                  type="text"
                  placeholder="Search by file name or lyrics..."
                  value={filters.searchQuery}
                  onChange={(e) => setFilters({ searchQuery: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:border-purple-400"
                  aria-label="Search analyses"
                />
              </div>

              <select
                value={filters.genre}
                onChange={(e) => setFilters({ genre: e.target.value })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-purple-400 appearance-none cursor-pointer"
                aria-label="Filter by genre"
              >
                <option value="all" className="bg-gray-800">All Genres</option>
                {allGenres.map(genre => (
                  <option key={genre} value={genre} className="bg-gray-800">{genre}</option>
                ))}
              </select>

              <select
                value={filters.mood}
                onChange={(e) => setFilters({ mood: e.target.value })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-purple-400 appearance-none cursor-pointer"
                aria-label="Filter by mood"
              >
                <option value="all" className="bg-gray-800">All Moods</option>
                {allMoods.map(mood => (
                  <option key={mood} value={mood} className="bg-gray-800">{mood}</option>
                ))}
              </select>
            </div>

            {/* Results Count */}
            <div className="mb-4">
              <p className="text-purple-200 text-sm">
                Showing {filteredAnalyses.length} of {analyses.length} analyses
              </p>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 border-b border-white/10" role="tablist">
              <button
                onClick={() => setActiveTab('results')}
                className={`px-6 py-3 transition-colors ${activeTab === 'results'
                  ? 'text-white border-b-2 border-purple-400'
                  : 'text-purple-300 hover:text-white'
                  }`}
                role="tab"
                aria-selected={activeTab === 'results'}
              >
                <div className="flex items-center gap-2">
                  <Music className="w-4 h-4" aria-hidden="true" />
                  <span>Detailed Results</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('collection')}
                className={`px-6 py-3 transition-colors ${activeTab === 'collection'
                  ? 'text-white border-b-2 border-purple-400'
                  : 'text-purple-300 hover:text-white'
                  }`}
                role="tab"
                aria-selected={activeTab === 'collection'}
              >
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" aria-hidden="true" />
                  <span>Collection Dashboard</span>
                </div>
              </button>
            </div>

            {/* Tab Content */}
            <ErrorBoundary>
              {activeTab === 'results' && (
                <AnalysisResults
                  analyses={filteredAnalyses}
                  onDelete={handleDeleteAnalysis}
                />
              )}
              {activeTab === 'collection' && (
                <CollectionDashboard analyses={filteredAnalyses} />
              )}
            </ErrorBoundary>
          </div>
        )}

        {/* Info Note — Glass Feature Cards */}
        {!isAnalyzing && analyses.length === 0 && files.length === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { icon: <Upload className="w-6 h-6" />, title: 'Upload Audio', desc: 'Drop one or multiple MP3/WAV files — batch scanning supported.' },
              { icon: <Zap className="w-6 h-6" />, title: 'Real-Time Analysis', desc: 'Web Audio API extracts tempo, key, energy, mood, and more.' },
              { icon: <Music className="w-6 h-6" />, title: 'Lyrics Transcription', desc: 'Local Whisper or switch to OpenAI, Claude, or Grok providers.' },
              { icon: <Database className="w-6 h-6" />, title: 'Save & Export', desc: 'Save to OG or custom database. Download results as JSON anytime.' },
            ].map((card, i) => (
              <div
                key={card.title}
                className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-xl p-5 flex gap-4 items-start"
                style={{ animation: `fadeSlideUp 0.4s ease-out ${i * 0.08}s both` }}
              >
                <div className="text-purple-300 shrink-0 mt-0.5">{card.icon}</div>
                <div>
                  <h4 className="text-white mb-1">{card.title}</h4>
                  <p className="text-purple-200 text-sm" style={{ lineHeight: 1.5 }}>{card.desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer with Generate Titles Button */}
        <div className="mt-12 pt-8 border-t border-white/20 flex justify-center">
          <button
            onClick={() => setIsGeneratingTitles(true)}
            disabled={isGeneratingTitles}
            className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Zap className="w-5 h-5" aria-hidden="true" />
            {isGeneratingTitles ? 'Generating...' : 'Generate Titles'}
          </button>
        </div>

        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          isOpen={deleteConfirm.isOpen}
          onClose={() => setDeleteConfirm({ isOpen: false, id: null })}
          onConfirm={confirmDelete}
          title="Delete Analysis"
          message="Are you sure you want to delete this analysis? This action cannot be undone."
          confirmText="Delete"
          cancelText="Cancel"
          variant="danger"
          isLoading={apiLoading}
        />

        {/* Bulk Export Modal */}
        <BulkExportModal
          isOpen={isBulkExportOpen}
          onClose={() => setIsBulkExportOpen(false)}
          analyses={analyses}
        />
      </div>
    </div>
  );
}

export default HomePage;
