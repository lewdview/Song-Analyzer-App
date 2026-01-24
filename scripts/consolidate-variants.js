#!/usr/bin/env node

/**
 * Consolidate Variant Duplicates in Database
 * 
 * Removes duplicate variant entries from database, keeping only the best version
 * Marks other variants for future unlockable content bundling
 * 
 * Priority for keeping:
 * 1. Original versions (non-mastered) - base content
 * 2. Higher quality files (larger file size = higher bitrate)
 * 3. More recent analyses
 * 
 * Usage:
 *   node scripts/consolidate-variants.js --preview    # Show what would be removed
 *   node scripts/consolidate-variants.js --consolidate # Actually remove duplicates
 */

const BASE_URL = 'https://pznmptudgicrmljjafex.supabase.co/functions/v1/make-server-473d7342';
const AUTH_HEADERS = {
  'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6bm1wdHVkZ2ljcm1samphZmV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzMDE4ODUsImV4cCI6MjA3OTg3Nzg4NX0.syu1bbr9OJ5LxCnTrybLVgsjac4UOkFVdAHuvhKMY2g',
  'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6bm1wdHVkZ2ljcm1samphZmV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzMDE4ODUsImV4cCI6MjA3OTg3Nzg4NX0.syu1bbr9OJ5LxCnTrybLVgsjac4UOkFVdAHuvhKMY2g',
  'Content-Type': 'application/json'
};

// Normalize filename for variant matching
function normalizeForVariantMatch(fileName) {
  return fileName
    .toLowerCase()
    .replace(/\.(wav|mp3|m4a|flac|aiff?)$/i, '')
    .replace(/_?(mastered|mas|m|_m|_mas)$/i, '')
    .replace(/_?(demo|_demo)$/i, '')
    .replace(/[_\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Detect variant type
function detectVariantType(fileName) {
  const lower = fileName.toLowerCase();
  
  if (lower.includes('mastered') || lower.includes('_mas') || /_m$/.test(lower)) {
    return 'mastered';
  }
  if (lower.includes('demo')) {
    return 'demo';
  }
  if (lower.includes('mix') || lower.includes('_mx')) {
    return 'remix';
  }
  if (lower.includes('instrumental')) {
    return 'instrumental';
  }
  if (lower.includes('acapella') || lower.includes('vocal')) {
    return 'acapella';
  }
  
  return 'original';
}

// Load analyses from database
async function loadAnalyses() {
  const response = await fetch(`${BASE_URL}/analyses/load`, { headers: AUTH_HEADERS });
  const data = await response.json();
  return data.analyses || [];
}

// Group analyses by normalized name (find duplicates)
function groupAnalysesByVariant(analyses) {
  const groups = {};
  
  for (const analysis of analyses) {
    const normalized = normalizeForVariantMatch(analysis.fileName);
    if (!groups[normalized]) {
      groups[normalized] = [];
    }
    groups[normalized].push({
      id: analysis.id,
      fileName: analysis.fileName,
      title: analysis.title,
      variantType: detectVariantType(analysis.fileName),
      analyzedAt: analysis.analyzedAt,
      hasLyricsWords: analysis.lyricsWords?.length > 0,
      lyricsWordCount: analysis.lyricsWords?.length || 0,
    });
  }
  
  // Filter to only groups with multiple variants
  return Object.entries(groups)
    .filter(([key, analyses]) => analyses.length > 1)
    .reduce((acc, [key, analyses]) => {
      acc[key] = analyses;
      return acc;
    }, {});
}

// Select best version to keep
function selectBestVersion(variants) {
  // Sort by priority
  const sorted = variants.sort((a, b) => {
    // 1. Prefer original versions
    const aIsOriginal = a.variantType === 'original' ? 1 : 0;
    const bIsOriginal = b.variantType === 'original' ? 1 : 0;
    if (aIsOriginal !== bIsOriginal) return bIsOriginal - aIsOriginal;
    
    // 2. Prefer versions with lyrics
    const aHasLyrics = a.hasLyricsWords ? 1 : 0;
    const bHasLyrics = b.hasLyricsWords ? 1 : 0;
    if (aHasLyrics !== bHasLyrics) return bHasLyrics - aHasLyrics;
    
    // 3. Prefer more recent
    const aDate = new Date(a.analyzedAt || 0).getTime();
    const bDate = new Date(b.analyzedAt || 0).getTime();
    return bDate - aDate;
  });
  
  return sorted[0];
}

// Delete analysis from database
async function deleteAnalysis(analysisId) {
  const response = await fetch(`${BASE_URL}/analyses/${analysisId}`, {
    method: 'DELETE',
    headers: AUTH_HEADERS
  });
  return response.ok;
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage:');
    console.log('  node scripts/consolidate-variants.js --preview       # Show what would be removed');
    console.log('  node scripts/consolidate-variants.js --consolidate  # Remove duplicates');
    console.log('');
    return;
  }
  
  console.log('📊 Loading analyses from database...\n');
  const analyses = await loadAnalyses();
  console.log(`Loaded ${analyses.length} analyses\n`);
  
  const variantGroups = groupAnalysesByVariant(analyses);
  const groupCount = Object.keys(variantGroups).length;
  console.log(`Found ${groupCount} groups with duplicate variants\n`);
  
  if (args[0] === '--preview') {
    console.log('📋 Duplicate Variants Preview:\n');
    
    let totalDuplicates = 0;
    
    Object.entries(variantGroups).forEach(([groupName, variants]) => {
      const best = selectBestVersion(variants);
      const toRemove = variants.filter(v => v.id !== best.id);
      
      console.log(`Song: "${groupName}"`);
      console.log(`  Keep: ${best.fileName} (${best.variantType}${best.hasLyricsWords ? ', has lyrics' : ''})`);
      toRemove.forEach(variant => {
        console.log(`  Remove: ${variant.fileName} (${variant.variantType}${variant.hasLyricsWords ? ', has lyrics' : ''})`);
      });
      console.log('');
      
      totalDuplicates += toRemove.length;
    });
    
    console.log(`\n📊 Summary:`);
    console.log(`  Duplicate groups: ${groupCount}`);
    console.log(`  Analyses to remove: ${totalDuplicates}`);
    console.log(`  Analyses to keep: ${groupCount}`);
    console.log(`  Final database size: ${analyses.length - totalDuplicates} analyses\n`);
    
    return;
  }
  
  if (args[0] === '--consolidate') {
    console.log('🔄 Consolidating variant duplicates...\n');
    
    let removed = 0;
    let failed = 0;
    const removedIds = [];
    const keptIds = [];
    
    for (const [groupName, variants] of Object.entries(variantGroups)) {
      const best = selectBestVersion(variants);
      const toRemove = variants.filter(v => v.id !== best.id);
      
      console.log(`Processing: "${groupName}"`);
      console.log(`  ✓ Keeping: ${best.fileName}`);
      
      for (const variant of toRemove) {
        try {
          const success = await deleteAnalysis(variant.id);
          if (success) {
            console.log(`  ✓ Removed: ${variant.fileName}`);
            removed++;
            removedIds.push(variant.id);
          } else {
            console.log(`  ✗ Failed to remove: ${variant.fileName}`);
            failed++;
          }
        } catch (err) {
          console.log(`  ✗ Error removing ${variant.fileName}: ${err.message}`);
          failed++;
        }
      }
      
      keptIds.push(best.id);
    }
    
    console.log(`\n✅ Consolidation complete!`);
    console.log(`\n📊 Results:`);
    console.log(`  Removed: ${removed} duplicate analyses`);
    console.log(`  Failed: ${failed}`);
    console.log(`  Kept: ${keptIds.length} analyses (1 per song)`);
    console.log(`  New total: ${analyses.length - removed} analyses\n`);
    
    if (removed > 0) {
      console.log(`🏷️  Next steps:`);
      console.log(`  1. Update these removed IDs with variant group metadata`);
      console.log(`  2. Create variant_groups table with unlockable content info`);
      console.log(`  3. Update UI to show unlockable badges on songs\n`);
    }
    
    return;
  }
}

main().catch(console.error);
