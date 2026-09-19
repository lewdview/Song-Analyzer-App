#!/usr/bin/env node
/**
 * Remove No-Hash Script
 * Removes legacy/incomplete analyses that don't have a file hash
 * 
 * Usage: npm run db:remove-no-hash
 */

const SUPABASE_URL = 'https://toemkhrfsbkfkutwcjkd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvZW1raHJmc2JrZmt1dHdjamtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2MTQxNTQsImV4cCI6MjEwMzE5MDE1NH0.nAtlMU_ukqXMkIhKppwv1mxDKpxuwHa6ddQBBwK3Iu8';

async function removeNoHash() {
  console.log('🔍 Scanning for analyses without file hash...\n');
  
  // Confirm before deletion
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('⚠️  This will PERMANENTLY DELETE legacy entries. Continue? (y/N): ', async (answer) => {
    rl.close();

    if (answer.toLowerCase() !== 'y') {
      console.log('❌ Cancelled');
      process.exit(0);
    }

    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/make-server-473d7342/analyses/remove-no-hash`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'apikey': SUPABASE_KEY,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      
      console.log('\n✅ Removal complete!\n');
      console.log('📊 Results:');
      console.log(`   Scanned: ${data.stats.scanned} analyses`);
      console.log(`   Removed: ${data.stats.removed} (no hash)`);
      console.log(`   Remaining: ${data.stats.remaining} valid analyses\n`);

      process.exit(0);
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });
}

removeNoHash();
