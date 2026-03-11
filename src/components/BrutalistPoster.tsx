import type { PosterProps } from './PosterVariants';
import './BrutalistPoster.css';

export function BrutalistPoster({ analysis, artistLine, songTitle }: PosterProps) {
    const displayTitle = songTitle?.trim() || analysis.autoTitle;
    const isPositive = analysis.sentimentScore >= 0;

    return (
        <div className={`bp-poster${isPositive ? ' bp-poster--positive' : ''}`}>
            {/* Header */}
            <div className="bp-header">
                <div>
                    <span className="bp-resonance">
                        {analysis.confidence}
                        <span className="bp-resonance-label">Resonance</span>
                    </span>
                </div>
                <span className="bp-artist">{artistLine}</span>
            </div>

            {/* Body */}
            <div className="bp-body">
                <h3 className="bp-title">{analysis.posterTitle}</h3>
                <p className="bp-subline">{analysis.posterSubline}</p>

                {/* Stats grid */}
                <div className="bp-stats">
                    <div className="bp-stat">
                        <span className="bp-stat-value">{analysis.energyScore}</span>
                        <span className="bp-stat-label">Energy</span>
                    </div>
                    <div className="bp-stat">
                        <span className="bp-stat-value">{analysis.emotionScore}</span>
                        <span className="bp-stat-label">Emotion</span>
                    </div>
                    <div className="bp-stat">
                        <span className="bp-stat-value">{analysis.flowScore}</span>
                        <span className="bp-stat-label">Flow</span>
                    </div>
                    <div className="bp-stat">
                        <span className="bp-stat-value">{analysis.rhymeScore}</span>
                        <span className="bp-stat-label">Rhyme</span>
                    </div>
                    <div className="bp-stat">
                        <span className="bp-stat-value">{analysis.metaphorDensity}</span>
                        <span className="bp-stat-label">Metaphor</span>
                    </div>
                    <div className="bp-stat">
                        <span className="bp-stat-value">{analysis.slangIndex}</span>
                        <span className="bp-stat-label">Slang</span>
                    </div>
                </div>

                {/* Interpretation */}
                {analysis.interpretation && (
                    <p className="bp-interpretation">{analysis.interpretation}</p>
                )}
            </div>

            {/* Footer */}
            <div className="bp-footer">
                <span className="bp-auto-title">{displayTitle}</span>
                <span className="bp-fingerprint">{analysis.lyricalFingerprint}</span>
            </div>
        </div>
    );
}
