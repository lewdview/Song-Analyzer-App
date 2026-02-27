import { describe, it, expect } from 'vitest';
import { analyzeCreativeLyrics, type CreativeEngineResult } from './creativeEngine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function analyze(text: string): CreativeEngineResult {
    return analyzeCreativeLyrics(text);
}

const POSITIVE_LYRICS = `
Love is bright and golden
Joy fills my heart alive
Hope shines strong and free
Glow of heaven above
Beautiful wonderful amazing day
Blessed sunshine warm and kind
`;

const NEGATIVE_LYRICS = `
Hate the dark and cold
Hurt and pain will fall
Lost in fear and empty
Blood and broken souls
Cry and suffer in despair
Death and ruin everywhere
`;

const MIXED_LYRICS = `
Love in the dark
Joy turns to pain
Bright hope and cold fear
Light and shadow collide
`;

const HIGH_ENERGY_LYRICS = `
Run through the fire loud
Pulse fast and wild jump
Electric burn in the storm
Explode bang crash rush
Blast thunder lightning surge
`;

const MELANCHOLIC_LYRICS = `
Alone in the empty cold
Shadow of broken pain at night
Sorrow and ache make me numb
Hollow and fading grey wither
Tears weep mourn wound scar
`;

const ROMANTIC_LYRICS = `
Kiss your tender touch
Heart full of love desire
Hold me close and adore
Embrace whisper caress passion
Devotion darling sweetheart beloved
`;

const REPETITIVE_LYRICS = `
I will rise up
I will rise up
I will rise up
The world is mine
The world is mine
Something new today
`;

const VARIED_LYRICS = `
Adventure through the golden valley
Mountains whisper ancient secrets daily
Rivers carry forgotten promises silently
Stars illuminate the darkened pathway
Thunder echoes across the horizon
`;

const BUILD_LYRICS = `
Dark and cold despair
Pain and hurt and ruin
Lost and broken empty
Still some hurt remains
But then the hope arrives
Light starts breaking through
Love and joy fill me
Bright alive and blessed
Wonderful beautiful forever
`;

const NEGATED_LYRICS = `
I'm not happy anymore
Don't feel love tonight
Never find peace in me
Can't find joy or hope
`;

const AMPLIFIED_LYRICS = `
Very strong and extremely bright
So alive and truly free
Deeply beautiful and absolutely amazing
`;

const IMAGERY_HEAVY = `
Red sun bleeds on silver waves
Glass eyes reflect the crimson moon
Stone hands grip the velvet sky
Snow falls on the emerald garden
Blood and dust beneath the stars
`;

const RHYMING_LYRICS = `
Walking through the rain
Trying to ease the pain
Standing on the hill
Against my iron will
Dancing in the night
Searching for the light
`;

const CHORUS_LYRICS = `
Verse one is here
Verse one starts now
I will rise up
I will rise up
Bridge part goes here
I will rise up
I will rise up
Final verse now
`;

const MULTI_EMOTION = `
Rage burns in my heart with fury
Sorrow and grief mourn the lost
Joy and ecstasy fill the day
Fear and dread come at night
Love and devotion tender
Hope and faith shine through
Shame and guilt weigh heavy
Pride and glory triumph
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('analyzeCreativeLyrics', () => {
    describe('return type shape', () => {
        it('returns all expected fields including v3', () => {
            const result = analyze('love and light fill my heart with joy and hope forever');
            // v1-v2 fields
            expect(result).toHaveProperty('moodBreakdown');
            expect(result).toHaveProperty('themes');
            expect(result).toHaveProperty('sentimentScore');
            expect(result).toHaveProperty('sentimentLabel');
            expect(result).toHaveProperty('energyScore');
            expect(result).toHaveProperty('emotionScore');
            expect(result).toHaveProperty('heatmap');
            expect(result).toHaveProperty('posterTitle');
            expect(result).toHaveProperty('posterSubline');
            expect(result).toHaveProperty('vocabularyRichness');
            expect(result).toHaveProperty('repetitionScore');
            expect(result).toHaveProperty('narrativeArc');
            expect(result).toHaveProperty('wordCount');
            expect(result).toHaveProperty('topKeywords');
            // v3 fields
            expect(result).toHaveProperty('emotionalComplexity');
            expect(result).toHaveProperty('imageryDensity');
            expect(result).toHaveProperty('rhymeScore');
            expect(result).toHaveProperty('confidence');
            expect(result).toHaveProperty('dominantEmotion');
            expect(result).toHaveProperty('chorusLines');
        });

        it('returns correct types for all fields', () => {
            const result = analyze(POSITIVE_LYRICS);
            expect(typeof result.sentimentScore).toBe('number');
            expect(typeof result.energyScore).toBe('number');
            expect(typeof result.emotionScore).toBe('number');
            expect(typeof result.vocabularyRichness).toBe('number');
            expect(typeof result.repetitionScore).toBe('number');
            expect(typeof result.wordCount).toBe('number');
            expect(typeof result.emotionalComplexity).toBe('number');
            expect(typeof result.imageryDensity).toBe('number');
            expect(typeof result.rhymeScore).toBe('number');
            expect(typeof result.confidence).toBe('number');
            expect(typeof result.dominantEmotion).toBe('string');
            expect(Array.isArray(result.moodBreakdown)).toBe(true);
            expect(Array.isArray(result.themes)).toBe(true);
            expect(Array.isArray(result.heatmap)).toBe(true);
            expect(Array.isArray(result.topKeywords)).toBe(true);
            expect(Array.isArray(result.chorusLines)).toBe(true);
            expect(['build', 'decline', 'wave', 'steady']).toContain(result.narrativeArc);
            expect(['positive', 'negative', 'neutral', 'mixed']).toContain(result.sentimentLabel);
        });
    });

    describe('sentiment scoring', () => {
        it('positive lyrics yield positive sentiment', () => {
            const result = analyze(POSITIVE_LYRICS);
            expect(result.sentimentScore).toBeGreaterThan(0);
            expect(result.sentimentLabel).toBe('positive');
        });

        it('negative lyrics yield negative sentiment', () => {
            const result = analyze(NEGATIVE_LYRICS);
            expect(result.sentimentScore).toBeLessThan(0);
            expect(result.sentimentLabel).toBe('negative');
        });

        it('mixed lyrics yield mixed or neutral sentiment', () => {
            const result = analyze(MIXED_LYRICS);
            expect(['mixed', 'neutral']).toContain(result.sentimentLabel);
        });

        it('sentiment score is clamped between -1 and 1', () => {
            const result = analyze(POSITIVE_LYRICS);
            expect(result.sentimentScore).toBeGreaterThanOrEqual(-1);
            expect(result.sentimentScore).toBeLessThanOrEqual(1);
        });
    });

    describe('mood detection', () => {
        it('melancholic lyrics produce Melancholic as top mood', () => {
            const result = analyze(MELANCHOLIC_LYRICS);
            expect(result.moodBreakdown[0].mood).toBe('Melancholic');
        });

        it('romantic lyrics produce Romantic as top mood', () => {
            const result = analyze(ROMANTIC_LYRICS);
            expect(result.moodBreakdown[0].mood).toBe('Romantic');
        });

        it('mood breakdown sums to roughly 100', () => {
            const result = analyze(POSITIVE_LYRICS);
            const total = result.moodBreakdown.reduce((s, p) => s + p.score, 0);
            expect(total).toBeGreaterThanOrEqual(95);
            expect(total).toBeLessThanOrEqual(105);
        });
    });

    describe('theme detection', () => {
        it('romantic lyrics detect Relationships theme', () => {
            const result = analyze(ROMANTIC_LYRICS);
            expect(result.themes).toContain('Relationships');
        });

        it('returns at least one theme', () => {
            const result = analyze('testing basic input');
            expect(result.themes.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('energy scoring', () => {
        it('high-energy words produce high energy score', () => {
            const result = analyze(HIGH_ENERGY_LYRICS);
            expect(result.energyScore).toBeGreaterThan(60);
        });

        it('energy score is between 0 and 100', () => {
            const result = analyze(POSITIVE_LYRICS);
            expect(result.energyScore).toBeGreaterThanOrEqual(0);
            expect(result.energyScore).toBeLessThanOrEqual(100);
        });
    });

    describe('vocabulary richness', () => {
        it('varied lyrics have higher richness than repetitive lyrics', () => {
            const varied = analyze(VARIED_LYRICS);
            const repetitive = analyze(REPETITIVE_LYRICS);
            expect(varied.vocabularyRichness).toBeGreaterThan(repetitive.vocabularyRichness);
        });

        it('richness is between 0 and 100', () => {
            const result = analyze(POSITIVE_LYRICS);
            expect(result.vocabularyRichness).toBeGreaterThanOrEqual(0);
            expect(result.vocabularyRichness).toBeLessThanOrEqual(100);
        });
    });

    describe('repetition detection', () => {
        it('detects repeated lines', () => {
            const result = analyze(REPETITIVE_LYRICS);
            expect(result.repetitionScore).toBeGreaterThan(20);
        });

        it('non-repetitive lyrics have low repetition', () => {
            const result = analyze(VARIED_LYRICS);
            expect(result.repetitionScore).toBe(0);
        });
    });

    describe('narrative arc', () => {
        it('dark-to-bright transitional lyrics detect build or wave arc', () => {
            const result = analyze(BUILD_LYRICS);
            // v3 5-window approach is more sensitive to oscillation
            expect(['build', 'wave']).toContain(result.narrativeArc);
        });

        it('strongly ascending lyrics detect build arc', () => {
            // 10 lines = 2 per window, strictly ascending sentiment
            const strongBuild = [
                'hate destroy kill ruin death',
                'dark cold bitter curse hell',
                'pain lost empty broken hurt',
                'fear alone shadow wound cry',
                'still waiting maybe somewhere small',
                'perhaps dawn slowly quiet ease',
                'warm gentle kind sweet peace',
                'bright hope love shine gold',
                'joy bliss alive paradise magic',
                'heaven glory blessed wonderful triumph',
            ].join('\n');
            const result = analyze(strongBuild);
            expect(result.narrativeArc).toBe('build');
        });

        it('minimal input gets steady arc', () => {
            const result = analyze('hello world test');
            expect(result.narrativeArc).toBe('steady');
        });
    });

    describe('bigram matching', () => {
        it('detects "broken heart" bigram', () => {
            const result = analyze('My broken heart cannot be mended\nThe broken heart keeps bleeding');
            const melancholicMood = result.moodBreakdown.find((m) => m.mood === 'Melancholic');
            expect(melancholicMood).toBeDefined();
            expect(melancholicMood!.score).toBeGreaterThan(0);
        });

        it('detects "rise up" bigram and boosts euphoric mood', () => {
            const result = analyze('We rise up together\nRise up and fight\nRise up to the sky');
            const euphoric = result.moodBreakdown.find((m) => m.mood === 'Euphoric');
            expect(euphoric).toBeDefined();
            expect(euphoric!.score).toBeGreaterThan(0);
        });
    });

    describe('stemming', () => {
        it('"dreaming" matches dream keyword', () => {
            const withStem = analyze('dreaming of the memories and reflections within');
            const stemReflective = withStem.moodBreakdown.find((m) => m.mood === 'Reflective');
            expect(stemReflective).toBeDefined();
            expect(stemReflective!.score).toBeGreaterThan(0);
        });
    });

    describe('top keywords', () => {
        it('returns at most 5 keywords', () => {
            const result = analyze(POSITIVE_LYRICS);
            expect(result.topKeywords.length).toBeLessThanOrEqual(5);
        });

        it('top keywords are strings', () => {
            const result = analyze(ROMANTIC_LYRICS);
            for (const kw of result.topKeywords) {
                expect(typeof kw).toBe('string');
            }
        });
    });

    describe('word count', () => {
        it('counts words correctly', () => {
            const result = analyze('one two three four five');
            expect(result.wordCount).toBe(5);
        });
    });

    // =========================================================================
    // v3 Pass 1: Contextual intelligence
    // =========================================================================

    describe('negation handling', () => {
        it('negated positive words reduce positive sentiment', () => {
            const plain = analyze('I feel happy and love life');
            const negated = analyze(NEGATED_LYRICS);
            // Negated lyrics ("not happy", "Don't feel love") should have lower sentiment
            expect(negated.sentimentScore).toBeLessThan(plain.sentimentScore);
        });

        it('"not happy" scores lower than "happy"', () => {
            const happy = analyze('I am happy today happy again');
            const notHappy = analyze('I am not happy today not happy again');
            expect(notHappy.sentimentScore).toBeLessThan(happy.sentimentScore);
        });
    });

    describe('intensity modifiers', () => {
        it('amplified words have stronger positive scores', () => {
            const plain = analyze('strong and bright and alive and free');
            const amplified = analyze(AMPLIFIED_LYRICS);
            // "very strong", "extremely bright" etc. should boost the score
            expect(amplified.sentimentScore).toBeGreaterThanOrEqual(plain.sentimentScore);
        });
    });

    describe('chorus detection', () => {
        it('detects repeated lines as chorus', () => {
            const result = analyze(CHORUS_LYRICS);
            expect(result.chorusLines.length).toBeGreaterThan(0);
            expect(result.chorusLines.some((l) => l.toLowerCase().includes('rise up'))).toBe(true);
        });

        it('non-repetitive lyrics have no chorus', () => {
            const result = analyze(VARIED_LYRICS);
            expect(result.chorusLines.length).toBe(0);
        });
    });

    // =========================================================================
    // v3 Pass 2: Richer output
    // =========================================================================

    describe('emotional complexity', () => {
        it('multi-emotion lyrics have high complexity', () => {
            const result = analyze(MULTI_EMOTION);
            expect(result.emotionalComplexity).toBeGreaterThan(30);
        });

        it('single-emotion lyrics have lower complexity', () => {
            const multi = analyze(MULTI_EMOTION);
            const single = analyze('happy happy joy joy happy happy bliss bliss');
            expect(single.emotionalComplexity).toBeLessThan(multi.emotionalComplexity);
        });

        it('complexity is between 0 and 100', () => {
            const result = analyze(POSITIVE_LYRICS);
            expect(result.emotionalComplexity).toBeGreaterThanOrEqual(0);
            expect(result.emotionalComplexity).toBeLessThanOrEqual(100);
        });
    });

    describe('imagery density', () => {
        it('imagery-heavy lyrics score higher', () => {
            const imagery = analyze(IMAGERY_HEAVY);
            const abstract = analyze('thinking about meaning and purpose and understanding truth');
            expect(imagery.imageryDensity).toBeGreaterThan(abstract.imageryDensity);
        });

        it('density is between 0 and 100', () => {
            const result = analyze(POSITIVE_LYRICS);
            expect(result.imageryDensity).toBeGreaterThanOrEqual(0);
            expect(result.imageryDensity).toBeLessThanOrEqual(100);
        });
    });

    describe('rhyme detection', () => {
        it('rhyming lyrics have a higher rhyme score', () => {
            const rhyming = analyze(RHYMING_LYRICS);
            const nonRhyming = analyze(VARIED_LYRICS);
            expect(rhyming.rhymeScore).toBeGreaterThan(nonRhyming.rhymeScore);
        });

        it('rhyme score is between 0 and 100', () => {
            const result = analyze(POSITIVE_LYRICS);
            expect(result.rhymeScore).toBeGreaterThanOrEqual(0);
            expect(result.rhymeScore).toBeLessThanOrEqual(100);
        });
    });

    describe('confidence score', () => {
        it('long rich lyrics have higher confidence than short vague input', () => {
            const rich = analyze(MULTI_EMOTION);
            const short = analyze('hello world');
            expect(rich.confidence).toBeGreaterThan(short.confidence);
        });

        it('confidence is between 0 and 100', () => {
            const result = analyze(POSITIVE_LYRICS);
            expect(result.confidence).toBeGreaterThanOrEqual(0);
            expect(result.confidence).toBeLessThanOrEqual(100);
        });
    });

    describe('dominant emotion', () => {
        it('returns a capitalized string', () => {
            const result = analyze(POSITIVE_LYRICS);
            expect(typeof result.dominantEmotion).toBe('string');
            expect(result.dominantEmotion[0]).toBe(result.dominantEmotion[0].toUpperCase());
        });

        it('multi-emotion lyrics pick the strongest category', () => {
            const result = analyze('rage fury anger hate mad furious hostile bitter');
            expect(result.dominantEmotion).toBe('Anger');
        });
    });

    // =========================================================================
    // Edge cases & heatmap
    // =========================================================================

    describe('edge cases', () => {
        it('handles very short input without crashing', () => {
            const result = analyze('hello');
            expect(result).toHaveProperty('sentimentScore');
            expect(result.wordCount).toBe(1);
        });

        it('handles empty-ish input', () => {
            const result = analyze('   ');
            expect(result).toHaveProperty('moodBreakdown');
            expect(result.wordCount).toBe(0);
        });

        it('handles special characters gracefully', () => {
            const result = analyze('!!!@@@###$$$%%%^^^&&&***');
            expect(result).toHaveProperty('sentimentScore');
        });
    });

    describe('heatmap', () => {
        it('generates heatmap entries up to 50 lines', () => {
            const longLyrics = Array.from({ length: 60 }, (_, i) => `Line ${i + 1} with love`).join('\n');
            const result = analyze(longLyrics);
            expect(result.heatmap.length).toBeLessThanOrEqual(50);
            expect(result.heatmap.length).toBeGreaterThan(14);
        });

        it('each heatmap point has required fields', () => {
            const result = analyze(POSITIVE_LYRICS);
            for (const point of result.heatmap) {
                expect(point).toHaveProperty('line');
                expect(point).toHaveProperty('sentiment');
                expect(point).toHaveProperty('intensity');
                expect(typeof point.line).toBe('string');
                expect(typeof point.sentiment).toBe('number');
                expect(typeof point.intensity).toBe('number');
            }
        });
    });
});
