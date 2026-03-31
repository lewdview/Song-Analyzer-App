import { useCallback, useEffect, useRef, useState } from 'react';
import './TranscribePanel.css';

const WHISPER_URL = (import.meta as unknown as { env: Record<string, string> }).env.VITE_WHISPER_SERVICE_URL ?? 'http://localhost:3001';
const ACCEPTED_TYPES = '.mp3,.wav,.flac,.aac,.m4a,.mp4,.ogg,.opus,.webm';
const ACCEPTED_MIME = [
    'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/x-flac',
    'audio/aac', 'audio/x-m4a', 'audio/mp4', 'video/mp4',
    'audio/ogg', 'audio/opus', 'audio/webm', 'video/webm',
];

export interface WordTiming {
    text: string;
    start: number;
    end: number;
}

interface TranscribePanelProps {
    onClose: () => void;
    onUseLyrics: (lyrics: string) => void;
}

type ServiceStatus = 'checking' | 'online' | 'offline';
type PanelState = 'idle' | 'compressing' | 'uploading' | 'finalizing' | 'done' | 'error';
type WorkPhase = 'compressing' | 'uploading' | 'processing' | 'finalizing';
type ProgressMode = 'estimated' | 'backend';

const CIPHER_CHARS = '*%$#@!~^&?≠§±∆Ω';
const LONG_FILE_MODE_FILE_BYTES = 6 * 1024 * 1024;
const LONG_FILE_MODE_DURATION_SECONDS = 210;
const STAGE_ORDER: WorkPhase[] = ['compressing', 'uploading', 'processing', 'finalizing'];
const STAGE_COPY: Record<WorkPhase, { title: string; state: string }> = {
    compressing: { title: 'Prepare audio', state: 'browser work' },
    uploading: { title: 'Send to server', state: 'network' },
    processing: { title: 'Run transcription', state: 'Whisper' },
    finalizing: { title: 'Build timings', state: 'cleanup' },
};
const randCipher = () => CIPHER_CHARS[Math.floor(Math.random() * CIPHER_CHARS.length)];

function scramble(s: string): string {
    return Array.from(s).map((c) => (c === ' ' ? ' ' : randCipher())).join('');
}

function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function formatClock(totalSeconds: number): string {
    if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '--:--';
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatElapsed(ms: number): string {
    return `${formatClock(Math.floor(ms / 1000))} elapsed`;
}

function createJobId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `tp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatRemaining(ms: number): string {
    if (!Number.isFinite(ms) || ms <= 0) {
        return 'finishing soon';
    }
    return `${formatClock(Math.ceil(ms / 1000))} left`;
}

function estimateProcessingMs(durationSeconds: number | null, uploadBytes: number, likelyLongJob: boolean): number {
    const baseMs = likelyLongJob ? 120_000 : 35_000;
    const fromDurationMs = durationSeconds
        ? durationSeconds * (likelyLongJob ? 0.95 : 0.45) * 1000
        : 0;
    const fromSizeMs = uploadBytes > 0
        ? (uploadBytes / (1024 * 1024)) * (likelyLongJob ? 28_000 : 12_000)
        : 0;
    return Math.max(baseMs, fromDurationMs, fromSizeMs);
}

interface CompressionResult {
    blob: Blob;
    durationSeconds: number;
}

interface JobMeta {
    sourceBytes: number;
    uploadBytes: number;
    durationSeconds: number | null;
    likelyLongJob: boolean;
    usedCompressedAudio: boolean;
}

interface TranscriptionProgressSnapshot {
    jobId: string;
    status: 'running' | 'complete' | 'error';
    phase: 'prepare' | 'transcribing' | 'finalizing' | 'complete' | 'error';
    label: string;
    detail: string;
    percent: number;
    fileName: string;
    fileSize: number;
    audioDurationSeconds: number | null;
    mode: 'standard' | 'memory-saver' | 'isolated';
    completedWindows: number;
    totalWindows: number;
    startedAt: number;
    updatedAt: number;
    phaseStartedAt: number;
    estimatedRemainingMs: number | null;
}

const EMPTY_JOB_META: JobMeta = {
    sourceBytes: 0,
    uploadBytes: 0,
    durationSeconds: null,
    likelyLongJob: false,
    usedCompressedAudio: false,
};

// ---------------------------------------------------------------------------
// Client-side audio → 16 kHz mono WAV via Web Audio API
// ---------------------------------------------------------------------------
async function compressToWav(file: File): Promise<CompressionResult> {
    const TARGET_RATE = 16_000;
    const arrayBuf = await file.arrayBuffer();
    const decodeCtx = new AudioContext();
    try {
        const decoded = await decodeCtx.decodeAudioData(arrayBuf.slice(0));

        // Resample via OfflineAudioContext
        const offCtx = new OfflineAudioContext(
            1,
            Math.ceil(decoded.duration * TARGET_RATE),
            TARGET_RATE,
        );
        const src = offCtx.createBufferSource();
        src.buffer = decoded;
        src.connect(offCtx.destination);
        src.start(0);
        const rendered = await offCtx.startRendering();

        // Encode to PCM WAV
        const pcm = rendered.getChannelData(0);
        const wavBuf = pcmToWav(pcm, TARGET_RATE);
        return {
            blob: new Blob([wavBuf], { type: 'audio/wav' }),
            durationSeconds: decoded.duration,
        };
    } finally {
        await decodeCtx.close().catch(() => {});
    }
}

function pcmToWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
    const numSamples = samples.length;
    const buf = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buf);

    const writeStr = (offset: number, str: string) => {
        for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);          // subchunk1 size
    view.setUint16(20, 1, true);           // PCM format
    view.setUint16(22, 1, true);           // channels
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, numSamples * 2, true);

    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        offset += 2;
    }
    return buf;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function TranscribePanel({ onClose, onUseLyrics }: TranscribePanelProps) {
    const [serviceStatus, setServiceStatus] = useState<ServiceStatus>('checking');
    const [panelState, setPanelState] = useState<PanelState>('idle');
    const [workPhase, setWorkPhase] = useState<WorkPhase>('compressing');
    const [progress, setProgress] = useState(0);                 // 0-100
    const [progressLabel, setProgressLabel] = useState('');
    const [progressDetail, setProgressDetail] = useState('');
    const [wordTimings, setWordTimings] = useState<WordTiming[]>([]);
    const [fullText, setFullText] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [dragging, setDragging] = useState(false);
    const [fileName, setFileName] = useState('');
    const [cipherProg, setCipherProg] = useState('');            // scrolling cipher
    const [jobMeta, setJobMeta] = useState<JobMeta>(EMPTY_JOB_META);
    const [jobStartedAt, setJobStartedAt] = useState<number | null>(null);
    const [phaseStartedAt, setPhaseStartedAt] = useState<number | null>(null);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [progressMode, setProgressMode] = useState<ProgressMode>('estimated');
    const [liveProgress, setLiveProgress] = useState<TranscriptionProgressSnapshot | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cipherIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const uploadToProcessingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const progressPollAbortRef = useRef<AbortController | null>(null);
    const isWorking = panelState === 'compressing' || panelState === 'uploading' || panelState === 'finalizing';
    const hasLiveServerProgress = progressMode === 'backend' && liveProgress !== null;

    const beginPhase = useCallback((
        nextPanelState: PanelState,
        nextWorkPhase: WorkPhase,
        nextLabel: string,
        nextDetail: string,
        minimumProgress: number,
    ) => {
        setPanelState(nextPanelState);
        setWorkPhase(nextWorkPhase);
        setProgressLabel(nextLabel);
        setProgressDetail(nextDetail);
        setPhaseStartedAt(Date.now());
        setProgress((prev) => Math.max(prev, minimumProgress));
    }, []);

    const stopProgressPolling = useCallback(() => {
        progressPollAbortRef.current?.abort();
        progressPollAbortRef.current = null;
    }, []);

    const resetRunState = useCallback(() => {
        stopProgressPolling();
        if (uploadToProcessingRef.current) {
            clearTimeout(uploadToProcessingRef.current);
            uploadToProcessingRef.current = null;
        }
        setPanelState('idle');
        setWorkPhase('compressing');
        setProgress(0);
        setProgressLabel('');
        setProgressDetail('');
        setWordTimings([]);
        setFullText('');
        setErrorMsg('');
        setDragging(false);
        setFileName('');
        setCipherProg('');
        setJobMeta(EMPTY_JOB_META);
        setJobStartedAt(null);
        setPhaseStartedAt(null);
        setElapsedMs(0);
        setProgressMode('estimated');
        setLiveProgress(null);
    }, [stopProgressPolling]);

    const applyServerProgress = useCallback((snapshot: TranscriptionProgressSnapshot) => {
        setProgressMode('backend');
        setLiveProgress(snapshot);
        setProgressLabel(snapshot.label || 'Transcribing audio');
        setProgressDetail(snapshot.detail || '');
        setProgress(snapshot.percent);
        setPanelState(snapshot.phase === 'finalizing' ? 'finalizing' : 'uploading');
        setWorkPhase(snapshot.phase === 'finalizing' ? 'finalizing' : 'processing');

        setJobMeta((prev) => {
            const sourceBytes = snapshot.fileSize > 0 ? snapshot.fileSize : prev.sourceBytes;
            const uploadBytes = prev.uploadBytes > 0 ? prev.uploadBytes : sourceBytes;
            const durationSeconds = snapshot.audioDurationSeconds ?? prev.durationSeconds;
            const likelyLongJob = snapshot.mode !== 'standard' ||
                uploadBytes >= LONG_FILE_MODE_FILE_BYTES ||
                (durationSeconds !== null && durationSeconds >= LONG_FILE_MODE_DURATION_SECONDS);

            return {
                sourceBytes,
                uploadBytes,
                durationSeconds,
                likelyLongJob,
                usedCompressedAudio: prev.usedCompressedAudio,
            };
        });
    }, []);

    // Cipher fill animation while working
    useEffect(() => {
        if (isWorking) {
            cipherIntervalRef.current = setInterval(() => {
                setCipherProg(scramble((progressDetail || progressLabel).padEnd(34)));
            }, 120);
        } else {
            if (cipherIntervalRef.current) clearInterval(cipherIntervalRef.current);
            setCipherProg('');
        }
        return () => { if (cipherIntervalRef.current) clearInterval(cipherIntervalRef.current); };
    }, [isWorking, progressDetail, progressLabel]);

    useEffect(() => {
        if (!isWorking || !jobStartedAt) {
            setElapsedMs(0);
            return;
        }
        setElapsedMs(Date.now() - jobStartedAt);
        const interval = setInterval(() => {
            setElapsedMs(Date.now() - jobStartedAt);
        }, 250);
        return () => clearInterval(interval);
    }, [isWorking, jobStartedAt]);

    useEffect(() => {
        if (!isWorking || !phaseStartedAt || hasLiveServerProgress) return;
        const interval = setInterval(() => {
            const phaseElapsedMs = Date.now() - phaseStartedAt;
            let target = 0;

            if (workPhase === 'compressing') {
                target = Math.min(36, 8 + phaseElapsedMs / 150);
            } else if (workPhase === 'uploading') {
                target = Math.min(56, 42 + phaseElapsedMs / 85);
            } else if (workPhase === 'processing') {
                const estimateMs = estimateProcessingMs(jobMeta.durationSeconds, jobMeta.uploadBytes, jobMeta.likelyLongJob);
                const ratio = Math.min(0.985, phaseElapsedMs / estimateMs);
                const eased = 1 - Math.pow(1 - ratio, 1.35);
                target = 58 + eased * 36;
            } else if (workPhase === 'finalizing') {
                target = Math.min(99, 96 + phaseElapsedMs / 250);
            }

            setProgress((prev) => Math.max(prev, Math.min(target, 99)));
        }, 180);
        return () => clearInterval(interval);
    }, [hasLiveServerProgress, isWorking, phaseStartedAt, workPhase, jobMeta.durationSeconds, jobMeta.uploadBytes, jobMeta.likelyLongJob]);

    useEffect(() => {
        return () => {
            if (uploadToProcessingRef.current) clearTimeout(uploadToProcessingRef.current);
            stopProgressPolling();
        };
    }, [stopProgressPolling]);

    // Service health check
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`${WHISPER_URL}/health`, { signal: AbortSignal.timeout(3000) });
                if (!cancelled) setServiceStatus(res.ok ? 'online' : 'offline');
            } catch {
                if (!cancelled) setServiceStatus('offline');
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const transcribeFile = useCallback(async (file: File) => {
        if (!ACCEPTED_MIME.some((t) => file.type.startsWith(t.split('/')[0]) || file.type === t) && file.size > 0) {
            // Loose check — allow if extension matches even if MIME is wrong
        }
        resetRunState();
        setFileName(file.name);
        setJobMeta({
            ...EMPTY_JOB_META,
            sourceBytes: file.size,
            uploadBytes: file.size,
        });
        setJobStartedAt(Date.now());
        setElapsedMs(0);

        try {
            // Step 1: Compress
            beginPhase(
                'compressing',
                'compressing',
                'Preparing audio',
                `Optimizing ${formatBytes(file.size)} for upload`,
                8,
            );

            let uploadBlob: Blob;
            let durationSeconds: number | null = null;
            let usedCompressedAudio = false;
            try {
                const compressed = await compressToWav(file);
                uploadBlob = compressed.blob;
                durationSeconds = compressed.durationSeconds;
                usedCompressedAudio = true;
                setProgress(40);
            } catch {
                // Compression failed — send raw file (server-side ffmpeg will handle it)
                uploadBlob = file;
                setProgress(35);
            }

            const likelyLongJob =
                uploadBlob.size >= LONG_FILE_MODE_FILE_BYTES ||
                (durationSeconds !== null && durationSeconds >= LONG_FILE_MODE_DURATION_SECONDS);

            setJobMeta({
                sourceBytes: file.size,
                uploadBytes: uploadBlob.size,
                durationSeconds,
                likelyLongJob,
                usedCompressedAudio,
            });

            // Step 2: Upload + transcribe
            beginPhase(
                'uploading',
                'uploading',
                'Sending to Whisper',
                `Uploading ${formatBytes(uploadBlob.size)}${usedCompressedAudio ? ' after browser-side compression' : ''}`,
                42,
            );

            const formData = new FormData();
            const jobId = createJobId();
            formData.append('audio', uploadBlob, 'audio.wav');
            formData.append('timestamp_mode', 'word');
            formData.append('job_id', jobId);

            uploadToProcessingRef.current = setTimeout(() => {
                beginPhase(
                    'uploading',
                    'processing',
                    likelyLongJob ? 'Transcribing in long-file mode' : 'Transcribing audio',
                    likelyLongJob
                        ? 'Server is processing this recording in chunks. Several minutes is normal for longer files.'
                        : 'Whisper is decoding speech and generating timings.',
                    58,
                );
            }, 1200);

            progressPollAbortRef.current = new AbortController();
            const pollSignal = progressPollAbortRef.current.signal;
            const pollProgress = (async () => {
                while (!pollSignal.aborted) {
                    try {
                        const progressRes = await fetch(`${WHISPER_URL}/transcribe-progress/${encodeURIComponent(jobId)}`, {
                            signal: pollSignal,
                        });
                        if (progressRes.ok) {
                            const snapshot = await progressRes.json() as TranscriptionProgressSnapshot;
                            applyServerProgress(snapshot);
                            if (snapshot.status === 'complete' || snapshot.status === 'error') {
                                return;
                            }
                        }
                    } catch {
                        if (pollSignal.aborted) {
                            return;
                        }
                    }

                    await new Promise<void>((resolve) => {
                        const timeout = setTimeout(resolve, 900);
                        pollSignal.addEventListener('abort', () => {
                            clearTimeout(timeout);
                            resolve();
                        }, { once: true });
                    });
                }
            })();

            const res = await fetch(`${WHISPER_URL}/transcribe`, {
                method: 'POST',
                body: formData,
                signal: AbortSignal.timeout(600_000),
            });
            if (uploadToProcessingRef.current) {
                clearTimeout(uploadToProcessingRef.current);
                uploadToProcessingRef.current = null;
            }
            stopProgressPolling();
            await pollProgress.catch(() => {});

            if (!res.ok) {
                const errText = await res.text().catch(() => res.statusText);
                throw new Error(errText || `HTTP ${res.status}`);
            }

            beginPhase(
                'finalizing',
                'finalizing',
                'Finalizing transcript',
                'Parsing words, timestamps, and transcript text for review.',
                96,
            );
            const data = await res.json() as {
                text?: string;
                transcription?: string;
                chunks?: { text: string; timestamp: [number, number] }[];
                words?: { text?: string; word?: string; start?: number; end?: number }[];
                segments?: { text?: string; start?: number; end?: number }[];
            };

            const text = (data.transcription ?? data.text ?? '').trim();
            const timings: WordTiming[] = Array.isArray(data.words) && data.words.length > 0
                ? data.words.map((word) => ({
                    text: (word.word ?? word.text ?? '').trim(),
                    start: word.start ?? 0,
                    end: word.end ?? 0,
                })).filter((w) => w.text.length > 0)
                : Array.isArray(data.chunks) && data.chunks.length > 0
                    ? data.chunks.map((chunk) => ({
                        text: chunk.text.trim(),
                        start: chunk.timestamp[0] ?? 0,
                        end: chunk.timestamp[1] ?? 0,
                    })).filter((w) => w.text.length > 0)
                    : (data.segments ?? []).map((segment) => ({
                        text: (segment.text ?? '').trim(),
                        start: segment.start ?? 0,
                        end: segment.end ?? 0,
                    })).filter((w) => w.text.length > 0);

            setFullText(text);
            setWordTimings(timings);
            setProgressLabel('Transcript ready');
            setProgressDetail(`Captured ${timings.length} timed words${text ? ` across ${text.length} characters` : ''}`);
            setProgress(100);
            setLiveProgress(null);
            setPanelState('done');
        } catch (err) {
            if (uploadToProcessingRef.current) {
                clearTimeout(uploadToProcessingRef.current);
                uploadToProcessingRef.current = null;
            }
            stopProgressPolling();
            const rawMsg = err instanceof Error ? err.message : String(err);
            const msg = rawMsg.includes('signal timed out')
                ? 'Transcription took longer than 10 minutes. Please try a shorter clip or retry in a moment.'
                : rawMsg;
            setErrorMsg(msg);
            setPanelState('error');
        }
    }, [applyServerProgress, beginPhase, resetRunState, stopProgressPolling]);

    const handleFile = useCallback((file: File | undefined) => {
        if (!file) return;
        if (serviceStatus !== 'online') return;
        void transcribeFile(file);
    }, [serviceStatus, transcribeFile]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        handleFile(file);
    }, [handleFile]);

    const handleUseLyrics = () => {
        onUseLyrics(fullText.trim());
        onClose();
    };

    const formatTime = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = (s % 60).toFixed(1).padStart(4, '0');
        return `${m}:${sec}`;
    };

    const stageDetailHint = workPhase === 'processing'
        ? (hasLiveServerProgress && liveProgress?.totalWindows
            ? `Live server progress: ${liveProgress.completedWindows}/${liveProgress.totalWindows} windows complete${liveProgress.estimatedRemainingMs ? `, ${formatRemaining(liveProgress.estimatedRemainingMs)}.` : '.'}`
            : jobMeta.likelyLongJob
            ? 'Chunked mode keeps longer files under the server memory limit.'
            : 'Shorter clips usually complete much faster than full songs.')
        : (hasLiveServerProgress
            ? 'Progress is coming directly from the transcription server.'
            : jobMeta.usedCompressedAudio
            ? `Compressed locally from ${formatBytes(jobMeta.sourceBytes)} to ${formatBytes(jobMeta.uploadBytes)}.`
            : 'Using the original file as-is for upload.');
    const progressTimingLabel = hasLiveServerProgress && liveProgress?.estimatedRemainingMs
        ? `${formatElapsed(elapsedMs)} • ${formatRemaining(liveProgress.estimatedRemainingMs)}`
        : formatElapsed(elapsedMs);

    return (
        <aside className="tp-panel" role="complementary" aria-label="Audio transcription">
            <div className="tp-header">
                <div className="tp-header-left">
                    <span className="tp-icon">🎙</span>
                    <span className="tp-title">Quick Transcribe</span>
                    <span className={`tp-status tp-status--${serviceStatus}`}>
                        {serviceStatus === 'checking' ? '···' : serviceStatus === 'online' ? '● online' : '● offline'}
                    </span>
                </div>
                <button className="tp-close" onClick={onClose} aria-label="Close">✕</button>
            </div>

            {serviceStatus === 'offline' && (
                <div className="tp-offline-notice">
                    <p>Local Whisper service not detected.</p>
                    <code>cd transcription-service &amp;&amp; npm start</code>
                    <p className="tp-offline-sub">Runs on port 3001 · no API key needed</p>
                </div>
            )}

            {serviceStatus === 'online' && panelState === 'idle' && (
                <div
                    className={`tp-dropzone${dragging ? ' tp-dropzone--active' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
                >
                    <span className="tp-drop-icon">🎵</span>
                    <p className="tp-drop-label">Drop audio here or click to browse</p>
                    <p className="tp-drop-sub">mp3 · wav · flac · aac · m4a · mp4 · ogg</p>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept={ACCEPTED_TYPES}
                        style={{ display: 'none' }}
                        onChange={(e) => {
                            handleFile(e.target.files?.[0]);
                            e.currentTarget.value = '';
                        }}
                    />
                </div>
            )}

            {isWorking && (
                <div className="tp-progress-wrap">
                    <p className="tp-filename">{fileName}</p>
                    <div className="tp-progress-stats">
                        <span>{formatBytes(jobMeta.sourceBytes)} source</span>
                        <span>{formatBytes(jobMeta.uploadBytes)} upload</span>
                        {jobMeta.durationSeconds !== null && <span>{formatClock(jobMeta.durationSeconds)} audio</span>}
                    </div>
                    <div
                        className="tp-progress-track"
                        role="progressbar"
                        aria-valuenow={Math.round(progress)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuetext={`${progressLabel}, ${Math.round(progress)} percent`}
                    >
                        <div className="tp-progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="tp-progress-header">
                        <p className="tp-progress-label">{progressLabel}</p>
                        <p className="tp-progress-pct">{Math.round(progress)}%</p>
                    </div>
                    <div className="tp-progress-meta">
                        <p className="tp-progress-detail">{progressDetail}</p>
                        <p className="tp-progress-elapsed">{progressTimingLabel}</p>
                    </div>
                    <p className="tp-progress-hint">{stageDetailHint}</p>
                    <p className="tp-cipher-label">{cipherProg || progressDetail || progressLabel}</p>
                    <div className="tp-stage-list" aria-label="Transcription stages">
                        {STAGE_ORDER.map((stage) => {
                            const currentIndex = STAGE_ORDER.indexOf(workPhase);
                            const stageIndex = STAGE_ORDER.indexOf(stage);
                            const status = stageIndex < currentIndex ? 'done' : stageIndex === currentIndex ? 'active' : 'pending';
                            return (
                                <div key={stage} className={`tp-stage-item tp-stage-item--${status}`}>
                                    <span className="tp-stage-dot" aria-hidden="true" />
                                    <span className="tp-stage-copy">
                                        <span className="tp-stage-title">{STAGE_COPY[stage].title}</span>
                                        <span className="tp-stage-state">
                                            {status === 'done' ? 'complete' : status === 'active' ? 'in progress' : STAGE_COPY[stage].state}
                                        </span>
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {panelState === 'error' && (
                <div className="tp-error">
                    <p>Transcription failed</p>
                    <code>{errorMsg}</code>
                    <button className="tp-retry-btn" onClick={resetRunState}>
                        Try again
                    </button>
                </div>
            )}

            {panelState === 'done' && (
                <div className="tp-results">
                    <div className="tp-results-header">
                        <span className="tp-filename">{fileName}</span>
                        <span className="tp-word-count">{wordTimings.length} words</span>
                    </div>

                    <div className="tp-words-scroll">
                        {wordTimings.map((w, i) => (
                            <span key={i} className="tp-word" title={`${formatTime(w.start)} → ${formatTime(w.end)}`}>
                                {w.text}
                            </span>
                        ))}
                    </div>

                    <div className="tp-actions">
                        <button className="tp-use-btn" onClick={handleUseLyrics}>
                            Use Lyrics ↗
                        </button>
                        <button className="tp-again-btn" onClick={resetRunState}>
                            New file
                        </button>
                    </div>
                </div>
            )}
        </aside>
    );
}
