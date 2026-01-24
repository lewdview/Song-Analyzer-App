#!/usr/bin/env node
/**
 * Database Deduplication Script
 * Removes duplicate analyses keeping the best version (with word-level timing)
 * 
 * Usage: npm run db:deduplicate
 */

const SUPABASE_URL = 'https://pznmptudgicrmljjafex.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6bm1wdHVkZ2ljcm1samphZmV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzMDE4ODUsImV4cCI6MjA3OTg3Nzg4NX0.syu1bbr9OJ5LxCnTrybLVgsjac4UOkFVdAHuvhKMY2g';

async function deduplicate() {
  console.log('🔍 Starting deduplication scan...\n');
  
  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/make-server-473d7342/analyses/deduplicate`,
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
    
    console.log('✅ Deduplication complete!\n');
    console.log('📊 Results:');
    console.log(`   Scanned: ${data.stats.scanned} analyses`);
    console.log(`   Duplicates removed: ${data.stats.duplicatesRemoved}`);
    console.log(`   Unique files remaining: ${data.stats.uniqueFiles}`);
    console.log(`   By hash: ${data.stats.byHash} unique hashes`);
    console.log(`   Without hash: ${data.stats.withoutHash} legacy entries\n`);
    
    if (data.stats.duplicatesRemoved > 0) {
      console.log(`🗑️  Removed IDs (first 10): ${data.stats.removedIds?.slice(0, 10).join(', ')}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

deduplicate();
