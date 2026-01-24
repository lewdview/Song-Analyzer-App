# Lyrics Persistence Solution

## Current Issue
The lyric editor saves edits to localStorage successfully, but they don't persist to the database because your serverless function at `/analyses/save` only handles creating new analyses, not updating existing ones.

When the function receives an analysis that already exists, it returns:
```json
{
  "success": true,
  "saved": 0,
  "skipped": 1,
  "message": "Successfully saved 0 new analyses (1 already existed)"
}
```

## Current Workaround (Active Now)
✅ Edits save to localStorage with key: `lyrics-{analysisId}`
✅ Edits are applied when KaraokePage loads
✅ Edits are applied when the main App loads analyses from database
❌ Edits are NOT persisted to the database

## Complete Solution Needed

You need to update your Supabase Edge Function to handle updates. Here's what needs to be modified:

### Option 1: Modify `/analyses/save` to Handle Updates

Update your serverless function at:
`https://pznmptudgicrmljjafex.supabase.co/functions/v1/make-server-473d7342/analyses/save`

Change the logic from:
```typescript
// Current logic (pseudo-code)
if (analysisExists) {
  skip++;
} else {
  insert(analysis);
  saved++;
}
```

To:
```typescript
// Updated logic
if (analysisExists) {
  update(analysis); // UPDATE instead of skip
  updated++;
} else {
  insert(analysis);
  saved++;
}
```

### Option 2: Create New `/analyses/update` Endpoint

Create a new endpoint specifically for updates:
```typescript
// File: supabase/functions/make-server-473d7342/analyses/update/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { 
      headers: { 'Access-Control-Allow-Origin': '*' } 
    });
  }

  const { analysis } = await req.json();
  
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  );

  const { error } = await supabaseClient
    .from('analyses') // or whatever your table name is
    .update({
      lyrics: analysis.lyrics,
      lyrics_segments: analysis.lyricsSegments,
      lyrics_words: analysis.lyricsWords,
      updated_at: new Date().toISOString()
    })
    .eq('id', analysis.id);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
});
```

Then update LyricEditor.tsx to use this endpoint when syncing.

## Deploy Instructions

### If you have Supabase CLI installed:
```bash
cd /path/to/your/supabase/project
supabase functions deploy make-server-473d7342
```

### If using Supabase Dashboard:
1. Go to https://supabase.com/dashboard
2. Navigate to your project
3. Go to Edge Functions
4. Find `make-server-473d7342`
5. Update the function code
6. Deploy

## Files Modified for Current Workaround

1. `/src/utils/lyricsStorage.ts` - Utility to merge localStorage edits
2. `/src/App.tsx` - Applies edits when loading from database
3. `/src/pages/KaraokePage.tsx` - Applies edits when opening karaoke view
4. `/src/components/LyricEditor.tsx` - Saves to localStorage and attempts DB sync

## Testing the Solution

Once the serverless function is updated:

1. Edit lyrics in karaoke mode
2. Click Save
3. Check browser console - should see "Database sync success"
4. Reload the main app
5. Load analyses from database
6. Verify edited lyrics appear everywhere

## Current Behavior

- ✅ Lyrics persist in browser (localStorage)
- ✅ Lyrics appear in karaoke mode across sessions
- ✅ Lyrics appear in main app across sessions
- ❌ Lyrics don't sync across different devices/browsers
- ❌ Clearing browser data loses edits
