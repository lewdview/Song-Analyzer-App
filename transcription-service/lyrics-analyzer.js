const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'for',
  'from', 'had', 'has', 'have', 'he', 'her', 'hers', 'him', 'his', 'i', 'if',
  'in', 'into', 'is', 'it', 'its', 'me', 'my', 'of', 'on', 'or', 'our', 'ours',
  'she', 'so', 'that', 'the', 'their', 'them', 'there', 'they', 'this', 'to',
  'too', 'us', 'was', 'we', 'were', 'with', 'you', 'your', 'yours'
]);

const NEGATIONS = new Set([
  'aint', 'ain', "ain't", 'barely', 'cannot', "can't", 'cant', 'didnt',
  "didn't", 'doesnt', "doesn't", 'dont', "don't", 'hardly', 'never', 'no',
  'none', 'not', 'nothing', 'nowhere', 'rarely', 'without', 'wont', "won't"
]);

const INTENSIFIERS = new Set([
  'absolutely', 'completely', 'deeply', 'extremely', 'fully', 'really',
  'so', 'super', 'totally', 'too', 'very'
]);

const POSITIVE_WORDS = new Set([
  'alive', 'awesome', 'beautiful', 'blessed', 'bright', 'calm', 'carefree',
  'celebrate', 'celebration', 'cheerful', 'dream', 'faith', 'free', 'freedom',
  'glad', 'glory', 'good', 'great', 'grin', 'happy', 'heaven', 'high',
  'hope', 'joy', 'kind', 'light', 'love', 'loving', 'magic', 'peace',
  'positive', 'proud', 'rise', 'safe', 'shine', 'smile', 'soft', 'strong',
  'sun', 'sunrise', 'sweet', 'triumph', 'uplift', 'victory', 'warm', 'win'
]);

const NEGATIVE_WORDS = new Set([
  'afraid', 'alone', 'anger', 'angry', 'anxiety', 'ashamed', 'bad', 'blood',
  'broken', 'cold', 'crazy', 'cry', 'dark', 'dead', 'death', 'depress',
  'despair', 'destroy', 'drown', 'empty', 'fear', 'fight', 'gone', 'grief',
  'guilt', 'hate', 'heartache', 'hell', 'hurt', 'kill', 'lonely', 'loss',
  'mad', 'mess', 'nightmare', 'pain', 'rage', 'regret', 'sad', 'scared',
  'shame', 'sick', 'sorrow', 'stress', 'tears', 'toxic', 'trap', 'wound',
  'wrong'
]);

const HIGH_ENERGY_WORDS = new Set([
  'attack', 'blast', 'burn', 'charge', 'dance', 'drive', 'fast', 'fight',
  'fire', 'fly', 'go', 'jump', 'loud', 'power', 'push', 'race', 'run',
  'rush', 'shake', 'shout', 'slam', 'speed', 'storm', 'wild'
]);

const LOW_ENERGY_WORDS = new Set([
  'breathe', 'calm', 'drift', 'fade', 'gentle', 'hush', 'quiet', 'rest',
  'silent', 'slow', 'slowly', 'soft', 'still', 'tired', 'wait'
]);

const EMOTION_LEXICONS = {
  joy: new Set([
    'celebrate', 'cheerful', 'delight', 'glad', 'happy', 'joy', 'laugh', 'smile', 'sunshine'
  ]),
  sadness: new Set([
    'alone', 'blue', 'broken', 'cry', 'empty', 'grief', 'lonely', 'miss', 'sad', 'tears'
  ]),
  anger: new Set([
    'anger', 'angry', 'fight', 'fury', 'hate', 'mad', 'rage', 'revenge'
  ]),
  fear: new Set([
    'afraid', 'fear', 'panic', 'scared', 'shadow', 'terror', 'worried'
  ]),
  love: new Set([
    'baby', 'darling', 'heart', 'kiss', 'love', 'romance', 'touch'
  ]),
  confidence: new Set([
    'boss', 'brave', 'crown', 'fearless', 'power', 'strong', 'unstoppable', 'win'
  ]),
  desire: new Set([
    'burn', 'crave', 'desire', 'need', 'passion', 'want'
  ]),
  nostalgia: new Set([
    'remember', 'memory', 'old', 'past', 'yesterday'
  ]),
  loneliness: new Set([
    'abandoned', 'empty', 'isolated', 'lonely', 'nobody'
  ]),
  hope: new Set([
    'believe', 'dawn', 'faith', 'future', 'hope', 'rise', 'tomorrow'
  ])
};

const THEME_LEXICONS = {
  romance: new Set([
    'baby', 'darling', 'heart', 'kiss', 'lover', 'romance', 'touch'
  ]),
  heartbreak: new Set([
    'broken', 'goodbye', 'heartache', 'left', 'loss', 'miss', 'tears'
  ]),
  party: new Set([
    'dance', 'dj', 'drink', 'party', 'tonight', 'weekend'
  ]),
  ambition: new Set([
    'boss', 'dream', 'goal', 'grind', 'hustle', 'money', 'win'
  ]),
  struggle: new Set([
    'battle', 'fight', 'pain', 'pressure', 'survive'
  ]),
  self_discovery: new Set([
    'change', 'find', 'grow', 'learn', 'myself'
  ]),
  nightlife: new Set([
    'city', 'club', 'lights', 'midnight', 'night'
  ]),
  memories: new Set([
    'memory', 'remember', 'throwback', 'yesterday'
  ]),
  social_commentary: new Set([
    'freedom', 'justice', 'power', 'system', 'truth', 'world'
  ]),
  spirituality: new Set([
    'angel', 'blessed', 'faith', 'heaven', 'pray', 'soul'
  ])
};

const PHRASE_BONUSES = [
  { phrase: 'broken heart', theme: 'heartbreak', emotion: 'sadness', sentiment: -1.8 },
  { phrase: 'fall in love', theme: 'romance', emotion: 'love', sentiment: 1.6 },
  { phrase: 'dance floor', theme: 'party', emotion: 'joy', energy: 1.5 },
  { phrase: 'in the club', theme: 'nightlife', emotion: 'joy', energy: 1.2 },
  { phrase: 'all night', theme: 'nightlife', energy: 1.2 },
  { phrase: 'on my own', theme: 'loneliness', emotion: 'loneliness', sentiment: -1.3 },
  { phrase: 'new day', theme: 'self_discovery', emotion: 'hope', sentiment: 1.1 }
];

const MOOD_FROM_EMOTION = {
  joy: 'uplifting',
  sadness: 'melancholic',
  anger: 'aggressive',
  fear: 'tense',
  love: 'romantic',
  confidence: 'confident',
  desire: 'passionate',
  nostalgia: 'nostalgic',
  loneliness: 'isolated',
  hope: 'hopeful'
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round3(value) {
  return Number(value.toFixed(3));
}

function tokenize(lyrics) {
  const cleaned = String(lyrics || '')
    .toLowerCase()
    .replace(/[^a-z0-9'\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned ? cleaned.split(' ') : [];
}

function hasNegation(tokens, index) {
  for (let i = Math.max(0, index - 3); i < index; i += 1) {
    if (NEGATIONS.has(tokens[i])) {
      return true;
    }
  }
  return false;
}

function intensity(tokens, index) {
  for (let i = Math.max(0, index - 2); i < index; i += 1) {
    if (INTENSIFIERS.has(tokens[i])) {
      return 1.35;
    }
  }
  return 1;
}

function topKeys(scores, minScore, limit) {
  return Object.entries(scores)
    .filter(([, score]) => score >= minScore)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);
}

function addUnique(target, values) {
  const seen = new Set(target);
  for (const value of values) {
    if (!seen.has(value)) {
      target.push(value);
      seen.add(value);
    }
  }
}

export function analyzeLyricsLocally(lyrics) {
  const source = String(lyrics || '');
  const tokens = tokenize(source);
  const tokenCount = tokens.length;

  if (tokenCount === 0) {
    return {
      mood: ['unknown'],
      emotion: ['unknown'],
      themes: ['unknown'],
      sentiment: 'neutral',
      sentimentScore: 0,
      energyFromLyrics: 0.5,
      valenceFromLyrics: 0.5
    };
  }

  let positiveHits = 0;
  let negativeHits = 0;
  let positiveScore = 0;
  let negativeScore = 0;
  let energyRaw = 0;

  const emotionScores = Object.fromEntries(
    Object.keys(EMOTION_LEXICONS).map((key) => [key, 0])
  );
  const themeScores = Object.fromEntries(
    Object.keys(THEME_LEXICONS).map((key) => [key, 0])
  );

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token || STOPWORDS.has(token)) {
      continue;
    }

    const weight = intensity(tokens, i);
    const isNegated = hasNegation(tokens, i);

    if (POSITIVE_WORDS.has(token)) {
      positiveHits += 1;
      positiveScore += isNegated ? -weight : weight;
    }
    if (NEGATIVE_WORDS.has(token)) {
      negativeHits += 1;
      negativeScore += isNegated ? weight : -weight;
    }

    if (HIGH_ENERGY_WORDS.has(token)) {
      energyRaw += isNegated ? -0.25 : 1.0 * weight;
    }
    if (LOW_ENERGY_WORDS.has(token)) {
      energyRaw -= isNegated ? -0.15 : 0.55;
    }

    for (const [emotion, lexicon] of Object.entries(EMOTION_LEXICONS)) {
      if (lexicon.has(token)) {
        const emotionBoost = isNegated && (emotion === 'joy' || emotion === 'love' || emotion === 'hope')
          ? 0.25
          : 1;
        emotionScores[emotion] += weight * emotionBoost;
      }
    }

    for (const [theme, lexicon] of Object.entries(THEME_LEXICONS)) {
      if (lexicon.has(token)) {
        themeScores[theme] += weight;
      }
    }
  }

  const lowered = source.toLowerCase();
  for (const bonus of PHRASE_BONUSES) {
    if (!lowered.includes(bonus.phrase)) {
      continue;
    }
    if (bonus.theme && themeScores[bonus.theme] !== undefined) {
      themeScores[bonus.theme] += 1.5;
    }
    if (bonus.emotion && emotionScores[bonus.emotion] !== undefined) {
      emotionScores[bonus.emotion] += 1.35;
    }
    if (typeof bonus.sentiment === 'number') {
      if (bonus.sentiment > 0) {
        positiveScore += bonus.sentiment;
        positiveHits += 1;
      } else {
        negativeScore += bonus.sentiment;
        negativeHits += 1;
      }
    }
    if (typeof bonus.energy === 'number') {
      energyRaw += bonus.energy;
    }
  }

  const exclamations = (source.match(/!/g) || []).length;
  const exclamationBoost = clamp(exclamations / Math.max(1, tokenCount * 0.04), 0, 0.35);
  energyRaw += exclamationBoost;

  const sentimentRaw = positiveScore + negativeScore;
  const sentimentDenominator = Math.max(4, positiveHits + negativeHits);
  const sentimentScore = round3(clamp(sentimentRaw / sentimentDenominator, -1, 1));

  let sentiment = 'neutral';
  if (positiveHits >= 2 && negativeHits >= 2 && Math.abs(sentimentScore) < 0.35) {
    sentiment = 'mixed';
  } else if (sentimentScore >= 0.18) {
    sentiment = 'positive';
  } else if (sentimentScore <= -0.18) {
    sentiment = 'negative';
  }

  const valenceFromLyrics = round3(clamp(0.5 + (sentimentScore * 0.5), 0, 1));
  const energyFromLyrics = round3(
    clamp(0.5 + (energyRaw / Math.max(6, (tokenCount * 0.12))), 0, 1)
  );

  const emotions = topKeys(emotionScores, 1, 5);
  const themes = topKeys(themeScores, 1, 5);

  const moods = [];
  if (valenceFromLyrics >= 0.65 && energyFromLyrics >= 0.62) {
    addUnique(moods, ['upbeat', 'energetic']);
  } else if (valenceFromLyrics <= 0.35 && energyFromLyrics <= 0.45) {
    addUnique(moods, ['melancholic', 'somber']);
  } else if (energyFromLyrics >= 0.72) {
    addUnique(moods, ['intense', 'driving']);
  } else if (energyFromLyrics <= 0.33) {
    addUnique(moods, ['calm', 'introspective']);
  } else {
    addUnique(moods, ['reflective']);
  }

  for (const emotion of emotions) {
    const mood = MOOD_FROM_EMOTION[emotion];
    if (mood) {
      addUnique(moods, [mood]);
    }
  }

  if (sentiment === 'positive') {
    addUnique(moods, ['positive']);
  } else if (sentiment === 'negative') {
    addUnique(moods, ['dark']);
  } else if (sentiment === 'mixed') {
    addUnique(moods, ['bittersweet']);
  }

  return {
    mood: moods.length > 0 ? moods.slice(0, 6) : ['unknown'],
    emotion: emotions.length > 0 ? emotions : ['unknown'],
    themes: themes.length > 0 ? themes : ['unknown'],
    sentiment,
    sentimentScore,
    energyFromLyrics,
    valenceFromLyrics
  };
}
