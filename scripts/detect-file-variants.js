#!/usr/bin/env node

/**
 * Detect File Variants Utility
 * 
 * Scans audio folder for duplicate files with different extensions/versions
 * Groups variants in the database for future unlockable content features
 * Does NOT delete files - only marks relationships in the database
 * 
 * Usage:
 *   node scripts/detect-file-variants.js --scan      # Find all variants
 *   node scripts/detect-file-variants.js --group     # Create variant groups in DB
 *   node scripts/detect-file-variants.js --review    # Show potential groupings
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AUDIO_DIR = '/Volumes/extremeDos/temp music';
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
    .replace(/\.(wav|mp3|m4a|flac|aiff?)$/i, '') // Remove extension
    .replace(/_?(mastered|mas|m|_m|_mas)$/i, '') // Remove mastering tags
    .replace(/_?(demo|_demo)$/i, '')              // Remove demo tags
    .replace(/[_\-]/g, ' ')                      // Normalize separators
    .replace(/\s+/g, ' ')                        // Normalize spaces
    .trim();
}

// Extract variant type from filename
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

// Get file sonic properties
function getFileProperties(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase().slice(1);
    
    return {
      size: stats.size,
      sizeKB: Math.round(stats.size / 1024),
      extension: ext,
      // Estimate bitrate from file size (rough approximation)
      estimatedBitrate: ext === 'mp3' 
        ? Math.round((stats.size * 8) / (stats.size / 1000000 * 1000)) 
        : null,
    };
  } catch (err) {
    return null;
  }
}

// Scan audio directory for all files
function scanAudioFiles() {
  const results = [];
  
  function scanDir(dir, prefix = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('._') || entry.name.startsWith('.')) continue;
      
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.endsWith('.zip') && !entry.name.includes('crdownload')) {
          scanDir(fullPath, prefix ? `${prefix}/${entry.name}` : entry.name);
        }
      } else if (/\.(wav|mp3|m4a|flac|aiff?)$/i.test(entry.name)) {
        const props = getFileProperties(fullPath);
        if (props) {
          results.push({
            fileName: entry.name,
            relativePath: prefix ? `${prefix}/${entry.name}` : entry.name,
            fullPath: fullPath,
            normalized: normalizeForVariantMatch(entry.name),
            variantType: detectVariantType(entry.name),
            ...props,
          });
        }
      }
    }
  }
  
  scanDir(AUDIO_DIR);
  return results;
}

// Group files by variant families
function groupVariants(files) {
  const groups = {};
  
  for (const file of files) {
    const key = file.normalized;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(file);
  }
  
  // Filter to only groups with multiple variants
  return Object.entries(groups)
    .filter(([key, files]) => files.length > 1)
    .reduce((acc, [key, files]) => {
      acc[key] = files;
      return acc;
    }, {});
}

// Load analyses from database
async function loadAnalyses() {
  const response = await fetch(`${BASE_URL}/analyses/load`, { headers: AUTH_HEADERS });
  const data = await response.json();
  return data.analyses || [];
}

// Find matching database record for a file
function findMatchInDatabase(fileName, analyses) {
  // Try exact match first
  const exact = analyses.find(a => a.fileName === fileName);
  if (exact) return exact;
  
  // Try normalized match
  const normalized = normalizeForVariantMatch(fileName);
  return analyses.find(a => normalizeForVariantMatch(a.fileName) === normalized);
}

// Display variant group for review
function displayVariantGroup(groupName, files) {
  console.log(`\n📁 Variant Group: "${groupName}"`);
  console.log('='.repeat(80));
  
  files.forEach((file, idx) => {
    const qualityIndicator = file.sizeKB > 20000 ? '⭐ HIGH' : file.sizeKB > 5000 ? '⭐ MEDIUM' : '⭐ LOW';
    console.log(`  [${idx + 1}] ${file.fileName}`);
    console.log(`      Extension: ${file.extension} | Size: ${file.sizeKB}KB | Type: ${file.variantType} | Quality: ${qualityIndicator}`);
  });
}

// Create variant group in database
async function createVariantGroup(groupName, files, analyses) {
  console.log(`\n🔗 Creating variant group: "${groupName}"`);
  
  // Find database records for each file variant
  const variantRecords = [];
  
  for (const file of files) {
    const analysis = findMatchInDatabase(file.fileName, analyses);
    if (analysis) {
      variantRecords.push({
        id: analysis.id,
        fileName: analysis.fileName,
        variantType: file.variantType,
        fileSize: file.size,
        fileExtension: file.extension,
      });
    } else {
      console.log(`  ⚠️  No database record found for: ${file.fileName}`);
    }
  }
  
  if (variantRecords.length < 2) {
    console.log(`  ⚠️  Only ${variantRecords.length} variants found in database. Skipping.`);
    return null;
  }
  
  // Create a variant group ID (UUID-like)
  const variantGroupId = `vg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  console.log(`  ✓ Variant Group ID: ${variantGroupId}`);
  console.log(`  ✓ Variants found in DB: ${variantRecords.length}`);
  variantRecords.forEach(v => {
    console.log(`    - ${v.fileName} (${v.variantType})`);
  });
  
  return {
    variantGroupId,
    groupName,
    variants: variantRecords,
    createdAt: new Date().toISOString(),
    status: 'unlockable', // Future: draft, unlocked, sold, etc.
  };
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage:');
    console.log('  node scripts/detect-file-variants.js --scan      # Find all variants');
    console.log('  node scripts/detect-file-variants.js --review    # Show potential groupings');
    console.log('  node scripts/detect-file-variants.js --group     # Create variant groups in DB');
    console.log('');
    return;
  }
  
  console.log('🔍 Scanning audio folder...\n');
  const files = scanAudioFiles();
  console.log(`Found ${files.length} total audio files\n`);
  
  const variants = groupVariants(files);
  const groupCount = Object.keys(variants).length;
  console.log(`Found ${groupCount} variant groups (files with multiple versions)\n`);
  
  if (args[0] === '--scan') {
    console.log('📊 Variant Group Summary:');
    console.log('='.repeat(80));
    Object.entries(variants).forEach(([groupName, files]) => {
      console.log(`${groupName}`);
      console.log(`  Files: ${files.length} variants`);
      files.forEach(f => {
        console.log(`    • ${f.fileName} (${f.variantType}, ${f.sizeKB}KB)`);
      });
    });
    return;
  }
  
  if (args[0] === '--review') {
    console.log(`\n📋 Detailed Review of ${groupCount} Variant Groups\n`);
    Object.entries(variants).forEach(([groupName, files]) => {
      displayVariantGroup(groupName, files);
    });
    return;
  }
  
  if (args[0] === '--group') {
    console.log('Loading database analyses...\n');
    const analyses = await loadAnalyses();
    console.log(`Loaded ${analyses.length} songs from database\n`);
    
    const variantGroups = [];
    let groupsCreated = 0;
    
    for (const [groupName, files] of Object.entries(variants)) {
      const group = await createVariantGroup(groupName, files, analyses);
      if (group) {
        variantGroups.push(group);
        groupsCreated++;
      }
    }
    
    console.log(`\n✅ Created ${groupsCreated} variant groups`);
    console.log(`\n📝 Variant Groups Ready for Database:\n`);
    
    // Display summary
    variantGroups.forEach((group, idx) => {
      console.log(`[${idx + 1}] ${group.groupName}`);
      console.log(`    ID: ${group.variantGroupId}`);
      console.log(`    Variants: ${group.variants.map(v => `${v.variantType}`).join(', ')}`);
      group.variants.forEach(v => {
        console.log(`      • ${v.fileName}`);
      });
    });
    
    console.log(`\n💡 Next Steps:`);
    console.log(`  1. Review the variant groups above`);
    console.log(`  2. Add a 'variantGroupId' field to analyses in the database`);
    console.log(`  3. Create a 'variant_groups' table to store group metadata`);
    console.log(`  4. Update UI to show unlockable content badges`);
    console.log(`\n  Example variant_groups table structure:`);
    console.log(`    - id (UUID)`);
    console.log(`    - groupName (text)`);
    console.log(`    - status (draft, unlockable, unlocked, premium)`);
    console.log(`    - createdAt (timestamp)`);
    console.log(`    - analyses (JSON array of IDs in group)`);
    
    return;
  }
}

main().catch(console.error);
