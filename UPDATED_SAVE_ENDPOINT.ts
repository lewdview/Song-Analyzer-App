// ============================================================================
// UPDATED /analyses/save ENDPOINT
// This replaces the existing endpoint to support UPDATES, not just creates
// 
// Deploy this to your Supabase Edge Function: make-server-473d7342/analyses/save
// ============================================================================

// Save song analysis to permanent storage
// NOW HANDLES BOTH CREATING NEW ANALYSES AND UPDATING EXISTING ONES
app.post('/make-server-473d7342/analyses/save', async (c) => {
  try {
    const body = await c.req.json();
    const { analyses } = body;

    if (!analyses || !Array.isArray(analyses)) {
      return c.json({ error: 'Invalid analyses data' }, 400);
    }

    // Track what we do with each analysis
    const savedKeys: string[] = [];
    const updatedKeys: string[] = [];
    const newIds: string[] = [];
    const updatedIds: string[] = [];
    
    for (const analysis of analyses) {
      const key = `analysis:${analysis.id}`;
      
      // Check if this analysis already exists
      const existing = await kv.get(key);
      if (!existing) {
        // ===== NEW ANALYSIS =====
        // Create it with all provided data
        await kv.set(key, analysis);
        savedKeys.push(key);
        newIds.push(analysis.id);
        console.log(`Saved new analysis: ${key} - ${analysis.fileName}`);
      } else {
        // ===== EXISTING ANALYSIS - UPDATE IT =====
        // Merge existing data with new data
        // Priority: new data overwrites existing, but preserve certain fields
        const updatedAnalysis = {
          ...existing,           // Start with existing data
          ...analysis,           // Override with new data
          id: analysis.id,       // Ensure ID doesn't change
          createdAt: existing.createdAt,  // Always preserve original creation time
          analyzedAt: analysis.analyzedAt || existing.analyzedAt, // Use new timestamp if provided
        };
        
        await kv.set(key, updatedAnalysis);
        updatedKeys.push(key);
        updatedIds.push(analysis.id);
        
        console.log(`Updated existing analysis: ${key}`);
        console.log(`  - Updated fields: lyrics, lyricsSegments, lyricsWords`);
      }
    }

    // Update the global index with all IDs (both new and updated)
    const allIds = [...newIds, ...updatedIds];
    if (allIds.length > 0) {
      const indexKey = 'analyses:index';
      const existingIndex = await kv.get(indexKey) || [];
      const updatedIndex = [...new Set([...existingIndex, ...allIds])];
      await kv.set(indexKey, updatedIndex);
    }

    // Return response indicating both creates and updates
    return c.json({ 
      success: true,
      saved: savedKeys.length,     // NEW analyses
      updated: updatedKeys.length, // EXISTING analyses that were updated
      total: analyses.length,
      message: `Successfully saved ${savedKeys.length} new analyses and updated ${updatedKeys.length} existing analyses (total: ${analyses.length})`
    });

  } catch (error) {
    console.error('Save analyses error:', error);
    return c.json({ 
      error: 'Failed to save analyses',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// ============================================================================
// DEPLOYMENT INSTRUCTIONS
// ============================================================================
// 
// 1. Copy the app.post('/make-server-473d7342/analyses/save', ...) handler above
// 
// 2. Go to your Supabase Dashboard:
//    - Navigate to Edge Functions
//    - Find the "make-server-473d7342" function
//    - Locate the "/analyses/save" route handler
//    - Replace the entire handler with the updated code above
//
// 3. Test it by editing lyrics in your app - they should now sync to database
//
// 4. The response will now include:
//    {
//      "success": true,
//      "saved": 0,           // NEW analyses created
//      "updated": 1,         // EXISTING analyses updated  
//      "total": 1,
//      "message": "..."
//    }
//
// ============================================================================
