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
type PanelState = 'idle' | 'compressing' | 'uploading' | 'done' | 'error';

const CIPHER_CHARS = '*%$#@!~^&?≠§±∆Ω';
const randCipher = () => CIPHER_CHARS[Math.floor(Math.random() * CIPHER_CHARS.length)];

function scramble(s: string): string {
    return Array.from(s).map((c) => (c === ' ' ? ' ' : randCipher())).join('');
}

// ---------------------------------------------------------------------------
// Client-side audio → 16 kHz mono WAV via Web Audio API
// ---------------------------------------------------------------------------
async function compressToWav(file: File): Promise<Blob> {
    const TARGET_RATE = 16_000;
    const arrayBuf = await file.arrayBuffer();

    const ctx = new OfflineAudioContext(1, 1, TARGET_RATE);
    const decoded = await new AudioContext().decodeAudioData(arrayBuf);

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
    void ctx; // suppress unused warning — ctx was only used for type inference
    return new Blob([wavBuf], { type: 'audio/wav' });
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
    const [progress, setProgress] = useState(0);                 // 0-100
    const [progressLabel, setProgressLabel] = useState('');
    const [wordTimings, setWordTimings] = useState<WordTiming[]>([]);
    const [fullText, setFullText] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [dragging, setDragging] = useState(false);
    const [fileName, setFileName] = useState('');
    const [cipherProg, setCipherProg] = useState('');            // scrolling cipher
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cipherIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Cipher fill animation while working
    useEffect(() => {
        if (panelState === 'compressing' || panelState === 'uploading') {
            cipherIntervalRef.current = setInterval(() => {
                setCipherProg(scramble(progressLabel.padEnd(28)));
            }, 120);
        } else {
            if (cipherIntervalRef.current) clearInterval(cipherIntervalRef.current);
            setCipherProg('');
        }
        return () => { if (cipherIntervalRef.current) clearInterval(cipherIntervalRef.current); };
    }, [panelState, progressLabel]);

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
        setFileName(file.name);
        setErrorMsg('');
        setWordTimings([]);
        setFullText('');
        setProgress(0);

        try {
            // Step 1: Compress
            setPanelState('compressing');
            setProgressLabel('compressing audio');
            setProgress(15);

            let uploadBlob: Blob;
            try {
                uploadBlob = await compressToWav(file);
                setProgress(40);
            } catch {
                // Compression failed — send raw file (server-side ffmpeg will handle it)
                uploadBlob = file;
                setProgress(35);
            }

            // Step 2: Upload + transcribe
            setPanelState('uploading');
            setProgressLabel('transcribing');
            setProgress(50);

            const formData = new FormData();
            formData.append('audio', uploadBlob, 'audio.wav');
            formData.append('timestamp_mode', 'word');

            const res = await fetch(`${WHISPER_URL}/transcribe`, {
                method: 'POST',
                body: formData,
                signal: AbortSignal.timeout(180_000),
            });

            if (!res.ok) {
                const errText = await res.text().catch(() => res.statusText);
                throw new Error(errText || `HTTP ${res.status}`);
            }

            setProgress(90);
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
            setProgress(100);
            setPanelState('done');
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setErrorMsg(msg);
            setPanelState('error');
        }
    }, []);

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
                        onChange={(e) => handleFile(e.target.files?.[0])}
                    />
                </div>
            )}

            {(panelState === 'compressing' || panelState === 'uploading') && (
                <div className="tp-progress-wrap">
                    <p className="tp-filename">{fileName}</p>
                    <div className="tp-progress-track">
                        <div className="tp-progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="tp-cipher-label">{cipherProg || progressLabel}</p>
                    <p className="tp-progress-pct">{progress}%</p>
                </div>
            )}

            {panelState === 'error' && (
                <div className="tp-error">
                    <p>Transcription failed</p>
                    <code>{errorMsg}</code>
                    <button className="tp-retry-btn" onClick={() => { setPanelState('idle'); setErrorMsg(''); }}>
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
                        <button className="tp-again-btn" onClick={() => { setPanelState('idle'); setWordTimings([]); setFullText(''); }}>
                            New file
                        </button>
                    </div>
                </div>
            )}
        </aside>
    );
}
