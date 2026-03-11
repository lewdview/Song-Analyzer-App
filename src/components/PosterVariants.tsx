import { useState } from 'react';
import type { CreativeEngineResult } from '@/services/creativeEngine';

// ---------------------------------------------------------------------------
// Poster variant types
// ---------------------------------------------------------------------------
export type PosterVariantId = 'cipher' | 'holo' | 'brutalist';

export interface PosterVariant {
    id: PosterVariantId;
    label: string;
    description: string;
}

export const POSTER_VARIANTS: PosterVariant[] = [
    { id: 'cipher', label: 'Cipher', description: 'Dark · cipher-reveal · decode on hover' },
    { id: 'holo', label: 'Holo', description: 'Holographic · prismatic gradient · clean type' },
    { id: 'brutalist', label: 'Brutalist', description: 'Raw · high-contrast · monospace · sharp' },
];

export interface PosterProps {
    analysis: CreativeEngineResult;
    artistLine: string;
    songTitle?: string;
}

// ---------------------------------------------------------------------------
// PosterSwitcher — prev / next arrows with variant label
// ---------------------------------------------------------------------------
interface PosterSwitcherProps {
    current: PosterVariantId;
    onChange: (id: PosterVariantId) => void;
}

export function PosterSwitcher({ current, onChange }: PosterSwitcherProps) {
    const idx = POSTER_VARIANTS.findIndex((v) => v.id === current);
    const variant = POSTER_VARIANTS[idx]!;

    const prev = () => {
        const next = (idx - 1 + POSTER_VARIANTS.length) % POSTER_VARIANTS.length;
        onChange(POSTER_VARIANTS[next]!.id);
    };
    const next = () => {
        const n = (idx + 1) % POSTER_VARIANTS.length;
        onChange(POSTER_VARIANTS[n]!.id);
    };

    return (
        <div className="pv-switcher">
            <button type="button" className="pv-arrow" onClick={prev} aria-label="Previous poster variant">‹</button>
            <div className="pv-label">
                <span className="pv-label-name">{variant.label}</span>
                <span className="pv-label-desc">{variant.description}</span>
            </div>
            <button type="button" className="pv-arrow" onClick={next} aria-label="Next poster variant">›</button>
        </div>
    );
}

// ---------------------------------------------------------------------------
// usePosterVariant — simple state hook
// ---------------------------------------------------------------------------
export function usePosterVariant(initial: PosterVariantId = 'cipher') {
    const [variant, setVariant] = useState<PosterVariantId>(initial);
    return { variant, setVariant };
}
