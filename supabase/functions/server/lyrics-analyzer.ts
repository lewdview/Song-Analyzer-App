export interface LyricsAnalysis {
  mood: string[];
  emotion: string[];
  themes: string[];
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  sentimentScore: number; // -1 to 1
  energyFromLyrics: number; // 0 to 1
  valenceFromLyrics: number; // 0 to 1
}

export async function analyzeLyricsWithAI(lyrics: string, apiKey: string): Promise<LyricsAnalysis> {
  const prompt = `Analyze the following song lyrics and provide a JSON response with mood, emotion, themes, and sentiment analysis.

Lyrics:
"""
${lyrics.substring(0, 2000)} ${lyrics.length > 2000 ? '...(truncated)' : ''}
"""

Provide your analysis in the following JSON format:
{
  "mood": ["array", "of", "mood", "descriptors"],
  "emotion": ["array", "of", "emotions"],
  "themes": ["array", "of", "themes"],
  "sentiment": "positive|negative|neutral|mixed",
  "sentimentScore": <number between -1 and 1>,
  "energyFromLyrics": <number between 0 and 1, where 1 is very energetic/intense>,
  "valenceFromLyrics": <number between 0 and 1, where 1 is very positive/happy>
}

Guidelines:
- mood: emotional atmosphere (e.g., "melancholic", "upbeat", "dark", "cheerful")
- emotion: specific emotions expressed (e.g., "joy", "sadness", "anger", "love")
- themes: subject matter (e.g., "heartbreak", "celebration", "social commentary", "personal growth")
- sentiment: overall emotional tone
- sentimentScore: -1 (very negative) to 1 (very positive)
- energyFromLyrics: based on intensity, urgency, action words
- valenceFromLyrics: based on positivity, optimism, mood

Return ONLY the JSON, no other text.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a music and lyrics analysis expert. Analyze lyrics and provide structured emotional and thematic analysis in JSON format.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();
    
    // Remove markdown code blocks if present
    let jsonContent = content;
    if (content.startsWith('```json')) {
      jsonContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    } else if (content.startsWith('```')) {
      jsonContent = content.replace(/```\n?/g, '');
    }
    
    const analysis = JSON.parse(jsonContent);
    
    return analysis;
  } catch (error) {
    console.error('Error analyzing lyrics with AI:', error);
    
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
