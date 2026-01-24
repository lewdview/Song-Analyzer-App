#!/usr/bin/env node

/**
 * Upload audio files to Supabase Storage for songs in the database
 * 
 * Usage:
 *   node scripts/upload-audio.js --preview          # Show what would be uploaded
 *   node scripts/upload-audio.js --upload           # Upload audio files
 *   node scripts/upload-audio.js --missing          # List songs missing audio
 */

const fs = require('fs');
const path = require('path');

const AUDIO_DIR = '/Volumes/extremeDos/___temp music';
const BASE_URL = 'https://pznmptudgicrmljjafex.supabase.co/functions/v1/make-server-473d7342';
const AUTH_HEADERS = {
  'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6bm1wdHVkZ2ljcm1samphZmV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzMDE4ODUsImV4cCI6MjA3OTg3Nzg4NX0.syu1bbr9OJ5LxCnTrybLVgsjac4UOkFVdAHuvhKMY2g',
  'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6bm1wdHVkZ2ljcm1samphZmV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzMDE4ODUsImV4cCI6MjA3OTg3Nzg4NX0.syu1bbr9OJ5LxCnTrybLVgsjac4UOkFVdAHuvhKMY2g',
  'Content-Type': 'application/json'
};

async function loadAnalyses() {
  const response = await fetch(`${BASE_URL}/analyses/load`, { headers: AUTH_HEADERS });
  const data = await response.json();
  return data.analyses || [];
}

async function getAudioFiles() {
  const results = [];
  
  function scanDir(dir, prefix = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('._') || entry.name.startsWith('.')) continue;
      
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Scan subdirectories (but not zip files or deep nesting)
        if (!entry.name.endsWith('.zip') && !entry.name.includes('crdownload')) {
          scanDir(fullPath, prefix ? `${prefix}/${entry.name}` : entry.name);
        }
      } else if (entry.name.endsWith('.wav') || entry.name.endsWith('.mp3') || entry.name.endsWith('.m4a')) {
        results.push({
          fileName: entry.name,
          relativePath: prefix ? `${prefix}/${entry.name}` : entry.name,
          fullPath: fullPath
        });
      }
    }
  }
  
  scanDir(AUDIO_DIR);
  return results;
}

// Normalize filename for matching (remove common differences)
function normalizeFilename(name) {
  return name
    .toLowerCase()
    .replace(/\.(wav|mp3|m4a)$/i, '')
    // Remove leading/trailing spaces
    .trim()
    // Normalize spaces and underscores
    .replace(/[_\s]+/g, ' ')
    // Remove common prefixes/suffixes for matching
    .replace(/^(0[1-9]|1[0-9]|2[0-9])\s*-\s*/, '') // track numbers
    .replace(/_?(mastered|mas|m|mixdown|relay|pct|abbyroad)$/i, '')
    .replace(/_?48000$/i, '')
    .trim();
}

// Find best matching audio file for a database record
function findMatchingFile(dbFileName, audioFiles) {
  // First try exact filename match
  const exactMatch = audioFiles.find(f => f.fileName === dbFileName);
  if (exactMatch) return exactMatch;
  
  // Try case-insensitive exact match
  const caseMatch = audioFiles.find(f => f.fileName.toLowerCase() === dbFileName.toLowerCase());
  if (caseMatch) return caseMatch;
  
  // Try normalized match
  const normalizedDb = normalizeFilename(dbFileName);
  for (const audioFile of audioFiles) {
    const normalizedAudio = normalizeFilename(audioFile.fileName);
    if (normalizedDb === normalizedAudio) {
      return audioFile;
    }
  }
  
  // Try partial match (db filename contained in audio filename or vice versa)
  const dbBase = normalizedDb.replace(/\s+/g, '');
  for (const audioFile of audioFiles) {
    const audioBase = normalizeFilename(audioFile.fileName).replace(/\s+/g, '');
    if (dbBase.includes(audioBase) || audioBase.includes(dbBase)) {
      if (dbBase.length > 3 && audioBase.length > 3) { // Avoid false positives
        return audioFile;
      }
    }
  }
  
  return null;
}

async function uploadAudio(analysisId, filePath, fileName) {
  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer]);
  
  const formData = new FormData();
  formData.append('audio', blob, fileName);
  formData.append('analysisId', analysisId);
  
  const response = await fetch(`${BASE_URL}/audio/upload`, {
    method: 'POST',
    headers: {
      'Authorization': AUTH_HEADERS['Authorization'],
      'apikey': AUTH_HEADERS['apikey'],
    },
    body: formData,
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload failed: ${response.status} - ${text.substring(0, 100)}`);
  }
  
  return response.json();
}

async function updateAnalysisWithAudioUrl(analysis, storedAudioUrl) {
  // Delete then re-save with storedAudioUrl
  const deleteResponse = await fetch(`${BASE_URL}/analyses/${analysis.id}`, {
    method: 'DELETE',
    headers: AUTH_HEADERS
  });
  
  if (!deleteResponse.ok) {
    throw new Error('Failed to delete for update');
  }
  
  analysis.storedAudioUrl = storedAudioUrl;
  
  const saveResponse = await fetch(`${BASE_URL}/analyses/save`, {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: JSON.stringify({ analyses: [analysis] })
  });
  
  return saveResponse.json();
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage:');
    console.log('  node scripts/upload-audio.js --preview   # Show what would be uploaded');
    console.log('  node scripts/upload-audio.js --upload    # Upload audio files');
    console.log('  node scripts/upload-audio.js --missing   # List songs missing audio');
    console.log('  node scripts/upload-audio.js --unmatched # List audio files not in DB');
    return;
  }
  
  console.log('Loading database...');
  const analyses = await loadAnalyses();
  console.log(`Found ${analyses.length} songs in database\n`);
  
  console.log('Scanning audio folder...');
  const audioFiles = await getAudioFiles();
  console.log(`Found ${audioFiles.length} audio files\n`);
  
  // Separate songs with and without audio
  const withAudio = analyses.filter(a => a.storedAudioUrl);
  const withoutAudio = analyses.filter(a => !a.storedAudioUrl);
  
  console.log(`Songs with audio: ${withAudio.length}`);
  console.log(`Songs missing audio: ${withoutAudio.length}\n`);
  
  if (args[0] === '--missing') {
    console.log('--- Songs missing audio ---\n');
    withoutAudio.forEach(a => console.log(a.fileName));
    return;
  }
  
  if (args[0] === '--unmatched') {
    console.log('--- Audio files not matching any DB record ---\n');
    const usedFiles = new Set();
    for (const analysis of analyses) {
      const match = findMatchingFile(analysis.fileName, audioFiles);
      if (match) usedFiles.add(match.fullPath);
    }
    const unmatched = audioFiles.filter(f => !usedFiles.has(f.fullPath));
    console.log(`${unmatched.length} unmatched files:\n`);
    unmatched.forEach(f => console.log(f.relativePath));
    return;
  }
  
  // Find matches for songs without audio
  const matches = [];
  const noMatch = [];
  
  for (const analysis of withoutAudio) {
    const match = findMatchingFile(analysis.fileName, audioFiles);
    if (match) {
      matches.push({ analysis, audioFile: match });
    } else {
      noMatch.push(analysis);
    }
  }
  
  console.log(`Matched: ${matches.length}`);
  console.log(`No match found: ${noMatch.length}\n`);
  
  if (args[0] === '--preview') {
    console.log('--- Would upload these matches ---\n');
    matches.forEach(({ analysis, audioFile }) => {
      console.log(`${analysis.fileName}`);
      console.log(`  -> ${audioFile.relativePath}\n`);
    });
    
    if (noMatch.length > 0) {
      console.log('\n--- No audio file found for ---\n');
      noMatch.forEach(a => console.log(a.fileName));
    }
    return;
  }
  
  if (args[0] === '--upload') {
    console.log('--- Uploading audio files ---\n');
    let uploaded = 0;
    let failed = 0;
    let skipped = 0;
    
    for (const { analysis, audioFile } of matches) {
      const filePath = audioFile.fullPath;
      const fileSize = fs.statSync(filePath).size;
      
      // Skip files over 200MB (Supabase limit)
      if (fileSize > 200 * 1024 * 1024) {
        console.log(`⚠ Skipping ${audioFile.fileName} - too large (${(fileSize / 1024 / 1024).toFixed(1)}MB)`);
        skipped++;
        continue;
      }
      
      const displayName = audioFile.fileName.substring(0, 40).padEnd(40);
      process.stdout.write(`Uploading: ${displayName}...`);
      
      try {
        const result = await uploadAudio(analysis.id, filePath, audioFile.fileName);
        
        if (result.storedAudioUrl) {
          // Update the analysis record with the new URL
          await updateAnalysisWithAudioUrl(analysis, result.storedAudioUrl);
          console.log(' ✓');
          uploaded++;
        } else {
          console.log(' ✗ No URL returned');
          failed++;
        }
      } catch (err) {
        console.log(` ✗ ${err.message.substring(0, 50)}`);
        failed++;
      }
      
      // Small delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`\nComplete: ${uploaded} uploaded, ${failed} failed, ${skipped} skipped (too large)`);
    return;
  }
}

main().catch(console.error);
