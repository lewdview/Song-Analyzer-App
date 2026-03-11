import type { PosterProps } from './PosterVariants';
import './HoloPoster.css';

export function HoloPoster({ analysis, artistLine, songTitle }: PosterProps) {
    const displayTitle = songTitle?.trim() || analysis.autoTitle;
    const topMoods = analysis.moodBreakdown.slice(0, 3);

    return (
        <div className="hp-poster">
            {/* Holographic shimmer overlay */}
            <div className="hp-shimmer" aria-hidden />

            {/* Resonance badge */}
            <div className="hp-resonance">
                <span className="hp-resonance-value">{analysis.confidence}</span>
                <span className="hp-resonance-label">Resonance</span>
            </div>

            {/* Text content */}
            <div className="hp-text">
                <p className="hp-eyebrow">{artistLine}</p>
                <h3 className="hp-title">{analysis.posterTitle}</h3>
                <p className="hp-subtitle">{analysis.posterSubline}</p>

                {/* Mood pills */}
                <div className="hp-pills">
                    {topMoods.map((m) => (
                        <span key={m.mood} className="hp-pill">{m.mood} {m.score}%</span>
                    ))}
                </div>

                {/* Interpretation */}
                {analysis.interpretation && (
                    <p className="hp-interpretation">{analysis.interpretation}</p>
                )}

                {/* Footer */}
                <div className="hp-footer">
                    <span className="hp-auto-title">{displayTitle}</span>
                    <span className="hp-fingerprint">{analysis.lyricalFingerprint}</span>
                </div>
            </div>
        </div>
    );
}
