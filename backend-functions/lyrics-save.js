/**
 * Endpoint for updating lyrics in an existing analysis
 * This endpoint only updates lyric-related fields without changing timing
 * 
 * Expected payload:
 * {
 *   analysisId: string,
 *   lyrics: string,
 *   lyricsSegments: LyricSegment[],
 *   lyricsWords: LyricWord[]
 * }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const {
      analysisId,
      lyrics,
      lyricsSegments,
      lyricsWords,
    } = await req.json();

    if (!analysisId) {
      return new Response(
        JSON.stringify({ error: 'Analysis ID is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // Validate user access
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Update only the lyrics-related fields in the analysis
    const { error: updateError } = await supabaseClient
      .from('song_analyses')
      .update({
        lyrics,
        lyrics_segments: lyricsSegments,
        lyrics_words: lyricsWords,
        updated_at: new Date().toISOString(),
      })
      .eq('id', analysisId)
      .eq('user_id', user.id); // Ensure user can only update their own analyses

    if (updateError) {
      console.error('Error updating lyrics:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to save lyrics: ' + updateError.message }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Lyrics saved successfully' }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Unexpected error in lyrics-save function:', error);
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});