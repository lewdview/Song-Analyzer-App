#!/usr/bin/env node

/**
 * Edit a song title manually
 * 
 * Usage:
 *   node scripts/edit-title.js "filename.mp3" "New Title"
 *   node scripts/edit-title.js --list              # List all songs with titles
 *   node scripts/edit-title.js --search "keyword"  # Search for songs
 */

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

async function updateTitle(analysis, newTitle) {
  // Delete then re-save
  const deleteResponse = await fetch(`${BASE_URL}/analyses/${analysis.id}`, {
    method: 'DELETE',
    headers: AUTH_HEADERS
  });
  
  if (!deleteResponse.ok) {
    throw new Error('Failed to delete for update');
  }
  
  analysis.title = newTitle;
  
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
    console.log('  node scripts/edit-title.js "filename.mp3" "New Title"');
    console.log('  node scripts/edit-title.js --list');
    console.log('  node scripts/edit-title.js --search "keyword"');
    console.log('  node scripts/edit-title.js --bad    # Show titles that might need fixing');
    return;
  }
  
  const analyses = await loadAnalyses();
  
  // List all
  if (args[0] === '--list') {
    console.log('All songs:\n');
    analyses.sort((a, b) => a.fileName.localeCompare(b.fileName)).forEach(a => {
      console.log(`${a.fileName}`);
      console.log(`  Title: "${a.title || '(none)'}"\n`);
    });
    return;
  }
  
  // Search
  if (args[0] === '--search') {
    const keyword = (args[1] || '').toLowerCase();
    const matches = analyses.filter(a => 
      a.fileName.toLowerCase().includes(keyword) || 
      (a.title || '').toLowerCase().includes(keyword)
    );
    console.log(`Found ${matches.length} matches:\n`);
    matches.forEach(a => {
      console.log(`${a.fileName}`);
      console.log(`  Title: "${a.title || '(none)'}"\n`);
    });
    return;
  }
  
  // Show potentially bad titles
  if (args[0] === '--bad') {
    console.log('Titles that might need fixing:\n');
    const suspicious = analyses.filter(a => {
      const title = a.title || '';
      return (
        title.length < 3 ||
        title.includes('md') ||
        title.includes('Comd') ||
        title.match(/\d{2,}/) ||  // Numbers in title
        title.includes('Oyou') ||
        title.includes('down') && title.length < 10 ||
        title.includes('Untitled') ||
        !title
      );
    });
    suspicious.sort((a, b) => a.fileName.localeCompare(b.fileName)).forEach(a => {
      console.log(`${a.fileName}`);
      console.log(`  Current: "${a.title || '(none)'}"\n`);
    });
    console.log(`Total: ${suspicious.length} titles may need review`);
    return;
  }
  
  // Edit title
  const fileName = args[0];
  const newTitle = args[1];
  
  if (!newTitle) {
    console.error('Error: Please provide a new title');
    console.log('Usage: node scripts/edit-title.js "filename.mp3" "New Title"');
    return;
  }
  
  const analysis = analyses.find(a => a.fileName === fileName);
  
  if (!analysis) {
    console.error(`Error: Song not found: ${fileName}`);
    console.log('\nDid you mean one of these?');
    const similar = analyses.filter(a => 
      a.fileName.toLowerCase().includes(fileName.toLowerCase().split('.')[0])
    ).slice(0, 5);
    similar.forEach(a => console.log(`  ${a.fileName}`));
    return;
  }
  
  console.log(`Updating: ${fileName}`);
  console.log(`  Old title: "${analysis.title || '(none)'}"`);
  console.log(`  New title: "${newTitle}"`);
  
  try {
    await updateTitle(analysis, newTitle);
    console.log('✓ Updated successfully!');
  } catch (err) {
    console.error('✗ Failed:', err.message);
  }
}

main().catch(console.error);
