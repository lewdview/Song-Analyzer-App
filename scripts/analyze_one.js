// scripts/analyze-one.js
import fs from 'fs';
import path from 'path';

// CONFIG
const SERVER_URL = 'http://localhost:8000/make-server-473d7342/project365/enrich-song';
const SOURCE_FILE = './basic-transcription.json';

// Get search term from command line arguments
const searchTerm = process.argv.slice(2).join(' ').toLowerCase();

if (!searchTerm) {
  console.log('⚠️  Please provide a song title to search for.');
  console.log('   Usage: node scripts/analyze-one.js "Song Title"');
  process.exit(1);
}

async function run() {
  try {
    // 1. Load songs
    const rawData = fs.readFileSync(path.resolve(SOURCE_FILE));
    const data = JSON.parse(rawData);
    const songs = data.songs;

    // 2. Find the song
    const matches = songs.filter(s => 
      s.song.title.toLowerCase().includes(searchTerm) || 
      s.song.fileName.toLowerCase().includes(searchTerm)
    );

    if (matches.length === 0) {
      console.log(`❌ No songs found matching "${searchTerm}"`);
      return;
    }

    if (matches.length > 1) {
      console.log(`⚠️  Found ${matches.length} matches. Please be more specific:`);
      matches.forEach(m => console.log(`   - ${m.song.title} (${m.song.fileName})`));
      return;
    }

    // 3. Confirm and Execute
    const target = matches[0];
    console.log(`\n🎯 Found target: "${target.song.title}"`);
    console.log(`📝 Lyrics length: ${target.transcription.text.length} chars`);
    console.log(`🚀 Sending to Sonoteller (consumes 1 API call)...`);

    const response = await fetch(SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(target)
    });

    const result = await response.json();

    if (result.status === 'skipped') {
      console.log(`\n🛑 ABORTED: This song was already analyzed! (0 credits used)`);
    } else if (result.success) {
      console.log(`\n✅ SUCCESS!`);
      console.log(`   Sentiment: ${result.sentiment}`);
      console.log(`   Saved to database.`);
    } else {
      console.log(`\n❌ ERROR:`, result.error);
    }

  } catch (e) {
    console.error('Error:', e.message);
  }
}

run();