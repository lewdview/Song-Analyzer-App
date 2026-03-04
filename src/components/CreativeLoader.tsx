import { useState, useEffect, useRef } from 'react';
import './CreativeLoader.css';

interface CreativeLoaderProps {
    progress: number;       // 0–100
    label?: string;         // e.g. "Uploading files..."
    statusText?: string;    // small text below bar, defaults to cipher animation
}

const CIPHER_CHARS = '*%$#@!~^&?≠§±∆∑π√Ω≈><|';
const CIPHER_STREAM_LEN = 80;

function makeCipherStream(): string {
    return Array.from({ length: CIPHER_STREAM_LEN }, () =>
        CIPHER_CHARS[Math.floor(Math.random() * CIPHER_CHARS.length)]
    ).join(' ');
}

const PCT_SCRAMBLE_CHARS = '0123456789%!#@$?';

function scramblePct(realPct: number): string {
    if (Math.random() < 0.65) return `${Math.round(realPct)}%`;
    // Occasionally show a scrambled digit for theater
    const fake = Math.floor(Math.random() * 10);
    return `${fake}${PCT_SCRAMBLE_CHARS[Math.floor(Math.random() * PCT_SCRAMBLE_CHARS.length)]}`;
}

export function CreativeLoader({ progress, label = 'Processing...', statusText }: CreativeLoaderProps) {
    const [cipherStream, setCipherStream] = useState(makeCipherStream());
    const [displayPct, setDisplayPct] = useState('0%');
    const streamRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pctRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Animate cipher scroll text
    useEffect(() => {
        streamRef.current = setInterval(() => {
            setCipherStream(makeCipherStream());
        }, 180);
        return () => { if (streamRef.current) clearInterval(streamRef.current); };
    }, []);

    // Scramble the percentage display
    useEffect(() => {
        pctRef.current = setInterval(() => {
            setDisplayPct(scramblePct(progress));
        }, 100);
        return () => { if (pctRef.current) clearInterval(pctRef.current); };
    }, [progress]);

    // Once at 100, lock display
    useEffect(() => {
        if (progress >= 100) {
            setDisplayPct('100%');
        }
    }, [progress]);

    const defaultStatus = progress < 100
        ? '[ decoding audio signature... ]'
        : '[ sequence complete ]';

    return (
        <div className="creative-loader">
            <div className="creative-loader__header">
                <span className="creative-loader__label">{label}</span>
                <span className="creative-loader__pct">{displayPct}</span>
            </div>

            <div className="creative-loader__track" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                {/* Scrolling cipher characters behind the fill */}
                <div className="creative-loader__cipher-scroll" aria-hidden="true">
                    <span>{cipherStream}&nbsp;&nbsp;&nbsp;{cipherStream}</span>
                </div>

                {/* Neon fill */}
                <div
                    className="creative-loader__fill"
                    style={{ width: `${Math.min(progress, 100)}%` }}
                />
            </div>

            <div className="creative-loader__status">
                {statusText ?? defaultStatus}
            </div>
        </div>
    );
}
