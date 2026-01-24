#!/usr/bin/env node

/**
 * Upload audio files DIRECTLY to Supabase Storage (bypassing Edge Function)
 * 
 * Usage:
 *   node scripts/upload-audio-direct.js --preview
 *   node scripts/upload-audio-direct.js --upload
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const AUDIO_DIR = '/Volumes/extremeDos/___temp music';
const SUPABASE_URL = 'https://pznmptudgicrmljjafex.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6bm1wdHVkZ2ljcm1samphZmV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzMDE4ODUsImV4cCI6MjA3OTg3Nzg4NX0.syu1bbr9OJ5LxCnTrybLVgsjac4UOkFVdAHuvhKMY2g';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6bm1wdHVkZ2ljcm1samphZmV4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDMwMTg4NSwiZXhwIjoyMDc5ODc3ODg1fQ.WUqIZQxG974uurpoZJotScY7s61JY7Ksb3boURBT28M';
const BUCKET = 'song-audio';

const API_BASE = `${SUPABASE_URL}/functions/v1/make-server-473d7342`;
const STORAGE_URL = `${SUPABASE_URL}/storage/v1/object/${BUCKET}`;

const AUTH_HEADERS = {
  'Authorization': `Bearer ${ANON_KEY}`,
  'apikey': ANON_KEY,
  'Content-Type': 'application/json'
};

async function loadAnalyses() {
  const response = await fetch(`${API_BASE}/analyses/load`, { headers: AUTH_HEADERS });
  const data = await response.json();
  return data.analyses || [];
}

function getAudioFiles() {
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

function normalizeFilename(name) {
  return name
    .toLowerCase()
    .replace(/\.(wav|mp3|m4a)$/i, '')
    .trim()
    .replace(/[_\s]+/g, ' ')
    .replace(/^(0[1-9]|1[0-9]|2[0-9])\s*-\s*/, '')
    .replace(/_?(mastered|mas|m|mixdown|relay|pct|abbyroad)$/i, '')
    .replace(/_?48000$/i, '')
    .trim();
}

function findMatchingFile(dbFileName, audioFiles) {
  const exactMatch = audioFiles.find(f => f.fileName === dbFileName);
  if (exactMatch) return exactMatch;
  
  const caseMatch = audioFiles.find(f => f.fileName.toLowerCase() === dbFileName.toLowerCase());
  if (caseMatch) return caseMatch;
  
  const normalizedDb = normalizeFilename(dbFileName);
  for (const audioFile of audioFiles) {
    if (normalizeFilename(audioFile.fileName) === normalizedDb) {
      return audioFile;
    }
  }
  
  const dbBase = normalizedDb.replace(/\s+/g, '');
  for (const audioFile of audioFiles) {
    const audioBase = normalizeFilename(audioFile.fileName).replace(/\s+/g, '');
    if (dbBase.includes(audioBase) || audioBase.includes(dbBase)) {
      if (dbBase.length > 3 && audioBase.length > 3) {
        return audioFile;
      }
    }
  }
  
  return null;
}

function uploadToStorage(analysisId, filePath, fileName) {
  const ext = path.extname(fileName).slice(1) || 'wav';
  const storagePath = `${analysisId}.${ext}`;
  
  // Determine content type
  const contentTypes = {
    'wav': 'audio/wav',
    'mp3': 'audio/mpeg',
    'm4a': 'audio/mp4'
  };
  const contentType = contentTypes[ext] || 'audio/mpeg';
  
  // Use curl PUT with -T for reliable binary upload
  // Escape the file path for shell
  const escapedPath = filePath
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`');
  
  const curlCmd = `curl -s -X PUT '${STORAGE_URL}/${storagePath}' ` +
    `-H 'Authorization: Bearer ${SERVICE_KEY}' ` +
    `-H 'apikey: ${SERVICE_KEY}' ` +
    `-H 'Content-Type: ${contentType}' ` +
    `-T "${escapedPath}"`;
  
  const result = execSync(curlCmd, { maxBuffer: 50 * 1024 * 1024, timeout: 300000 }).toString();
  const json = JSON.parse(result);
  
  if (!json.Key) {
    throw new Error(`Upload failed: ${result.substring(0, 100)}`);
  }
  
  // Return public URL
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;
  return publicUrl;
}

async function updateAnalysisWithAudioUrl(analysis, storedAudioUrl) {
  // Delete then re-save
  await fetch(`${API_BASE}/analyses/${analysis.id}`, {
    method: 'DELETE',
    headers: AUTH_HEADERS
  });
  
  analysis.storedAudioUrl = storedAudioUrl;
  
  const saveResponse = await fetch(`${API_BASE}/analyses/save`, {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: JSON.stringify({ analyses: [analysis] })
  });
  
  if (!saveResponse.ok) {
    throw new Error('Failed to update analysis record');
  }
  
  return saveResponse.json();
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage:');
    console.log('  node scripts/upload-audio-direct.js --preview');
    console.log('  node scripts/upload-audio-direct.js --upload');
    return;
  }
  
  console.log('Loading database...');
  const analyses = await loadAnalyses();
  console.log(`Found ${analyses.length} songs in database\n`);
  
  console.log('Scanning audio folder...');
  const audioFiles = getAudioFiles();
  console.log(`Found ${audioFiles.length} audio files\n`);
  
  const withAudio = analyses.filter(a => a.storedAudioUrl);
  const withoutAudio = analyses.filter(a => !a.storedAudioUrl);
  
  console.log(`Songs with audio: ${withAudio.length}`);
  console.log(`Songs missing audio: ${withoutAudio.length}\n`);
  
  // Find matches
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
    console.log('--- Would upload ---\n');
    matches.slice(0, 20).forEach(({ analysis, audioFile }) => {
      const size = fs.statSync(audioFile.fullPath).size;
      console.log(`${analysis.fileName} -> ${audioFile.relativePath} (${(size/1024/1024).toFixed(1)}MB)`);
    });
    if (matches.length > 20) console.log(`... and ${matches.length - 20} more`);
    return;
  }
  
  if (args[0] === '--upload') {
    console.log('--- Uploading directly to Supabase Storage ---\n');
    let uploaded = 0;
    let failed = 0;
    let skipped = 0;
    
    // Process in smaller batches with verification
    const batchSize = 5;
    
    for (let i = 0; i < matches.length; i++) {
      const { analysis, audioFile } = matches[i];
      const fileSize = fs.statSync(audioFile.fullPath).size;
      
      if (fileSize > 200 * 1024 * 1024) {
        console.log(`⚠ Skipping ${audioFile.fileName} - too large (${(fileSize / 1024 / 1024).toFixed(1)}MB)`);
        skipped++;
        continue;
      }
      
      const displayName = audioFile.fileName.substring(0, 35).padEnd(35);
      const sizeMB = (fileSize / 1024 / 1024).toFixed(1).padStart(5);
      process.stdout.write(`[${sizeMB}MB] ${displayName}...`);
      
      try {
        const storedUrl = await uploadToStorage(analysis.id, audioFile.fullPath, audioFile.fileName);
        await updateAnalysisWithAudioUrl(analysis, storedUrl);
        console.log(' \u2713');
        uploaded++;
        
        // Verify every 10 uploads
        if (uploaded % 10 === 0) {
          console.log(`  [Verified ${uploaded} uploads so far]`);
        }
      } catch (err) {
        console.log(` \u2717 ${err.message.substring(0, 60)}`);
        failed++;
      }
      
      // Longer delay to ensure upload completes
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`\nComplete: ${uploaded} uploaded, ${failed} failed, ${skipped} skipped`);
  }
}

main().catch(console.error);
