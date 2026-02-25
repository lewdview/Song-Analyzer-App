import { analyzeLyricsLocally } from './lyrics-analyzer.js';

const VALID_PROVIDERS = new Set(['local', 'openai', 'claude', 'grok']);
const DEFAULT_PROVIDER = normalizeProvider(process.env.LYRICS_AI_PROVIDER) || 'local';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeSentiment(value) {
  const v = String(value || '').toLowerCase();
  if (v === 'positive' || v === 'negative' || v === 'mixed' || v === 'neutral') {
    return v;
  }
  return 'neutral';
}

function toStringArray(value, fallback = 'unknown') {
  if (!Array.isArray(value)) return [fallback];
  const cleaned = value
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .slice(0, 8);
  return cleaned.length > 0 ? cleaned : [fallback];
}

function normalizeAnalysisShape(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid model response shape');
  }

  const sentimentScore = Number(raw.sentimentScore);
  const energyFromLyrics = Number(raw.energyFromLyrics);
  const valenceFromLyrics = Number(raw.valenceFromLyrics);

  return {
    mood: toStringArray(raw.mood),
    emotion: toStringArray(raw.emotion),
    themes: toStringArray(raw.themes),
    sentiment: normalizeSentiment(raw.sentiment),
    sentimentScore: Number.isFinite(sentimentScore) ? clamp(sentimentScore, -1, 1) : 0,
    energyFromLyrics: Number.isFinite(energyFromLyrics) ? clamp(energyFromLyrics, 0, 1) : 0.5,
    valenceFromLyrics: Number.isFinite(valenceFromLyrics) ? clamp(valenceFromLyrics, 0, 1) : 0.5,
  };
}

function extractJsonObject(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('Model returned empty content');

  // Fast path: plain JSON
  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue to block extraction
  }

  // Code-block path
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    const fenced = fence[1].trim();
    return JSON.parse(fenced);
  }

  // Object substring path
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) {
    const candidate = trimmed.slice(first, last + 1);
    return JSON.parse(candidate);
  }

  throw new Error('No parseable JSON object found in model response');
}

function buildPrompt(lyrics) {
  const body = String(lyrics || '').slice(0, 4000);
  return [
    'Analyze these song lyrics and return JSON only.',
    'Output schema:',
    '{',
    '  "mood": ["string"],',
    '  "emotion": ["string"],',
    '  "themes": ["string"],',
    '  "sentiment": "positive|negative|neutral|mixed",',
    '  "sentimentScore": -1.0 to 1.0,',
    '  "energyFromLyrics": 0.0 to 1.0,',
    '  "valenceFromLyrics": 0.0 to 1.0',
    '}',
    'Rules:',
    '- Return valid JSON only, no markdown.',
    '- Keep arrays concise and meaningful.',
    '- Use neutral defaults if uncertain.',
    '',
    'Lyrics:',
    body,
  ].join('\n');
}

export function normalizeProvider(value) {
  const v = String(value || '').trim().toLowerCase();
  return VALID_PROVIDERS.has(v) ? v : null;
}

export function getConfiguredProvider() {
  return DEFAULT_PROVIDER;
}

async function analyzeWithOpenAI(lyrics) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const model = process.env.OPENAI_LYRICS_MODEL || 'gpt-4o-mini';
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: 'You are an expert music-lyrics analyst. Return strict JSON only.',
        },
        {
          role: 'user',
          content: buildPrompt(lyrics),
        },
      ],
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${details}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  const parsed = extractJsonObject(content);
  return normalizeAnalysisShape(parsed);
}

async function analyzeWithClaude(lyrics) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const model = process.env.ANTHROPIC_LYRICS_MODEL || 'claude-3-5-sonnet-latest';
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 700,
      temperature: 0.2,
      system: 'You are an expert music-lyrics analyst. Return strict JSON only.',
      messages: [
        {
          role: 'user',
          content: buildPrompt(lyrics),
        },
      ],
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Claude error ${response.status}: ${details}`);
  }

  const data = await response.json();
  const content = Array.isArray(data?.content)
    ? data.content.map((chunk) => chunk?.text || '').join('\n')
    : '';
  const parsed = extractJsonObject(content);
  return normalizeAnalysisShape(parsed);
}

async function analyzeWithGrok(lyrics) {
  const apiKey = process.env.XAI_API_KEY || process.env.GROK_API_KEY;
  if (!apiKey) throw new Error('XAI_API_KEY or GROK_API_KEY is not set');

  const model = process.env.XAI_LYRICS_MODEL || process.env.GROK_LYRICS_MODEL || 'grok-2-latest';
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: 'You are an expert music-lyrics analyst. Return strict JSON only.',
        },
        {
          role: 'user',
          content: buildPrompt(lyrics),
        },
      ],
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Grok error ${response.status}: ${details}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  const parsed = extractJsonObject(content);
  return normalizeAnalysisShape(parsed);
}

export async function analyzeLyricsWithProvider(lyrics, provider) {
  const requestedProvider = normalizeProvider(provider) || DEFAULT_PROVIDER;
  const safeLyrics = String(lyrics || '').trim();

  if (!safeLyrics) {
    return {
      analysis: analyzeLyricsLocally(''),
      providerRequested: requestedProvider,
      providerUsed: 'local',
      providerError: 'Lyrics were empty',
    };
  }

  if (requestedProvider === 'local') {
    return {
      analysis: analyzeLyricsLocally(safeLyrics),
      providerRequested: requestedProvider,
      providerUsed: 'local',
      providerError: null,
    };
  }

  try {
    let analysis;
    if (requestedProvider === 'openai') {
      analysis = await analyzeWithOpenAI(safeLyrics);
    } else if (requestedProvider === 'claude') {
      analysis = await analyzeWithClaude(safeLyrics);
    } else {
      analysis = await analyzeWithGrok(safeLyrics);
    }

    return {
      analysis,
      providerRequested: requestedProvider,
      providerUsed: requestedProvider,
      providerError: null,
    };
  } catch (error) {
    const providerError = error instanceof Error ? error.message : String(error);
    return {
      analysis: analyzeLyricsLocally(safeLyrics),
      providerRequested: requestedProvider,
      providerUsed: 'local',
      providerError,
    };
  }
}

