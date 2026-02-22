import { useEffect, useState, useRef, useCallback } from 'react';
import type { SongAnalysis, LyricsAnalysis, LyricSegment, LyricWord } from '@/types';
import { useAnalysisStore } from '@/store/analysisStore';
import { useSupabaseAPI } from '@/hooks/useSupabaseAPI';
import { computeBufferHash } from '@/utils/fileHash';
import { Loader2, SkipForward, RefreshCw } from 'lucide-react';

interface AudioAnalyzerProps {
  files: File[];
  onAnalysisComplete: (analysis: SongAnalysis) => void;
  onAllComplete: () => void;
  onCurrentFileChange: (fileName: string) => void;
}

export function AudioAnalyzer({
  files,
  onAnalysisComplete,
  onAllComplete,
  onCurrentFileChange,
}: AudioAnalyzerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [skippedCount, setSkippedCount] = useState(0);
  const [reanalyzedCount, setReanalyzedCount] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const blobUrlsRef = useRef<string[]>([]);
  const isMountedRef = useRef(true);
  const isProcessingRef = useRef(false); // Prevent concurrent processing
  const lastProcessedIndexRef = useRef(-1); // Track last processed index
  
  const { trackBlobUrl } = useAnalysisStore();
  const { checkAnalysisByHash } = useSupabaseAPI();

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    
    return () => {
      isMountedRef.current = false;
      
      // Close audio context
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(console.error);
        audioContextRef.current = null;
      }
      
      // NOTE: Don't revoke blob URLs here - they are tracked in the store
      // and will be revoked when the analysis is deleted or cleared.
      // Revoking here causes "blob not found" errors during playback.
      blobUrlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    // Multiple guards to prevent concurrent/duplicate processing:
    // 1. Check if already processing
    // 2. Check if this index was already processed
    // 3. Check if we have files to process
    if (isProcessingRef.current) {
      return;
    }
    
    if (currentIndex < files.length && currentIndex > lastProcessedIndexRef.current) {
      // Mark as processing SYNCHRONOUSLY before any async work
      isProcessingRef.current = true;
      lastProcessedIndexRef.current = currentIndex;
      
      const processFile = async () => {
        try {
          await analyzeFile(files[currentIndex]);
        } finally {
          if (isMountedRef.current) {
            isProcessingRef.current = false;
          }
        }
      };
      
      processFile();
    } else if (currentIndex === files.length && files.length > 0 && currentIndex > 0) {
      onAllComplete();
    }
  }, [currentIndex]); // Only depend on currentIndex, not files

  const analyzeFile = async (file: File) => {
    onCurrentFileChange(file.name);
    setProgress(0);
    setStatusMessage('Reading file...');

    try {
      // Read file and compute hash first
      const arrayBuffer = await file.arrayBuffer();
      setProgress(5);
      setStatusMessage('Computing file hash...');
      
      const fileHash = await computeBufferHash(arrayBuffer);
      setProgress(10);
      
      // Check if this file has already been analyzed
      setStatusMessage('Checking for existing analysis...');
      const existingCheck = await checkAnalysisByHash(fileHash);
      
      // Track existing analysis ID if we're re-analyzing (to update instead of create duplicate)
      let existingAnalysisId: string | null = null;
      
      if (existingCheck?.found && existingCheck.analysis) {
        // File exists in database
        if (!existingCheck.needsReanalysis) {
          // Has timestamped lyrics - skip and use existing
          console.log(`Skipping ${file.name} - already analyzed with timestamped lyrics`);
          setStatusMessage(`Skipping (already analyzed with lyrics)`);
          setSkippedCount(prev => prev + 1);
          
          // Create blob URL for the current file for playback
          const audioUrl = URL.createObjectURL(file);
          blobUrlsRef.current.push(audioUrl);
          trackBlobUrl(audioUrl);
          
          // Use existing analysis but with fresh blob URL
          const existingWithUrl: SongAnalysis = {
            ...existingCheck.analysis,
            audioUrl,
          };
          
          onAnalysisComplete(existingWithUrl);
          
          // Move to next file
          setTimeout(() => {
            if (isMountedRef.current) {
              setCurrentIndex(prev => prev + 1);
            }
          }, 300);
          return;
        } else {
          // Exists but needs re-analysis for timestamped lyrics
          // IMPORTANT: Save the existing ID so we update instead of creating a duplicate
          existingAnalysisId = existingCheck.analysis.id;
          console.log(`Re-analyzing ${file.name} (ID: ${existingAnalysisId}) - missing timestamped lyrics`);
          setStatusMessage('Re-analyzing for timestamped lyrics...');
          setReanalyzedCount(prev => prev + 1);
        }
      }
      
      setProgress(15);
      setStatusMessage('Decoding audio...');
      
      // Create a fresh AudioContext for each file to avoid state issues
      // Close existing context if it exists and is not closed
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        try {
          await audioContextRef.current.close();
        } catch {
          // Ignore close errors
        }
      }
      audioContextRef.current = new AudioContext();

      // Create a copy of arrayBuffer for decoding (original may be needed elsewhere)
      const bufferCopy = arrayBuffer.slice(0);
      let audioBuffer: AudioBuffer;
      try {
        audioBuffer = await audioContextRef.current.decodeAudioData(bufferCopy);
      } catch (decodeError) {
        console.error(`Failed to decode ${file.name}:`, decodeError);
        throw new Error(`Unable to decode audio: ${file.name} may be corrupted or in an unsupported format`);
      }

      setProgress(30);
      setStatusMessage('Extracting audio features...');

      // Extract audio features (preliminary)
      // Pass existing ID if re-analyzing to update instead of creating duplicate
      const audioAnalysis = await extractAudioFeatures(file, audioBuffer, fileHash, existingAnalysisId);

      setProgress(70);
      setStatusMessage('Transcribing lyrics...');

      // Transcribe lyrics using the local Whisper service (pass audioBuffer for compression if needed)
      const { lyrics, segments, words, analysis: lyricsAnalysis } = await transcribeLyrics(file, audioBuffer);

      setProgress(90);
      setStatusMessage('Finalizing analysis...');

      // Combine audio and lyrics analysis for enhanced results
      const enhancedAnalysis = enhanceWithLyricsAnalysis(audioAnalysis, lyricsAnalysis);

      setProgress(100);

      const audioUrl = URL.createObjectURL(file);
      // Track blob URL for cleanup
      blobUrlsRef.current.push(audioUrl);
      trackBlobUrl(audioUrl);

      const fullAnalysis: SongAnalysis = {
        ...enhancedAnalysis,
        lyrics,
        lyricsSegments: segments,
        lyricsWords: words,
        lyricsAnalysis: lyricsAnalysis || undefined,
        analyzedAt: new Date().toISOString(),
        audioUrl,
      };

      onAnalysisComplete(fullAnalysis);

      // Move to next file after a short delay
      setTimeout(() => {
        if (isMountedRef.current) {
          setCurrentIndex(prev => prev + 1);
        }
      }, 500);
    } catch (error) {
      console.error('Error analyzing file:', error);
      setStatusMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // Skip to next file on error
      setTimeout(() => {
        if (isMountedRef.current) {
          setCurrentIndex(prev => prev + 1);
        }
      }, 500);
    }
  };

  const enhanceWithLyricsAnalysis = (
    audioAnalysis: Omit<SongAnalysis, 'lyrics' | 'analyzedAt' | 'lyricsAnalysis'>,
    lyricsAnalysis: LyricsAnalysis | null
  ): Omit<SongAnalysis, 'lyrics' | 'analyzedAt' | 'lyricsAnalysis'> => {
    if (!lyricsAnalysis) {
      return audioAnalysis;
    }

    // Combine audio valence with lyrics valence (weighted average)
    const combinedValence = (audioAnalysis.valence * 0.4) + (lyricsAnalysis.valenceFromLyrics * 0.6);

    // Combine audio energy with lyrics energy
    const combinedEnergy = (audioAnalysis.energy * 0.6) + (lyricsAnalysis.energyFromLyrics * 0.4);

    // Update danceability based on new energy
    const combinedDanceability = calculateDanceability(audioAnalysis.tempo, combinedEnergy);

    // Use lyrics mood if available, otherwise keep audio-based mood
    const enhancedMood = lyricsAnalysis.mood.length > 0 && lyricsAnalysis.mood[0] !== 'unknown'
      ? [...lyricsAnalysis.mood, ...lyricsAnalysis.emotion]
      : audioAnalysis.mood;

    console.log('Enhanced analysis with lyrics:', {
      originalValence: audioAnalysis.valence.toFixed(2),
      lyricsValence: lyricsAnalysis.valenceFromLyrics.toFixed(2),
      combinedValence: combinedValence.toFixed(2),
      originalEnergy: audioAnalysis.energy.toFixed(2),
      lyricsEnergy: lyricsAnalysis.energyFromLyrics.toFixed(2),
      combinedEnergy: combinedEnergy.toFixed(2),
      mood: enhancedMood
    });

    return {
      ...audioAnalysis,
      valence: combinedValence,
      energy: combinedEnergy,
      danceability: combinedDanceability,
      mood: enhancedMood,
    };
  };

  const extractAudioFeatures = async (
    file: File,
    audioBuffer: AudioBuffer,
    fileHash: string,
    existingId?: string | null
  ): Promise<Omit<SongAnalysis, 'lyrics' | 'analyzedAt' | 'lyricsAnalysis'>> => {
    const duration = audioBuffer.duration;
    const sampleRate = audioBuffer.sampleRate;
    const channelData = audioBuffer.getChannelData(0);

    // Calculate waveform data (downsampled)
    const waveformData = downsampleWaveform(channelData, 200);

    // Calculate RMS (root mean square) for loudness
    const rms = calculateRMS(channelData);
    const loudness = 20 * Math.log10(rms);

    // Estimate tempo using autocorrelation
    const tempo = estimateTempo(channelData, sampleRate);

    // Calculate spectral features
    const spectralFeatures = calculateSpectralFeatures(channelData);

    // Detect key (simplified)
    const key = detectKey(channelData, sampleRate);

    // Calculate various audio features
    const energy = calculateEnergy(channelData);
    const danceability = calculateDanceability(tempo, energy);
    const valence = calculateValence(spectralFeatures);
    const acousticness = calculateAcousticness(spectralFeatures);
    const instrumentalness = calculateInstrumentalness(spectralFeatures);
    const speechiness = calculateSpeechiness(spectralFeatures);
    const liveness = calculateLiveness(spectralFeatures);

    // Determine genres and moods based on features
    const genre = determineGenres(tempo, energy, acousticness);
    const mood = determineMoods(valence, energy, tempo);

    // Detect time signature
    const timeSignature = detectTimeSignature(tempo, channelData);

    return {
      // Use existing ID if re-analyzing, otherwise generate new one
      id: existingId || `${Date.now()}-${Math.random()}`,
      fileName: file.name,
      fileSize: file.size,
      fileHash,
      duration,
      tempo,
      key,
      energy,
      danceability,
      valence,
      acousticness,
      instrumentalness,
      loudness,
      speechiness,
      liveness,
      timeSignature,
      genre,
      mood,
      waveformData,
    };
  };

  const downsampleWaveform = (channelData: Float32Array, targetPoints: number): number[] => {
    const blockSize = Math.floor(channelData.length / targetPoints);
    const waveform: number[] = [];

    for (let i = 0; i < targetPoints; i++) {
      const start = i * blockSize;
      const end = start + blockSize;
      let sum = 0;
      for (let j = start; j < end && j < channelData.length; j++) {
        sum += Math.abs(channelData[j]);
      }
      waveform.push(sum / blockSize);
    }

    return waveform;
  };

  const calculateRMS = (channelData: Float32Array): number => {
    let sum = 0;
    for (let i = 0; i < channelData.length; i++) {
      sum += channelData[i] * channelData[i];
    }
    return Math.sqrt(sum / channelData.length);
  };

  const estimateTempo = (channelData: Float32Array, sampleRate: number): number => {
    // Use autocorrelation for better tempo detection
    const bufferSize = Math.min(sampleRate * 10, channelData.length);
    const data = channelData.slice(0, bufferSize);

    // Create energy envelope with smaller hop size for better resolution
    const hopSize = 512;
    const envelope: number[] = [];
    
    for (let i = 0; i < data.length - hopSize; i += hopSize) {
      let energy = 0;
      for (let j = 0; j < hopSize; j++) {
        energy += data[i + j] * data[i + j];
      }
      envelope.push(Math.sqrt(energy / hopSize));
    }

    // Apply onset detection (difference between successive frames)
    const onsetStrength: number[] = [];
    for (let i = 1; i < envelope.length; i++) {
      const diff = envelope[i] - envelope[i - 1];
      onsetStrength.push(Math.max(0, diff)); // Half-wave rectification
    }

    // Autocorrelation to find periodicity
    const minBPM = 60;
    const maxBPM = 180;
    const minLag = Math.floor((60 / maxBPM) * sampleRate / hopSize);
    const maxLag = Math.floor((60 / minBPM) * sampleRate / hopSize);

    let maxCorrelation = 0;
    let bestLag = minLag;

    for (let lag = minLag; lag < Math.min(maxLag, onsetStrength.length / 2); lag++) {
      let correlation = 0;
      let count = 0;
      
      for (let i = 0; i < onsetStrength.length - lag; i++) {
        correlation += onsetStrength[i] * onsetStrength[i + lag];
        count++;
      }
      
      correlation /= count;

      if (correlation > maxCorrelation) {
        maxCorrelation = correlation;
        bestLag = lag;
      }
    }

    // Convert lag to BPM
    const secondsPerBeat = (bestLag * hopSize) / sampleRate;
    let bpm = 60 / secondsPerBeat;

    // Handle tempo multiples/subdivisions
    // If BPM is too high, it might be detecting half-notes
    while (bpm > 180) {
      bpm /= 2;
    }
    
    while (bpm < 60) {
      bpm *= 2;
    }

    return Math.round(bpm);
  };

  const calculateSpectralFeatures = (channelData: Float32Array): {
    zcr: number;
    spectralCentroid: number;
    spectralRolloff: number;
    spectralFlatness: number;
    spectralBandwidth: number;
    lowFreqEnergy: number;
    midFreqEnergy: number;
    highFreqEnergy: number;
    dynamicRange: number;
  } => {
    // Optimized spectral analysis with multiple acoustic features
    const sampleRate = 44100;
    const fftSize = 2048; // Reduced from 4096 for performance
    const hopSize = fftSize / 2;
    const numFrames = Math.min(10, Math.floor(channelData.length / hopSize) - 1); // Reduced from 20
    
    let totalZCR = 0;
    let totalCentroid = 0;
    let totalRolloff = 0;
    let totalFlatness = 0;
    let totalBandwidth = 0;
    let lowEnergy = 0;
    let midEnergy = 0;
    let highEnergy = 0;
    
    const maxAmplitude = Math.max(...Array.from(channelData.slice(0, 100000)).map(Math.abs));
    const minAmplitude = Math.min(...Array.from(channelData.slice(0, 100000)).map(Math.abs).filter(v => v > 0.001));
    const dynamicRange = 20 * Math.log10(maxAmplitude / (minAmplitude + 0.0001));
    
    for (let frame = 0; frame < numFrames; frame++) {
      const offset = Math.floor((frame / numFrames) * (channelData.length - fftSize));
      const frameData = channelData.slice(offset, offset + fftSize);
      
      // Zero Crossing Rate
      let zcr = 0;
      for (let i = 1; i < frameData.length; i++) {
        if ((frameData[i] >= 0 && frameData[i - 1] < 0) || (frameData[i] < 0 && frameData[i - 1] >= 0)) {
          zcr++;
        }
      }
      totalZCR += zcr / frameData.length;
      
      // Optimized magnitude spectrum using binned approach
      const numBins = 512; // Reduced resolution for performance
      const magnitudes: number[] = new Array(numBins).fill(0);
      
      // Simplified frequency analysis - bin the samples by frequency ranges
      for (let i = 0; i < frameData.length; i++) {
        const bin = Math.floor((i / frameData.length) * numBins);
        magnitudes[bin] += Math.abs(frameData[i]);
      }
      
      // Normalize magnitudes
      const maxMag = Math.max(...magnitudes);
      for (let i = 0; i < magnitudes.length; i++) {
        magnitudes[i] = magnitudes[i] / (maxMag + 0.0001);
      }
      
      // Spectral Centroid
      let weightedSum = 0;
      let totalMagnitude = 0;
      for (let k = 0; k < magnitudes.length; k++) {
        const freq = (k * sampleRate) / (2 * numBins);
        weightedSum += freq * magnitudes[k];
        totalMagnitude += magnitudes[k];
      }
      totalCentroid += weightedSum / (totalMagnitude + 0.0001);
      
      // Spectral Rolloff (frequency below which 85% of energy is contained)
      let cumulativeEnergy = 0;
      const targetEnergy = totalMagnitude * 0.85;
      let rolloffFreq = 0;
      for (let k = 0; k < magnitudes.length; k++) {
        cumulativeEnergy += magnitudes[k];
        if (cumulativeEnergy >= targetEnergy) {
          rolloffFreq = (k * sampleRate) / (2 * numBins);
          break;
        }
      }
      totalRolloff += rolloffFreq;
      
      // Spectral Flatness (measure of noisiness vs tonality)
      let geometricSum = 0;
      let count = 0;
      for (let k = 0; k < magnitudes.length; k++) {
        if (magnitudes[k] > 0.0001) {
          geometricSum += Math.log(magnitudes[k] + 0.0001);
          count++;
        }
      }
      const geometricMean = Math.exp(geometricSum / count);
      const arithmeticMean = totalMagnitude / magnitudes.length;
      totalFlatness += geometricMean / (arithmeticMean + 0.0001);
      
      // Spectral Bandwidth
      const centroid = weightedSum / (totalMagnitude + 0.0001);
      let varianceSum = 0;
      for (let k = 0; k < magnitudes.length; k++) {
        const freq = (k * sampleRate) / (2 * numBins);
        varianceSum += Math.pow(freq - centroid, 2) * magnitudes[k];
      }
      totalBandwidth += Math.sqrt(varianceSum / (totalMagnitude + 0.0001));
      
      // Frequency band energies
      for (let k = 0; k < magnitudes.length; k++) {
        const freq = (k * sampleRate) / (2 * numBins);
        if (freq < 300) {
          lowEnergy += magnitudes[k];
        } else if (freq < 3400) {
          midEnergy += magnitudes[k];
        } else {
          highEnergy += magnitudes[k];
        }
      }
    }
    
    return {
      zcr: totalZCR / numFrames,
      spectralCentroid: totalCentroid / numFrames,
      spectralRolloff: totalRolloff / numFrames,
      spectralFlatness: Math.min(1, totalFlatness / numFrames),
      spectralBandwidth: totalBandwidth / numFrames,
      lowFreqEnergy: lowEnergy,
      midFreqEnergy: midEnergy,
      highFreqEnergy: highEnergy,
      dynamicRange: Math.min(100, Math.max(0, dynamicRange)),
    };
  };

  const detectKey = (channelData: Float32Array, sampleRate: number): string => {
    // Improved key detection using chroma features
    const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const modes = ['major', 'minor'];

    // Simple FFT-like approach: analyze frequency content
    const fftSize = 8192;
    const chromaProfile = new Array(12).fill(0);
    
    // Sample multiple windows across the audio
    const numWindows = Math.min(10, Math.floor(channelData.length / fftSize));
    
    for (let w = 0; w < numWindows; w++) {
      const offset = Math.floor((w / numWindows) * (channelData.length - fftSize));
      
      // Simplified spectral analysis - bin energy into pitch classes
      for (let i = 0; i < fftSize; i++) {
        const freq = (i * sampleRate) / fftSize;
        if (freq > 50 && freq < 2000) { // Focus on musical range
          const noteNum = Math.round(12 * Math.log2(freq / 440)) % 12;
          const positiveNote = (noteNum + 12) % 12;
          chromaProfile[positiveNote] += Math.abs(channelData[offset + i]);
        }
      }
    }
    
    // Find the dominant pitch class
    let maxEnergy = 0;
    let dominantKey = 0;
    for (let i = 0; i < 12; i++) {
      if (chromaProfile[i] > maxEnergy) {
        maxEnergy = chromaProfile[i];
        dominantKey = i;
      }
    }
    
    // Determine major vs minor by looking at the third
    const majorThird = chromaProfile[(dominantKey + 4) % 12];
    const minorThird = chromaProfile[(dominantKey + 3) % 12];
    const mode = majorThird > minorThird ? 'major' : 'minor';

    return `${keys[dominantKey]} ${mode}`;
  };

  const calculateEnergy = (channelData: Float32Array): number => {
    let sum = 0;
    for (let i = 0; i < channelData.length; i++) {
      sum += channelData[i] * channelData[i];
    }
    return Math.min(1, (sum / channelData.length) * 10);
  };

  const calculateDanceability = (tempo: number, energy: number): number => {
    // Ideal dance tempo is around 120-130 BPM
    const tempoScore = 1 - Math.abs(tempo - 125) / 125;
    return Math.max(0, Math.min(1, (tempoScore * 0.6 + energy * 0.4)));
  };

  const calculateValence = (spectralFeatures: {
    zcr: number;
    spectralCentroid: number;
    spectralRolloff: number;
    spectralFlatness: number;
    spectralBandwidth: number;
    lowFreqEnergy: number;
    midFreqEnergy: number;
    highFreqEnergy: number;
    dynamicRange: number;
  }): number => {
    // Brighter, higher frequency music tends to be more positive
    // Lower spectral centroid and flatness suggest more positive valence
    const centroidScore = Math.min(1, (spectralFeatures.spectralCentroid || 0) / 4000);
    const totalFreqEnergy = (spectralFeatures.lowFreqEnergy || 0) + (spectralFeatures.midFreqEnergy || 0) + (spectralFeatures.highFreqEnergy || 0);
    const brightnessScore = totalFreqEnergy > 0 
      ? (spectralFeatures.highFreqEnergy || 0) / (totalFreqEnergy + 0.0001)
      : 0.5; // Default to neutral if no energy data
    
    // More tonal (less flat) music is often more positive
    const tonalityScore = 1 - (spectralFeatures.spectralFlatness || 0);
    
    const result = (brightnessScore * 0.4 + tonalityScore * 0.3 + (1 - centroidScore) * 0.3);
    // Guard against NaN
    if (isNaN(result)) {
      console.warn('Valence calculation resulted in NaN, using default 0.5');
      return 0.5;
    }
    return Math.max(0, Math.min(1, result));
  };

  const calculateAcousticness = (spectralFeatures: {
    zcr: number;
    spectralCentroid: number;
    spectralRolloff: number;
    spectralFlatness: number;
    spectralBandwidth: number;
    lowFreqEnergy: number;
    midFreqEnergy: number;
    highFreqEnergy: number;
    dynamicRange: number;
  }): number => {
    // Acoustic instruments have:
    // - Lower spectral rolloff (less high-frequency content)
    // - More tonal content (lower spectral flatness)
    // - Higher dynamic range
    const rolloffScore = 1 - Math.min(1, spectralFeatures.spectralRolloff / 8000);
    const tonalityScore = 1 - spectralFeatures.spectralFlatness;
    const dynamicScore = Math.min(1, spectralFeatures.dynamicRange / 60);
    
    return Math.max(0, Math.min(1, (rolloffScore * 0.4 + tonalityScore * 0.4 + dynamicScore * 0.2)));
  };

  const calculateInstrumentalness = (spectralFeatures: {
    zcr: number;
    spectralCentroid: number;
    spectralRolloff: number;
    spectralFlatness: number;
    spectralBandwidth: number;
    lowFreqEnergy: number;
    midFreqEnergy: number;
    highFreqEnergy: number;
    dynamicRange: number;
  }): number => {
    // Instrumental music (without vocals) has:
    // - Lower mid-frequency energy (vocal range is 300-3400 Hz)
    // - Lower zero-crossing rate in that range
    // - More varied spectral content
    const totalEnergy = spectralFeatures.lowFreqEnergy + spectralFeatures.midFreqEnergy + spectralFeatures.highFreqEnergy;
    const midFreqRatio = spectralFeatures.midFreqEnergy / (totalEnergy + 0.0001);
    
    // Lower mid-frequency ratio suggests less vocals
    const instrumentalScore = 1 - Math.min(1, midFreqRatio * 2);
    
    // Higher bandwidth suggests more complex instrumentation
    const complexityScore = Math.min(1, spectralFeatures.spectralBandwidth / 3000);
    
    return Math.max(0, Math.min(1, (instrumentalScore * 0.7 + complexityScore * 0.3)));
  };

  const calculateSpeechiness = (spectralFeatures: {
    zcr: number;
    spectralCentroid: number;
    spectralRolloff: number;
    spectralFlatness: number;
    spectralBandwidth: number;
    lowFreqEnergy: number;
    midFreqEnergy: number;
    highFreqEnergy: number;
    dynamicRange: number;
  }): number => {
    // Speech characteristics:
    // - High zero-crossing rate
    // - High mid-frequency energy (300-3400 Hz vocal range)
    // - More noisy/flat spectrum
    // - Moderate spectral centroid
    const zcrScore = Math.min(1, spectralFeatures.zcr * 20);
    
    const totalEnergy = spectralFeatures.lowFreqEnergy + spectralFeatures.midFreqEnergy + spectralFeatures.highFreqEnergy;
    const midFreqRatio = spectralFeatures.midFreqEnergy / (totalEnergy + 0.0001);
    
    const flatnessScore = spectralFeatures.spectralFlatness;
    
    return Math.max(0, Math.min(1, (zcrScore * 0.3 + midFreqRatio * 0.5 + flatnessScore * 0.2)));
  };

  const calculateLiveness = (spectralFeatures: {
    zcr: number;
    spectralCentroid: number;
    spectralRolloff: number;
    spectralFlatness: number;
    spectralBandwidth: number;
    lowFreqEnergy: number;
    midFreqEnergy: number;
    highFreqEnergy: number;
    dynamicRange: number;
  }): number => {
    // Live recordings have:
    // - Higher dynamic range (audience noise, room reverb)
    // - More spectral flatness (background noise)
    // - Broader spectral bandwidth
    const dynamicScore = Math.min(1, spectralFeatures.dynamicRange / 60);
    const flatnessScore = spectralFeatures.spectralFlatness;
    const bandwidthScore = Math.min(1, spectralFeatures.spectralBandwidth / 4000);
    
    return Math.max(0, Math.min(1, (dynamicScore * 0.4 + flatnessScore * 0.3 + bandwidthScore * 0.3)));
  };

  const calculateVariance = (data: number[]): number => {
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const squareDiffs = data.map(value => Math.pow(value - mean, 2));
    return squareDiffs.reduce((a, b) => a + b, 0) / data.length;
  };

  const determineGenres = (tempo: number, energy: number, acousticness: number): string[] => {
    const genres: string[] = [];

    if (tempo > 140 && energy > 0.7) {
      genres.push('Electronic', 'Dance');
    } else if (tempo < 90 && acousticness > 0.6) {
      genres.push('Folk', 'Acoustic');
    } else if (energy > 0.8) {
      genres.push('Rock', 'Metal');
    } else if (tempo >= 90 && tempo <= 120 && energy > 0.5) {
      genres.push('Pop', 'Indie');
    } else if (tempo < 80) {
      genres.push('Ballad', 'Ambient');
    } else {
      genres.push('Alternative', 'Indie');
    }

    return genres;
  };

  const determineMoods = (valence: number, energy: number, tempo: number): string[] => {
    const moods: string[] = [];

    if (valence > 0.6 && energy > 0.6) {
      moods.push('Happy', 'Energetic', 'Upbeat');
    } else if (valence < 0.4 && energy < 0.4) {
      moods.push('Sad', 'Melancholic', 'Somber');
    } else if (energy > 0.7) {
      moods.push('Intense', 'Powerful', 'Aggressive');
    } else if (valence > 0.5 && tempo < 90) {
      moods.push('Calm', 'Peaceful', 'Relaxed');
    } else if (valence < 0.4 && energy > 0.5) {
      moods.push('Angry', 'Dark', 'Brooding');
    } else {
      moods.push('Neutral', 'Contemplative');
    }

    return moods;
  };

  const detectTimeSignature = (tempo: number, channelData: Float32Array): string => {
    // Improved time signature detection using beat pattern analysis
    const sampleRate = 44100; // Assume standard sample rate
    const hopSize = 512;
    const envelope: number[] = [];
    
    // Create energy envelope
    for (let i = 0; i < Math.min(channelData.length - hopSize, sampleRate * 20); i += hopSize) {
      let energy = 0;
      for (let j = 0; j < hopSize; j++) {
        energy += channelData[i + j] * channelData[i + j];
      }
      envelope.push(Math.sqrt(energy / hopSize));
    }
    
    // Find peaks (beats)
    const peaks: number[] = [];
    const threshold = envelope.reduce((a, b) => a + b, 0) / envelope.length * 1.5;
    
    for (let i = 1; i < envelope.length - 1; i++) {
      if (envelope[i] > envelope[i - 1] && 
          envelope[i] > envelope[i + 1] && 
          envelope[i] > threshold) {
        peaks.push(i);
      }
    }
    
    // Analyze intervals between peaks
    const intervals: number[] = [];
    for (let i = 1; i < Math.min(peaks.length, 50); i++) {
      intervals.push(peaks[i] - peaks[i - 1]);
    }
    
    if (intervals.length < 4) {
      return '4/4'; // Default if not enough data
    }
    
    // Calculate average interval
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    
    // Look for patterns - count how many intervals match multiples
    let match3 = 0;
    let match4 = 0;
    let match6 = 0;
    
    for (const interval of intervals) {
      const ratio = interval / avgInterval;
      
      // Check if intervals suggest groups of 3, 4, or 6
      if (Math.abs(ratio - 0.75) < 0.2 || Math.abs(ratio - 1.5) < 0.2) {
        match3++;
      }
      if (Math.abs(ratio - 1) < 0.15 || Math.abs(ratio - 2) < 0.2) {
        match4++;
      }
      if (Math.abs(ratio - 0.67) < 0.2 || Math.abs(ratio - 1.33) < 0.2) {
        match6++;
      }
    }
    
    // Determine time signature based on patterns
    if (match6 > match4 && match6 > match3) {
      return '6/8';
    } else if (match3 > match4 * 1.3) {
      return '3/4';
    } else if (tempo > 200) {
      return '7/8'; // Very fast, might be odd meter
    } else {
      return '4/4'; // Most common
    }
  };

  const compressAudioFile = async (file: File, audioBuffer: AudioBuffer): Promise<Blob> => {
    // Create offline context for rendering compressed audio
    const sampleRate = 16000; // Whisper optimal sample rate
    const offlineContext = new OfflineAudioContext(1, audioBuffer.duration * sampleRate, sampleRate);
    
    // Create buffer source
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start();
    
    // Render the audio
    const renderedBuffer = await offlineContext.startRendering();
    
    // Convert to WAV format (simple PCM WAV)
    const wavBlob = audioBufferToWav(renderedBuffer);
    
    return wavBlob;
  };

  const audioBufferToWav = (buffer: AudioBuffer): Blob => {
    const length = buffer.length * buffer.numberOfChannels * 2;
    const arrayBuffer = new ArrayBuffer(44 + length);
    const view = new DataView(arrayBuffer);
    const channels: Float32Array[] = [];
    let offset = 0;
    let pos = 0;

    // Write WAV header
    const setString = (str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(pos++, str.charCodeAt(i));
      }
    };

    setString('RIFF');
    view.setUint32(pos, 36 + length, true); pos += 4;
    setString('WAVE');
    setString('fmt ');
    view.setUint32(pos, 16, true); pos += 4;
    view.setUint16(pos, 1, true); pos += 2;
    view.setUint16(pos, buffer.numberOfChannels, true); pos += 2;
    view.setUint32(pos, buffer.sampleRate, true); pos += 4;
    view.setUint32(pos, buffer.sampleRate * buffer.numberOfChannels * 2, true); pos += 4;
    view.setUint16(pos, buffer.numberOfChannels * 2, true); pos += 2;
    view.setUint16(pos, 16, true); pos += 2;
    setString('data');
    view.setUint32(pos, length, true); pos += 4;

    // Write audio data
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    while (pos < arrayBuffer.byteLength) {
      for (let i = 0; i < buffer.numberOfChannels; i++) {
        let sample = channels[i][offset];
        sample = Math.max(-1, Math.min(1, sample));
        view.setInt16(pos, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        pos += 2;
      }
      offset++;
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  };

const transcribeLyrics = async (
    file: File,
    audioBuffer: AudioBuffer
  ): Promise<{ lyrics: string; segments?: LyricSegment[]; words?: LyricWord[]; analysis: LyricsAnalysis | null }> => {
    const whisperServiceUrl = (import.meta.env.VITE_WHISPER_SERVICE_URL || 'http://localhost:3001').replace(/\/$/, '');

    try {
      const MAX_SIZE = 25 * 1024 * 1024; // App-level soft limit to avoid very large browser uploads
      
      let audioFileToSend: Blob | File = file;
      let fileName = file.name;

      // Check if file is too large and needs compression
      if (file.size > MAX_SIZE) {
        console.log(`File ${file.name} is ${(file.size / 1024 / 1024).toFixed(2)}MB, compressing...`);
        audioFileToSend = await compressAudioFile(file, audioBuffer);
        fileName = file.name.replace(/\.[^/.]+$/, '') + '_compressed.wav';
        console.log(`Compressed to ${(audioFileToSend.size / 1024 / 1024).toFixed(2)}MB`);
        
        // If still too large after compression, skip transcription
        if (audioFileToSend.size > MAX_SIZE) {
          return {
            lyrics: `[File too large for local transcription]\n\nThe audio file is ${(file.size / 1024 / 1024).toFixed(2)}MB, which exceeds the current app upload limit of 25MB.\nEven after compression, the file is ${(audioFileToSend.size / 1024 / 1024).toFixed(2)}MB.\n\nTo transcribe this file:\n1. Reduce file size in an audio editor\n2. Split the file into smaller segments\n3. Increase the app-side upload threshold in AudioAnalyzer`,
            analysis: null
          };
        }
      }

      const formData = new FormData();
      formData.append('audio', audioFileToSend, fileName);

      console.log(`Sending local Whisper transcription request for: ${fileName} (${(audioFileToSend.size / 1024 / 1024).toFixed(2)}MB)`);

      const response = await fetch(`${whisperServiceUrl}/transcribe`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Local Whisper service error: ${response.status}`;
        if (errorText) {
          try {
            const parsed = JSON.parse(errorText);
            errorMessage = parsed.error || parsed.details || errorMessage;
          } catch {
            errorMessage = `${errorMessage} - ${errorText}`;
          }
        }
        console.error('Local transcription service error:', errorMessage);
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log(`Local Whisper transcription completed for: ${fileName}`);

      // Normalize potential Whisper-like shapes
      // Expected possibilities: { transcription: string, segments: [{ start, end, text }], words: [{ start, end, word }], lyricsAnalysis }
      const segments: LyricSegment[] | undefined = Array.isArray(data.segments)
        ? data.segments.map((s: any) => ({
            start: typeof s.start === 'number' ? s.start : parseFloat(s.start) || 0,
            end: typeof s.end === 'number' ? s.end : parseFloat(s.end) || 0,
            text: (s.text || '').trim(),
          }))
        : undefined;

      const words: LyricWord[] | undefined = Array.isArray(data.words)
        ? data.words.map((w: any) => ({
            start: typeof w.start === 'number' ? w.start : parseFloat(w.start) || 0,
            end: typeof w.end === 'number' ? w.end : parseFloat(w.end) || 0,
            word: (w.word || w.text || '').trim(),
          }))
        : undefined;
      
      return {
        lyrics: data.transcription || (segments ? segments.map(s => s.text).join('\n') : '[No transcription available]'),
        segments,
        words,
        analysis: data.lyricsAnalysis || null,
      };
    } catch (error) {
      console.error('Transcription error:', error);
      return {
        lyrics: `[Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}]\n\nMake sure the local Whisper service is running at ${whisperServiceUrl}/health.`,
        analysis: null
      };
    }
  };

  return (
    <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 mb-8 border border-white/20">
      <div className="flex items-center justify-center mb-4">
        <Loader2 className="w-8 h-8 text-purple-400 animate-spin mr-3" />
        <span className="text-white">
          Analyzing: {files[currentIndex]?.name} ({currentIndex + 1} of {files.length})
        </span>
      </div>

      <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden">
        <div
          className="bg-gradient-to-r from-purple-500 to-blue-500 h-full transition-all duration-300 rounded-full"
          style={{ width: `${progress}%` }}
        />
      </div>

      <p className="text-center text-purple-300 mt-3 text-sm">{progress}% complete</p>
      
      {/* Status message */}
      {statusMessage && (
        <p className="text-center text-purple-200 mt-2 text-xs">{statusMessage}</p>
      )}
      
      {/* Stats for skipped/reanalyzed files */}
      {(skippedCount > 0 || reanalyzedCount > 0) && (
        <div className="flex justify-center gap-4 mt-4 text-xs">
          {skippedCount > 0 && (
            <div className="flex items-center gap-1 text-green-300">
              <SkipForward className="w-3 h-3" />
              <span>{skippedCount} skipped (already analyzed)</span>
            </div>
          )}
          {reanalyzedCount > 0 && (
            <div className="flex items-center gap-1 text-yellow-300">
              <RefreshCw className="w-3 h-3" />
              <span>{reanalyzedCount} re-analyzed (missing lyrics)</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
