import { useState, useEffect, useRef, useCallback } from 'react';
import type { CreativeEngineResult } from '@/services/creativeEngine';
import './CipherPoster.css';

interface CipherPosterProps {
    analysis: CreativeEngineResult;
    artistLine: string;
}

const CIPHER_CHARS = '*%$#@!~^&?≠§±∆∑π√Ω≈><|';
const randomCipher = () => CIPHER_CHARS[Math.floor(Math.random() * CIPHER_CHARS.length)];

function makeCipher(text: string): string {
    return Array.from({ length: text.length }, (_, i) =>
        text[i] === ' ' ? ' ' : randomCipher()
    ).join('');
}

interface RevealWord {
    text: string;
    cipher: string;
    revealed: boolean;
}

function useRevealWords(text: string) {
    const [words, setWords] = useState<RevealWord[]>(() =>
        text.split(' ').map((w) => ({ text: w, cipher: makeCipher(w), revealed: false }))
    );

    // Re-scramble unrevealed words every 120ms
    useEffect(() => {
        const id = setInterval(() => {
            setWords((prev) => prev.map((w) => w.revealed ? w : { ...w, cipher: makeCipher(w.text) }));
        }, 120);
        return () => clearInterval(id);
    }, []);

    const reveal = useCallback((i: number) => {
        setWords((prev) => {
            const word = prev[i];
            if (!word || word.revealed) return prev;
            const next = [...prev];
            next[i] = { text: word.text, cipher: word.cipher, revealed: true };
            return next;
        });
    }, []);

    const reset = useCallback(() => {
        setWords(text.split(' ').map((w) => ({ text: w, cipher: makeCipher(w), revealed: false })));
    }, [text]);

    return { words, reveal, reset };
}

export function CipherPoster({ analysis, artistLine }: CipherPosterProps) {
    const titleLine = useRevealWords(analysis.posterTitle);
    const subLine = useRevealWords(analysis.posterSubline);
    const artistRev = useRevealWords(artistLine);
    const [hintVisible, setHintVisible] = useState(true);
    const containerRef = useRef<HTMLDivElement>(null);

    const sentimentIsPositive = analysis.sentimentScore >= 0;

    // Color palette keyed to sentiment
    const accentColor = sentimentIsPositive
        ? 'rgba(255, 160, 40, 0.9)'    // warm amber
        : 'rgba(160, 80, 255, 0.9)';   // deep purple

    const glowColor = sentimentIsPositive
        ? 'rgba(255, 140, 0, 0.65)'
        : 'rgba(140, 0, 255, 0.65)';

    const handleWordReveal = () => setHintVisible(false);

    return (
        <div
            ref={containerRef}
            className="cp-poster"
            style={{
                '--cp-accent': accentColor,
                '--cp-glow': glowColor,
            } as React.CSSProperties}
        >
            {/* === Background SVG orbits (from existing poster code) === */}
            <div className="cp-svg-wrap cp-svg-wrap--lg" aria-hidden>
                <svg viewBox="0 0 200 200" className="cp-svg" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <radialGradient id="cp-core-lg">
                            <stop offset="0%" stopColor={sentimentIsPositive ? '#fbbf24' : '#a855f7'} stopOpacity="0.6" />
                            <stop offset="100%" stopColor={sentimentIsPositive ? '#f97316' : '#6366f1'} stopOpacity="0" />
                        </radialGradient>
                    </defs>
                    <circle cx="100" cy="100" r={20 + analysis.emotionScore * 0.25} fill="url(#cp-core-lg)" className="cp-svg-pulse" style={{ animationDuration: `${3 - analysis.energyScore * 0.015}s` }} />
                    <circle cx="100" cy="100" r="35" fill="none" stroke={sentimentIsPositive ? '#f59e0b' : '#818cf8'} strokeWidth="1.2" strokeOpacity="0.7" strokeDasharray="30 190" strokeLinecap="round" className="cp-svg-orbit" style={{ animationDuration: `${6 - analysis.energyScore * 0.035}s` }} />
                    <circle cx="100" cy="100" r="52" fill="none" stroke={sentimentIsPositive ? '#fbbf24' : '#c084fc'} strokeWidth="1" strokeOpacity="0.55" strokeDasharray="50 280" strokeLinecap="round" className="cp-svg-orbit-reverse" style={{ animationDuration: `${8 - analysis.energyScore * 0.04}s` }} />
                    <circle cx="100" cy="100" r="70" fill="none" stroke={sentimentIsPositive ? '#fb923c' : '#a5b4fc'} strokeWidth="0.8" strokeOpacity="0.4" strokeDasharray="40 400" strokeLinecap="round" className="cp-svg-orbit" style={{ animationDuration: `${12 - analysis.energyScore * 0.06}s` }} />
                    <circle cx="100" cy="100" r="88" fill="none" stroke={sentimentIsPositive ? '#fbbf24' : '#c084fc'} strokeWidth="0.5" strokeOpacity="0.15" strokeDasharray="4 8" className="cp-svg-orbit-reverse" style={{ animationDuration: '20s' }} />
                </svg>
            </div>

            {/* Resonance badge */}
            <div className="cp-resonance">
                <span className="cp-resonance-value">{analysis.confidence}%</span>
                <span className="cp-resonance-label">RESONANCE</span>
            </div>

            {/* Hint */}
            {hintVisible && (
                <p className="cp-hint">hover to decode</p>
            )}

            {/* === Cipher text layers === */}
            <div className="cp-text-stack">
                {/* Artist line */}
                <p className="cp-eyebrow">
                    {artistRev.words.map((w, i) => (
                        <span
                            key={i}
                            className={`cp-word${w.revealed ? ' cp-word--revealed' : ''}`}
                            onMouseEnter={() => { artistRev.reveal(i); handleWordReveal(); }}
                        >
                            {w.revealed ? w.text : w.cipher}
                            {i < artistRev.words.length - 1 ? ' ' : ''}
                        </span>
                    ))}
                </p>

                {/* Title line */}
                <h3 className="cp-title">
                    {titleLine.words.map((w, i) => (
                        <span
                            key={i}
                            className={`cp-word${w.revealed ? ' cp-word--revealed' : ''}`}
                            onMouseEnter={() => { titleLine.reveal(i); handleWordReveal(); }}
                        >
                            {w.revealed ? w.text : w.cipher}
                            {i < titleLine.words.length - 1 ? ' ' : ''}
                        </span>
                    ))}
                </h3>

                {/* Subline */}
                <p className="cp-subtitle">
                    {subLine.words.map((w, i) => (
                        <span
                            key={i}
                            className={`cp-word${w.revealed ? ' cp-word--revealed' : ''}`}
                            onMouseEnter={() => { subLine.reveal(i); handleWordReveal(); }}
                        >
                            {w.revealed ? w.text : w.cipher}
                            {i < subLine.words.length - 1 ? ' ' : ''}
                        </span>
                    ))}
                </p>
            </div>

            {/* Reset button */}
            <button className="cp-reset-btn" onClick={() => {
                titleLine.reset();
                subLine.reset();
                artistRev.reset();
                setHintVisible(true);
            }}>
                ↺ re-encrypt
            </button>
        </div>
    );
}
