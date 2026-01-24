export interface LyricsAnalysis {
  mood: string[];
  emotion: string[];
  themes: string[];
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  sentimentScore: number; // -1 to 1
  energyFromLyrics: number; // 0 to 1
  valenceFromLyrics: number; // 0 to 1
}

export interface SonotellerResponse {
  summary?: string;
  moods?: string[];
  themes?: string[];
  explicit?: boolean;
  language?: string;
  keywords?: string[];
  [key: string]: any;
}

/**
 * Analyze lyrics using Sonoteller.ai via RapidAPI
 * Requires SONOTELLER_RAPID_KEY and SONOTELLER_RAPID_HOST environment variables
 */
export async function analyzeLyricsWithAI(lyrics: string, _apiKey: string): Promise<LyricsAnalysis> {
  const rapidApiKey = Deno.env.get('SONOTELLER_RAPID_KEY');
  const rapidApiHost = Deno.env.get('SONOTELLER_RAPID_HOST') || 'sonoteller-ai1.p.rapidapi.com';

  if (!rapidApiKey) {
    throw new Error('SONOTELLER_RAPID_KEY environment variable is not set');
  }

  try {
    console.log('Analyzing lyrics with Sonoteller.ai...');

    // Prepare lyrics for Sonoteller (text-based analysis)
    // Note: Sonoteller API expects a file URL, but we can send lyrics as text for analysis
    const response = await fetch(`https://${rapidApiHost}/lyrics`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-RapidAPI-Key': rapidApiKey,
        'X-RapidAPI-Host': rapidApiHost,
      },
      body: JSON.stringify({
        text: lyrics.substring(0, 2000), // Truncate if too long
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`Sonoteller API error (${response.status}): ${errorText}`);
      throw new Error(`Sonoteller API error: ${response.status}`);
    }

    const data: SonotellerResponse = await response.json();
    console.log('Sonoteller analysis received:', data);

    // Extract and normalize Sonoteller response into our format
    const mood = data.moods || [];
    const themes = data.themes || [];
    const keywords = data.keywords || [];
    const isExplicit = data.explicit || false;

    // Determine sentiment from moods and themes
    const negativeMoods = ['sad', 'angry', 'dark', 'melancholic', 'depressing', 'gloomy', 'haunting'];
    const positiveMoods = ['happy', 'upbeat', 'energetic', 'cheerful', 'joyful', 'uplifting', 'inspiring'];
    
    const hasNegative = mood.some((m: string) => negativeMoods.some((nm) => m.toLowerCase().includes(nm)));
    const hasPositive = mood.some((m: string) => positiveMoods.some((pm) => m.toLowerCase().includes(pm)));

    let sentiment: 'positive' | 'negative' | 'neutral' | 'mixed' = 'neutral';
    if (hasPositive && hasNegative) {
      sentiment = 'mixed';
    } else if (hasPositive) {
      sentiment = 'positive';
    } else if (hasNegative) {
      sentiment = 'negative';
    }

    // Estimate energy and valence from moods
    const energyKeywords = ['energetic', 'intense', 'powerful', 'aggressive', 'upbeat', 'fast'];
    const valenceKeywords = ['happy', 'joyful', 'uplifting', 'cheerful', 'positive', 'optimistic'];
    
    const hasEnergyMood = mood.some((m: string) => energyKeywords.some((ek) => m.toLowerCase().includes(ek)));
    const hasValenceMood = mood.some((m: string) => valenceKeywords.some((vk) => m.toLowerCase().includes(vk)));

    const energyFromLyrics = hasEnergyMood ? 0.7 : 0.4;
    const valenceFromLyrics = hasValenceMood ? 0.7 : 0.4;

    // Estimate sentiment score
    const sentimentScore = sentiment === 'positive' ? 0.7 : sentiment === 'negative' ? -0.7 : sentiment === 'mixed' ? 0 : 0;

    return {
      mood: mood.length > 0 ? mood : ['unknown'],
      emotion: keywords.length > 0 ? keywords.slice(0, 5) : ['unknown'], // Use keywords as emotions
      themes: themes.length > 0 ? themes : ['unknown'],
      sentiment,
      sentimentScore,
      energyFromLyrics,
      valenceFromLyrics,
    };
  } catch (error) {
    console.error('Error analyzing lyrics with Sonoteller:', error);

    // Return basic fallback analysis
    return {
      mood: ['unknown'],
      emotion: ['unknown'],
      themes: ['unknown'],
      sentiment: 'neutral',
      sentimentScore: 0,
      energyFromLyrics: 0.5,
      valenceFromLyrics: 0.5,
    };
  }
}
