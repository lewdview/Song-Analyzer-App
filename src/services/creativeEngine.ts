// ---------------------------------------------------------------------------
// Creative Engine – Enhanced Lyrics Analysis
// ---------------------------------------------------------------------------
// All scoring is client-side, zero external dependencies.
// v2: expanded lexicons, weighted scoring, lightweight stemming, bigrams,
//     vocabulary richness, repetition detection, narrative arc.
// v3 pass 1: negation handling, intensity modifiers, chorus-aware weighting,
//            sliding-window narrative arc.
// v3 pass 2: emotional complexity, imagery density, rhyme detection,
//            confidence score, dominant emotion.
// v4 pass 1: syllabic flow scoring (rhythm feel).
// v4 pass 2: metaphor / figurative language density.
// v4 pass 3: slang / dialect authenticity index.
// v4 pass 4: sentiment sharpness (peak vs. mean spread).
// v4 pass 5: lyrical fingerprint (short human-readable voice descriptor).
// ---------------------------------------------------------------------------

export type MoodBreakdownPoint = {
  mood: string;
  score: number;
};

export type HeatmapPoint = {
  line: string;
  sentiment: number;
  intensity: number;
};

export type CreativeEngineResult = {
  moodBreakdown: MoodBreakdownPoint[];
  themes: string[];
  sentimentScore: number;
  sentimentLabel: 'positive' | 'negative' | 'neutral' | 'mixed';
  energyScore: number;
  emotionScore: number;
  heatmap: HeatmapPoint[];
  posterTitle: string;
  posterSubline: string;
  // v2 additions
  vocabularyRichness: number;   // 0-100  (type-token ratio)
  repetitionScore: number;      // 0-100  (line repetition %)
  narrativeArc: 'build' | 'decline' | 'wave' | 'steady';
  wordCount: number;
  topKeywords: string[];        // top-5 significant matched words
  // v3 pass 2 additions
  emotionalComplexity: number;  // 0-100  (how many distinct emotional categories active)
  imageryDensity: number;       // 0-100  (sensory/concrete word ratio)
  rhymeScore: number;           // 0-100  (end-line rhyme density)
  confidence: number;           // 0-100  (analysis reliability based on signal strength)
  dominantEmotion: string;      // single strongest emotion label
  chorusLines: string[];        // detected chorus/hook lines
  // v4 additions
  flowScore: number;            // 0-100  (syllabic rhythm / perceived flow)
  metaphorDensity: number;      // 0-100  (figurative language ratio)
  slangIndex: number;           // 0-100  (dialect / street-language authenticity)
  sentimentSharpness: number;   // 0-100  (how extreme the sentiment peaks are)
  lyricalFingerprint: string;   // short human-readable voice descriptor
  autoTitle: string;            // evocative auto-generated song title
  interpretation?: string; // Optional for backward compatibility with older v3 records
};

// ---------------------------------------------------------------------------
// Lexicons  (weighted: Map<word, weight>)
// ---------------------------------------------------------------------------

function wm(entries: [string, number][]): Map<string, number> {
  return new Map(entries);
}

/** Shorthand: all words get weight 1 */
function flat(words: string[]): Map<string, number> {
  return new Map(words.map((w) => [w, 1]));
}

/** Merge multiple maps; later entries override earlier ones */
function merge(...maps: Map<string, number>[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of maps) for (const [k, v] of m) out.set(k, v);
  return out;
}

// ---- Mood Lexicon ----
const MOOD_LEXICON: Record<string, Map<string, number>> = {
  cinematic: merge(
    wm([['scene', 2], ['screen', 2], ['camera', 2], ['spotlight', 2], ['echo', 1.5], ['frame', 1.5]]),
    flat(['horizon', 'silhouette', 'curtain', 'stage', 'film', 'lense', 'panorama', 'epic',
      'orchestra', 'score', 'motion', 'flashback', 'sequence', 'dramatic', 'tale',
      'chapter', 'story', 'legend', 'saga', 'soundtrack', 'credits', 'montage',
      'opening', 'finale', 'visual', 'projection']),
  ),
  melancholic: merge(
    wm([['alone', 2], ['empty', 2], ['cold', 1.5], ['shadow', 2], ['broken', 2], ['pain', 2], ['night', 1]]),
    flat(['sorrow', 'ache', 'numb', 'hollow', 'fading', 'grey', 'gray', 'wither',
      'drown', 'sink', 'tear', 'tears', 'weep', 'mourn', 'wound', 'scar',
      'shatter', 'crumble', 'haunted', 'ghost', 'absence', 'void', 'bleed',
      'longing', 'miss', 'regret', 'heavy', 'burden', 'despair']),
  ),
  euphoric: merge(
    wm([['shine', 2], ['fly', 2], ['alive', 2.5], ['gold', 1.5], ['glow', 2], ['rush', 2], ['high', 1.5]]),
    flat(['soar', 'bliss', 'ecstasy', 'thrill', 'spark', 'ignite', 'radiant', 'dazzle',
      'bloom', 'blossom', 'float', 'elevate', 'infinite', 'limitless', 'euphoria',
      'paradise', 'wings', 'summit', 'peak', 'climax', 'electric', 'pulse',
      'explode', 'burst', 'transcend', 'ascend', 'unstoppable']),
  ),
  rebellious: merge(
    wm([['fight', 2], ['fire', 2], ['storm', 2], ['wild', 2], ['rage', 2.5], ['rule', 1], ['break', 1.5]]),
    flat(['rebel', 'revolution', 'riot', 'defy', 'resist', 'overthrow', 'chaos',
      'destroy', 'burn', 'roar', 'fierce', 'savage', 'war', 'battle', 'clash',
      'warrior', 'blade', 'strike', 'conquer', 'uprising', 'anarchy', 'outlaw',
      'fearless', 'unleash', 'rampage', 'wreck', 'smash']),
  ),
  romantic: merge(
    wm([['kiss', 2.5], ['touch', 2], ['heart', 2], ['love', 3], ['desire', 2], ['hold', 1.5], ['adore', 2]]),
    flat(['embrace', 'tender', 'whisper', 'caress', 'passion', 'devotion', 'darling',
      'sweetheart', 'soulmate', 'beloved', 'enchant', 'seduce', 'blush', 'romance',
      'intimate', 'warm', 'gentle', 'cherish', 'yearn', 'longing', 'affection',
      'forever', 'promise', 'wedding', 'roses', 'candlelight', 'honey']),
  ),
  reflective: merge(
    wm([['memory', 2], ['remember', 2], ['dream', 2], ['mirror', 1.5], ['inside', 1], ['quiet', 1.5]]),
    flat(['wonder', 'think', 'ponder', 'contemplate', 'meditate', 'stillness', 'silence',
      'gaze', 'observe', 'reflect', 'introspect', 'journal', 'nostalgia', 'past',
      'yesterday', 'childhood', 'grow', 'lesson', 'wisdom', 'understand',
      'realize', 'awaken', 'clarity', 'insight', 'meaning', 'purpose']),
  ),
};

// ---- Theme Lexicon ----
const THEME_LEXICON: Record<string, Map<string, number>> = {
  identity: merge(
    wm([['myself', 2], ['name', 1.5], ['face', 1.5], ['truth', 2], ['becoming', 2]]),
    flat(['me', 'soul', 'self', 'who', 'real', 'authentic', 'mask', 'mirror',
      'reflection', 'persona', 'character', 'essence', 'core', 'skin',
      'born', 'origin', 'roots', 'heritage', 'blood', 'dna',
      'fingerprint', 'signature', 'voice', 'unique', 'different']),
  ),
  ambition: merge(
    wm([['rise', 2], ['win', 2], ['crown', 2], ['goal', 1.5], ['future', 1.5], ['grind', 2]]),
    flat(['hustle', 'climb', 'throne', 'empire', 'legacy', 'achieve', 'conquer',
      'succeed', 'build', 'dream', 'vision', 'destiny', 'greatness',
      'champion', 'victory', 'glory', 'power', 'level', 'boss', 'king',
      'queen', 'reign', 'dominate', 'elite', 'top', 'summit', 'mission']),
  ),
  relationships: merge(
    wm([['together', 2], ['apart', 2], ['promise', 2]]),
    flat(['you', 'us', 'we', 'friend', 'lover', 'partner', 'family', 'brother',
      'sister', 'mother', 'father', 'bond', 'connection', 'trust',
      'loyalty', 'betray', 'goodbye', 'hello', 'distance', 'close',
      'miss', 'return', 'wait', 'stay', 'leave', 'home', 'belong']),
  ),
  nightlife: merge(
    wm([['city', 1.5], ['club', 2], ['neon', 2], ['midnight', 2], ['drive', 1.5], ['lights', 1.5]]),
    flat(['party', 'dance', 'bass', 'dj', 'drink', 'bottle', 'vip', 'downtown',
      'street', 'highway', 'cruise', 'ride', 'night', 'late', 'dawn',
      'sunset', 'skyline', 'rooftop', 'underground', 'afterhours',
      'smoke', 'haze', 'strobe', 'flash', 'vibes', 'groove', 'beat']),
  ),
  healing: merge(
    wm([['heal', 2.5], ['breathe', 2], ['calm', 1.5], ['peace', 2], ['forgive', 2.5], ['release', 2]]),
    flat(['recover', 'restore', 'mend', 'cleanse', 'purify', 'renew', 'rebirth',
      'therapy', 'meditation', 'prayer', 'hope', 'faith', 'strength',
      'survive', 'overcome', 'rise', 'light', 'grace', 'gratitude',
      'acceptance', 'surrender', 'letting', 'moving', 'forward', 'growth', 'transform']),
  ),
  chaos: merge(
    wm([['noise', 2], ['crash', 2], ['smoke', 1.5], ['blood', 2], ['fall', 1.5], ['edge', 1.5]]),
    flat(['shatter', 'wreck', 'ruin', 'collapse', 'explode', 'detonate', 'fracture',
      'spiral', 'tornado', 'earthquake', 'apocalypse', 'doom', 'abyss',
      'madness', 'insanity', 'frenzy', 'anarchy', 'danger', 'panic',
      'scream', 'howl', 'distort', 'static', 'glitch', 'corrupt', 'inferno']),
  ),
};

// ---- Sentiment & feature words ----
const POSITIVE_WORDS: Map<string, number> = merge(
  wm([['love', 3], ['bright', 2], ['gold', 1.5], ['joy', 2.5], ['alive', 2.5], ['strong', 2],
  ['free', 2], ['hope', 2.5], ['glow', 2], ['heaven', 2], ['rise', 1.5]]),
  flat(['happy', 'smile', 'laugh', 'beautiful', 'wonderful', 'amazing', 'blessed',
    'sunshine', 'light', 'warm', 'kind', 'gentle', 'peace', 'bliss', 'radiant',
    'glory', 'grace', 'sweet', 'divine', 'paradise', 'grateful', 'thankful',
    'celebrate', 'triumph', 'magic', 'miracle', 'delight', 'treasure', 'precious']),
);

const NEGATIVE_WORDS: Map<string, number> = merge(
  wm([['hate', 3], ['dark', 2], ['cold', 1.5], ['hurt', 2.5], ['pain', 2.5], ['fall', 1.5],
  ['lost', 2], ['fear', 2.5], ['empty', 2], ['blood', 2], ['broken', 2.5]]),
  flat(['cry', 'suffer', 'dying', 'death', 'kill', 'destroy', 'ruin', 'hell',
    'damn', 'curse', 'wicked', 'evil', 'poison', 'toxic', 'bitter', 'cruel',
    'betray', 'abandon', 'reject', 'worthless', 'hopeless', 'desperate',
    'drown', 'choke', 'bleed', 'scar', 'wound', 'grave', 'bury']),
);

const ENERGY_WORDS: Map<string, number> = merge(
  wm([['run', 2], ['fire', 2.5], ['loud', 2], ['pulse', 2], ['fast', 2], ['wild', 2],
  ['jump', 2], ['electric', 2], ['burn', 2], ['storm', 2]]),
  flat(['explode', 'bang', 'crash', 'rush', 'blast', 'thunder', 'lightning',
    'accelerate', 'charge', 'ignite', 'detonate', 'surge', 'erupt',
    'scream', 'shout', 'roar', 'rage', 'fury', 'intense', 'turbo',
    'rocket', 'launch', 'power', 'force', 'strike']),
);

const CALM_WORDS: Map<string, number> = merge(
  wm([['slow', 2], ['still', 2], ['quiet', 2], ['soft', 2], ['breathe', 2], ['sleep', 2],
  ['drift', 1.5], ['calm', 2.5]]),
  flat(['whisper', 'gentle', 'tender', 'serene', 'tranquil', 'peaceful', 'soothe',
    'ease', 'rest', 'lullaby', 'cradle', 'silence', 'hush', 'mellow',
    'float', 'silk', 'feather', 'cloud', 'ocean', 'breeze', 'moon',
    'evening', 'twilight', 'dawn', 'morning']),
);

const EMOTION_WORDS: Map<string, number> = merge(
  wm([['heart', 2.5], ['soul', 2.5], ['tears', 2], ['cry', 2], ['smile', 2],
  ['desire', 2], ['lonely', 2.5], ['faith', 2], ['faithful', 2], ['dream', 2]]),
  flat(['feel', 'feeling', 'emotion', 'passion', 'sorrow', 'grief', 'mourn',
    'ache', 'yearn', 'long', 'miss', 'regret', 'shame', 'guilt', 'pride',
    'anger', 'jealous', 'envy', 'nervous', 'anxious', 'afraid',
    'courage', 'brave', 'vulnerable', 'raw', 'naked', 'expose']),
);

// ---- v3 pass 2: Imagery / sensory words ----
const IMAGERY_WORDS: Map<string, number> = flat([
  // Colors
  'red', 'blue', 'green', 'gold', 'silver', 'white', 'black', 'crimson', 'scarlet',
  'violet', 'amber', 'emerald', 'ivory', 'grey', 'gray', 'purple', 'pink', 'neon',
  // Nature
  'sun', 'moon', 'star', 'stars', 'rain', 'river', 'ocean', 'sea', 'mountain',
  'forest', 'flower', 'rose', 'sky', 'cloud', 'thunder', 'snow', 'wind', 'earth',
  'flame', 'ice', 'stone', 'sand', 'wave', 'tree', 'garden', 'field', 'desert',
  // Body / sensory
  'eyes', 'hands', 'lips', 'skin', 'blood', 'bones', 'breath', 'voice', 'tongue',
  'fingers', 'chest', 'spine', 'veins', 'flesh', 'sweat',
  // Objects / textures
  'glass', 'mirror', 'diamond', 'crown', 'blade', 'silk', 'velvet', 'steel',
  'smoke', 'dust', 'ashes', 'chains', 'cage', 'door', 'window', 'wall',
  // Light/dark/sound
  'glow', 'shadow', 'spark', 'flash', 'echo', 'whisper', 'roar', 'silence',
]);

// ---- v3 pass 1: Emotion categories for complexity scoring ----
const EMOTION_CATEGORIES: Record<string, Set<string>> = {
  anger: new Set(['anger', 'rage', 'fury', 'hate', 'mad', 'furious', 'wrathful', 'livid', 'hostile', 'bitter', 'resentment']),
  sadness: new Set(['sad', 'sorrow', 'grief', 'mourn', 'weep', 'cry', 'tears', 'melancholy', 'despair', 'heartbreak', 'miserable']),
  joy: new Set(['joy', 'happy', 'bliss', 'delight', 'ecstasy', 'euphoria', 'cheerful', 'elation', 'jubilant', 'celebrate', 'thrill']),
  fear: new Set(['fear', 'afraid', 'scared', 'terror', 'dread', 'panic', 'anxious', 'nervous', 'horror', 'fright', 'worry']),
  love: new Set(['love', 'adore', 'cherish', 'devotion', 'romance', 'passion', 'tender', 'affection', 'desire', 'intimate', 'embrace']),
  hope: new Set(['hope', 'faith', 'believe', 'dream', 'wish', 'aspire', 'inspire', 'optimism', 'promise', 'trust', 'miracle']),
  shame: new Set(['shame', 'guilt', 'regret', 'embarrass', 'humiliate', 'disgrace', 'remorse', 'sorry', 'apologize', 'blame']),
  pride: new Set(['pride', 'proud', 'glory', 'triumph', 'victory', 'champion', 'conquer', 'dominate', 'reign', 'king', 'queen']),
};

// ---- v3 pass 1: Negation and intensity ----
const NEGATION_WORDS = new Set([
  'not', 'no', 'never', 'neither', 'nobody', 'nothing', 'nowhere', 'none',
  "don't", "doesn't", "didn't", "won't", "wouldn't", "can't", "couldn't",
  "isn't", "aren't", "wasn't", "weren't", "shouldn't", "hasn't", "haven't",
  'without', 'lack', 'nor',
]);

const INTENSITY_AMPLIFIERS = new Set([
  'very', 'so', 'extremely', 'incredibly', 'absolutely', 'totally', 'completely',
  'truly', 'deeply', 'really', 'always', 'forever', 'intensely', 'overwhelmingly',
  'purely', 'utterly', 'supremely',
]);

const INTENSITY_DAMPENERS = new Set([
  'barely', 'slightly', 'somewhat', 'almost', 'hardly', 'rarely', 'scarcely',
  'maybe', 'perhaps', 'little', 'sorta', 'kinda',
]);

// ---- Bigram phrases (scored as a single concept) ----
const BIGRAM_PHRASES: { phrase: string; mood?: string; theme?: string; sentiment?: number; energy?: number; emotion?: number; weight: number }[] = [
  { phrase: 'broken heart', mood: 'melancholic', theme: 'relationships', sentiment: -0.3, emotion: 2, weight: 3 },
  { phrase: 'true love', mood: 'romantic', theme: 'relationships', sentiment: 0.4, emotion: 2, weight: 3 },
  { phrase: 'fall apart', mood: 'melancholic', sentiment: -0.3, emotion: 1.5, weight: 2.5 },
  { phrase: 'let go', mood: 'reflective', theme: 'healing', sentiment: 0.1, weight: 2 },
  { phrase: 'run away', mood: 'rebellious', theme: 'chaos', energy: 2, weight: 2 },
  { phrase: 'hold on', mood: 'reflective', theme: 'relationships', emotion: 1.5, weight: 2 },
  { phrase: 'give up', mood: 'melancholic', sentiment: -0.2, weight: 2 },
  { phrase: 'rise up', mood: 'euphoric', theme: 'ambition', energy: 2, sentiment: 0.3, weight: 2.5 },
  { phrase: 'burn out', mood: 'melancholic', theme: 'chaos', energy: 1, sentiment: -0.2, weight: 2 },
  { phrase: 'on fire', mood: 'euphoric', energy: 3, sentiment: 0.2, weight: 2.5 },
  { phrase: 'break free', mood: 'rebellious', theme: 'healing', energy: 2, sentiment: 0.3, weight: 2.5 },
  { phrase: 'dark night', mood: 'melancholic', theme: 'nightlife', sentiment: -0.2, weight: 2 },
  { phrase: 'come back', mood: 'reflective', theme: 'relationships', emotion: 1.5, weight: 2 },
  { phrase: 'move on', mood: 'reflective', theme: 'healing', sentiment: 0.1, weight: 2 },
  { phrase: 'real talk', mood: 'reflective', theme: 'identity', weight: 1.5 },
  { phrase: 'late night', mood: 'cinematic', theme: 'nightlife', weight: 1.5 },
  { phrase: 'new day', mood: 'euphoric', theme: 'healing', sentiment: 0.3, weight: 2 },
  { phrase: 'losing control', mood: 'rebellious', theme: 'chaos', energy: 2, weight: 2 },
  { phrase: 'stand tall', mood: 'euphoric', theme: 'ambition', sentiment: 0.3, energy: 1.5, weight: 2 },
  { phrase: 'inner peace', mood: 'reflective', theme: 'healing', sentiment: 0.3, emotion: 1.5, weight: 2.5 },
  // v3 additions
  { phrase: 'all alone', mood: 'melancholic', sentiment: -0.3, emotion: 2, weight: 2.5 },
  { phrase: 'falling down', mood: 'melancholic', theme: 'chaos', sentiment: -0.2, weight: 2 },
  { phrase: 'make believe', mood: 'reflective', theme: 'identity', emotion: 1, weight: 2 },
  { phrase: 'never again', mood: 'rebellious', sentiment: -0.1, energy: 1.5, weight: 2 },
  { phrase: 'wide awake', mood: 'euphoric', energy: 1.5, sentiment: 0.2, weight: 2 },
  { phrase: 'heart beat', mood: 'romantic', energy: 1.5, emotion: 2, weight: 2 },
  { phrase: 'growing old', mood: 'reflective', theme: 'relationships', emotion: 1.5, weight: 2 },
  { phrase: 'fight back', mood: 'rebellious', theme: 'ambition', energy: 2.5, sentiment: 0.2, weight: 2.5 },
  { phrase: 'no more', mood: 'rebellious', sentiment: -0.1, weight: 1.5 },
  { phrase: 'one more', mood: 'reflective', emotion: 1, weight: 1.5 },
];

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/** Lightweight suffix-stripping stemmer (English) */
function stemWord(word: string): string {
  if (word.length < 4) return word;

  const rules: [RegExp, string][] = [
    [/ational$/, 'ate'],
    [/fulness$/, 'ful'],
    [/iveness$/, 'ive'],
    [/ization$/, 'ize'],
    [/ousness$/, 'ous'],
    [/ement$/, ''],
    [/ation$/, 'ate'],
    [/ness$/, ''],
    [/ment$/, ''],
    [/ling$/, ''],
    [/ally$/, ''],
    [/ting$/, ''],
    [/able$/, ''],
    [/ible$/, ''],
    [/ence$/, ''],
    [/ance$/, ''],
    [/ous$/, ''],
    [/ful$/, ''],
    [/ive$/, ''],
    [/ize$/, ''],
    [/ise$/, ''],
    [/ing$/, ''],
    [/ies$/, 'y'],
    [/ion$/, ''],
    [/ity$/, ''],
    [/ers$/, ''],
    [/est$/, ''],
    [/ess$/, ''],
    [/ism$/, ''],
    [/ist$/, ''],
    [/ed$/, ''],
    [/er$/, ''],
    [/ly$/, ''],
    [/es$/, ''],
    [/ss$/, 'ss'],
    [/s$/, ''],
  ];

  for (const [pattern, replacement] of rules) {
    if (pattern.test(word)) {
      const stemmed = word.replace(pattern, replacement);
      if (stemmed.length >= 2) return stemmed;
    }
  }

  return word;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// v3 pass 1: Context-aware scoring
// ---------------------------------------------------------------------------

/**
 * Applies a negation/intensity window when scoring tokens.
 * If a negation word precedes a match within 2 tokens, the weight is flipped.
 * If an amplifier precedes, weight is multiplied by 1.5.
 * If a dampener precedes, weight is multiplied by 0.5.
 */
function scoreWeightedContextual(
  tokens: string[],
  lexicon: Map<string, number>,
): { total: number; hits: Map<string, number> } {
  const hits = new Map<string, number>();
  let total = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] ?? '';

    // Try exact match first, then stemmed
    let weight = lexicon.get(token);
    if (weight === undefined) {
      const stemmed = stemWord(token);
      weight = lexicon.get(stemmed);
      if (weight === undefined) {
        for (const [key, w] of lexicon) {
          if (stemWord(key) === stemmed) {
            weight = w;
            break;
          }
        }
      }
    }

    if (weight !== undefined) {
      // Check the 2 preceding tokens for negation/intensity modifiers
      let modifier = 1;
      for (let j = Math.max(0, i - 2); j < i; j++) {
        const prev = tokens[j] ?? '';
        if (NEGATION_WORDS.has(prev)) {
          modifier *= -0.8; // Flip and slightly reduce (negation isn't always total)
        }
        if (INTENSITY_AMPLIFIERS.has(prev)) {
          modifier *= 1.5;
        }
        if (INTENSITY_DAMPENERS.has(prev)) {
          modifier *= 0.5;
        }
      }

      const adjustedWeight = weight * modifier;
      total += adjustedWeight;
      hits.set(token, (hits.get(token) || 0) + adjustedWeight);
    }
  }
  return { total, hits };
}

/** Non-contextual scoring (for backward compat in places where context doesn't apply) */
function scoreWeighted(
  tokens: string[],
  lexicon: Map<string, number>,
): { total: number; hits: Map<string, number> } {
  const hits = new Map<string, number>();
  let total = 0;
  for (const token of tokens) {
    let weight = lexicon.get(token);
    if (weight === undefined) {
      const stemmed = stemWord(token);
      weight = lexicon.get(stemmed);
      if (weight === undefined) {
        for (const [key, w] of lexicon) {
          if (stemWord(key) === stemmed) {
            weight = w;
            break;
          }
        }
      }
    }
    if (weight !== undefined) {
      total += weight;
      hits.set(token, (hits.get(token) || 0) + weight);
    }
  }
  return { total, hits };
}

function countWeighted(tokens: string[], lexicon: Map<string, number>): number {
  return scoreWeighted(tokens, lexicon).total;
}

function countWeightedContextual(tokens: string[], lexicon: Map<string, number>): number {
  return scoreWeightedContextual(tokens, lexicon).total;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toTitleCase(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// ---------------------------------------------------------------------------
// v3 pass 1: Chorus detection
// ---------------------------------------------------------------------------

/**
 * Detect chorus lines: lines that repeat 2+ times are likely chorus/hook.
 * Returns both the detected lines and a weight multiplier map (line→weight).
 */
function detectChorus(lines: string[]): { chorusLines: string[]; lineWeights: Map<string, number> } {
  const normalized = lines.map((l) => l.trim().toLowerCase());
  const counts = new Map<string, number>();
  for (const line of normalized) {
    if (line.length > 0) {
      counts.set(line, (counts.get(line) || 0) + 1);
    }
  }

  const chorusLines: string[] = [];
  const lineWeights = new Map<string, number>();

  for (const [line, count] of counts) {
    if (count >= 2) {
      // Find the original-cased version
      const original = lines.find((l) => l.trim().toLowerCase() === line);
      if (original) chorusLines.push(original.trim());
      // Chorus lines get a 1.5x weight boost
      lineWeights.set(line, 1.5);
    } else {
      lineWeights.set(line, 1.0);
    }
  }

  return { chorusLines, lineWeights };
}

// ---------------------------------------------------------------------------
// Bigram scanner
// ---------------------------------------------------------------------------

type BigramAccumulator = {
  moodHits: Map<string, number>;
  themeHits: Map<string, number>;
  sentimentDelta: number;
  energyDelta: number;
  emotionDelta: number;
  matchedPhrases: string[];
};

function scanBigrams(text: string): BigramAccumulator {
  const lower = text.toLowerCase();
  const acc: BigramAccumulator = {
    moodHits: new Map(),
    themeHits: new Map(),
    sentimentDelta: 0,
    energyDelta: 0,
    emotionDelta: 0,
    matchedPhrases: [],
  };

  for (const entry of BIGRAM_PHRASES) {
    let idx = 0;
    let count = 0;
    while ((idx = lower.indexOf(entry.phrase, idx)) !== -1) {
      count++;
      idx += entry.phrase.length;
    }
    if (count === 0) continue;

    acc.matchedPhrases.push(entry.phrase);
    const w = entry.weight * count;

    if (entry.mood) {
      acc.moodHits.set(entry.mood, (acc.moodHits.get(entry.mood) || 0) + w);
    }
    if (entry.theme) {
      acc.themeHits.set(entry.theme, (acc.themeHits.get(entry.theme) || 0) + w);
    }
    if (entry.sentiment) acc.sentimentDelta += entry.sentiment * count;
    if (entry.energy) acc.energyDelta += entry.energy * count;
    if (entry.emotion) acc.emotionDelta += entry.emotion * count;
  }

  return acc;
}

// ---------------------------------------------------------------------------
// Analysis builders
// ---------------------------------------------------------------------------

function buildMoodBreakdown(
  lines: string[],
  bigrams: BigramAccumulator,
  lineWeights: Map<string, number>,
): MoodBreakdownPoint[] {
  // Score each line individually, then aggregate with chorus weighting
  const moodTotals = new Map<string, number>();
  for (const mood of Object.keys(MOOD_LEXICON)) moodTotals.set(mood, 0);

  for (const line of lines) {
    const tokens = tokenize(line);
    const weight = lineWeights.get(line.trim().toLowerCase()) || 1;
    for (const [mood, lexicon] of Object.entries(MOOD_LEXICON)) {
      const score = countWeighted(tokens, lexicon) * weight;
      moodTotals.set(mood, (moodTotals.get(mood) || 0) + score);
    }
  }

  const raw = [...moodTotals.entries()].map(([mood, score]) => {
    const bigramBoost = bigrams.moodHits.get(mood) || 0;
    return { mood, score: score + bigramBoost };
  });

  const hasSignal = raw.some((point) => point.score > 0);
  const stabilized = raw.map((point) => ({
    mood: point.mood,
    score: hasSignal ? point.score : point.mood === 'reflective' ? 3 : 1,
  }));

  const total = stabilized.reduce((sum, point) => sum + point.score, 0) || 1;
  return stabilized
    .map((point) => ({
      mood: toTitleCase(point.mood),
      score: Math.round((point.score / total) * 100),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function buildThemes(
  lines: string[],
  bigrams: BigramAccumulator,
  lineWeights: Map<string, number>,
): string[] {
  const themeTotals = new Map<string, number>();
  for (const theme of Object.keys(THEME_LEXICON)) themeTotals.set(theme, 0);

  for (const line of lines) {
    const tokens = tokenize(line);
    const weight = lineWeights.get(line.trim().toLowerCase()) || 1;
    for (const [theme, lexicon] of Object.entries(THEME_LEXICON)) {
      const score = countWeighted(tokens, lexicon) * weight;
      themeTotals.set(theme, (themeTotals.get(theme) || 0) + score);
    }
  }

  const scored = [...themeTotals.entries()]
    .map(([theme, score]) => {
      const bigramBoost = bigrams.themeHits.get(theme) || 0;
      return { theme, score: score + bigramBoost };
    })
    .sort((a, b) => b.score - a.score);

  const selected = scored.filter((entry) => entry.score > 0).slice(0, 4);
  if (selected.length > 0) {
    return selected.map((entry) => toTitleCase(entry.theme));
  }

  return ['Identity', 'Ambition', 'Relationships', 'Healing'];
}

function classifySentiment(score: number): 'positive' | 'negative' | 'neutral' | 'mixed' {
  if (score > 0.25) return 'positive';
  if (score < -0.25) return 'negative';
  if (Math.abs(score) <= 0.1) return 'neutral';
  return 'mixed';
}

function buildHeatmap(lines: string[]): HeatmapPoint[] {
  return lines.slice(0, 50).map((line) => {
    const tokens = tokenize(line);
    const positiveHits = countWeightedContextual(tokens, POSITIVE_WORDS);
    const negativeHits = countWeightedContextual(tokens, NEGATIVE_WORDS);
    const energyHits = countWeighted(tokens, ENERGY_WORDS);
    const calmHits = countWeighted(tokens, CALM_WORDS);

    const sentiment = clamp((positiveHits - negativeHits) / Math.max(tokens.length * 0.6, 1), -1, 1);
    const intensity = clamp((energyHits + Math.abs(negativeHits) + positiveHits - calmHits) / Math.max(tokens.length * 0.5, 1), 0, 1);

    return {
      line: line.trim(),
      sentiment,
      intensity,
    };
  });
}

// ---------------------------------------------------------------------------
// v2 dimensions
// ---------------------------------------------------------------------------

function calcVocabularyRichness(tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const unique = new Set(tokens);
  return Math.round(clamp((unique.size / tokens.length) * 100, 0, 100));
}

function calcRepetitionScore(lines: string[]): number {
  if (lines.length <= 1) return 0;
  const normalized = lines.map((l) => l.trim().toLowerCase());
  const seen = new Set<string>();
  let repeats = 0;
  for (const line of normalized) {
    if (seen.has(line)) {
      repeats++;
    } else {
      seen.add(line);
    }
  }
  return Math.round(clamp((repeats / lines.length) * 100, 0, 100));
}

/** v3: Sliding-window narrative arc (5 equal windows for smoother detection) */
function calcNarrativeArc(lines: string[]): 'build' | 'decline' | 'wave' | 'steady' {
  if (lines.length < 3) return 'steady';

  const numWindows = Math.min(5, lines.length);
  const windowSize = Math.max(1, Math.floor(lines.length / numWindows));

  const windowSentiments: number[] = [];
  for (let w = 0; w < numWindows; w++) {
    const start = w * windowSize;
    const end = w === numWindows - 1 ? lines.length : start + windowSize;
    const chunk = lines.slice(start, end);
    let total = 0;
    for (const line of chunk) {
      const tokens = tokenize(line);
      const pos = countWeighted(tokens, POSITIVE_WORDS);
      const neg = countWeighted(tokens, NEGATIVE_WORDS);
      total += (pos - neg) / Math.max(tokens.length * 0.6, 1);
    }
    windowSentiments.push(total / Math.max(chunk.length, 1));
  }

  // Compute trend via deltas
  let rises = 0;
  let falls = 0;
  const threshold = 0.06;

  for (let i = 1; i < windowSentiments.length; i++) {
    const delta = (windowSentiments[i] ?? 0) - (windowSentiments[i - 1] ?? 0);
    if (delta > threshold) rises++;
    else if (delta < -threshold) falls++;
  }

  // Overall trajectory: compare first and last windows
  const first = windowSentiments[0] ?? 0;
  const last = windowSentiments[windowSentiments.length - 1] ?? 0;
  const overallDelta = last - first;
  const overallThreshold = 0.15;

  // Build: overall ascending + rises dominate (2:1 ratio over falls, or no falls)
  if (overallDelta > overallThreshold && rises >= falls * 2 && rises > 0) return 'build';
  // Decline: overall descending + falls dominate
  if (overallDelta < -overallThreshold && falls >= rises * 2 && falls > 0) return 'decline';
  // Wave: both rises and falls present without clear dominance
  if (rises > 0 && falls > 0) return 'wave';
  // Directional with small deltas
  if (rises > 0 && falls === 0) return 'build';
  if (falls > 0 && rises === 0) return 'decline';
  return 'steady';
}

function collectTopKeywords(tokens: string[], n: number = 5): string[] {
  const allLexicons = [POSITIVE_WORDS, NEGATIVE_WORDS, ENERGY_WORDS, CALM_WORDS, EMOTION_WORDS];
  for (const lex of Object.values(MOOD_LEXICON)) allLexicons.push(lex);
  for (const lex of Object.values(THEME_LEXICON)) allLexicons.push(lex);

  const combined = new Map<string, number>();
  for (const lex of allLexicons) {
    const { hits } = scoreWeighted(tokens, lex);
    for (const [word, weight] of hits) {
      combined.set(word, (combined.get(word) || 0) + weight);
    }
  }

  return [...combined.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([word]) => word);
}

// ---------------------------------------------------------------------------
// v3 pass 2: New dimensions
// ---------------------------------------------------------------------------

/** Emotional complexity: how many distinct emotion categories are present (0-100) */
function calcEmotionalComplexity(tokens: string[]): number {
  const stemmedTokens = new Set(tokens.map(stemWord));
  let activeCategories = 0;
  const totalCategories = Object.keys(EMOTION_CATEGORIES).length;

  for (const categoryWords of Object.values(EMOTION_CATEGORIES)) {
    for (const word of categoryWords) {
      if (stemmedTokens.has(word) || stemmedTokens.has(stemWord(word))) {
        activeCategories++;
        break;
      }
    }
    // Also check unstemmed
    if (activeCategories === 0) {
      for (const token of tokens) {
        if (categoryWords.has(token)) {
          activeCategories++;
          break;
        }
      }
    }
  }

  return Math.round(clamp((activeCategories / totalCategories) * 100, 0, 100));
}

/** Imagery density: ratio of concrete/sensory words to total (0-100) */
function calcImageryDensity(tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const imageryHits = countWeighted(tokens, IMAGERY_WORDS);
  // Normalize: typical imagery-dense lyrics might have 10-20% imagery words
  // Scale ×5 so 20% imagery → score of 100
  return Math.round(clamp((imageryHits / tokens.length) * 500, 0, 100));
}

/**
 * Rhyme detection: simple end-of-line phonetic suffix matching.
 * Counts pairs of adjacent or near-adjacent lines that share a 2+ char ending suffix.
 */
function calcRhymeScore(lines: string[]): number {
  if (lines.length < 2) return 0;

  // Extract last word of each line, lowercased
  const lastWords = lines.map((l) => {
    const tokens = tokenize(l);
    return tokens.length > 0 ? tokens[tokens.length - 1] : '';
  }).filter(Boolean);

  if (lastWords.length < 2) return 0;

  // Get the phonetic suffix (last 2-3 chars of the word)
  const getSuffix = (word: string): string => {
    if (word.length <= 2) return word;
    return word.slice(-3);
  };

  let rhymePairs = 0;
  const maxLook = 3; // Check up to 3 lines ahead for rhymes (ABAB, AABB etc.)

  for (let i = 0; i < lastWords.length; i++) {
    const current = lastWords[i] ?? '';
    const suffix = getSuffix(current);
    if (suffix.length < 2) continue;

    for (let j = i + 1; j < Math.min(i + maxLook + 1, lastWords.length); j++) {
      const candidate = lastWords[j] ?? '';
      // Avoid matching identical words
      if (candidate === current) continue;
      if (getSuffix(candidate) === suffix) {
        rhymePairs++;
        break; // One rhyme partner per line
      }
    }
  }

  // Normalize: rhymePairs / (total lines / 2) gives us the rhyme density
  const maxPossiblePairs = Math.floor(lastWords.length / 2);
  return Math.round(clamp((rhymePairs / Math.max(maxPossiblePairs, 1)) * 100, 0, 100));
}

/** Confidence: how reliable is this analysis given signal strength vs word count */
function calcConfidence(tokens: string[], moodBreakdown: MoodBreakdownPoint[]): number {
  if (tokens.length === 0) return 0;

  // Factor 1: word count (more words = higher confidence, diminishing returns)
  const wordFactor = Math.min(1, tokens.length / 50); // 50+ words = max

  // Factor 2: signal strength — did we actually match meaningful keywords?
  const allLexicons = [POSITIVE_WORDS, NEGATIVE_WORDS, ENERGY_WORDS, CALM_WORDS, EMOTION_WORDS];
  for (const lex of Object.values(MOOD_LEXICON)) allLexicons.push(lex);
  let totalHits = 0;
  for (const lex of allLexicons) {
    totalHits += scoreWeighted(tokens, lex).total;
  }
  const signalFactor = Math.min(1, totalHits / Math.max(tokens.length * 0.3, 1));

  // Factor 3: mood differentiation (top mood much higher than others = confident)
  const moodSpread = moodBreakdown.length >= 2
    ? ((moodBreakdown[0]?.score ?? 0) - (moodBreakdown[1]?.score ?? 0)) / Math.max(moodBreakdown[0]?.score ?? 1, 1)
    : 0;
  const moodFactor = Math.min(1, moodSpread + 0.3);

  return Math.round(clamp((wordFactor * 0.3 + signalFactor * 0.4 + moodFactor * 0.3) * 100, 0, 100));
}

/** Dominant emotion: single strongest emotion category label */
function calcDominantEmotion(tokens: string[]): string {
  const stemmedTokens = tokens.map(stemWord);
  let bestCategory = 'neutral';
  let bestCount = 0;

  for (const [category, categoryWords] of Object.entries(EMOTION_CATEGORIES)) {
    let count = 0;
    for (const token of stemmedTokens) {
      if (categoryWords.has(token)) count++;
    }
    // Also check unstemmed
    for (const token of tokens) {
      if (categoryWords.has(token)) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      bestCategory = category;
    }
  }

  return toTitleCase(bestCategory);
}

// ---------------------------------------------------------------------------
// v4 pass 1 – Syllabic Flow Score
// ---------------------------------------------------------------------------
// Counts vowel-clusters per word (proxy for syllable count) then measures
// variance in syllable-length across lines. High flow = consistent rhythm.
function calcFlowScore(lines: string[]): number {
  if (lines.length < 2) return 50;

  const syllableCount = (word: string): number => {
    const m = word.toLowerCase().match(/[aeiouy]+/g);
    return m ? m.length : 1;
  };

  const lineSyllables = lines.map((line) => {
    const words = tokenize(line);
    if (words.length === 0) return 0;
    return words.reduce((sum, w) => sum + syllableCount(w), 0) / words.length;
  }).filter((n) => n > 0);

  if (lineSyllables.length < 2) return 50;

  const mean = lineSyllables.reduce((a, b) => a + b, 0) / lineSyllables.length;
  const variance = lineSyllables.reduce((sum, v) => sum + (v - mean) ** 2, 0) / lineSyllables.length;
  // Low variance = consistent rhythm = high flow score
  // Variance > 1.5 → score approaches 0; variance 0 → 100
  return Math.round(clamp(100 - (variance / 1.5) * 80, 10, 100));
}

// ---------------------------------------------------------------------------
// v4 pass 2 – Metaphor / Figurative Language Density
// ---------------------------------------------------------------------------
const METAPHOR_MARKERS = flat([
  // Simile connectives
  'like', 'as', // detected via adjacent non-stop-word check
  // Common metaphor verb frames
  'am', 'are', 'is', 'was', 'were',
  // Personification / transformation
  'become', 'becomes', 'became', 'turn', 'turns', 'turned',
  'transform', 'transforms', 'transformed',
  // Sensory transfer
  'taste', 'sound', 'echo', 'smell', 'feel', 'looks',
  // Dead metaphors still counted
  'drown', 'burn', 'bleed', 'shatter', 'crumble', 'soar',
  'blind', 'chains', 'cage', 'wall', 'throne', 'crown',
  'fire', 'ice', 'storm', 'lightning', 'thunder',
  'ocean', 'sea', 'river', 'flood', 'tide', 'wave',
  'mountain', 'desert', 'stars', 'moon', 'sun',
  'diamond', 'gold', 'silver', 'dust', 'ashes',
  'wings', 'shadow', 'ghost', 'mirror', 'glass',
  'smoke', 'fog', 'mist', 'veil', 'mask',
]);

function calcMetaphorDensity(tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const hits = countWeighted(tokens, METAPHOR_MARKERS);
  return Math.round(clamp((hits / tokens.length) * 400, 0, 100));
}

// ---------------------------------------------------------------------------
// v4 pass 3 – Slang / Dialect Authenticity Index
// ---------------------------------------------------------------------------
const SLANG_LEXICON = flat([
  // Hip-hop / trap
  'drip', 'flex', 'slay', 'lit', 'fire', 'lowkey', 'highkey', 'vibe', 'vibes',
  'finesse', 'grind', 'hustle', 'stack', 'stacks', 'rack', 'racks', 'bands',
  'goat', 'goats', 'plug', 'wave', 'waves', 'cap', 'no-cap', 'fam', 'bro',
  'bruh', 'dawg', 'homie', 'crib', 'whip', 'dough', 'bread', 'cheese',
  'loot', 'fetty', 'guap', 'gwap', 'clout', 'hype', 'woke', 'salty',
  'bougie', 'ratchet', 'thot', 'bae', 'sis', 'squad', 'crew', 'gang',
  'g', 'ogs', 'real', 'fake', 'extra', 'basic', 'sus', 'snitch',
  // General colloquial
  'gonna', 'wanna', 'gotta', 'kinda', 'sorta', 'lemme', 'gimme', 'tryna',
  'dunno', 'ain\'t', 'nah', 'yeah', 'yea', 'yo', 'ya', 'aye', 'aight',
  'til', 'till', 'cuz', 'betta', 'lotta', 'oughta', 'shoulda', 'woulda',
  'coulda', 'hafta', 'outta', 'finna', 'ima', 'imma',
  // Emotional slang
  'deadass', 'no-cap', 'facts', 'say-less', 'respect', 'goated', 'ate',
  'understood', 'period', 'rent-free', 'living',
]);

function calcSlangIndex(tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const hits = countWeighted(tokens, SLANG_LEXICON);
  return Math.round(clamp((hits / tokens.length) * 500, 0, 100));
}

// ---------------------------------------------------------------------------
// v4 pass 4 – Sentiment Sharpness
// ---------------------------------------------------------------------------
// Measures the difference between peak-absolute-sentiment and average,
// indicating whether the lyrics have explosive emotional moments or are flat.
function calcSentimentSharpness(lines: string[]): number {
  if (lines.length < 3) return 50;

  const lineSentiments = lines.map((line) => {
    const tokens = tokenize(line);
    if (tokens.length === 0) return 0;
    const pos = countWeightedContextual(tokens, POSITIVE_WORDS);
    const neg = countWeightedContextual(tokens, NEGATIVE_WORDS);
    return (pos - neg) / Math.max(tokens.length * 0.5, 1);
  });

  const absValues = lineSentiments.map(Math.abs);
  const mean = absValues.reduce((a, b) => a + b, 0) / absValues.length;
  const peak = Math.max(...absValues);

  // Sharpness = scaled gap between peak and mean
  const sharpness = (peak - mean) / Math.max(mean + 0.01, 0.01);
  return Math.round(clamp(sharpness * 50, 0, 100));
}

// ---------------------------------------------------------------------------
// v4 pass 5 – Lyrical Fingerprint
// ---------------------------------------------------------------------------
// Produces a short human-readable 3-word descriptor of the lyrical voice
// by combining arc, dominant emotion, and the top mood.
function calcLyricalFingerprint(
  narrativeArc: string,
  dominantEmotion: string,
  primaryMood: string,
  energyScore: number,
  slangIndex: number,
): string {
  const arcWord = {
    build: 'Rising',
    decline: 'Descending',
    wave: 'Turbulent',
    steady: 'Measured',
  }[narrativeArc] ?? 'Measured';

  const voiceWord = slangIndex > 40
    ? 'Street'
    : energyScore > 70
      ? 'Aggressive'
      : energyScore < 30
        ? 'Intimate'
        : 'Poetic';

  return `${arcWord} ${dominantEmotion} ${voiceWord}`;
}

// ---------------------------------------------------------------------------
// Auto-Title Generator
// ---------------------------------------------------------------------------
// Picks from a bank of 40 poetic title templates using mood / theme / keywords.
const TITLE_TEMPLATES: ((m: string, t: string, k: string, e: string) => string)[] = [
  (m, _t, _k, _e) => `The ${m} Hour`,
  (_m, t, k, _e) => `Echo of ${toTitleCase(k)} ${t}`,
  (m, t, _k, _e) => `${m} ${t}`,
  (_m, _t, k, e) => `${toTitleCase(k)} Like ${toTitleCase(e)}`,
  (m, _t, k, _e) => `${m} in ${toTitleCase(k)}`,
  (_m, t, _k, e) => `${toTitleCase(e)} & ${t}`,
  (m, _t, _k, e) => `${toTitleCase(e)} (${m} Version)`,
  (_m, t, k, _e) => `Under the ${toTitleCase(k)} ${t}`,
  (m, _t, k, _e) => `${toTitleCase(k)} Never ${m}`,
  (_m, t, _k, e) => `${toTitleCase(e)} for the ${t}`,
  (m, t, _k, _e) => `Last ${m} ${t}`,
  (_m, _t, k, e) => `Ghost of ${toTitleCase(k)}`,
  (m, _t, _k, _e) => `${m} State`,
  (_m, t, k, _e) => `${toTitleCase(k)} ${t} Blues`,
  (m, _t, k, _e) => `Soft ${m} ${toTitleCase(k)}`,
  (_m, t, _k, e) => `${t} ${toTitleCase(e)}`,
  (m, _t, _k, e) => `${toTitleCase(e)} of the ${m}`,
  (_m, t, k, _e) => `Before the ${toTitleCase(k)}`,
  (m, t, _k, _e) => `${m} ${t} Tonight`,
  (_m, _t, k, e) => `${toTitleCase(e)} (${toTitleCase(k)} Cut)`,
  (m, _t, k, _e) => `${toTitleCase(k)} & ${m} Dreams`,
  (_m, t, _k, e) => `All This ${toTitleCase(e)}`,
  (m, t, _k, _e) => `Where ${m} Meets ${t}`,
  (_m, _t, k, e) => `${toTitleCase(k)} Forever`,
  (m, _t, _k, _e) => `Nothing ${m}`,
  (_m, t, k, _e) => `${toTitleCase(k)} City ${t}`,
  (m, _t, k, _e) => `${toTitleCase(k)} on My ${m} Side`,
  (_m, t, _k, e) => `${toTitleCase(e)} Type ${t}`,
  (m, t, _k, _e) => `${t} ${m} Interlude`,
  (_m, _t, k, e) => `Neon ${toTitleCase(k)}`,
  (m, _t, _k, e) => `${toTitleCase(e)} Never ${m}`,
  (_m, t, k, _e) => `${t} & ${toTitleCase(k)} Season`,
  (m, _t, k, _e) => `${m} ${toTitleCase(k)} Ritual`,
  (_m, t, _k, e) => `${toTitleCase(e)} on Repeat`,
  (m, t, _k, _e) => `${m} ${t} Frequency`,
  (_m, _t, k, e) => `Late ${toTitleCase(k)} ${toTitleCase(e)}`,
  (m, _t, k, _e) => `${m} ${toTitleCase(k)} Drive`,
  (_m, t, _k, e) => `${toTitleCase(e)} Without ${t}`,
  (m, t, _k, _e) => `${m} Side of ${t}`,
  (_m, _t, k, e) => `${toTitleCase(k)} ${toTitleCase(e)} Theory`,
];

function generateAutoTitle(
  moodBreakdown: MoodBreakdownPoint[],
  themes: string[],
  topKeywords: string[],
  dominantEmotion: string,
  sentimentScore: number,
): string {
  const mood = moodBreakdown[0]?.mood || 'Reflective';
  const theme = themes[0] || 'Identity';
  const keyword = topKeywords[0] || (sentimentScore >= 0 ? 'light' : 'shadow');
  const emotion = dominantEmotion || 'Neutral';

  // Pick template deterministically based on mood+theme hash (so same input = same title)
  const hash = Array.from(mood + theme + keyword).reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
  const idx = Math.abs(hash) % TITLE_TEMPLATES.length;
  const fn = TITLE_TEMPLATES[idx];
  return fn ? fn(mood, theme, keyword, emotion) : `${mood} ${theme}`;
}

// ---------------------------------------------------------------------------
// Interpretation Generator (Storytelling Layer) — v2
// ---------------------------------------------------------------------------
// Builds a cohesive Sonoteller-style paragraph summarizing the lyric analysis.
// Uses sentence pools, graduated adjective banks, and conditional bonus
// sentences. Selection is deterministic via a simple hash of the analysis data
// so the same lyrics always produce the same story.

/** Simple numeric hash for deterministic pool selection */
function storyHash(...values: (string | number)[]): number {
  let h = 0;
  const str = values.join('|');
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pick<T>(pool: T[], hash: number): T {
  return pool[hash % pool.length]!;
}

// Graduated adjective banks
const ENERGY_ADJ: Record<string, string[]> = {
  high:  ['volcanic', 'electric', 'blazing', 'relentless', 'fiery', 'surging', 'combustive', 'uncontainable', 'kinetic', 'detonating'],
  mid:   ['steady-burning', 'smoldering', 'warm', 'measured', 'balanced', 'simmering', 'even-keeled', 'tempered', 'humming'],
  low:   ['whisper-quiet', 'subdued', 'restrained', 'hushed', 'muted', 'frozen-still', 'glassy', 'anesthetized', 'dormant'],
};

const FLOW_ADJ: Record<string, string[]> = {
  high:  ['intricate', 'labyrinthine', 'syncopated', 'complex', 'winding', 'serpentine', 'polyrhythmic', 'kaleidoscopic', 'dizzying'],
  mid:   ['steady', 'rhythmic', 'flowing', 'cadenced', 'natural', 'conversational', 'unhurried', 'even', 'melodic'],
  low:   ['staccato', 'direct', 'blunt', 'sparse', 'stripped-back', 'telegraphic', 'fragmentary', 'clipped', 'bare-bones'],
};

const IMAGERY_ADJ: Record<string, string[]> = {
  high:  ['richly figurative', 'lush with metaphor', 'deeply symbolic', 'vividly painted', 'cinematically layered', 'dripping with allegory', 'expressionistic', 'fever-dream vivid'],
  mid:   ['selectively visual', 'intermittently poetic', 'grounded but evocative', 'modestly figurative'],
  low:   ['plain-spoken', 'literal', 'unadorned', 'stark', 'grounded', 'documentary-like', 'matter-of-fact', 'bare'],
};

const ARC_ADJ: Record<string, string[]> = {
  build:   ['ascending', 'escalating', 'rising', 'crescendo-like', 'gathering momentum', 'snowballing', 'intensifying'],
  decline: ['descending', 'darkening', 'fading', 'diminishing', 'unwinding', 'dissolving', 'erosive'],
  wave:    ['fluctuating', 'tidal', 'oscillating', 'push-and-pull', 'pendular', 'cyclical', 'ebb-and-flow'],
  steady:  ['consistent', 'unwavering', 'level', 'sustained', 'plateaued', 'monolithic', 'linear'],
};

const MOOD_ADJ: Record<string, string[]> = {
  positive: ['luminous', 'euphoric', 'hopeful', 'radiant', 'triumphant', 'golden', 'uplifting', 'sun-soaked'],
  negative: ['shadowed', 'turbulent', 'aching', 'storm-dark', 'bruised', 'nocturnal', 'wounded', 'heavy-lidded'],
  neutral:  ['contemplative', 'reflective', 'detached', 'observational', 'still', 'measured', 'removed'],
  mixed:    ['bittersweet', 'paradoxical', 'dualistic', 'contradictory', 'ambivalent', 'kaleidoscopic', 'tangled'],
};

function generateInterpretation(
  themes: string[],
  primaryMood: string,
  sentimentLabel: string,
  energyScore: number,
  dominantEmotion: string,
  flowScore: number,
  metaphorDensity: number,
  slangIndex: number,
  narrativeArc: string,
  fingerprint: string,
  // v2 additional context
  rhymeScore: number = 0,
  chorusLines: string[] = [],
  repetitionScore: number = 0,
  imageryDensity: number = 0,
  topKeywords: string[] = [],
  emotionalComplexity: number = 0,
): string {
  const h = storyHash(primaryMood, sentimentLabel, dominantEmotion, energyScore, flowScore, narrativeArc);

  // ── Theme string ──
  let themeStr: string;
  if (themes.length >= 3) themeStr = `${themes[0]}, ${themes[1]}, and ${themes[2]}`;
  else if (themes.length === 2) themeStr = `${themes[0]} and ${themes[1]}`;
  else if (themes.length === 1) themeStr = themes[0]!;
  else themeStr = 'introspection and self-expression';

  const mood = primaryMood.toLowerCase();
  const moodBand = sentimentLabel === 'positive' ? 'positive' : sentimentLabel === 'negative' ? 'negative' : sentimentLabel === 'mixed' ? 'mixed' : 'neutral';
  const mAdj = pick(MOOD_ADJ[moodBand]!, h + 5);

  // ── Sentence 1: Theme & Mood (pool of 12) ──
  const s1Pool = [
    `At its core, this piece navigates themes of ${themeStr}, steeped in a ${mood} atmosphere.`,
    `The lyrics orbit around ${themeStr}, channeling a distinctly ${mood} sensibility throughout.`,
    `Rooted in ${themeStr}, the writing radiates a ${mood} energy that colors every line.`,
    `This work is a meditation on ${themeStr}, cast through a ${mood} lens.`,
    `Themes of ${themeStr} surface repeatedly, woven together by a ${mood} thread.`,
    `Through the language of ${themeStr}, a ${mood} narrative takes shape across the verses.`,
    `The piece opens a window into ${themeStr}, bathed in a ${mAdj} tone throughout.`,
    `${themeStr} form the backbone of this work — a ${mAdj} exploration of familiar territory made personal.`,
    `These lyrics dwell in the territory of ${themeStr}, rendered with a ${mood}, almost ${mAdj} quality.`,
    `A world built on ${themeStr} unfolds here, its atmosphere unmistakably ${mood}.`,
    `The writer wrestles with ${themeStr}, and the result is something deeply ${mAdj}.`,
    `From the first line, the piece commits to ${themeStr}, sustaining a ${mood} gravity that never breaks.`,
  ];

  // ── Sentence 2: Emotion & Sentiment (pool of 12) ──
  const eBand = energyScore > 65 ? 'high' : energyScore < 35 ? 'low' : 'mid';
  const eAdj = pick(ENERGY_ADJ[eBand]!, h + 1);
  const emotion = dominantEmotion.toLowerCase();

  const s2Pool = [
    `The emotional register leans ${sentimentLabel}, propelled by ${eAdj} energy and anchored in ${emotion}.`,
    `Sentiment runs ${sentimentLabel} here, with a ${eAdj} pulse driven by an undercurrent of ${emotion}.`,
    `There is a ${sentimentLabel} emotional gravity, amplified by ${eAdj} intensity and a deep well of ${emotion}.`,
    `Emotionally, the piece burns ${sentimentLabel} — ${eAdj} in force, rooted in ${emotion}.`,
    `A ${sentimentLabel} disposition permeates the verses, fueled by ${eAdj} tension and sustained ${emotion}.`,
    `The tonal center is unmistakably ${sentimentLabel}: ${eAdj}, charged, and shaped by ${emotion}.`,
    `What emerges is a ${sentimentLabel} emotional field — ${eAdj} in its delivery, with ${emotion} as the constant underpinning.`,
    `The sentiment skews ${sentimentLabel}, carried on a ${eAdj} current where ${emotion} is never far from the surface.`,
    `Underneath the words, a ${eAdj} emotional engine drives the piece toward ${emotion}, landing firmly in ${sentimentLabel} territory.`,
    `The feeling here is ${sentimentLabel} at its foundation, but the ${eAdj} delivery gives it edges — the dominant note being ${emotion}.`,
    `It reads as ${sentimentLabel}, paced by a ${eAdj} heartbeat, with ${emotion} threading through every stanza.`,
    `${emotion} sits at the emotional center, radiating outward through ${eAdj}, distinctly ${sentimentLabel} verse.`,
  ];

  // ── Sentence 3: Style & Structure (pool of 12) ──
  const fBand = flowScore > 70 ? 'high' : flowScore < 40 ? 'low' : 'mid';
  const fAdj = pick(FLOW_ADJ[fBand]!, h + 2);
  const iMidBand = imageryDensity > 50 ? 'high' : imageryDensity > 20 ? 'mid' : 'low';
  const iBand = metaphorDensity > 15 ? 'high' : 'low';
  const iAdj = pick(IMAGERY_ADJ[iBand]!, h + 3);
  const iAdj2 = pick(IMAGERY_ADJ[iMidBand] || IMAGERY_ADJ.low!, h + 7);
  const slangPhrase = slangIndex > 30
    ? 'a thick vernacular authenticity that roots the piece in street-level truth'
    : slangIndex > 20
      ? 'a strong vernacular authenticity'
      : slangIndex > 12
        ? 'touches of street-level dialect'
        : slangIndex > 5
          ? 'an occasional colloquial edge'
          : 'a polished, literary register';

  const s3Pool = [
    `Stylistically, the flow is ${fAdj}, the imagery ${iAdj}, and the voice carries ${slangPhrase}.`,
    `The writing moves with a ${fAdj} rhythm, dressed in ${iAdj} language alongside ${slangPhrase}.`,
    `Lyrically, it delivers a ${fAdj} cadence enriched by ${iAdj} expression and ${slangPhrase}.`,
    `The craft is ${fAdj} in meter and ${iAdj} in texture, grounded by ${slangPhrase}.`,
    `With ${fAdj} pacing and ${iAdj} wordplay, the piece maintains ${slangPhrase}.`,
    `Structure-wise, the bars run ${fAdj}, layered with ${iAdj} detail and ${slangPhrase}.`,
    `The voice is ${fAdj} and deliberate, with the imagery landing ${iAdj2} — and the register leans into ${slangPhrase}.`,
    `Line by line, the pacing feels ${fAdj}, the metaphors ${iAdj}, and the diction reveals ${slangPhrase}.`,
    `There's a ${fAdj} architecture to the verses: ${iAdj} in surface, ${slangPhrase} in character.`,
    `The lyrical design is ${fAdj}, mixing ${iAdj} imagery with ${slangPhrase} throughout.`,
    `Compositionally, the movement is ${fAdj}, the language ${iAdj}, the tonal register? ${slangPhrase}.`,
    `These lines are ${fAdj} in their delivery, ${iAdj} in construction, and marked by ${slangPhrase}.`,
  ];

  // ── Sentence 4: Conclusion / Arc (pool of 12) ──
  const arcAdj = pick(ARC_ADJ[narrativeArc] || ARC_ADJ.steady!, h + 4);
  const fp = fingerprint.toLowerCase();

  const s4Pool = [
    `The emotional arc is ${arcAdj}, ultimately leaving the listener with an impression of ${fp}.`,
    `Taken as a whole, the trajectory is ${arcAdj} — a journey that resolves into ${fp}.`,
    `Over its course, the piece traces an ${arcAdj} arc, crystallizing into ${fp}.`,
    `From start to finish the sentiment moves in an ${arcAdj} pattern, distilling into ${fp}.`,
    `The narrative builds ${arcAdj}ly, sealing the experience as one of ${fp}.`,
    `Its emotional shape is ${arcAdj}, a progression that culminates in the essence of ${fp}.`,
    `When the last line lands, the ${arcAdj} arc has delivered its verdict: this is a work of ${fp}.`,
    `Step by step, the ${arcAdj} emotional motion resolves into something best described as ${fp}.`,
    `The ${arcAdj} trajectory gives the piece its gravitational pull — and the final orbit settles at ${fp}.`,
    `By the close, the ${arcAdj} journey has etched a singular feeling into the listener: ${fp}.`,
    `The piece doesn't arrive — it ${arcAdj}ly unfolds, revealing itself as a study in ${fp}.`,
    `What remains after the final word is the imprint of an ${arcAdj} voyage through ${fp}.`,
  ];

  const s1 = pick(s1Pool, h);
  const s2 = pick(s2Pool, h + 10);
  const s3 = pick(s3Pool, h + 20);
  const s4 = pick(s4Pool, h + 30);

  // ── Conditional bonus sentences ──
  const bonuses: string[] = [];

  if (rhymeScore > 50) {
    bonuses.push(pick([
      'A pronounced rhyme scheme ties the lines together with satisfying sonic echoes.',
      'The end-rhymes are tightly woven, lending a musical cohesion to the verses.',
      'Rhyme is a structural pillar here, stitching each couplet into a larger tapestry.',
      'The rhyme work is precise and intentional — each paired ending reinforces the song\'s architecture.',
      'Sonic patterning through rhyme lends the piece a hypnotic, cyclical quality.',
    ], h + 40));
  }

  if (chorusLines.length > 0) {
    bonuses.push(pick([
      'A recurring hook anchors the piece, acting as an emotional refrain the listener can hold onto.',
      'The chorus functions as a gravitational center, pulling the surrounding verses into orbit.',
      'Repetition of a central hook gives the piece an anthemic, singable quality.',
      'The hook returns like a mantra — each iteration deepening its emotional weight.',
      'A chorus line recurs with the insistence of a heartbeat, binding the sections together.',
    ], h + 50));
  }

  if (emotionalComplexity > 60) {
    bonuses.push(pick([
      'The emotional palette is remarkably complex — multiple feelings coexist and compete across the lines.',
      'Rather than a single feeling, the lyrics juggle several emotional currents simultaneously.',
      'Emotional complexity runs high, with layers of contradictory feeling stacked throughout.',
      'The piece resists emotional simplicity — it holds tension, warmth, and melancholy in the same breath.',
      'There is a tangled emotional richness here, as if the writer is processing several feelings at once.',
    ], h + 60));
  }

  if (imageryDensity > 40) {
    bonuses.push(pick([
      'Concrete sensory imagery dominates the language, painting vivid scenes in the mind.',
      'The writing is saturated with visual and tactile detail — colors, textures, and landscapes.',
      'Every verse is loaded with images: you can see, hear, and almost touch the world being described.',
      'The imagery is cinematic — the listener doesn\'t just hear the song, they see it.',
    ], h + 70));
  }

  if (topKeywords.length >= 3) {
    bonuses.push(pick([
      `Key motifs — ${topKeywords.slice(0, 3).join(', ')} — recur like thematic anchors.`,
      `The words ${topKeywords.slice(0, 3).join(', ')} surface repeatedly, forming a lexical fingerprint.`,
      `Recurring motifs (${topKeywords.slice(0, 3).join(', ')}) lend the piece a gravitational vocabulary.`,
    ], h + 80));
  }

  if (repetitionScore > 40) {
    bonuses.push(pick([
      'Heavy repetition gives the piece a ritualistic, almost incantatory quality — lines return like prayers.',
      'The deliberate use of repetition creates a hypnotic spiral, pulling the listener deeper with each pass.',
      'Lines echo and repeat with mantra-like persistence, turning the piece into a meditation rather than a statement.',
      'The writing leans into repetition as a structural choice — each return of a phrase adds weight rather than redundancy.',
    ], h + 90));
  }

  if (metaphorDensity > 30) {
    bonuses.push(pick([
      'The figurative language is dense — metaphors and similes stack like geological layers.',
      'Nearly every line carries a double meaning, lending the work a poetic inscrutability.',
      'Metaphor isn\'t decoration here — it\'s the primary language, and the literal meaning hides behind it.',
    ], h + 100));
  }

  // Sentiment sharpness bonus
  const sentimentSharpness = Math.abs(energyScore - 50) + emotionalComplexity * 0.3;
  if (sentimentSharpness > 55) {
    bonuses.push(pick([
      'The emotional peaks are razor-sharp — the piece commits fully to its extremes.',
      'There is no middle ground in the feeling here; the sentiment cuts deep and deliberately.',
      'The intensity of feeling is striking — this is writing that refuses to be lukewarm.',
    ], h + 110));
  }

  // Cap bonuses at 3 to keep the paragraph rich but not bloated
  const selectedBonuses = bonuses.slice(0, 3);

  return [s1, s2, s3, ...selectedBonuses, s4].join(' ');
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function analyzeCreativeLyrics(lyrics: string): CreativeEngineResult {
  const normalizedLyrics = lyrics.trim();
  const tokens = tokenize(normalizedLyrics);
  const lines = normalizedLyrics.split('\n').map((line) => line.trim()).filter(Boolean);

  // v3 pass 1: Chorus detection
  const { chorusLines, lineWeights } = detectChorus(lines);

  // Bigram analysis
  const bigrams = scanBigrams(normalizedLyrics);

  // v3 pass 1: Context-aware sentiment scoring (negation + intensity)
  const positiveResult = scoreWeightedContextual(tokens, POSITIVE_WORDS);
  const negativeResult = scoreWeightedContextual(tokens, NEGATIVE_WORDS);
  const energyHits = countWeightedContextual(tokens, ENERGY_WORDS) + bigrams.energyDelta;
  const calmHits = countWeighted(tokens, CALM_WORDS);
  const emotionHits = countWeightedContextual(tokens, EMOTION_WORDS) + bigrams.emotionDelta;

  const sentimentRaw =
    (positiveResult.total - negativeResult.total) /
    Math.max(Math.abs(positiveResult.total) + Math.abs(negativeResult.total) + 5, 6);
  const sentimentScore = clamp(sentimentRaw + bigrams.sentimentDelta * 0.15, -1, 1);
  const sentimentLabel = classifySentiment(sentimentScore);

  const energyScore = Math.round(
    clamp(((energyHits + 1) / Math.max(energyHits + calmHits + 2, 2)) * 100, 0, 100),
  );
  const emotionScore = Math.round(
    clamp(
      ((emotionHits + Math.abs(positiveResult.total) + Math.abs(negativeResult.total)) / Math.max(tokens.length * 0.1, 1)) * 10,
      0,
      100,
    ),
  );

  // v3 pass 1: Chorus-weighted mood/theme building
  const moodBreakdown = buildMoodBreakdown(lines.length > 0 ? lines : [normalizedLyrics], bigrams, lineWeights);
  const themes = buildThemes(lines.length > 0 ? lines : [normalizedLyrics], bigrams, lineWeights);
  const heatmap = buildHeatmap(lines.length > 0 ? lines : [normalizedLyrics]);

  // v2 dimensions
  const vocabularyRichness = calcVocabularyRichness(tokens);
  const repetitionScore = calcRepetitionScore(lines);
  const narrativeArc = calcNarrativeArc(lines);
  const topKeywords = collectTopKeywords(tokens);

  // v3 pass 2 dimensions
  const emotionalComplexity = calcEmotionalComplexity(tokens);
  const imageryDensity = calcImageryDensity(tokens);
  const rhymeScore = calcRhymeScore(lines);
  const confidence = calcConfidence(tokens, moodBreakdown);
  const dominantEmotion = calcDominantEmotion(tokens);

  const primaryMood = moodBreakdown[0]?.mood || 'Reflective';
  const primaryTheme = themes[0] || 'Identity';

  // v4 dimensions
  const flowScore = calcFlowScore(lines.length > 0 ? lines : [normalizedLyrics]);
  const metaphorDensity = calcMetaphorDensity(tokens);
  const slangIndex = calcSlangIndex(tokens);
  const sentimentSharpness = calcSentimentSharpness(lines.length > 0 ? lines : [normalizedLyrics]);
  const lyricalFingerprint = calcLyricalFingerprint(narrativeArc, dominantEmotion, primaryMood, energyScore, slangIndex);
  const autoTitle = generateAutoTitle(moodBreakdown, themes, topKeywords, dominantEmotion, sentimentScore);

  const posterTitle = `${primaryMood} ${primaryTheme}`;
  const posterSubline = `${lyricalFingerprint} · ${sentimentLabel}`;

  // Generate interpretation paragraph
  const interpretation = generateInterpretation(
    themes,
    primaryMood,
    sentimentLabel,
    energyScore,
    dominantEmotion,
    flowScore,
    metaphorDensity,
    slangIndex,
    narrativeArc,
    lyricalFingerprint,
    // v2 additional context
    rhymeScore,
    chorusLines,
    repetitionScore,
    imageryDensity,
    topKeywords,
    emotionalComplexity,
  );

  return {
    moodBreakdown,
    themes,
    sentimentScore,
    sentimentLabel,
    energyScore,
    emotionScore,
    heatmap,
    posterTitle,
    posterSubline,
    // v2
    vocabularyRichness,
    repetitionScore,
    narrativeArc,
    wordCount: tokens.length,
    topKeywords,
    // v3 pass 2
    emotionalComplexity,
    imageryDensity,
    rhymeScore,
    confidence,
    dominantEmotion,
    chorusLines,
    // v4
    flowScore,
    metaphorDensity,
    slangIndex,
    sentimentSharpness,
    lyricalFingerprint,
    autoTitle,
    interpretation,
  };
}
