#!/usr/bin/env node

/**
 * Register Variant Groups in Database
 * 
 * Registers variant groups detected by detect-file-variants.js into the database
 * Updates analyses records with variant group metadata
 * Enables unlockable content feature
 * 
 * Run after: consolidate-variants.js
 * Usage:
 *   node scripts/register-variant-groups.js --preview    # Show what would be registered
 *   node scripts/register-variant-groups.js --register   # Register groups in database
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

// Group analyses by normalized name
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
    });
  }
  
  // Filter to only groups with multiple variants (remaining after consolidation)
  return Object.entries(groups)
    .filter(([key, analyses]) => analyses.length > 1)
    .reduce((acc, [key, analyses]) => {
      acc[key] = analyses;
      return acc;
    }, {});
}

// Format variants for API
function formatVariantsForAPI(groupName, variants) {
  return {
    variantGroupId: `vg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    groupName: groupName,
    variants: variants.map(v => ({
      id: v.id,
      fileName: v.fileName,
      variantType: v.variantType,
      title: v.title,
    })),
    status: 'unlockable',
  };
}

// Register variants with server
async function registerVariants(variantGroups) {
  const response = await fetch(`${BASE_URL}/analyses/variants/register`, {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: JSON.stringify({ variantGroups }),
  });
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  
  return response.json();
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage:');
    console.log('  node scripts/register-variant-groups.js --preview    # Show what would be registered');
    console.log('  node scripts/register-variant-groups.js --register   # Register groups in database');
    console.log('');
    return;
  }
  
  console.log('📊 Loading analyses from database...\n');
  const analyses = await loadAnalyses();
  console.log(`Loaded ${analyses.length} analyses\n`);
  
  const variantGroups = groupAnalysesByVariant(analyses);
  const groupCount = Object.keys(variantGroups).length;
  console.log(`Found ${groupCount} groups with remaining variant duplicates\n`);
  
  if (groupCount === 0) {
    console.log('✅ No variants to register (all duplicates have been consolidated)\n');
    return;
  }
  
  // Format variants for API
  const formattedGroups = [];
  Object.entries(variantGroups).forEach(([groupName, variants]) => {
    formattedGroups.push(formatVariantsForAPI(groupName, variants));
  });
  
  if (args[0] === '--preview') {
    console.log('📋 Variant Groups Ready for Registration:\n');
    
    formattedGroups.forEach((group, idx) => {
      console.log(`[${idx + 1}] ${group.groupName}`);
      console.log(`    ID: ${group.variantGroupId}`);
      console.log(`    Variants (${group.variants.length}):`);
      group.variants.forEach(v => {
        console.log(`      • ${v.fileName} (${v.variantType})`);
      });
    });
    
    console.log(`\n📊 Summary:`);
    console.log(`  Variant groups to register: ${formattedGroups.length}`);
    console.log(`  Total variants: ${formattedGroups.reduce((sum, g) => sum + g.variants.length, 0)}`);
    console.log(`  Status: Ready for registration\n`);
    
    return;
  }
  
  if (args[0] === '--register') {
    console.log('🔗 Registering variant groups in database...\n');
    
    try {
      const result = await registerVariants(formattedGroups);
      
      if (result.success) {
        console.log(`✅ Registration successful!\n`);
        console.log(`📊 Results:`);
        console.log(`  Registered: ${result.registered} groups`);
        console.log(`  Failed: ${result.failed}`);
        console.log(`  Status: ${result.message}\n`);
        
        if (result.failed === 0) {
          console.log(`🎉 All variant groups registered successfully!`);
          console.log(`\n💡 Next steps:`);
          console.log(`  1. Verify variant metadata in UI`);
          console.log(`  2. Add unlockable content badges to songs`);
          console.log(`  3. Test variant selection/preview in analysis view\n`);
        }
      } else {
        console.error('❌ Registration failed:', result.error);
      }
    } catch (err) {
      console.error('❌ Error registering variants:', err.message);
      process.exit(1);
    }
    
    return;
  }
}

main().catch(console.error);
