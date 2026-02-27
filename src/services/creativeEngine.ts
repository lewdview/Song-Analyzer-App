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

  return {
    moodBreakdown,
    themes,
    sentimentScore,
    sentimentLabel,
    energyScore,
    emotionScore,
    heatmap,
    posterTitle: `${primaryMood} ${primaryTheme}`,
    posterSubline: `Sentiment ${Math.round(sentimentScore * 100)} · Energy ${energyScore}`,
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
  };
}
