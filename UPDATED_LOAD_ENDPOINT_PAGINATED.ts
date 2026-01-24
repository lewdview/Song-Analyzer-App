// ============================================================================
// UPDATED /analyses/load ENDPOINT - WITH PAGINATION
// This replaces the load endpoint to handle hundreds of analyses safely
// by fetching in batches instead of all at once
// ============================================================================

// Load all saved analyses with pagination
// Handles both individual fetches and batch operations without URL length issues
app.get('/make-server-473d7342/analyses/load', async (c) => {
  try {
    const indexKey = 'analyses:index';
    const analysisIds = (await kv.get(indexKey)) || [];

    if (analysisIds.length === 0) {
      return c.json({ 
        analyses: [],
        count: 0,
        total: 0 
      });
    }

    // ===== PAGINATION STRATEGY =====
    // Instead of fetching all at once (which causes URL length issues),
    // fetch in batches of 50 IDs at a time
    const BATCH_SIZE = 50;
    const allAnalyses: any[] = [];

    for (let i = 0; i < analysisIds.length; i += BATCH_SIZE) {
      const batchIds = analysisIds.slice(i, i + BATCH_SIZE);
      const keys = batchIds.map((id: string) => `analysis:${id}`);
      
      try {
        const batchAnalyses = await kv.mget(keys);
        const validAnalyses = batchAnalyses.filter((a: any) => a !== null);
        allAnalyses.push(...validAnalyses);
        
        console.log(`Loaded batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(analysisIds.length / BATCH_SIZE)}: ${validAnalyses.length} analyses`);
      } catch (batchError) {
        console.error(`Error loading batch starting at index ${i}:`, batchError);
        // Continue with next batch instead of failing completely
      }
    }

    console.log(`Total loaded ${allAnalyses.length} analyses from ${analysisIds.length} index entries`);

    return c.json({ 
      analyses: allAnalyses,
      count: allAnalyses.length,
      total: analysisIds.length,
      batchSize: BATCH_SIZE,
      batches: Math.ceil(analysisIds.length / BATCH_SIZE)
    });

  } catch (error) {
    console.error('Load analyses error:', error);
    return c.json({ 
      error: 'Failed to load analyses',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// ============================================================================
// DEPLOYMENT INSTRUCTIONS
// ============================================================================
// 
// 1. Copy this entire handler above
// 
// 2. Go to your Supabase Dashboard:
//    - Navigate to Edge Functions
//    - Find the "make-server-473d7342" function
//    - Locate the GET "/analyses/load" route handler
//    - Replace the entire handler with the updated code above
//
// 3. This will:
//    - Fetch analyses in batches of 50 instead of all at once
//    - Prevent URL length issues when you have 200+ analyses
//    - Continue loading even if one batch fails
//    - Return pagination info (batches loaded, total, etc.)
//
// 4. No frontend changes needed - the response format is compatible
//
// ============================================================================
