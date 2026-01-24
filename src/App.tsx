import { useState } from 'react';
import { AudioAnalyzer } from './components/AudioAnalyzer';
import { AnalysisResults } from './components/AnalysisResults';
import { CollectionDashboard } from './components/CollectionDashboard';
import { Upload, Music, FolderOpen, History, Save, Search, BarChart3, Database, Settings, Zap } from 'lucide-react';

export interface LyricsAnalysis {
  mood: string[];
  emotion: string[];
  themes: string[];
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  sentimentScore: number;
  energyFromLyrics: number;
  valenceFromLyrics: number;
}

export interface LyricSegment {
  start: number; // seconds
  end: number;   // seconds
  text: string;
}

export interface LyricWord {
  start: number; // seconds
  end: number;   // seconds
  word: string;
}

export interface SongAnalysis {
  id: string;
  fileName: string;
  fileSize: number;
  duration: number;
  tempo: number;
  key: string;
  energy: number;
  danceability: number;
  valence: number;
  acousticness: number;
  instrumentalness: number;
  loudness: number;
  speechiness: number;
  liveness: number;
  timeSignature: string;
  genre: string[];
  mood: string[];
  lyrics: string;
  lyricsSegments?: LyricSegment[]; // optional timestamped segments from Whisper
  lyricsWords?: LyricWord[]; // optional raw word timestamps
  lyricsAnalysis?: LyricsAnalysis;
  waveformData: number[];
  analyzedAt: string;
  // Session-only URL for playback (blob: URL). Do not persist to DB.
  audioUrl?: string;
}

export default function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [analyses, setAnalyses] = useState<SongAnalysis[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentFile, setCurrentFile] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [savedAnalyses, setSavedAnalyses] = useState<SongAnalysis[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [activeTab, setActiveTab] = useState<'results' | 'collection'>('results');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterGenre, setFilterGenre] = useState<string>('all');
  const [filterMood, setFilterMood] = useState<string>('all');
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [isRunningMaintenance, setIsRunningMaintenance] = useState(false);
  const [maintenanceStats, setMaintenanceStats] = useState<any>(null);
  const [isGeneratingTitles, setIsGeneratingTitles] = useState(false);

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
    // Accept all audio files, not just strict mime types
    const selectedFiles = allFiles.filter(file => {
      const isAudio = file.type.startsWith('audio/') || 
                     file.name.endsWith('.mp3') || 
                     file.name.endsWith('.wav');
      return isAudio;
    });
    
    if (selectedFiles.length === 0) {
      alert('Please select valid MP3 or WAV files');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    // Simulate upload progress for each file
    const totalFiles = selectedFiles.length;
    const loadedFiles: File[] = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      
      // Simulate reading file (you can also use FileReader for real progress)
      await new Promise<void>(resolve => {
        const increment = 100 / totalFiles;
        const steps = 20;
        const stepDelay = 30;
        let currentStep = 0;

        const interval = setInterval(() => {
          currentStep++;
          const baseProgress = (i / totalFiles) * 100;
          const fileProgress = (currentStep / steps) * increment;
          setUploadProgress(Math.min(baseProgress + fileProgress, 100));

          if (currentStep >= steps) {
            clearInterval(interval);
            loadedFiles.push(file);
            resolve();
          }
        }, stepDelay);
      });
    }

    setUploadProgress(100);
    setTimeout(() => {
      setFiles(prev => [...prev, ...loadedFiles]);
      setIsUploading(false);
      setUploadProgress(0);

      // Check for large files and warn user
      const largeFiles = loadedFiles.filter(f => f.size > 25 * 1024 * 1024);
      if (largeFiles.length > 0) {
        const largeFileNames = largeFiles.map(f => 
          `${f.name} (${(f.size / 1024 / 1024).toFixed(2)}MB)`
        ).join(', ');
        console.warn(`Large files detected: ${largeFileNames}. These will be compressed for transcription.`);
      }
    }, 300);
  };

  const handleAnalysisComplete = (analysis: SongAnalysis) => {
    setAnalyses(prev => [...prev, analysis]);
  };

  const handleAllAnalysesComplete = () => {
    setIsAnalyzing(false);
    setCurrentFile('');
  };

  const startAnalysis = () => {
    if (files.length === 0) return;
    setIsAnalyzing(true);
    setAnalyses([]);
  };

  const downloadResults = () => {
    const dataStr = JSON.stringify(analyses, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `song-analysis-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const clearAll = () => {
    setFiles([]);
    setAnalyses([]);
    setIsAnalyzing(false);
    setCurrentFile('');
    setIsUploading(false);
    setUploadProgress(0);
  };

  const saveAnalyses = async () => {
    if (analyses.length === 0) {
      alert('No analyses to save');
      return;
    }

    // Strip session-only fields before saving (e.g., audioUrl)
    const sanitized = analyses.map(({ audioUrl, ...rest }) => rest);

    setIsSaving(true);
    try {
      const { projectId, publicAnonKey } = await import('./utils/supabase/info.tsx');
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-473d7342/analyses/save`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'apikey': publicAnonKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ analyses: sanitized }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Save failed: ${response.status}`);
      }

      const data = await response.json();
      console.log('Analyses saved successfully:', data);
      alert(`Successfully saved ${data.saved} analyses to permanent storage!`);
      
      setIsSaving(false);
    } catch (error) {
      console.error('Error saving analyses:', error);
      alert(`Failed to save analyses: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsSaving(false);
    }
  };

  const loadHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const { projectId, publicAnonKey } = await import('./utils/supabase/info.tsx');
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-473d7342/analyses/load`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'apikey': publicAnonKey,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Load failed: ${response.status}`);
      }

      const data = await response.json();
      console.log('Loaded analyses from storage:', data);
      
      if (data.analyses.length === 0) {
        alert('No saved analyses found');
      } else {
        // Apply any localStorage edits to the loaded analyses
        const { applyLyricsEditsToAll } = await import('./utils/lyricsStorage');
        const analysesWithEdits = applyLyricsEditsToAll(data.analyses);
        
        setSavedAnalyses(analysesWithEdits);
        setAnalyses(analysesWithEdits);
        setShowHistory(true);
        alert(`Loaded ${data.count} saved analyses`);
      }
      
      setIsLoadingHistory(false);
    } catch (error) {
      console.error('Error loading analyses:', error);
      alert(`Failed to load analyses: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsLoadingHistory(false);
    }
  };

  // Get unique genres and moods for filter dropdowns
  const allGenres = Array.from(new Set(analyses.flatMap(a => a.genre)));
  const allMoods = Array.from(new Set(analyses.flatMap(a => a.mood)));

  const runDatabaseMaintenance = async () => {
    if (!confirm('This will rebuild the database index and fix any missing links. Continue?')) {
      return;
    }

    setIsRunningMaintenance(true);
    setMaintenanceStats(null);
    
    try {
      const { projectId, publicAnonKey } = await import('./utils/supabase/info.tsx');
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-473d7342/analyses/maintenance`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'apikey': publicAnonKey,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Maintenance failed: ${response.status}`);
      }

      const data = await response.json();
      console.log('Maintenance complete:', data);
      setMaintenanceStats(data.stats);
      alert(`Database maintenance complete!\n\nTotal analyses: ${data.stats.totalAnalyses}\nIndex entries before: ${data.stats.indexBefore}\nIndex entries after: ${data.stats.indexAfter}\n\nOrphaned entries removed: ${data.stats.orphanedIndexEntries}\nMissing entries added: ${data.stats.missingIndexEntries}`);
      
      setIsRunningMaintenance(false);
    } catch (error) {
      console.error('Error running maintenance:', error);
      alert(`Failed to run maintenance: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsRunningMaintenance(false);
    }
  };

  const batchGenerateTitles = async () => {
    if (!confirm('This will generate AI titles for all analyses. Continue?')) {
      return;
    }

    setIsGeneratingTitles(true);
    
    try {
      const { projectId, publicAnonKey } = await import('./utils/supabase/info.tsx');
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/batch-generate-titles`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || errorData.message || `Failed: ${response.status}`);
      }

      const data = await response.json();
      console.log('Title generation complete:', data);
      alert(`Title generation complete!\n\n${data.message}`);
      
      setIsGeneratingTitles(false);
    } catch (error) {
      console.error('Error generating titles:', error);
      alert(`Failed to generate titles: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsGeneratingTitles(false);
    }
  };

  // Filter analyses based on search and filters
  const filteredAnalyses = analyses.filter(analysis => {
    const matchesSearch = analysis.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         analysis.lyrics.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesGenre = filterGenre === 'all' || analysis.genre.includes(filterGenre);
    const matchesMood = filterMood === 'all' || analysis.mood.includes(filterMood);
    
    return matchesSearch && matchesGenre && matchesMood;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Music className="w-12 h-12 text-purple-300" />
            <h1 className="text-white">Song Analyzer</h1>
          </div>
          <p className="text-purple-200">
            Upload MP3 or WAV files for comprehensive audio analysis and lyrics transcription
          </p>
          
          {/* Load History Button */}
          <div className="mt-4 flex gap-3 justify-center">
            <button
              onClick={loadHistory}
              disabled={isLoadingHistory}
              className="px-6 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <History className="w-5 h-5" />
              {isLoadingHistory ? 'Loading...' : 'Load Saved Analyses'}
            </button>
            
            <button
              onClick={runDatabaseMaintenance}
              disabled={isRunningMaintenance}
              className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Database className="w-5 h-5" />
              {isRunningMaintenance ? 'Running...' : 'Database Maintenance'}
            </button>
          </div>
        </div>

        {/* Upload Section */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 mb-8 border border-white/20">
          <div className="flex flex-col items-center justify-center">
            <label
              htmlFor="file-upload"
              className={`cursor-pointer flex flex-col items-center justify-center w-full p-12 border-2 border-dashed border-purple-300 rounded-xl hover:border-purple-400 transition-colors bg-white/5 ${
                isUploading ? 'pointer-events-none opacity-50' : ''
              }`}
            >
              <Upload className="w-16 h-16 text-purple-300 mb-4" />
              <span className="text-purple-100 mb-2">
                Click to upload or drag and drop
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
              />
            </label>

            {/* Directory/Folder Upload Button */}
            <div className="mt-4 w-full">
              <label
                htmlFor="folder-upload"
                className={`cursor-pointer flex items-center justify-center w-full p-4 border-2 border-dashed border-blue-300 rounded-xl hover:border-blue-400 transition-colors bg-blue-500/5 ${
                  isUploading ? 'pointer-events-none opacity-50' : ''
                }`}
              >
                <FolderOpen className="w-6 h-6 text-blue-300 mr-2" />
                <span className="text-blue-100">
                  Or select a folder to scan for audio files
                </span>
                <input
                  id="folder-upload"
                  type="file"
                  multiple
                  /* @ts-ignore - webkitdirectory is not in TypeScript types but is widely supported */
                  webkitdirectory="true"
                  /* @ts-ignore */
                  directory="true"
                  onChange={handleDirectorySelect}
                  className="hidden"
                  disabled={isUploading}
                />
              </label>
            </div>

            {/* Upload Progress Bar */}
            {isUploading && (
              <div className="mt-6 w-full">
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
                {files.some(f => f.size > 25 * 1024 * 1024) && (
                  <div className="bg-yellow-500/10 border border-yellow-400/30 rounded-lg p-3 mb-4">
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
                        <Music className="w-4 h-4 text-purple-300" />
                        <span className="text-purple-100">{file.name}</span>
                        {file.size > 25 * 1024 * 1024 && (
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
          <AudioAnalyzer
            files={files}
            onAnalysisComplete={handleAnalysisComplete}
            onAllComplete={handleAllAnalysesComplete}
            onCurrentFileChange={setCurrentFile}
          />
        )}

        {/* Results Section */}
        {analyses.length > 0 && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 mb-8">
            {/* Header with Actions */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-white">Your Music Library</h2>
              <div className="flex gap-3">
                <button
                  onClick={saveAnalyses}
                  disabled={isSaving}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
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

            {/* Search and Filter Bar */}
            <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Search Input */}
              <div className="relative md:col-span-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-purple-300" />
                <input
                  type="text"
                  placeholder="Search by file name or lyrics..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:border-purple-400"
                />
              </div>

              {/* Genre Filter */}
              <div className="relative">
                <select
                  value={filterGenre}
                  onChange={(e) => setFilterGenre(e.target.value)}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-purple-400 appearance-none cursor-pointer"
                >
                  <option value="all" className="bg-gray-800">All Genres</option>
                  {allGenres.map(genre => (
                    <option key={genre} value={genre} className="bg-gray-800">{genre}</option>
                  ))}
                </select>
              </div>

              {/* Mood Filter */}
              <div className="relative">
                <select
                  value={filterMood}
                  onChange={(e) => setFilterMood(e.target.value)}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-purple-400 appearance-none cursor-pointer"
                >
                  <option value="all" className="bg-gray-800">All Moods</option>
                  {allMoods.map(mood => (
                    <option key={mood} value={mood} className="bg-gray-800">{mood}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Results Count */}
            <div className="mb-4">
              <p className="text-purple-200 text-sm">
                Showing {filteredAnalyses.length} of {analyses.length} analyses
              </p>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 border-b border-white/10">
              <button
                onClick={() => setActiveTab('results')}
                className={`px-6 py-3 transition-colors ${
                  activeTab === 'results'
                    ? 'text-white border-b-2 border-purple-400'
                    : 'text-purple-300 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Music className="w-4 h-4" />
                  <span>Detailed Results</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('collection')}
                className={`px-6 py-3 transition-colors ${
                  activeTab === 'collection'
                    ? 'text-white border-b-2 border-purple-400'
                    : 'text-purple-300 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  <span>Collection Dashboard</span>
                </div>
              </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'results' && <AnalysisResults analyses={filteredAnalyses} />}
            {activeTab === 'collection' && <CollectionDashboard analyses={filteredAnalyses} />}
          </div>
        )}

        {/* History Section */}
        {showHistory && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-white">Analysis History</h2>
              <button
                onClick={() => setShowHistory(false)}
                className="px-4 py-2 bg-red-500/20 text-red-200 rounded-lg hover:bg-red-500/30 transition-colors"
              >
                Close History
              </button>
            </div>
            <AnalysisResults analyses={analyses} />
            <div className="mt-6">
              <button
                onClick={loadHistory}
                disabled={isLoadingHistory}
                className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoadingHistory ? 'Loading...' : 'Load History'}
              </button>
            </div>
          </div>
        )}

        {/* Info Note */}
        {!isAnalyzing && analyses.length === 0 && files.length === 0 && (
          <div className="bg-blue-500/10 border border-blue-400/30 rounded-xl p-6 text-blue-100">
            <h3 className="mb-2">How it works:</h3>
            <ul className="space-y-2 text-sm">
              <li>• Upload one or multiple MP3/WAV files</li>
              <li>• Audio analysis uses Web Audio API for real-time feature extraction</li>
              <li>• Analysis includes tempo, key, energy, mood, and more</li>
              <li>• Lyrics transcription uses mock data (integrate Whisper API for real transcription)</li>
              <li>• All results can be downloaded as JSON for local storage</li>
            </ul>
          </div>
        )}

        {/* Footer with Generate Titles Button */}
        <div className="mt-12 pt-8 border-t border-white/20 flex justify-center">
          <button
            onClick={batchGenerateTitles}
            disabled={isGeneratingTitles}
            className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Zap className="w-5 h-5" />
            {isGeneratingTitles ? 'Generating...' : 'Generate Titles'}
          </button>
        </div>
      </div>
    </div>
  );
}
